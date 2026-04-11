import type { ProgressState, SentenceExposureMap } from "@/lib/progress-state";
import { resolveRuntimeTaskHeatmapMetadata } from "@/lib/error-heatmap-dimensions";
import {
  collectLessonSentenceDistractorPool,
  extractSentenceTask,
  generateSentenceTask,
  getSentenceSeenCount,
} from "@/lib/sentence-task-generator";
import { createSessionItemFromTask, getRuntimeTaskWeakLabel } from "@/lib/session";
import {
  getRuntimeLessonForNode,
  isNodeUnlocked,
  runtimeUnitCatalog,
} from "@/lib/units";
import type { RuntimeLesson, RuntimeTask } from "@/types/curriculum";
import type { RuntimeHeatmapMetadata } from "@/lib/error-heatmap-dimensions";
import type { ErrorType, PracticeQuestion } from "@/types/error-tracking";
import type { SessionItem, SupportedRuntimeTask } from "@/types/session";
import type { NodeDefinition, UnitDefinition } from "@/types/unit";

export type RuntimeTaskEntry = {
  questionId: string;
  unit: UnitDefinition;
  node: NodeDefinition;
  lesson: RuntimeLesson;
  task: RuntimeTask;
};

const runtimeTaskEntries: RuntimeTaskEntry[] = runtimeUnitCatalog.flatMap((unit) =>
  unit.nodes.flatMap((node) => {
    const lesson = getRuntimeLessonForNode(unit, node);

    if (!lesson) {
      return [];
    }

    return lesson.tasks.map((task) => ({
      questionId: task.id,
      unit,
      node,
      lesson,
      task,
    }));
  }),
);

const runtimeTaskEntryMap = new Map(
  runtimeTaskEntries.map((entry) => [entry.questionId, entry]),
);

const runtimeTaskMetadataEntries = runtimeTaskEntries.map((entry) => [
  entry.questionId,
  resolveRuntimeTaskHeatmapMetadata(entry),
] as const);

const runtimeTaskMetadataMap = new Map(runtimeTaskMetadataEntries);

function stringifyWeakLabel(entry: RuntimeTaskEntry) {
  const weakLabel = getRuntimeTaskWeakLabel(entry.task);

  if (typeof weakLabel === "string") {
    return weakLabel;
  }

  return weakLabel.en || weakLabel.vi || "";
}

function normalizeLookupValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function appendIndexedEntry(
  index: Map<string, RuntimeTaskEntry[]>,
  rawKey: string | undefined,
  entry: RuntimeTaskEntry,
) {
  const key = normalizeLookupValue(rawKey ?? "");

  if (!key) {
    return;
  }

  const existing = index.get(key) ?? [];
  existing.push(entry);
  index.set(key, existing);
}

const runtimeTaskEntriesBySentenceKey = new Map<string, RuntimeTaskEntry[]>();
const runtimeTaskEntriesByGrammarTag = new Map<string, RuntimeTaskEntry[]>();
const runtimeTaskEntriesByKnowledgeTarget = new Map<string, RuntimeTaskEntry[]>();
const runtimeTaskEntriesByWeakLabel = new Map<string, RuntimeTaskEntry[]>();

for (const entry of runtimeTaskEntries) {
  const metadata = runtimeTaskMetadataMap.get(entry.questionId);

  appendIndexedEntry(runtimeTaskEntriesBySentenceKey, entry.task.sentenceKey, entry);
  appendIndexedEntry(runtimeTaskEntriesByWeakLabel, stringifyWeakLabel(entry), entry);

  if ("koreanText" in entry.task && entry.task.koreanText) {
    appendIndexedEntry(runtimeTaskEntriesByWeakLabel, entry.task.koreanText, entry);
  }

  for (const grammarTag of entry.task.grammarTags) {
    appendIndexedEntry(runtimeTaskEntriesByGrammarTag, grammarTag, entry);
  }

  for (const target of metadata?.knowledgeTargets ?? []) {
    appendIndexedEntry(runtimeTaskEntriesByKnowledgeTarget, target.id, entry);
  }
}

export function getRuntimeTaskEntry(questionId: string) {
  return runtimeTaskEntryMap.get(questionId) ?? null;
}

export function resolveHeatmapMetadataForQuestion(questionId: string): RuntimeHeatmapMetadata | null {
  return runtimeTaskMetadataMap.get(questionId) ?? null;
}

export function listUnlockedRuntimeTaskEntries(progress: ProgressState) {
  return runtimeTaskEntries.filter((entry) => isNodeUnlocked(progress, entry.unit, entry.node.id));
}

export function inferRuntimeTaskErrorType(task: RuntimeTask): ErrorType {
  if (task.type === "listen_select") {
    return "listening";
  }

  if (task.type === "speaking") {
    return "speaking";
  }

  if (task.type === "grammar_select") {
    return "grammar";
  }

  if (task.type === "fill_blank" && task.grammarTags.length > 0) {
    return "grammar";
  }

  return "vocab";
}

export function getPracticeInteractionMode(errorCount: number) {
  if (errorCount <= 1) {
    return "hybrid" as const;
  }

  if (errorCount === 2) {
    return "word_bank" as const;
  }

  return "full_input" as const;
}

export function isSentenceCapableRuntimeTask(entry: RuntimeTaskEntry) {
  return Boolean(extractSentenceTask(entry.task));
}

export function listRuntimeTaskEntriesByKnowledgeTarget(targetId: string) {
  return runtimeTaskEntriesByKnowledgeTarget.get(normalizeLookupValue(targetId)) ?? [];
}

export function listRuntimeTaskEntriesByGrammarTag(grammarTag: string) {
  return runtimeTaskEntriesByGrammarTag.get(normalizeLookupValue(grammarTag)) ?? [];
}

export function listRuntimeTaskEntriesBySentenceKey(sentenceKey: string) {
  return runtimeTaskEntriesBySentenceKey.get(normalizeLookupValue(sentenceKey)) ?? [];
}

export function listRuntimeTaskEntriesByWeakLabel(label: string) {
  return runtimeTaskEntriesByWeakLabel.get(normalizeLookupValue(label)) ?? [];
}

export function listRelatedRuntimeTaskEntries(questionId: string) {
  const entry = getRuntimeTaskEntry(questionId);

  if (!entry) {
    return [];
  }

  const relatedEntries = new Map<string, RuntimeTaskEntry>();
  const metadata = resolveHeatmapMetadataForQuestion(questionId);

  for (const candidate of listRuntimeTaskEntriesBySentenceKey(entry.task.sentenceKey ?? "")) {
    if (candidate.questionId !== questionId) {
      relatedEntries.set(candidate.questionId, candidate);
    }
  }

  for (const grammarTag of entry.task.grammarTags) {
    for (const candidate of listRuntimeTaskEntriesByGrammarTag(grammarTag)) {
      if (candidate.questionId !== questionId) {
        relatedEntries.set(candidate.questionId, candidate);
      }
    }
  }

  for (const target of metadata?.knowledgeTargets ?? []) {
    for (const candidate of listRuntimeTaskEntriesByKnowledgeTarget(target.id)) {
      if (candidate.questionId !== questionId) {
        relatedEntries.set(candidate.questionId, candidate);
      }
    }
  }

  for (const candidate of listRuntimeTaskEntriesByWeakLabel(stringifyWeakLabel(entry))) {
    if (candidate.questionId !== questionId) {
      relatedEntries.set(candidate.questionId, candidate);
    }
  }

  return [...relatedEntries.values()];
}

function resolveTaskForSession(
  entry: RuntimeTaskEntry,
  sentenceSeenCounts: SentenceExposureMap,
  practiceErrorCount?: number,
) {
  const extractedTask = extractSentenceTask(entry.task);

  if (!extractedTask) {
    return entry.task as SupportedRuntimeTask;
  }

  return generateSentenceTask({
    ...extractedTask,
    unitLevel: entry.unit.unitNumber,
    seenCount: getSentenceSeenCount(extractedTask.sentenceKey, sentenceSeenCounts),
    distractorPool: collectLessonSentenceDistractorPool(entry.lesson),
    forcedInteractionMode:
      typeof practiceErrorCount === "number"
        ? getPracticeInteractionMode(practiceErrorCount)
        : undefined,
  }).task as SupportedRuntimeTask;
}

export function createSessionItemForRuntimeTask(
  entry: RuntimeTaskEntry,
  options: {
    sentenceSeenCounts?: SentenceExposureMap;
    practiceErrorCount?: number;
  } = {},
) {
  return createSessionItemFromTask(
    resolveTaskForSession(
      entry,
      options.sentenceSeenCounts ?? {},
      options.practiceErrorCount,
    ),
  );
}

export function createPracticeQuestionFromRuntimeTask(
  entry: RuntimeTaskEntry,
  options: {
    source: PracticeQuestion["source"];
    errorCount: number;
    sentenceSeenCounts?: SentenceExposureMap;
  },
): PracticeQuestion {
  const item = createSessionItemForRuntimeTask(entry, {
    sentenceSeenCounts: options.sentenceSeenCounts,
    practiceErrorCount:
      options.source === "due_review" || options.source === "weak_reinforcement"
        ? options.errorCount
        : undefined,
  });

  return {
    ...(item as SessionItem),
    questionId: entry.questionId,
    lessonId: entry.lesson.lessonId,
    unitId: entry.unit.id,
    source: options.source,
    errorCount: options.errorCount,
  };
}
