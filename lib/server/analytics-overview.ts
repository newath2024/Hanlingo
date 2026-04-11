import "server-only";

import { getUserErrorHeatmap } from "@/lib/server/error-heatmap";
import { listUserQuestionAttempts } from "@/lib/server/data-store";
import { getUserProgress } from "@/lib/server/progress";
import type {
  AccuracyTrend,
  AnalyticsOverviewResponse,
  AnalyticsTrendDirection,
  StreakTrend,
} from "@/types/analytics";

function resolveTimeZone(timeZone?: string) {
  if (!timeZone) {
    return "UTC";
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
}

function formatDayKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

function getPreviousDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map((value) => Number(value));
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() - 1);
  return utcDate.toISOString().slice(0, 10);
}

function getLearningStreak(dayKeys: string[], timeZone: string, now = new Date()) {
  if (dayKeys.length === 0) {
    return 0;
  }

  const uniqueDayKeys = [...new Set(dayKeys)].sort();
  const latestDayKey = uniqueDayKeys[uniqueDayKeys.length - 1];
  const todayKey = formatDayKey(now, timeZone);
  const yesterdayKey = getPreviousDayKey(todayKey);

  if (latestDayKey !== todayKey && latestDayKey !== yesterdayKey) {
    return 0;
  }

  const dayKeySet = new Set(uniqueDayKeys);
  let streakDays = 1;
  let cursor = latestDayKey;

  while (dayKeySet.has(getPreviousDayKey(cursor))) {
    cursor = getPreviousDayKey(cursor);
    streakDays += 1;
  }

  return streakDays;
}

function roundToTenths(value: number) {
  return Math.round(value * 10) / 10;
}

function pluralizeDayLabel(count: number) {
  return count === 1 ? "day" : "days";
}

function getTrendDirection(delta: number): AnalyticsTrendDirection {
  if (delta > 0) {
    return "up";
  }

  if (delta < 0) {
    return "down";
  }

  return "stable";
}

function buildAttemptStatsByDay(
  attempts: Awaited<ReturnType<typeof listUserQuestionAttempts>>,
  timeZone: string,
) {
  const statsByDay = new Map<string, { total: number; correct: number }>();

  for (const attempt of attempts) {
    const dayKey = formatDayKey(attempt.createdAt, timeZone);
    const current = statsByDay.get(dayKey) ?? { total: 0, correct: 0 };
    current.total += 1;
    current.correct += attempt.wasCorrect ? 1 : 0;
    statsByDay.set(dayKey, current);
  }

  return statsByDay;
}

function buildAccuracyTrend(
  statsByDay: Map<string, { total: number; correct: number }>,
  todayKey: string,
): AccuracyTrend {
  const yesterdayKey = getPreviousDayKey(todayKey);
  const todayStats = statsByDay.get(todayKey);
  const yesterdayStats = statsByDay.get(yesterdayKey);

  if (!todayStats?.total && !yesterdayStats?.total) {
    return {
      direction: "stable",
      deltaPercent: null,
      label: "First active day",
    };
  }

  if (!todayStats?.total) {
    return {
      direction: "stable",
      deltaPercent: null,
      label: "No answers yet today",
    };
  }

  if (!yesterdayStats?.total) {
    return {
      direction: "stable",
      deltaPercent: null,
      label: "First active day",
    };
  }

  const todayAccuracy = todayStats.correct / todayStats.total;
  const yesterdayAccuracy = yesterdayStats.correct / yesterdayStats.total;
  const deltaPercent = roundToTenths((todayAccuracy - yesterdayAccuracy) * 100);

  if (Math.abs(deltaPercent) < 0.1) {
    return {
      direction: "stable",
      deltaPercent: 0,
      label: "Same accuracy as yesterday",
    };
  }

  return {
    direction: getTrendDirection(deltaPercent),
    deltaPercent,
    label: `${deltaPercent > 0 ? "+" : ""}${deltaPercent}% from yesterday`,
  };
}

function buildStreakTrend(dayKeys: string[], timeZone: string, now = new Date()): StreakTrend {
  const uniqueDayKeys = [...new Set(dayKeys)].sort();
  const dayKeySet = new Set(uniqueDayKeys);
  const todayKey = formatDayKey(now, timeZone);
  const yesterdayKey = getPreviousDayKey(todayKey);
  const streakDays = getLearningStreak(uniqueDayKeys, timeZone, now);
  const yesterdayReference = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStreak = getLearningStreak(uniqueDayKeys, timeZone, yesterdayReference);
  const hasTodayActivity = dayKeySet.has(todayKey);
  const hasYesterdayActivity = dayKeySet.has(yesterdayKey);

  if (!uniqueDayKeys.length || streakDays === 0) {
    return {
      direction: "stable",
      deltaDays: null,
      label: "Start a streak today",
    };
  }

  if (!hasTodayActivity) {
    return {
      direction: "stable",
      deltaDays: null,
      label: "Keep it alive today",
    };
  }

  if (!hasYesterdayActivity) {
    return {
      direction: "stable",
      deltaDays: null,
      label: "Streak starts today",
    };
  }

  const deltaDays = streakDays - yesterdayStreak;

  if (deltaDays === 0) {
    return {
      direction: "stable",
      deltaDays: 0,
      label: "Same streak as yesterday",
    };
  }

  return {
    direction: getTrendDirection(deltaDays),
    deltaDays,
    label: `${deltaDays > 0 ? "+" : ""}${deltaDays} ${pluralizeDayLabel(Math.abs(deltaDays))} vs yesterday`,
  };
}

export async function getAnalyticsOverview(
  userId: string,
  timeZone?: string,
): Promise<AnalyticsOverviewResponse> {
  const timeZoneUsed = resolveTimeZone(timeZone);
  const [progress, attempts, heatmap] = await Promise.all([
    getUserProgress(userId),
    listUserQuestionAttempts(userId),
    getUserErrorHeatmap(userId, { limit: 6 }),
  ]);
  const attemptDayKeys = attempts.map((attempt) => formatDayKey(attempt.createdAt, timeZoneUsed));
  const todayKey = formatDayKey(new Date(), timeZoneUsed);
  const attemptStatsByDay = buildAttemptStatsByDay(attempts, timeZoneUsed);

  return {
    xp: progress.xp,
    lessonsCompleted: progress.completedNodes.length,
    overallAccuracy: heatmap.summary.overallAccuracy,
    streakDays: getLearningStreak(attemptDayKeys, timeZoneUsed),
    totalAttempts: attempts.length,
    timeZoneUsed,
    accuracyTrend: buildAccuracyTrend(attemptStatsByDay, todayKey),
    streakTrend: buildStreakTrend(attemptDayKeys, timeZoneUsed),
  };
}
