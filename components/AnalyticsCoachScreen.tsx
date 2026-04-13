"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAnalyticsOverview } from "@/hooks/useAnalyticsOverview";
import { useAppLocale } from "@/hooks/useAppLocale";
import { useDeveloperAccess } from "@/hooks/useDeveloperAccess";
import { useHanlingoSnapshot } from "@/hooks/useHanlingoSnapshot";
import { usePracticeOverview } from "@/hooks/usePracticeOverview";
import { useUserErrorHeatmap } from "@/hooks/useUserErrorHeatmap";
import { getLocalizedText } from "@/lib/localized";
import { getCurrentNode, getCurrentUnit } from "@/lib/units";
import type { AppLocale } from "@/types/app-locale";
import type { AccuracyTrend, StreakTrend } from "@/types/analytics";
import type { UserErrorHeatmapEntry } from "@/types/error-heatmap";

type PriorityLevel = "urgent" | "recommended";

type NextAction = {
  id: string;
  title: string;
  summary: string;
  href: string;
  cta: string;
  priority: PriorityLevel;
};

function ui(locale: AppLocale, en: string, vi: string) {
  return getLocalizedText({ en, vi }, locale);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatDeltaValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function getPriorityLabel(priority: PriorityLevel, locale: AppLocale) {
  return priority === "urgent"
    ? ui(locale, "Urgent", "Cần ngay")
    : ui(locale, "Recommended", "Nên làm");
}

function getPriorityTone(priority: PriorityLevel) {
  return priority === "urgent"
    ? "bg-danger-soft text-danger"
    : "bg-card-strong text-foreground";
}

function getTrendTone(direction: AccuracyTrend["direction"] | StreakTrend["direction"]) {
  if (direction === "up") {
    return "bg-success-soft text-accent-strong";
  }

  if (direction === "down") {
    return "bg-danger-soft text-danger";
  }

  return "bg-card-soft text-muted-foreground";
}

function getAccuracyTrendLabel(locale: AppLocale, trend: AccuracyTrend) {
  if (trend.deltaPercent === null) {
    if (trend.label === "No answers yet today") {
      return ui(locale, "No answers yet today", "Hôm nay bạn chưa trả lời.");
    }

    return ui(locale, "First active day", "Ngày đầu có dữ liệu.");
  }

  if (trend.direction === "stable") {
    return ui(locale, "Same as yesterday", "Bằng hôm qua");
  }

  return ui(
    locale,
    `${trend.deltaPercent > 0 ? "+" : ""}${formatDeltaValue(trend.deltaPercent)}% from yesterday`,
    `${trend.deltaPercent > 0 ? "+" : ""}${formatDeltaValue(trend.deltaPercent)}% so với hôm qua`,
  );
}

function getStreakTrendLabel(locale: AppLocale, trend: StreakTrend) {
  if (trend.deltaDays === null) {
    if (trend.label === "Keep it alive today") {
      return ui(locale, "Keep it alive today", "Giữ chuỗi học trong hôm nay");
    }

    if (trend.label === "Streak starts today") {
      return ui(locale, "Streak starts today", "Chuỗi học bắt đầu hôm nay");
    }

    return ui(locale, "Start a streak today", "Bắt đầu chuỗi học hôm nay");
  }

  if (trend.direction === "stable") {
    return ui(locale, "Same as yesterday", "Bằng hôm qua");
  }

  return ui(
    locale,
    `${trend.deltaDays > 0 ? "+" : ""}${trend.deltaDays} day${Math.abs(trend.deltaDays) === 1 ? "" : "s"} vs yesterday`,
    `${trend.deltaDays > 0 ? "+" : ""}${trend.deltaDays} ngày so với hôm qua`,
  );
}

function prioritizeWeakSkills(entries: UserErrorHeatmapEntry[]) {
  const priorityIds = ["grammar", "vocab"];
  const prioritized = priorityIds
    .map((scopeId) => entries.find((entry) => entry.scopeId === scopeId))
    .filter((entry): entry is UserErrorHeatmapEntry => Boolean(entry));
  const fallback = entries.filter((entry) => !priorityIds.includes(entry.scopeId));

  return [...prioritized, ...fallback].slice(0, 2);
}

function getWeakSkillInsight(entry: UserErrorHeatmapEntry, locale: AppLocale) {
  if (entry.scopeId === "grammar") {
    return ui(
      locale,
      "Grammar is slowing you down right now.",
      "Ngữ pháp đang làm bạn chậm lại lúc này.",
    );
  }

  if (entry.scopeId === "vocab") {
    return ui(
      locale,
      "You are mixing these words too often.",
      "Bạn đang nhầm những từ này quá nhiều.",
    );
  }

  return ui(
    locale,
    `${entry.wrongCount} misses so far.`,
    `${entry.wrongCount} lỗi sai đã được ghi lại.`,
  );
}

function getMistakeInsight(entry: UserErrorHeatmapEntry, locale: AppLocale) {
  if (entry.repeatedFailureStreak > 1) {
    return ui(
      locale,
      `This has slipped ${entry.repeatedFailureStreak} times in a row.`,
      `Mục này đã trượt ${entry.repeatedFailureStreak} lần liên tiếp.`,
    );
  }

  return ui(
    locale,
    "You are mixing this often.",
    "Bạn đang nhầm mục này khá thường xuyên.",
  );
}

function CoachEmptyState({
  title,
  summary,
  actionHref,
  actionLabel,
}: {
  title: string;
  summary: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="rounded-[2rem] border border-accent/10 bg-card-soft px-5 py-6">
      <p className="text-xl font-extrabold text-foreground">{title}</p>
      <p className="mt-2 text-sm font-bold text-muted-foreground">{summary}</p>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="secondary-button mt-4 w-full sm:w-auto">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

function PriorityBadge({
  locale,
  priority,
}: {
  locale: AppLocale;
  priority: PriorityLevel;
}) {
  return (
    <span className={`pill ${getPriorityTone(priority)}`}>
      {getPriorityLabel(priority, locale)}
    </span>
  );
}

function TrendBadge({
  children,
  direction,
}: {
  children: string;
  direction: AccuracyTrend["direction"] | StreakTrend["direction"];
}) {
  return <span className={`pill ${getTrendTone(direction)}`}>{children}</span>;
}

function AnalyticsHero({ locale }: { locale: AppLocale }) {
  return (
    <div className="relative z-10 space-y-4">
      <span className="pill bg-white/12 text-white">
        {ui(locale, "Analytics", "Phân tích")}
      </span>
      <div className="space-y-3">
        <h1 className="max-w-3xl font-display text-4xl leading-tight text-white sm:text-6xl">
          {ui(locale, "Know your next move.", "Biết ngay bước tiếp theo.")}
        </h1>
        <p className="max-w-2xl text-lg font-bold text-white/72">
          {ui(
            locale,
            "Fix what slips, practice it now, then keep the path moving.",
            "Sửa điểm trượt, luyện ngay, rồi tiếp tục lộ trình.",
          )}
        </p>
      </div>
    </div>
  );
}

function LearningLoopStrip({ locale }: { locale: AppLocale }) {
  const steps = [
    ui(locale, "Learn", "Học"),
    ui(locale, "Miss", "Sai"),
    ui(locale, "Practice", "Luyện"),
    ui(locale, "Improve", "Tiến bộ"),
    ui(locale, "Continue", "Đi tiếp"),
  ];

  return (
    <div className="relative z-10 mt-5 flex flex-wrap gap-2">
      {steps.map((step) => (
        <span
          key={step}
          className="inline-flex items-center rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-black uppercase tracking-[0.12em] text-white/78"
        >
          {step}
        </span>
      ))}
    </div>
  );
}

function NextActionItem({
  locale,
  action,
  emphasized = false,
}: {
  locale: AppLocale;
  action: NextAction;
  emphasized?: boolean;
}) {
  const tone =
    action.priority === "urgent"
      ? emphasized
        ? "bg-danger-soft"
        : "bg-white"
      : emphasized
        ? "bg-card-strong"
        : "bg-white";
  const buttonClass =
    action.priority === "urgent" || emphasized ? "primary-button" : "secondary-button";

  return (
    <article
      className={`rounded-[2rem] border border-accent/10 ${tone} p-5 shadow-[0_16px_36px_rgba(47,92,51,0.08)]`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <PriorityBadge locale={locale} priority={action.priority} />
          <div className="space-y-2">
            <h3 className={`${emphasized ? "text-3xl sm:text-4xl" : "text-2xl"} font-display text-foreground`}>
              {action.title}
            </h3>
            <p className="max-w-xl text-sm font-bold text-muted-foreground">
              {action.summary}
            </p>
          </div>
        </div>

        <Link href={action.href} className={`${buttonClass} w-full md:w-auto`}>
          {action.cta}
        </Link>
      </div>
    </article>
  );
}

function NextActionCard({
  locale,
  actions,
  isLoading,
  error,
}: {
  locale: AppLocale;
  actions: NextAction[];
  isLoading: boolean;
  error: string | null;
}) {
  const primaryAction = actions[0];
  const secondaryActions = actions.slice(1);

  return (
    <div className="relative z-10 mt-8 rounded-[2.5rem] bg-white p-5 text-foreground shadow-[0_28px_70px_rgba(11,28,17,0.26)] sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">
            {ui(locale, "Next action", "Bước tiếp theo")}
          </p>
          <h2 className="mt-2 font-display text-3xl text-foreground sm:text-4xl">
            {ui(locale, "What should you do next?", "Bạn nên làm gì tiếp theo?")}
          </h2>
        </div>
        <span className="pill bg-card-soft text-foreground">
          {ui(locale, "Do this first", "Làm mục này trước")}
        </span>
      </div>

      {isLoading ? (
        <div className="mt-5 rounded-[2rem] bg-card-soft px-5 py-5 text-base font-bold text-muted-foreground">
          {ui(locale, "Loading your next move...", "Đang tìm bước tiếp theo cho bạn...")}
        </div>
      ) : null}

      {error ? <div className="mt-5 feedback-incorrect">{error}</div> : null}

      {!isLoading && !error && primaryAction ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <NextActionItem locale={locale} action={primaryAction} emphasized />

          <div className="space-y-4">
            {secondaryActions.length ? (
              secondaryActions.map((action) => (
                <NextActionItem key={action.id} locale={locale} action={action} />
              ))
            ) : (
              <CoachEmptyState
                title={ui(locale, "You have one clear move.", "Bạn đang có một hướng đi rất rõ.")}
                summary={ui(
                  locale,
                  "Finish that first, then the next recommendation will update here.",
                  "Hoàn thành mục này trước, rồi gợi ý tiếp theo sẽ cập nhật tại đây.",
                )}
              />
            )}
          </div>
        </div>
      ) : null}

      {!isLoading && !error && !primaryAction ? (
        <div className="mt-5">
          <CoachEmptyState
            title={ui(locale, "Start with a practice set.", "Bắt đầu bằng một bộ luyện tập.")}
            summary={ui(
              locale,
              "You need a few answers before this screen can coach you well.",
              "Bạn cần trả lời thêm một vài câu để màn này có thể huấn luyện tốt hơn.",
            )}
            actionHref="/practice/session"
            actionLabel={ui(locale, "Start practice", "Bắt đầu luyện tập")}
          />
        </div>
      ) : null}
    </div>
  );
}

function ProgressSummaryCard({
  locale,
  isLoading,
  error,
  accuracy,
  streakDays,
  xp,
  totalAttempts,
  accuracyTrend,
  streakTrend,
}: {
  locale: AppLocale;
  isLoading: boolean;
  error: string | null;
  accuracy?: number;
  streakDays?: number;
  xp?: number;
  totalAttempts?: number;
  accuracyTrend?: AccuracyTrend;
  streakTrend?: StreakTrend;
}) {
  return (
    <section className="panel">
      <div className="space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">
              {ui(locale, "Progress summary", "Tổng quan tiến độ")}
            </p>
            <h2 className="mt-2 font-display text-3xl text-foreground sm:text-4xl">
              {ui(locale, "Keep this momentum alive.", "Giữ nhịp tiến bộ này.")}
            </h2>
          </div>
          {typeof totalAttempts === "number" ? (
            <span className="pill bg-card-strong text-foreground">
              {ui(
                locale,
                `${totalAttempts} answers tracked`,
                `${totalAttempts} câu trả lời đã được ghi lại`,
              )}
            </span>
          ) : null}
        </div>

        {isLoading ? (
          <div className="rounded-[2rem] bg-card-soft px-5 py-5 text-base font-bold text-muted-foreground">
            {ui(locale, "Loading progress summary...", "Đang tải tổng quan tiến độ...")}
          </div>
        ) : null}

        {error ? <div className="feedback-incorrect">{error}</div> : null}

        {!isLoading && !error ? (
          <div className="rounded-[2rem] border border-accent/10 bg-[#fcfbf5] p-5">
            <div className="grid gap-5 md:grid-cols-3">
              <div className="rounded-[1.8rem] bg-card-soft p-5">
                <p className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
                  {ui(locale, "Accuracy", "Độ chính xác")}
                </p>
                <p className="mt-3 font-display text-5xl text-foreground">
                  {typeof accuracy === "number" ? formatPercent(accuracy) : "--"}
                </p>
                {accuracyTrend ? (
                  <div className="mt-3">
                    <TrendBadge direction={accuracyTrend.direction}>
                      {getAccuracyTrendLabel(locale, accuracyTrend)}
                    </TrendBadge>
                  </div>
                ) : null}
              </div>

              <div className="rounded-[1.8rem] bg-white p-5 shadow-[0_12px_26px_rgba(47,92,51,0.06)]">
                <p className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
                  {ui(locale, "Streak", "Chuỗi học")}
                </p>
                <p className="mt-3 font-display text-5xl text-accent-strong">
                  {typeof streakDays === "number" ? streakDays : "--"}
                </p>
                {streakTrend ? (
                  <div className="mt-3">
                    <TrendBadge direction={streakTrend.direction}>
                      {getStreakTrendLabel(locale, streakTrend)}
                    </TrendBadge>
                  </div>
                ) : null}
              </div>

              <div className="rounded-[1.8rem] bg-white p-5 shadow-[0_12px_26px_rgba(47,92,51,0.06)]">
                <p className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
                  {ui(locale, "XP", "XP")}
                </p>
                <p className="mt-3 font-display text-5xl text-accent-strong">
                  {typeof xp === "number" ? xp : "--"}
                </p>
                <div className="mt-3">
                  <TrendBadge direction="up">
                    {ui(locale, "Keep stacking today", "Tiếp tục cộng dồn hôm nay")}
                  </TrendBadge>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function WeakSkillsCard({
  locale,
  isLoading,
  error,
  skills,
}: {
  locale: AppLocale;
  isLoading: boolean;
  error: string | null;
  skills: UserErrorHeatmapEntry[];
}) {
  return (
    <section className="panel h-full">
      <div className="space-y-5">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">
            {ui(locale, "Weak skills", "Kỹ năng đang yếu")}
          </p>
          <h2 className="mt-2 font-display text-3xl text-foreground">
            {ui(locale, "Fix the skill that keeps slipping.", "Sửa kỹ năng vẫn đang bị trượt.")}
          </h2>
        </div>

        {isLoading ? (
          <div className="rounded-[2rem] bg-card-soft px-5 py-5 text-base font-bold text-muted-foreground">
            {ui(locale, "Looking for weak skills...", "Đang tìm kỹ năng cần sửa...")}
          </div>
        ) : null}

        {error ? <div className="feedback-incorrect">{error}</div> : null}

        {!isLoading && !error ? (
          skills.length ? (
            <div className="space-y-4">
              {skills.map((entry) => (
                <article
                  key={`${entry.scopeType}:${entry.scopeId}`}
                  className="rounded-[2rem] border border-accent/10 bg-card-soft p-5"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-2">
                      <span className="pill bg-white text-foreground">
                        {formatPercent(entry.accuracy)} {ui(locale, "accuracy", "độ chính xác")}
                      </span>
                      <h3 className="font-display text-3xl text-foreground">{entry.label}</h3>
                      <p className="text-sm font-bold text-muted-foreground">
                        {getWeakSkillInsight(entry, locale)}
                      </p>
                    </div>

                    <Link href="/practice/mistakes" className="primary-button w-full md:w-auto">
                      {ui(locale, "Fix now", "Sửa ngay")}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <CoachEmptyState
              title={ui(locale, "No clear weak skill yet.", "Chưa có kỹ năng yếu rõ ràng.")}
              summary={ui(
                locale,
                "Finish a few more answers and this card will point to the next fix.",
                "Trả lời thêm một vài câu nữa và card này sẽ chỉ ra điểm cần sửa tiếp theo.",
              )}
              actionHref="/practice/session"
              actionLabel={ui(locale, "Start practice", "Bắt đầu luyện tập")}
            />
          )
        ) : null}
      </div>
    </section>
  );
}

function CommonMistakesCard({
  locale,
  isLoading,
  error,
  mistakes,
}: {
  locale: AppLocale;
  isLoading: boolean;
  error: string | null;
  mistakes: UserErrorHeatmapEntry[];
}) {
  return (
    <section className="panel h-full">
      <div className="space-y-5">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">
            {ui(locale, "Common mistakes", "Lỗi lặp lại")}
          </p>
          <h2 className="mt-2 font-display text-3xl text-foreground">
            {ui(locale, "These are worth fixing next.", "Những mục này nên sửa tiếp theo.")}
          </h2>
        </div>

        {isLoading ? (
          <div className="rounded-[2rem] bg-card-soft px-5 py-5 text-base font-bold text-muted-foreground">
            {ui(locale, "Loading repeated mistakes...", "Đang tải các lỗi lặp lại...")}
          </div>
        ) : null}

        {error ? <div className="feedback-incorrect">{error}</div> : null}

        {!isLoading && !error ? (
          mistakes.length ? (
            <div className="space-y-4">
              {mistakes.map((entry) => (
                <article
                  key={`${entry.scopeType}:${entry.scopeId}`}
                  className="rounded-[2rem] border border-accent/10 bg-white p-5 shadow-[0_14px_32px_rgba(47,92,51,0.06)]"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-2">
                      <span className="pill bg-danger-soft text-danger">
                        {ui(locale, "Often mixed up", "Hay bị nhầm")}
                      </span>
                      <h3 className="font-display text-3xl text-foreground">{entry.label}</h3>
                      <p className="text-sm font-bold text-muted-foreground">
                        {getMistakeInsight(entry, locale)}
                      </p>
                    </div>

                    <Link href="/practice/mistakes" className="primary-button w-full md:w-auto">
                      {ui(locale, "Fix now", "Sửa ngay")}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <CoachEmptyState
              title={ui(locale, "No repeated mistake yet.", "Chưa có lỗi lặp lại rõ ràng.")}
              summary={ui(
                locale,
                "That is a good sign. Keep learning and this area will stay clean.",
                "Đây là dấu hiệu tốt. Tiếp tục học để khu vực này giữ được sự sạch sẽ.",
              )}
              actionHref="/practice/session"
              actionLabel={ui(locale, "Continue learning", "Tiếp tục học")}
            />
          )
        ) : null}
      </div>
    </section>
  );
}

export default function AnalyticsCoachScreen() {
  const { locale } = useAppLocale();
  const developerOverride = useDeveloperAccess();
  const { data: analyticsData, isLoading: analyticsLoading, error: analyticsError } = useAnalyticsOverview();
  const { data: practiceData, isLoading: practiceLoading, error: practiceError } = usePracticeOverview();
  const { data: heatmapData, isLoading: heatmapLoading, error: heatmapError } = useUserErrorHeatmap({
    limit: 3,
  });
  const { progress } = useHanlingoSnapshot("analytics-coach", []);
  const activeUnit = getCurrentUnit(progress, developerOverride);
  const activeNode = activeUnit ? getCurrentNode(activeUnit, progress, developerOverride) : null;
  const hasLearningHistory =
    (analyticsData?.totalAttempts ?? 0) > 0 ||
    progress.completedNodes.length > 0 ||
    progress.xp > 0;
  const nextActionLoading = practiceLoading || analyticsLoading;

  const nextActions = useMemo(() => {
    if ((practiceLoading && !practiceData) || (analyticsLoading && !analyticsData)) {
      return [] as NextAction[];
    }

    const actions: NextAction[] = [];

    if ((practiceData?.dueMistakeCount ?? 0) > 0) {
      actions.push({
        id: "due-mistakes",
        title: ui(locale, "Fix your due mistakes first.", "Sửa lỗi sai đến hạn trước."),
        summary: ui(
          locale,
          `${practiceData?.dueMistakeCount ?? 0} items are waiting. Clear them before they stick.`,
          `${practiceData?.dueMistakeCount ?? 0} mục đang chờ. Xử lý ngay trước khi chúng dính lại.`,
        ),
        href: "/practice/mistakes",
        cta: ui(locale, "Practice now", "Luyện ngay"),
        priority: "urgent",
      });
    }

    if (practiceData?.weakLessons[0]) {
      const lesson = practiceData.weakLessons[0];
      const isUrgent =
        lesson.accuracy < 0.55 ||
        lesson.repeatedFailureStreak >= 2 ||
        lesson.recommendationTag === "Needs urgent review";

      actions.push({
        id: "weak-lesson",
        title: ui(locale, "Retry this lesson.", "Học lại bài này."),
        summary: ui(
          locale,
          `${lesson.label} is still weak at ${formatPercent(lesson.accuracy)} accuracy.`,
          `${lesson.label} vẫn đang yếu với ${formatPercent(lesson.accuracy)} độ chính xác.`,
        ),
        href: `/practice/session?lessonId=${encodeURIComponent(lesson.scopeId)}`,
        cta: ui(locale, "Retry", "Học lại"),
        priority: isUrgent ? "urgent" : "recommended",
      });
    }

    if (hasLearningHistory && (activeUnit || activeNode)) {
      const activeTitle = activeNode
        ? getLocalizedText(activeNode.title, locale)
        : activeUnit
          ? getLocalizedText(activeUnit.title, locale)
          : ui(locale, "your current unit", "unit hiện tại");

      actions.push({
        id: "continue-review",
        title: ui(locale, "Continue your current review.", "Tiếp tục phần ôn tập hiện tại."),
        summary: ui(
          locale,
          `Go back to ${activeTitle} and keep the path moving.`,
          `Quay lại ${activeTitle} và giữ lộ trình tiếp tục đi lên.`,
        ),
        href: activeUnit ? `/practice/session?unitId=${encodeURIComponent(activeUnit.id)}` : "/practice/session",
        cta: ui(locale, "Continue review", "Tiếp tục ôn tập"),
        priority: "recommended",
      });
    }

    if (!actions.length) {
      actions.push({
        id: "start-practice",
        title: ui(locale, "Start a practice set.", "Bắt đầu một bộ luyện tập."),
        summary: ui(
          locale,
          "You need a few answers before this screen can coach you well.",
          "Bạn cần trả lời thêm một vài câu để màn này có thể huấn luyện tốt hơn.",
        ),
        href: "/practice/session",
        cta: ui(locale, "Start practice", "Bắt đầu luyện tập"),
        priority: "recommended",
      });
    }

    return actions.slice(0, 3);
  }, [
    activeNode,
    activeUnit,
    analyticsData,
    analyticsLoading,
    hasLearningHistory,
    locale,
    practiceData,
    practiceLoading,
  ]);

  const weakSkills = useMemo(
    () => prioritizeWeakSkills(practiceData?.weakSkills ?? []),
    [practiceData?.weakSkills],
  );
  const commonMistakes = useMemo(
    () => (heatmapData?.heatmap ?? []).slice(0, 3),
    [heatmapData?.heatmap],
  );

  return (
    <main className="shell-page">
      <section className="panel relative overflow-hidden border-0 bg-[#14231b] text-white shadow-[0_34px_90px_rgba(20,35,27,0.24)]">
        <div className="pointer-events-none absolute -left-10 top-8 h-36 w-36 rounded-full bg-[#f2d46a]/18 blur-3xl" />
        <div className="pointer-events-none absolute -right-14 top-10 h-48 w-48 rounded-full bg-[#8ce052]/16 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-20 h-32 w-32 rounded-full bg-white/10 blur-2xl" />

        <AnalyticsHero locale={locale} />
        <NextActionCard
          locale={locale}
          actions={nextActions}
          isLoading={nextActionLoading}
          error={practiceError}
        />
        <LearningLoopStrip locale={locale} />
      </section>

      <ProgressSummaryCard
        locale={locale}
        isLoading={analyticsLoading}
        error={analyticsError}
        accuracy={analyticsData?.overallAccuracy}
        streakDays={analyticsData?.streakDays}
        xp={analyticsData?.xp}
        totalAttempts={analyticsData?.totalAttempts}
        accuracyTrend={analyticsData?.accuracyTrend}
        streakTrend={analyticsData?.streakTrend}
      />

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <WeakSkillsCard
          locale={locale}
          isLoading={practiceLoading}
          error={practiceError}
          skills={weakSkills}
        />
        <CommonMistakesCard
          locale={locale}
          isLoading={heatmapLoading}
          error={heatmapError}
          mistakes={commonMistakes}
        />
      </section>
    </main>
  );
}
