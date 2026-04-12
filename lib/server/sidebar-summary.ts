import "server-only";

import { getLearningStreak, formatDayKey, resolveTimeZone } from "@/lib/server/activity-day";
import {
  listDueUserErrors,
  listLeaderboardActivitiesByUser,
  listUserQuestionAttempts,
} from "@/lib/server/data-store";
import { getLeaderboardSummary } from "@/lib/server/leaderboard";
import type { ShellSidebarSummaryResponse } from "@/types/shell-sidebar";

const SIDEBAR_DUE_MISTAKE_LIMIT = 500;

function getTodayXp(
  activities: Awaited<ReturnType<typeof listLeaderboardActivitiesByUser>>,
  timeZone: string,
  now = new Date(),
) {
  const todayKey = formatDayKey(now, timeZone);

  return activities.reduce((total, activity) => {
    if (formatDayKey(activity.createdAt, timeZone) !== todayKey) {
      return total;
    }

    return total + activity.xpDelta;
  }, 0);
}

export async function getShellSidebarSummary(
  userId: string,
  timeZone?: string,
): Promise<ShellSidebarSummaryResponse> {
  const timeZoneUsed = resolveTimeZone(timeZone);
  const now = new Date();

  const [attempts, dueErrors, leaderboardSummary, activities] = await Promise.all([
    listUserQuestionAttempts(userId),
    listDueUserErrors(userId, now, SIDEBAR_DUE_MISTAKE_LIMIT),
    getLeaderboardSummary(userId),
    listLeaderboardActivitiesByUser(userId),
  ]);
  const attemptDayKeys = attempts.map((attempt) => formatDayKey(attempt.createdAt, timeZoneUsed));

  return {
    streakDays: getLearningStreak(attemptDayKeys, timeZoneUsed, now),
    todayXp: getTodayXp(activities, timeZoneUsed, now),
    timeZoneUsed,
    practice: {
      dueMistakeCount: dueErrors.length,
    },
    leaderboard: {
      rank: leaderboardSummary.currentUser.rank,
    },
  };
}
