"use client";

import { useAppLocale } from "@/hooks/useAppLocale";
import { useAuth } from "@/hooks/useAuth";
import { useHanlingoSnapshot } from "@/hooks/useHanlingoSnapshot";
import { getLocalizedText } from "@/lib/localized";
import type { AppLocale } from "@/types/app-locale";

function ui(locale: AppLocale, en: string, vi: string) {
  return getLocalizedText({ en, vi }, locale);
}

export default function ProfilePage() {
  const { locale } = useAppLocale();
  const { user } = useAuth();
  const { progress, isLoading, error } = useHanlingoSnapshot("profile-overview", []);

  return (
    <main className="shell-page">
      <section className="panel overflow-hidden">
        <div className="space-y-4">
          <span className="pill bg-accent text-white">
            {ui(locale, "Profile", "Ho so")}
          </span>
          <div className="space-y-3">
            <h1 className="font-display text-4xl leading-tight text-foreground sm:text-6xl">
              {user ? `@${user.username}` : ui(locale, "Profile", "Ho so")}
            </h1>
            <p className="max-w-2xl text-lg font-bold text-muted-foreground">
              {ui(
                locale,
                "Account basics stay simple here so the learning flow stays the hero elsewhere.",
                "Thong tin tai khoan o day giu gon de luong hoc van la nhan vat chinh o noi khac.",
              )}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[1.9rem] bg-card-strong p-5">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
              {ui(locale, "Username", "Ten dang nhap")}
            </p>
            <p className="mt-3 text-xl font-extrabold text-foreground">
              @{user?.username ?? "learner"}
            </p>
          </div>
          <div className="rounded-[1.9rem] bg-white p-5">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
              {ui(locale, "Email", "Email")}
            </p>
            <p className="mt-3 text-xl font-extrabold text-foreground break-all">
              {user?.email ?? "unknown"}
            </p>
          </div>
          <div className="rounded-[1.9rem] bg-white p-5">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
              {ui(locale, "XP", "XP")}
            </p>
            <p className="mt-3 font-display text-5xl text-accent-strong">{progress.xp}</p>
          </div>
          <div className="rounded-[1.9rem] bg-white p-5">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
              {ui(locale, "Lessons done", "Bai da xong")}
            </p>
            <p className="mt-3 font-display text-5xl text-foreground">{progress.completedNodes.length}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-6 rounded-[1.8rem] bg-card-soft px-5 py-4 text-base font-bold text-muted-foreground">
            {ui(locale, "Loading profile summary...", "Dang tai tong quan ho so...")}
          </div>
        ) : null}

        {error ? <div className="mt-6 feedback-incorrect">{error}</div> : null}
      </section>
    </main>
  );
}
