export type ShellSidebarSummaryResponse = {
  streakDays: number;
  todayXp: number;
  timeZoneUsed: string;
  practice: {
    dueMistakeCount: number;
  };
  leaderboard: {
    rank: number | null;
  };
};
