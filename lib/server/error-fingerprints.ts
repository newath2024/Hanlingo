import "server-only";

import { analyzeMistake, summarizeFingerprint } from "@/lib/error-fingerprint-analysis";
import { getRuntimeTaskCorrectAnswer } from "@/lib/session";
import { createSessionItemForRuntimeTask, getRuntimeTaskEntry } from "@/lib/runtime-task-index";
import {
  createUserErrorFingerprints,
  type UserErrorFingerprintRecord,
} from "@/lib/server/data-store";
import type { FingerprintSummary } from "@/types/error-fingerprint";
import type { SessionItem } from "@/types/session";

export type FingerprintEventInput = {
  questionId: string;
  lessonId: string;
  userAnswer?: string;
  answerOptionId?: string;
  answerTokens?: string[];
  responseTimeMs: number;
  priorAttempts: number;
};

export type RecordedFingerprint = {
  record: UserErrorFingerprintRecord;
  summary: FingerprintSummary;
};

function stringifyCorrectAnswer(question: SessionItem) {
  if (typeof question.correctAnswer === "string") {
    return question.correctAnswer;
  }

  return question.correctAnswer.en || question.correctAnswer.vi || "";
}

function logFingerprint(questionId: string, summary: FingerprintSummary) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info(
    `[fingerprint] question=${questionId} type=${summary.type} confidence=${summary.confidenceScore.toFixed(2)} reason=${summary.shortReason}`,
  );
}

async function persistResolvedFingerprints(
  userId: string,
  events: Array<{
    event: FingerprintEventInput;
    question: SessionItem;
  }>,
) {
  if (events.length === 0) {
    return [] as RecordedFingerprint[];
  }

  const analyzed = events.map(({ event, question }) => {
    const userAnswer = event.userAnswer?.trim() ?? "";
    const correctAnswer = stringifyCorrectAnswer(question);
    const result = analyzeMistake({
      question,
      userAnswer,
      correctAnswer,
      answerOptionId: event.answerOptionId,
      answerTokens: event.answerTokens,
      responseTimeMs: event.responseTimeMs,
      priorAttempts: event.priorAttempts,
    });

    return {
      event,
      result,
      summary: summarizeFingerprint(result),
      recordInput: {
        userId,
        questionId: event.questionId,
        lessonId: event.lessonId,
        exerciseType: question.type,
        fingerprintType: result.fingerprintType,
        confidenceScore: result.confidenceScore,
        userAnswerRaw: userAnswer,
        correctAnswerRaw: correctAnswer,
        analysisPayload: result.analysis,
        responseTimeMs: event.responseTimeMs,
        priorAttempts: event.priorAttempts,
      },
    };
  });

  const records = await createUserErrorFingerprints(
    analyzed.map((entry) => entry.recordInput),
  );

  return analyzed.map((entry, index) => {
    logFingerprint(entry.event.questionId, entry.summary);

    return {
      record: records[index],
      summary: entry.summary,
    };
  });
}

export async function recordLessonErrorFingerprints(
  userId: string,
  events: FingerprintEventInput[],
) {
  const resolvedEvents = events.flatMap((event) => {
    const questionId = event.questionId.trim();
    const taskEntry = getRuntimeTaskEntry(questionId);

    if (!questionId || !taskEntry) {
      return [];
    }

    return [
      {
        event: {
          ...event,
          questionId,
        },
        question: createSessionItemForRuntimeTask(taskEntry),
      },
    ];
  });

  return persistResolvedFingerprints(userId, resolvedEvents);
}

export async function recordResolvedErrorFingerprint(
  userId: string,
  payload: FingerprintEventInput & {
    question: SessionItem;
  },
) {
  const [recorded] = await persistResolvedFingerprints(userId, [
    {
      event: payload,
      question: payload.question,
    },
  ]);

  return recorded ?? null;
}

export function getResolvedCorrectAnswerForQuestion(question: SessionItem) {
  return stringifyCorrectAnswer(question);
}

export function getResolvedCorrectAnswerForRuntimeQuestion(questionId: string) {
  const entry = getRuntimeTaskEntry(questionId);

  if (!entry) {
    return "";
  }

  const correctAnswer = getRuntimeTaskCorrectAnswer(entry.task);

  if (typeof correctAnswer === "string") {
    return correctAnswer;
  }

  return correctAnswer.en || correctAnswer.vi || "";
}
