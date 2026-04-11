"use client";

import { useAppLocale } from "@/hooks/useAppLocale";
import { useUserProgress } from "@/hooks/useUserProgress";
import { analyzeMistake, summarizeFingerprint } from "@/lib/error-fingerprint-analysis";
import { getLocalizedText, getLocalizedValue } from "@/lib/localized";
import {
  SESSION_XP_PER_CORRECT,
  canQueueRetry,
  createLessonSession,
  getSessionItemTypeLabel,
  queueRetryItem,
} from "@/lib/session";
import { getNextNode, getNodeState, isNodeCompleted, isUnitCompleted } from "@/lib/units";
import type { RuntimeLesson } from "@/types/curriculum";
import { FINGERPRINT_UI_CONFIDENCE_THRESHOLD } from "@/types/error-fingerprint";
import type { SessionItem, SessionItemResult, WeakSessionItem } from "@/types/session";
import type { NodeDefinition, UnitDefinition } from "@/types/unit";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import PracticeSession, { type PracticeSessionFeedback } from "./PracticeSession";
import ProgressBar from "./ProgressBar";
import SessionBuildSentenceQuestion from "./SessionBuildSentenceQuestion";
import SessionChoiceQuestion from "./SessionChoiceQuestion";
import SessionSpeakingQuestion from "./SessionSpeakingQuestion";
import SessionTextInputQuestion from "./SessionTextInputQuestion";
import SessionVocabImageChoiceQuestion from "./SessionVocabImageChoiceQuestion";
import SessionWordMatchQuestion from "./SessionWordMatchQuestion";

type NodeShellProps = {
  unit: UnitDefinition;
  node: NodeDefinition;
  lesson: RuntimeLesson;
};

type FeedbackState = {
  item: SessionItem;
  result: SessionItemResult;
  awardedXp: number;
  queuedRetry: boolean;
};

function buildLessonSessionItems(
  lesson: RuntimeLesson,
  unitLevel: number,
  sentenceSeenCounts: Record<string, number>,
) {
  return createLessonSession(lesson, {
    unitLevel,
    sentenceSeenCounts,
  });
}

function useClientReady() {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}

function getWeakReasonLabel(locale: "en" | "vi", reason: WeakSessionItem["reason"]) {
  if (reason === "incorrect") {
    return getLocalizedText({ en: "Needs retry", vi: "Can lam lai" }, locale);
  }

  if (reason === "skipped") {
    return getLocalizedText({ en: "Skipped", vi: "Da bo qua" }, locale);
  }

  return getLocalizedText({ en: "Practice only", vi: "Chi luyen tap" }, locale);
}

function HydratedNodeShell({ unit, node, lesson }: NodeShellProps) {
  const { locale } = useAppLocale();
  const {
    progress,
    isLoading: progressLoading,
    error: progressError,
    completeSession,
    reportErrors,
  } = useUserProgress();
  const revealedAdaptiveItemIdsRef = useRef<Set<string>>(new Set());
  const exposureDeltaRef = useRef<Record<string, number>>({});
  const errorPatternDeltaRef = useRef<Record<string, number>>({});
  const questionStartedAtRef = useRef(0);
  const attemptCountRef = useRef<Record<string, number>>({});
  const attemptQueueRef = useRef<
    Array<{
      questionId: string;
      lessonId: string;
      wasCorrect: boolean;
      responseTimeMs: number;
    }>
  >([]);
  const errorQueueRef = useRef<
    Array<{
      questionId: string;
      lessonId: string;
      userAnswer?: string;
      answerOptionId?: string;
      answerTokens?: string[];
      responseTimeMs: number;
      priorAttempts: number;
    }>
  >([]);
  const flushTimerRef = useRef<number | null>(null);
  const attemptFlushTimerRef = useRef<number | null>(null);
  const [sessionKey, setSessionKey] = useState(0);
  const [sessionItems, setSessionItems] = useState<SessionItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedbackState, setFeedbackState] = useState<FeedbackState | null>(null);
  const [firstPassScore, setFirstPassScore] = useState(0);
  const [sessionXpEarned, setSessionXpEarned] = useState(0);
  const [weakItems, setWeakItems] = useState<WeakSessionItem[]>([]);
  const [queuedRetrySourceIds, setQueuedRetrySourceIds] = useState<string[]>([]);
  const [completedAtSessionStart, setCompletedAtSessionStart] = useState(false);
  const [unitCompletedAtSessionStart, setUnitCompletedAtSessionStart] = useState(false);
  const [nodeCompletedNow, setNodeCompletedNow] = useState(false);
  const [unitCompletedNow, setUnitCompletedNow] = useState(false);
  const [sessionFinished, setSessionFinished] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSavingCompletion, setIsSavingCompletion] = useState(false);

  const currentItem = sessionItems[currentIndex];
  const isLocked =
    !progressLoading &&
    getNodeState(progress, unit, node.id) === "locked" &&
    !isNodeCompleted(progress, node.id);
  const nextNode = getNextNode(unit, node.id);
  const ui = (en: string, vi: string) => getLocalizedText({ en, vi }, locale);

  const initializeSession = useEffectEvent(() => {
    revealedAdaptiveItemIdsRef.current = new Set();
    exposureDeltaRef.current = {};
    errorPatternDeltaRef.current = {};
    questionStartedAtRef.current = Date.now();
    attemptCountRef.current = {};
    attemptQueueRef.current = [];
    errorQueueRef.current = [];
    setSessionItems(buildLessonSessionItems(lesson, unit.unitNumber, progress.sentenceExposures));
    setCurrentIndex(0);
    setFeedbackState(null);
    setFirstPassScore(0);
    setSessionXpEarned(0);
    setWeakItems([]);
    setQueuedRetrySourceIds([]);
    setNodeCompletedNow(false);
    setUnitCompletedNow(false);
    setSessionFinished(false);
    setSaveError(null);
    setIsSavingCompletion(false);
    setCompletedAtSessionStart(isNodeCompleted(progress, node.id));
    setUnitCompletedAtSessionStart(isUnitCompleted(progress, unit.id));
  });

  const flushQueuedErrors = useCallback(async () => {
    const queuedEvents = errorQueueRef.current.splice(0);

    if (!queuedEvents.length) {
      return;
    }

    await reportErrors(queuedEvents);
  }, [reportErrors]);

  const flushQueuedAttempts = useCallback(async () => {
    const queuedEvents = attemptQueueRef.current.splice(0);

    if (!queuedEvents.length) {
      return;
    }

    const response = await fetch("/api/review/attempts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        events: queuedEvents,
      }),
    });

    if (!response.ok) {
      throw new Error("Unable to record lesson attempts.");
    }
  }, []);

  const scheduleQueuedErrorFlush = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
    }

    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      void flushQueuedErrors().catch(() => undefined);
    }, 1200);
  }, [flushQueuedErrors]);

  const scheduleQueuedAttemptFlush = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (attemptFlushTimerRef.current !== null) {
      window.clearTimeout(attemptFlushTimerRef.current);
    }

    attemptFlushTimerRef.current = window.setTimeout(() => {
      attemptFlushTimerRef.current = null;
      void flushQueuedAttempts().catch(() => undefined);
    }, 1200);
  }, [flushQueuedAttempts]);

  useEffect(() => {
    if (progressLoading) {
      return;
    }

    initializeSession();
  }, [progressLoading, sessionKey]);

  useEffect(() => {
    if (
      !currentItem ||
      currentItem.isRetry ||
      !currentItem.interactionMode ||
      !currentItem.sentenceKey
    ) {
      return;
    }

    if (revealedAdaptiveItemIdsRef.current.has(currentItem.id)) {
      return;
    }

    revealedAdaptiveItemIdsRef.current.add(currentItem.id);
    exposureDeltaRef.current[currentItem.sentenceKey] =
      (exposureDeltaRef.current[currentItem.sentenceKey] ?? 0) + 1;
  }, [currentItem]);

  useEffect(() => {
    if (!currentItem) {
      return;
    }

    questionStartedAtRef.current = Date.now();
  }, [currentItem]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }

      if (typeof window !== "undefined" && attemptFlushTimerRef.current !== null) {
        window.clearTimeout(attemptFlushTimerRef.current);
      }

      void flushQueuedErrors().catch(() => undefined);
      void flushQueuedAttempts().catch(() => undefined);
    };
  }, [flushQueuedAttempts, flushQueuedErrors]);

  function handleReplay() {
    setSessionKey((previous) => previous + 1);
  }

  function rememberWeakItem(item: SessionItem, reason: WeakSessionItem["reason"]) {
    setWeakItems((previous) =>
      previous.some((weakItem) => weakItem.sourceId === item.sourceId)
        ? previous
        : [
            ...previous,
            {
              sourceId: item.sourceId,
              type: item.type,
              label: item.weakItemLabel,
              reason,
              errorPatternKey: item.errorPatternKey,
              interactionMode: item.interactionMode,
            },
          ],
    );
  }

  function handleItemResolved(result: SessionItemResult) {
    if (!currentItem) {
      return;
    }

    const responseTimeMs =
      questionStartedAtRef.current > 0 ? Date.now() - questionStartedAtRef.current : 0;
    const priorAttempts = attemptCountRef.current[currentItem.sourceId] ?? 0;
    attemptCountRef.current[currentItem.sourceId] = priorAttempts + 1;
    const mistakeFingerprint =
      result.status === "incorrect"
        ? summarizeFingerprint(
            analyzeMistake({
              question: currentItem,
              userAnswer: result.userAnswer ?? "",
              correctAnswer: getLocalizedValue(currentItem.correctAnswer, locale),
              answerOptionId: result.answerOptionId,
              answerTokens: result.answerTokens,
              responseTimeMs,
              priorAttempts,
            }),
          )
        : undefined;

    if (result.status === "incorrect" && currentItem.tracksServerState) {
      errorQueueRef.current.push({
        questionId: currentItem.sourceId,
        lessonId: node.lessonId,
        userAnswer: result.userAnswer,
        answerOptionId: result.answerOptionId,
        answerTokens: result.answerTokens,
        responseTimeMs,
        priorAttempts,
      });
      scheduleQueuedErrorFlush();
    }

    if (
      currentItem.tracksServerState &&
      (result.status === "correct" || result.status === "incorrect")
    ) {
      attemptQueueRef.current.push({
        questionId: currentItem.sourceId,
        lessonId: node.lessonId,
        wasCorrect: result.status === "correct",
        responseTimeMs,
      });
      scheduleQueuedAttemptFlush();
    }

    const isFirstPass = !currentItem.isRetry;
    let awardedXp = 0;

    if (isFirstPass && result.status === "correct") {
      awardedXp = SESSION_XP_PER_CORRECT;
      setFirstPassScore((previous) => previous + 1);
      setSessionXpEarned((previous) => previous + awardedXp);
    } else if (isFirstPass) {
      rememberWeakItem(currentItem, result.status);

      if (result.status === "incorrect" || result.status === "skipped") {
        errorPatternDeltaRef.current[currentItem.errorPatternKey] =
          (errorPatternDeltaRef.current[currentItem.errorPatternKey] ?? 0) + 1;
      }
    }

    const alreadyQueuedSources = new Set(queuedRetrySourceIds);
    const queuedRetry =
      result.shouldRetryLater &&
      canQueueRetry(
        currentItem,
        alreadyQueuedSources,
        sessionItems.length,
        node.sessionLength,
        5,
      );

    if (queuedRetry) {
      setQueuedRetrySourceIds((previous) => [...previous, currentItem.sourceId]);
      setSessionItems((previous) =>
        queueRetryItem(previous, currentItem, alreadyQueuedSources, node.sessionLength, 5),
      );
    }

    setFeedbackState({
      item: currentItem,
      result: {
        ...result,
        awardedXp,
        mistakeFingerprint,
      },
      awardedXp,
      queuedRetry,
    });
  }

  async function handleAdvance() {
    if (!feedbackState) {
      return;
    }

    if (currentIndex !== sessionItems.length - 1) {
      setFeedbackState(null);
      setCurrentIndex((previous) => previous + 1);
      return;
    }

    setIsSavingCompletion(true);
    setSaveError(null);

    try {
      await flushQueuedErrors().catch(() => undefined);
      await flushQueuedAttempts().catch(() => undefined);
      const result = await completeSession({
        lessonId: node.lessonId,
        nodeId: node.id,
        unitId: unit.id,
        score: firstPassScore,
        totalQuestions: node.sessionLength,
        awardedXp: sessionXpEarned,
        completeUnit: node.order === unit.nodes.length,
        errorPatternMisses: errorPatternDeltaRef.current,
        sentenceExposureDeltas: exposureDeltaRef.current,
      });

      setFeedbackState(null);
      setNodeCompletedNow(result.nodeCompletedNow);
      setUnitCompletedNow(result.unitCompletedNow);
      setSessionFinished(true);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Unable to save lesson progress.",
      );
    } finally {
      setIsSavingCompletion(false);
    }
  }

  function renderCurrentQuestion() {
    if (!currentItem) {
      return null;
    }

    if (currentItem.type === "word_match" && "pairs" in currentItem) {
      return (
        <SessionWordMatchQuestion
          key={`${sessionKey}-${currentItem.id}`}
          item={currentItem}
          onResolve={handleItemResolved}
        />
      );
    }

    if (
      (currentItem.type === "word_match" || currentItem.type === "listen_select") &&
      "presentation" in currentItem &&
      currentItem.presentation === "image_cards"
    ) {
      return (
        <SessionVocabImageChoiceQuestion
          key={`${sessionKey}-${currentItem.id}`}
          item={currentItem}
          onResolve={handleItemResolved}
        />
      );
    }

    if (
      currentItem.type === "word_match" ||
      currentItem.type === "listen_select" ||
      currentItem.type === "grammar_select" ||
      currentItem.type === "translation_select" ||
      currentItem.type === "dialogue_response"
    ) {
      return (
        <SessionChoiceQuestion
          key={`${sessionKey}-${currentItem.id}`}
          item={currentItem}
          onResolve={handleItemResolved}
        />
      );
    }

    if (currentItem.type === "translate" || currentItem.type === "fill_blank") {
      return (
        <SessionTextInputQuestion
          key={`${sessionKey}-${currentItem.id}`}
          item={currentItem}
          onResolve={handleItemResolved}
        />
      );
    }

    if (
      currentItem.type === "arrange_sentence" ||
      currentItem.type === "dialogue_reconstruct" ||
      currentItem.type === "sentence_build" ||
      currentItem.type === "reorder_sentence"
    ) {
      return (
        <SessionBuildSentenceQuestion
          key={`${sessionKey}-${currentItem.id}`}
          item={currentItem}
          onResolve={handleItemResolved}
        />
      );
    }

    if (currentItem.type === "speaking" || currentItem.type === "listen_repeat") {
      return (
        <SessionSpeakingQuestion
          key={`${sessionKey}-${currentItem.id}`}
          item={currentItem}
          onResolve={handleItemResolved}
        />
      );
    }

    return null;
  }

  function buildFeedback(): PracticeSessionFeedback | null {
    if (!feedbackState) {
      return null;
    }

    const { item, result, awardedXp, queuedRetry } = feedbackState;
    const nextLabel =
      currentIndex === sessionItems.length - 1
        ? isSavingCompletion
          ? ui("Saving lesson...", "Dang luu bai hoc...")
          : ui("Save lesson summary", "Luu tong ket bai hoc")
        : ui("Next", "Tiep theo");
    const explanation = result.explanation ? getLocalizedText(result.explanation, locale) : "";
    const correctAnswer = result.correctAnswer
      ? getLocalizedValue(result.correctAnswer, locale)
      : "";
    const fingerprintLabel =
      result.mistakeFingerprint &&
      result.mistakeFingerprint.confidenceScore >= FINGERPRINT_UI_CONFIDENCE_THRESHOLD
        ? getLocalizedText(result.mistakeFingerprint.uiLabel, locale)
        : "";

    return {
      id: `${item.id}-${currentIndex}-${result.status}`,
      status: result.status,
      title:
        result.status === "correct"
          ? ui("Nice!", "Tot!")
          : result.status === "incorrect"
            ? ui("Not quite.", "Chua dung.")
            : result.status === "skipped"
              ? ui("Skipped for now.", "Tam thoi bo qua.")
              : ui("Practice saved.", "Da luu luot luyen tap."),
      eyebrow: item.isRetry
        ? ui("Retry checked", "Da kiem tra lan lam lai")
        : ui("Question checked", "Da kiem tra cau hoi"),
      badges: (
        <>
          <span className="pill bg-card-strong text-foreground">
            {item.isRetry ? ui("Retry item", "Muc lam lai") : ui("First pass", "Luot dau")}
          </span>
          {result.status === "correct" && awardedXp > 0 ? (
            <span className="pill bg-success-soft text-accent-strong">+{awardedXp} XP</span>
          ) : null}
        </>
      ),
      summary:
        result.status === "correct" ? (
          <p>
            {awardedXp > 0
              ? ui(
                  `+${awardedXp} XP earned on this first-pass answer.`,
                  `+${awardedXp} XP cho cau tra loi dung o luot dau.`,
                )
              : ui(
                  "Correct on the retry. No bonus XP is added on replay items.",
                  "Dung o lan lam lai. Khong cong them XP cho muc quay lai.",
                )}
          </p>
        ) : result.status === "incorrect" ? (
          <div className="space-y-2">
            <p>
              {ui("Correct answer", "Dap an dung")}: {correctAnswer}
            </p>
            <p className="font-semibold">
              {queuedRetry
                ? ui(
                    "This question will return once later in the lesson run.",
                    "Cau hoi nay se quay lai mot lan nua ve sau trong luot hoc.",
                  )
                : ui(
                    "This question will stay in your weak-items summary.",
                    "Cau hoi nay se duoc giu trong tong ket muc yeu.",
                  )}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p>{correctAnswer}</p>
            <p className="font-semibold">
              {ui(
                "No XP for this mic-free pass. It stays in weak items for review.",
                "Khong co XP cho lan bo qua mic nay. Muc nay van o lai trong danh sach can xem lai.",
              )}
            </p>
          </div>
        ),
      hint:
        result.status === "incorrect"
          ? ui(
              "Correct it once now so the retry later feels automatic.",
              "Sua lai ngay bay gio de lan gap lai sau nay tro nen tu dong hon.",
            )
          : undefined,
      detail: result.detail || undefined,
      fingerprintLabel,
      fingerprintReason: result.mistakeFingerprint?.shortReason,
      explanation: explanation || undefined,
      errorMessage: saveError,
      onContinue: () => void handleAdvance(),
      actionLabel: nextLabel,
      actionLoadingLabel: ui("Saving lesson...", "Dang luu bai hoc..."),
      isContinuing: isSavingCompletion,
      showCelebration: result.status === "correct",
      widthClassName: "max-w-3xl",
    };
  }

  function renderSummary() {
    const unitIsComplete = unitCompletedNow || isUnitCompleted(progress, unit.id);
    const nodeRun = progress.nodeRuns[node.id];
    const nodeTitle = getLocalizedText(node.title, locale);

    return (
      <section className="panel">
        <div className="lesson-card space-y-6 text-center">
          <div className="celebration-emoji">A+</div>
          <div className="space-y-2">
            <span className="pill mx-auto bg-success-soft text-accent-strong">
              {node.type === "review"
                ? ui("Review lesson complete", "Da xong bai on tap")
                : ui("Lesson complete", "Da xong bai hoc")}
            </span>
            <h3 className="font-display text-4xl text-foreground sm:text-5xl">
              {nodeTitle} {ui("cleared.", "da hoan thanh.")}
            </h3>
            <p className="text-lg font-bold text-muted-foreground">
              {ui(
                "First-pass score is based on the authored lesson flow only.",
                "Diem luot dau chi tinh theo luong bai hoc duoc bien soan san.",
              )}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.8rem] bg-card-strong p-5">
              <p className="text-sm font-bold text-muted-foreground">
                {ui("Score", "Diem")}
              </p>
              <p className="mt-2 font-display text-4xl text-foreground">
                {firstPassScore}/{node.sessionLength}
              </p>
            </div>
            <div className="rounded-[1.8rem] bg-white p-5">
              <p className="text-sm font-bold text-muted-foreground">
                {ui("Run XP", "XP luot hoc")}
              </p>
              <p className="mt-2 font-display text-4xl text-accent-strong">
                +{sessionXpEarned}
              </p>
            </div>
            <div className="rounded-[1.8rem] bg-white p-5">
              <p className="text-sm font-bold text-muted-foreground">
                {ui("Retry Items", "Muc lam lai")}
              </p>
              <p className="mt-2 font-display text-4xl text-foreground">
                {sessionItems.length - node.sessionLength}
              </p>
            </div>
          </div>

          <div className="rounded-[1.8rem] bg-card-soft p-5 text-left">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {ui("Weak items", "Muc yeu")}
            </p>
            {weakItems.length > 0 ? (
              <div className="mt-4 space-y-3">
                {weakItems.map((weakItem) => (
                  <div
                    key={weakItem.sourceId}
                    className="flex flex-col gap-2 rounded-[1.4rem] bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-base font-extrabold text-foreground">
                        {getLocalizedValue(weakItem.label, locale)}
                      </p>
                      <p className="text-sm font-bold text-muted-foreground">
                        {getSessionItemTypeLabel(
                          weakItem.type,
                          locale,
                          weakItem.interactionMode,
                        )}
                      </p>
                      <p className="text-xs font-bold text-muted-foreground/80">
                        Pattern: {weakItem.errorPatternKey}
                      </p>
                    </div>
                    <span className="pill bg-danger-soft text-danger">
                      {getWeakReasonLabel(locale, weakItem.reason)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-base font-bold text-muted-foreground">
                {ui(
                  "No weak items this run. Clean lesson clear.",
                  "Khong co muc yeu nao trong luot nay. Bai hoc rat sach.",
                )}
              </p>
            )}
          </div>

          <div
            className={`rounded-[1.8rem] px-5 py-4 text-base font-bold ${
              nodeRun?.weak
                ? "bg-danger-soft text-danger"
                : "bg-success-soft text-accent-strong"
            }`}
          >
            {nodeRun?.weak
              ? ui(
                  "This lesson is marked weak because the first-pass score landed under 60%.",
                  "Bai hoc nay bi danh dau la yeu vi diem luot dau duoi 60%.",
                )
              : ui(
                  "This lesson is in a healthy state for now.",
                  "Bai hoc nay dang o trang thai on dinh.",
                )}
          </div>

          {nodeCompletedNow && nextNode ? (
            <div className="rounded-[1.8rem] bg-card-strong px-5 py-4 text-base font-bold text-foreground">
              {nextNode.type === "review"
                ? ui(
                    "The final review lesson is now unlocked.",
                    "Bai on tap cuoi cung da duoc mo khoa.",
                  )
                : `${getLocalizedText(nextNode.title, locale)} ${ui("is now unlocked.", "da duoc mo khoa.")}`}
            </div>
          ) : null}

          {(unitCompletedNow || unitIsComplete) && node.type === "review" ? (
            <div className="rounded-[1.8rem] bg-success-soft px-5 py-4 text-base font-bold text-accent-strong">
              {ui("The full unit is now complete.", "Toan bo unit da hoan thanh.")}
            </div>
          ) : null}

          <div
            className={`rounded-[1.8rem] px-5 py-4 text-base font-bold ${
              nodeCompletedNow
                ? "bg-success-soft text-accent-strong"
                : "bg-card-strong text-muted-foreground"
            }`}
          >
            {nodeCompletedNow
              ? ui("Lesson completion saved to your account.", "Tien do bai hoc da duoc luu vao tai khoan.")
              : completedAtSessionStart
                ? ui(
                    "This lesson was already completed before this run.",
                    "Bai hoc nay da duoc hoan thanh truoc luot hoc nay.",
                  )
                : unitCompletedAtSessionStart
                  ? ui(
                      "The unit was already complete before this replay.",
                      "Unit da hoan thanh truoc khi ban hoc lai.",
                    )
                  : ui(
                      "Progress is synced to your account.",
                      "Tien do dang duoc dong bo vao tai khoan cua ban.",
                    )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={handleReplay} className="primary-button w-full">
              {ui("Replay lesson", "Hoc lai bai")}
            </button>
            <Link href={`/unit/${unit.id}`} className="secondary-button w-full">
              {ui("Back to unit", "Ve unit")}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const practiceQuestion = !sessionFinished && currentItem ? renderCurrentQuestion() : null;
  const practiceFeedback = !sessionFinished ? buildFeedback() : null;
  const practiceProgress =
    !sessionFinished && currentItem ? (
      <ProgressBar
        currentIndex={currentIndex}
        totalCount={sessionItems.length}
        currentLabel={getSessionItemTypeLabel(
          currentItem.type,
          locale,
          currentItem.interactionMode,
        )}
        isRetry={currentItem.isRetry}
      />
    ) : null;

  if (progressLoading || !sessionItems.length) {
    return (
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <section className="panel">
          <div className="lesson-card space-y-4 text-center">
            <span className="pill mx-auto bg-card-strong text-foreground">
              {ui("Syncing account", "Dang dong bo tai khoan")}
            </span>
            <h3 className="font-display text-3xl text-foreground">
              {ui("Preparing your lesson run.", "Dang chuan bi luot hoc cua ban.")}
            </h3>
            <p className="text-base font-bold text-muted-foreground">
              {ui(
                "Fetching progress, review memory, and adaptive sentence exposure data.",
                "Dang lay tien do, du lieu on tap, va du lieu tan suat gap cau.",
              )}
            </p>
            {progressError ? <div className="feedback-incorrect">{progressError}</div> : null}
          </div>
        </section>
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <header className="panel">
          <div className="space-y-2">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">
              {ui("Unit", "Unit")} {unit.unitNumber}
            </p>
            <h1 className="font-display text-4xl text-foreground sm:text-5xl">
              {getLocalizedText(node.title, locale)}
            </h1>
            <p className="text-sm font-bold text-muted-foreground">
              {ui(
                "Finish the current unlocked lesson on the unit map before entering this one.",
                "Hoan thanh bai dang mo tren ban do unit truoc khi vao bai nay.",
              )}
            </p>
          </div>
        </header>

        <section className="panel">
          <div className="lesson-card space-y-5 text-center">
            <span className="pill mx-auto bg-card-strong text-foreground">
              {ui("Locked lesson", "Bai hoc dang khoa")}
            </span>
            <h3 className="font-display text-3xl text-foreground">
              {ui("This lesson is not unlocked yet.", "Bai hoc nay chua duoc mo khoa.")}
            </h3>
            <p className="text-base font-bold text-muted-foreground">
              {ui(
                "Go back to the unit map and clear the current lesson first.",
                "Quay lai ban do unit va hoan thanh bai hien tai truoc.",
              )}
            </p>
            <Link href={`/unit/${unit.id}`} className="primary-button w-full">
              {ui("Back to unit", "Ve unit")}
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <header className="panel">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">
              {ui("Unit", "Unit")} {unit.unitNumber} - {ui("Lesson", "Bai")} {node.order}
            </p>
            <h1 className="font-display text-4xl text-foreground sm:text-5xl">
              {getLocalizedText(node.title, locale)}
            </h1>
            <p className="text-sm font-bold text-muted-foreground">
              {feedbackState
                ? ui(
                    "Feedback locked in. Take the next step when you are ready.",
                    "Phan hoi da duoc chot. Di tiep khi ban san sang.",
                  )
                : ui(
                    `${node.sessionLength} authored tasks, up to +${node.sessionLength * SESSION_XP_PER_CORRECT} XP, and up to 5 retry items.`,
                    `${node.sessionLength} tac vu duoc bien soan, toi da +${node.sessionLength * SESSION_XP_PER_CORRECT} XP, va toi da 5 muc lam lai.`,
                  )}
            </p>
          </div>

          <div className="flex flex-wrap gap-3 sm:justify-end">
            <span className="pill bg-accent-warm/70 text-foreground">
              {ui("Run XP", "XP luot hoc")} +{sessionXpEarned}
            </span>
            <Link href={`/unit/${unit.id}`} className="secondary-button">
              {ui("Exit lesson", "Thoat bai hoc")}
            </Link>
          </div>
        </div>

        {progressError ? <div className="mt-5 feedback-incorrect">{progressError}</div> : null}

        <div className="mt-5 flex flex-wrap gap-2">
          {node.focusConcepts.map((concept) => (
            <span key={concept} className="pill bg-card-strong text-foreground">
              {concept}
            </span>
          ))}
        </div>
      </header>

      {sessionFinished
        ? renderSummary()
        : currentItem
          ? (
              <PracticeSession
                questionKey={`${sessionKey}-${currentItem.id}-${currentIndex}`}
                progress={practiceProgress}
                question={practiceQuestion}
                feedback={practiceFeedback}
              />
            )
          : null}
    </div>
  );
}

export default function NodeShell(props: NodeShellProps) {
  const clientReady = useClientReady();

  if (!clientReady) {
    return null;
  }

  return <HydratedNodeShell {...props} />;
}
