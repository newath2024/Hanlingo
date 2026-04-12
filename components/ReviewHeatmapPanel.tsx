"use client";

import { useAppLocale } from "@/hooks/useAppLocale";
import { useUserErrorHeatmap } from "@/hooks/useUserErrorHeatmap";
import { getLocalizedText } from "@/lib/localized";
import type { HeatmapRecommendationTag, UserErrorHeatmapEntry } from "@/types/error-heatmap";

function getTagTone(tag: HeatmapRecommendationTag) {
  if (tag === "Needs urgent review") {
    return "bg-danger-soft text-danger";
  }

  if (tag === "Weak grammar area") {
    return "bg-accent-warm/70 text-foreground";
  }

  if (tag === "Often confused vocab") {
    return "bg-card-strong text-foreground";
  }

  return "bg-white text-muted-foreground";
}

function getTagLabel(tag: HeatmapRecommendationTag, locale: "en" | "vi") {
  if (tag === "Needs urgent review") {
    return getLocalizedText({ en: "Needs urgent review", vi: "Cần ôn gấp" }, locale);
  }

  if (tag === "Weak grammar area") {
    return getLocalizedText({ en: "Weak grammar area", vi: "Điểm ngữ pháp yếu" }, locale);
  }

  if (tag === "Often confused vocab") {
    return getLocalizedText({ en: "Often confused vocab", vi: "Từ vựng hay nhầm" }, locale);
  }

  return getLocalizedText({ en: "Steady watch", vi: "Cần theo dõi" }, locale);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function HeatmapRow({
  entry,
  locale,
}: {
  entry: UserErrorHeatmapEntry;
  locale: "en" | "vi";
}) {
  return (
    <div className="rounded-[1.4rem] bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-base font-extrabold text-foreground">{entry.label}</p>
          <p className="text-sm font-bold text-muted-foreground">
            {getLocalizedText(
              {
                en: `${entry.wrongCount} wrong · ${formatPercent(entry.accuracy)} accuracy`,
                vi: `${entry.wrongCount} lỗi sai · ${formatPercent(entry.accuracy)} độ chính xác`,
              },
              locale,
            )}
          </p>
          {entry.repeatedFailureStreak > 1 ? (
            <p className="text-xs font-bold text-muted-foreground/80">
              {getLocalizedText(
                {
                  en: `Repeated failure streak x${entry.repeatedFailureStreak}`,
                  vi: `Chuỗi sai lặp lại x${entry.repeatedFailureStreak}`,
                },
                locale,
              )}
            </p>
          ) : null}
        </div>

        <span className={`pill ${getTagTone(entry.recommendationTag)}`}>
          {getTagLabel(entry.recommendationTag, locale)}
        </span>
      </div>
    </div>
  );
}

function SectionBlock({
  locale,
  title,
  emptyLabel,
  entries,
}: {
  locale: "en" | "vi";
  title: string;
  emptyLabel: string;
  entries: UserErrorHeatmapEntry[];
}) {
  return (
    <div className="rounded-[1.8rem] bg-card-soft p-5">
      <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </p>

      {entries.length ? (
        <div className="mt-4 space-y-3">
          {entries.map((entry) => (
            <HeatmapRow key={`${entry.scopeType}:${entry.scopeId}`} entry={entry} locale={locale} />
          ))}
        </div>
      ) : (
        <p className="mt-4 text-base font-bold text-muted-foreground">{emptyLabel}</p>
      )}
    </div>
  );
}

export default function ReviewHeatmapPanel({ compact = false }: { compact?: boolean }) {
  const { locale } = useAppLocale();
  const { data, isLoading, error, reload } = useUserErrorHeatmap();
  const ui = (en: string, vi: string) => getLocalizedText({ en, vi }, locale);

  return (
    <section className="panel max-w-5xl">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">
              {compact ? ui("Weak Areas", "Mục đang yếu") : ui("Review Analytics", "Phân tích ôn tập")}
            </p>
            <h2 className="font-display text-3xl text-foreground">
              {compact
                ? ui(
                    "Use the heatmap as a secondary view of where review still slips.",
                    "Dùng heatmap như một lớp xem phụ cho các điểm ôn tập vẫn bị trượt.",
                  )
                : ui(
                    "Error heatmap for your current weak zones.",
                    "Bản đồ nhiệt lỗi sai của các điểm yếu hiện tại.",
                  )}
            </h2>
          </div>

          <button type="button" onClick={() => void reload()} className="secondary-button">
            {ui("Refresh", "Tải lại")}
          </button>
        </div>

        {isLoading ? (
          <div className="rounded-[1.8rem] bg-card-soft px-5 py-4 text-base font-bold text-muted-foreground">
            {ui("Calculating where your mistakes cluster...", "Đang tính xem lỗi sai của bạn tập trung ở đâu...")}
          </div>
        ) : null}

        {error ? <div className="feedback-incorrect">{error}</div> : null}

        {!isLoading && !error && data ? (
          <>
            {!compact ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-[1.8rem] bg-card-strong p-5">
                  <p className="text-sm font-bold text-muted-foreground">{ui("Total seen", "Tổng lượt làm")}</p>
                  <p className="mt-2 font-display text-4xl text-foreground">{data.summary.totalSeen}</p>
                </div>
                <div className="rounded-[1.8rem] bg-white p-5">
                  <p className="text-sm font-bold text-muted-foreground">{ui("Total wrong", "Tổng lỗi sai")}</p>
                  <p className="mt-2 font-display text-4xl text-danger">{data.summary.totalWrong}</p>
                </div>
                <div className="rounded-[1.8rem] bg-white p-5">
                  <p className="text-sm font-bold text-muted-foreground">{ui("Overall accuracy", "Độ chính xác tổng")}</p>
                  <p className="mt-2 font-display text-4xl text-accent-strong">
                    {formatPercent(data.summary.overallAccuracy)}
                  </p>
                </div>
              </div>
            ) : null}

            {data.summary.totalSeen === 0 ? (
              <div className="rounded-[1.8rem] bg-card-soft px-5 py-4 text-base font-bold text-muted-foreground">
                {ui(
                  "No answer history yet. Finish a lesson or practice run first.",
                  "Chưa có lịch sử trả lời. Hoàn thành một bài học hoặc buổi luyện tập trước.",
                )}
              </div>
            ) : (
              <div className={`grid gap-4 ${compact ? "xl:grid-cols-3" : "lg:grid-cols-2"}`}>
                {!compact ? (
                  <SectionBlock
                    locale={locale}
                    title={ui("Hardest Units", "Unit khó nhất")}
                    emptyLabel={ui("No weak units yet.", "Chưa có unit yếu.")}
                    entries={data.summary.mostMissedUnits}
                  />
                ) : null}
                <SectionBlock
                  locale={locale}
                  title={ui("Hardest Lessons", "Bài khó nhất")}
                  emptyLabel={ui("No weak lessons yet.", "Chưa có bài yếu.")}
                  entries={data.summary.mostMissedLessons}
                />
                <SectionBlock
                  locale={locale}
                  title={ui("Weakest Skills", "Kỹ năng yếu nhất")}
                  emptyLabel={ui("No weak skills yet.", "Chưa có kỹ năng yếu.")}
                  entries={data.summary.mostMissedSkills}
                />
                <SectionBlock
                  locale={locale}
                  title={ui("Top Repeated Mistakes", "Lỗi lặp lại nhiều nhất")}
                  emptyLabel={ui("No repeated mistakes yet.", "Chưa có lỗi lặp lại.")}
                  entries={data.heatmap}
                />
              </div>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}
