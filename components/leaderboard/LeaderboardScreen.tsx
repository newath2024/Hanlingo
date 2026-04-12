"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import MaskedStatusIcon from "@/components/MaskedStatusIcon";
import LeaderboardRow from "@/components/leaderboard/LeaderboardRow";
import { useAppLocale } from "@/hooks/useAppLocale";
import { getLocalizedText } from "@/lib/localized";
import { LEAGUE_TONES, STATUS_ICON_USAGE, ZONE_TONES } from "@/lib/status-icons";
import type { AppLocale } from "@/types/app-locale";
import type {
  LeaderboardResponse,
  LeaderboardZoneStatus,
} from "@/types/leaderboard";

function ui(locale: AppLocale, en: string, vi: string) {
  return getLocalizedText({ en, vi }, locale);
}

function formatLeagueLabel(locale: AppLocale, league: string) {
  const label = `${league.charAt(0).toUpperCase()}${league.slice(1)}`;
  return ui(locale, `${label} League`, `Hạng ${label}`);
}

function formatLeagueBadgeLabel(locale: AppLocale, league: string) {
  const label = `${league.charAt(0).toUpperCase()}${league.slice(1)}`;
  return ui(locale, `${label} tier`, `Cấp ${label}`);
}

function formatTimeRemaining(locale: AppLocale, ms: number) {
  const totalHours = Math.max(0, Math.floor(ms / (60 * 60 * 1000)));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0) {
    return ui(locale, `${days}d ${hours}h left`, `Còn ${days} ngày ${hours} giờ`);
  }

  return ui(locale, `${hours}h left`, `Còn ${hours} giờ`);
}

function getZoneCopy(locale: AppLocale, zoneStatus: LeaderboardZoneStatus) {
  if (zoneStatus === "promotion") {
    return ui(locale, "You are in the promotion zone", "Bạn đang ở vùng thăng hạng");
  }

  if (zoneStatus === "demotion") {
    return ui(locale, "You are in the demotion zone", "Bạn đang ở vùng xuống hạng");
  }

  return ui(locale, "You are safe", "Bạn đang an toàn");
}

function getZoneLabel(locale: AppLocale, zoneStatus: LeaderboardZoneStatus) {
  if (zoneStatus === "promotion") {
    return ui(locale, "Promotion zone", "Vùng thăng hạng");
  }

  if (zoneStatus === "demotion") {
    return ui(locale, "Demotion zone", "Vùng xuống hạng");
  }

  return ui(locale, "Safe zone", "Vùng an toàn");
}

function getLowDataCopy(locale: AppLocale, participantCount: number) {
  if (participantCount <= 1) {
    return ui(
      locale,
      "You are the first participant in this group this week. The board is live now and will fill as more real users play.",
      "Bạn là người đầu tiên trong nhóm này tuần này. Bảng xếp hạng đã hoạt động và sẽ đầy dần khi có thêm người chơi thật.",
    );
  }

  return ui(
    locale,
    `${participantCount} real players are in this group so far. Promotion and demotion zones scale down automatically while the group is still small.`,
    `Hiện có ${participantCount} người chơi thật trong nhóm này. Vùng thăng hạng và xuống hạng sẽ tự động thu gọn khi nhóm còn nhỏ.`,
  );
}

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    throw new Error(json.error ?? "Request failed.");
  }

  return json;
}

export default function LeaderboardScreen() {
  const { locale } = useAppLocale();
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/leaderboard", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const json = await readJson<LeaderboardResponse>(response);

        if (!cancelled) {
          setData(json);
        }
      } catch (nextError) {
        if (!cancelled) {
          setData(null);
          setError(
            nextError instanceof Error ? nextError.message : "Unable to load leaderboard.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const entrySections = useMemo(() => {
    if (!data) {
      return [] as Array<{
        zoneStatus: LeaderboardZoneStatus;
        entries: LeaderboardResponse["entries"];
      }>;
    }

    const sections: Array<{
      zoneStatus: LeaderboardZoneStatus;
      entries: LeaderboardResponse["entries"];
    }> = [];

    for (const entry of data.entries) {
      const currentSection = sections.at(-1);

      if (!currentSection || currentSection.zoneStatus !== entry.zoneStatus) {
        sections.push({
          zoneStatus: entry.zoneStatus,
          entries: [entry],
        });
        continue;
      }

      currentSection.entries.push(entry);
    }

    return sections;
  }, [data]);

  if (isLoading) {
    return (
      <main className="shell-page">
        <section className="panel">
          <div className="lesson-card space-y-4 text-center">
            <span className="pill mx-auto bg-card-strong text-foreground">
              {ui(locale, "Leaderboard", "Bảng xếp hạng")}
            </span>
            <h1 className="font-display text-4xl text-foreground sm:text-5xl">
              {ui(locale, "Loading the current weekly board.", "Đang tải bảng xếp hạng tuần này.")}
            </h1>
            <p className="text-base font-bold text-muted-foreground">
              {ui(
                locale,
                "Checking the active week, your group, and the latest rank order.",
                "Đang kiểm tra tuần đang chạy, nhóm của bạn, và thứ tự xếp hạng mới nhất.",
              )}
            </p>
          </div>
        </section>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="shell-page">
        <section className="panel">
          <div className="lesson-card space-y-5 text-center">
            <span className="pill mx-auto bg-danger-soft text-danger">
              {ui(locale, "Leaderboard", "Bảng xếp hạng")}
            </span>
            <h1 className="font-display text-4xl text-foreground sm:text-5xl">
              {ui(locale, "Leaderboard could not load.", "Không thể tải bảng xếp hạng.")}
            </h1>
            <div className="feedback-incorrect">
              {error ?? ui(locale, "Unknown error.", "Lỗi không xác định.")}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link href="/leaderboard" className="primary-button w-full">
                {ui(locale, "Retry", "Thử lại")}
              </Link>
              <Link href="/" className="secondary-button w-full">
                {ui(locale, "Back to Learn", "Về Học")}
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="shell-page">
      <section className="panel overflow-hidden">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <span className="pill bg-accent text-white">
              {ui(locale, "Leaderboard", "Bảng xếp hạng")}
            </span>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-4xl leading-tight text-foreground sm:text-6xl">
                  {formatLeagueLabel(locale, data.league)}
                </h1>
                <span
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-black uppercase tracking-[0.14em]"
                  style={{
                    backgroundColor: LEAGUE_TONES[data.league].badgeBackground,
                    borderColor: LEAGUE_TONES[data.league].badgeBorder,
                    color: LEAGUE_TONES[data.league].badgeText,
                  }}
                >
                  <MaskedStatusIcon
                    path={STATUS_ICON_USAGE.leaderboard.leagueBadge}
                    size={18}
                    color={LEAGUE_TONES[data.league].accent}
                  />
                  {formatLeagueBadgeLabel(locale, data.league)}
                </span>
              </div>
              <p className="max-w-2xl text-lg font-bold text-muted-foreground">
                {ui(
                  locale,
                  `Group ${data.group.groupNumber} closes ${formatTimeRemaining(locale, data.meta.timeRemainingMs)}.`,
                  `Nhóm ${data.group.groupNumber} đóng sau ${formatTimeRemaining(locale, data.meta.timeRemainingMs)}.`,
                )}
              </p>
            </div>
          </div>

          <div className="w-full max-w-[380px] rounded-[2rem] bg-[#18261d] p-5 text-white shadow-[0_24px_64px_rgba(20,35,27,0.22)]">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-white/58">
              {ui(locale, "Current status", "Trạng thái hiện tại")}
            </p>
            <h2 className="mt-4 font-display text-4xl leading-tight text-white">
              {getZoneCopy(locale, data.currentUser.zoneStatus)}
            </h2>
            <span
              className="mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black uppercase tracking-[0.18em]"
              style={{
                backgroundColor: ZONE_TONES[data.currentUser.zoneStatus].background,
                borderColor: ZONE_TONES[data.currentUser.zoneStatus].border,
                color: ZONE_TONES[data.currentUser.zoneStatus].text,
              }}
            >
              <MaskedStatusIcon
                path={STATUS_ICON_USAGE.leaderboard.zones[data.currentUser.zoneStatus]}
                size={16}
                color={ZONE_TONES[data.currentUser.zoneStatus].accent}
              />
              {getZoneLabel(locale, data.currentUser.zoneStatus)}
            </span>
            <p className="mt-3 text-sm font-bold text-white/68">
              {data.currentUser.xpToNextRank === null
                ? ui(
                    locale,
                    "You are currently leading this group.",
                    "Bạn đang dẫn đầu nhóm này.",
                  )
                : ui(
                    locale,
                    `${data.currentUser.xpToNextRank} XP needed to overtake the next player.`,
                    `Còn ${data.currentUser.xpToNextRank} XP để vượt người đứng trên.`,
                  )}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.4rem] bg-white/10 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-white/58">
                  {ui(locale, "Rank", "Hạng")}
                </p>
                <p className="mt-2 font-display text-4xl text-white">{data.currentUser.rank}</p>
              </div>
              <div className="rounded-[1.4rem] bg-white/10 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-white/58">
                  {ui(locale, "Weekly XP", "XP tuần")}
                </p>
                <p className="mt-2 font-display text-4xl text-[#8ce052]">
                  {data.currentUser.weeklyXp}
                </p>
              </div>
              <div className="rounded-[1.4rem] bg-white/10 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-white/58">
                  {ui(locale, "Lessons", "Bài học")}
                </p>
                <p className="mt-2 text-2xl font-extrabold text-white">
                  {data.currentUser.lessonsCompleted}
                </p>
              </div>
              <div className="rounded-[1.4rem] bg-white/10 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-white/58">
                  {ui(locale, "Practice", "Luyện tập")}
                </p>
                <p className="mt-2 text-2xl font-extrabold text-white">
                  {data.currentUser.practicesCompleted}
                </p>
              </div>
            </div>
          </div>
        </div>

        {data.meta.totalParticipants < 10 ? (
          <div className="mt-6 rounded-[1.8rem] bg-card-soft px-5 py-4 text-base font-bold text-muted-foreground">
            {getLowDataCopy(locale, data.meta.totalParticipants)}
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div className="space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground">
                {ui(locale, "Weekly group", "Nhóm tuần này")}
              </p>
              <h2 className="mt-2 font-display text-3xl text-foreground">
                {ui(
                  locale,
                  "Promotion and demotion are marked directly in the list.",
                  "Vùng thăng hạng và xuống hạng được đánh dấu ngay trong danh sách.",
                )}
              </h2>
            </div>
            <span className="pill bg-card-strong text-foreground">
              {ui(
                locale,
                `${data.meta.totalParticipants} participants`,
                `${data.meta.totalParticipants} người tham gia`,
              )}
            </span>
          </div>

          <div className="space-y-4">
            {entrySections.map((section) => (
              <div key={section.zoneStatus} className="space-y-3">
                <div
                  className="flex items-center gap-3 rounded-[1.4rem] border px-4 py-3 text-sm font-black uppercase tracking-[0.18em]"
                  style={{
                    backgroundColor: ZONE_TONES[section.zoneStatus].background,
                    borderColor: ZONE_TONES[section.zoneStatus].border,
                    color: ZONE_TONES[section.zoneStatus].text,
                  }}
                >
                  <MaskedStatusIcon
                    path={STATUS_ICON_USAGE.leaderboard.zones[section.zoneStatus]}
                    size={18}
                    color={ZONE_TONES[section.zoneStatus].accent}
                  />
                  {getZoneLabel(locale, section.zoneStatus)}
                </div>

                <div className="space-y-3">
                  {section.entries.map((entry) => (
                    <LeaderboardRow key={entry.userId} entry={entry} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
