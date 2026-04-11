import "server-only";

import type {
  UserErrorFingerprintRecord,
  UserErrorRecord,
  UserQuestionAttemptRecord,
} from "@/lib/server/data-store";

export type QuestionLearningSignal = {
  questionId: string;
  wrongCount: number;
  seenCount: number;
  uniqueWrongCount: number;
  repeatedWrongCount: number;
  repeatedFailureStreak: number;
  weightedWrongScore: number;
  recentWrongCount: number;
  previousWrongCount: number;
  hasDueError: boolean;
  currentErrorCount: number;
  latestFingerprintType?: string;
  lastAttemptAt?: Date;
  lastIncorrectAt?: Date;
  errorRate: number;
};

export function getLearningRecencyWeight(createdAt: Date, now: Date) {
  const ageDays = (now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000);

  if (ageDays <= 7) {
    return 1;
  }

  if (ageDays <= 30) {
    return 0.65;
  }

  if (ageDays <= 90) {
    return 0.35;
  }

  return 0.2;
}

export function groupAttemptsByQuestionId(attempts: UserQuestionAttemptRecord[]) {
  const groupedAttempts = new Map<string, UserQuestionAttemptRecord[]>();

  for (const attempt of attempts) {
    const existing = groupedAttempts.get(attempt.questionId) ?? [];
    existing.push(attempt);
    groupedAttempts.set(attempt.questionId, existing);
  }

  return groupedAttempts;
}

export function buildQuestionLearningSignals(
  groupedAttempts: Map<string, UserQuestionAttemptRecord[]>,
  errorByQuestionId: Map<string, UserErrorRecord>,
  fingerprintByQuestionId: Map<string, UserErrorFingerprintRecord>,
  now: Date,
) {
  const signalsByQuestionId = new Map<string, QuestionLearningSignal>();
  const currentWindowStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const previousWindowStart = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

  for (const [questionId, attempts] of groupedAttempts.entries()) {
    let wrongCount = 0;
    let seenCount = 0;
    let currentFailureStreak = 0;
    let weightedWrongScore = 0;
    let recentWrongCount = 0;
    let previousWrongCount = 0;
    let lastAttemptAt: Date | undefined;
    let lastIncorrectAt: Date | undefined;

    for (const attempt of attempts) {
      seenCount += 1;
      lastAttemptAt = attempt.createdAt;

      if (attempt.wasCorrect) {
        currentFailureStreak = 0;
        continue;
      }

      wrongCount += 1;
      currentFailureStreak += 1;
      weightedWrongScore += getLearningRecencyWeight(attempt.createdAt, now);
      lastIncorrectAt = attempt.createdAt;

      if (attempt.createdAt >= currentWindowStart) {
        recentWrongCount += 1;
      } else if (attempt.createdAt >= previousWindowStart) {
        previousWrongCount += 1;
      }
    }

    const currentError = errorByQuestionId.get(questionId);
    const errorRate = seenCount > 0 ? wrongCount / seenCount : 0;

    signalsByQuestionId.set(questionId, {
      questionId,
      wrongCount,
      seenCount,
      uniqueWrongCount: wrongCount > 0 ? 1 : 0,
      repeatedWrongCount: Math.max(0, wrongCount - (wrongCount > 0 ? 1 : 0)),
      repeatedFailureStreak: currentFailureStreak,
      weightedWrongScore,
      recentWrongCount,
      previousWrongCount,
      hasDueError: currentError ? currentError.nextReviewAt.getTime() <= now.getTime() : false,
      currentErrorCount: currentError?.errorCount ?? 0,
      latestFingerprintType: fingerprintByQuestionId.get(questionId)?.fingerprintType,
      lastAttemptAt,
      lastIncorrectAt,
      errorRate,
    });
  }

  return signalsByQuestionId;
}
