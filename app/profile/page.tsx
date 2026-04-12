"use client";

import MaskedStatusIcon from "@/components/MaskedStatusIcon";
import { useAppLocale } from "@/hooks/useAppLocale";
import { useAuth } from "@/hooks/useAuth";
import { useHanlingoSnapshot } from "@/hooks/useHanlingoSnapshot";
import { getLocalizedText } from "@/lib/localized";
import { LEAGUE_TONES, STATUS_ICON_USAGE } from "@/lib/status-icons";
import type { AppLocale } from "@/types/app-locale";
import type { LeaderboardLeague } from "@/lib/constants/leaderboard";

function ui(locale: AppLocale, en: string, vi: string) {
  return getLocalizedText({ en, vi }, locale);
}

function formatLeagueLabel(locale: AppLocale, league: LeaderboardLeague) {
  const label = `${league.charAt(0).toUpperCase()}${league.slice(1)}`;
  return ui(locale, `${label} League`, `Hang ${label}`);
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
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-4xl leading-tight text-foreground sm:text-6xl">
                {user ? `@${user.username}` : ui(locale, "Profile", "Ho so")}
              </h1>
              {user ? (
                <span
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-black uppercase tracking-[0.14em]"
                  style={{
                    backgroundColor: LEAGUE_TONES[user.currentLeague].badgeBackground,
                    borderColor: LEAGUE_TONES[user.currentLeague].badgeBorder,
                    color: LEAGUE_TONES[user.currentLeague].badgeText,
                  }}
                >
                  <MaskedStatusIcon
                    path={STATUS_ICON_USAGE.leaderboard.leagueBadge}
                    size={18}
                    color={LEAGUE_TONES[user.currentLeague].accent}
                  />
                  {formatLeagueLabel(locale, user.currentLeague)}
                </span>
              ) : null}
            </div>
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
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#18261d] text-white">
                <MaskedStatusIcon path={STATUS_ICON_USAGE.profile.username} size={22} />
              </span>
              <p className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
                {ui(locale, "Username", "Ten dang nhap")}
              </p>
            </div>
            <p className="mt-3 text-xl font-extrabold text-foreground">
              @{user?.username ?? "learner"}
            </p>
          </div>
          <div className="rounded-[1.9rem] bg-white p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#edf4ef] text-[#355a45]">
                <MaskedStatusIcon
                  path={STATUS_ICON_USAGE.profile.email}
                  size={22}
                  color="#355a45"
                />
              </span>
              <p className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
                {ui(locale, "Email", "Email")}
              </p>
            </div>
            <p className="mt-3 text-xl font-extrabold text-foreground break-all">
              {user?.email ?? "unknown"}
            </p>
          </div>
          <div className="rounded-[1.9rem] bg-white p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#eef9dc] text-[#2f8f46]">
                <MaskedStatusIcon
                  path={STATUS_ICON_USAGE.profile.xp}
                  size={22}
                  color="#2f8f46"
                />
              </span>
              <p className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
                {ui(locale, "XP", "XP")}
              </p>
            </div>
            <p className="mt-3 font-display text-5xl text-accent-strong">{progress.xp}</p>
          </div>
          <div className="rounded-[1.9rem] bg-white p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#fff3e1] text-[#a56812]">
                <MaskedStatusIcon
                  path={STATUS_ICON_USAGE.profile.lessons}
                  size={22}
                  color="#a56812"
                />
              </span>
              <p className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
                {ui(locale, "Lessons done", "Bai da xong")}
              </p>
            </div>
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
