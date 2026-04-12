import type {
  CurriculumIndex,
  LessonRole,
  LocalizedChoice,
  LocalizedText,
  MeaningDirection,
  RuntimeLesson,
  RuntimeTask,
  RuntimeUnit,
  SourceAudioAsset,
  SourceDialogueLine,
  SourceUnit,
  SourceWorkbookExercise,
} from "@/types/curriculum";
import { runtimeUnitSchema, sourceUnitSchema } from "./schema";
import {
  getGeneratedIndexPath,
  getReviewedSourcePath,
  getRuntimeUnitPath,
  readJsonFile,
  writeJsonFile,
} from "./io";
import { maybeEnhanceRuntimeUnitWithOpenAI } from "./openai";

type GenerateOptions = { unitId: string; localOnly?: boolean };
type Lookups = ReturnType<typeof buildLookups>;
type FillBlankSlotKind = "noun_slot" | "tail_expression" | "lead_chunk" | "generic";
type VisualVocabEntry = {
  vocabId: string;
  korean: string;
  meaning: LocalizedText;
  imageUrl: string;
};
type SectionBlueprint = {
  sectionId: string;
  title: LocalizedText;
  summary: LocalizedText;
  lessonIds: string[];
};
type ManualLessonBlueprint = {
  lessonId: string;
  lessonRole: LessonRole;
  title: LocalizedText;
  summary: LocalizedText;
  focusConcepts: string[];
  exerciseIds: string[];
  extraTasks?: RuntimeTask[];
  taskOrdering?: "default" | "interleave_pairs";
};

const STAGE_ORDER: Record<RuntimeTask["stage"], number> = {
  recognition: 0,
  recall: 1,
  construction: 2,
  production: 3,
};

const FILL_BLANK_GRAMMAR_ENDINGS = new Set([
  "입니다",
  "입니까",
  "이에요",
  "예요",
  "은",
  "는",
  "이",
  "가",
  "도",
]);

const text = (vi: string, en = vi): LocalizedText => ({ vi, en });

const choice = (
  id: string,
  value: LocalizedText,
  imageUrl?: string,
  koreanLabel?: string,
): LocalizedChoice => ({
  id,
  text: value,
  ...(imageUrl ? { imageUrl } : {}),
  ...(koreanLabel ? { koreanLabel } : {}),
});

const answerText = (value: string | string[]) =>
  Array.isArray(value) ? value.join(" ") : value;

const answerList = (value: string | string[]) =>
  Array.isArray(value) ? [value.join(" "), ...value] : [value];

const splitWords = (value: string | string[]) =>
  answerText(value).split(/\s+/).filter(Boolean);

const srWeight = (stage: RuntimeTask["stage"], bonus = 0) =>
  Number(
    (
      {
        recognition: 1.1,
        recall: 1.35,
        construction: 1.7,
        production: 2.1,
      }[stage] + bonus
    ).toFixed(2),
  );

function normalizeKey(value: string) {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[.!?]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTrailingPunctuation(value: string) {
  return value.replace(/[.!?]+$/g, "").trim();
}

function containsHangul(value: string) {
  return /[\p{Script=Hangul}]/u.test(value);
}

function normalizeFillChoice(value: string) {
  return normalizeKey(stripTrailingPunctuation(value));
}

function isGrammarEndingBlank(answer: string) {
  return FILL_BLANK_GRAMMAR_ENDINGS.has(normalizeFillChoice(answer));
}

function getFillBlankSlotKind(koreanText: string): FillBlankSlotKind {
  const normalized = koreanText.replace(/_+/g, "___");

  if (/___\s*(입니다|입니까|이에요|예요)/.test(normalized)) {
    return "noun_slot";
  }

  if (/^\s*___/.test(normalized)) {
    return "lead_chunk";
  }

  if (/___\s*$/.test(normalized)) {
    return "tail_expression";
  }

  return "generic";
}

function fillBlankPrompt(hasChoices: boolean) {
  return hasChoices
    ? text("Hoàn thành câu sau.", "Complete the sentence.")
    : text("Điền vào chỗ trống.", "Fill in the blank.");
}

function maybeMeaningFromKorean(lookups: Lookups, koreanText: string) {
  const meaning = lookups.byKorean(koreanText);

  return normalizeKey(meaning.vi) === normalizeKey(koreanText) &&
    normalizeKey(meaning.en) === normalizeKey(koreanText)
    ? undefined
    : meaning;
}

function fillBlankSentenceWithAnswer(koreanText: string, answer: string) {
  return koreanText.replace(/_+/g, answer.trim());
}

function scoreFillBlankDistractor(
  candidate: string,
  correctAnswer: string,
  slotKind: FillBlankSlotKind,
) {
  const normalizedCandidate = stripTrailingPunctuation(candidate);
  const normalizedCorrectAnswer = stripTrailingPunctuation(correctAnswer);

  if (
    !normalizedCandidate ||
    normalizeFillChoice(normalizedCandidate) === normalizeFillChoice(normalizedCorrectAnswer)
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = -Math.abs(normalizedCandidate.length - normalizedCorrectAnswer.length);

  if (slotKind === "noun_slot") {
    if (
      !/(입니다|입니까|이에요|예요|습니다|어요|아요|다)$/.test(normalizedCandidate) &&
      !normalizedCandidate.includes(" ")
    ) {
      score += 5;
    }
  }

  if (slotKind === "tail_expression" && /(입니다|입니까|이에요|예요|습니다|어요|아요|다)$/.test(normalizedCandidate)) {
    score += 5;
  }

  if (
    slotKind === "lead_chunk" &&
    (/(은|는|도)$/.test(normalizedCandidate) || normalizedCandidate === "저" || normalizedCandidate === "저는" || normalizedCandidate === "저도")
  ) {
    score += 5;
  }

  if (normalizedCandidate.slice(-1) === normalizedCorrectAnswer.slice(-1)) {
    score += 1;
  }

  if (normalizedCandidate.slice(-2) === normalizedCorrectAnswer.slice(-2)) {
    score += 2;
  }

  return score;
}

function buildFillBlankChoices(
  correctAnswer: string,
  slotKind: FillBlankSlotKind,
  pool: string[],
  explicitChoices?: string[],
) {
  const normalizedCorrectAnswer = stripTrailingPunctuation(correctAnswer);
  const explicitDistractors = (explicitChoices ?? [])
    .map((entry) => stripTrailingPunctuation(entry))
    .filter(
      (entry, index, all) =>
        normalizeFillChoice(entry) !== normalizeFillChoice(normalizedCorrectAnswer) &&
        all.findIndex((candidate) => normalizeFillChoice(candidate) === normalizeFillChoice(entry)) === index,
    );

  if (explicitDistractors.length >= 2) {
    return [normalizedCorrectAnswer, ...explicitDistractors.slice(0, 2)];
  }

  const used = new Set<string>();
  const rankedPool = pool
    .map((entry) => stripTrailingPunctuation(entry))
    .filter((entry) => {
      const key = normalizeFillChoice(entry);

      if (!key || used.has(key)) {
        return false;
      }

      used.add(key);
      return key !== normalizeFillChoice(normalizedCorrectAnswer);
    })
    .map((entry) => ({
      entry,
      score: scoreFillBlankDistractor(entry, normalizedCorrectAnswer, slotKind),
    }))
    .sort((left, right) => right.score - left.score || left.entry.localeCompare(right.entry));

  return [
    normalizedCorrectAnswer,
    ...explicitDistractors,
    ...rankedPool.slice(0, Math.max(0, 2 - explicitDistractors.length)).map((entry) => entry.entry),
  ].slice(0, 3);
}

function buildFillBlankTaskConfig(
  koreanText: string,
  answer: string,
  lookups: Lookups,
  options?: {
    clue?: LocalizedText;
    choices?: string[];
  },
) {
  const slotKind = getFillBlankSlotKind(koreanText);
  const clue =
    options?.clue ?? maybeMeaningFromKorean(lookups, fillBlankSentenceWithAnswer(koreanText, answer));
  const shouldConstrain =
    Boolean(options?.choices?.length) ||
    (!isGrammarEndingBlank(answer) &&
      clue &&
      ["noun_slot", "tail_expression", "lead_chunk"].includes(slotKind));
  const choices = shouldConstrain
    ? buildFillBlankChoices(answer, slotKind, lookups.fillChoicePool, options?.choices)
    : undefined;

  return {
    clue,
    choices,
    prompt: fillBlankPrompt(Boolean(choices?.length)),
  };
}

function extractCopulaNoun(sentence: string) {
  const sentenceWithoutPunctuation = stripTrailingPunctuation(sentence);

  return sentenceWithoutPunctuation
    .replace(/^저는\s+/, "")
    .replace(/(입니다|입니까|이에요|예요)$/g, "")
    .trim();
}

function extractTailAfterSubject(sentence: string) {
  return stripTrailingPunctuation(sentence.replace(/^저[는도]\s+/, ""));
}

function meaningKey(value: LocalizedText) {
  return `${normalizeKey(value.vi)}::${normalizeKey(value.en)}`;
}

function meaningDisplayKeys(value: LocalizedText) {
  return [normalizeKey(value.vi), normalizeKey(value.en)].filter(Boolean);
}

function tokenizeMeaning(value: string) {
  return normalizeKey(value)
    .split(/[^a-z0-9\u00c0-\u024f]+/i)
    .filter((token) => token.length >= 3);
}

function wordCount(value: string) {
  return normalizeKey(value).split(/\s+/).filter(Boolean).length;
}

function isLexicalMeaning(value: LocalizedText) {
  const normalizedVi = normalizeKey(value.vi);
  const normalizedEn = normalizeKey(value.en);

  if (!normalizedVi || !normalizedEn) {
    return false;
  }

  if (/[?:]/.test(value.vi) || /[?:]/.test(value.en)) {
    return false;
  }

  return wordCount(normalizedVi) <= 4 && wordCount(normalizedEn) <= 4;
}

function isSingleKoreanChunk(value: string) {
  return value.trim().length > 0 && !/\s/.test(value.trim());
}

function sharedMeaningTokenCount(left: LocalizedText, right: LocalizedText) {
  const leftTokens = new Set([
    ...tokenizeMeaning(left.vi),
    ...tokenizeMeaning(left.en),
  ]);
  const rightTokens = new Set([
    ...tokenizeMeaning(right.vi),
    ...tokenizeMeaning(right.en),
  ]);

  let overlap = 0;

  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  });

  return overlap;
}

function scoreChoiceDistractor(correct: LocalizedText, candidate: LocalizedText) {
  let score = 0;

  score += sharedMeaningTokenCount(correct, candidate) * 4;
  score -= Math.abs(correct.en.length - candidate.en.length) * 0.05;
  score -= Math.abs(correct.vi.length - candidate.vi.length) * 0.03;

  if (
    normalizeKey(correct.en).includes(normalizeKey(candidate.en)) ||
    normalizeKey(candidate.en).includes(normalizeKey(correct.en))
  ) {
    score += 1.5;
  }

  if (
    normalizeKey(correct.vi).includes(normalizeKey(candidate.vi)) ||
    normalizeKey(candidate.vi).includes(normalizeKey(correct.vi))
  ) {
    score += 1.5;
  }

  return score;
}

function sortTasks(tasks: RuntimeTask[]) {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort(
      (left, right) =>
        STAGE_ORDER[left.task.stage] - STAGE_ORDER[right.task.stage] || left.index - right.index,
    )
    .map(({ task }) => task);
}

function interleaveTaskGroups<T>(groups: T[][]) {
  const maxLength = Math.max(0, ...groups.map((group) => group.length));
  const ordered: T[] = [];

  for (let index = 0; index < maxLength; index += 1) {
    groups.forEach((group) => {
      const task = group[index];

      if (task) {
        ordered.push(task);
      }
    });
  }

  return ordered;
}

function pickFrom<T extends { id: string }>(items: T[], id: string) {
  const match = items.find((item) => item.id === id);

  if (!match) {
    throw new Error(`Missing source item ${id}.`);
  }

  return match;
}

function buildLookups(source: SourceUnit) {
  const byKorean = new Map<string, LocalizedText>();
  const byMeaning = new Map<string, LocalizedText>();
  const fillChoicePool = new Map<string, string>();
  const vocabMeanings = new Map<string, LocalizedText>();
  const visualVocabById = new Map<string, VisualVocabEntry>();

  const registerMeaning = (meaning: LocalizedText) => {
    byMeaning.set(normalizeKey(meaning.vi), meaning);
    byMeaning.set(normalizeKey(meaning.en), meaning);
  };

  const registerVocabMeaning = (meaning: LocalizedText) => {
    if (!isLexicalMeaning(meaning)) {
      return;
    }

    vocabMeanings.set(meaningKey(meaning), meaning);
  };

  const registerFillChoice = (value: string) => {
    const cleanedValue = stripTrailingPunctuation(value);
    const key = normalizeFillChoice(cleanedValue);

    if (!cleanedValue || !key || !containsHangul(cleanedValue) || fillChoicePool.has(key)) {
      return;
    }

    fillChoicePool.set(key, cleanedValue);
  };

  const registerFillFragments = (value: string) => {
    const cleanedValue = value.trim();

    if (!cleanedValue) {
      return;
    }

    if (!cleanedValue.includes(" ")) {
      registerFillChoice(cleanedValue);
    }

    splitWords(cleanedValue).forEach((fragment) => registerFillChoice(fragment));
  };

  const register = (korean: string, meaning: LocalizedText) => {
    byKorean.set(korean, meaning);
    registerMeaning(meaning);
    registerFillFragments(korean);

    if (isSingleKoreanChunk(korean)) {
      registerVocabMeaning(meaning);
    }
  };

  source.textbook.vocab.forEach((item) => {
    register(item.korean, item.translations);

    if (item.imagePath) {
      visualVocabById.set(item.id, {
        vocabId: item.id,
        korean: item.korean,
        meaning: item.translations,
        imageUrl: item.imagePath,
      });
    }
  });
  source.textbook.dialogue.forEach((item) => register(item.korean, item.translations));
  source.textbook.examples.forEach((item) => register(item.korean, item.translations));
  source.workbook.exercises.forEach((item) => {
    if (item.localizedText) {
      registerMeaning(item.localizedText);

      if (item.koreanText && isSingleKoreanChunk(item.koreanText)) {
        registerVocabMeaning(item.localizedText);
      }
    }

    if (item.koreanText && item.localizedText) {
      register(item.koreanText, item.localizedText);
    } else if (item.koreanText) {
      registerFillFragments(item.koreanText.replace(/_+/g, " "));
    }

    registerFillFragments(answerText(item.answer));

    if (Array.isArray(item.metadata.choices)) {
      item.metadata.choices
        .filter((entry): entry is string => typeof entry === "string")
        .forEach((entry) => registerFillChoice(entry));
    }
  });

  const choicePool = Array.from(byMeaning.values()).filter(
    (entry, index, all) =>
      all.findIndex((candidate) => meaningKey(candidate) === meaningKey(entry)) === index,
  );
  const vocabChoicePool = Array.from(vocabMeanings.values());
  const visualVocabPool = Array.from(visualVocabById.values());

  return {
    byKorean: (value: string) => byKorean.get(value) ?? text(value),
    byMeaning: (value: string) => byMeaning.get(normalizeKey(value)) ?? text(value),
    choicePool: vocabChoicePool.length >= 4 ? vocabChoicePool : choicePool,
    fillChoicePool: Array.from(fillChoicePool.values()),
    visualVocabPool,
    visualVocabById,
  };
}

function buildChoices(correct: LocalizedText, pool: LocalizedText[], prefix: string) {
  const items = [choice(`${prefix}-correct`, correct)];
  const usedMeaningKeys = new Set([meaningKey(correct)]);
  const usedDisplayKeys = new Set(meaningDisplayKeys(correct));
  const rankedPool = pool
    .map((entry) => ({
      entry,
      meaningKey: meaningKey(entry),
      displayKeys: meaningDisplayKeys(entry),
      score: scoreChoiceDistractor(correct, entry),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.entry.en.localeCompare(right.entry.en) ||
        left.entry.vi.localeCompare(right.entry.vi),
    );

  for (const { entry, meaningKey: entryMeaningKey, displayKeys } of rankedPool) {
    if (items.length >= 4) {
      break;
    }

    if (usedMeaningKeys.has(entryMeaningKey)) {
      continue;
    }

    if (displayKeys.some((displayKey) => usedDisplayKeys.has(displayKey))) {
      continue;
    }

    usedMeaningKeys.add(entryMeaningKey);
    displayKeys.forEach((displayKey) => usedDisplayKeys.add(displayKey));
    items.push(choice(`${prefix}-d${items.length}`, entry));
  }

  return items;
}

function scoreVisualDistractor(correct: VisualVocabEntry, candidate: VisualVocabEntry) {
  return scoreChoiceDistractor(correct.meaning, candidate.meaning);
}

function buildImageChoices(correct: VisualVocabEntry, pool: VisualVocabEntry[], prefix: string) {
  const items = [choice(`${prefix}-correct`, correct.meaning, correct.imageUrl, correct.korean)];
  const usedVocabIds = new Set([correct.vocabId]);
  const rankedPool = pool
    .map((entry) => ({
      entry,
      score: scoreVisualDistractor(correct, entry),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.entry.korean.localeCompare(right.entry.korean) ||
        left.entry.vocabId.localeCompare(right.entry.vocabId),
    );

  for (const { entry } of rankedPool) {
    if (items.length >= 4) {
      break;
    }

    if (usedVocabIds.has(entry.vocabId)) {
      continue;
    }

    usedVocabIds.add(entry.vocabId);
    items.push(choice(`${prefix}-d${items.length}`, entry.meaning, entry.imageUrl, entry.korean));
  }

  if (items.length !== 4) {
    throw new Error(
      `${prefix} requires 4 image-backed vocab choices. Found ${items.length}.`,
    );
  }

  return items;
}

function pickVisualVocab(lookups: Lookups, vocabId: string) {
  const match = lookups.visualVocabById.get(vocabId);

  if (!match) {
    throw new Error(`Missing image-backed vocab entry for ${vocabId}.`);
  }

  return match;
}

function getAudioProxyPath(unitId: string, assetId: string) {
  return `/api/audio/${unitId}/${assetId}`;
}

function isReadyAudioAsset(asset: SourceAudioAsset | undefined) {
  return Boolean(asset && asset.remoteUrl && !asset.needsReview);
}

function lesson(
  lessonId: string,
  lessonRole: LessonRole,
  title: LocalizedText,
  summary: LocalizedText,
  focusConcepts: string[],
  sourceExerciseIds: string[],
  coverageTags: string[],
  tasks: RuntimeTask[],
  order: number,
  total: number,
): RuntimeLesson {
  const stableTasks = sortTasks(tasks);

  if (stableTasks.length < 8 || stableTasks.length > 10) {
    throw new Error(`${lessonId} must contain 8-10 tasks. Received ${stableTasks.length}.`);
  }

  return {
    lessonId,
    sectionId: "",
    sectionOrder: 0,
    lessonRole,
    title,
    summary,
    difficulty:
      order <= 2
        ? text("Nhận diện và làm quen", "Recognition and warm-up")
        : order >= total - 1
          ? text("Ôn tập tổng hợp", "Cumulative production")
          : text("Nhớ lại và xây câu", "Recall and construction"),
    focusConcepts,
    sourceExerciseIds,
    coverageTags,
    tasks: stableTasks,
  };
}

function section(
  sectionId: string,
  order: number,
  title: LocalizedText,
  summary: LocalizedText,
  lessonIds: string[],
) {
  return {
    sectionId,
    order,
    title,
    summary,
    lessonIds,
  };
}

function applySections(
  lessons: RuntimeLesson[],
  blueprints: SectionBlueprint[],
): Pick<RuntimeUnit, "lessons" | "sections"> {
  const lessonById = new Map(lessons.map((entry) => [entry.lessonId, entry] as const));
  const seenLessonIds = new Set<string>();
  const sections = blueprints.map((blueprint, index) => {
    blueprint.lessonIds.forEach((lessonId) => {
      const lesson = lessonById.get(lessonId);

      if (!lesson) {
        throw new Error(`Missing lesson ${lessonId} for section ${blueprint.sectionId}.`);
      }

      if (seenLessonIds.has(lessonId)) {
        throw new Error(`Lesson ${lessonId} is assigned to more than one section.`);
      }

      lesson.sectionId = blueprint.sectionId;
      lesson.sectionOrder = index + 1;
      seenLessonIds.add(lessonId);
    });

    return section(
      blueprint.sectionId,
      index + 1,
      blueprint.title,
      blueprint.summary,
      blueprint.lessonIds,
    );
  });

  if (seenLessonIds.size !== lessons.length) {
    const unassigned = lessons
      .map((lesson) => lesson.lessonId)
      .filter((lessonId) => !seenLessonIds.has(lessonId));
    throw new Error(`Unassigned lessons remain after sectioning: ${unassigned.join(", ")}.`);
  }

  return {
    lessons,
    sections,
  };
}

function wm(
  id: string,
  koreanText: string,
  meaning: LocalizedText,
  pool: LocalizedText[],
  source: RuntimeTask["source"],
  explanation: LocalizedText,
): RuntimeTask {
  return {
    id,
    type: "word_match",
    prompt: text(
      "Nối từ tiếng Hàn với đúng ý nghĩa.",
      "Match the Korean word with the correct meaning.",
    ),
    explanation,
    source,
    stage: "recognition",
    grammarTags: [],
    srWeight: srWeight("recognition"),
    errorPatternKey: `${id}.word-match`,
    koreanText,
    choices: buildChoices(meaning, pool, id),
    answer: `${id}-correct`,
  };
}

function wmImage(
  id: string,
  visual: VisualVocabEntry,
  pool: VisualVocabEntry[],
  source: RuntimeTask["source"],
  explanation: LocalizedText,
): RuntimeTask {
  return {
    id,
    type: "word_match",
    prompt: text(
      "Chọn thẻ đúng với ý nghĩa này.",
      "Choose the card that matches this meaning.",
    ),
    explanation,
    source,
    stage: "recognition",
    grammarTags: [],
    srWeight: srWeight("recognition"),
    errorPatternKey: `${id}.word-match`,
    koreanText: visual.korean,
    questionText: visual.meaning,
    presentation: "image_cards",
    choices: buildImageChoices(visual, pool, id),
    answer: `${id}-correct`,
  };
}

function ls(
  id: string,
  audioText: string,
  meaning: LocalizedText,
  pool: LocalizedText[],
  source: RuntimeTask["source"],
  explanation: LocalizedText,
  options?: {
    audioUrl?: string;
    choices?: LocalizedChoice[];
    answer?: string;
    grammarTags?: string[];
    prompt?: LocalizedText;
    supportText?: LocalizedText;
  },
): RuntimeTask {
  return {
    id,
    type: "listen_select",
    prompt: options?.prompt ?? text("Nghe rồi chọn đáp án đúng.", "Listen and choose the correct answer."),
    explanation,
    source,
    stage: "recognition",
    grammarTags: options?.grammarTags ?? [],
    srWeight: srWeight("recognition", 0.05),
    errorPatternKey: `${id}.listen`,
    audioText,
    ...(options?.audioUrl ? { audioUrl: options.audioUrl } : {}),
    ...(options?.supportText ? { supportText: options.supportText } : {}),
    choices: options?.choices ?? buildChoices(meaning, pool, id),
    answer: options?.answer ?? `${id}-correct`,
  };
}

function lsImage(
  id: string,
  audioText: string,
  visual: VisualVocabEntry,
  pool: VisualVocabEntry[],
  source: RuntimeTask["source"],
  explanation: LocalizedText,
  options?: {
    audioUrl?: string;
    grammarTags?: string[];
    prompt?: LocalizedText;
    supportText?: LocalizedText;
    questionText?: LocalizedText;
  },
): RuntimeTask {
  return {
    id,
    type: "listen_select",
    prompt:
      options?.prompt ??
      text("Nghe rồi chọn thẻ phù hợp.", "Listen and choose the matching card."),
    explanation,
    source,
    stage: "recognition",
    grammarTags: options?.grammarTags ?? [],
    srWeight: srWeight("recognition", 0.05),
    errorPatternKey: `${id}.listen`,
    audioText,
    ...(options?.audioUrl ? { audioUrl: options.audioUrl } : {}),
    ...(options?.supportText ? { supportText: options.supportText } : {}),
    ...(options?.questionText ? { questionText: options.questionText } : {}),
    presentation: "image_cards",
    choices: buildImageChoices(visual, pool, id),
    answer: `${id}-correct`,
  };
}

function tr(
  id: string,
  direction: MeaningDirection,
  meaning: LocalizedText,
  koreanText: string,
  source: RuntimeTask["source"],
  stage: RuntimeTask["stage"],
  grammarTags: string[],
  explanation: LocalizedText,
): RuntimeTask {
  const meaningToKo = direction === "meaning_to_ko";

  return {
    id,
    type: "translate",
    prompt: meaningToKo
      ? text("Dịch ý nghĩa sang tiếng Hàn.", "Translate the meaning into Korean.")
      : text("Dịch câu tiếng Hàn sang ý nghĩa.", "Translate the Korean into its meaning."),
    explanation,
    source,
    stage,
    grammarTags,
    srWeight: srWeight(stage),
    errorPatternKey: `${id}.translate`,
    direction,
    meaning,
    koreanText: meaningToKo ? undefined : koreanText,
    acceptedAnswers: meaningToKo ? [koreanText] : undefined,
    placeholder: meaningToKo
      ? text("Nhập câu tiếng Hàn", "Type the Korean sentence")
      : text("Nhập ý nghĩa", "Type the meaning"),
  };
}

function arr(
  id: string,
  meaning: LocalizedText,
  answer: string[],
  wordBank: string[],
  source: RuntimeTask["source"],
  grammarTags: string[],
  explanation: LocalizedText,
): RuntimeTask {
  return {
    id,
    type: "arrange_sentence",
    prompt: text("Sắp xếp lại câu hoàn chỉnh.", "Arrange the words into a complete sentence."),
    explanation,
    source,
    stage: "construction",
    grammarTags,
    srWeight: srWeight("construction"),
    errorPatternKey: `${id}.arrange`,
    meaning,
    wordBank,
    answer,
  };
}

function fill(
  id: string,
  koreanText: string,
  acceptedAnswers: string[],
  source: RuntimeTask["source"],
  grammarTags: string[],
  explanation: LocalizedText,
  clue?: LocalizedText,
  options?: {
    audioText?: string;
    audioUrl?: string;
    choices?: string[];
    prompt?: LocalizedText;
    placeholder?: LocalizedText;
  },
): RuntimeTask {
  return {
    id,
    type: "fill_blank",
    prompt: options?.prompt ?? text("Điền vào chỗ trống.", "Fill in the blank."),
    explanation,
    source,
    stage: "construction",
    grammarTags,
    srWeight: srWeight("construction", 0.05),
    errorPatternKey: `${id}.fill`,
    koreanText,
    acceptedAnswers,
    ...(options?.choices?.length ? { choices: options.choices } : {}),
    ...(options?.audioText ? { audioText: options.audioText } : {}),
    ...(options?.audioUrl ? { audioUrl: options.audioUrl } : {}),
    placeholder: options?.placeholder ?? text("Nhập phần còn thiếu", "Type the missing part"),
    clue,
  };
}

function gram(
  id: string,
  koreanText: string,
  answer: string,
  source: RuntimeTask["source"],
  explanation: LocalizedText,
  grammarTags: string[],
  choices: string[],
  supportText?: LocalizedText,
): RuntimeTask {
  return {
    id,
    type: "grammar_select",
    prompt: text("Chọn đáp án đúng.", "Choose the correct answer."),
    explanation,
    source,
    stage: "recall",
    grammarTags,
    srWeight: srWeight("recall"),
    errorPatternKey: `${id}.grammar`,
    koreanText,
    ...(supportText ? { supportText } : {}),
    choices,
    answer,
  };
}

function dial(
  id: string,
  line: SourceDialogueLine,
  source: RuntimeTask["source"],
  explanation: LocalizedText,
): RuntimeTask {
  return {
    id,
    type: "dialogue_reconstruct",
    prompt: text("Ghép lại câu hội thoại.", "Rebuild the dialogue line."),
    explanation,
    source,
    stage: "construction",
    grammarTags: [],
    srWeight: srWeight("construction", 0.1),
    errorPatternKey: `${id}.dialogue`,
    speaker: line.speaker,
    translation: line.translations,
    wordBank: splitWords(line.korean),
    answer: splitWords(line.korean),
  };
}

function speak(
  id: string,
  koreanText: string,
  source: RuntimeTask["source"],
  explanation: LocalizedText,
  grammarTags: string[] = [],
): RuntimeTask {
  return {
    id,
    type: "speaking",
    prompt: text("Nói to câu này.", "Say this sentence aloud."),
    explanation,
    source,
    stage: "production",
    grammarTags,
    srWeight: srWeight("production"),
    errorPatternKey: `${id}.speaking`,
    koreanText,
    expectedSpeech: koreanText,
  };
}

function directionOf(exercise: SourceWorkbookExercise): MeaningDirection {
  const direction = exercise.metadata.direction;

  return direction === "ko_to_meaning" ? "ko_to_meaning" : "meaning_to_ko";
}

function meaningFromExercise(exercise: SourceWorkbookExercise, lookups: Lookups) {
  if (exercise.localizedText) {
    return exercise.localizedText;
  }

  if (exercise.koreanText) {
    return lookups.byKorean(exercise.koreanText.replace("___", answerText(exercise.answer)));
  }

  return lookups.byMeaning(answerText(exercise.answer));
}

function getExerciseVocabId(exercise: SourceWorkbookExercise) {
  return typeof exercise.metadata.vocabId === "string" ? exercise.metadata.vocabId : undefined;
}

function audioBackedTasks(
  unitId: string,
  exercise: SourceWorkbookExercise,
  asset: SourceAudioAsset,
  lookups: Lookups,
  grammarTags: string[],
) {
  const audioUrl = getAudioProxyPath(unitId, asset.id);

  if (exercise.options?.length) {
    const choices = exercise.options.map((option) =>
      choice(
        `${exercise.id}-${option.id}`,
        option.label ?? text(option.id, option.id),
        option.imagePath,
      ),
    );
    const correctOption = exercise.options.find((option) => option.correct);

    if (!correctOption) {
      return [];
    }

    return [
      ls(
        `${exercise.id}-1`,
        asset.transcript ?? answerText(exercise.answer),
        meaningFromExercise(exercise, lookups),
        lookups.choicePool,
        "workbook",
        text(
          "Nghe file audio thật từ QR rồi chọn đáp án đúng.",
          "Listen to the real QR audio and choose the correct answer.",
        ),
        {
          audioUrl,
          choices,
          answer: `${exercise.id}-${correctOption.id}`,
          grammarTags,
          supportText: exercise.prompt,
        },
      ),
    ];
  }

  return [
    fill(
      `${exercise.id}-1`,
      exercise.koreanText ?? "",
      answerList(exercise.answer),
      "workbook",
      grammarTags,
      text(
        "Nghe file audio that tu QR roi dien phan con thieu.",
        "Listen to the real QR audio and fill in the missing part.",
      ),
      exercise.localizedText,
      {
        audioText: asset.transcript,
        audioUrl,
      },
    ),
  ];
}

function exerciseToTasks(
  unitId: string,
  exercise: SourceWorkbookExercise,
  lookups: Lookups,
  audioAssetsById: Map<string, SourceAudioAsset>,
) {
  const meaning = meaningFromExercise(exercise, lookups);
  const grammarTags =
    typeof exercise.metadata.grammarTag === "string" ? [exercise.metadata.grammarTag] : [];
  const metadataChoices =
    Array.isArray(exercise.metadata.choices) &&
    exercise.metadata.choices.every((item) => typeof item === "string")
      ? (exercise.metadata.choices as string[])
      : undefined;

  if (exercise.audioAssetId) {
    const asset = audioAssetsById.get(exercise.audioAssetId);

    if (!asset || !asset.remoteUrl || asset.needsReview) {
      return [];
    }

    return audioBackedTasks(unitId, exercise, asset, lookups, grammarTags);
  }

  if (exercise.exerciseType === "matching") {
    const vocabId = getExerciseVocabId(exercise);

    if (vocabId) {
      const visual = pickVisualVocab(lookups, vocabId);

      return [
        wmImage(
          `${exercise.id}-1`,
          visual,
          lookups.visualVocabPool,
          "workbook",
          text(
            "Bắt đầu bằng nhận diện hình ảnh và chữ Hàn cùng lúc.",
            "Start by matching the image card with the Korean word and meaning together.",
          ),
        ),
        lsImage(
          `${exercise.id}-2`,
          exercise.koreanText ?? visual.korean,
          visual,
          lookups.visualVocabPool,
          "workbook",
          text(
            "Nghe lại từ này và chọn thẻ đúng để khóa âm và hình.",
            "Hear the word again and choose the matching card to lock in sound and image.",
          ),
          {
            supportText: exercise.prompt,
          },
        ),
      ];
    }

    return [
      wm(
        `${exercise.id}-1`,
        exercise.koreanText ?? answerText(exercise.answer),
        meaning,
        lookups.choicePool,
        "workbook",
        text("Bắt đầu bằng nhận diện ý nghĩa nhanh.", "Start with quick meaning recognition."),
      ),
      ls(
        `${exercise.id}-2`,
        exercise.koreanText ?? answerText(exercise.answer),
        meaning,
        lookups.choicePool,
        "workbook",
        text(
          "Nghe lại cùng biểu hiện để khóa âm và nghĩa.",
          "Hear the same expression again to lock sound and meaning.",
        ),
      ),
    ];
  }

  if (exercise.exerciseType === "fill_blank") {
    const fillBlankConfig = buildFillBlankTaskConfig(
      exercise.koreanText ?? "",
      answerText(exercise.answer),
      lookups,
      {
        clue: exercise.localizedText,
        choices: metadataChoices,
      },
    );
    const grammarSupportText = isGrammarEndingBlank(answerText(exercise.answer))
      ? undefined
      : (fillBlankConfig.clue ?? meaningFromExercise(exercise, lookups));

    return [
      fill(
        `${exercise.id}-1`,
        exercise.koreanText ?? "",
        answerList(exercise.answer),
        "workbook",
        grammarTags,
        text(
          "Điền lại đúng phần còn thiếu của mẫu câu.",
          "Fill the missing part of the sentence pattern.",
        ),
        fillBlankConfig.clue,
        {
          choices: fillBlankConfig.choices,
          prompt: fillBlankConfig.prompt,
        },
      ),
      gram(
        `${exercise.id}-2`,
        exercise.koreanText ?? "",
        answerText(exercise.answer).replace(".", ""),
        "workbook",
        text(
          "Chọn lại đáp án để tránh nhầm đuôi câu hoặc danh từ chính.",
          "Choose the answer again to avoid mixing up the ending or key noun.",
        ),
        grammarTags,
        metadataChoices ?? [answerText(exercise.answer).replace(".", ""), "저", "은"],
        grammarSupportText,
      ),
    ];
  }

  if (exercise.exerciseType === "sentence_ordering") {
    const bank =
      Array.isArray(exercise.metadata.wordBank) &&
      exercise.metadata.wordBank.every((item) => typeof item === "string")
        ? (exercise.metadata.wordBank as string[])
        : splitWords(exercise.answer);

    return [
      arr(
        `${exercise.id}-1`,
        lookups.byKorean(answerText(exercise.answer)),
        Array.isArray(exercise.answer) ? exercise.answer : splitWords(exercise.answer),
        bank,
        "workbook",
        grammarTags,
        text(
          "Xây lại câu theo đúng trật tự tự nhiên.",
          "Build the sentence back in natural order.",
        ),
      ),
      speak(
        `${exercise.id}-2`,
        answerText(exercise.answer),
        "workbook",
        text(
          "Nói to câu vừa ghép để chuyển sang phản xạ nói.",
          "Say the rebuilt sentence aloud to move into speaking reflex.",
        ),
        grammarTags,
      ),
    ];
  }

  if (exercise.exerciseType === "translation") {
    if (directionOf(exercise) === "ko_to_meaning") {
      return [
        ls(
          `${exercise.id}-1`,
          exercise.koreanText ?? answerText(exercise.answer),
          lookups.byMeaning(answerText(exercise.answer)),
          lookups.choicePool,
          "workbook",
          text(
            "Nhận ý nghĩa trước rồi mới gõ lại.",
            "Recognize the meaning before typing it back.",
          ),
        ),
        tr(
          `${exercise.id}-2`,
          "ko_to_meaning",
          lookups.byMeaning(answerText(exercise.answer)),
          exercise.koreanText ?? answerText(exercise.answer),
          "workbook",
          "recall",
          grammarTags,
          text("Gõ lại ý nghĩa bằng trí nhớ.", "Type the meaning from memory."),
        ),
      ];
    }

    return [
      tr(
        `${exercise.id}-1`,
        "meaning_to_ko",
        meaning,
        answerText(exercise.answer),
        "workbook",
        "construction",
        grammarTags,
        text(
          "Dịch ý nghĩa thành câu tiếng Hàn đầy đủ.",
          "Translate the meaning into a full Korean sentence.",
        ),
      ),
      speak(
        `${exercise.id}-2`,
        answerText(exercise.answer),
        "workbook",
        text(
          "Nói lại câu vừa dịch để tăng sản sinh chủ động.",
          "Say the translated sentence aloud to strengthen active production.",
        ),
        grammarTags,
      ),
    ];
  }

  if (exercise.exerciseType === "listening") {
    return [
      ls(
        `${exercise.id}-1`,
        exercise.koreanText ?? answerText(exercise.answer),
        meaning,
        lookups.choicePool,
        "workbook",
        text(
          "Bài nghe ngắn nên ưu tiên nhận diện nhanh.",
          "Short listening items begin with fast recognition.",
        ),
      ),
      tr(
        `${exercise.id}-2`,
        "ko_to_meaning",
        meaning,
        exercise.koreanText ?? answerText(exercise.answer),
        "workbook",
        "recall",
        grammarTags,
        text(
          "Sau khi nghe đúng, gõ lại ý nghĩa để khóa trí nhớ.",
          "Once you hear it correctly, type the meaning to lock it in.",
        ),
      ),
    ];
  }

  if (exercise.id === "wb-grammar-copula-choice" || exercise.id === "wb-grammar-ending") {
    const answer = answerText(exercise.answer);

    return [
      gram(
        `${exercise.id}-1`,
        exercise.koreanText ?? "",
        answer,
        "workbook",
        text(
          "Nhắc lại đuôi câu lịch sự cốt lõi của Unit 1.",
          "Revisit the core polite ending for Unit 1.",
        ),
        ["N + copula"],
        metadataChoices ?? [answer, "저", "은"],
      ),
      fill(
        `${exercise.id}-2`,
        "학생___",
        [answer, `${answer}.`],
        "workbook",
        ["N + copula"],
        text("Điền lại mô hình N + copula.", "Fill the N + copula pattern again."),
      ),
    ];
  }

  if (Array.isArray(exercise.answer)) {
    return [
      arr(
        `${exercise.id}-1`,
        text("Tự giới thiệu ngắn", "Short self-introduction"),
        splitWords(exercise.answer),
        splitWords(exercise.answer),
        "workbook",
        ["N + 저는"],
        text(
          "Ghép lại cụm câu tự giới thiệu ngắn.",
          "Rebuild the short self-introduction script.",
        ),
      ),
      speak(
        `${exercise.id}-2`,
        answerText(exercise.answer),
        "workbook",
        text(
          "Nói trọn mini script để mô phỏng speaking.",
          "Say the full mini script to simulate a speaking prompt.",
        ),
        ["N + 저는"],
      ),
    ];
  }

  return [
    tr(
      `${exercise.id}-1`,
      "meaning_to_ko",
      lookups.byKorean(answerText(exercise.answer)),
      answerText(exercise.answer),
      "workbook",
      "construction",
      grammarTags,
      text(
        "Viết lại câu dịch từ nghĩa đã biết.",
        "Rewrite the target sentence from the known meaning.",
      ),
    ),
    speak(
      `${exercise.id}-2`,
      answerText(exercise.answer),
      "workbook",
      text(
        "Đọc to câu vừa viết để xây phản xạ nói.",
        "Read the written sentence aloud to build speaking reflex.",
      ),
      grammarTags,
    ),
  ];
}

function buildLessonFromExercises(
  source: SourceUnit,
  lookups: Lookups,
  audioAssetsById: Map<string, SourceAudioAsset>,
  blueprint: ManualLessonBlueprint,
  order: number,
  totalLessons: number,
) {
  const exercises = blueprint.exerciseIds.map((id) => pickFrom(source.workbook.exercises, id));
  const coverageTags = Array.from(new Set(exercises.flatMap((exercise) => exercise.coverageTags)));
  const taskGroups = exercises.map((exercise) =>
    exerciseToTasks(source.unitId, exercise, lookups, audioAssetsById),
  );
  const exerciseTasks =
    blueprint.taskOrdering === "interleave_pairs"
      ? interleaveTaskGroups(taskGroups)
      : taskGroups.flat();

  return lesson(
    blueprint.lessonId,
    blueprint.lessonRole,
    blueprint.title,
    blueprint.summary,
    blueprint.focusConcepts,
    blueprint.exerciseIds,
    coverageTags,
    [
      ...exerciseTasks,
      ...(blueprint.extraTasks ?? []),
    ],
    order,
    totalLessons,
  );
}

function introLesson(source: SourceUnit, lookups: Lookups, totalLessons: number) {
  const hello = pickFrom(source.textbook.vocab, "v-hello");
  const nice = pickFrom(source.textbook.vocab, "v-nice-to-meet");
  const minsu = pickFrom(source.textbook.dialogue, "d-minsu-hello");
  const helloVisual = pickVisualVocab(lookups, "v-hello");
  const humbleIVisual = pickVisualVocab(lookups, "v-i-humble");
  const studentVisual = pickVisualVocab(lookups, "v-student");
  const niceVisual = pickVisualVocab(lookups, "v-nice-to-meet");

  return lesson(
    "unit-1-lesson-1",
    "intro",
    text("Bắt đầu chào hỏi", "Start with greetings"),
    text(
      "Mở unit bằng lời chào, đại từ khiêm nhường, và mẫu câu giới thiệu ngắn.",
      "Open the unit with greetings, the humble pronoun, and a short introduction.",
    ),
    ["안녕하세요", "저", "학생", "저는"],
    ["wb-match-hello", "wb-match-jeo", "wb-match-student"],
    ["greeting", "vocab", "self-introduction"],
    [
      wmImage(
        "l1-hello",
        helloVisual,
        lookups.visualVocabPool,
        "textbook",
        text("Đây là lời chào cốt lõi của unit.", "This is the core greeting for the unit."),
      ),
      wmImage(
        "l1-jeo",
        humbleIVisual,
        lookups.visualVocabPool,
        "textbook",
        text("`저` là cách xưng hô lịch sự.", "`저` is the polite way to say I/me."),
      ),
      wmImage(
        "l1-student",
        studentVisual,
        lookups.visualVocabPool,
        "workbook",
        text(
          "Danh từ này lặp lại nhiều lần trong workbook.",
          "This noun repeats throughout the workbook.",
        ),
      ),
      lsImage(
        "l1-nice",
        nice.korean,
        niceVisual,
        lookups.visualVocabPool,
        "textbook",
        text(
          "Nghe cụm chào khi gặp mặt để quen âm.",
          "Hear the meeting greeting first to get used to the sound.",
        ),
      ),
      tr(
        "l1-hello-meaning",
        "ko_to_meaning",
        hello.translations,
        hello.korean,
        "workbook",
        "recall",
        [],
        text(
          "Đổi lời chào sang ý nghĩa ngay sau khi nhận diện.",
          "Switch the greeting into its meaning right after recognition.",
        ),
      ),
      tr(
        "l1-minsu",
        "meaning_to_ko",
        minsu.translations,
        minsu.korean,
        "textbook",
        "construction",
        ["N + 저는"],
        text(
          "Ghép lời chào với phần giới thiệu tên.",
          "Combine the greeting with the name introduction.",
        ),
      ),
      arr(
        "l1-arrange",
        minsu.translations,
        splitWords(minsu.korean),
        splitWords(minsu.korean).reverse(),
        "blended",
        ["N + 저는"],
        text(
          "Sắp xếp lại câu giới thiệu đầu tiên.",
          "Arrange the first introduction sentence.",
        ),
      ),
      speak(
        "l1-speak",
        hello.korean,
        "textbook",
        text("Kết lesson bằng một câu chào ngắn.", "Close the lesson with one short greeting."),
      ),
    ],
    1,
    totalLessons,
  );
}

function grammarLesson(source: SourceUnit, lookups: Lookups, totalLessons: number) {
  const student = pickFrom(source.textbook.examples, "ex-student");
  const office = pickFrom(source.textbook.examples, "ex-office-worker");
  const doctor = pickFrom(source.textbook.examples, "ex-doctor");
  const copula = pickFrom(source.textbook.vocab, "v-is-formal").korean;
  const officeFillConfig = buildFillBlankTaskConfig(
    "저는 ___입니다.",
    extractCopulaNoun(office.korean),
    lookups,
    {
      clue: office.translations,
      choices: [
        extractCopulaNoun(office.korean),
        pickFrom(source.textbook.vocab, "v-student").korean,
        extractCopulaNoun(doctor.korean),
      ],
    },
  );

  return lesson(
    "unit-1-lesson-2",
    "grammar",
    text("Lập câu với copula", "Build with the copula"),
    text(
      "Củng cố mẫu N + copula bằng câu về học sinh và nghề nghiệp.",
      "Reinforce the noun + copula pattern with student and job sentences.",
    ),
    ["N + copula", "입니다", "학생", "회사원"],
    [
      "wb-fill-student-ending",
      "wb-grammar-copula-choice",
      "wb-translate-student",
      "wb-fill-office-worker",
      "wb-translate-office-worker",
    ],
    ["grammar", "copula", "student", "role"],
    [
      gram(
        "l2-g1",
        "학생 + ___",
        copula,
        "workbook",
        text(
          "Sau danh từ, Unit 1 dùng cùng một đuôi câu lịch sự.",
          "After a noun, Unit 1 uses one core polite ending.",
        ),
        ["N + copula"],
        [copula, "저", "은"],
      ),
      gram(
        "l2-g2",
        "학생 + ___",
        copula,
        "workbook",
        text(
          "Lặp lại cùng pattern ở chế độ recall.",
          "Repeat the same pattern in recall mode.",
        ),
        ["N + copula"],
        [copula, "는", "가"],
      ),
      fill(
        "l2-fill-student",
        "저는 학생___",
        [copula, `${copula}.`],
        "workbook",
        ["N + copula"],
        text(
          "Điền lại đúng đuôi câu sau danh từ.",
          "Fill the correct polite ending after the noun.",
        ),
      ),
      fill(
        "l2-fill-office",
        "저는 ___입니다/이에요.",
        ["회사원", "회사원입니다", "회사원이에요"],
        "workbook",
        ["N + copula"],
        text(
          "Đổi nghề nghiệp nhưng giữ nguyên khung câu.",
          "Swap the job noun while keeping the sentence frame.",
        ),
        officeFillConfig.clue,
        {
          choices: officeFillConfig.choices,
          prompt: officeFillConfig.prompt,
        },
      ),
      tr(
        "l2-tr-student",
        "meaning_to_ko",
        student.translations,
        student.korean,
        "workbook",
        "construction",
        ["N + copula"],
        text(
          "Dịch mẫu câu cơ bản nhất của unit.",
          "Translate the unit's most basic model sentence.",
        ),
      ),
      arr(
        "l2-arr-office",
        office.translations,
        splitWords(office.korean),
        splitWords(office.korean).reverse(),
        "textbook",
        ["N + copula"],
        text(
          "Lặp lại câu nghề nghiệp cùng ngữ pháp.",
          "Build a job sentence with the same grammar.",
        ),
      ),
      speak(
        "l2-speak-student",
        student.korean,
        "textbook",
        text(
          "Nói lại mẫu câu học sinh để tạo phản xạ.",
          "Say the student sentence aloud so it becomes automatic.",
        ),
        ["N + copula"],
      ),
      speak(
        "l2-speak-office",
        office.korean,
        "blended",
        text(
          "Đổi danh từ nhưng vẫn giữ đuôi câu lịch sự đúng.",
          "Swap the noun while keeping the polite ending correct.",
        ),
        ["N + copula"],
      ),
    ],
    2,
    totalLessons,
  );
}

function dialogueLesson(source: SourceUnit, lookups: Lookups, totalLessons: number) {
  const jisuHello = pickFrom(source.textbook.dialogue, "d-jisu-hello");
  const jisuReply = pickFrom(source.textbook.dialogue, "d-jisu-too");
  const nice = pickFrom(source.textbook.vocab, "v-nice-to-meet");
  const dialogueFillConfig = buildFillBlankTaskConfig(
    "저도 ___",
    extractTailAfterSubject(jisuReply.korean),
    lookups,
    {
      clue: jisuReply.translations,
      choices: [
        extractTailAfterSubject(jisuReply.korean),
        extractTailAfterSubject(pickFrom(source.textbook.examples, "ex-student").korean),
        extractTailAfterSubject(pickFrom(source.textbook.examples, "ex-office-worker").korean),
      ],
    },
  );

  return lesson(
    "unit-1-lesson-3",
    "dialogue",
    text("Ghép lại đoạn hội thoại", "Rebuild the dialogue"),
    text(
      "Nghe, ghép, và nói lại các lượt thoại chào hỏi cốt lõi.",
      "Listen, rebuild, and say the core greeting dialogue turns.",
    ),
    ["dialogue", "reply", "self-introduction", "translation"],
    [
      "wb-listen-too",
      "wb-fill-nice",
      "wb-order-jisu",
      "wb-translate-jisu",
      "wb-translate-nice",
      "wb-fill-name-line",
    ],
    ["dialogue", "reply", "self-introduction", "translation"],
    [
      ls(
        "l3-reply-listen",
        jisuReply.korean,
        jisuReply.translations,
        lookups.choicePool,
        "workbook",
        text(
          "Nghe câu đáp trước để bắt nhịp hội thoại.",
          "Hear the reply first to catch the dialogue rhythm.",
        ),
      ),
      tr(
        "l3-nice",
        "ko_to_meaning",
        nice.translations,
        nice.korean,
        "workbook",
        "recall",
        [],
        text(
          "Nhớ lại ý nghĩa của lời chào khi gặp mặt.",
          "Recall the meaning of the meeting greeting.",
        ),
      ),
      fill(
        "l3-fill",
        "저도 ___",
        ["반갑습니다", "반갑습니다."],
        "workbook",
        [],
        text(
          "Giu `저도` va dien phan con lai cua cau dap.",
          "Keep `저도` and fill the rest of the reply.",
        ),
        dialogueFillConfig.clue,
        {
          choices: dialogueFillConfig.choices,
          prompt: dialogueFillConfig.prompt,
        },
      ),
      dial(
        "l3-jisu",
        jisuHello,
        "textbook",
        text("Ghép lại câu giới thiệu của Jisu.", "Rebuild Jisu's introduction line."),
      ),
      dial(
        "l3-reply",
        jisuReply,
        "blended",
        text(
          "Ghép luôn câu đáp để tạo thành cặp thoại.",
          "Rebuild the reply to create a full exchange.",
        ),
      ),
      arr(
        "l3-arrange",
        jisuHello.translations,
        splitWords(jisuHello.korean),
        splitWords(jisuHello.korean).reverse(),
        "workbook",
        ["N + 저는"],
        text(
          "Tách nhỏ câu giới thiệu thành một bài sắp xếp nhanh.",
          "Break the introduction into a quicker ordering task.",
        ),
      ),
      tr(
        "l3-tr-jisu",
        "meaning_to_ko",
        jisuHello.translations,
        jisuHello.korean,
        "workbook",
        "construction",
        ["N + 저는"],
        text(
          "Viết lại toàn bộ câu giới thiệu của Jisu.",
          "Write Jisu's full introduction again.",
        ),
      ),
      speak(
        "l3-speak",
        `${jisuHello.korean} ${jisuReply.korean}`,
        "blended",
        text(
          "Kết lesson bằng một lượt thoại hoàn chỉnh.",
          "Finish the lesson with one complete dialogue turn.",
        ),
        ["N + 저는"],
      ),
    ],
    3,
    totalLessons,
  );
}

function buildUnit1QrLesson(
  source: SourceUnit,
  lookups: Lookups,
  audioAssetsById: Map<string, SourceAudioAsset>,
  totalLessons: number,
) {
  const left = pickFrom(source.workbook.exercises, "wb-qr-listen-country-left");
  const right = pickFrom(source.workbook.exercises, "wb-qr-listen-country-right");
  const leftAsset = audioAssetsById.get(left.audioAssetId ?? "");
  const rightAsset = audioAssetsById.get(right.audioAssetId ?? "");

  if (!leftAsset || !rightAsset) {
    throw new Error("Unit 1 QR listening assets must be available.");
  }

  return buildLessonFromExercises(
    source,
    lookups,
    audioAssetsById,
    {
      lessonId: "unit-1-lesson-9",
      lessonRole: "workbook_practice",
      title: text("Nghe QR về quốc tịch", "QR listening: countries and flags"),
      summary: text(
        "Tách riêng bài nghe QR thành một lesson nghe tập trung có cờ, câu điền, và câu nói lặp lại.",
        "Split the QR audio into a dedicated listening lesson with flag choice, fill tasks, and spoken repeats.",
      ),
      focusConcepts: ["qr-listening", "country", "flags", "self-introduction"],
      exerciseIds: [left.id, right.id],
      extraTasks: [
        fill(
          "u1-qr-left-fill-country",
          "저는 ___ 사람이에요.",
          ["러시아"],
          "workbook",
          ["qr-listening"],
          text(
            "Nghe lại file QR của Natasha rồi điền quốc tịch bằng tiếng Hàn.",
            "Replay Natasha's QR audio and fill in the nationality in Korean.",
          ),
          left.localizedText,
          {
            audioText: leftAsset.transcript,
            audioUrl: getAudioProxyPath(source.unitId, leftAsset.id),
            choices: ["러시아", "한국", "미국"],
          },
        ),
        fill(
          "u1-qr-right-fill-country",
          "저는 ___ 사람이에요.",
          ["한국"],
          "workbook",
          ["qr-listening"],
          text(
            "Nghe lại file QR của Gayoung rồi điền quốc tịch bằng tiếng Hàn.",
            "Replay Gayoung's QR audio and fill in the nationality in Korean.",
          ),
          right.localizedText,
          {
            audioText: rightAsset.transcript,
            audioUrl: getAudioProxyPath(source.unitId, rightAsset.id),
            choices: ["한국", "러시아", "미국"],
          },
        ),
        arr(
          "u1-qr-left-arrange",
          text("Natasha là người Nga.", "Natasha is from Russia."),
          ["저는", "러시아", "사람이에요."],
          ["사람이에요.", "러시아", "저는"],
          "workbook",
          ["qr-listening"],
          text(
            "Sắp xếp lại câu trả lời xuất hiện trong file nghe QR bên trái.",
            "Rebuild the answer line heard in the left-side QR audio.",
          ),
        ),
        arr(
          "u1-qr-right-arrange",
          text("Gayoung là người Hàn Quốc.", "Gayoung is from South Korea."),
          ["저는", "한국", "사람이에요."],
          ["사람이에요.", "한국", "저는"],
          "workbook",
          ["qr-listening"],
          text(
            "Sắp xếp lại câu trả lời xuất hiện trong file nghe QR bên phải.",
            "Rebuild the answer line heard in the right-side QR audio.",
          ),
        ),
        speak(
          "u1-qr-left-speak",
          "저는 러시아 사람이에요.",
          "workbook",
          text(
            "Nói lại câu giới thiệu quốc tịch của Natasha.",
            "Say Natasha's nationality sentence aloud.",
          ),
          ["qr-listening"],
        ),
        speak(
          "u1-qr-right-speak",
          "저는 한국 사람이에요.",
          "workbook",
          text(
            "Nói lại câu giới thiệu quốc tịch của Gayoung.",
            "Say Gayoung's nationality sentence aloud.",
          ),
          ["qr-listening"],
        ),
      ],
    },
    9,
    totalLessons,
  );
}

function buildUnit1WorkbookLessons(
  source: SourceUnit,
  lookups: Lookups,
  audioAssetsById: Map<string, SourceAudioAsset>,
  totalLessons: number,
) {
  return [
    buildLessonFromExercises(
      source,
      lookups,
      audioAssetsById,
      {
        lessonId: "unit-1-lesson-4",
        lessonRole: "workbook_practice",
        title: text("Dùng copula trong workbook", "Workbook: copula in use"),
        summary: text(
          "Chuyển từ textbook sang workbook bằng các bài match và điền khuyết cơ bản.",
          "Move from textbook input into workbook matching and core fill-in drills.",
        ),
        focusConcepts: ["copula", "greeting", "self-introduction", "student"],
        exerciseIds: [
          "wb-fill-student-ending",
          "wb-match-hello",
          "wb-match-jeo",
          "wb-match-student",
        ],
      },
      4,
      totalLessons,
    ),
    buildLessonFromExercises(
      source,
      lookups,
      audioAssetsById,
      {
        lessonId: "unit-1-lesson-5",
        lessonRole: "workbook_practice",
        title: text("Luyện tự giới thiệu 1", "Identity drills 1"),
        summary: text(
          "Luyện dịch, nghe, và chọn đuôi câu lịch sự trong cụm bài tự giới thiệu.",
          "Drill translation, listening, and polite endings around self-introduction sentences.",
        ),
        focusConcepts: ["translation", "copula", "dialogue", "student"],
        exerciseIds: [
          "wb-translate-student",
          "wb-translate-hello",
          "wb-grammar-copula-choice",
          "wb-listen-too",
        ],
      },
      5,
      totalLessons,
    ),
    buildLessonFromExercises(
      source,
      lookups,
      audioAssetsById,
      {
        lessonId: "unit-1-lesson-6",
        lessonRole: "workbook_practice",
        title: text("Luyện tự giới thiệu 2", "Identity drills 2"),
        summary: text(
          "Tiếp tục workbook bằng câu đáp, sắp xếp, và câu giới thiệu có tên riêng.",
          "Continue the workbook path with replies, ordering, and named self-introductions.",
        ),
        focusConcepts: ["reply", "name", "translation", "construction"],
        exerciseIds: [
          "wb-fill-nice",
          "wb-order-jisu",
          "wb-translate-jisu",
          "wb-translate-nice",
        ],
      },
      6,
      totalLessons,
    ),
    buildLessonFromExercises(
      source,
      lookups,
      audioAssetsById,
      {
        lessonId: "unit-1-lesson-7",
        lessonRole: "workbook_practice",
        title: text("Luyện tên và vai trò", "Role and name drills"),
        summary: text(
          "Khóa lại tên, nghề nghiệp, và đuôi câu copula bằng chuỗi bài tập ngắn.",
          "Lock in names, jobs, and polite copula endings through a tight workbook run.",
        ),
        focusConcepts: ["name", "role", "copula", "office-worker"],
        exerciseIds: [
          "wb-fill-name-line",
          "wb-grammar-ending",
          "wb-fill-office-worker",
          "wb-order-office-worker",
        ],
      },
      7,
      totalLessons,
    ),
    buildLessonFromExercises(
      source,
      lookups,
      audioAssetsById,
      {
        lessonId: "unit-1-lesson-8",
        lessonRole: "workbook_practice",
        title: text("Nghe và tự giới thiệu", "Listening and self-introduction"),
        summary: text(
          "Gồm bài nghe workbook và bài viết tự giới thiệu trước khi vào QR listening riêng.",
          "Collect the workbook listening and self-introduction writing before the dedicated QR lesson.",
        ),
        focusConcepts: ["listening", "self-introduction", "doctor", "office-worker"],
        exerciseIds: [
          "wb-translate-office-worker",
          "wb-listen-student",
          "wb-write-doctor",
          "wb-fill-intro-name",
          "wb-listen-greeting",
        ],
      },
      8,
      totalLessons,
    ),
    buildUnit1QrLesson(source, lookups, audioAssetsById, totalLessons),
  ];
}

function unit1Sections() {
  return [
    {
      sectionId: "unit-1-section-1",
      title: text("Phần 1: Chào hỏi", "Section 1: greetings"),
      summary: text(
        "Nền tảng chào hỏi, đại từ xưng hô, và câu copula cơ bản.",
        "Greeting foundations, polite self-reference, and the core copula frame.",
      ),
      lessonIds: ["unit-1-lesson-1", "unit-1-lesson-2"],
    },
    {
      sectionId: "unit-1-section-2",
      title: text("Phần 2: Hội thoại", "Section 2: dialogue and use"),
      summary: text(
        "Ghép lại hội thoại và đưa ngữ pháp vào bài workbook đầu tiên.",
        "Rebuild the dialogue and move the grammar into the first workbook lesson.",
      ),
      lessonIds: ["unit-1-lesson-3", "unit-1-lesson-4"],
    },
    {
      sectionId: "unit-1-section-3",
      title: text("Phần 3: Trọng tâm workbook", "Section 3: workbook core"),
      summary: text(
        "Ba lesson liên tiếp để phủ đủ các bài identity và role drills của workbook.",
        "Three straight lessons to keep the identity and role drills fully covered.",
      ),
      lessonIds: ["unit-1-lesson-5", "unit-1-lesson-6", "unit-1-lesson-7"],
    },
    {
      sectionId: "unit-1-section-4",
      title: text("Phần 4: Nghe", "Section 4: listening and QR"),
      summary: text(
        "Tách nghe workbook và bài nghe QR thành cụm listening riêng.",
        "Split workbook listening and QR listening into their own focused block.",
      ),
      lessonIds: ["unit-1-lesson-8", "unit-1-lesson-9"],
    },
    {
      sectionId: "unit-1-section-5",
      title: text("Phần 5: Ôn tập", "Section 5: review and output"),
      summary: text(
        "Ôn tập cuối unit bằng bài tổng hợp và bài sản sinh có khung.",
        "Finish with a review checkpoint and a more output-heavy close.",
      ),
      lessonIds: ["unit-1-lesson-10", "unit-1-lesson-11"],
    },
  ] satisfies SectionBlueprint[];
}

function reviewLessons(
  source: SourceUnit,
  lookups: Lookups,
  startOrder: number,
  totalLessons: number,
  audioAssetsById: Map<string, SourceAudioAsset>,
) {
  const reviewAIds = [
    "wb-fill-student-ending",
    "wb-translate-student",
    "wb-translate-hello",
    "wb-grammar-ending",
  ];
  const reviewBIds = [
    "wb-translate-office-worker",
    "wb-write-doctor",
    "wb-translate-doctor",
    "wb-guided-selfintro",
  ];
  const reviewAExercises = reviewAIds.map((id) => pickFrom(source.workbook.exercises, id));
  const reviewBExercises = reviewBIds.map((id) => pickFrom(source.workbook.exercises, id));
  const minsu = pickFrom(source.textbook.dialogue, "d-minsu-hello");
  const hello = pickFrom(source.textbook.vocab, "v-hello");
  const nice = pickFrom(source.textbook.vocab, "v-nice-to-meet");
  const student = pickFrom(source.textbook.examples, "ex-student");

  const review1 = lesson(
    `unit-1-lesson-${startOrder}`,
    "review",
    text("Ôn workbook 1", "Review checkpoint 1"),
    text(
      "Ôn lại các lỗi hay gặp trước khi vào phần tổng hợp cuối.",
      "Review common mistake patterns before the final cumulative pass.",
    ),
    ["review", "copula", "translation", "workbook"],
    reviewAIds,
    Array.from(new Set(reviewAExercises.flatMap((exercise) => exercise.coverageTags))),
    [
      ...reviewAExercises.flatMap((exercise) =>
        exerciseToTasks(source.unitId, exercise, lookups, audioAssetsById),
      ),
      arr(
        "review-a-extra",
        minsu.translations,
        splitWords(minsu.korean),
        splitWords(minsu.korean).reverse(),
        "blended",
        ["N + 저는"],
        text(
          "Kéo lại câu giới thiệu gốc để nối sang phần tổng hợp.",
          "Bring back the original introduction to bridge into the cumulative section.",
        ),
      ),
    ],
    startOrder,
    totalLessons,
  );

  const review2 = lesson(
    `unit-1-lesson-${startOrder + 1}`,
    "review",
    text("Ôn tập tổng hợp", "Cumulative review"),
    text(
      "Khóa lại Unit 1 bằng nhiều câu phải tự gõ và tự nói hơn.",
      "Lock in Unit 1 with more prompts that require typing and speaking on your own.",
    ),
    ["review", "production", "self-introduction", "dialogue"],
    reviewBIds,
    Array.from(new Set(reviewBExercises.flatMap((exercise) => exercise.coverageTags))),
    [
      ...reviewBExercises.flatMap((exercise) =>
        exerciseToTasks(source.unitId, exercise, lookups, audioAssetsById),
      ),
      speak(
        "review-b-extra-1",
        minsu.korean,
        "blended",
        text(
          "Nói trọn lời chào và tên với độ tự động cao hơn.",
          "Say the full greeting and name with more automaticity.",
        ),
        ["N + 저는"],
      ),
      speak(
        "review-b-extra-2",
        `${hello.korean} ${student.korean} ${nice.korean}`,
        "blended",
        text(
          "Kết unit bằng một mini self-introduction đầy đủ hơn.",
          "Close the unit with a fuller mini self-introduction.",
        ),
        ["N + copula"],
      ),
    ],
    startOrder + 1,
    totalLessons,
  );

  return [review1, review2];
}

function introLesson16(source: SourceUnit, lookups: Lookups, totalLessons: number) {
  const busStop = pickFrom(source.textbook.vocab, "v-bus-stop");
  const titleQuestion = pickFrom(source.textbook.dialogue, "d-title-question");
  const busVisual = pickVisualVocab(lookups, "v-bus");
  const subwayVisual = pickVisualVocab(lookups, "v-subway");
  const stationVisual = pickVisualVocab(lookups, "v-station");
  const busStopVisual = pickVisualVocab(lookups, "v-bus-stop");

  return lesson(
    "unit-16-lesson-1",
    "intro",
    text("Mở bài đi đường", "Open the directions topic"),
    text(
      "Làm quen với phương tiện giao thông cốt lõi và câu hỏi trung tâm của bài 16.",
      "Start Unit 16 with the core transport words and its central directions question.",
    ),
    ["버스", "지하철", "역", "정류장"],
    [
      "wb16-write-transport",
      "wb16-match-bus",
      "wb16-match-subway",
      "wb16-match-station",
      "wb16-match-bus-stop",
    ],
    ["transport", "vocab", "directions", "intro"],
    [
      wmImage(
        "u16-l1-bus",
        busVisual,
        lookups.visualVocabPool,
        "textbook",
        text("Bắt đầu bằng phương tiện quen thuộc nhất.", "Start with the most familiar vehicle."),
      ),
      wmImage(
        "u16-l1-subway",
        subwayVisual,
        lookups.visualVocabPool,
        "textbook",
        text("Tàu điện ngầm sẽ lặp lại nhiều trong phần hỏi đường.", "The subway repeats often in directions."),
      ),
      wmImage(
        "u16-l1-station",
        stationVisual,
        lookups.visualVocabPool,
        "workbook",
        text("Danh từ địa điểm này là mốc neo của unit.", "This place noun anchors the whole unit."),
      ),
      wmImage(
        "u16-l1-bus-stop",
        busStopVisual,
        lookups.visualVocabPool,
        "workbook",
        text("Nhớ từ này để đọc được hướng dẫn đi xe buýt.", "Know this word to follow bus directions."),
      ),
      tr(
        "u16-l1-title-meaning",
        "ko_to_meaning",
        titleQuestion.translations,
        titleQuestion.korean,
        "textbook",
        "recall",
        [],
        text(
          "Hiểu câu hỏi đường đi trước khi bắt đầu ghép lộ trình.",
          "Understand the route question before building the route itself.",
        ),
      ),
      fill(
        "u16-l1-fill-stop",
        "저기 ___에서 100번 버스를 타십시오.",
        ["정류장"],
        "textbook",
        [],
        text(
          "Điền địa điểm lên xe buýt vào câu hướng dẫn.",
          "Fill in the place where you board the bus.",
        ),
        busStop.translations,
        {
          choices: ["정류장", "역", "터미널"],
        },
      ),
      arr(
        "u16-l1-arrange-title",
        titleQuestion.translations,
        splitWords(titleQuestion.korean),
        splitWords(titleQuestion.korean).reverse(),
        "blended",
        [],
        text(
          "Sắp xếp lại câu hỏi đường đi trung tâm của bài.",
          "Rebuild the central directions question of the unit.",
        ),
      ),
      speak(
        "u16-l1-speak-title",
        titleQuestion.korean,
        "textbook",
        text(
          "Kết lesson bằng câu hỏi đường đi cốt lõi.",
          "Close the lesson with the core directions question.",
        ),
      ),
    ],
    1,
    totalLessons,
  );
}

function grammarLesson16(source: SourceUnit, lookups: Lookups, totalLessons: number) {
  const homeSchool = pickFrom(source.textbook.examples, "ex-home-school-time");
  const thirtyMinutes = pickFrom(source.textbook.examples, "ex-thirty-minutes");

  return lesson(
    "unit-16-lesson-2",
    "grammar",
    text("Tập trung 에서, 까지", "Focus on 에서, 까지"),
    text(
      "Khóa mẫu chỉ điểm bắt đầu và điểm kết thúc, đồng thời giữ được câu hỏi thời gian đi lại.",
      "Lock in start-point and endpoint marking while keeping the travel-time question active.",
    ),
    ["에서, 까지", "집에서", "학교까지", "얼마나"],
    [
      "wb16-library-from",
      "wb16-restaurant-to",
      "wb16-subway-from",
      "wb16-agency-to",
      "wb16-company-from",
      "wb16-park-to",
    ],
    ["grammar", "from-to", "route", "distance"],
    [
      tr(
        "u16-l2-route-question",
        "ko_to_meaning",
        homeSchool.translations,
        homeSchool.korean,
        "textbook",
        "recall",
        ["에서, 까지"],
        text(
          "Bắt đầu bằng câu hỏi thời gian đi lại quen thuộc.",
          "Start from the familiar route-time question.",
        ),
      ),
      tr(
        "u16-l2-thirty-minutes",
        "meaning_to_ko",
        thirtyMinutes.translations,
        thirtyMinutes.korean,
        "textbook",
        "construction",
        ["에서, 까지"],
        text(
          "Đổi ý nghĩa sang câu trả lời ngắn và tự nhiên.",
          "Convert the meaning into a short natural answer.",
        ),
      ),
      gram(
        "u16-l2-from",
        "도서관___ 식당까지 버스를 타고 가요.",
        "에서",
        "workbook",
        text(
          "Chọn trợ từ chỉ điểm bắt đầu của lộ trình.",
          "Choose the particle that marks the starting point of the route.",
        ),
        ["에서, 까지"],
        ["에서", "까지"],
        text("từ thư viện đến nhà hàng", "from the library to the restaurant"),
      ),
      gram(
        "u16-l2-to",
        "도서관에서 식당___ 버스를 타고 가요.",
        "까지",
        "workbook",
        text(
          "Chọn trợ từ chỉ điểm kết thúc của lộ trình.",
          "Choose the particle that marks the destination.",
        ),
        ["에서, 까지"],
        ["에서", "까지"],
        text("đến nhà hàng", "to the restaurant"),
      ),
      fill(
        "u16-l2-subway-from",
        "지하철역___ 여행사까지 걸어가요.",
        ["에서"],
        "workbook",
        ["에서, 까지"],
        text(
          "Điền trợ từ cho phần điểm xuất phát.",
          "Fill in the particle for the departure point.",
        ),
        text("từ ga tàu điện ngầm", "from the subway station"),
        {
          choices: ["에서", "까지"],
        },
      ),
      fill(
        "u16-l2-agency-to",
        "지하철역에서 여행사___ 걸어가요.",
        ["까지"],
        "workbook",
        ["에서, 까지"],
        text(
          "Điền trợ từ cho điểm đến của câu.",
          "Fill in the particle for the destination.",
        ),
        text("đến công ty du lịch", "to the travel agency"),
        {
          choices: ["에서", "까지"],
        },
      ),
      arr(
        "u16-l2-arrange-route",
        text(
          "Từ thư viện đến nhà hàng đi xe buýt.",
          "Go by bus from the library to the restaurant.",
        ),
        ["도서관에서", "식당까지", "버스를", "타고", "가요"],
        ["가요", "타고", "버스를", "식당까지", "도서관에서"],
        "workbook",
        ["에서, 까지"],
        text(
          "Sắp xếp lại một câu lộ trình đầy đủ với cả điểm đi và điểm đến.",
          "Rebuild a full route sentence with both start and end points.",
        ),
      ),
      speak(
        "u16-l2-speak-route-question",
        homeSchool.korean,
        "textbook",
        text(
          "Nói trọn câu hỏi thời gian để tạo phản xạ nhanh.",
          "Say the route-time question aloud to build quick recall.",
        ),
        ["에서, 까지"],
      ),
    ],
    2,
    totalLessons,
  );
}

function dialogueLesson16(source: SourceUnit, lookups: Lookups, totalLessons: number) {
  const titleQuestion = pickFrom(source.textbook.dialogue, "d-title-question");
  const instruction = pickFrom(source.textbook.dialogue, "d-bus-stop-instruction");
  const route = pickFrom(source.textbook.dialogue, "d-bus-route");
  const bankPaper = pickFrom(source.textbook.dialogue, "d-bank-paper");
  const bankFinish = pickFrom(source.textbook.dialogue, "d-bank-finish");

  return lesson(
    "unit-16-lesson-3",
    "dialogue",
    text("Hỏi đường và hướng dẫn", "Ask directions and give instructions"),
    text(
      "Ghep lai hoi duong, loi chi duong, va cac menh lenh lich su bang -으십시오/-십시오.",
      "Rebuild direction questions, route instructions, and polite commands with -으십시오/-십시오.",
    ),
    ["dialogue", "directions", "-으십시오/-십시오", "정류장"],
    [
      "wb16-command-wash",
      "wb16-command-walk-museum",
      "wb16-command-listen",
      "wb16-command-lie-down",
    ],
    ["dialogue", "directions", "commands", "route"],
    [
      tr(
        "u16-l3-instruction-meaning",
        "ko_to_meaning",
        instruction.translations,
        instruction.korean,
        "textbook",
        "recall",
        ["-으십시오/-십시오"],
        text(
          "Hiểu đúng câu chỉ đường lịch sự trước khi tự ghép lại.",
          "Understand the polite direction first before rebuilding it.",
        ),
      ),
      dial(
        "u16-l3-title-question",
        titleQuestion,
        "textbook",
        text(
          "Ghép lại câu hỏi đường đi mở đầu cuộc hội thoại.",
          "Rebuild the question that opens the directions dialogue.",
        ),
      ),
      dial(
        "u16-l3-instruction",
        instruction,
        "textbook",
        text(
          "Ghép lại câu lên xe buýt có mệnh lệnh lịch sự.",
          "Rebuild the polite instruction for taking the bus.",
        ),
      ),
      dial(
        "u16-l3-route",
        route,
        "textbook",
        text(
          "Ghép lại câu nói xe buýt sẽ đi đến đâu.",
          "Rebuild the line that states where the bus goes.",
        ),
      ),
      dial(
        "u16-l3-bank-paper",
        bankPaper,
        "blended",
        text(
          "Ghép lại chuỗi hướng dẫn ngắn trong ngân hàng.",
          "Rebuild the short bank instruction sequence.",
        ),
      ),
      fill(
        "u16-l3-wash",
        "먼저 야채들을 ___.",
        ["씻으십시오"],
        "workbook",
        ["-으십시오/-십시오"],
        text(
          "Điền mệnh lệnh lịch sự cho bước đầu tiên trong công việc nấu ăn.",
          "Fill the polite command for the first step in cooking.",
        ),
        text("hãy rửa rau trước", "wash the vegetables first"),
        {
          choices: ["씻으십시오", "들으십시오", "누우십시오"],
        },
      ),
      fill(
        "u16-l3-listen",
        "그럼 한국 노래를 많이 ___.",
        ["들으십시오"],
        "workbook",
        ["-으십시오/-십시오"],
        text(
          "Điền lời khuyên lịch sự cho người học tiếng Hàn.",
          "Fill the polite suggestion for someone studying Korean.",
        ),
        text("hãy nghe nhiều bài hát Hàn Quốc", "listen to a lot of Korean songs"),
        {
          choices: ["들으십시오", "씻으십시오", "오십시오"],
        },
      ),
      speak(
        "u16-l3-speak-finish",
        bankFinish.korean,
        "textbook",
        text(
          "Kết lesson bằng một câu kết thúc lịch sự và tự nhiên.",
          "Close the lesson with a natural polite closing line.",
        ),
        ["-으십시오/-십시오"],
      ),
    ],
    3,
    totalLessons,
  );
}

function buildUnit16QrLessons(
  source: SourceUnit,
  lookups: Lookups,
  audioAssetsById: Map<string, SourceAudioAsset>,
  totalLessons: number,
) {
  const traffic = pickFrom(source.workbook.exercises, "wb16-qr-traffic-jam");
  const busNumber = pickFrom(source.workbook.exercises, "wb16-qr-seoul-bus-number");
  const distance = pickFrom(source.workbook.exercises, "wb16-qr-seoul-distance");
  const destination = pickFrom(source.workbook.exercises, "wb16-qr-destination");
  const trafficAsset = audioAssetsById.get(traffic.audioAssetId ?? "");
  const seoulAsset = audioAssetsById.get(busNumber.audioAssetId ?? "");
  const airportAsset = audioAssetsById.get(destination.audioAssetId ?? "");

  if (!trafficAsset || !seoulAsset || !airportAsset) {
    throw new Error("Unit 16 QR listening assets must be available.");
  }

  const lesson8 = buildLessonFromExercises(
    source,
    lookups,
    audioAssetsById,
    {
      lessonId: "unit-16-lesson-8",
      lessonRole: "workbook_practice",
      title: text("Nghe QR: ga Seoul", "QR listening: Seoul Station route"),
      summary: text(
        "Tách QR nghe về tình huống giao thông và đường đến Seoul Station thành một lesson nghe riêng.",
        "Split the traffic and Seoul Station QR audio into a dedicated listening lesson.",
      ),
      focusConcepts: ["qr-listening", "directions", "bus-number", "distance"],
      exerciseIds: [traffic.id, busNumber.id, distance.id],
      extraTasks: [
        fill(
          "u16-qr-traffic-fill",
          "퇴근 시간이라 길이 ___.",
          ["막힙니다"],
          "workbook",
          ["qr-listening"],
          text(
            "Nghe lại audio QR về giao thông và điền cụm kết thúc câu.",
            "Replay the traffic QR audio and fill the sentence ending.",
          ),
          traffic.localizedText,
          {
            audioText: trafficAsset.transcript,
            audioUrl: getAudioProxyPath(source.unitId, trafficAsset.id),
            choices: ["막힙니다", "괜찮습니다", "가깝습니다"],
          },
        ),
        fill(
          "u16-qr-bus-fill",
          "저기 정류장에서 ___번 버스를 타십시오.",
          ["100"],
          "workbook",
          ["qr-listening", "directions"],
          text(
            "Điền số xe buýt được nghe trong hội thoại QR đến Seoul Station.",
            "Fill in the bus number heard in the Seoul Station QR dialogue.",
          ),
          busNumber.localizedText,
          {
            audioText: seoulAsset.transcript,
            audioUrl: getAudioProxyPath(source.unitId, seoulAsset.id),
            choices: ["50", "100", "150"],
          },
        ),
        arr(
          "u16-qr-route-arrange",
          text("Từ đây đến ga Seoul đi thế nào?", "How do I get to Seoul Station from here?"),
          ["여기에서", "서울역까지", "어떻게", "가요?"],
          ["가요?", "어떻게", "서울역까지", "여기에서"],
          "workbook",
          ["qr-listening", "directions"],
          text(
            "Sắp xếp lại câu hỏi lộ trình xuất hiện trong đoạn QR.",
            "Rebuild the route question that appears in the QR dialogue.",
          ),
        ),
        speak(
          "u16-qr-bus-speak",
          "저기 정류장에서 100번 버스를 타십시오.",
          "workbook",
          text(
            "Nói lại câu chỉ đường lịch sự sau khi nghe audio QR.",
            "Say the polite route instruction aloud after hearing the QR audio.",
          ),
          ["qr-listening", "-(으)십시오"],
        ),
        fill(
          "u16-qr-distance-fill",
          "아니요. ___ 않아요.",
          ["멀지"],
          "workbook",
          ["qr-listening", "distance"],
          text(
            "Điền cụm mô tả khoảng cách trong câu trả lời của QR audio.",
            "Fill the distance phrase from the QR audio answer.",
          ),
          distance.localizedText,
          {
            audioText: seoulAsset.transcript,
            audioUrl: getAudioProxyPath(source.unitId, seoulAsset.id),
            choices: ["멀지", "바쁘지", "늦지"],
          },
        ),
      ],
    },
    8,
    totalLessons,
  );

  const lesson9 = buildLessonFromExercises(
    source,
    lookups,
    audioAssetsById,
    {
      lessonId: "unit-16-lesson-9",
      lessonRole: "workbook_practice",
      title: text("Nghe QR: sân bay và câu tiếp nối", "QR listening: airport and follow-up"),
      summary: text(
        "Tiếp tục section nghe bằng điểm đến cổng sân bay, lời khuyên di chuyển, và câu trả lời về khoảng cách.",
        "Continue the listening section with the airport destination, travel advice, and distance follow-up lines.",
      ),
      focusConcepts: ["qr-listening", "destination", "travel", "directions"],
      exerciseIds: [busNumber.id, distance.id, destination.id],
      extraTasks: [
        fill(
          "u16-qr-destination-fill",
          "지연 씨는 ___에 가려고 해요.",
          ["공항"],
          "workbook",
          ["qr-listening", "destination"],
          text(
            "Nghe lại audio QR về điểm đến và điền nơi muốn đến.",
            "Replay the destination QR audio and fill in the place she wants to reach.",
          ),
          destination.localizedText,
          {
            audioText: airportAsset.transcript,
            audioUrl: getAudioProxyPath(source.unitId, airportAsset.id),
            choices: ["공항", "서울역", "터미널"],
          },
        ),
        fill(
          "u16-qr-airport-bus-fill",
          "여기에서 ___번 버스를 타고 가세요.",
          ["600"],
          "workbook",
          ["qr-listening", "destination"],
          text(
            "Điền số xe buýt được gợi ý trong audio QR đi sân bay.",
            "Fill in the bus number recommended in the airport QR audio.",
          ),
          destination.localizedText,
          {
            audioText: airportAsset.transcript,
            audioUrl: getAudioProxyPath(source.unitId, airportAsset.id),
            choices: ["100", "600", "900"],
          },
        ),
        speak(
          "u16-qr-airport-speak",
          "여기에서 600번 버스를 타고 가세요.",
          "workbook",
          text(
            "Nói lại lời khuyên đi sân bay để giữ section nghe vẫn có production.",
            "Say the airport bus advice aloud so the listening section still includes production.",
          ),
          ["qr-listening", "destination"],
        ),
        arr(
          "u16-qr-route-finish-arrange",
          text("Xe buýt đó đi đến ga Seoul.", "That bus goes to Seoul Station."),
          ["그", "버스가", "서울역까지", "갑니다."],
          ["갑니다.", "서울역까지", "버스가", "그"],
          "workbook",
          ["qr-listening", "directions"],
          text(
            "Sắp xếp lại câu kết luận của đoạn QR Seoul Station.",
            "Rebuild the closing route line from the Seoul Station QR dialogue.",
          ),
        ),
        speak(
          "u16-qr-distance-speak",
          "아니요. 멀지 않아요.",
          "workbook",
          text(
            "Kết lesson bằng câu trả lời ngắn về khoảng cách.",
            "Close the lesson with the short distance-answer line.",
          ),
          ["qr-listening", "distance"],
        ),
      ],
    },
    9,
    totalLessons,
  );

  return [lesson8, lesson9];
}

function buildUnit16WorkbookLessons(
  source: SourceUnit,
  lookups: Lookups,
  audioAssetsById: Map<string, SourceAudioAsset>,
  totalLessons: number,
) {
  return [
    buildLessonFromExercises(
      source,
      lookups,
      audioAssetsById,
      {
        lessonId: "unit-16-lesson-4",
        lessonRole: "workbook_practice",
        title: text("Cơ bản về phương tiện", "Transport basics in workbook"),
        summary: text(
          "Bắt đầu cụm workbook bằng từ vựng phương tiện và cách sử dụng khi di chuyển.",
          "Open the workbook block with transport vocabulary and basic usage phrases.",
        ),
        focusConcepts: ["transport", "bus", "train", "subway"],
        taskOrdering: "interleave_pairs",
        exerciseIds: [
          "wb16-write-transport",
          "wb16-write-transport-use",
          "wb16-match-bus",
          "wb16-match-train",
          "wb16-match-subway",
        ],
      },
      4,
      totalLessons,
    ),
    buildLessonFromExercises(
      source,
      lookups,
      audioAssetsById,
      {
        lessonId: "unit-16-lesson-5",
        lessonRole: "workbook_practice",
        title: text("Di chuyển và chuyển chặng", "Movement and transfer drills"),
        summary: text(
          "Tập trung vào máy bay, chuyển chặng, đạp xe, và đi bộ trong workbook.",
          "Focus on airplanes, transfers, riding, and walking in the workbook.",
        ),
        focusConcepts: ["airplane", "transfer", "movement", "ability"],
        exerciseIds: [
          "wb16-match-airplane",
          "wb16-future-transfer",
          "wb16-walk-school",
          "wb16-bike-ride",
        ],
      },
      5,
      totalLessons,
    ),
    buildLessonFromExercises(
      source,
      lookups,
      audioAssetsById,
      {
        lessonId: "unit-16-lesson-6",
        lessonRole: "workbook_practice",
        title: text("Luyện từ-đến 1", "From-to drills 1"),
        summary: text(
          "Giữ bốn bài tuyến đường cốt lõi để section này đi thẳng vào mẫu 에서, 까지.",
          "Keep four core route exercises so this section stays focused on the 에서, 까지 pattern.",
        ),
        focusConcepts: ["from-to", "library", "subway", "agency"],
        exerciseIds: [
          "wb16-library-from",
          "wb16-restaurant-to",
          "wb16-subway-from",
          "wb16-agency-to",
        ],
      },
      6,
      totalLessons,
    ),
    buildLessonFromExercises(
      source,
      lookups,
      audioAssetsById,
      {
        lessonId: "unit-16-lesson-7",
        lessonRole: "workbook_practice",
        title: text("Luyện từ-đến 2", "From-to drills 2 and commands"),
        summary: text(
          "Khóa phần workbook route drills rồi nối sang mệnh lệnh lịch sự để chuẩn bị cho review cuối unit.",
          "Close the route-drill block and bridge into polite commands before the final review.",
        ),
        focusConcepts: ["from-to", "commands", "company", "park"],
        exerciseIds: [
          "wb16-company-from",
          "wb16-park-to",
          "wb16-command-wash",
          "wb16-command-walk-museum",
          "wb16-command-listen",
        ],
      },
      7,
      totalLessons,
    ),
    ...buildUnit16QrLessons(source, lookups, audioAssetsById, totalLessons),
  ];
}

function unit16Sections() {
  return [
    {
      sectionId: "unit-16-section-1",
      title: text("Phần 1: Cơ bản", "Section 1: transport basics"),
      summary: text(
        "Từ vựng giao thông và mẫu ngữ pháp from-to cốt lõi của unit.",
        "Transport vocabulary and the core from-to grammar of the unit.",
      ),
      lessonIds: ["unit-16-lesson-1", "unit-16-lesson-2"],
    },
    {
      sectionId: "unit-16-section-2",
      title: text("Phần 2: Hội thoại", "Section 2: dialogue and command"),
      summary: text(
        "Hỏi đường, nghe chỉ đường, và đưa phần workbook phương tiện vào main path.",
        "Ask for directions, listen to instructions, and fold the first transport workbook lesson into the path.",
      ),
      lessonIds: ["unit-16-lesson-3", "unit-16-lesson-4"],
    },
    {
      sectionId: "unit-16-section-3",
      title: text("Phần 3: Luyện chỉ đường", "Section 3: route drills"),
      summary: text(
        "Ba lesson workbook liên tiếp để phủ hết bài route drill của sách bài tập.",
        "Three workbook lessons in a row to keep the full route drills from the workbook.",
      ),
      lessonIds: ["unit-16-lesson-5", "unit-16-lesson-6", "unit-16-lesson-7"],
    },
    {
      sectionId: "unit-16-section-4",
      title: text("Phần 4: Nghe QR", "Section 4: QR listening"),
      summary: text(
        "Dồn toàn bộ bài nghe QR vào một block riêng để nghe, điền, sắp xếp, và lặp lại.",
        "Move every QR listening exercise into its own block for listening, fill, ordering, and speaking follow-up.",
      ),
      lessonIds: ["unit-16-lesson-8", "unit-16-lesson-9"],
    },
    {
      sectionId: "unit-16-section-5",
      title: text("Phần 5: Ôn tập", "Section 5: reading and production"),
      summary: text(
        "Kết unit bằng đọc hiểu và sản sinh, không trộn QR vào phần review cuối.",
        "Finish with reading and production, without mixing QR audio back into the final review.",
      ),
      lessonIds: ["unit-16-lesson-10", "unit-16-lesson-11"],
    },
  ] satisfies SectionBlueprint[];
}

function introLesson17(source: SourceUnit, lookups: Lookups, totalLessons: number) {
  const invitationCard = pickFrom(source.textbook.vocab, "v-invitation-card");
  const helpRequest = pickFrom(source.textbook.examples, "ex-help-request");
  const helpOffer = pickFrom(source.textbook.examples, "ex-help-offer");
  const titleQuestion = pickFrom(source.textbook.examples, "ex-must-buy");
  const housewarmingVisual = pickVisualVocab(lookups, "v-housewarming");
  const invitationCardVisual = pickVisualVocab(lookups, "v-invitation-card");
  const prepareVisual = pickVisualVocab(lookups, "v-prepare");

  return lesson(
    "unit-17-lesson-1",
    "intro",
    text("Mở bài tiệc tân gia", "Open the housewarming topic"),
    text(
      "Làm quen với từ vựng cốt lõi, lời nhờ giúp đỡ, và câu hỏi mở bài của bài 17.",
      "Start Unit 17 with the core housewarming words, help expressions, and the title question.",
    ),
    ["집들이", "초대장", "준비하다", "도와주다"],
    [
      "wb17-write-housewarming",
      "wb17-write-invite",
      "wb17-match-housewarming-picture",
      "wb17-match-invitation-card-picture",
    ],
    ["housewarming", "vocab", "help", "preparation"],
    [
      wmImage(
        "u17-l1-housewarming",
        housewarmingVisual,
        lookups.visualVocabPool,
        "textbook",
        text("Đây là danh từ trung tâm của cả bài 17.", "This is the central noun of Unit 17."),
      ),
      wmImage(
        "u17-l1-invitation-card",
        invitationCardVisual,
        lookups.visualVocabPool,
        "textbook",
        text(
          "Vật dụng này xuất hiện ngay từ phần mở bài workbook.",
          "This item appears immediately in the workbook warm-up.",
        ),
      ),
      wmImage(
        "u17-l1-prepare",
        prepareVisual,
        lookups.visualVocabPool,
        "workbook",
        text(
          "Động từ này nối với việc chuẩn bị đồ ăn và tiệc.",
          "This verb connects directly to preparing food and the party.",
        ),
      ),
      tr(
        "u17-l1-help-request",
        "ko_to_meaning",
        helpRequest.translations,
        helpRequest.korean,
        "textbook",
        "recall",
        ["help expression"],
        text(
          "Hiểu đúng câu nhờ giúp đỡ trước khi tự nói lại.",
          "Understand the help-request expression before producing it yourself.",
        ),
      ),
      tr(
        "u17-l1-help-offer",
        "meaning_to_ko",
        helpOffer.translations,
        helpOffer.korean,
        "textbook",
        "construction",
        ["help expression"],
        text(
          "Đổi từ ý nghĩa sang câu đề nghị giúp đỡ lịch sự.",
          "Convert the meaning into the polite offer-to-help sentence.",
        ),
      ),
      fill(
        "u17-l1-fill-card",
        "친구를 초대하려고 ___을 만들었어요.",
        ["초대장"],
        "textbook",
        [],
        text(
          "Điền đúng vật dụng được dùng để mời bạn bè.",
          "Fill in the item used to invite friends.",
        ),
        invitationCard.translations,
        {
          choices: ["초대장", "휴지", "세제"],
        },
      ),
      arr(
        "u17-l1-arr-help",
        helpRequest.translations,
        splitWords(helpRequest.korean),
        splitWords(helpRequest.korean).reverse(),
        "blended",
        ["help expression"],
        text(
          "Sắp xếp lại câu nhờ giúp đỡ để quen trật tự.",
          "Rebuild the help-request sentence to lock in its word order.",
        ),
      ),
      speak(
        "u17-l1-speak-title",
        titleQuestion.korean,
        "textbook",
        text(
          "Kết lesson bằng câu hỏi cốt lõi của bài 17.",
          "Close the lesson with Unit 17's core title question.",
        ),
        ["-아/어야 되다"],
      ),
    ],
    1,
    totalLessons,
  );
}

function grammarLesson17(source: SourceUnit, lookups: Lookups, totalLessons: number) {
  const mustFood = pickFrom(source.textbook.examples, "ex-must-make-food");
  const mustBuy = pickFrom(source.textbook.examples, "ex-must-buy");
  const swimCap = pickFrom(source.textbook.examples, "ex-must-bring-swim-cap");

  return lesson(
    "unit-17-lesson-2",
    "grammar",
    text("Tập trung -아/어야 되다", "Focus on -아/어야 되다"),
    text(
      "Khóa mẫu nghĩa vụ bằng dạng biến đổi động từ và các câu cần phải làm.",
      "Lock in the obligation pattern through verb-form changes and must-do sentences.",
    ),
    ["-아/어야 되다", "해야 돼요", "가야 돼요", "연습해야 돼요"],
    [
      "wb17-must-form-eat",
      "wb17-must-study",
      "wb17-must-meet-friend",
      "wb17-must-go-hospital",
      "wb17-must-practice-speaking",
    ],
    ["grammar", "must", "obligation", "practice"],
    [
      gram(
        "u17-l2-form",
        "먹다 -> ___",
        "먹어야 되다",
        "workbook",
        text(
          "Bắt đầu bằng dạng biến đổi cốt lõi của mẫu nghĩa vụ.",
          "Start with the core conjugation pattern for obligation.",
        ),
        ["-아/어야 되다"],
        ["먹어야 되다", "먹고요", "먹어요"],
        text("phải ăn", "have to eat"),
      ),
      fill(
        "u17-l2-study",
        "안 돼요. 한국어 공부를 ___.",
        ["해야 돼요"],
        "workbook",
        ["-아/어야 되다"],
        text(
          "Dien cach noi nghia vu voi dong tu `하다`.",
          "Fill the obligation form for the verb `하다`.",
        ),
        text("phải học tiếng Hàn", "have to study Korean"),
        {
          choices: ["해야 돼요", "하고요", "해요"],
        },
      ),
      fill(
        "u17-l2-meet",
        "친구들 약속이 있어요. 친구를 ___.",
        ["만나야 돼요"],
        "workbook",
        ["-아/어야 되다"],
        text(
          "Doi tinh huong sang dong tu `만나다` nhung giu nguyen mau nghia vu.",
          "Switch to the verb `만나다` while keeping the same obligation pattern.",
        ),
        text("phải gặp bạn", "have to meet a friend"),
        {
          choices: ["만나야 돼요", "만나고요", "만나요"],
        },
      ),
      fill(
        "u17-l2-hospital",
        "몸이 안 좋아서 병원에 ___.",
        ["가야 돼요"],
        "workbook",
        ["-아/어야 되다"],
        text(
          "Nói việc bắt buộc phải đi đến một nơi nào đó.",
          "State that you must go somewhere.",
        ),
        text("phải đến bệnh viện", "have to go to the hospital"),
        {
          choices: ["가야 돼요", "가고요", "가요"],
        },
      ),
      tr(
        "u17-l2-food",
        "meaning_to_ko",
        mustFood.translations,
        mustFood.korean,
        "textbook",
        "construction",
        ["-아/어야 되다"],
        text(
          "Dịch câu nghĩa vụ gốc của bài 17 sang tiếng Hàn.",
          "Translate Unit 17's central obligation sentence into Korean.",
        ),
      ),
      arr(
        "u17-l2-arrange-swimcap",
        swimCap.translations,
        splitWords(swimCap.korean),
        splitWords(swimCap.korean).reverse(),
        "workbook",
        ["-아/어야 되다"],
        text(
          "Sắp xếp lại câu cần phải mang theo đồ dùng.",
          "Rebuild the sentence about something you have to bring.",
        ),
      ),
      speak(
        "u17-l2-speak-title",
        mustBuy.korean,
        "textbook",
        text(
          "Lặp lại câu hỏi phải làm gì để tạo phản xạ.",
          "Say the core must-do question aloud to build reflex.",
        ),
        ["-아/어야 되다"],
      ),
      speak(
        "u17-l2-speak-swimcap",
        swimCap.korean,
        "blended",
        text(
          "Kết lesson bằng một câu nghĩa vụ dài hơn.",
          "Finish the lesson with a slightly longer obligation sentence.",
        ),
        ["-아/어야 되다"],
      ),
    ],
    2,
    totalLessons,
  );
}

function dialogueLesson17(source: SourceUnit, lookups: Lookups, totalLessons: number) {
  const usualQuestion = pickFrom(source.textbook.dialogue, "d-usual-housewarming-q");
  const activities = pickFrom(source.textbook.dialogue, "d-housewarming-activities");
  const invite = pickFrom(source.textbook.dialogue, "d-weekend-housewarming");
  const offer = pickFrom(source.textbook.dialogue, "d-help-offer-question");

  return lesson(
    "unit-17-lesson-3",
    "dialogue",
    text("Ghép hội thoại và -고요", "Rebuild dialogue and -고요"),
    text(
      "Nghe y nghia, ghep lai luot thoai, va mo rong thong tin bang -고요.",
      "Work through dialogue turns and extend information with -고요.",
    ),
    ["dialogue", "-고요", "집들이", "도와주다"],
    [
      "wb17-dialogue-help-request",
      "wb17-dialogue-help-offer",
      "wb17-goyo-school-food",
      "wb17-goyo-make-friends",
    ],
    ["dialogue", "goyo", "housewarming", "help"],
    [
      tr(
        "u17-l3-usual-question",
        "ko_to_meaning",
        usualQuestion.translations,
        usualQuestion.korean,
        "textbook",
        "recall",
        [],
        text(
          "Hiểu câu hỏi về tiệc tân gia trước khi ghép lại phần trả lời.",
          "Understand the housewarming question before rebuilding the answer.",
        ),
      ),
      dial(
        "u17-l3-activities",
        activities,
        "textbook",
        text(
          "Ghép lại lượt thoại về các hoạt động trong tiệc tân gia.",
          "Rebuild the line about what people do at the housewarming.",
        ),
      ),
      dial(
        "u17-l3-invite",
        invite,
        "textbook",
        text(
          "Ghép lại câu mời đến tiệc tân gia vào cuối tuần.",
          "Rebuild the invitation to the weekend housewarming.",
        ),
      ),
      dial(
        "u17-l3-offer",
        offer,
        "blended",
        text(
          "Ghep lai cau de nghi giup do de noi liền mach hoi thoai.",
          "Rebuild the offer-to-help line so the dialogue flows naturally.",
        ),
      ),
      fill(
        "u17-l3-school-food",
        "직원들이 친절해요. 음식도 ___.",
        ["맛있고요"],
        "workbook",
        ["-고요"],
        text(
          "Dien them mot y bo sung bang -고요.",
          "Add one more supporting point with -고요.",
        ),
        text("đồ ăn cũng ngon", "the food is tasty too"),
        {
          choices: ["맛있고요", "맛있어야 돼요", "맛있어요"],
        },
      ),
      fill(
        "u17-l3-friends",
        "재미있어요. 친구도 사귈 수 ___.",
        ["있고요"],
        "workbook",
        ["-고요"],
        text(
          "Dung -고요 de bo sung them mot loi ich nua.",
          "Use -고요 to add one more benefit.",
        ),
        text("cũng có thể kết bạn", "you can make friends too"),
        {
          choices: ["있고요", "있어야 돼요", "있어요"],
        },
      ),
      arr(
        "u17-l3-arrange-activities",
        activities.translations,
        splitWords(activities.korean),
        splitWords(activities.korean).reverse(),
        "workbook",
        ["-고요"],
        text(
          "Sắp xếp lại câu nói hai hoạt động liên tiếp.",
          "Arrange the line that links two activities together.",
        ),
      ),
      speak(
        "u17-l3-speak-activities",
        `${activities.korean} ${offer.korean}`,
        "blended",
        text(
          "Ket lesson bang mot cum hoi thoai ngan co -고요 va loi de nghi giup do.",
          "Close the lesson with a short dialogue chunk using -고요 and a help offer.",
        ),
        ["-고요"],
      ),
    ],
    3,
    totalLessons,
  );
}

function buildUnit17QrLessons(
  source: SourceUnit,
  lookups: Lookups,
  audioAssetsById: Map<string, SourceAudioAsset>,
  totalLessons: number,
) {
  const partyTime = pickFrom(source.workbook.exercises, "wb17-qr-party-time");
  const buyGifts = pickFrom(source.workbook.exercises, "wb17-qr-buy-gifts");
  const dialogueAsset = audioAssetsById.get(partyTime.audioAssetId ?? "");

  if (!dialogueAsset) {
    throw new Error("Unit 17 QR dialogue audio must be available.");
  }

  const lesson8 = buildLessonFromExercises(
    source,
    lookups,
    audioAssetsById,
    {
      lessonId: "unit-17-lesson-8",
      lessonRole: "workbook_practice",
      title: text("Nghe QR: giờ và hẹn gặp", "QR listening: time and meetup"),
      summary: text(
        "Tách đoạn nghe QR ra thành lesson riêng để khóa giờ bắt đầu và câu hẹn gặp.",
        "Split the QR dialogue into its own lesson to lock in the party time and meetup line.",
      ),
      focusConcepts: ["qr-listening", "housewarming", "time", "meetup"],
      exerciseIds: [partyTime.id, buyGifts.id],
      extraTasks: [
        fill(
          "u17-qr-time-fill",
          "집들이가 ___ 시예요.",
          ["여섯"],
          "workbook",
          ["qr-listening", "time"],
          text(
            "Nghe lại đoạn QR và điền giờ diễn ra tiệc tân gia.",
            "Replay the QR dialogue and fill in the housewarming time.",
          ),
          partyTime.localizedText,
          {
            audioText: dialogueAsset.transcript,
            audioUrl: getAudioProxyPath(source.unitId, dialogueAsset.id),
            choices: ["여섯", "일곱", "여덟"],
          },
        ),
        speak(
          "u17-qr-time-speak",
          "저녁 여섯 시예요.",
          "workbook",
          text(
            "Nói lại câu trả lời về giờ bắt đầu của tiệc tân gia.",
            "Say the answer about the housewarming time aloud.",
          ),
          ["qr-listening", "time"],
        ),
        arr(
          "u17-qr-time-arrange",
          text("Tiệc tân gia mấy giờ?", "What time is the housewarming?"),
          ["집들이가", "몇", "시예요?"],
          ["시예요?", "몇", "집들이가"],
          "workbook",
          ["qr-listening", "time"],
          text(
            "Sắp xếp lại câu hỏi giờ giấc xuất hiện trong audio QR.",
            "Rebuild the time question that appears in the QR audio.",
          ),
        ),
        fill(
          "u17-qr-meetup-fill",
          "그럼 샤오위 씨 집에서 ___.",
          ["만나요"],
          "workbook",
          ["qr-listening", "meetup"],
          text(
            "Điền động từ cuối câu hẹn gặp trong đoạn QR.",
            "Fill the final meetup verb from the QR dialogue.",
          ),
          text("chúng ta gặp ở nhà Xiaowei", "let's meet at Xiaowei's home"),
          {
            audioText: dialogueAsset.transcript,
            audioUrl: getAudioProxyPath(source.unitId, dialogueAsset.id),
            choices: ["만나요", "사요", "도와요"],
          },
        ),
        arr(
          "u17-qr-meetup-arrange",
          text("Vậy thì gặp ở nhà Xiaowei.", "Then let's meet at Xiaowei's home."),
          ["그럼", "샤오위", "씨", "집에서", "만나요."],
          ["만나요.", "집에서", "씨", "샤오위", "그럼"],
          "workbook",
          ["qr-listening", "meetup"],
          text(
            "Sắp xếp lại câu kết thúc của đoạn hội thoại QR.",
            "Rebuild the closing line of the QR dialogue.",
          ),
        ),
        speak(
          "u17-qr-meetup-speak",
          "그럼 샤오위 씨 집에서 만나요.",
          "workbook",
          text(
            "Kết lesson bằng câu hẹn gặp tự nhiên trong đoạn QR.",
            "Close the lesson by saying the natural meetup line from the QR dialogue.",
          ),
          ["qr-listening", "meetup"],
        ),
      ],
    },
    8,
    totalLessons,
  );

  const lesson9 = buildLessonFromExercises(
    source,
    lookups,
    audioAssetsById,
    {
      lessonId: "unit-17-lesson-9",
      lessonRole: "workbook_practice",
      title: text("Nghe QR: quà mang theo và phản hồi", "QR listening: gifts and response"),
      summary: text(
        "Tiếp tục QR section bằng phần mua quà mang đến và câu hỏi phản hồi lịch sự.",
        "Continue the QR section with the gift discussion and the polite follow-up question.",
      ),
      focusConcepts: ["qr-listening", "gifts", "housewarming", "response"],
      exerciseIds: [partyTime.id, buyGifts.id],
      extraTasks: [
        fill(
          "u17-qr-detergent-fill",
          "보통 ___를 사 가고, 휴지도 사 가요.",
          ["세제"],
          "workbook",
          ["qr-listening", "gifts"],
          text(
            "Điền món quà xuất hiện đầu tiên trong câu trả lời của QR.",
            "Fill in the first gift item named in the QR answer.",
          ),
          buyGifts.localizedText,
          {
            audioText: dialogueAsset.transcript,
            audioUrl: getAudioProxyPath(source.unitId, dialogueAsset.id),
            choices: ["세제", "꽃", "초대장"],
          },
        ),
        fill(
          "u17-qr-bring-fill",
          "그럼 휴지하고 세제를 제가 ___?",
          ["사 갈까요"],
          "workbook",
          ["qr-listening", "gifts"],
          text(
            "Điền cụm phản hồi lịch sự để đề nghị mua mang đến.",
            "Fill the polite follow-up phrase that offers to bring the gifts.",
          ),
          text("Vậy tôi sẽ mua khăn giấy và chất tẩy nhé?", "Then shall I bring tissue paper and detergent?"),
          {
            audioText: dialogueAsset.transcript,
            audioUrl: getAudioProxyPath(source.unitId, dialogueAsset.id),
            choices: ["사 갈까요", "먹을까요", "갈까요"],
          },
        ),
        speak(
          "u17-qr-bring-speak",
          "그럼 휴지하고 세제를 제가 사 갈까요?",
          "workbook",
          text(
            "Nói lại câu đề nghị giúp đỡ trong audio QR.",
            "Say the offer-to-help question from the QR audio aloud.",
          ),
          ["qr-listening", "gifts"],
        ),
        arr(
          "u17-qr-gifts-arrange",
          text("Thường thì mang chất tẩy và khăn giấy.", "Usually people bring detergent and tissue paper."),
          ["보통", "세제를", "사", "가고,", "휴지도", "사", "가요."],
          ["가요.", "사", "휴지도", "가고,", "사", "세제를", "보통"],
          "workbook",
          ["qr-listening", "gifts"],
          text(
            "Sắp xếp lại câu nói về những món quà nên mua đem theo.",
            "Rebuild the line about what gifts people usually bring.",
          ),
        ),
        tr(
          "u17-qr-buy-question",
          "meaning_to_ko",
          text("Tôi nên mua gì mang đến tiệc tân gia?", "What should I buy for the housewarming?"),
          "집들이에 뭘 사 가야 돼요?",
          "workbook",
          "construction",
          ["qr-listening", "-아/어야 되다"],
          text(
            "Viết lại câu hỏi xuất hiện ở giữa đoạn hội thoại QR.",
            "Write the question that appears in the middle of the QR dialogue.",
          ),
        ),
        speak(
          "u17-qr-buy-question-speak",
          "집들이에 뭘 사 가야 돼요?",
          "workbook",
          text(
            "Kết lesson bằng câu hỏi hỏi ý kiến về quà mang đến.",
            "Close the lesson with the question that asks what to bring.",
          ),
          ["qr-listening", "-아/어야 되다"],
        ),
      ],
    },
    9,
    totalLessons,
  );

  return [lesson8, lesson9];
}

function buildUnit17WorkbookLessons(
  source: SourceUnit,
  lookups: Lookups,
  audioAssetsById: Map<string, SourceAudioAsset>,
  totalLessons: number,
) {
  return [
    buildLessonFromExercises(
      source,
      lookups,
      audioAssetsById,
      {
        lessonId: "unit-17-lesson-4",
        lessonRole: "workbook_practice",
        title: text("Mẫu ngữ pháp trong workbook", "Workbook grammar forms"),
        summary: text(
          "Đẩy nhanh qua workbook form-change trước khi vào cụm bài tập dài hơn.",
          "Move quickly through the workbook form-change drills before the longer practice block.",
        ),
        focusConcepts: ["must", "goyo", "writing", "invitation"],
        exerciseIds: [
          "wb17-write-housewarming",
          "wb17-write-invite",
          "wb17-must-form-eat",
          "wb17-goyo-form-make",
        ],
      },
      4,
      totalLessons,
    ),
    buildLessonFromExercises(
      source,
      lookups,
      audioAssetsById,
      {
        lessonId: "unit-17-lesson-5",
        lessonRole: "workbook_practice",
        title: text("Luyện từ vựng bằng tranh", "Luyện từ vựng bằng tranh"),
        summary: text(
          "Giữ đủ phần từ vựng hình ảnh của workbook thay vì cắt bớt.",
          "Keep the full picture-vocabulary block from the workbook instead of trimming it down.",
        ),
        focusConcepts: ["vocab", "housewarming", "tissue", "detergent"],
        exerciseIds: [
          "wb17-match-housewarming-picture",
          "wb17-match-invitation-card-picture",
          "wb17-match-tissue-picture",
          "wb17-match-detergent-picture",
        ],
      },
      5,
      totalLessons,
    ),
    buildLessonFromExercises(
      source,
      lookups,
      audioAssetsById,
      {
        lessonId: "unit-17-lesson-6",
        lessonRole: "workbook_practice",
        title: text("Luyện hội thoại mua sắm", "Shopping dialogue drills"),
        summary: text(
          "Gồm đủ chat, hỏi, và câu đề nghị giúp đỡ trong workbook vào cùng một lesson.",
          "Group the workbook shopping chat, questions, and help-offer lines into one lesson.",
        ),
        focusConcepts: ["dialogue", "shopping", "help", "housewarming"],
        exerciseIds: [
          "wb17-chat-housewarming",
          "wb17-chat-detergent",
          "wb17-chat-tissue",
          "wb17-dialogue-help-request",
          "wb17-dialogue-help-offer",
        ],
      },
      6,
      totalLessons,
    ),
    buildLessonFromExercises(
      source,
      lookups,
      audioAssetsById,
      {
        lessonId: "unit-17-lesson-7",
        lessonRole: "workbook_practice",
        title: text("Bài luyện bắt buộc", "Must-do drills"),
        summary: text(
          "Giữ trọn cụm bài phải làm của workbook trước khi sang section nghe QR.",
          "Keep the full workbook obligation drills before moving into the QR listening section.",
        ),
        focusConcepts: ["must", "study", "hospital", "speaking"],
        exerciseIds: [
          "wb17-must-study",
          "wb17-must-meet-friend",
          "wb17-must-go-hospital",
          "wb17-must-practice-speaking",
        ],
      },
      7,
      totalLessons,
    ),
    ...buildUnit17QrLessons(source, lookups, audioAssetsById, totalLessons),
  ];
}

function unit17Sections() {
  return [
    {
      sectionId: "unit-17-section-1",
      title: text("Phần 1: Tân gia", "Section 1: housewarming basics"),
      summary: text(
        "Mở bài bằng từ vựng tiệc tân gia và mẫu câu nghĩa vụ cơ bản.",
        "Open with housewarming vocabulary and the first obligation patterns.",
      ),
      lessonIds: ["unit-17-lesson-1", "unit-17-lesson-2"],
    },
    {
      sectionId: "unit-17-section-2",
      title: text("Phần 2: Hội thoại", "Section 2: dialogue and forms"),
      summary: text(
        "Ghep hoi thoai, -고요, va day tiep bang workbook form-change.",
        "Rebuild the dialogue, reinforce -고요, and extend it with workbook form changes.",
      ),
      lessonIds: ["unit-17-lesson-3", "unit-17-lesson-4"],
    },
    {
      sectionId: "unit-17-section-3",
      title: text("Phần 3: Trọng tâm workbook", "Section 3: workbook core"),
      summary: text(
        "Ba lesson để giữ trọn picture vocab, shopping chat, và must-do drills của workbook.",
        "Three lessons to preserve the picture vocab, shopping chat, and must-do drills from the workbook.",
      ),
      lessonIds: ["unit-17-lesson-5", "unit-17-lesson-6", "unit-17-lesson-7"],
    },
    {
      sectionId: "unit-17-section-4",
      title: text("Phần 4: Nghe QR", "Section 4: QR listening"),
      summary: text(
        "Dồn toàn bộ bài nghe QR về giờ giấc và quà mang đến vào một block nghe riêng.",
        "Move the full QR audio about time and gifts into its own listening block.",
      ),
      lessonIds: ["unit-17-lesson-8", "unit-17-lesson-9"],
    },
    {
      sectionId: "unit-17-section-5",
      title: text("Phần 5: Email", "Section 5: email and production"),
      summary: text(
        "Kết unit bằng email và phần sản sinh, không trộn QR vào section cuối.",
        "Finish with email work and production, without mixing QR back into the final section.",
      ),
      lessonIds: ["unit-17-lesson-10", "unit-17-lesson-11"],
    },
  ] satisfies SectionBlueprint[];
}

// Retained as a reference for the earlier mixed review layout while the main path now uses reviewLessons17MainPath.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function reviewLessons17(
  source: SourceUnit,
  lookups: Lookups,
  startOrder: number,
  totalLessons: number,
  audioAssetsById: Map<string, SourceAudioAsset>,
) {
  const reviewAIds = [
    "wb17-email-hi",
    "wb17-email-do",
    "wb17-email-food",
    "wb17-email-message",
  ];
  const reviewBIds = [
    "wb17-dialogue-help-request",
    "wb17-dialogue-help-offer",
    "wb17-travel-place",
  ];
  const reviewAExercises = reviewAIds.map((id) => pickFrom(source.workbook.exercises, id));
  const reviewBExercises = reviewBIds.map((id) => pickFrom(source.workbook.exercises, id));
  const qrExercises = ["wb17-qr-party-time", "wb17-qr-buy-gifts"]
    .map((id) => pickFrom(source.workbook.exercises, id))
    .filter(
      (exercise) =>
        !exercise.needsReview &&
        (!exercise.audioAssetId || isReadyAudioAsset(audioAssetsById.get(exercise.audioAssetId))),
    );
  const emailDo = pickFrom(source.textbook.examples, "ex-email-what-do");
  const emailFood = pickFrom(source.textbook.examples, "ex-email-what-food");

  const review1 = lesson(
    `unit-17-lesson-${startOrder}`,
    "review",
    text("Ôn tập email và nghe", "Email and listening review"),
    text(
      "Gom lai email hoi loi khuyen, cau nghia vu, va them bai nghe QR neu asset san sang.",
      "Review the advice email, obligation questions, and QR listening if the asset is ready.",
    ),
    ["review", "email", "-아/어야 되다", "-고요"],
    [...reviewAIds, "wb17-qr-party-time", "wb17-qr-buy-gifts"],
    Array.from(
      new Set(
        [...reviewAExercises, ...qrExercises].flatMap((exercise) => exercise.coverageTags),
      ),
    ),
    [
      ...reviewAExercises.flatMap((exercise) =>
        exerciseToTasks(source.unitId, exercise, lookups, audioAssetsById),
      ),
      ...qrExercises.flatMap((exercise) =>
        exerciseToTasks(source.unitId, exercise, lookups, audioAssetsById),
      ),
    ],
    startOrder,
    totalLessons,
  );

  const review2 = lesson(
    `unit-17-lesson-${startOrder + 1}`,
    "review",
    text("Nói và viết có khung", "Scaffolded speaking and writing"),
    text(
      "Khoa bai 17 bang cau noi, cau viet, va phan ung co khung de tu san sinh hon.",
      "Close Unit 17 with scaffolded speaking and writing prompts for more independent output.",
    ),
    ["review", "speaking", "writing", "housewarming"],
    reviewBIds,
    Array.from(new Set(reviewBExercises.flatMap((exercise) => exercise.coverageTags))),
    [
      ...reviewBExercises.flatMap((exercise) =>
        exerciseToTasks(source.unitId, exercise, lookups, audioAssetsById),
      ),
      tr(
        "u17-review-b-email-do",
        "meaning_to_ko",
        emailDo.translations,
        emailDo.korean,
        "textbook",
        "construction",
        ["-아/어야 되다"],
        text(
          "Viet lai cau hoi xin loi khuyen ve tiec tan gia.",
          "Write the question that asks for advice about the housewarming.",
        ),
      ),
      speak(
        "u17-review-b-food",
        emailFood.korean,
        "blended",
        text(
          "Ket unit bang mot cau hoi tu nhien ve mon an can chuan bi.",
          "Close the unit with a natural question about what food to prepare.",
        ),
        ["-아/어야 되다"],
      ),
    ],
    startOrder + 1,
    totalLessons,
  );

  return [review1, review2];
}

function reviewLessons17MainPath(
  source: SourceUnit,
  lookups: Lookups,
  audioAssetsById: Map<string, SourceAudioAsset>,
  totalLessons: number,
) {
  return [
    buildLessonFromExercises(
      source,
      lookups,
      audioAssetsById,
      {
        lessonId: "unit-17-lesson-10",
        lessonRole: "review",
        title: text("Ôn email", "Email review"),
        summary: text(
          "Khóa phần email của workbook thành một lesson riêng không trộn QR listening.",
          "Close the workbook email sequence in its own review lesson without mixing QR listening back in.",
        ),
        focusConcepts: ["email", "writing", "must", "goyo"],
        exerciseIds: [
          "wb17-email-hi",
          "wb17-email-do",
          "wb17-email-food",
          "wb17-email-message",
        ],
      },
      10,
      totalLessons,
    ),
    buildLessonFromExercises(
      source,
      lookups,
      audioAssetsById,
      {
        lessonId: "unit-17-lesson-11",
        lessonRole: "review",
        title: text("Ôn tập sản sinh", "Production review"),
        summary: text(
          "Ket unit bang bai san sinh co khung tu dialogue, -고요, va travel prompt.",
          "Finish the unit with scaffolded production drawn from dialogue, -고요, and the travel prompt.",
        ),
        focusConcepts: ["production", "dialogue", "goyo", "travel"],
        exerciseIds: [
          "wb17-goyo-school-food",
          "wb17-goyo-make-friends",
          "wb17-dialogue-help-request",
          "wb17-dialogue-help-offer",
          "wb17-travel-place",
        ],
      },
      11,
      totalLessons,
    ),
  ];
}

function reviewWords(source: SourceUnit) {
  return Array.from(
    new Set([
      ...source.textbook.vocab.map((item) => item.korean),
      ...source.textbook.examples.map((item) => item.korean),
    ]),
  );
}

function buildRuntimeContext(source: SourceUnit) {
  const lookups = buildLookups(source);
  const audioAssetsById = new Map(
    source.workbook.audioAssets.map((asset) => [asset.id, asset] as const),
  );
  const eligibleExercises = source.workbook.exercises.filter(
    (exercise) =>
      !exercise.needsReview &&
      (!exercise.audioAssetId || isReadyAudioAsset(audioAssetsById.get(exercise.audioAssetId))),
  );
  const totalLessons = 11;

  if (eligibleExercises.length < 18) {
    throw new Error(
      `A runtime unit needs at least 18 compileable workbook exercises. Found ${eligibleExercises.length}.`,
    );
  }

  return {
    lookups,
    audioAssetsById,
    eligibleExercises,
    totalLessons,
  };
}

export function buildRuntimeUnit(source: SourceUnit): RuntimeUnit {
  const { lookups, audioAssetsById, totalLessons } = buildRuntimeContext(source);
  const lessons = [
    introLesson(source, lookups, totalLessons),
    grammarLesson(source, lookups, totalLessons),
    dialogueLesson(source, lookups, totalLessons),
    ...buildUnit1WorkbookLessons(source, lookups, audioAssetsById, totalLessons),
    ...reviewLessons(source, lookups, 10, totalLessons, audioAssetsById),
  ];
  const sectioned = applySections(lessons, unit1Sections());

  return {
    unitId: source.unitId,
    unitNumber: source.unitNumber,
    title: source.title,
    subtitle: text(
      "Bắt đầu bằng textbook input, đẩy mạnh workbook practice, và giữ listening hoạt động xuyên suốt unit.",
      "Start with textbook input, lean into workbook practice, and keep listening active throughout the unit.",
    ),
    reviewWords: reviewWords(source),
    sections: sectioned.sections,
    lessons: sectioned.lessons,
  };
}

// Retained as a reference for the earlier mixed review layout while the main path now uses reviewLessons16MainPath.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function reviewLessons16(
  source: SourceUnit,
  lookups: Lookups,
  startOrder: number,
  totalLessons: number,
  audioAssetsById: Map<string, SourceAudioAsset>,
) {
  const qrIds = [
    "wb16-qr-traffic-jam",
    "wb16-qr-seoul-bus-number",
    "wb16-qr-seoul-distance",
    "wb16-qr-destination",
  ];
  const reviewBIds = [
    "wb16-reading-train",
    "wb16-reading-time",
    "wb16-reading-gyeongju-bus",
    "wb16-extension-line3",
    "wb16-extension-find-hotel",
  ];
  const qrExercises = qrIds
    .map((id) => pickFrom(source.workbook.exercises, id))
    .filter(
      (exercise) =>
        !exercise.needsReview &&
        (!exercise.audioAssetId || isReadyAudioAsset(audioAssetsById.get(exercise.audioAssetId))),
    );
  const reviewBExercises = reviewBIds.map((id) => pickFrom(source.workbook.exercises, id));
  const routeQuestion = pickFrom(source.textbook.examples, "ex-home-school-time");
  const thirtyMinutes = pickFrom(source.textbook.examples, "ex-thirty-minutes");
  const titleQuestion = pickFrom(source.textbook.dialogue, "d-title-question");
  const instruction = pickFrom(source.textbook.dialogue, "d-bus-stop-instruction");

  const review1 = lesson(
    `unit-16-lesson-${startOrder}`,
    "review",
    text("Ôn nghe và chỉ đường", "Listening and route review"),
    text(
      "Gom lai cac bai nghe QR va cac cau hoi duong di cot loi cua bai 16.",
      "Pull together the QR listening tasks and the core route prompts from Unit 16.",
    ),
    ["review", "qr-listening", "directions", "transport"],
    qrIds,
    Array.from(new Set(qrExercises.flatMap((exercise) => exercise.coverageTags))),
    [
      ...qrExercises.flatMap((exercise) =>
        exerciseToTasks(source.unitId, exercise, lookups, audioAssetsById),
      ),
      tr(
        "u16-review-a-route-question",
        "meaning_to_ko",
        routeQuestion.translations,
        routeQuestion.korean,
        "textbook",
        "construction",
        ["에서, 까지"],
        text(
          "Viet lai cau hoi hoan chinh de xin thong tin ve lo trinh.",
          "Rewrite the full question used to ask about a route.",
        ),
      ),
      tr(
        "u16-review-a-thirty-minutes",
        "meaning_to_ko",
        thirtyMinutes.translations,
        thirtyMinutes.korean,
        "textbook",
        "construction",
        ["에서, 까지"],
        text(
          "Viet lai cau tra loi ngan ve thoi gian di chuyen.",
          "Rewrite the short answer about travel time.",
        ),
      ),
      arr(
        "u16-review-a-arrange-title",
        titleQuestion.translations,
        splitWords(titleQuestion.korean),
        splitWords(titleQuestion.korean).reverse(),
        "blended",
        [],
        text(
          "Ghep lai cau hoi duong di mot lan nua truoc khi sang phan tong hop.",
          "Rebuild the directions question once more before the cumulative section.",
        ),
      ),
      speak(
        "u16-review-a-speak-instruction",
        instruction.korean,
        "textbook",
        text(
          "Noi lai cau chi duong co menh lenh lich su.",
          "Say the polite route instruction aloud again.",
        ),
        ["-으십시오/-십시오"],
      ),
    ],
    startOrder,
    totalLessons,
  );

  const review2 = lesson(
    `unit-16-lesson-${startOrder + 1}`,
    "review",
    text("Ôn đọc và sản sinh", "Reading and production review"),
    text(
      "Khoa bai 16 bang bai doc du lich, cau hoan thanh thong tin, va cac loi khuyen co khung.",
      "Close Unit 16 with travel reading, information completion, and scaffolded advice prompts.",
    ),
    ["review", "reading", "travel", "commands"],
    reviewBIds,
    Array.from(new Set(reviewBExercises.flatMap((exercise) => exercise.coverageTags))),
    reviewBExercises.flatMap((exercise) =>
      exerciseToTasks(source.unitId, exercise, lookups, audioAssetsById),
    ),
    startOrder + 1,
    totalLessons,
  );

  return [review1, review2];
}

function reviewLessons16MainPath(
  source: SourceUnit,
  lookups: Lookups,
  audioAssetsById: Map<string, SourceAudioAsset>,
  totalLessons: number,
) {
  return [
    buildLessonFromExercises(
      source,
      lookups,
      audioAssetsById,
      {
        lessonId: "unit-16-lesson-10",
        lessonRole: "review",
        title: text("Ôn đọc hiểu", "Reading review"),
        summary: text(
          "Dồn phần đọc hiểu du lịch vào review riêng, không trộn lại QR listening.",
          "Move the travel reading block into its own review lesson without mixing the QR listening back in.",
        ),
        focusConcepts: ["reading", "travel", "train", "bus"],
        exerciseIds: [
          "wb16-reading-train",
          "wb16-reading-time",
          "wb16-reading-transfer",
          "wb16-reading-gyeongju-bus",
          "wb16-reading-not-used",
        ],
      },
      10,
      totalLessons,
    ),
    buildLessonFromExercises(
      source,
      lookups,
      audioAssetsById,
      {
        lessonId: "unit-16-lesson-11",
        lessonRole: "review",
        title: text("Ôn tập sản sinh", "Production review"),
        summary: text(
          "Kết unit bằng advice và sản sinh, đồng thời giữ lại một command workbook còn thiếu.",
          "Finish the unit with advice and production while keeping the remaining workbook command exercise.",
        ),
        focusConcepts: ["production", "commands", "travel", "extension"],
        exerciseIds: [
          "wb16-extension-line3",
          "wb16-extension-songs",
          "wb16-extension-find-hotel",
          "wb16-command-lie-down",
        ],
      },
      11,
      totalLessons,
    ),
  ];
}

export function buildRuntimeUnit16(source: SourceUnit): RuntimeUnit {
  const { lookups, audioAssetsById, totalLessons } = buildRuntimeContext(source);
  const lessons = [
    introLesson16(source, lookups, totalLessons),
    grammarLesson16(source, lookups, totalLessons),
    dialogueLesson16(source, lookups, totalLessons),
    ...buildUnit16WorkbookLessons(source, lookups, audioAssetsById, totalLessons),
    ...reviewLessons16MainPath(source, lookups, audioAssetsById, totalLessons),
  ];
  const sectioned = applySections(lessons, unit16Sections());

  return {
    unitId: source.unitId,
    unitNumber: source.unitNumber,
    title: source.title,
    subtitle: text(
      "Mo bai bang tu vung giao thong, khoa lai 에서/까지 va -으십시오/-십시오, roi on bang nghe duong di va bai doc du lich.",
      "Open with transport vocabulary, lock in 에서/까지 and -으십시오/-십시오, then review with route listening and travel reading.",
    ),
    reviewWords: reviewWords(source),
    sections: sectioned.sections,
    lessons: sectioned.lessons,
  };
}

export function buildRuntimeUnit17(source: SourceUnit): RuntimeUnit {
  const { lookups, audioAssetsById, totalLessons } = buildRuntimeContext(source);
  const lessons = [
    introLesson17(source, lookups, totalLessons),
    grammarLesson17(source, lookups, totalLessons),
    dialogueLesson17(source, lookups, totalLessons),
    ...buildUnit17WorkbookLessons(source, lookups, audioAssetsById, totalLessons),
    ...reviewLessons17MainPath(source, lookups, audioAssetsById, totalLessons),
  ];
  const sectioned = applySections(lessons, unit17Sections());

  return {
    unitId: source.unitId,
    unitNumber: source.unitNumber,
    title: source.title,
    subtitle: text(
      "Mo bai bang tu vung tan gia, di sau vao -아/어야 되다 va -고요, roi khoa lai bang email va hoi thoai co khung.",
      "Open with housewarming vocabulary, push through -아/어야 되다 and -고요, then close with scaffolded email and dialogue work.",
    ),
    reviewWords: reviewWords(source),
    sections: sectioned.sections,
    lessons: sectioned.lessons,
  };
}

export async function generateRuntimeUnit(options: GenerateOptions) {
  const reviewedPath = getReviewedSourcePath(options.unitId);
  const source = sourceUnitSchema.parse(await readJsonFile<SourceUnit>(reviewedPath));

  if (source.needsReview) {
    throw new Error(
      `Source unit ${options.unitId} still needs review. Refusing to compile runtime lessons.`,
    );
  }

  let runtimeUnit =
    source.unitId === "17"
      ? buildRuntimeUnit17(source)
      : source.unitId === "16"
        ? buildRuntimeUnit16(source)
        : buildRuntimeUnit(source);
  runtimeUnit = await maybeEnhanceRuntimeUnitWithOpenAI(runtimeUnit, {
    localOnly: options.localOnly ?? false,
  });
  runtimeUnit = runtimeUnitSchema.parse(runtimeUnit);

  const runtimePath = getRuntimeUnitPath(options.unitId);
  const indexPath = getGeneratedIndexPath();
  const existingIndex = await readJsonFile<CurriculumIndex>(indexPath).catch(() => ({
    units: [],
  }));
  const index: CurriculumIndex = {
    units: [
      ...existingIndex.units.filter((entry) => entry.id !== runtimeUnit.unitId),
      { id: runtimeUnit.unitId, file: `unit-${runtimeUnit.unitId}.runtime.json` },
    ].sort((left, right) => Number(left.id) - Number(right.id)),
  };

  await writeJsonFile(runtimePath, runtimeUnit);
  await writeJsonFile(indexPath, index);

  return { runtimePath, indexPath, runtimeUnit };
}
