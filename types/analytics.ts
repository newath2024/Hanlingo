export type AnalyticsTrendDirection = "up" | "down" | "stable";

export type AccuracyTrend = {
  direction: AnalyticsTrendDirection;
  deltaPercent: number | null;
  label: string;
};

export type StreakTrend = {
  direction: AnalyticsTrendDirection;
  deltaDays: number | null;
  label: string;
};

export type AnalyticsOverviewResponse = {
  xp: number;
  lessonsCompleted: number;
  overallAccuracy: number;
  streakDays: number;
  totalAttempts: number;
  timeZoneUsed: string;
  accuracyTrend: AccuracyTrend;
  streakTrend: StreakTrend;
};
