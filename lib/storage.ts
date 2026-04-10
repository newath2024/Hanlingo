import { getDefaultReviewState, type ReviewState } from "@/lib/review";
import type { AppLocale } from "@/types/app-locale";
import type { NodeProgress } from "@/types/unit";

export const PROGRESS_STORAGE_KEY = "hanlingo-progress";
export const REVIEW_STORAGE_KEY = "hanlingo-reviews";
export const APP_LOCALE_STORAGE_KEY = "hanlingo-locale";
export const SENTENCE_EXPOSURE_STORAGE_KEY = "hanlingo-sentence-exposures";
export const DEFAULT_APP_LOCALE: AppLocale = "en";
const STORAGE_EVENT_NAME = "hanlingo-storage-change";

export type ProgressState = {
  xp: number;
  completedLessons: string[];
  claimedStepRewards: string[];
  completedNodes: string[];
  completedUnits: string[];
  nodeRuns: Record<string, NodeProgress>;
  errorPatternMisses: Record<string, number>;
};

export type ReviewMap = Record<string, ReviewState>;
export type SentenceExposureMap = Record<string, number>;

const DEFAULT_PROGRESS: ProgressState = {
  xp: 0,
  completedLessons: [],
  claimedStepRewards: [],
  completedNodes: [],
  completedUnits: [],
  nodeRuns: {},
  errorPatternMisses: {},
};

function isBrowser() {
  return typeof window !== "undefined";
}

function readStorage<T>(key: string, fallback: T): T {
  if (!isBrowser()) {
    return fallback;
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? (JSON.parse(rawValue) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(STORAGE_EVENT_NAME));
}

function normalizeAppLocale(value: unknown): AppLocale {
  return value === "vi" ? "vi" : DEFAULT_APP_LOCALE;
}

export function subscribeToHanlingoStorage(callback: () => void) {
  if (!isBrowser()) {
    return () => undefined;
  }

  const listener = () => {
    callback();
  };

  window.addEventListener("storage", listener);
  window.addEventListener(STORAGE_EVENT_NAME, listener);

  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(STORAGE_EVENT_NAME, listener);
  };
}

export function loadProgress(): ProgressState {
  const progress = readStorage<ProgressState>(PROGRESS_STORAGE_KEY, DEFAULT_PROGRESS);

  return {
    xp: typeof progress.xp === "number" ? progress.xp : 0,
    completedLessons: Array.isArray(progress.completedLessons)
      ? progress.completedLessons
      : [],
    claimedStepRewards: Array.isArray(progress.claimedStepRewards)
      ? progress.claimedStepRewards
      : [],
    completedNodes: Array.isArray(progress.completedNodes)
      ? progress.completedNodes
      : [],
    completedUnits: Array.isArray(progress.completedUnits)
      ? progress.completedUnits
      : [],
    nodeRuns:
      progress.nodeRuns && typeof progress.nodeRuns === "object"
        ? (progress.nodeRuns as Record<string, NodeProgress>)
        : {},
    errorPatternMisses:
      progress.errorPatternMisses && typeof progress.errorPatternMisses === "object"
        ? (progress.errorPatternMisses as Record<string, number>)
        : {},
  };
}

export function loadAppLocale() {
  return normalizeAppLocale(readStorage<AppLocale>(APP_LOCALE_STORAGE_KEY, DEFAULT_APP_LOCALE));
}

export function saveAppLocale(locale: AppLocale) {
  writeStorage(APP_LOCALE_STORAGE_KEY, normalizeAppLocale(locale));
}

export function saveProgress(progress: ProgressState) {
  writeStorage(PROGRESS_STORAGE_KEY, progress);
}

export function loadSentenceExposures(): SentenceExposureMap {
  const exposureMap = readStorage<SentenceExposureMap>(SENTENCE_EXPOSURE_STORAGE_KEY, {});

  return Object.entries(exposureMap).reduce<SentenceExposureMap>((nextMap, [key, value]) => {
    if (!key.trim()) {
      return nextMap;
    }

    nextMap[key] = typeof value === "number" && value > 0 ? value : 0;
    return nextMap;
  }, {});
}

export function getSentenceSeenCount(sentenceKey: string) {
  if (!sentenceKey.trim()) {
    return 0;
  }

  return loadSentenceExposures()[sentenceKey] ?? 0;
}

export function saveSentenceExposures(exposures: SentenceExposureMap) {
  writeStorage(SENTENCE_EXPOSURE_STORAGE_KEY, exposures);
}

export function recordSentenceExposure(sentenceKey: string) {
  if (!sentenceKey.trim()) {
    return {
      exposures: loadSentenceExposures(),
      nextCount: 0,
    };
  }

  const exposures = loadSentenceExposures();
  const nextCount = (exposures[sentenceKey] ?? 0) + 1;
  const nextExposures = {
    ...exposures,
    [sentenceKey]: nextCount,
  };

  saveSentenceExposures(nextExposures);

  return {
    exposures: nextExposures,
    nextCount,
  };
}

export function isLessonCompleted(lessonId: string) {
  return loadProgress().completedLessons.includes(lessonId);
}

export function isNodeCompleted(nodeId: string) {
  return loadProgress().completedNodes.includes(nodeId);
}

export function isUnitCompleted(unitId: string) {
  return loadProgress().completedUnits.includes(unitId);
}

export function completeLesson(lessonId: string) {
  const progress = loadProgress();

  if (progress.completedLessons.includes(lessonId)) {
    return {
      progress,
      completedNow: false,
    };
  }

  const updatedProgress = {
    ...progress,
    completedLessons: [...progress.completedLessons, lessonId],
  };

  saveProgress(updatedProgress);

  return {
    progress: updatedProgress,
    completedNow: true,
  };
}

export function saveNodeRun(
  nodeId: string,
  score: number,
  totalQuestions: number,
  weakThreshold = 0.6,
) {
  const progress = loadProgress();
  const previousRun = progress.nodeRuns[nodeId] ?? {
    completed: false,
    lastScore: 0,
    bestScore: 0,
    weak: false,
    plays: 0,
  };
  const weak = totalQuestions > 0 ? score / totalQuestions < weakThreshold : false;
  const nextRun: NodeProgress = {
    completed: true,
    lastScore: score,
    bestScore: Math.max(previousRun.bestScore, score),
    weak,
    plays: previousRun.plays + 1,
  };
  const completedNow = !progress.completedNodes.includes(nodeId);
  const updatedProgress = {
    ...progress,
    completedNodes: completedNow
      ? [...progress.completedNodes, nodeId]
      : progress.completedNodes,
    nodeRuns: {
      ...progress.nodeRuns,
      [nodeId]: nextRun,
    },
  };

  saveProgress(updatedProgress);

  return {
    progress: updatedProgress,
    run: nextRun,
    completedNow,
  };
}

export function completeUnit(unitId: string) {
  const progress = loadProgress();

  if (progress.completedUnits.includes(unitId)) {
    return {
      progress,
      completedNow: false,
    };
  }

  const updatedProgress = {
    ...progress,
    completedUnits: [...progress.completedUnits, unitId],
  };

  saveProgress(updatedProgress);

  return {
    progress: updatedProgress,
    completedNow: true,
  };
}

export function addXp(amount: number) {
  if (amount <= 0) {
    return {
      progress: loadProgress(),
      awardedXp: 0,
    };
  }

  const progress = loadProgress();
  const updatedProgress = {
    ...progress,
    xp: progress.xp + amount,
  };

  saveProgress(updatedProgress);

  return {
    progress: updatedProgress,
    awardedXp: amount,
  };
}

export function recordErrorPatternMiss(errorPatternKey: string) {
  if (!errorPatternKey.trim()) {
    return {
      progress: loadProgress(),
      nextCount: 0,
    };
  }

  const progress = loadProgress();
  const nextCount = (progress.errorPatternMisses[errorPatternKey] ?? 0) + 1;
  const updatedProgress = {
    ...progress,
    errorPatternMisses: {
      ...progress.errorPatternMisses,
      [errorPatternKey]: nextCount,
    },
  };

  saveProgress(updatedProgress);

  return {
    progress: updatedProgress,
    nextCount,
  };
}

export function getStepRewardKey(lessonId: string, stepId: string) {
  return `${lessonId}:${stepId}`;
}

export function claimStepReward(
  lessonId: string,
  stepId: string,
  xpReward = 5,
) {
  const progress = loadProgress();
  const rewardKey = getStepRewardKey(lessonId, stepId);

  if (progress.claimedStepRewards.includes(rewardKey)) {
    return {
      progress,
      awardedXp: 0,
      rewardAlreadyClaimed: true,
    };
  }

  const updatedProgress = {
    ...progress,
    xp: progress.xp + xpReward,
    claimedStepRewards: [...progress.claimedStepRewards, rewardKey],
  };

  saveProgress(updatedProgress);

  return {
    progress: updatedProgress,
    awardedXp: xpReward,
    rewardAlreadyClaimed: false,
  };
}

export function loadReviews(): ReviewMap {
  return readStorage<ReviewMap>(REVIEW_STORAGE_KEY, {});
}

export function getReviewKey(lessonId: string, word: string) {
  return `${lessonId}:${word}`;
}

export function getReviewForCard(lessonId: string, word: string) {
  return loadReviews()[getReviewKey(lessonId, word)];
}

export function saveReviewForCard(
  lessonId: string,
  word: string,
  review: ReviewState,
) {
  const reviews = loadReviews();
  const nextReviews = {
    ...reviews,
    [getReviewKey(lessonId, word)]: review,
  };

  writeStorage(REVIEW_STORAGE_KEY, nextReviews);

  return nextReviews;
}

export function countDueReviews(lessonId: string, words: string[], now = new Date()) {
  const reviews = loadReviews();

  return words.filter((word) => {
    const review = reviews[getReviewKey(lessonId, word)] ?? getDefaultReviewState(now);
    return new Date(review.dueAt).getTime() <= now.getTime();
  }).length;
}
