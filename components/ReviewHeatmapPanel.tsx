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
    return getLocalizedText(
      { en: "Needs urgent review", vi: "Can on gap" },
      locale,
    );
  }

  if (tag === "Weak grammar area") {
    return getLocalizedText(
      { en: "Weak grammar area", vi: "Diem ngu phap yeu" },
      locale,
    );
  }

  if (tag === "Often confused vocab") {
    return getLocalizedText(
      { en: "Often confused vocab", vi: "Tu vung hay nham" },
      locale,
    );
  }

  return getLocalizedText({ en: "Steady watch", vi: "Can theo doi" }, locale);
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
                vi: `${entry.wrongCount} loi sai · ${formatPercent(entry.accuracy)} do chinh xac`,
              },
              locale,
            )}
          </p>
          {entry.repeatedFailureStreak > 1 ? (
            <p className="text-xs font-bold text-muted-foreground/80">
              {getLocalizedText(
                {
                  en: `Repeated failure streak x${entry.repeatedFailureStreak}`,
                  vi: `Chuoi sai lap lai x${entry.repeatedFailureStreak}`,
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
              {compact ? ui("Weak Areas", "Muc dang yeu") : ui("Review Analytics", "Phan tich on tap")}
            </p>
            <h2 className="font-display text-3xl text-foreground">
              {compact
                ? ui("Use the heatmap as a secondary view of where review still slips.", "Dung heatmap nhu mot lop xem phu cho cac diem on tap van bi truot.")
                : ui("Error heatmap for your current weak zones.", "Ban do nhiet loi sai cua cac diem yeu hien tai.")}
            </h2>
          </div>

          <button type="button" onClick={() => void reload()} className="secondary-button">
            {ui("Refresh", "Tai lai")}
          </button>
        </div>

        {isLoading ? (
          <div className="rounded-[1.8rem] bg-card-soft px-5 py-4 text-base font-bold text-muted-foreground">
            {ui("Calculating where your mistakes cluster...", "Dang tinh xem loi sai cua ban tap trung o dau...")}
          </div>
        ) : null}

        {error ? <div className="feedback-incorrect">{error}</div> : null}

        {!isLoading && !error && data ? (
          <>
            {!compact ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-[1.8rem] bg-card-strong p-5">
                  <p className="text-sm font-bold text-muted-foreground">{ui("Total seen", "Tong luot lam")}</p>
                  <p className="mt-2 font-display text-4xl text-foreground">{data.summary.totalSeen}</p>
                </div>
                <div className="rounded-[1.8rem] bg-white p-5">
                  <p className="text-sm font-bold text-muted-foreground">{ui("Total wrong", "Tong loi sai")}</p>
                  <p className="mt-2 font-display text-4xl text-danger">{data.summary.totalWrong}</p>
                </div>
                <div className="rounded-[1.8rem] bg-white p-5">
                  <p className="text-sm font-bold text-muted-foreground">{ui("Overall accuracy", "Do chinh xac tong")}</p>
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
                  "Chua co lich su tra loi. Hoan thanh mot bai hoc hoac buoi luyen tap truoc.",
                )}
              </div>
            ) : (
              <div className={`grid gap-4 ${compact ? "xl:grid-cols-3" : "lg:grid-cols-2"}`}>
                {!compact ? (
                  <SectionBlock
                    locale={locale}
                    title={ui("Hardest Units", "Unit kho nhat")}
                    emptyLabel={ui("No weak units yet.", "Chua co unit yeu.")}
                    entries={data.summary.mostMissedUnits}
                  />
                ) : null}
                <SectionBlock
                  locale={locale}
                  title={ui("Hardest Lessons", "Bai kho nhat")}
                  emptyLabel={ui("No weak lessons yet.", "Chua co bai yeu.")}
                  entries={data.summary.mostMissedLessons}
                />
                <SectionBlock
                  locale={locale}
                  title={ui("Weakest Skills", "Ky nang yeu nhat")}
                  emptyLabel={ui("No weak skills yet.", "Chua co ky nang yeu.")}
                  entries={data.summary.mostMissedSkills}
                />
                <SectionBlock
                  locale={locale}
                  title={ui("Top Repeated Mistakes", "Loi lap lai nhieu nhat")}
                  emptyLabel={ui("No repeated mistakes yet.", "Chua co loi lap lai.")}
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
