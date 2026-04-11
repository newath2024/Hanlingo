"use client";

import Link from "next/link";
import { useAppLocale } from "@/hooks/useAppLocale";
import { getLocalizedText } from "@/lib/localized";
import type { AppLocale } from "@/types/app-locale";

function ui(locale: AppLocale, en: string, vi: string) {
  return getLocalizedText({ en, vi }, locale);
}

export default function LeaderboardPage() {
  const { locale } = useAppLocale();

  return (
    <main className="shell-page">
      <section className="panel overflow-hidden">
        <div className="max-w-3xl space-y-4">
          <span className="pill bg-accent text-white">
            {ui(locale, "Leaderboard", "Bang xep hang")}
          </span>
          <h1 className="font-display text-4xl leading-tight text-foreground sm:text-6xl">
            {ui(
              locale,
              "Leaderboard is coming after the core learning loop is tighter.",
              "Bang xep hang se den sau khi vong hoc cot loi duoc sit hon.",
            )}
          </h1>
          <p className="text-lg font-bold text-muted-foreground">
            {ui(
              locale,
              "For now, the important race is finishing the next lesson and keeping practice useful.",
              "Luc nay, cuoc dua quan trong nhat van la xong bai tiep theo va giu luyen tap that su huu ich.",
            )}
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-[1.9rem] bg-card-strong p-5">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">
              {ui(locale, "Current state", "Trang thai hien tai")}
            </p>
            <p className="mt-3 text-lg font-extrabold text-foreground">
              {ui(locale, "Focus is on learning flow first.", "Dang uu tien luong hoc truoc.")}
            </p>
          </div>
          <div className="rounded-[1.9rem] bg-white p-5">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">
              {ui(locale, "Next useful move", "Buoc huu ich tiep theo")}
            </p>
            <Link href="/" className="primary-button mt-4 w-full">
              {ui(locale, "Back to Learn", "Ve Hoc")}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
