import type { LeaderboardLeague } from "@/lib/constants/leaderboard";

export type AuthUser = {
  id: string;
  email: string;
  username: string;
  currentLeague: LeaderboardLeague;
  isDeveloper: boolean;
};
