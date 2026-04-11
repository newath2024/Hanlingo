"use client";

import ReviewHeatmapPanel from "@/components/ReviewHeatmapPanel";
import { useAnalyticsOverview } from "@/hooks/useAnalyticsOverview";
import { useAppLocale } from "@/hooks/useAppLocale";
import { getLocalizedText } from "@/lib/localized";
import type { AppLocale } from "@/types/app-locale";

function ui(locale: AppLocale, en: string, vi: string) {
  return getLocalizedText({ en, vi }, locale);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default function AnalyticsPage() {
  const { locale } = useAppLocale();
  const { data, isLoading, error } = useAnalyticsOverview();

  return (
    <main className="shell-page">
      <section className="panel overflow-hidden">
        <div className="space-y-4">
          <span className="pill bg-accent text-white">
            {ui(locale, "Analytics", "Phan tich")}
          </span>
          <div className="space-y-3">
            <h1 className="font-display text-4xl leading-tight text-foreground sm:text-6xl">
              {ui(
                locale,
                "See how learning is moving, then go back to the path.",
                "Xem nhip hoc dang chay ra sao, roi quay lai duong bai hoc.",
              )}
            </h1>
            <p className="max-w-2xl text-lg font-bold text-muted-foreground">
              {ui(
                locale,
                "This screen stays secondary. Use it to spot patterns, not to decide what the app should do next for you.",
                "Man nay luon la phu. Dung no de nhin ra mau hinh, khong phai de thay the buoc tiep theo cua app.",
              )}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-6 rounded-[1.8rem] bg-card-soft px-5 py-4 text-base font-bold text-muted-foreground">
            {ui(locale, "Loading analytics summary...", "Dang tai tong quan phan tich...")}
          </div>
        ) : null}

        {error ? <div className="mt-6 feedback-incorrect">{error}</div> : null}

        {data ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[1.9rem] bg-card-strong p-5">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
                {ui(locale, "Accuracy", "Do chinh xac")}
              </p>
              <p className="mt-3 font-display text-5xl text-foreground">
                {formatPercent(data.overallAccuracy)}
              </p>
            </div>
            <div className="rounded-[1.9rem] bg-white p-5">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
                {ui(locale, "Lessons done", "Bai da xong")}
              </p>
              <p className="mt-3 font-display text-5xl text-foreground">{data.lessonsCompleted}</p>
            </div>
            <div className="rounded-[1.9rem] bg-white p-5">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
                {ui(locale, "Streak", "Chuoi hoc")}
              </p>
              <p className="mt-3 font-display text-5xl text-accent-strong">{data.streakDays}</p>
              <p className="mt-2 text-sm font-bold text-muted-foreground">
                {ui(locale, "consecutive active days", "ngay hoc lien tiep")}
              </p>
            </div>
            <div className="rounded-[1.9rem] bg-white p-5">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
                {ui(locale, "XP", "XP")}
              </p>
              <p className="mt-3 font-display text-5xl text-accent-strong">{data.xp}</p>
              <p className="mt-2 text-sm font-bold text-muted-foreground">
                {ui(locale, `${data.totalAttempts} tracked attempts`, `${data.totalAttempts} luot tra loi da ghi`)}
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <ReviewHeatmapPanel compact />
    </main>
  );
}
