import "server-only";

import { getUserErrorHeatmap } from "@/lib/server/error-heatmap";
import { listDueUserErrors } from "@/lib/server/data-store";
import type { PracticeOverviewResponse } from "@/types/practice-overview";

const PRACTICE_OVERVIEW_DUE_LIMIT = 500;

export async function getPracticeOverview(userId: string): Promise<PracticeOverviewResponse> {
  const [dueErrors, heatmap] = await Promise.all([
    listDueUserErrors(userId, new Date(), PRACTICE_OVERVIEW_DUE_LIMIT),
    getUserErrorHeatmap(userId, { limit: 6 }),
  ]);

  return {
    dueMistakeCount: dueErrors.length,
    weakLessons: heatmap.summary.mostMissedLessons.slice(0, 3),
    weakSkills: heatmap.summary.mostMissedSkills.slice(0, 3),
    totalWrong: heatmap.summary.totalWrong,
    overallAccuracy: heatmap.summary.overallAccuracy,
  };
}
