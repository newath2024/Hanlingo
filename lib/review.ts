export type ReviewRating = "again" | "good" | "easy";

export type ReviewState = {
  repetition: number;
  interval: number;
  easeFactor: number;
  dueAt: string;
  lastReviewedAt: string;
};

const DEFAULT_EASE_FACTOR = 2.5;

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function getDefaultReviewState(now = new Date()): ReviewState {
  return {
    repetition: 0,
    interval: 0,
    easeFactor: DEFAULT_EASE_FACTOR,
    dueAt: now.toISOString(),
    lastReviewedAt: now.toISOString(),
  };
}

export function scheduleNextReview(
  existingReview: ReviewState | undefined,
  rating: ReviewRating,
  now = new Date(),
): ReviewState {
  const previous = existingReview ?? getDefaultReviewState(now);
  const previousInterval = previous.interval || 1;
  let repetition = previous.repetition;
  let interval = previous.interval;
  let easeFactor = previous.easeFactor;

  if (rating === "again") {
    repetition = 0;
    interval = 1;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
  }

  if (rating === "good") {
    repetition = previous.repetition + 1;

    if (repetition === 1) {
      interval = 1;
    } else if (repetition === 2) {
      interval = 3;
    } else {
      interval = Math.max(1, Math.round(previousInterval * easeFactor));
    }
  }

  if (rating === "easy") {
    repetition = previous.repetition + 1;
    easeFactor = Math.min(2.8, easeFactor + 0.15);

    if (repetition === 1) {
      interval = 2;
    } else if (repetition === 2) {
      interval = 5;
    } else {
      interval = Math.max(1, Math.round(previousInterval * easeFactor));
    }
  }

  return {
    repetition,
    interval,
    easeFactor,
    dueAt: addDays(now, interval).toISOString(),
    lastReviewedAt: now.toISOString(),
  };
}

