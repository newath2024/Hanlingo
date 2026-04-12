import "server-only";

const FALLBACK_TIME_ZONE = "UTC";

export function resolveTimeZone(timeZone?: string) {
  if (!timeZone) {
    return FALLBACK_TIME_ZONE;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

export function formatDayKey(date: Date, timeZone: string) {
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

export function getPreviousDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map((value) => Number(value));
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() - 1);
  return utcDate.toISOString().slice(0, 10);
}

export function getLearningStreak(dayKeys: string[], timeZone: string, now = new Date()) {
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
