import type { UserErrorHeatmapEntry } from "@/types/error-heatmap";

export type PracticeOverviewResponse = {
  dueMistakeCount: number;
  weakLessons: UserErrorHeatmapEntry[];
  weakSkills: UserErrorHeatmapEntry[];
  totalWrong: number;
  overallAccuracy: number;
};
