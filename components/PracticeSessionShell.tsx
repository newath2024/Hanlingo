"use client";

import { useAppLocale } from "@/hooks/useAppLocale";
import { getLocalizedText, getLocalizedValue } from "@/lib/localized";
import { getSessionItemTypeLabel } from "@/lib/session";
import type {
  AdaptiveSessionItem,
  AdaptiveSessionMode,
  AdaptiveSessionResponse,
} from "@/types/adaptive-learning";
import {
  FINGERPRINT_UI_CONFIDENCE_THRESHOLD,
  type FingerprintSummary,
} from "@/types/error-fingerprint";
import type { SessionItemResult } from "@/types/session";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import PracticeSession, { type PracticeSessionFeedback } from "./PracticeSession";
import ProgressBar from "./ProgressBar";
import SessionBuildSentenceQuestion from "./SessionBuildSentenceQuestion";
import SessionChoiceQuestion from "./SessionChoiceQuestion";
import SessionSpeakingQuestion from "./SessionSpeakingQuestion";
import SessionTextInputQuestion from "./SessionTextInputQuestion";
import SessionVocabImageChoiceQuestion from "./SessionVocabImageChoiceQuestion";
import SessionWordMatchQuestion from "./SessionWordMatchQuestion";

type PracticeSessionShellProps = {
  mode: "mixed" | "errors";
};

type PracticeAnswerResponse = {
  errorCount: number;
  nextReviewAt: string | null;
  correctAnswer: string;
  repeated: boolean;
  fingerprint: FingerprintSummary | null;
};

type FeedbackState = {
  item: AdaptiveSessionItem;
  result: SessionItemResult;
  answer: PracticeAnswerResponse | null;
};

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    throw new Error(json.error ?? "Request failed.");
  }

  return json;
}

function getSourceLabel(
  locale: "en" | "vi",
  source: AdaptiveSessionItem["selectionSource"],
  errorCount: number,
) {
  if (source === "due_review") {
    return errorCount > 1
      ? getLocalizedText({ en: "Repeated mistake", vi: "Lỗi lặp lại" }, locale)
      : getLocalizedText({ en: "Due review", vi: "Ôn đến hạn" }, locale);
  }

  if (source === "weak_reinforcement") {
    return getLocalizedText({ en: "Weak point", vi: "Điểm yếu" }, locale);
  }

  if (source === "confidence_builder") {
    return getLocalizedText({ en: "Confidence builder", vi: "Câu để lấy lại nhịp" }, locale);
  }

  return getLocalizedText({ en: "Progression", vi: "Tiến độ hiện tại" }, locale);
}

function getModeCopy(
  mode: AdaptiveSessionMode,
  locale: "en" | "vi",
  targetUnitId?: string,
  targetLessonId?: string,
) {
  if (mode === "weak_points") {
    return {
      eyebrow: getLocalizedText({ en: "Practice Mistakes", vi: "Luyện lỗi sai" }, locale),
      title: getLocalizedText(
        {
          en: "Return to the weakest concepts before they harden into habits.",
          vi: "Quay lại các điểm yếu trước khi chúng trở thành thói quen sai.",
        },
        locale,
      ),
      summary: getLocalizedText(
        {
          en: "This run stays mostly on due mistakes, then adds a small layer of easier recovery questions.",
          vi: "Buổi này tập trung vào lỗi đến hạn, sau đó chèn thêm một ít câu để lấy lại nhịp.",
        },
        locale,
      ),
      emptyTitle: getLocalizedText(
        { en: "No due mistakes right now.", vi: "Hiện tại chưa có lỗi đến hạn." },
        locale,
      ),
      emptySummary: getLocalizedText(
        {
          en: "Clear a few more lessons or come back later when the error queue is due again.",
          vi: "Học thêm vài bài nữa hoặc quay lại sau khi hàng đợi lỗi sai đến hạn.",
        },
        locale,
      ),
    };
  }

  if (mode === "focused_review") {
    return {
      eyebrow: getLocalizedText({ en: "Focused Review", vi: "Ôn tập có trọng tâm" }, locale),
      title: getLocalizedText(
        {
          en: targetLessonId
            ? "Review the weak spots around this lesson."
            : targetUnitId
              ? `Review the weak spots around Unit ${targetUnitId}.`
              : "Review the weak spots around your current path.",
          vi: targetLessonId
            ? "Ôn lại các điểm yếu quanh bài học này."
            : targetUnitId
              ? `Ôn lại các điểm yếu quanh Unit ${targetUnitId}.`
              : "Ôn lại các điểm yếu quanh lộ trình hiện tại.",
        },
        locale,
      ),
      summary: getLocalizedText(
        {
          en: targetLessonId
            ? "This run mixes nearby lesson content, due mistakes, and related weak concepts from the selected lesson."
            : "This run mixes nearby progression, due mistakes, and related weak concepts from the selected unit.",
          vi: targetLessonId
            ? "Buổi này trộn giữa nội dung bài học gần nhất, lỗi đến hạn, và các khái niệm yếu liên quan trong bài đã chọn."
            : "Buổi này trộn giữa tiến độ gần nhất, lỗi đến hạn, và các khái niệm yếu liên quan trong unit đã chọn.",
        },
        locale,
      ),
      emptyTitle: getLocalizedText(
        { en: "No focused review is available yet.", vi: "Chưa có buổi ôn tập trọng tâm." },
        locale,
      ),
      emptySummary: getLocalizedText(
        {
          en: targetLessonId
            ? "Finish a few more lessons or answer a few more questions in this lesson first."
            : "Unlock or finish a few more lessons in this unit first.",
          vi: targetLessonId
            ? "Hãy học thêm vài bài hoặc trả lời thêm một ít câu trong bài này trước."
            : "Hãy mở khóa hoặc hoàn thành thêm vài bài trong unit này trước.",
        },
        locale,
      ),
    };
  }

  return {
    eyebrow: getLocalizedText({ en: "Adaptive Continue", vi: "Tiếp tục theo dạng thích ứng" }, locale),
    title: getLocalizedText(
      {
        en: "Keep momentum with a balanced run tuned to your current path and weak zones.",
        vi: "Giữ nhịp học với một buổi cân bằng được chỉnh theo lộ trình và điểm yếu hiện tại.",
      },
      locale,
    ),
    summary: getLocalizedText(
      {
        en: "You still move forward, but due mistakes and weak concepts get pulled in at higher weight.",
        vi: "Bạn vẫn đi tiếp, nhưng lỗi đến hạn và khái niệm yếu sẽ được ưu tiên cao hơn.",
      },
      locale,
    ),
    emptyTitle: getLocalizedText(
      { en: "No mixed practice is available yet.", vi: "Chưa có lượt luyện tập tổng hợp." },
      locale,
    ),
    emptySummary: getLocalizedText(
      {
        en: "Unlock a few lessons first, then come back here for a blended review run.",
        vi: "Mở khóa thêm vài bài học trước, rồi quay lại đây để làm lượt tổng hợp.",
      },
      locale,
    ),
  };
}

function getSessionLabelFallback(mode: AdaptiveSessionMode) {
  if (mode === "weak_points") {
    return { en: "Weak points practice", vi: "Luyện tập điểm yếu" };
  }

  if (mode === "focused_review") {
    return { en: "Focused review", vi: "Ôn tập có trọng tâm" };
  }

  return { en: "Balanced progress session", vi: "Buổi học cân bằng tiến độ" };
}

export default function PracticeSessionShell({ mode }: PracticeSessionShellProps) {
  const { locale } = useAppLocale();
  const searchParams = useSearchParams();
  const questionStartedAtRef = useRef(0);
  const attemptCountRef = useRef<Record<string, number>>({});
  const targetUnitId = searchParams.get("unitId")?.trim() || undefined;
  const targetLessonId = searchParams.get("lessonId")?.trim() || undefined;
  const adaptiveMode: AdaptiveSessionMode =
    mode === "errors"
      ? "weak_points"
      : targetLessonId || targetUnitId
        ? "focused_review"
        : "balanced_progress";
  const shouldRequestDebug = process.env.NODE_ENV !== "production";
  const [sessionKey, setSessionKey] = useState(0);
  const [items, setItems] = useState<AdaptiveSessionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [feedbackState, setFeedbackState] = useState<FeedbackState | null>(null);
  const [sessionFinished, setSessionFinished] = useState(false);
  const [isSavingAnswer, setIsSavingAnswer] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionLabel, setSessionLabel] = useState<{ en: string; vi: string } | null>(null);
  const [sessionDebug, setSessionDebug] = useState<AdaptiveSessionResponse["debug"]>(undefined);
  const [isCompletingSession, setIsCompletingSession] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const copy = getModeCopy(adaptiveMode, locale, targetUnitId, targetLessonId);
  const ui = (en: string, vi: string) => getLocalizedText({ en, vi }, locale);
  const currentItem = items[currentIndex] ?? null;
  const backHref = "/practice";

  const loadPracticeSession = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    setFeedbackState(null);
    setCurrentIndex(0);
    setCorrectCount(0);
    setSessionFinished(false);
    setSaveError(null);
    setCompletionError(null);
    setSessionId(null);
    setSessionLabel(null);
    setSessionDebug(undefined);
    setIsCompletingSession(false);
    questionStartedAtRef.current = 0;
    attemptCountRef.current = {};

    try {
      const params = new URLSearchParams({
        mode: adaptiveMode,
        sessionSize: "10",
      });

      if (targetUnitId && adaptiveMode === "focused_review") {
        params.set("targetUnitId", targetUnitId);
      }

      if (targetLessonId && adaptiveMode === "focused_review") {
        params.set("targetLessonId", targetLessonId);
      }

      if (shouldRequestDebug) {
        params.set("debug", "1");
      }

      const response = await fetch(`/api/lesson/adaptive?${params.toString()}`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      const json = await readJson<AdaptiveSessionResponse>(response);
      setSessionId(json.sessionId);
      setSessionLabel(json.sessionLabel);
      setSessionDebug(json.debug);
      setItems(json.items);
    } catch (error) {
      setItems([]);
      setLoadError(
        error instanceof Error ? error.message : "Unable to load practice session.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [adaptiveMode, shouldRequestDebug, targetLessonId, targetUnitId]);

  useEffect(() => {
    void loadPracticeSession();
  }, [loadPracticeSession, sessionKey]);

  useEffect(() => {
    if (!currentItem) {
      return;
    }

    questionStartedAtRef.current = Date.now();
  }, [currentItem]);

  function handleReplay() {
    setSessionKey((previous) => previous + 1);
  }

  async function handleItemResolved(result: SessionItemResult) {
    if (!currentItem || isSavingAnswer) {
      return;
    }

    const responseTimeMs =
      questionStartedAtRef.current > 0 ? Date.now() - questionStartedAtRef.current : 0;
    const priorAttempts = attemptCountRef.current[currentItem.questionId] ?? 0;
    attemptCountRef.current[currentItem.questionId] = priorAttempts + 1;

    setIsSavingAnswer(true);
    setSaveError(null);

    let answer: PracticeAnswerResponse | null = null;

    try {
      const response = await fetch("/api/practice/answer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          questionId: currentItem.questionId,
          lessonId: currentItem.lessonId,
          sourceContext: adaptiveMode === "weak_points" ? "practice_errors" : "practice_mixed",
          userAnswer: result.userAnswer,
          answerOptionId: result.answerOptionId,
          answerTokens: result.answerTokens,
          responseTimeMs,
          priorAttempts,
          wasCorrect: result.status === "correct",
        }),
      });
      answer = await readJson<PracticeAnswerResponse>(response);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Unable to save practice answer.",
      );
    } finally {
      setIsSavingAnswer(false);
    }

    if (result.status === "correct") {
      setCorrectCount((previous) => previous + 1);
    }

    setFeedbackState({
      item: currentItem,
      result,
      answer,
    });
  }

  async function finalizeAdaptiveSession() {
    if (!sessionId) {
      setSessionFinished(true);
      return;
    }

    setIsCompletingSession(true);
    setCompletionError(null);

    try {
      const response = await fetch("/api/session/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          sessionId,
          mode: adaptiveMode,
          targetUnitId,
          targetLessonId,
          sessionSize: items.length,
          selectedQuestionIds: items.map((item) => item.questionId),
          correctCount,
          totalCount: items.length,
        }),
      });
      await readJson(response);
    } catch (error) {
      setCompletionError(
        error instanceof Error ? error.message : "Unable to finalize adaptive session.",
      );
    } finally {
      setIsCompletingSession(false);
      setSessionFinished(true);
    }
  }

  function handleAdvance() {
    if (!feedbackState) {
      return;
    }

    if (currentIndex >= items.length - 1) {
      setFeedbackState(null);
      void finalizeAdaptiveSession();
      return;
    }

    setFeedbackState(null);
    setSaveError(null);
    setCurrentIndex((previous) => previous + 1);
  }

  function renderQuestion() {
    if (!currentItem) {
      return null;
    }

    if (currentItem.type === "word_match" && "pairs" in currentItem) {
      return <SessionWordMatchQuestion item={currentItem} onResolve={handleItemResolved} />;
    }

    if (
      (currentItem.type === "word_match" || currentItem.type === "listen_select") &&
      "presentation" in currentItem &&
      currentItem.presentation === "image_cards"
    ) {
      return <SessionVocabImageChoiceQuestion item={currentItem} onResolve={handleItemResolved} />;
    }

    if (
      currentItem.type === "word_match" ||
      currentItem.type === "listen_select" ||
      currentItem.type === "grammar_select" ||
      currentItem.type === "translation_select" ||
      currentItem.type === "dialogue_response"
    ) {
      return <SessionChoiceQuestion item={currentItem} onResolve={handleItemResolved} />;
    }

    if (currentItem.type === "translate" || currentItem.type === "fill_blank") {
      return <SessionTextInputQuestion item={currentItem} onResolve={handleItemResolved} />;
    }

    if (
      currentItem.type === "arrange_sentence" ||
      currentItem.type === "dialogue_reconstruct" ||
      currentItem.type === "sentence_build" ||
      currentItem.type === "reorder_sentence"
    ) {
      return <SessionBuildSentenceQuestion item={currentItem} onResolve={handleItemResolved} />;
    }

    if (currentItem.type === "speaking" || currentItem.type === "listen_repeat") {
      return <SessionSpeakingQuestion item={currentItem} onResolve={handleItemResolved} />;
    }

    return null;
  }

  function buildFeedback(): PracticeSessionFeedback | null {
    if (!feedbackState) {
      return null;
    }

    const { item, result, answer } = feedbackState;
    const explanation = result.explanation ? getLocalizedText(result.explanation, locale) : "";
    const correctAnswer = result.correctAnswer
      ? getLocalizedValue(result.correctAnswer, locale)
      : answer?.correctAnswer ?? "";
    const fingerprintLabel =
      answer?.fingerprint &&
      answer.fingerprint.confidenceScore >= FINGERPRINT_UI_CONFIDENCE_THRESHOLD
        ? getLocalizedText(answer.fingerprint.uiLabel, locale)
        : "";

    return {
      id: `${item.questionId}-${currentIndex}-${result.status}`,
      status: result.status,
      title:
        result.status === "correct"
          ? ui("Locked in.", "Đã chốt.")
          : ui("Review it once more.", "Xem lại một lần nữa."),
      eyebrow: ui("Answer checked", "Đã kiểm tra đáp án"),
      badges: (
        <>
          <span className="pill bg-card-strong text-foreground">
            {getSourceLabel(locale, item.selectionSource, answer?.errorCount ?? item.errorCount)}
          </span>
          {item.variantType !== "exact" ? (
            <span className="pill bg-card-soft text-muted-foreground">
              {item.variantType === "interaction_mode_variant"
                ? ui("Harder format", "Tăng độ khó")
                : item.variantType === "related_task_variant"
                  ? ui("Related variant", "Biến thể liên quan")
                  : ui("Fallback repeat", "Lặp lại dự phòng")}
            </span>
          ) : null}
          {(answer?.repeated || item.errorCount > 1) && (
            <span className="pill bg-danger-soft text-danger">
              {ui(
                `Repeated x${answer?.errorCount ?? item.errorCount}`,
                `Lặp lại x${answer?.errorCount ?? item.errorCount}`,
              )}
            </span>
          )}
        </>
      ),
      summary:
        result.status === "correct" ? (
          <p>
            {answer?.nextReviewAt
              ? ui(
                  "This mistake is now pushed back for a later review window.",
                  "Lỗi sai này đã được đẩy lùi sang một mốc ôn tập muộn hơn.",
                )
              : ui(
                  "Correct. This item stays out of the queue for now.",
                  "Đúng. Mục này tạm thời không nằm trong hàng đợi.",
                )}
          </p>
        ) : (
          <div className="space-y-2">
            <p>
              {ui("Correct answer", "Đáp án đúng")}: {correctAnswer}
            </p>
            <p className="font-semibold">
              {ui(
                "This item is scheduled back into your mistake queue.",
                "Mục này đã được đưa trở lại vào hàng đợi lỗi sai.",
              )}
            </p>
          </div>
        ),
      hint:
        result.status === "incorrect"
          ? ui(
              "One fast correction now is better than repeating the same pattern later.",
              "Sửa nhanh ngay bây giờ sẽ tốt hơn việc lặp lại cùng một lỗi ở lần sau.",
            )
          : undefined,
      detail:
        answer?.nextReviewAt || result.detail ? (
          <div className="space-y-2">
            {answer?.nextReviewAt ? (
              <p>
                {ui("Next review", "Lần ôn tiếp theo")}:{" "}
                {new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(answer.nextReviewAt))}
              </p>
            ) : null}
            {result.detail ? <p>{result.detail}</p> : null}
          </div>
        ) : undefined,
      fingerprintLabel,
      fingerprintReason: answer?.fingerprint?.shortReason,
      explanation: explanation || undefined,
      errorMessage: saveError,
      onContinue: handleAdvance,
      actionLabel:
        currentIndex >= items.length - 1
          ? ui("Finish practice", "Kết thúc luyện tập")
          : ui("Next", "Tiếp theo"),
      actionLoadingLabel: ui("Saving session...", "Đang lưu buổi học..."),
      isContinuing: isCompletingSession,
      showCelebration: result.status === "correct",
      widthClassName: "max-w-4xl",
    };
  }

  function renderSummary() {
    return (
      <section className="panel">
        <div className="lesson-card space-y-6 text-center">
          <span className="pill mx-auto bg-success-soft text-accent-strong">
            {getLocalizedText(sessionLabel ?? getSessionLabelFallback(adaptiveMode), locale)}
          </span>
          <div className="space-y-2">
            <h3 className="font-display text-4xl text-foreground sm:text-5xl">
              {ui("Practice run complete.", "Đã xong lượt luyện tập.")}
            </h3>
            <p className="text-lg font-bold text-muted-foreground">
              {ui(
                `${correctCount}/${items.length} answers landed correctly.`,
                `${correctCount}/${items.length} câu trả lời đúng.`,
              )}
            </p>
          </div>

          {isCompletingSession ? (
            <div className="rounded-[1.7rem] bg-card-soft px-4 py-3 text-sm font-bold text-muted-foreground">
              {ui("Finalizing adaptive session...", "Đang chốt buổi học thích ứng...")}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={handleReplay} className="primary-button w-full">
              {ui("Run again", "Làm lại")}
            </button>
            <Link href={backHref} className="secondary-button w-full">
              {ui("Back to practice", "Về luyện tập")}
            </Link>
          </div>

          {completionError ? <div className="feedback-incorrect">{completionError}</div> : null}
        </div>
      </section>
    );
  }

  const practiceQuestion = !sessionFinished && currentItem ? renderQuestion() : null;
  const practiceFeedback = !sessionFinished ? buildFeedback() : null;
  const practiceProgress =
    !sessionFinished && currentItem ? (
      <>
        <ProgressBar
          currentIndex={currentIndex}
          totalCount={items.length}
          currentLabel={getSessionItemTypeLabel(
            currentItem.type,
            locale,
            currentItem.interactionMode,
          )}
        />

        <section className="panel max-w-4xl">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`pill ${
                currentItem.selectionSource === "due_review" ||
                currentItem.selectionSource === "weak_reinforcement"
                  ? "bg-danger-soft text-danger"
                  : "bg-card-strong text-foreground"
              }`}
            >
              {getSourceLabel(locale, currentItem.selectionSource, currentItem.errorCount)}
            </span>
            {currentItem.variantType !== "exact" ? (
              <span className="pill bg-card-soft text-muted-foreground">
                {currentItem.variantType === "interaction_mode_variant"
                ? ui("Harder format", "Tăng độ khó")
                : currentItem.variantType === "related_task_variant"
                    ? ui("Related variant", "Biến thể liên quan")
                    : ui("Fallback repeat", "Lặp lại dự phòng")}
              </span>
            ) : null}
            {currentItem.errorCount > 1 ? (
              <span className="pill bg-danger-soft text-danger">
                {ui(`Repeated x${currentItem.errorCount}`, `Lặp lại x${currentItem.errorCount}`)}
              </span>
            ) : null}
          </div>
        </section>
      </>
    ) : null;

  if (isLoading) {
    return (
      <main className="page-shell">
        <section className="panel max-w-4xl">
          <div className="lesson-card space-y-4 text-center">
            <span className="pill mx-auto bg-card-strong text-foreground">
              {copy.eyebrow}
            </span>
            <h1 className="font-display text-4xl text-foreground sm:text-5xl">
              {ui("Building your next practice run.", "Đang tạo lượt luyện tập tiếp theo.")}
            </h1>
            <p className="text-base font-bold text-muted-foreground">{copy.summary}</p>
          </div>
        </section>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="page-shell">
        <section className="panel max-w-4xl">
          <div className="lesson-card space-y-5 text-center">
            <span className="pill mx-auto bg-danger-soft text-danger">
              {copy.eyebrow}
            </span>
            <h1 className="font-display text-4xl text-foreground sm:text-5xl">
              {ui("Practice could not start.", "Không thể bắt đầu lượt luyện tập.")}
            </h1>
            <div className="feedback-incorrect">{loadError}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={handleReplay} className="primary-button w-full">
                {ui("Try again", "Thử lại")}
              </button>
              <Link href={backHref} className="secondary-button w-full">
                {ui("Back to practice", "Về luyện tập")}
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!items.length) {
    return (
      <main className="page-shell">
        <section className="panel max-w-4xl">
          <div className="lesson-card space-y-5 text-center">
            <span className="pill mx-auto bg-card-strong text-foreground">
              {copy.eyebrow}
            </span>
            <h1 className="font-display text-4xl text-foreground sm:text-5xl">
              {copy.emptyTitle}
            </h1>
            <p className="text-base font-bold text-muted-foreground">{copy.emptySummary}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={handleReplay} className="primary-button w-full">
                {ui("Refresh queue", "Tải lại hàng đợi")}
              </button>
              <Link href={backHref} className="secondary-button w-full">
                {ui("Back to practice", "Về luyện tập")}
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="panel max-w-4xl">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <span className="pill bg-accent-warm/70 text-foreground">
              {getLocalizedText(sessionLabel ?? getSessionLabelFallback(adaptiveMode), locale)}
            </span>
            <h1 className="font-display text-4xl text-foreground sm:text-6xl">{copy.title}</h1>
            <p className="max-w-2xl text-base font-bold text-muted-foreground">
              {copy.summary}
            </p>
          </div>

          <div className="flex flex-wrap gap-3 sm:justify-end">
            <Link href={backHref} className="secondary-button">
              {ui("Practice hub", "Hub luyện tập")}
            </Link>
            <button type="button" onClick={handleReplay} className="secondary-button">
              {ui("Reload set", "Tải lại bộ câu hỏi")}
            </button>
          </div>
        </div>
      </section>

      {shouldRequestDebug && sessionDebug?.length ? (
        <section className="panel max-w-4xl">
          <details className="rounded-[1.6rem] bg-card-soft p-4">
            <summary className="cursor-pointer text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {ui("Adaptive debug", "Adaptive debug")}
            </summary>
            <div className="mt-4 space-y-3">
              {sessionDebug.map((entry) => (
                <div key={entry.questionId} className="rounded-[1.2rem] bg-white p-4 text-sm">
                  <p className="font-extrabold text-foreground">{entry.questionId}</p>
                  <p className="mt-1 font-bold text-muted-foreground">
                    {entry.selectionSource} · {entry.variantType}
                  </p>
                  <p className="mt-2 text-muted-foreground">{entry.reason}</p>
                  <p className="mt-2 text-xs font-bold text-muted-foreground/80">
                    {ui("Score", "Điểm")}: {entry.weightBreakdown.totalScore} | W: {entry.weightBreakdown.weaknessWeight} | D: {entry.weightBreakdown.recencyDueWeight} | R: {entry.weightBreakdown.repeatedErrorWeight} | F: {entry.weightBreakdown.fingerprintPriorityWeight} | P: {entry.weightBreakdown.progressionRelevanceWeight} | O: {entry.weightBreakdown.overexposurePenalty}
                  </p>
                </div>
              ))}
            </div>
          </details>
        </section>
      ) : null}

      {sessionFinished
        ? renderSummary()
        : currentItem
          ? (
              <PracticeSession
                questionKey={`${sessionKey}-${currentItem.questionId}-${currentIndex}`}
                progress={practiceProgress}
                question={practiceQuestion}
                feedback={practiceFeedback}
              />
            )
          : null}
    </main>
  );
}
