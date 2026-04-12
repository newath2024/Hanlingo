import { getRuntimeTaskCorrectAnswer, getRuntimeTaskWeakLabel } from "@/lib/session";
import type { RuntimeLesson, RuntimeTask } from "@/types/curriculum";
import type {
  HeatmapQuestionFormat,
  HeatmapSkillType,
  KnowledgeTargetKind,
} from "@/types/error-heatmap";
import type { SessionDisplayText } from "@/types/session";
import type { NodeDefinition, UnitDefinition } from "@/types/unit";

type RuntimeHeatmapInput = {
  questionId: string;
  unit: UnitDefinition;
  node: NodeDefinition;
  lesson: RuntimeLesson;
  task: RuntimeTask;
};

export type RuntimeKnowledgeTarget = {
  id: string;
  kind: KnowledgeTargetKind;
  label: string;
};

export type RuntimeHeatmapMetadata = {
  questionId: string;
  unitId: string;
  unitLabel: string;
  lessonId: string;
  lessonLabel: string;
  nodeId: string;
  nodeLabel: string;
  skillType: HeatmapSkillType;
  questionFormat: HeatmapQuestionFormat;
  knowledgeTargets: RuntimeKnowledgeTarget[];
  grammarTags: string[];
  coverageTags: string[];
  focusConcepts: string[];
};

function stringifyDisplayText(value: SessionDisplayText | undefined) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return value.en || value.vi || "";
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function dedupeTargets(targets: RuntimeKnowledgeTarget[]) {
  const seen = new Set<string>();
  const deduped: RuntimeKnowledgeTarget[] = [];

  for (const target of targets) {
    if (!target.label || seen.has(target.id)) {
      continue;
    }

    seen.add(target.id);
    deduped.push(target);
  }

  return deduped;
}

function includesReadingSignal(input: RuntimeHeatmapInput) {
  const lowerQuestionId = input.questionId.toLowerCase();
  const lessonTags = input.lesson.coverageTags.map((tag) => tag.toLowerCase());
  const nodeTags = input.node.coverageTags.map((tag) => tag.toLowerCase());
  const sourceExerciseIds = input.lesson.sourceExerciseIds.map((id) => id.toLowerCase());

  return (
    lowerQuestionId.includes("reading") ||
    lessonTags.includes("reading") ||
    nodeTags.includes("reading") ||
    sourceExerciseIds.some((id) => id.includes("reading")) ||
    input.lesson.focusConcepts.some((concept) => concept.toLowerCase().includes("reading"))
  );
}

function includesListeningSignal(input: RuntimeHeatmapInput) {
  const tags = [...input.lesson.coverageTags, ...input.node.coverageTags].map((tag) =>
    tag.toLowerCase(),
  );

  return (
    input.task.type === "listen_select" ||
    input.task.type === "listening" ||
    tags.includes("listening") ||
    tags.includes("qr-listening")
  );
}

export function inferHeatmapQuestionFormat(
  task: RuntimeTask,
): HeatmapQuestionFormat {
  if (task.type === "listening") {
    if (
      task.listeningType === "yes_no" ||
      task.listeningType === "multiple_choice" ||
      task.listeningType === "choose_image"
    ) {
      return "listening_select";
    }

    if (task.listeningType === "order_step") {
      return "reorder";
    }

    return "typing";
  }

  if (task.type === "listen_select") {
    return "listening_select";
  }

  if (task.type === "speaking") {
    return "speaking_repeat";
  }

  if (
    task.type === "arrange_sentence" ||
    task.type === "dialogue_reconstruct" ||
    task.interactionMode === "word_bank"
  ) {
    return "reorder";
  }

  if (task.type === "word_match" || task.type === "grammar_select") {
    return "multiple_choice";
  }

  return "typing";
}

export function inferHeatmapSkillType(input: RuntimeHeatmapInput): HeatmapSkillType {
  if (includesListeningSignal(input)) {
    return "listening";
  }

  if (input.task.type === "speaking") {
    return "speaking";
  }

  if (
    input.task.type === "arrange_sentence" ||
    input.task.type === "dialogue_reconstruct" ||
    input.task.interactionMode === "word_bank"
  ) {
    return "sentence_ordering";
  }

  if (input.task.type === "grammar_select" || input.task.grammarTags.length > 0) {
    return "grammar";
  }

  if (includesReadingSignal(input)) {
    return "reading";
  }

  return "vocab";
}

function buildFallbackTargetLabel(input: RuntimeHeatmapInput) {
  return (
    stringifyDisplayText(getRuntimeTaskWeakLabel(input.task)) ||
    stringifyDisplayText(getRuntimeTaskCorrectAnswer(input.task)) ||
    input.questionId
  );
}

function buildVocabTargetLabel(task: RuntimeTask) {
  if ("koreanText" in task && task.koreanText) {
    return task.koreanText;
  }

  if (task.type === "translate") {
    if (task.koreanText) {
      return task.koreanText;
    }

    if (task.acceptedAnswers?.length === 1) {
      return task.acceptedAnswers[0];
    }
  }

  if (task.type === "fill_blank" && task.acceptedAnswers.length === 1) {
    return task.acceptedAnswers[0];
  }

  if (task.type === "listening") {
    if (task.transcriptKo) {
      return task.transcriptKo;
    }

    if (task.questionText) {
      return stringifyDisplayText(task.questionText);
    }

    if (task.correctText) {
      return task.correctText;
    }

    if (task.acceptedAnswers?.length === 1) {
      return task.acceptedAnswers[0];
    }

    if (task.correctChoiceId) {
      const correctChoice = task.choices?.find((choice) => choice.id === task.correctChoiceId);
      return correctChoice?.text.en || correctChoice?.text.vi || "";
    }

    if (task.correctOrderChoiceIds?.length) {
      return task.correctOrderChoiceIds
        .map((choiceId) => {
          const choiceEntry = task.choices?.find((choice) => choice.id === choiceId);
          return choiceEntry?.text.en || choiceEntry?.text.vi || "";
        })
        .filter(Boolean)
        .join(" ");
    }
  }

  if (task.type === "listen_select") {
    if (task.audioText) {
      return task.audioText;
    }

    const correctChoice = task.choices.find((choice) => choice.id === task.answer);
    return correctChoice?.text.en || correctChoice?.text.vi || "";
  }

  if (task.type === "speaking") {
    return task.expectedSpeech;
  }

  return stringifyDisplayText(getRuntimeTaskCorrectAnswer(task));
}

export function buildKnowledgeTargets(input: RuntimeHeatmapInput): RuntimeKnowledgeTarget[] {
  const targets: RuntimeKnowledgeTarget[] = [];
  const skillType = inferHeatmapSkillType(input);

  for (const grammarTag of input.task.grammarTags) {
    targets.push({
      id: `grammar:${normalizeKey(grammarTag)}`,
      kind: "grammar_pattern",
      label: grammarTag,
    });
  }

  if (input.task.sentenceKey) {
    targets.push({
      id: `sentence:${normalizeKey(input.task.sentenceKey)}`,
      kind: "sentence_pattern",
      label:
        ("koreanText" in input.task && input.task.koreanText) ||
        stringifyDisplayText(getRuntimeTaskCorrectAnswer(input.task)),
    });
  }

  const vocabTarget = buildVocabTargetLabel(input.task);

  if (vocabTarget && (skillType === "vocab" || skillType === "listening")) {
    targets.push({
      id: `vocab:${normalizeKey(vocabTarget)}`,
      kind: "vocab",
      label: vocabTarget,
    });
  }

  if (targets.length === 0) {
    const fallbackLabel = buildFallbackTargetLabel(input);
    const fallbackKind: KnowledgeTargetKind =
      skillType === "grammar"
        ? "grammar_pattern"
        : skillType === "sentence_ordering" || skillType === "reading"
          ? "sentence_pattern"
          : "vocab";

    targets.push({
      id: `${fallbackKind}:${normalizeKey(fallbackLabel)}`,
      kind: fallbackKind,
      label: fallbackLabel,
    });
  }

  return dedupeTargets(targets);
}

export function resolveRuntimeTaskHeatmapMetadata(
  input: RuntimeHeatmapInput,
): RuntimeHeatmapMetadata {
  return {
    questionId: input.questionId,
    unitId: input.unit.id,
    unitLabel: `Unit ${input.unit.unitNumber}: ${input.unit.title.en || input.unit.title.vi}`,
    lessonId: input.lesson.lessonId,
    lessonLabel: `Lesson ${input.node.order}: ${input.lesson.title.en || input.lesson.title.vi}`,
    nodeId: input.node.id,
    nodeLabel: `Node ${input.node.order}: ${input.node.title.en || input.node.title.vi}`,
    skillType: inferHeatmapSkillType(input),
    questionFormat: inferHeatmapQuestionFormat(input.task),
    knowledgeTargets: buildKnowledgeTargets(input),
    grammarTags: input.task.grammarTags,
    coverageTags: input.lesson.coverageTags,
    focusConcepts: input.lesson.focusConcepts,
  };
}
