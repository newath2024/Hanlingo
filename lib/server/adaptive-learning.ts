import "server-only";

import { randomUUID } from "node:crypto";
import { resolveAdaptiveVariant } from "@/lib/adaptive-variants";
import {
  createPracticeQuestionFromRuntimeTask,
  getRuntimeTaskEntry,
  listRuntimeTaskEntriesByKnowledgeTarget,
  listUnlockedRuntimeTaskEntries,
  resolveHeatmapMetadataForQuestion,
  type RuntimeTaskEntry,
} from "@/lib/runtime-task-index";
import {
  findLatestUserErrorFingerprintsByQuestionIds,
  listUserErrors,
  listUserQuestionAttempts,
  type UserErrorRecord,
} from "@/lib/server/data-store";
import {
  buildQuestionLearningSignals,
  groupAttemptsByQuestionId,
  type QuestionLearningSignal,
} from "@/lib/server/learning-signals";
import { getUserProgress } from "@/lib/server/progress";
import {
  getCurrentNode,
  getCurrentUnit,
  getRuntimeUnitById,
  isUnitUnlocked,
  runtimeUnitCatalog,
} from "@/lib/units";
import type {
  AdaptiveSelectionDebug,
  AdaptiveSelectionSource,
  AdaptiveSessionItem,
  AdaptiveSessionMode,
  AdaptiveSessionResponse,
  AdaptiveVariantType,
  AdaptiveWeightBreakdown,
} from "@/types/adaptive-learning";

const ADAPTIVE_CACHE_TTL_MS = 60_000;
const SESSION_STORE_TTL_MS = 10 * 60 * 1000;

const SESSION_LABELS: Record<AdaptiveSessionMode, { en: string; vi: string }> = {
  balanced_progress: {
    en: "Balanced progress session",
    vi: "Buổi học cân bằng tiến độ",
  },
  focused_review: {
    en: "Focused review",
    vi: "Ôn tập có trọng tâm",
  },
  weak_points: {
    en: "Weak points practice",
    vi: "Luyện tập điểm yếu",
  },
};

const MODE_BUCKET_RATIOS: Record<
  AdaptiveSessionMode,
  Record<AdaptiveSelectionSource, number>
> = {
  balanced_progress: {
    progression: 0.4,
    due_review: 0.3,
    weak_reinforcement: 0.2,
    confidence_builder: 0.1,
  },
  focused_review: {
    progression: 0.25,
    due_review: 0.35,
    weak_reinforcement: 0.3,
    confidence_builder: 0.1,
  },
  weak_points: {
    progression: 0.1,
    due_review: 0.5,
    weak_reinforcement: 0.3,
    confidence_builder: 0.1,
  },
};

const FINGERPRINT_PRIORITY: Record<string, number> = {
  GRAMMAR_MISMATCH: 10,
  WORD_CONFUSION: 9,
  LISTENING_MISHEAR: 8,
  ORDERING_BREAKDOWN: 8,
  RANDOM_GUESS: 3,
};

type AdaptiveSessionOptions = {
  userId: string;
  developerOverride?: boolean;
  mode: AdaptiveSessionMode;
  targetUnitId?: string;
  targetLessonId?: string;
  sessionSize?: number;
  seed?: string;
  debug?: boolean;
};

type AdaptiveCacheEntry = {
  expiresAt: number;
  response: AdaptiveSessionResponse;
};

type StoredAdaptiveSession = {
  userId: string;
  response: AdaptiveSessionResponse;
  createdAt: number;
};

type AggregateSignal = {
  id: string;
  label: string;
  wrongCount: number;
  seenCount: number;
  weightedWrongScore: number;
  repeatedFailureStreak: number;
  dueErrorCount: number;
  maxCurrentErrorCount: number;
  fingerprintCounts: Record<string, number>;
  strongestQuestionId?: string;
  strongestQuestionScore: number;
};

type AdaptiveCandidate = {
  entry: RuntimeTaskEntry;
  selectionSource: AdaptiveSelectionSource;
  errorCount: number;
  dueAt?: Date;
  baseQuestionId?: string;
  relatedFromQuestionId?: string;
  variantType: AdaptiveVariantType;
  targetIds: string[];
  fallbackReason: string;
};

type ScoredCandidate = AdaptiveCandidate & {
  breakdown: AdaptiveWeightBreakdown;
  reason: string;
};

type AdaptiveContext = {
  userId: string;
  mode: AdaptiveSessionMode;
  progress: Awaited<ReturnType<typeof getUserProgress>>;
  now: Date;
  seedKey: string;
  targetUnitId?: string;
  targetLessonId?: string;
  activeUnitId?: string;
  currentNodeOrder?: number;
  unitIndexById: Map<string, number>;
  unlockedEntries: RuntimeTaskEntry[];
  unlockedQuestionIds: Set<string>;
  questionSignals: Map<string, QuestionLearningSignal>;
  errorByQuestionId: Map<string, UserErrorRecord>;
  targetAggregates: Map<string, AggregateSignal>;
  skillAggregates: Map<string, AggregateSignal>;
  unitAggregates: Map<string, AggregateSignal>;
};

type SelectionState = {
  selectedQuestionIds: Set<string>;
  selectedBaseQuestionIds: Set<string>;
  knowledgeTargetCounts: Map<string, number>;
  skillCounts: Map<string, number>;
};

const adaptiveSessionCache = new Map<string, AdaptiveCacheEntry>();
const storedSessions = new Map<string, StoredAdaptiveSession>();

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function getAdaptiveCacheKey(options: AdaptiveSessionOptions) {
  return JSON.stringify({
    userId: options.userId,
    developerOverride: options.developerOverride ?? false,
    mode: options.mode,
    targetUnitId: options.targetUnitId ?? null,
    targetLessonId: options.targetLessonId ?? null,
    sessionSize: options.sessionSize ?? 10,
    seed: options.seed ?? null,
  });
}

function getSessionLabel(mode: AdaptiveSessionMode) {
  const label = SESSION_LABELS[mode];

  return {
    en: label.en,
    vi: label.vi,
  };
}

function getDefaultSeed(options: AdaptiveSessionOptions, now: Date) {
  return [
    options.userId,
    options.mode,
    options.targetUnitId ?? "all",
    options.targetLessonId ?? "all",
    now.toISOString().slice(0, 10),
  ].join(":");
}

function sortByDeterministicHash<T>(
  items: T[],
  seed: string,
  getKey: (item: T) => string,
) {
  return [...items].sort((left, right) => {
    const leftHash = hashString(`${seed}:${getKey(left)}`);
    const rightHash = hashString(`${seed}:${getKey(right)}`);

    if (leftHash !== rightHash) {
      return leftHash - rightHash;
    }

    return getKey(left).localeCompare(getKey(right));
  });
}

function getDominantFingerprintType(fingerprintCounts: Record<string, number>) {
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

function getProgressionContext(
  progress: Awaited<ReturnType<typeof getUserProgress>>,
  developerOverride = false,
  targetUnitId?: string,
) {
  const activeUnit = getCurrentUnit(progress, developerOverride);
  const targetUnit = targetUnitId ? getRuntimeUnitById(targetUnitId) : null;
  const unlockedTargetUnit =
    targetUnit && isUnitUnlocked(progress, targetUnit.id, developerOverride) ? targetUnit : null;
  const effectiveUnit = unlockedTargetUnit ?? activeUnit;
  const currentNode = effectiveUnit ? getCurrentNode(effectiveUnit, progress, developerOverride) : null;

  return {
    activeUnitId: effectiveUnit?.id,
    currentNodeOrder: currentNode?.order,
  };
}

function getBucketTargets(mode: AdaptiveSessionMode, sessionSize: number) {
  const ratios = MODE_BUCKET_RATIOS[mode];
  const orderedSources: AdaptiveSelectionSource[] = [
    "progression",
    "due_review",
    "weak_reinforcement",
    "confidence_builder",
  ];
  const counts = new Map<AdaptiveSelectionSource, number>();
  const remainders = orderedSources.map((source) => {
    const exact = sessionSize * ratios[source];
    const floorValue = Math.floor(exact);
    counts.set(source, floorValue);

    return {
      source,
      remainder: exact - floorValue,
    };
  });

  const allocated = orderedSources.reduce((sum, source) => sum + (counts.get(source) ?? 0), 0);
  const remainderCount = sessionSize - allocated;

  for (const remainder of [...remainders]
    .sort((left, right) => {
      if (right.remainder !== left.remainder) {
        return right.remainder - left.remainder;
      }

      return orderedSources.indexOf(left.source) - orderedSources.indexOf(right.source);
    })
    .slice(0, remainderCount)) {
    counts.set(remainder.source, (counts.get(remainder.source) ?? 0) + 1);
  }

  if (mode !== "weak_points" && sessionSize >= 2 && (counts.get("progression") ?? 0) < 2) {
    let needed = 2 - (counts.get("progression") ?? 0);
    counts.set("progression", 2);

    for (const source of ["due_review", "weak_reinforcement", "confidence_builder"] as const) {
      while (needed > 0 && (counts.get(source) ?? 0) > 0) {
        counts.set(source, (counts.get(source) ?? 0) - 1);
        needed -= 1;
      }
    }
  }

  if (mode === "weak_points" && sessionSize >= 1 && (counts.get("confidence_builder") ?? 0) < 1) {
    counts.set("confidence_builder", 1);

    for (const source of ["due_review", "weak_reinforcement", "progression"] as const) {
      if ((counts.get(source) ?? 0) > 0) {
        counts.set(source, (counts.get(source) ?? 0) - 1);
        break;
      }
    }
  }

  return counts;
}

function createAggregate(id: string, label: string): AggregateSignal {
  return {
    id,
    label,
    wrongCount: 0,
    seenCount: 0,
    weightedWrongScore: 0,
    repeatedFailureStreak: 0,
    dueErrorCount: 0,
    maxCurrentErrorCount: 0,
    fingerprintCounts: {},
    strongestQuestionScore: Number.NEGATIVE_INFINITY,
  };
}

function updateAggregate(
  aggregate: AggregateSignal,
  signal: QuestionLearningSignal,
  questionId: string,
) {
  aggregate.wrongCount += signal.wrongCount;
  aggregate.seenCount += signal.seenCount;
  aggregate.weightedWrongScore += signal.weightedWrongScore;
  aggregate.repeatedFailureStreak = Math.max(
    aggregate.repeatedFailureStreak,
    signal.repeatedFailureStreak,
  );
  aggregate.dueErrorCount += signal.hasDueError ? 1 : 0;
  aggregate.maxCurrentErrorCount = Math.max(
    aggregate.maxCurrentErrorCount,
    signal.currentErrorCount,
  );

  if (signal.latestFingerprintType) {
    aggregate.fingerprintCounts[signal.latestFingerprintType] =
      (aggregate.fingerprintCounts[signal.latestFingerprintType] ?? 0) + 1;
  }

  const candidateScore =
    signal.weightedWrongScore + signal.currentErrorCount + signal.repeatedFailureStreak;

  if (candidateScore > aggregate.strongestQuestionScore) {
    aggregate.strongestQuestionScore = candidateScore;
    aggregate.strongestQuestionId = questionId;
  }
}

function createSyntheticSignalFromError(
  questionId: string,
  errorRecord: UserErrorRecord,
  latestFingerprintType?: string,
  now?: Date,
): QuestionLearningSignal {
  return {
    questionId,
    wrongCount: errorRecord.errorCount,
    seenCount: errorRecord.errorCount,
    uniqueWrongCount: 1,
    repeatedWrongCount: Math.max(0, errorRecord.errorCount - 1),
    repeatedFailureStreak: errorRecord.errorCount,
    weightedWrongScore: errorRecord.errorCount,
    recentWrongCount:
      now && errorRecord.lastSeenAt.getTime() >= now.getTime() - 14 * 24 * 60 * 60 * 1000 ? 1 : 0,
    previousWrongCount: 0,
    hasDueError: errorRecord.nextReviewAt.getTime() <= (now ?? new Date()).getTime(),
    currentErrorCount: errorRecord.errorCount,
    latestFingerprintType,
    lastAttemptAt: errorRecord.lastSeenAt,
    lastIncorrectAt: errorRecord.lastSeenAt,
    errorRate: 1,
  };
}

function buildAggregateMaps(questionSignals: Map<string, QuestionLearningSignal>) {
  const targetAggregates = new Map<string, AggregateSignal>();
  const skillAggregates = new Map<string, AggregateSignal>();
  const unitAggregates = new Map<string, AggregateSignal>();

  for (const [questionId, signal] of questionSignals.entries()) {
    const metadata = resolveHeatmapMetadataForQuestion(questionId);

    if (!metadata) {
      continue;
    }

    const skillAggregate =
      skillAggregates.get(metadata.skillType) ??
      createAggregate(metadata.skillType, metadata.skillType);
    updateAggregate(skillAggregate, signal, questionId);
    skillAggregates.set(metadata.skillType, skillAggregate);

    const unitAggregate =
      unitAggregates.get(metadata.unitId) ??
      createAggregate(metadata.unitId, metadata.unitLabel);
    updateAggregate(unitAggregate, signal, questionId);
    unitAggregates.set(metadata.unitId, unitAggregate);

    for (const target of metadata.knowledgeTargets) {
      const targetAggregate =
        targetAggregates.get(target.id) ?? createAggregate(target.id, target.label);
      updateAggregate(targetAggregate, signal, questionId);
      targetAggregates.set(target.id, targetAggregate);
    }
  }

  return {
    targetAggregates,
    skillAggregates,
    unitAggregates,
  };
}

function getAggregateErrorRate(aggregate: AggregateSignal | undefined) {
  if (!aggregate || aggregate.seenCount === 0) {
    return 0;
  }

  return aggregate.wrongCount / aggregate.seenCount;
}

function getWeaknessWeight(
  context: AdaptiveContext,
  metadata: NonNullable<ReturnType<typeof resolveHeatmapMetadataForQuestion>>,
) {
  const targetStrength = metadata.knowledgeTargets.reduce((maximum, target) => {
    const aggregate = context.targetAggregates.get(target.id);

    if (!aggregate) {
      return maximum;
    }

    const score =
      Math.min(18, getAggregateErrorRate(aggregate) * 18) +
      Math.min(10, aggregate.weightedWrongScore * 4) +
      Math.min(5, aggregate.repeatedFailureStreak * 2) +
      Math.min(2, aggregate.dueErrorCount);

    return Math.max(maximum, score);
  }, 0);
  const skillAggregate = context.skillAggregates.get(metadata.skillType);
  const unitAggregate = context.unitAggregates.get(metadata.unitId);
  const overlapBonus =
    (skillAggregate && getAggregateErrorRate(skillAggregate) >= 0.35 ? 2 : 0) +
    (unitAggregate && getAggregateErrorRate(unitAggregate) >= 0.35 ? 2 : 0);

  return clamp(Math.round(targetStrength + overlapBonus), 0, 35);
}

function getRecencyDueWeight(candidate: AdaptiveCandidate, now: Date) {
  if (!candidate.dueAt) {
    return 0;
  }

  if (candidate.dueAt.getTime() <= now.getTime()) {
    return 20;
  }

  if (candidate.dueAt.getTime() <= now.getTime() + 12 * 60 * 60 * 1000) {
    return 10;
  }

  return 0;
}

function getRepeatedErrorWeight(candidate: AdaptiveCandidate, baseSignal?: QuestionLearningSignal) {
  const errorCount = Math.max(candidate.errorCount, baseSignal?.currentErrorCount ?? 0);
  const streak = baseSignal?.repeatedFailureStreak ?? 0;

  return clamp(Math.max(0, (errorCount - 1) * 4) + Math.max(0, (streak - 1) * 3), 0, 15);
}

function getFingerprintPriorityWeight(
  candidate: AdaptiveCandidate,
  baseSignal: QuestionLearningSignal | undefined,
  context: AdaptiveContext,
) {
  const fingerprintType =
    baseSignal?.latestFingerprintType ||
    candidate.targetIds
      .map((targetId) => context.targetAggregates.get(targetId))
      .map((aggregate) => getDominantFingerprintType(aggregate?.fingerprintCounts ?? {}))
      .find(Boolean);

  return FINGERPRINT_PRIORITY[fingerprintType ?? ""] ?? 0;
}

function getProgressionRelevanceWeight(
  context: AdaptiveContext,
  metadata: NonNullable<ReturnType<typeof resolveHeatmapMetadataForQuestion>>,
) {
  if (context.targetLessonId && metadata.lessonId === context.targetLessonId) {
    return 15;
  }

  const referenceUnitId = context.targetUnitId ?? context.activeUnitId;

  if (referenceUnitId && metadata.unitId === referenceUnitId) {
    return context.targetUnitId ? 8 : 12;
  }

  const referenceIndex = referenceUnitId ? context.unitIndexById.get(referenceUnitId) : undefined;
  const candidateIndex = context.unitIndexById.get(metadata.unitId);

  if (
    typeof referenceIndex === "number" &&
    typeof candidateIndex === "number" &&
    Math.abs(referenceIndex - candidateIndex) === 1
  ) {
    return 4;
  }

  return 0;
}

function getOverexposurePenalty(
  candidate: AdaptiveCandidate,
  state: SelectionState,
  signal: QuestionLearningSignal | undefined,
  metadata: NonNullable<ReturnType<typeof resolveHeatmapMetadataForQuestion>>,
  now: Date,
) {
  if (state.selectedQuestionIds.has(candidate.entry.questionId)) {
    return 20;
  }

  let penalty = 0;

  for (const targetId of candidate.targetIds) {
    penalty += (state.knowledgeTargetCounts.get(targetId) ?? 0) * 6;
  }

  penalty += (state.skillCounts.get(metadata.skillType) ?? 0) * 4;

  if (signal?.lastAttemptAt) {
    const ageMs = now.getTime() - signal.lastAttemptAt.getTime();

    if (ageMs <= 60 * 60 * 1000) {
      penalty += 14;
    } else if (ageMs <= 12 * 60 * 60 * 1000) {
      penalty += 10;
    } else if (ageMs <= 24 * 60 * 60 * 1000) {
      penalty += 6;
    } else if (ageMs <= 72 * 60 * 60 * 1000) {
      penalty += 3;
    }
  }

  return clamp(penalty, 0, 20);
}

function buildCandidateReason(
  candidate: AdaptiveCandidate,
  breakdown: AdaptiveWeightBreakdown,
  baseSignal?: QuestionLearningSignal,
) {
  const parts: string[] = [candidate.fallbackReason];

  if (breakdown.recencyDueWeight > 0) {
    parts.push(breakdown.recencyDueWeight === 20 ? "due now" : "due soon");
  }

  if (baseSignal?.latestFingerprintType) {
    parts.push(baseSignal.latestFingerprintType.toLowerCase().replace(/_/g, " "));
  }

  if (candidate.errorCount > 1) {
    parts.push(`repeat x${candidate.errorCount}`);
  }

  return parts.join(", ");
}

function scoreCandidate(
  candidate: AdaptiveCandidate,
  context: AdaptiveContext,
  state: SelectionState,
) {
  const metadata = resolveHeatmapMetadataForQuestion(candidate.entry.questionId);

  if (!metadata) {
    return null;
  }

  const baseSignal = candidate.baseQuestionId
    ? context.questionSignals.get(candidate.baseQuestionId) ??
      context.questionSignals.get(candidate.entry.questionId)
    : context.questionSignals.get(candidate.entry.questionId);
  const signal = context.questionSignals.get(candidate.entry.questionId);
  const weaknessWeight = getWeaknessWeight(context, metadata);
  const recencyDueWeight = getRecencyDueWeight(candidate, context.now);
  const repeatedErrorWeight = getRepeatedErrorWeight(candidate, baseSignal);
  const fingerprintPriorityWeight = getFingerprintPriorityWeight(candidate, baseSignal, context);
  const progressionRelevanceWeight = getProgressionRelevanceWeight(context, metadata);
  const overexposurePenalty = getOverexposurePenalty(
    candidate,
    state,
    signal,
    metadata,
    context.now,
  );
  const totalScore =
    weaknessWeight +
    recencyDueWeight +
    repeatedErrorWeight +
    fingerprintPriorityWeight +
    progressionRelevanceWeight -
    overexposurePenalty;

  const breakdown: AdaptiveWeightBreakdown = {
    weaknessWeight,
    recencyDueWeight,
    repeatedErrorWeight,
    fingerprintPriorityWeight,
    progressionRelevanceWeight,
    overexposurePenalty,
    totalScore,
  };

  return {
    ...candidate,
    breakdown,
    reason: buildCandidateReason(candidate, breakdown, baseSignal),
  } satisfies ScoredCandidate;
}

function canSelectCandidate(
  candidate: AdaptiveCandidate,
  state: SelectionState,
  allowOverflow: boolean,
) {
  if (state.selectedQuestionIds.has(candidate.entry.questionId)) {
    return false;
  }

  if (candidate.baseQuestionId && state.selectedBaseQuestionIds.has(candidate.baseQuestionId)) {
    return false;
  }

  const metadata = resolveHeatmapMetadataForQuestion(candidate.entry.questionId);

  if (!metadata) {
    return false;
  }

  if (!allowOverflow) {
    if ((state.skillCounts.get(metadata.skillType) ?? 0) >= 3) {
      return false;
    }

    if (metadata.knowledgeTargets.some((target) => (state.knowledgeTargetCounts.get(target.id) ?? 0) >= 2)) {
      return false;
    }
  }

  return true;
}

function updateSelectionState(state: SelectionState, candidate: AdaptiveCandidate) {
  const metadata = resolveHeatmapMetadataForQuestion(candidate.entry.questionId);

  state.selectedQuestionIds.add(candidate.entry.questionId);

  if (candidate.baseQuestionId) {
    state.selectedBaseQuestionIds.add(candidate.baseQuestionId);
  }

  if (!metadata) {
    return;
  }

  state.skillCounts.set(metadata.skillType, (state.skillCounts.get(metadata.skillType) ?? 0) + 1);

  for (const target of metadata.knowledgeTargets) {
    state.knowledgeTargetCounts.set(
      target.id,
      (state.knowledgeTargetCounts.get(target.id) ?? 0) + 1,
    );
  }
}

function buildContextReasonLabel(source: AdaptiveSelectionSource) {
  switch (source) {
    case "progression":
      return "current path";
    case "due_review":
      return "due review";
    case "weak_reinforcement":
      return "weak concept";
    case "confidence_builder":
      return "confidence builder";
    default:
      return "adaptive";
  }
}

function buildAdaptiveSessionItem(
  context: AdaptiveContext,
  candidate: ScoredCandidate,
  includeDebug: boolean,
): AdaptiveSessionItem {
  const sessionLabel = getSessionLabel(context.mode);
  const item = createPracticeQuestionFromRuntimeTask(candidate.entry, {
    source: candidate.selectionSource,
    errorCount: candidate.errorCount,
    sentenceSeenCounts: context.progress.sentenceExposures,
  });
  const selectionDebug: AdaptiveSelectionDebug | undefined = includeDebug
    ? {
        questionId: candidate.entry.questionId,
        selectionSource: candidate.selectionSource,
        variantType: candidate.variantType,
        weightBreakdown: candidate.breakdown,
        reason: candidate.reason,
        relatedFromQuestionId: candidate.relatedFromQuestionId,
        targetIds: candidate.targetIds,
      }
    : undefined;

  return {
    ...item,
    sessionLabel,
    selectionSource: candidate.selectionSource,
    variantType: candidate.variantType,
    relatedFromQuestionId: candidate.relatedFromQuestionId,
    selectionDebug,
  };
}

function buildProgressionCandidates(context: AdaptiveContext) {
  const referenceUnitId = context.targetUnitId ?? context.activeUnitId;

  return context.unlockedEntries
    .filter((entry) => {
      if (!referenceUnitId) {
        return true;
      }

      const candidateIndex = context.unitIndexById.get(entry.unit.id);
      const referenceIndex = context.unitIndexById.get(referenceUnitId);

      if (entry.unit.id === referenceUnitId) {
        return true;
      }

      if (typeof candidateIndex === "number" && typeof referenceIndex === "number") {
        return Math.abs(candidateIndex - referenceIndex) <= 1;
      }

      return false;
    })
    .map((entry) => ({
      entry,
      selectionSource: "progression",
      errorCount: context.questionSignals.get(entry.questionId)?.currentErrorCount ?? 0,
      variantType: "exact",
      targetIds:
        resolveHeatmapMetadataForQuestion(entry.questionId)?.knowledgeTargets.map((target) => target.id) ?? [],
      fallbackReason: buildContextReasonLabel("progression"),
    } satisfies AdaptiveCandidate));
}

function buildDueReviewCandidates(context: AdaptiveContext) {
  const dueSoonThreshold = context.now.getTime() + 12 * 60 * 60 * 1000;
  const candidatesByQuestionId = new Map<string, AdaptiveCandidate>();
  const errorRecords = [...context.errorByQuestionId.values()]
    .filter(
      (record) =>
        record.nextReviewAt.getTime() <= dueSoonThreshold || record.errorCount >= 2,
    )
    .sort((left, right) => {
      const leftOverdue = left.nextReviewAt.getTime() <= context.now.getTime();
      const rightOverdue = right.nextReviewAt.getTime() <= context.now.getTime();

      if (leftOverdue !== rightOverdue) {
        return leftOverdue ? -1 : 1;
      }

      if (right.errorCount !== left.errorCount) {
        return right.errorCount - left.errorCount;
      }

      return left.nextReviewAt.getTime() - right.nextReviewAt.getTime();
    });

  for (const record of errorRecords) {
    const variant = resolveAdaptiveVariant({
      baseQuestionId: record.questionId,
      errorCount: record.errorCount,
      unlockedQuestionIds: context.unlockedQuestionIds,
    });

    if (!variant) {
      continue;
    }

    const metadata = resolveHeatmapMetadataForQuestion(variant.entry.questionId);

    if (!metadata) {
      continue;
    }

    const existing = candidatesByQuestionId.get(variant.entry.questionId);
    const candidate = {
      entry: variant.entry,
      selectionSource: "due_review",
      errorCount: record.errorCount,
      dueAt: record.nextReviewAt,
      baseQuestionId: record.questionId,
      relatedFromQuestionId: variant.relatedFromQuestionId,
      variantType: variant.variantType,
      targetIds: metadata.knowledgeTargets.map((target) => target.id),
      fallbackReason: buildContextReasonLabel("due_review"),
    } satisfies AdaptiveCandidate;

    if (!existing || candidate.errorCount > existing.errorCount) {
      candidatesByQuestionId.set(variant.entry.questionId, candidate);
    }
  }

  return [...candidatesByQuestionId.values()];
}

function buildWeakReinforcementCandidates(context: AdaptiveContext) {
  const targetEntries = [...context.targetAggregates.values()]
    .filter((aggregate) => aggregate.wrongCount > 0)
    .sort((left, right) => {
      if (right.weightedWrongScore !== left.weightedWrongScore) {
        return right.weightedWrongScore - left.weightedWrongScore;
      }

      return right.repeatedFailureStreak - left.repeatedFailureStreak;
    })
    .slice(0, 10);
  const candidatesByQuestionId = new Map<string, AdaptiveCandidate>();

  for (const targetAggregate of targetEntries) {
    const relatedEntries = listRuntimeTaskEntriesByKnowledgeTarget(targetAggregate.id).filter((entry) =>
      context.unlockedQuestionIds.has(entry.questionId),
    );
    const baseQuestionId = targetAggregate.strongestQuestionId;
    const preferredEntries =
      baseQuestionId && relatedEntries.some((entry) => entry.questionId !== baseQuestionId)
        ? relatedEntries.filter((entry) => entry.questionId !== baseQuestionId)
        : relatedEntries;

    for (const entry of preferredEntries.slice(0, 6)) {
      const metadata = resolveHeatmapMetadataForQuestion(entry.questionId);

      if (!metadata) {
        continue;
      }

      const baseSignal = baseQuestionId ? context.questionSignals.get(baseQuestionId) : undefined;
      const existing = candidatesByQuestionId.get(entry.questionId);
      const candidate = {
        entry,
        selectionSource: "weak_reinforcement",
        errorCount: baseSignal?.currentErrorCount ?? targetAggregate.maxCurrentErrorCount,
        baseQuestionId,
        relatedFromQuestionId:
          baseQuestionId && baseQuestionId !== entry.questionId ? baseQuestionId : undefined,
        variantType:
          baseQuestionId && baseQuestionId !== entry.questionId
            ? "related_task_variant"
            : baseSignal?.currentErrorCount
              ? "interaction_mode_variant"
              : "exact",
        targetIds: metadata.knowledgeTargets.map((target) => target.id),
        fallbackReason: `${buildContextReasonLabel("weak_reinforcement")}: ${targetAggregate.label}`,
      } satisfies AdaptiveCandidate;

      if (!existing || candidate.errorCount > existing.errorCount) {
        candidatesByQuestionId.set(entry.questionId, candidate);
      }
    }
  }

  return [...candidatesByQuestionId.values()];
}

function buildConfidenceBuilderCandidates(context: AdaptiveContext) {
  return context.unlockedEntries
    .filter((entry) => {
      const signal = context.questionSignals.get(entry.questionId);

      if (!signal) {
        return entry.unit.id === (context.targetUnitId ?? context.activeUnitId);
      }

      return (
        signal.errorRate <= 0.2 &&
        !signal.hasDueError &&
        signal.repeatedFailureStreak === 0
      );
    })
    .map((entry) => ({
      entry,
      selectionSource: "confidence_builder",
      errorCount: 0,
      variantType: "exact",
      targetIds:
        resolveHeatmapMetadataForQuestion(entry.questionId)?.knowledgeTargets.map((target) => target.id) ?? [],
      fallbackReason: buildContextReasonLabel("confidence_builder"),
    } satisfies AdaptiveCandidate));
}

function pickCandidates(
  source: AdaptiveSelectionSource,
  candidates: AdaptiveCandidate[],
  count: number,
  context: AdaptiveContext,
  state: SelectionState,
  selected: ScoredCandidate[],
  allowOverflow = false,
) {
  while (count > 0) {
    const ranked = candidates
      .filter((candidate) => candidate.selectionSource === source)
      .filter((candidate) => canSelectCandidate(candidate, state, allowOverflow))
      .map((candidate) => scoreCandidate(candidate, context, state))
      .filter((candidate): candidate is ScoredCandidate => candidate !== null)
      .sort((left, right) => {
        if (right.breakdown.totalScore !== left.breakdown.totalScore) {
          return right.breakdown.totalScore - left.breakdown.totalScore;
        }

        const leftHash = hashString(`${context.seedKey}:${source}:${left.entry.questionId}`);
        const rightHash = hashString(`${context.seedKey}:${source}:${right.entry.questionId}`);

        if (leftHash !== rightHash) {
          return leftHash - rightHash;
        }

        return left.entry.questionId.localeCompare(right.entry.questionId);
      });

    if (!ranked.length) {
      break;
    }

    const selectedCandidate = ranked[0];
    updateSelectionState(state, selectedCandidate);
    selected.push(selectedCandidate);
    count -= 1;
  }
}

function cleanupStoredSessions() {
  const cutoff = Date.now() - SESSION_STORE_TTL_MS;

  for (const [sessionId, session] of storedSessions.entries()) {
    if (session.createdAt < cutoff) {
      storedSessions.delete(sessionId);
    }
  }
}

async function buildAdaptiveContext(options: AdaptiveSessionOptions): Promise<AdaptiveContext> {
  const now = new Date();
  const progress = await getUserProgress(options.userId);
  const unlockedEntries = listUnlockedRuntimeTaskEntries(
    progress,
    options.developerOverride ?? false,
  );
  const unlockedQuestionIds = new Set(unlockedEntries.map((entry) => entry.questionId));
  const existingErrors = await listUserErrors(options.userId);
  const relevantQuestionIds = [
    ...new Set([
      ...unlockedEntries.map((entry) => entry.questionId),
      ...existingErrors.map((record) => record.questionId),
    ]),
  ];
  const [attempts, fingerprints] = await Promise.all([
    listUserQuestionAttempts(options.userId),
    findLatestUserErrorFingerprintsByQuestionIds(options.userId, relevantQuestionIds),
  ]);
  const errorByQuestionId = new Map(existingErrors.map((record) => [record.questionId, record]));
  const fingerprintByQuestionId = new Map(
    fingerprints.map((record) => [record.questionId, record]),
  );
  const questionSignals = buildQuestionLearningSignals(
    groupAttemptsByQuestionId(attempts),
    errorByQuestionId,
    fingerprintByQuestionId,
    now,
  );

  for (const [questionId, errorRecord] of errorByQuestionId.entries()) {
    if (questionSignals.has(questionId) || !getRuntimeTaskEntry(questionId)) {
      continue;
    }

    questionSignals.set(
      questionId,
      createSyntheticSignalFromError(
        questionId,
        errorRecord,
        fingerprintByQuestionId.get(questionId)?.fingerprintType,
        now,
      ),
    );
  }

  const { targetAggregates, skillAggregates, unitAggregates } = buildAggregateMaps(questionSignals);
  const unitIndexById = new Map(runtimeUnitCatalog.map((unit, index) => [unit.id, index]));
  const progressionContext = getProgressionContext(
    progress,
    options.developerOverride ?? false,
    options.targetUnitId,
  );

  return {
    userId: options.userId,
    mode: options.mode,
    progress,
    now,
    seedKey: options.seed ?? getDefaultSeed(options, now),
    targetUnitId: options.targetUnitId,
    targetLessonId: options.targetLessonId,
    activeUnitId: progressionContext.activeUnitId,
    currentNodeOrder: progressionContext.currentNodeOrder,
    unitIndexById,
    unlockedEntries,
    unlockedQuestionIds,
    questionSignals,
    errorByQuestionId,
    targetAggregates,
    skillAggregates,
    unitAggregates,
  };
}

function composeAdaptiveItems(
  context: AdaptiveContext,
  sessionSize: number,
  includeDebug: boolean,
) {
  const bucketTargets = getBucketTargets(context.mode, sessionSize);
  const candidateGroups = {
    progression: buildProgressionCandidates(context),
    due_review: buildDueReviewCandidates(context),
    weak_reinforcement: buildWeakReinforcementCandidates(context),
    confidence_builder: buildConfidenceBuilderCandidates(context),
  };
  const selectionState: SelectionState = {
    selectedQuestionIds: new Set(),
    selectedBaseQuestionIds: new Set(),
    knowledgeTargetCounts: new Map(),
    skillCounts: new Map(),
  };
  const selectedCandidates: ScoredCandidate[] = [];

  for (const source of [
    "progression",
    "due_review",
    "weak_reinforcement",
    "confidence_builder",
  ] as const) {
    pickCandidates(
      source,
      candidateGroups[source],
      bucketTargets.get(source) ?? 0,
      context,
      selectionState,
      selectedCandidates,
    );
  }

  for (const source of [
    "due_review",
    "weak_reinforcement",
    "progression",
    "confidence_builder",
  ] as const) {
    if (selectedCandidates.length >= sessionSize) {
      break;
    }

    pickCandidates(
      source,
      candidateGroups[source],
      sessionSize - selectedCandidates.length,
      context,
      selectionState,
      selectedCandidates,
    );
  }

  for (const source of [
    "due_review",
    "weak_reinforcement",
    "progression",
    "confidence_builder",
  ] as const) {
    if (selectedCandidates.length >= sessionSize) {
      break;
    }

    pickCandidates(
      source,
      candidateGroups[source],
      sessionSize - selectedCandidates.length,
      context,
      selectionState,
      selectedCandidates,
      true,
    );
  }

  const items = sortByDeterministicHash(
    selectedCandidates.map((candidate) => buildAdaptiveSessionItem(context, candidate, includeDebug)),
    context.seedKey,
    (item) => item.questionId,
  ).slice(0, sessionSize);

  return {
    items,
    debug: includeDebug
      ? items
          .map((item) => item.selectionDebug)
          .filter((item): item is AdaptiveSelectionDebug => Boolean(item))
      : undefined,
  };
}

function logAdaptiveSelection(response: AdaptiveSessionResponse, userId: string) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info("[adaptive-session]", {
    userId,
    mode: response.mode,
    sessionId: response.sessionId,
    items: response.items.map((item) => ({
      questionId: item.questionId,
      selectionSource: item.selectionSource,
      variantType: item.variantType,
      reason: item.selectionDebug?.reason,
      score: item.selectionDebug?.weightBreakdown.totalScore,
    })),
  });
}

async function buildAdaptiveSession(options: AdaptiveSessionOptions) {
  const context = await buildAdaptiveContext(options);
  const sessionSize = clamp(options.sessionSize ?? 10, 1, 20);
  const includeDebug = Boolean(options.debug || process.env.NODE_ENV !== "production");
  const sessionId = randomUUID();
  const composed = composeAdaptiveItems(context, sessionSize, includeDebug);
  const response: AdaptiveSessionResponse = {
    sessionId,
    mode: options.mode,
    sessionLabel: getSessionLabel(options.mode),
    items: composed.items,
    debug: composed.debug,
  };

  cleanupStoredSessions();
  storedSessions.set(sessionId, {
    userId: options.userId,
    response,
    createdAt: Date.now(),
  });
  logAdaptiveSelection(response, options.userId);
  return response;
}

export function invalidateAdaptiveSessionCache(userId: string) {
  for (const [cacheKey] of adaptiveSessionCache.entries()) {
    if (cacheKey.includes(`"userId":"${userId}"`)) {
      adaptiveSessionCache.delete(cacheKey);
    }
  }

  for (const [sessionId, session] of storedSessions.entries()) {
    if (session.userId === userId) {
      storedSessions.delete(sessionId);
    }
  }
}

export async function generateAdaptiveSession(options: AdaptiveSessionOptions) {
  const cacheKey = getAdaptiveCacheKey(options);
  const cached = adaptiveSessionCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.response;
  }

  const response = await buildAdaptiveSession(options);
  adaptiveSessionCache.set(cacheKey, {
    response,
    expiresAt: Date.now() + ADAPTIVE_CACHE_TTL_MS,
  });
  return response;
}

export async function completeAdaptiveSession(input: {
  userId: string;
  sessionId: string;
  mode: AdaptiveSessionMode;
  targetUnitId?: string;
  targetLessonId?: string;
  sessionSize: number;
  selectedQuestionIds: string[];
  correctCount: number;
  totalCount: number;
}) {
  invalidateAdaptiveSessionCache(input.userId);
  const storedSession = storedSessions.get(input.sessionId);

  if (process.env.NODE_ENV !== "production") {
    console.info("[adaptive-session-complete]", {
      userId: input.userId,
      sessionId: input.sessionId,
      mode: input.mode,
      targetUnitId: input.targetUnitId,
      targetLessonId: input.targetLessonId,
      sessionSize: input.sessionSize,
      correctCount: input.correctCount,
      totalCount: input.totalCount,
      selectedQuestionIds: input.selectedQuestionIds,
      generatedItems: storedSession?.response.items.map((item) => ({
        questionId: item.questionId,
        selectionSource: item.selectionSource,
        variantType: item.variantType,
      })),
    });
  }

  storedSessions.delete(input.sessionId);

  return {
    sessionId: input.sessionId,
    mode: input.mode,
    accuracy: input.totalCount > 0 ? input.correctCount / input.totalCount : 0,
    completed: true,
  };
}

export async function getAdaptiveMixedPractice(userId: string, limit = 10, seed?: string) {
  return generateAdaptiveSession({
    userId,
    mode: "balanced_progress",
    sessionSize: limit,
    seed,
  });
}

export async function getAdaptiveWeakPointsPractice(
  userId: string,
  limit = 10,
  seed?: string,
) {
  return generateAdaptiveSession({
    userId,
    mode: "weak_points",
    sessionSize: limit,
    seed,
  });
}

export async function getAdaptiveFocusedReview(
  userId: string,
  targetUnitId: string,
  limit = 10,
  seed?: string,
) {
  return generateAdaptiveSession({
    userId,
    mode: "focused_review",
    targetUnitId,
    sessionSize: limit,
    seed,
  });
}
