import {
  getRuntimeTaskEntry,
  isSentenceCapableRuntimeTask,
  listRelatedRuntimeTaskEntries,
  resolveHeatmapMetadataForQuestion,
  type RuntimeTaskEntry,
} from "@/lib/runtime-task-index";
import type { AdaptiveVariantType } from "@/types/adaptive-learning";

type ResolveAdaptiveVariantOptions = {
  baseQuestionId: string;
  errorCount: number;
  unlockedQuestionIds?: Set<string>;
};

type AdaptiveVariantResolution = {
  entry: RuntimeTaskEntry;
  variantType: AdaptiveVariantType;
  relatedFromQuestionId?: string;
};

function scoreRelatedEntry(baseEntry: RuntimeTaskEntry, candidate: RuntimeTaskEntry, errorCount: number) {
  const baseMetadata = resolveHeatmapMetadataForQuestion(baseEntry.questionId);
  const candidateMetadata = resolveHeatmapMetadataForQuestion(candidate.questionId);
  let score = 0;

  if (candidate.unit.id === baseEntry.unit.id) {
    score += 10;
  }

  if (candidate.node.id === baseEntry.node.id) {
    score += 5;
  }

  if (candidate.task.type !== baseEntry.task.type) {
    score += 8;
  }

  if (candidate.task.interactionMode && candidate.task.interactionMode !== baseEntry.task.interactionMode) {
    score += 5;
  }

  if (candidateMetadata?.skillType !== baseMetadata?.skillType) {
    score += 6;
  }

  if (
    errorCount >= 3 &&
    (candidateMetadata?.skillType === "listening" || candidateMetadata?.skillType === "speaking")
  ) {
    score += 20;
  }

  if (candidate.task.sentenceKey && candidate.task.sentenceKey === baseEntry.task.sentenceKey) {
    score += 10;
  }

  return score;
}

export function resolveAdaptiveVariant(
  options: ResolveAdaptiveVariantOptions,
): AdaptiveVariantResolution | null {
  const baseEntry = getRuntimeTaskEntry(options.baseQuestionId);

  if (!baseEntry) {
    return null;
  }

  const relatedEntries = listRelatedRuntimeTaskEntries(options.baseQuestionId)
    .filter((candidate) =>
      options.unlockedQuestionIds ? options.unlockedQuestionIds.has(candidate.questionId) : true,
    )
    .sort((left, right) => {
      const scoreDelta =
        scoreRelatedEntry(baseEntry, right, options.errorCount) -
        scoreRelatedEntry(baseEntry, left, options.errorCount);

      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return left.questionId.localeCompare(right.questionId);
    });

  if (options.errorCount >= 2 && relatedEntries.length > 0) {
    return {
      entry: relatedEntries[0],
      variantType: "related_task_variant",
      relatedFromQuestionId: baseEntry.questionId,
    };
  }

  if (options.errorCount > 0 && isSentenceCapableRuntimeTask(baseEntry)) {
    return {
      entry: baseEntry,
      variantType: "interaction_mode_variant",
    };
  }

  if (options.errorCount > 1) {
    return {
      entry: baseEntry,
      variantType: "exact_fallback",
    };
  }

  return {
    entry: baseEntry,
    variantType: "exact",
  };
}
