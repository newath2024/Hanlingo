"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useUserProgress } from "@/hooks/useUserProgress";
import { countDueReviews, createDefaultUserProgressState } from "@/lib/progress-state";

export function useHanlingoSnapshot(lessonId: string, words: string[]) {
  const { progress, isLoading, error } = useUserProgress();
  const [snapshotTime] = useState(() => Date.now());

  const dueReviews = useMemo(
    () =>
      countDueReviews(progress.reviews, lessonId, words, new Date(snapshotTime)),
    [lessonId, progress.reviews, snapshotTime, words],
  );

  return {
    progress,
    dueReviews,
    isLoading,
    error,
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

export const defaultUserProgress = createDefaultUserProgressState();
