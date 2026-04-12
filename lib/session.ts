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
  ListeningSessionItem,
  LocalizedChoiceSessionItem,
  SessionDisplayText,
  SessionItem,
  SessionItemType,
  SpeakingSessionItem,
  SupportedRuntimeTask,
  TextInputSessionItem,
} from "@/types/session";
import type { SentenceExposureMap } from "@/lib/progress-state";

export const SESSION_XP_PER_CORRECT = 5;
export const WEAK_NODE_THRESHOLD = 0.6;

function getImageCardCorrectAnswer(
  task: Extract<RuntimeTask, { type: "word_match" | "listen_select" }>,
) {
  const correctChoice = task.choices.find((choice) => choice.id === task.answer);

  if (!correctChoice) {
    return task.answer;
  }

  if (task.presentation === "image_cards" && correctChoice.koreanLabel) {
    return {
      vi: `${correctChoice.koreanLabel} - ${correctChoice.text.vi}`,
      en: `${correctChoice.koreanLabel} - ${correctChoice.text.en}`,
    };
  }

  return correctChoice.text;
}

function createRetryClone(item: SessionItem) {
  return {
    ...item,
    id: `${item.id}-retry`,
    isRetry: true,
  } as SessionItem;
}

export function getRuntimeTaskCorrectAnswer(task: RuntimeTask): SessionDisplayText {
  if (task.type === "word_match" || task.type === "listen_select") {
    return getImageCardCorrectAnswer(task);
  }

  if (task.type === "listening") {
    if (
      task.listeningType === "yes_no" ||
      task.listeningType === "multiple_choice" ||
      task.listeningType === "choose_image"
    ) {
      const correctChoice = task.choices?.find((choice) => choice.id === task.correctChoiceId);
      return correctChoice?.text ?? task.correctChoiceId ?? "";
    }

    if (task.listeningType === "fill_blank") {
      return task.correctText ?? task.acceptedAnswers?.[0] ?? "";
    }

    const orderedChoices = (task.correctOrderChoiceIds ?? []).map((choiceId) => {
      const choiceEntry = task.choices?.find((choice) => choice.id === choiceId);
      return choiceEntry?.text.en || choiceEntry?.text.vi || choiceId;
    });

    return orderedChoices.join(" ");
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

export function getRuntimeTaskWeakLabel(task: RuntimeTask): SessionDisplayText {
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

  if (task.type === "listening") {
    return task.questionText ?? task.contextTitle ?? task.prompt;
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

export function createSessionItemFromTask(task: SupportedRuntimeTask): SessionItem {
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
    curriculumSource: task.source,
    grammarTags: task.grammarTags,
    srWeight: task.srWeight,
    errorPatternKey: task.errorPatternKey,
    weakItemLabel: getRuntimeTaskWeakLabel(task),
    correctAnswer: getRuntimeTaskCorrectAnswer(task),
    tracksServerState: true,
    interactionMode: task.interactionMode,
    sentenceKey: task.sentenceKey,
  } as const;

  if (task.type === "listening") {
    const item: ListeningSessionItem = {
      ...base,
      type: "listening",
      listeningType: task.listeningType,
      audioUrl: task.audioUrl,
      clipStartMs: task.clipStartMs,
      clipEndMs: task.clipEndMs,
      questionText: task.questionText,
      transcriptKo: task.transcriptKo,
      translation: task.translation,
      romanization: task.romanization,
      contextGroupId: task.contextGroupId,
      contextTitle: task.contextTitle,
      contextSummary: task.contextSummary,
      choices: task.choices,
      correctChoiceId: task.correctChoiceId,
      correctText: task.correctText,
      acceptedAnswers: task.acceptedAnswers,
      correctOrderChoiceIds: task.correctOrderChoiceIds,
    };
    return item;
  }

  if (task.type === "word_match" || task.type === "listen_select") {
    const item: LocalizedChoiceSessionItem = {
      ...base,
      type: task.type,
      koreanText: "koreanText" in task ? task.koreanText : undefined,
      choices: task.choices,
      answer: task.answer,
      audioText: task.audioText,
      audioUrl: task.audioUrl,
      presentation: task.presentation,
      questionText: task.questionText,
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
    createSessionItemFromTask(
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
    return getLocalizedText({ en: "Sentence Builder", vi: "Ghép câu" }, locale);
  }

  if (interactionMode === "hybrid") {
    return getLocalizedText({ en: "Complete Sentence", vi: "Hoàn thành câu" }, locale);
  }

  if (interactionMode === "full_input") {
    return getLocalizedText({ en: "Type Sentence", vi: "Nhập câu" }, locale);
  }

  if (type === "word_match") {
    return getLocalizedText({ en: "Word Match", vi: "Nối từ" }, locale);
  }

  if (type === "listen_select") {
    return getLocalizedText({ en: "Listen", vi: "Nghe" }, locale);
  }

  if (type === "listening") {
    return getLocalizedText({ en: "Listening", vi: "Nghe hiểu" }, locale);
  }

  if (type === "translate") {
    return getLocalizedText({ en: "Translate", vi: "Dịch" }, locale);
  }

  if (type === "translation_select") {
    return getLocalizedText({ en: "Select Translation", vi: "Chọn nghĩa" }, locale);
  }

  if (type === "arrange_sentence") {
    return getLocalizedText({ en: "Arrange", vi: "Sắp xếp" }, locale);
  }

  if (type === "sentence_build") {
    return getLocalizedText({ en: "Sentence Builder", vi: "Ghép câu" }, locale);
  }

  if (type === "reorder_sentence") {
    return getLocalizedText({ en: "Reorder", vi: "Sắp xếp lại" }, locale);
  }

  if (type === "fill_blank") {
    return getLocalizedText({ en: "Fill Blank", vi: "Điền khuyết" }, locale);
  }

  if (type === "grammar_select") {
    return getLocalizedText({ en: "Grammar", vi: "Ngữ pháp" }, locale);
  }

  if (type === "dialogue_reconstruct") {
    return getLocalizedText({ en: "Dialogue", vi: "Hội thoại" }, locale);
  }

  if (type === "dialogue_response") {
    return getLocalizedText({ en: "Dialogue Response", vi: "Đáp hội thoại" }, locale);
  }

  if (type === "listen_repeat") {
    return getLocalizedText({ en: "Listen & Repeat", vi: "Nghe và lặp lại" }, locale);
  }

  return getLocalizedText({ en: "Speaking", vi: "Nói" }, locale);
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
