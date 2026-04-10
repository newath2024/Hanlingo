import "server-only";

import { scheduleNextReview } from "@/lib/review";
import {
  createDefaultUserProgressState,
  getReviewForCard,
  getReviewKey,
  isUserProgressEmpty,
  sanitizeReviewMap,
  sanitizeUserProgressState,
  type ProgressState,
  type ReviewMap,
  type SentenceExposureMap,
  type UserProgressState,
} from "@/lib/progress-state";
import { WEAK_NODE_THRESHOLD } from "@/lib/session";
import {
  createProgressForUser,
  findProgressByUserId,
  type ProgressRecord,
  upsertProgressForUser,
} from "@/lib/server/data-store";

function fromProgressRecord(record: ProgressRecord): UserProgressState {
  if (!record) {
    return createDefaultUserProgressState();
  }

  return sanitizeUserProgressState({
    xp: record.xp,
    completedLessons: record.completedLessons,
    claimedStepRewards: record.claimedStepRewards,
    completedNodes: record.completedNodes,
    completedUnits: record.completedUnits,
    nodeRuns: record.nodeRuns,
    errorPatternMisses: record.errorPatternMisses,
    reviews: record.reviews,
    sentenceExposures: record.sentenceExposures,
    importedFromLocalAt: record.importedFromLocalAt?.toISOString() ?? null,
  });
}

function toProgressRecordInput(progress: UserProgressState) {
  return {
    xp: progress.xp,
    completedLessons: progress.completedLessons,
    claimedStepRewards: progress.claimedStepRewards,
    completedNodes: progress.completedNodes,
    completedUnits: progress.completedUnits,
    nodeRuns: progress.nodeRuns,
    errorPatternMisses: progress.errorPatternMisses,
    reviews: progress.reviews,
    sentenceExposures: progress.sentenceExposures,
    importedFromLocalAt: progress.importedFromLocalAt ? new Date(progress.importedFromLocalAt) : null,
  };
}

function uniquePush(list: string[], value: string) {
  return list.includes(value) ? list : [...list, value];
}

function mergeNumberMaps(baseMap: Record<string, number>, deltaMap: Record<string, number>) {
  return Object.entries(deltaMap).reduce<Record<string, number>>((nextMap, [key, delta]) => {
    if (!key.trim() || delta <= 0) {
      return nextMap;
    }

    nextMap[key] = (nextMap[key] ?? 0) + delta;
    return nextMap;
  }, { ...baseMap });
}

export async function ensureUserProgress(userId: string) {
  const existing = await findProgressByUserId(userId);

  if (existing) {
    return fromProgressRecord(existing);
  }

  const created = await createProgressForUser(userId);

  return fromProgressRecord(created);
}

export async function getUserProgress(userId: string) {
  const existing = await findProgressByUserId(userId);

  return existing ? fromProgressRecord(existing) : ensureUserProgress(userId);
}

export async function importLocalProgress(
  userId: string,
  data: {
    progress: ProgressState;
    reviews: ReviewMap;
    sentenceExposures: SentenceExposureMap;
  },
) {
  const existing = await getUserProgress(userId);

  if (existing.importedFromLocalAt || !isUserProgressEmpty(existing)) {
    return {
      progress: existing,
      imported: false,
    };
  }

  const nextProgress = sanitizeUserProgressState({
    ...data.progress,
    reviews: data.reviews,
    sentenceExposures: data.sentenceExposures,
    importedFromLocalAt: new Date().toISOString(),
  });

  const updated = await upsertProgressForUser(userId, toProgressRecordInput(nextProgress));

  return {
    progress: fromProgressRecord(updated),
    imported: true,
  };
}

export async function applySessionCompletion(
  userId: string,
  payload: {
    lessonId: string;
    nodeId: string;
    unitId: string;
    score: number;
    totalQuestions: number;
    awardedXp: number;
    completeUnit: boolean;
    errorPatternMisses: Record<string, number>;
    sentenceExposureDeltas: Record<string, number>;
  },
) {
  const currentProgress = await getUserProgress(userId);
  const currentNodeRun = currentProgress.nodeRuns[payload.nodeId] ?? {
    completed: false,
    lastScore: 0,
    bestScore: 0,
    weak: false,
    plays: 0,
  };
  const nextNodeRun = {
    completed: true,
    lastScore: payload.score,
    bestScore: Math.max(currentNodeRun.bestScore, payload.score),
    weak:
      payload.totalQuestions > 0
        ? payload.score / payload.totalQuestions < WEAK_NODE_THRESHOLD
        : false,
    plays: currentNodeRun.plays + 1,
  };
  const nodeCompletedNow = !currentProgress.completedNodes.includes(payload.nodeId);
  const unitCompletedNow =
    payload.completeUnit && !currentProgress.completedUnits.includes(payload.unitId);

  const nextProgress = sanitizeUserProgressState({
    ...currentProgress,
    xp: currentProgress.xp + payload.awardedXp,
    completedLessons: uniquePush(currentProgress.completedLessons, payload.lessonId),
    completedNodes: uniquePush(currentProgress.completedNodes, payload.nodeId),
    completedUnits: payload.completeUnit
      ? uniquePush(currentProgress.completedUnits, payload.unitId)
      : currentProgress.completedUnits,
    nodeRuns: {
      ...currentProgress.nodeRuns,
      [payload.nodeId]: nextNodeRun,
    },
    errorPatternMisses: mergeNumberMaps(
      currentProgress.errorPatternMisses,
      payload.errorPatternMisses,
    ),
    sentenceExposures: mergeNumberMaps(
      currentProgress.sentenceExposures,
      payload.sentenceExposureDeltas,
    ),
  });

  const updated = await upsertProgressForUser(userId, toProgressRecordInput(nextProgress));

  return {
    progress: fromProgressRecord(updated),
    nodeCompletedNow,
    unitCompletedNow,
  };
}

export async function saveReviewRating(
  userId: string,
  payload: {
    lessonId: string;
    word: string;
    rating: "again" | "good" | "easy";
  },
) {
  const currentProgress = await getUserProgress(userId);
  const currentReview = getReviewForCard(currentProgress.reviews, payload.lessonId, payload.word);
  const nextReview = scheduleNextReview(currentReview, payload.rating);
  const nextReviews = sanitizeReviewMap({
    ...currentProgress.reviews,
    [getReviewKey(payload.lessonId, payload.word)]: nextReview,
  });

  const updated = await upsertProgressForUser(
    userId,
    toProgressRecordInput({
      ...currentProgress,
      reviews: nextReviews,
    }),
  );

  return {
    progress: fromProgressRecord(updated),
    review: nextReview,
  };
}
