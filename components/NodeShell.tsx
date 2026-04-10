"use client";

import { useAppLocale } from "@/hooks/useAppLocale";
import { useUserProgress } from "@/hooks/useUserProgress";
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
import type { SessionItem, SessionItemResult, WeakSessionItem } from "@/types/session";
import type { NodeDefinition, UnitDefinition } from "@/types/unit";
import Link from "next/link";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import ProgressBar from "./ProgressBar";
import SessionBuildSentenceQuestion from "./SessionBuildSentenceQuestion";
import SessionChoiceQuestion from "./SessionChoiceQuestion";
import SessionSpeakingQuestion from "./SessionSpeakingQuestion";
import SessionTextInputQuestion from "./SessionTextInputQuestion";

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

function buildAdaptiveSessionItems(
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

function getFeedbackTone(status: SessionItemResult["status"]) {
  if (status === "correct") {
    return "feedback-correct";
  }

  if (status === "incorrect") {
    return "feedback-incorrect";
  }

  return "rounded-[1.7rem] border border-accent/15 bg-card-soft px-4 py-3 text-sm font-bold text-foreground";
}

function HydratedNodeShell({ unit, node, lesson }: NodeShellProps) {
  const { locale } = useAppLocale();
  const {
    progress,
    isLoading: progressLoading,
    error: progressError,
    completeSession,
  } = useUserProgress();
  const revealedAdaptiveItemIdsRef = useRef<Set<string>>(new Set());
  const exposureDeltaRef = useRef<Record<string, number>>({});
  const errorPatternDeltaRef = useRef<Record<string, number>>({});
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
    setSessionItems(buildAdaptiveSessionItems(lesson, unit.unitNumber, progress.sentenceExposures));
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

    if (
      currentItem.type === "word_match" ||
      currentItem.type === "listen_select" ||
      currentItem.type === "grammar_select"
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
      currentItem.type === "dialogue_reconstruct"
    ) {
      return (
        <SessionBuildSentenceQuestion
          key={`${sessionKey}-${currentItem.id}`}
          item={currentItem}
          onResolve={handleItemResolved}
        />
      );
    }

    if (currentItem.type === "speaking") {
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

  function renderFeedback() {
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

    return (
      <section className="panel">
        <div className="lesson-card space-y-6 text-center">
          <div className="space-y-3">
            <span className="pill mx-auto bg-card-strong text-foreground">
              {item.isRetry
                ? ui("Retry checked", "Da kiem tra lan lam lai")
                : ui("Question checked", "Da kiem tra cau hoi")}
            </span>
            <h3 className="font-display text-4xl text-foreground sm:text-5xl">
              {result.status === "correct"
                ? ui("Nice!", "Tot!")
                : result.status === "incorrect"
                  ? ui("Not quite.", "Chua dung.")
                  : result.status === "skipped"
                    ? ui("Skipped for now.", "Tam thoi bo qua.")
                    : ui("Practice saved.", "Da luu luot luyen tap.")}
            </h3>
          </div>

          <div className={getFeedbackTone(result.status)}>
            {result.status === "correct" ? (
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
            )}
          </div>

          {result.detail ? (
            <div className="rounded-[1.7rem] bg-card-soft px-4 py-3 text-sm font-bold text-muted-foreground">
              {result.detail}
            </div>
          ) : null}

          {explanation ? (
            <div className="rounded-[1.7rem] bg-card-soft px-4 py-4 text-left text-sm font-bold text-muted-foreground">
              <p>{explanation}</p>
            </div>
          ) : null}

          {saveError ? <div className="feedback-incorrect">{saveError}</div> : null}

          <button
            type="button"
            onClick={() => void handleAdvance()}
            disabled={isSavingCompletion}
            className="primary-button w-full"
          >
            {nextLabel}
          </button>
        </div>
      </section>
    );
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

      {!sessionFinished && currentItem ? (
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
      ) : null}

      {sessionFinished
        ? renderSummary()
        : feedbackState
          ? renderFeedback()
          : renderCurrentQuestion()}
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
