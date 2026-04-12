"use client";

import MaskedStatusIcon from "@/components/MaskedStatusIcon";
import { useAppLocale } from "@/hooks/useAppLocale";
import { getLocalizedText } from "@/lib/localized";
import { STATUS_ICON_USAGE, ZONE_TONES } from "@/lib/status-icons";
import type { LeaderboardEntrySummary } from "@/types/leaderboard";
import type { AppLocale } from "@/types/app-locale";

function ui(locale: AppLocale, en: string, vi: string) {
  return getLocalizedText({ en, vi }, locale);
}

function getInitials(username: string) {
  const cleaned = username.replace(/^@+/, "").trim();

  if (!cleaned) {
    return "HL";
  }

  return cleaned.slice(0, 2).toUpperCase();
}

type LeaderboardRowProps = {
  entry: LeaderboardEntrySummary;
};

export default function LeaderboardRow({ entry }: LeaderboardRowProps) {
  const { locale } = useAppLocale();

  return (
    <div
      className={`grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 rounded-[1.6rem] border px-4 py-3 shadow-[0_12px_24px_rgba(47,92,51,0.06)] ${
        entry.isCurrentUser
          ? "border-accent bg-[#18261d] text-white"
          : entry.zoneStatus === "promotion"
            ? "border-accent/20 bg-success-soft text-foreground"
            : entry.zoneStatus === "demotion"
              ? "border-danger/15 bg-danger-soft/70 text-foreground"
              : "border-accent/10 bg-white text-foreground"
      }`}
    >
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-full text-base font-black ${
          entry.isCurrentUser
            ? "bg-white/15 text-white"
            : "bg-card-strong text-foreground"
        }`}
        aria-hidden="true"
      >
        {getInitials(entry.username)}
      </div>

      <div className="min-w-0">
        <div
          className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-[0.18em]"
          style={{
            backgroundColor: ZONE_TONES[entry.zoneStatus].background,
            borderColor: ZONE_TONES[entry.zoneStatus].border,
            color: ZONE_TONES[entry.zoneStatus].text,
          }}
        >
          <MaskedStatusIcon
            path={STATUS_ICON_USAGE.leaderboard.zones[entry.zoneStatus]}
            size={12}
            color={ZONE_TONES[entry.zoneStatus].accent}
          />
          {ui(locale, "Rank", "Hang")} {entry.rank}
        </div>
        <p className="truncate text-base font-extrabold">
          @{entry.username}
          {entry.isCurrentUser ? ` (${ui(locale, "You", "Ban")})` : ""}
        </p>
      </div>

      <div className="text-right">
        <p className="text-xs font-black uppercase tracking-[0.18em] opacity-70">
          {ui(locale, "Weekly XP", "XP tuan")}
        </p>
        <p className="font-display text-3xl">{entry.weeklyXp}</p>
      </div>
    </div>
  );
}
