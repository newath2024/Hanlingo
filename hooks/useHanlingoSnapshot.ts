"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  PROGRESS_STORAGE_KEY,
  REVIEW_STORAGE_KEY,
  getReviewKey,
  subscribeToHanlingoStorage,
  type ProgressState,
  type ReviewMap,
} from "@/lib/storage";
import { getDefaultReviewState } from "@/lib/review";

const defaultProgress: ProgressState = {
  xp: 0,
  completedLessons: [],
  claimedStepRewards: [],
  completedNodes: [],
  completedUnits: [],
  nodeRuns: {},
  errorPatternMisses: {},
};

const DEFAULT_PROGRESS_RAW = JSON.stringify(defaultProgress);
const DEFAULT_REVIEWS_RAW = "{}";

function getRawStorageSnapshot(key: string, fallback: string) {
  if (typeof window === "undefined") {
    return fallback;
  }

  return window.localStorage.getItem(key) ?? fallback;
}

function parseProgress(rawProgress: string): ProgressState {
  try {
    const parsed = JSON.parse(rawProgress) as Partial<ProgressState>;

    return {
      xp: typeof parsed.xp === "number" ? parsed.xp : 0,
      completedLessons: Array.isArray(parsed.completedLessons)
        ? parsed.completedLessons
        : [],
      claimedStepRewards: Array.isArray(parsed.claimedStepRewards)
        ? parsed.claimedStepRewards
        : [],
      completedNodes: Array.isArray(parsed.completedNodes)
        ? parsed.completedNodes
        : [],
      completedUnits: Array.isArray(parsed.completedUnits)
        ? parsed.completedUnits
        : [],
      nodeRuns:
        parsed.nodeRuns && typeof parsed.nodeRuns === "object"
          ? parsed.nodeRuns
          : {},
      errorPatternMisses:
        parsed.errorPatternMisses && typeof parsed.errorPatternMisses === "object"
          ? parsed.errorPatternMisses
          : {},
    };
  } catch {
    return defaultProgress;
  }
}

function parseReviews(rawReviews: string): ReviewMap {
  try {
    return JSON.parse(rawReviews) as ReviewMap;
  } catch {
    return {};
  }
}

export function useHanlingoSnapshot(lessonId: string, words: string[]) {
  const [snapshotTime] = useState(() => Date.now());
  const progressRaw = useSyncExternalStore(
    subscribeToHanlingoStorage,
    () => getRawStorageSnapshot(PROGRESS_STORAGE_KEY, DEFAULT_PROGRESS_RAW),
    () => DEFAULT_PROGRESS_RAW,
  );

  const reviewsRaw = useSyncExternalStore(
    subscribeToHanlingoStorage,
    () => getRawStorageSnapshot(REVIEW_STORAGE_KEY, DEFAULT_REVIEWS_RAW),
    () => DEFAULT_REVIEWS_RAW,
  );

  const progress = useMemo(() => parseProgress(progressRaw), [progressRaw]);
  const reviews = useMemo(() => parseReviews(reviewsRaw), [reviewsRaw]);

  const dueReviews = useMemo(
    () =>
      words.filter((word) => {
        const review =
          reviews[getReviewKey(lessonId, word)] ??
          getDefaultReviewState(new Date(snapshotTime));

        return new Date(review.dueAt).getTime() <= snapshotTime;
      }).length,
    [lessonId, reviews, snapshotTime, words],
  );

  return {
    progress,
    dueReviews,
  };
}

export function useSpeechRecognitionSupport() {
  return useSyncExternalStore(
    () => () => undefined,
    () => {
      if (typeof window === "undefined") {
        return false;
      }

      const speechWindow = window as Window & {
        SpeechRecognition?: unknown;
        webkitSpeechRecognition?: unknown;
      };

      return Boolean(
        speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition,
      );
    },
    () => false,
  );
}
