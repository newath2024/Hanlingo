import { getDefaultReviewState, type ReviewState } from "@/lib/review";
import type { NodeProgress } from "@/types/unit";

export type ProgressState = {
  xp: number;
  completedLessons: string[];
  claimedStepRewards: string[];
  completedNodes: string[];
  completedUnits: string[];
  pathVersions: Record<string, number>;
  nodeRuns: Record<string, NodeProgress>;
  errorPatternMisses: Record<string, number>;
};

export type ReviewMap = Record<string, ReviewState>;
export type SentenceExposureMap = Record<string, number>;

export type UserProgressState = ProgressState & {
  reviews: ReviewMap;
  sentenceExposures: SentenceExposureMap;
  importedFromLocalAt: string | null;
};

export const DEFAULT_PROGRESS_STATE: ProgressState = {
  xp: 0,
  completedLessons: [],
  claimedStepRewards: [],
  completedNodes: [],
  completedUnits: [],
  pathVersions: {},
  nodeRuns: {},
  errorPatternMisses: {},
};

export function createDefaultUserProgressState(): UserProgressState {
  return {
    ...DEFAULT_PROGRESS_STATE,
    reviews: {},
    sentenceExposures: {},
    importedFromLocalAt: null,
  };
}

function toUniqueStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function sanitizeNodeProgressMap(value: unknown): Record<string, NodeProgress> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, NodeProgress>>((nextMap, [key, rawRun]) => {
    if (!key.trim() || !rawRun || typeof rawRun !== "object" || Array.isArray(rawRun)) {
      return nextMap;
    }

    const candidate = rawRun as Partial<NodeProgress>;

    nextMap[key] = {
      completed: Boolean(candidate.completed),
      lastScore: typeof candidate.lastScore === "number" ? candidate.lastScore : 0,
      bestScore: typeof candidate.bestScore === "number" ? candidate.bestScore : 0,
      weak: Boolean(candidate.weak),
      plays: typeof candidate.plays === "number" ? candidate.plays : 0,
    };

    return nextMap;
  }, {});
}

function sanitizeNumberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, number>>((nextMap, [key, rawValue]) => {
    if (!key.trim() || typeof rawValue !== "number" || Number.isNaN(rawValue)) {
      return nextMap;
    }

    nextMap[key] = rawValue;
    return nextMap;
  }, {});
}

export function sanitizeProgressState(value: unknown): ProgressState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_PROGRESS_STATE };
  }

  const candidate = value as Partial<ProgressState>;

  return {
    xp: typeof candidate.xp === "number" ? candidate.xp : 0,
    completedLessons: toUniqueStringArray(candidate.completedLessons),
    claimedStepRewards: toUniqueStringArray(candidate.claimedStepRewards),
    completedNodes: toUniqueStringArray(candidate.completedNodes),
    completedUnits: toUniqueStringArray(candidate.completedUnits),
    pathVersions: sanitizeNumberRecord(candidate.pathVersions),
    nodeRuns: sanitizeNodeProgressMap(candidate.nodeRuns),
    errorPatternMisses: sanitizeNumberRecord(candidate.errorPatternMisses),
  };
}

export function sanitizeReviewMap(value: unknown): ReviewMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce<ReviewMap>((nextMap, [key, rawValue]) => {
    if (!key.trim() || !rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
      return nextMap;
    }

    const candidate = rawValue as Partial<ReviewState>;
    const fallback = getDefaultReviewState(new Date());

    nextMap[key] = {
      repetition: typeof candidate.repetition === "number" ? candidate.repetition : fallback.repetition,
      interval: typeof candidate.interval === "number" ? candidate.interval : fallback.interval,
      easeFactor:
        typeof candidate.easeFactor === "number" ? candidate.easeFactor : fallback.easeFactor,
      dueAt: typeof candidate.dueAt === "string" ? candidate.dueAt : fallback.dueAt,
      lastReviewedAt:
        typeof candidate.lastReviewedAt === "string"
          ? candidate.lastReviewedAt
          : fallback.lastReviewedAt,
    };

    return nextMap;
  }, {});
}

export function sanitizeSentenceExposureMap(value: unknown): SentenceExposureMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce<SentenceExposureMap>((nextMap, [key, rawValue]) => {
    if (!key.trim() || typeof rawValue !== "number" || Number.isNaN(rawValue)) {
      return nextMap;
    }

    nextMap[key] = rawValue > 0 ? rawValue : 0;
    return nextMap;
  }, {});
}

export function sanitizeUserProgressState(value: unknown): UserProgressState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createDefaultUserProgressState();
  }

  const candidate = value as Partial<UserProgressState>;
  const progress = sanitizeProgressState(candidate);

  return {
    ...progress,
    reviews: sanitizeReviewMap(candidate.reviews),
    sentenceExposures: sanitizeSentenceExposureMap(candidate.sentenceExposures),
    importedFromLocalAt:
      typeof candidate.importedFromLocalAt === "string" ? candidate.importedFromLocalAt : null,
  };
}

export function isUserProgressEmpty(progress: UserProgressState) {
  return (
    progress.xp === 0 &&
    progress.completedLessons.length === 0 &&
    progress.claimedStepRewards.length === 0 &&
    progress.completedNodes.length === 0 &&
    progress.completedUnits.length === 0 &&
    Object.keys(progress.nodeRuns).length === 0 &&
    Object.keys(progress.errorPatternMisses).length === 0 &&
    Object.keys(progress.reviews).length === 0 &&
    Object.keys(progress.sentenceExposures).length === 0
  );
}

export function getReviewKey(lessonId: string, word: string) {
  return `${lessonId}:${word}`;
}

export function getStepRewardKey(lessonId: string, stepId: string) {
  return `${lessonId}:${stepId}`;
}

export function getReviewForCard(reviews: ReviewMap, lessonId: string, word: string) {
  return reviews[getReviewKey(lessonId, word)];
}

function findReviewForWord(reviews: ReviewMap, word: string) {
  const directEntry = Object.entries(reviews).find(([key]) => key.endsWith(`:${word}`));
  return directEntry?.[1];
}

export function countDueReviews(
  reviews: ReviewMap,
  lessonId: string,
  words: string[],
  now = new Date(),
) {
  return words.filter((word) => {
    const review =
      getReviewForCard(reviews, lessonId, word) ??
      findReviewForWord(reviews, word) ??
      getDefaultReviewState(now);
    return new Date(review.dueAt).getTime() <= now.getTime();
  }).length;
}
