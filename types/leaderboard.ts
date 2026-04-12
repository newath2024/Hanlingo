import type {
  LeaderboardActivitySourceType,
  LeaderboardLeague,
  LeaderboardWeekStatus,
} from "@/lib/constants/leaderboard";

export type LeaderboardZoneStatus = "promotion" | "safe" | "demotion";

export type LeaderboardWeekSummary = {
  id: string;
  key: string;
  startsAt: string;
  endsAt: string;
  status: LeaderboardWeekStatus;
};

export type LeaderboardEntrySummary = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  rank: number;
  weeklyXp: number;
  lessonsCompleted: number;
  practicesCompleted: number;
  isCurrentUser: boolean;
  zoneStatus: LeaderboardZoneStatus;
};

export type LeaderboardResponse = {
  week: LeaderboardWeekSummary;
  league: LeaderboardLeague;
  group: {
    id: string;
    groupNumber: number;
    size: number;
  };
  currentUser: {
    userId: string;
    rank: number;
    weeklyXp: number;
    lessonsCompleted: number;
    practicesCompleted: number;
    zoneStatus: LeaderboardZoneStatus;
    isPromotionZone: boolean;
    isDemotionZone: boolean;
    xpToNextRank: number | null;
  };
  entries: LeaderboardEntrySummary[];
  zones: {
    promotionMaxRank: number;
    demotionMinRank: number | null;
  };
  meta: {
    timeRemainingMs: number;
    totalParticipants: number;
  };
};

export type LeaderboardSummaryResponse = {
  week: LeaderboardWeekSummary;
  league: LeaderboardLeague;
  currentUser: {
    userId: string;
    rank: number;
    weeklyXp: number;
    zoneStatus: LeaderboardZoneStatus;
    xpToNextRank: number | null;
  };
  meta: {
    timeRemainingMs: number;
    totalParticipants: number;
  };
};

export type AwardLeaderboardXpInput = {
  userId: string;
  sourceType: Extract<LeaderboardActivitySourceType, "lesson" | "practice">;
  sourceId: string;
  xpDelta?: number;
};
