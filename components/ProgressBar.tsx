"use client";

import { useAppLocale } from "@/hooks/useAppLocale";
import { getLocalizedText } from "@/lib/localized";

type ProgressBarProps = {
  currentIndex: number;
  totalCount: number;
  currentLabel: string;
  isRetry?: boolean;
};

export default function ProgressBar({
  currentIndex,
  totalCount,
  currentLabel,
  isRetry = false,
}: ProgressBarProps) {
  const { locale } = useAppLocale();
  const progress = totalCount > 0 ? ((currentIndex + 1) / totalCount) * 100 : 0;
  const ui = (en: string, vi: string) => getLocalizedText({ en, vi }, locale);

  return (
    <div className="panel">
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {ui("Session Progress", "Tien do buoi hoc")}
            </p>
            <h2 className="font-display text-2xl text-foreground">
              {currentIndex + 1} / {totalCount}
            </h2>
          </div>
          <span
            key={`${currentLabel}-${currentIndex}`}
            className="pill progress-pill-active bg-card-strong text-foreground"
          >
            {isRetry ? `${ui("Retry", "Lam lai")} / ${currentLabel}` : currentLabel}
          </span>
        </div>

        <div className="relative h-4 rounded-full bg-muted">
          <div
            className="progress-fill h-full rounded-full bg-accent"
            style={{ width: `${progress}%` }}
          />
          <span
            key={`burst-${currentIndex}`}
            className="progress-burst absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-accent/35"
            style={{ left: `calc(${progress}% - 10px)` }}
          />
        </div>

        <p className="text-sm font-bold text-muted-foreground">
          {isRetry
            ? ui(
                "This item came back because it needs one more pass.",
                "Muc nay quay lai vi can them mot lan nua.",
              )
            : ui(
                "One challenge at a time. Wrong answers can return later in the run.",
                "Xu ly tung thu thach mot. Cau sai co the quay lai sau trong luot hoc.",
              )}
        </p>
      </div>
    </div>
  );
}
