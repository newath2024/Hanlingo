export const LEADERBOARD_LEAGUES = [
  "bronze",
  "silver",
  "gold",
  "sapphire",
  "ruby",
  "emerald",
  "amethyst",
  "pearl",
  "obsidian",
  "diamond",
] as const;

export const LEADERBOARD_WEEK_STATUSES = ["active", "closed"] as const;

export const LEADERBOARD_ACTIVITY_SOURCE_TYPES = [
  "lesson",
  "practice",
  "review",
  "bonus",
] as const;

export type LeaderboardLeague = (typeof LEADERBOARD_LEAGUES)[number];
export type LeaderboardWeekStatus = (typeof LEADERBOARD_WEEK_STATUSES)[number];
export type LeaderboardActivitySourceType =
  (typeof LEADERBOARD_ACTIVITY_SOURCE_TYPES)[number];

export const DEFAULT_LEADERBOARD_LEAGUE: LeaderboardLeague = "bronze";
export const LEADERBOARD_TARGET_GROUP_SIZE = 30;
export const LEADERBOARD_WEEK_DURATION_DAYS = 7;
export const LEADERBOARD_WEEK_DURATION_MS =
  LEADERBOARD_WEEK_DURATION_DAYS * 24 * 60 * 60 * 1000;

export const LEADERBOARD_XP_REWARDS = {
  lesson: 10,
  practice: 8,
} as const;

export function isLeaderboardLeague(value: string): value is LeaderboardLeague {
  return LEADERBOARD_LEAGUES.includes(value as LeaderboardLeague);
}

export function getLeaderboardMovementCounts(participantCount: number) {
  if (participantCount <= 2) {
    return {
      promotionCount: 0,
      demotionCount: 0,
    };
  }

  if (participantCount <= 7) {
    return {
      promotionCount: 1,
      demotionCount: 1,
    };
  }

  if (participantCount <= 14) {
    return {
      promotionCount: 2,
      demotionCount: 2,
    };
  }

  if (participantCount <= 21) {
    return {
      promotionCount: 3,
      demotionCount: 3,
    };
  }

  return {
    promotionCount: 4,
    demotionCount: 5,
  };
}

export function getPromotedLeague(league: LeaderboardLeague) {
  const index = LEADERBOARD_LEAGUES.indexOf(league);
  return LEADERBOARD_LEAGUES[Math.min(index + 1, LEADERBOARD_LEAGUES.length - 1)];
}

export function getDemotedLeague(league: LeaderboardLeague) {
  const index = LEADERBOARD_LEAGUES.indexOf(league);
  return LEADERBOARD_LEAGUES[Math.max(index - 1, 0)];
}
