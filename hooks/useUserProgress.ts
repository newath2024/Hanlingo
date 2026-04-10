"use client";

import { useContext } from "react";
import { countDueReviews } from "@/lib/progress-state";
import { UserProgressContext } from "@/components/providers/UserProgressProvider";

export function useUserProgress() {
  const context = useContext(UserProgressContext);

  if (!context) {
    throw new Error("useUserProgress must be used inside UserProgressProvider.");
  }

  return {
    ...context,
    dueReviews(lessonId: string, words: string[], now = new Date()) {
      return countDueReviews(context.progress.reviews, lessonId, words, now);
    },
  };
}
