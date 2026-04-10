import { getLocalizedText } from "@/lib/localized";
import {
  collectLessonSentenceDistractorPool,
  extractSentenceTask,
  generateSentenceTask,
  getSentenceSeenCount,
} from "@/lib/sentence-task-generator";
import type { AppLocale } from "@/types/app-locale";
import type { InteractionMode, RuntimeLesson, RuntimeTask } from "@/types/curriculum";
import type {
  ArrangeSessionItem,
  GrammarChoiceSessionItem,
  LocalizedChoiceSessionItem,
  SessionDisplayText,
  SessionItem,
  SessionItemType,
  SpeakingSessionItem,
  SupportedRuntimeTask,
  TextInputSessionItem,
} from "@/types/session";
import type { SentenceExposureMap } from "./storage";

export const SESSION_XP_PER_CORRECT = 5;
export const WEAK_NODE_THRESHOLD = 0.6;

function createRetryClone(item: SessionItem) {
  return {
    ...item,
    id: `${item.id}-retry`,
    isRetry: true,
  } as SessionItem;
}

function getCorrectAnswer(task: RuntimeTask): SessionDisplayText {
  if (task.type === "word_match" || task.type === "listen_select") {
    return task.choices.find((choice) => choice.id === task.answer)?.text ?? task.answer;
  }

  if (task.type === "translate") {
    if (task.direction === "ko_to_meaning") {
      return task.meaning;
    }

    return task.acceptedAnswers?.[0] ?? "";
  }

  if (task.type === "fill_blank") {
    return task.acceptedAnswers[0] ?? "";
  }

  if (task.type === "grammar_select") {
    return task.answer;
  }

  if (task.type === "arrange_sentence" || task.type === "dialogue_reconstruct") {
    return task.answer.join(" ");
  }

  return task.expectedSpeech;
}

function getWeakLabel(task: RuntimeTask): SessionDisplayText {
  if (task.type === "word_match") {
    return task.koreanText;
  }

  if (task.type === "grammar_select") {
    if (task.interactionMode === "hybrid" && task.supportText) {
      return task.supportText;
    }

    return task.koreanText;
  }

  if (task.type === "listen_select") {
    return task.supportText ?? task.audioText ?? task.prompt;
  }

  if (task.type === "translate") {
    if (task.direction === "meaning_to_ko") {
      return task.meaning;
    }

    return task.koreanText ?? task.meaning;
  }

  if (task.type === "fill_blank") {
    return task.koreanText;
  }

  if (task.type === "arrange_sentence") {
    return task.meaning;
  }

  if (task.type === "dialogue_reconstruct") {
    return task.translation;
  }

  return task.koreanText;
}

function createSessionItem(task: SupportedRuntimeTask): SessionItem {
  const base = {
    id: task.id,
    sourceId: task.id,
    type: task.type,
    isRetry: false,
    retryable: true,
    prompt: task.prompt,
    explanation: task.explanation,
    supportText: task.supportText,
    stage: task.stage,
    source: task.source,
    grammarTags: task.grammarTags,
    srWeight: task.srWeight,
    errorPatternKey: task.errorPatternKey,
    weakItemLabel: getWeakLabel(task),
    correctAnswer: getCorrectAnswer(task),
    interactionMode: task.interactionMode,
    sentenceKey: task.sentenceKey,
  } as const;

  if (task.type === "word_match" || task.type === "listen_select") {
    const item: LocalizedChoiceSessionItem = {
      ...base,
      type: task.type,
      koreanText: "koreanText" in task ? task.koreanText : undefined,
      choices: task.choices,
      answer: task.answer,
      audioText: task.audioText,
      audioUrl: task.audioUrl,
    };
    return item;
  }

  if (task.type === "grammar_select") {
    const item: GrammarChoiceSessionItem = {
      ...base,
      type: task.type,
      koreanText: task.koreanText,
      choices: task.choices,
      answer: task.answer,
    };
    return item;
  }

  if (task.type === "translate" || task.type === "fill_blank") {
    const item: TextInputSessionItem = {
      ...base,
      type: task.type,
      koreanText: "koreanText" in task ? task.koreanText : undefined,
      meaning: "meaning" in task ? task.meaning : undefined,
      acceptedAnswers: "acceptedAnswers" in task ? task.acceptedAnswers : undefined,
      choices: "choices" in task ? task.choices : undefined,
      placeholder: task.placeholder,
      clue: "clue" in task ? task.clue : undefined,
      direction: "direction" in task ? task.direction : undefined,
      audioText: task.audioText,
      audioUrl: task.audioUrl,
    };
    return item;
  }

  if (task.type === "arrange_sentence" || task.type === "dialogue_reconstruct") {
    const item: ArrangeSessionItem = {
      ...base,
      type: task.type,
      wordBank: task.wordBank,
      answer: task.answer,
      meaning: "meaning" in task ? task.meaning : undefined,
      speaker: "speaker" in task ? task.speaker : undefined,
      translation: "translation" in task ? task.translation : undefined,
    };
    return item;
  }

  const item: SpeakingSessionItem = {
    ...base,
    type: task.type,
    koreanText: task.koreanText,
    expectedSpeech: task.expectedSpeech,
  };

  return item;
}

export type CreateLessonSessionOptions = {
  unitLevel?: number;
  sentenceSeenCounts?: SentenceExposureMap;
};

function adaptSentenceTask(
  task: RuntimeTask,
  unitLevel: number,
  sentenceSeenCounts: SentenceExposureMap,
  distractorPool: string[],
) {
  const extractedTask = extractSentenceTask(task);

  if (!extractedTask) {
    return task as SupportedRuntimeTask;
  }

  return generateSentenceTask({
    ...extractedTask,
    unitLevel,
    seenCount: getSentenceSeenCount(extractedTask.sentenceKey, sentenceSeenCounts),
    distractorPool,
  }).task as SupportedRuntimeTask;
}

export function createLessonSession(
  lesson: RuntimeLesson,
  options: CreateLessonSessionOptions = {},
) {
  const unitLevel = options.unitLevel ?? 1;
  const sentenceSeenCounts = options.sentenceSeenCounts ?? {};
  const distractorPool = collectLessonSentenceDistractorPool(lesson);

  return lesson.tasks.map((task) =>
    createSessionItem(
      adaptSentenceTask(task, unitLevel, sentenceSeenCounts, distractorPool),
    ),
  );
}

export function getSessionItemTypeLabel(
  type: SessionItemType,
  locale: AppLocale = "en",
  interactionMode?: InteractionMode,
) {
  if (interactionMode === "word_bank") {
    return getLocalizedText({ en: "Sentence Builder", vi: "Ghep cau" }, locale);
  }

  if (interactionMode === "hybrid") {
    return getLocalizedText({ en: "Complete Sentence", vi: "Hoan thanh cau" }, locale);
  }

  if (interactionMode === "full_input") {
    return getLocalizedText({ en: "Type Sentence", vi: "Nhap cau" }, locale);
  }

  if (type === "word_match") {
    return getLocalizedText({ en: "Word Match", vi: "Noi tu" }, locale);
  }

  if (type === "listen_select") {
    return getLocalizedText({ en: "Listen", vi: "Nghe" }, locale);
  }

  if (type === "translate") {
    return getLocalizedText({ en: "Translate", vi: "Dich" }, locale);
  }

  if (type === "arrange_sentence") {
    return getLocalizedText({ en: "Arrange", vi: "Sap xep" }, locale);
  }

  if (type === "fill_blank") {
    return getLocalizedText({ en: "Fill Blank", vi: "Dien khuyet" }, locale);
  }

  if (type === "grammar_select") {
    return getLocalizedText({ en: "Grammar", vi: "Ngu phap" }, locale);
  }

  if (type === "dialogue_reconstruct") {
    return getLocalizedText({ en: "Dialogue", vi: "Hoi thoai" }, locale);
  }

  return getLocalizedText({ en: "Speaking", vi: "Noi" }, locale);
}

export function canQueueRetry(
  item: SessionItem,
  alreadyQueuedSources: Set<string>,
  currentLength: number,
  baseCount: number,
  maxRetries: number,
) {
  return (
    item.retryable &&
    !item.isRetry &&
    !alreadyQueuedSources.has(item.sourceId) &&
    currentLength < baseCount + maxRetries
  );
}

export function queueRetryItem(
  items: SessionItem[],
  item: SessionItem,
  alreadyQueuedSources: Set<string>,
  baseCount: number,
  maxRetries: number,
) {
  if (!canQueueRetry(item, alreadyQueuedSources, items.length, baseCount, maxRetries)) {
    return items;
  }

  return [...items, createRetryClone(item)];
}
