import "server-only";

import {
  createUserQuestionAttempts,
  findLatestUserErrorFingerprintsByQuestionIds,
  listUserErrors,
  listUserQuestionAttempts,
} from "@/lib/server/data-store";
import {
  buildQuestionLearningSignals,
  groupAttemptsByQuestionId,
  type QuestionLearningSignal,
} from "@/lib/server/learning-signals";
import { invalidateAdaptiveSessionCache } from "@/lib/server/adaptive-learning";
import { resolveHeatmapMetadataForQuestion } from "@/lib/runtime-task-index";
import type {
  HeatmapQuestionFormat,
  HeatmapRecommendationTag,
  HeatmapScopeType,
  HeatmapSkillType,
  KnowledgeTargetKind,
  RecentTrend,
  UserErrorHeatmapEntry,
  UserErrorHeatmapResponse,
  UserQuestionAttemptInput,
} from "@/types/error-heatmap";

const HEATMAP_CACHE_TTL_MS = 60_000;
const HEATMAP_SUMMARY_LIMIT = 4;
const DEFAULT_HEATMAP_LIMIT = 6;

type HeatmapOptions = {
  scope?: HeatmapScopeType;
  unitId?: string;
  lessonId?: string;
  limit?: number;
};

type ScopeAggregate = {
  scopeType: HeatmapScopeType;
  scopeId: string;
  label: string;
  wrongCount: number;
  seenCount: number;
  uniqueWrongCount: number;
  repeatedWrongCount: number;
  repeatedFailureStreak: number;
  weightedWrongScore: number;
  recentWrongCount: number;
  previousWrongCount: number;
  dueErrorCount: number;
  maxCurrentErrorCount: number;
  fingerprintCounts: Record<string, number>;
};

type QuestionMetrics = {
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
};

type HeatmapCacheEntry = {
  expiresAt: number;
  response: UserErrorHeatmapResponse;
};

const heatmapCache = new Map<string, HeatmapCacheEntry>();

function getHeatmapCacheKey(userId: string, options: HeatmapOptions) {
  return JSON.stringify({
    userId,
    scope: options.scope ?? null,
    unitId: options.unitId ?? null,
    lessonId: options.lessonId ?? null,
    limit: options.limit ?? DEFAULT_HEATMAP_LIMIT,
  });
}

export function invalidateUserErrorHeatmapCache(userId: string) {
  for (const cacheKey of heatmapCache.keys()) {
    if (cacheKey.includes(`"userId":"${userId}"`)) {
      heatmapCache.delete(cacheKey);
    }
  }
}

function getRecentTrend(currentWindowWrongCount: number, previousWindowWrongCount: number): RecentTrend {
  if (currentWindowWrongCount >= previousWindowWrongCount + 2) {
    const baseline = Math.max(previousWindowWrongCount, 1);

    if ((currentWindowWrongCount - previousWindowWrongCount) / baseline >= 0.2) {
      return "up";
    }
  }

  if (previousWindowWrongCount >= currentWindowWrongCount + 2) {
    const baseline = Math.max(previousWindowWrongCount, 1);

    if ((previousWindowWrongCount - currentWindowWrongCount) / baseline >= 0.2) {
      return "down";
    }
  }

  return "stable";
}

function formatQuestionTypeLabel(questionFormat: HeatmapQuestionFormat) {
  switch (questionFormat) {
    case "multiple_choice":
      return "Multiple choice";
    case "typing":
      return "Typing";
    case "reorder":
      return "Reorder";
    case "listening_select":
      return "Listening select";
    case "speaking_repeat":
      return "Speaking repeat";
    default:
      return questionFormat;
  }
}

function formatSkillLabel(skillType: HeatmapSkillType) {
  switch (skillType) {
    case "sentence_ordering":
      return "Sentence ordering";
    default:
      return skillType.charAt(0).toUpperCase() + skillType.slice(1);
  }
}

function createAggregate(scopeType: HeatmapScopeType, scopeId: string, label: string): ScopeAggregate {
  return {
    scopeType,
    scopeId,
    label,
    wrongCount: 0,
    seenCount: 0,
    uniqueWrongCount: 0,
    repeatedWrongCount: 0,
    repeatedFailureStreak: 0,
    weightedWrongScore: 0,
    recentWrongCount: 0,
    previousWrongCount: 0,
    dueErrorCount: 0,
    maxCurrentErrorCount: 0,
    fingerprintCounts: {},
  };
}

function updateAggregate(
  aggregate: ScopeAggregate,
  questionMetrics: QuestionMetrics,
  latestFingerprintType?: string,
) {
  aggregate.seenCount += questionMetrics.seenCount;
  aggregate.wrongCount += questionMetrics.wrongCount;
  aggregate.uniqueWrongCount += questionMetrics.uniqueWrongCount;
  aggregate.repeatedWrongCount += questionMetrics.repeatedWrongCount;
  aggregate.repeatedFailureStreak = Math.max(
    aggregate.repeatedFailureStreak,
    questionMetrics.repeatedFailureStreak,
  );
  aggregate.weightedWrongScore += questionMetrics.weightedWrongScore;
  aggregate.recentWrongCount += questionMetrics.recentWrongCount;
  aggregate.previousWrongCount += questionMetrics.previousWrongCount;
  aggregate.dueErrorCount += questionMetrics.hasDueError ? 1 : 0;
  aggregate.maxCurrentErrorCount = Math.max(
    aggregate.maxCurrentErrorCount,
    questionMetrics.currentErrorCount,
  );

  if (latestFingerprintType) {
    aggregate.fingerprintCounts[latestFingerprintType] =
      (aggregate.fingerprintCounts[latestFingerprintType] ?? 0) + 1;
  }
}

function getDominantFingerprintType(fingerprintCounts: ScopeAggregate["fingerprintCounts"]) {
  let dominantType = "";
  let dominantCount = -1;

  for (const [fingerprintType, count] of Object.entries(fingerprintCounts)) {
    if (count > dominantCount) {
      dominantType = fingerprintType;
      dominantCount = count;
    }
  }

  return dominantType;
}

function getRecommendationTag(
  aggregate: ScopeAggregate,
  scopeType: HeatmapScopeType,
  scopeId: string,
): HeatmapRecommendationTag {
  const errorRate = aggregate.seenCount > 0 ? aggregate.wrongCount / aggregate.seenCount : 0;
  const dominantFingerprintType = getDominantFingerprintType(aggregate.fingerprintCounts);
  const isGrammarScope =
    scopeId === "grammar" ||
    scopeId.startsWith("grammar:") ||
    dominantFingerprintType === "GRAMMAR_MISMATCH";
  const isVocabScope =
    scopeId === "vocab" ||
    scopeId.startsWith("vocab:") ||
    dominantFingerprintType === "WORD_CONFUSION";

  if (
    errorRate >= 0.45 &&
    (aggregate.repeatedFailureStreak >= 2 ||
      aggregate.dueErrorCount > 0 ||
      aggregate.maxCurrentErrorCount >= 3)
  ) {
    return "Needs urgent review";
  }

  if (scopeType === "skill" && scopeId === "grammar") {
    return "Weak grammar area";
  }

  if (scopeType === "knowledge_target" && isGrammarScope) {
    return "Weak grammar area";
  }

  if (scopeType === "knowledge_target" && isVocabScope) {
    return "Often confused vocab";
  }

  if (scopeType === "skill" && scopeId === "vocab") {
    return "Often confused vocab";
  }

  return "Steady watch";
}

function finalizeAggregate(aggregate: ScopeAggregate): UserErrorHeatmapEntry {
  const errorRate = aggregate.seenCount > 0 ? aggregate.wrongCount / aggregate.seenCount : 0;

  return {
    scopeType: aggregate.scopeType,
    scopeId: aggregate.scopeId,
    label: aggregate.label,
    wrongCount: aggregate.wrongCount,
    seenCount: aggregate.seenCount,
    accuracy: aggregate.seenCount > 0 ? 1 - errorRate : 0,
    errorRate,
    uniqueWrongCount: aggregate.uniqueWrongCount,
    repeatedWrongCount: Math.max(0, aggregate.repeatedWrongCount),
    repeatedFailureStreak: aggregate.repeatedFailureStreak,
    weightedWrongScore: Number(aggregate.weightedWrongScore.toFixed(3)),
    recentTrend: getRecentTrend(aggregate.recentWrongCount, aggregate.previousWrongCount),
    recommendationTag: getRecommendationTag(
      aggregate,
      aggregate.scopeType,
      aggregate.scopeId,
    ),
  };
}

function sortBySeverity(left: UserErrorHeatmapEntry, right: UserErrorHeatmapEntry) {
  if (right.weightedWrongScore !== left.weightedWrongScore) {
    return right.weightedWrongScore - left.weightedWrongScore;
  }

  if (right.errorRate !== left.errorRate) {
    return right.errorRate - left.errorRate;
  }

  if (right.repeatedFailureStreak !== left.repeatedFailureStreak) {
    return right.repeatedFailureStreak - left.repeatedFailureStreak;
  }

  if (right.wrongCount !== left.wrongCount) {
    return right.wrongCount - left.wrongCount;
  }

  return left.label.localeCompare(right.label);
}

function sortRepeatedMistakes(left: UserErrorHeatmapEntry, right: UserErrorHeatmapEntry) {
  if (right.repeatedFailureStreak !== left.repeatedFailureStreak) {
    return right.repeatedFailureStreak - left.repeatedFailureStreak;
  }

  if (right.repeatedWrongCount !== left.repeatedWrongCount) {
    return right.repeatedWrongCount - left.repeatedWrongCount;
  }

  return sortBySeverity(left, right);
}

function buildEmptyResponse(userId: string): UserErrorHeatmapResponse {
  return {
    userId,
    generatedAt: new Date().toISOString(),
    summary: {
      totalSeen: 0,
      totalWrong: 0,
      overallAccuracy: 0,
      mostMissedUnits: [],
      mostMissedLessons: [],
      mostMissedSkills: [],
      mostMissedVocabulary: [],
      mostMissedGrammarPatterns: [],
    },
    heatmap: [],
  };
}

function toQuestionMetrics(signalsByQuestionId: Map<string, QuestionLearningSignal>) {
  return new Map<string, QuestionMetrics>(
    [...signalsByQuestionId.entries()].map(([questionId, signal]) => [
      questionId,
      {
        questionId,
        wrongCount: signal.wrongCount,
        seenCount: signal.seenCount,
        uniqueWrongCount: signal.uniqueWrongCount,
        repeatedWrongCount: signal.repeatedWrongCount,
        repeatedFailureStreak: signal.repeatedFailureStreak,
        weightedWrongScore: signal.weightedWrongScore,
        recentWrongCount: signal.recentWrongCount,
        previousWrongCount: signal.previousWrongCount,
        hasDueError: signal.hasDueError,
        currentErrorCount: signal.currentErrorCount,
        latestFingerprintType: signal.latestFingerprintType,
      },
    ]),
  );
}

function buildScopeEntries(
  metricsByQuestionId: Map<string, QuestionMetrics>,
  metadataByQuestionId: Map<
    string,
    NonNullable<ReturnType<typeof resolveHeatmapMetadataForQuestion>>
  >,
) {
  const aggregates = new Map<string, ScopeAggregate>();

  function pushAggregate(
    scopeType: HeatmapScopeType,
    scopeId: string,
    label: string,
    metrics: QuestionMetrics,
  ) {
    const aggregateKey = `${scopeType}:${scopeId}`;
    const aggregate =
      aggregates.get(aggregateKey) ?? createAggregate(scopeType, scopeId, label);

    updateAggregate(aggregate, metrics, metrics.latestFingerprintType);
    aggregates.set(aggregateKey, aggregate);
  }

  for (const [questionId, metrics] of metricsByQuestionId.entries()) {
    const metadata = metadataByQuestionId.get(questionId);

    if (!metadata || metrics.seenCount === 0) {
      continue;
    }

    pushAggregate("unit", metadata.unitId, metadata.unitLabel, metrics);
    pushAggregate("lesson", metadata.lessonId, metadata.lessonLabel, metrics);
    pushAggregate("node", metadata.nodeId, metadata.nodeLabel, metrics);
    pushAggregate("skill", metadata.skillType, formatSkillLabel(metadata.skillType), metrics);
    pushAggregate(
      "question_type",
      metadata.questionFormat,
      formatQuestionTypeLabel(metadata.questionFormat),
      metrics,
    );

    for (const target of metadata.knowledgeTargets) {
      pushAggregate("knowledge_target", target.id, target.label, metrics);
    }
  }

  return {
    all: [...aggregates.values()].map(finalizeAggregate),
    byScope(scopeType: HeatmapScopeType) {
      return [...aggregates.values()]
        .filter((aggregate) => aggregate.scopeType === scopeType)
        .map(finalizeAggregate);
    },
  };
}

function topEntries(entries: UserErrorHeatmapEntry[], limit: number) {
  return entries
    .filter((entry) => entry.wrongCount > 0)
    .sort(sortBySeverity)
    .slice(0, limit);
}

function topRepeatedKnowledgeTargets(entries: UserErrorHeatmapEntry[], limit: number) {
  return entries
    .filter(
      (entry) =>
        entry.scopeType === "knowledge_target" &&
        (entry.repeatedWrongCount > 0 || entry.repeatedFailureStreak > 1 || entry.wrongCount > 0),
    )
    .sort(sortRepeatedMistakes)
    .slice(0, limit);
}

function topKnowledgeTargetsByKind(
  entries: UserErrorHeatmapEntry[],
  targetKind: KnowledgeTargetKind,
  limit: number,
) {
  return entries
    .filter(
      (entry) =>
        entry.scopeType === "knowledge_target" &&
        entry.scopeId.startsWith(
          targetKind === "grammar_pattern"
            ? "grammar:"
            : targetKind === "sentence_pattern"
              ? "sentence:"
              : "vocab:",
        ) &&
        entry.wrongCount > 0,
    )
    .sort(sortBySeverity)
    .slice(0, limit);
}

async function buildHeatmapResponse(userId: string, options: HeatmapOptions) {
  const now = new Date();
  const attempts = await listUserQuestionAttempts(userId, {
    unitId: options.unitId,
    lessonId: options.lessonId,
  });

  if (!attempts.length) {
    return buildEmptyResponse(userId);
  }

  const metadataByQuestionId = new Map<
    string,
    NonNullable<ReturnType<typeof resolveHeatmapMetadataForQuestion>>
  >();

  for (const attempt of attempts) {
    if (metadataByQuestionId.has(attempt.questionId)) {
      continue;
    }

    const metadata = resolveHeatmapMetadataForQuestion(attempt.questionId);

    if (metadata) {
      metadataByQuestionId.set(attempt.questionId, metadata);
    }
  }

  const filteredAttempts = attempts.filter((attempt) => metadataByQuestionId.has(attempt.questionId));

  if (!filteredAttempts.length) {
    return buildEmptyResponse(userId);
  }

  const questionIds = [...new Set(filteredAttempts.map((attempt) => attempt.questionId))];
  const groupedAttempts = groupAttemptsByQuestionId(filteredAttempts);

  const [currentErrors, latestFingerprints] = await Promise.all([
    listUserErrors(userId),
    findLatestUserErrorFingerprintsByQuestionIds(userId, questionIds),
  ]);

  const errorByQuestionId = new Map(
    currentErrors
      .filter((record) => metadataByQuestionId.has(record.questionId))
      .map((record) => [record.questionId, record]),
  );
  const fingerprintByQuestionId = new Map(
    latestFingerprints.map((record) => [record.questionId, record]),
  );

  const metricsByQuestionId = toQuestionMetrics(
    buildQuestionLearningSignals(
      groupedAttempts,
      errorByQuestionId,
      fingerprintByQuestionId,
      now,
    ),
  );
  const scopeEntries = buildScopeEntries(metricsByQuestionId, metadataByQuestionId);
  const knowledgeTargetEntries = scopeEntries.byScope("knowledge_target");
  const limit = options.limit ?? DEFAULT_HEATMAP_LIMIT;

  return {
    userId,
    generatedAt: now.toISOString(),
    summary: {
      totalSeen: filteredAttempts.length,
      totalWrong: filteredAttempts.filter((attempt) => !attempt.wasCorrect).length,
      overallAccuracy:
        filteredAttempts.length > 0
          ? filteredAttempts.filter((attempt) => attempt.wasCorrect).length / filteredAttempts.length
          : 0,
      mostMissedUnits: topEntries(scopeEntries.byScope("unit"), HEATMAP_SUMMARY_LIMIT),
      mostMissedLessons: topEntries(scopeEntries.byScope("lesson"), HEATMAP_SUMMARY_LIMIT),
      mostMissedSkills: topEntries(scopeEntries.byScope("skill"), HEATMAP_SUMMARY_LIMIT),
      mostMissedVocabulary: topKnowledgeTargetsByKind(
        knowledgeTargetEntries,
        "vocab",
        HEATMAP_SUMMARY_LIMIT,
      ),
      mostMissedGrammarPatterns: topKnowledgeTargetsByKind(
        knowledgeTargetEntries,
        "grammar_pattern",
        HEATMAP_SUMMARY_LIMIT,
      ),
    },
    heatmap: options.scope
      ? topEntries(scopeEntries.byScope(options.scope), limit)
      : topRepeatedKnowledgeTargets(scopeEntries.all, limit),
  } satisfies UserErrorHeatmapResponse;
}

export async function recordUserQuestionAttempts(
  userId: string,
  attempts: UserQuestionAttemptInput[],
) {
  const normalizedAttempts = attempts.flatMap((attempt) => {
    const questionId = attempt.questionId.trim();

    if (!questionId) {
      return [];
    }

    const metadata = resolveHeatmapMetadataForQuestion(questionId);

    if (!metadata) {
      return [];
    }

    return [
      {
        userId,
        questionId,
        lessonId: metadata.lessonId,
        unitId: metadata.unitId,
        nodeId: metadata.nodeId,
        sourceContext: attempt.sourceContext,
        wasCorrect: attempt.wasCorrect,
        responseTimeMs: attempt.responseTimeMs,
      },
    ];
  });

  if (!normalizedAttempts.length) {
    return [] as Awaited<ReturnType<typeof createUserQuestionAttempts>>;
  }

  const saved = await createUserQuestionAttempts(normalizedAttempts);
  invalidateUserErrorHeatmapCache(userId);
  invalidateAdaptiveSessionCache(userId);
  return saved;
}

export async function getUserErrorHeatmap(userId: string, options: HeatmapOptions = {}) {
  const cacheKey = getHeatmapCacheKey(userId, options);
  const cached = heatmapCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.response;
  }

  const response = await buildHeatmapResponse(userId, options);

  heatmapCache.set(cacheKey, {
    response,
    expiresAt: Date.now() + HEATMAP_CACHE_TTL_MS,
  });

  return response;
}

export async function getUnitErrorBreakdown(userId: string, unitId: string) {
  return getUserErrorHeatmap(userId, {
    unitId,
    scope: "lesson",
  });
}

export async function getLessonWeakPoints(userId: string, lessonId: string) {
  return getUserErrorHeatmap(userId, {
    lessonId,
    scope: "knowledge_target",
  });
}
