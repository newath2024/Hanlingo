import "server-only";

import { recordLessonErrorFingerprints, recordResolvedErrorFingerprint } from "@/lib/server/error-fingerprints";
import {
  getAdaptiveMixedPractice,
  getAdaptiveWeakPointsPractice,
  invalidateAdaptiveSessionCache,
} from "@/lib/server/adaptive-learning";
import {
  invalidateUserErrorHeatmapCache,
  recordUserQuestionAttempts,
} from "@/lib/server/error-heatmap";
import { getUserProgress } from "@/lib/server/progress";
import {
  findUserErrorsByQuestionIds,
  listDueUserErrors,
  type UserErrorRecord,
  upsertUserErrors,
} from "@/lib/server/data-store";
import {
  createPracticeQuestionFromRuntimeTask,
  createSessionItemForRuntimeTask,
  getRuntimeTaskEntry,
  inferRuntimeTaskErrorType,
} from "@/lib/runtime-task-index";
import { getRuntimeTaskCorrectAnswer } from "@/lib/session";
import type { AttemptSourceContext } from "@/types/error-heatmap";
import type { FingerprintSummary } from "@/types/error-fingerprint";
import type { SessionDisplayText } from "@/types/session";

const ERROR_QUEUE_CACHE_TTL_MS = 30_000;

type ErrorQueueCacheEntry = {
  expiresAt: number;
  records: UserErrorRecord[];
};

type ReportUserErrorEvent = {
  questionId: string;
  lessonId: string;
  userAnswer?: string;
  answerOptionId?: string;
  answerTokens?: string[];
  responseTimeMs: number;
  priorAttempts: number;
};

const errorQueueCache = new Map<string, ErrorQueueCacheEntry>();

function stringifyDisplayText(value: SessionDisplayText | undefined) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return value.en || value.vi || "";
}

function getFailureDelayMs(errorCount: number) {
  if (errorCount <= 1) {
    return 10 * 60 * 1000;
  }

  if (errorCount === 2) {
    return 60 * 60 * 1000;
  }

  return 24 * 60 * 60 * 1000;
}

function getSuccessDelayMs(errorCount: number) {
  if (errorCount <= 1) {
    return 24 * 60 * 60 * 1000;
  }

  if (errorCount === 2) {
    return 3 * 24 * 60 * 60 * 1000;
  }

  return 7 * 24 * 60 * 60 * 1000;
}

function scheduleFailure(errorCount: number, now: Date) {
  return new Date(now.getTime() + getFailureDelayMs(errorCount));
}

function scheduleSuccess(errorCount: number, now: Date) {
  return new Date(now.getTime() + getSuccessDelayMs(errorCount));
}

function getQueueCacheKey(userId: string, limit: number) {
  return `${userId}:${limit}`;
}

function invalidateErrorQueueCache(userId: string) {
  for (const cacheKey of errorQueueCache.keys()) {
    if (cacheKey.startsWith(`${userId}:`)) {
      errorQueueCache.delete(cacheKey);
    }
  }
}

function aggregateErrorEvents(events: ReportUserErrorEvent[]) {
  const aggregated = new Map<
    string,
    {
      questionId: string;
      lessonId: string;
      userAnswer: string;
      delta: number;
    }
  >();

  for (const event of events) {
    const questionId = event.questionId.trim();
    const lessonId = event.lessonId.trim();

    if (!questionId || !lessonId) {
      continue;
    }

    const existing = aggregated.get(questionId);

    if (existing) {
      existing.delta += 1;
      existing.userAnswer = event.userAnswer?.trim() || existing.userAnswer;
      existing.lessonId = lessonId;
      continue;
    }

    aggregated.set(questionId, {
      questionId,
      lessonId,
      userAnswer: event.userAnswer?.trim() ?? "",
      delta: 1,
    });
  }

  return [...aggregated.values()];
}

async function buildUpsertRecords(
  userId: string,
  events: ReturnType<typeof aggregateErrorEvents>,
) {
  const existingRecords = await findUserErrorsByQuestionIds(
    userId,
    events.map((event) => event.questionId),
  );
  const existingByQuestionId = new Map(
    existingRecords.map((record) => [record.questionId, record]),
  );
  const now = new Date();

  return events.flatMap((event) => {
    const taskEntry = getRuntimeTaskEntry(event.questionId);

    if (!taskEntry) {
      return [];
    }

    const existing = existingByQuestionId.get(event.questionId);
    const errorCount = (existing?.errorCount ?? 0) + event.delta;

    return [
      {
        userId,
        questionId: event.questionId,
        lessonId: taskEntry.lesson.lessonId || event.lessonId,
        errorType: inferRuntimeTaskErrorType(taskEntry.task),
        userAnswer: event.userAnswer || existing?.userAnswer || "",
        correctAnswer: stringifyDisplayText(getRuntimeTaskCorrectAnswer(taskEntry.task)),
        errorCount,
        lastSeenAt: now,
        nextReviewAt: scheduleFailure(errorCount, now),
      },
    ];
  });
}

export async function reportUserErrors(
  userId: string,
  events: ReportUserErrorEvent[],
  options: { recordFingerprints?: boolean } = {},
) {
  const shouldRecordFingerprints = options.recordFingerprints ?? true;
  const fingerprints = shouldRecordFingerprints
    ? await recordLessonErrorFingerprints(userId, events)
    : [];
  const aggregatedEvents = aggregateErrorEvents(events);

  if (aggregatedEvents.length === 0) {
    return {
      records: [] as UserErrorRecord[],
      fingerprints,
    };
  }

  const upsertRecords = await buildUpsertRecords(userId, aggregatedEvents);

  if (upsertRecords.length === 0) {
    return {
      records: [] as UserErrorRecord[],
      fingerprints,
    };
  }

  const savedRecords = await upsertUserErrors(upsertRecords);
  invalidateErrorQueueCache(userId);
  invalidateUserErrorHeatmapCache(userId);
  invalidateAdaptiveSessionCache(userId);
  return {
    records: savedRecords,
    fingerprints,
  };
}

export async function getErrorQueue(userId: string, limit = 5) {
  const cacheKey = getQueueCacheKey(userId, limit);
  const cached = errorQueueCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.records;
  }

  const records = await listDueUserErrors(userId, new Date(), limit);

  errorQueueCache.set(cacheKey, {
    records,
    expiresAt: Date.now() + ERROR_QUEUE_CACHE_TTL_MS,
  });

  return records;
}

export async function getErrorPracticeQuestions(userId: string, limit = 5) {
  const response = await getAdaptiveWeakPointsPractice(userId, limit);
  return response.items;
}

export async function generateLesson(userId: string, limit = 10) {
  const response = await getAdaptiveMixedPractice(userId, limit);
  return response.items;
}

export async function submitPracticeAnswer(
  userId: string,
  payload: {
    questionId: string;
    lessonId: string;
    sourceContext: AttemptSourceContext;
    userAnswer?: string;
    answerOptionId?: string;
    answerTokens?: string[];
    responseTimeMs: number;
    priorAttempts: number;
    wasCorrect: boolean;
  },
) {
  const questionId = payload.questionId.trim();
  const lessonId = payload.lessonId.trim();

  if (!questionId || !lessonId) {
    throw new Error("Invalid practice answer payload.");
  }

  const entry = getRuntimeTaskEntry(questionId);

  if (!entry) {
    throw new Error("Question not found.");
  }

  const [existing] = await findUserErrorsByQuestionIds(userId, [questionId]);
  const now = new Date();
  const correctAnswer = stringifyDisplayText(getRuntimeTaskCorrectAnswer(entry.task));

  if (!payload.wasCorrect) {
    let question = createSessionItemForRuntimeTask(entry);

    if (existing) {
      question = createPracticeQuestionFromRuntimeTask(entry, {
        source: "due_review",
        errorCount: existing.errorCount,
      });
    } else {
      const progress = await getUserProgress(userId);
      question = createPracticeQuestionFromRuntimeTask(entry, {
        source: "progression",
        errorCount: 0,
        sentenceSeenCounts: progress.sentenceExposures,
      });
    }

    const fingerprint = await recordResolvedErrorFingerprint(userId, {
      ...payload,
      questionId,
      lessonId,
      question,
    });
    const reportResult = await reportUserErrors(
      userId,
      [
        {
          questionId,
          lessonId,
          userAnswer: payload.userAnswer,
          answerOptionId: payload.answerOptionId,
          answerTokens: payload.answerTokens,
          responseTimeMs: payload.responseTimeMs,
          priorAttempts: payload.priorAttempts,
        },
      ],
      { recordFingerprints: false },
    );
    const [saved] = reportResult.records;

    await recordUserQuestionAttempts(userId, [
      {
        questionId,
        lessonId,
        sourceContext: payload.sourceContext,
        wasCorrect: false,
        responseTimeMs: payload.responseTimeMs,
      },
    ]);

    return {
      errorCount: saved?.errorCount ?? (existing?.errorCount ?? 0) + 1,
      nextReviewAt: saved?.nextReviewAt.toISOString() ?? scheduleFailure(1, now).toISOString(),
      correctAnswer,
      repeated: (saved?.errorCount ?? (existing?.errorCount ?? 0) + 1) > 1,
      fingerprint: fingerprint?.summary,
    };
  }

  if (!existing) {
    invalidateErrorQueueCache(userId);
    invalidateAdaptiveSessionCache(userId);
    await recordUserQuestionAttempts(userId, [
      {
        questionId,
        lessonId,
        sourceContext: payload.sourceContext,
        wasCorrect: true,
        responseTimeMs: payload.responseTimeMs,
      },
    ]);
    return {
      errorCount: 0,
      nextReviewAt: null,
      correctAnswer,
      repeated: false,
      fingerprint: null as FingerprintSummary | null,
    };
  }

  const [saved] = await upsertUserErrors([
    {
      userId,
      questionId,
      lessonId,
      errorType: inferRuntimeTaskErrorType(entry.task),
      userAnswer: payload.userAnswer?.trim() ?? existing.userAnswer,
      correctAnswer,
      errorCount: existing.errorCount,
      lastSeenAt: now,
      nextReviewAt: scheduleSuccess(existing.errorCount, now),
    },
  ]);

  invalidateErrorQueueCache(userId);
  invalidateAdaptiveSessionCache(userId);
  await recordUserQuestionAttempts(userId, [
    {
      questionId,
      lessonId,
      sourceContext: payload.sourceContext,
      wasCorrect: true,
      responseTimeMs: payload.responseTimeMs,
    },
  ]);

  return {
    errorCount: saved.errorCount,
    nextReviewAt: saved.nextReviewAt.toISOString(),
    correctAnswer,
    repeated: saved.errorCount > 1,
    fingerprint: null as FingerprintSummary | null,
  };
}
