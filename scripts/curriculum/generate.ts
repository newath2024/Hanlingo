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
    ? text("Hoan thanh cau sau.", "Complete the sentence.")
    : text("Dien vao cho trong.", "Fill in the blank.");
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
  return [...tasks].sort((left, right) => STAGE_ORDER[left.stage] - STAGE_ORDER[right.stage]);
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
        ? text("Nhan dien va lam quen", "Recognition and warm-up")
        : order >= total - 1
          ? text("On tap tong hop", "Cumulative production")
          : text("Nho lai va xay cau", "Recall and construction"),
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
      "Noi tu tieng Han voi dung y nghia.",
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
      "Chon the dung voi y nghia nay.",
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
    prompt: options?.prompt ?? text("Nghe roi chon dap an dung.", "Listen and choose the correct answer."),
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
      text("Nghe roi chon the phu hop.", "Listen and choose the matching card."),
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
      ? text("Dich y nghia sang tieng Han.", "Translate the meaning into Korean.")
      : text("Dich cau tieng Han sang y nghia.", "Translate the Korean into its meaning."),
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
      ? text("Nhap cau tieng Han", "Type the Korean sentence")
      : text("Nhap y nghia", "Type the meaning"),
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
    prompt: text("Sap xep lai cau hoan chinh.", "Arrange the words into a complete sentence."),
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
    prompt: options?.prompt ?? text("Dien vao cho trong.", "Fill in the blank."),
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
    placeholder: options?.placeholder ?? text("Nhap phan con thieu", "Type the missing part"),
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
    prompt: text("Chon dap an dung.", "Choose the correct answer."),
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
    prompt: text("Ghep lai cau hoi thoai.", "Rebuild the dialogue line."),
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
    prompt: text("Noi to cau nay.", "Say this sentence aloud."),
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
          "Nghe file audio that tu QR roi chon dap an dung.",
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
            "Bat dau bang nhan dien hinh anh va chu Han cung luc.",
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
            "Nghe lai tu nay va chon the dung de khoa am va hinh.",
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
        text("Bat dau bang nhan dien y nghia nhanh.", "Start with quick meaning recognition."),
      ),
      ls(
        `${exercise.id}-2`,
        exercise.koreanText ?? answerText(exercise.answer),
        meaning,
        lookups.choicePool,
        "workbook",
        text(
          "Nghe lai cung bieu hien de khoa am va nghia.",
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
          "Dien lai dung phan con thieu cua mau cau.",
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
          "Chon lai dap an de tranh nham duoi cau hoac danh tu chinh.",
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
          "Xay lai cau theo dung trat tu tu nhien.",
          "Build the sentence back in natural order.",
        ),
      ),
      speak(
        `${exercise.id}-2`,
        answerText(exercise.answer),
        "workbook",
        text(
          "Noi to cau vua ghep de chuyen sang phan xa noi.",
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
            "Nhan y nghia truoc roi moi go lai.",
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
          text("Go lai y nghia bang tri nho.", "Type the meaning from memory."),
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
          "Dich y nghia thanh cau tieng Han day du.",
          "Translate the meaning into a full Korean sentence.",
        ),
      ),
      speak(
        `${exercise.id}-2`,
        answerText(exercise.answer),
        "workbook",
        text(
          "Noi lai cau vua dich de tang san sinh chu dong.",
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
          "Bai nghe ngan nen uu tien nhan dien nhanh.",
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
          "Sau khi nghe dung, go lai y nghia de khoa tri nho.",
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
          "Nhac lai duoi cau lich su cot loi cua Unit 1.",
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
        text("Dien lai mo hinh N + copula.", "Fill the N + copula pattern again."),
      ),
    ];
  }

  if (Array.isArray(exercise.answer)) {
    return [
      arr(
        `${exercise.id}-1`,
        text("Tu gioi thieu ngan", "Short self-introduction"),
        splitWords(exercise.answer),
        splitWords(exercise.answer),
        "workbook",
        ["N + 저는"],
        text(
          "Ghep lai cum cau tu gioi thieu ngan.",
          "Rebuild the short self-introduction script.",
        ),
      ),
      speak(
        `${exercise.id}-2`,
        answerText(exercise.answer),
        "workbook",
        text(
          "Noi tron mini script de mo phong speaking.",
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
        "Viet lai cau dich tu nghia da biet.",
        "Rewrite the target sentence from the known meaning.",
      ),
    ),
    speak(
      `${exercise.id}-2`,
      answerText(exercise.answer),
      "workbook",
      text(
        "Doc to cau vua viet de xay phan xa noi.",
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

  return lesson(
    blueprint.lessonId,
    blueprint.lessonRole,
    blueprint.title,
    blueprint.summary,
    blueprint.focusConcepts,
    blueprint.exerciseIds,
    coverageTags,
    [
      ...exercises.flatMap((exercise) =>
        exerciseToTasks(source.unitId, exercise, lookups, audioAssetsById),
      ),
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
    text("Bat dau chao hoi", "Start with greetings"),
    text(
      "Mo unit bang loi chao, dai tu khiem nhuong, va mau cau gioi thieu ngan.",
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
        text("Day la loi chao cot loi cua unit.", "This is the core greeting for the unit."),
      ),
      wmImage(
        "l1-jeo",
        humbleIVisual,
        lookups.visualVocabPool,
        "textbook",
        text("`저` la cach xung ho lich su.", "`저` is the polite way to say I/me."),
      ),
      wmImage(
        "l1-student",
        studentVisual,
        lookups.visualVocabPool,
        "workbook",
        text(
          "Danh tu nay lap lai nhieu lan trong workbook.",
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
          "Nghe cum chao khi gap mat de quen am.",
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
          "Doi loi chao sang y nghia ngay sau khi nhan dien.",
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
          "Ghep loi chao voi phan gioi thieu ten.",
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
          "Sap xep lai cau gioi thieu dau tien.",
          "Arrange the first introduction sentence.",
        ),
      ),
      speak(
        "l1-speak",
        hello.korean,
        "textbook",
        text("Ket lesson bang mot cau chao ngan.", "Close the lesson with one short greeting."),
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
    text("Lap cau voi copula", "Build with the copula"),
    text(
      "Cung co mau N + copula bang cau ve hoc sinh va nghe nghiep.",
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
          "Sau danh tu, Unit 1 dung cung mot duoi cau lich su.",
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
          "Lap lai cung pattern o che do recall.",
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
          "Dien lai dung duoi cau sau danh tu.",
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
          "Doi nghe nghiep nhung giu nguyen khung cau.",
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
          "Dich mau cau co ban nhat cua unit.",
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
          "Lap lai cau nghe nghiep cung ngu phap.",
          "Build a job sentence with the same grammar.",
        ),
      ),
      speak(
        "l2-speak-student",
        student.korean,
        "textbook",
        text(
          "Noi lai mau cau hoc sinh de tao phan xa.",
          "Say the student sentence aloud so it becomes automatic.",
        ),
        ["N + copula"],
      ),
      speak(
        "l2-speak-office",
        office.korean,
        "blended",
        text(
          "Doi danh tu nhung van giu duoi cau lich su dung.",
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
    text("Ghep lai doan hoi thoai", "Rebuild the dialogue"),
    text(
      "Nghe, ghep, va noi lai cac luot thoai chao hoi cot loi.",
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
          "Nghe cau dap truoc de bat nhip hoi thoai.",
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
          "Nho lai y nghia cua loi chao khi gap mat.",
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
        text("Ghep lai cau gioi thieu cua Jisu.", "Rebuild Jisu's introduction line."),
      ),
      dial(
        "l3-reply",
        jisuReply,
        "blended",
        text(
          "Ghep luon cau dap de tao thanh cap thoai.",
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
          "Tach nho cau gioi thieu thanh mot bai sap xep nhanh.",
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
          "Viet lai toan bo cau gioi thieu cua Jisu.",
          "Write Jisu's full introduction again.",
        ),
      ),
      speak(
        "l3-speak",
        `${jisuHello.korean} ${jisuReply.korean}`,
        "blended",
        text(
          "Ket lesson bang mot luot thoai hoan chinh.",
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
      title: text("Nghe QR ve quoc tich", "QR listening: countries and flags"),
      summary: text(
        "Tach rieng bai nghe QR thanh mot lesson nghe tap trung co co, cau dien, va cau noi lap lai.",
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
            "Nghe lai file QR cua Natasha roi dien quoc tich bang tieng Han.",
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
            "Nghe lai file QR cua Gayoung roi dien quoc tich bang tieng Han.",
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
            "Sap xep lai cau tra loi xuat hien trong file nghe QR ben trai.",
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
            "Sap xep lai cau tra loi xuat hien trong file nghe QR ben phai.",
            "Rebuild the answer line heard in the right-side QR audio.",
          ),
        ),
        speak(
          "u1-qr-left-speak",
          "저는 러시아 사람이에요.",
          "workbook",
          text(
            "Noi lai cau gioi thieu quoc tich cua Natasha.",
            "Say Natasha's nationality sentence aloud.",
          ),
          ["qr-listening"],
        ),
        speak(
          "u1-qr-right-speak",
          "저는 한국 사람이에요.",
          "workbook",
          text(
            "Noi lai cau gioi thieu quoc tich cua Gayoung.",
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
        title: text("Dung copula trong workbook", "Workbook: copula in use"),
        summary: text(
          "Chuyen tu textbook sang workbook bang cac bai match va dien khuyet co ban.",
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
        title: text("Identity drills 1", "Identity drills 1"),
        summary: text(
          "Luyen dich, nghe, va chon duoi cau lich su trong cum bai tu gioi thieu.",
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
        title: text("Identity drills 2", "Identity drills 2"),
        summary: text(
          "Tiep tuc workbook bang cau dap, sap xep, va cau gioi thieu co ten rieng.",
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
        title: text("Role and name drills", "Role and name drills"),
        summary: text(
          "Khoa lai ten, nghe nghiep, va duoi cau copula bang chuoi bai tap ngan.",
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
        title: text("Nghe va tu gioi thieu", "Listening and self-introduction"),
        summary: text(
          "Gom bai nghe workbook va bai viet tu gioi thieu truoc khi vao QR listening rieng.",
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
      title: text("Section 1: Greetings", "Section 1: greetings"),
      summary: text(
        "Nen tang chao hoi, dai tu xung ho, va cau copula co ban.",
        "Greeting foundations, polite self-reference, and the core copula frame.",
      ),
      lessonIds: ["unit-1-lesson-1", "unit-1-lesson-2"],
    },
    {
      sectionId: "unit-1-section-2",
      title: text("Section 2: Dialogue", "Section 2: dialogue and use"),
      summary: text(
        "Ghep lai hoi thoai va dua ngu phap vao bai workbook dau tien.",
        "Rebuild the dialogue and move the grammar into the first workbook lesson.",
      ),
      lessonIds: ["unit-1-lesson-3", "unit-1-lesson-4"],
    },
    {
      sectionId: "unit-1-section-3",
      title: text("Section 3: Workbook Core", "Section 3: workbook core"),
      summary: text(
        "Ba lesson lien tiep de day du cac bai identity va role drills cua workbook.",
        "Three straight lessons to keep the identity and role drills fully covered.",
      ),
      lessonIds: ["unit-1-lesson-5", "unit-1-lesson-6", "unit-1-lesson-7"],
    },
    {
      sectionId: "unit-1-section-4",
      title: text("Section 4: Listening", "Section 4: listening and QR"),
      summary: text(
        "Tach nghe workbook va bai nghe QR thanh cum listening rieng.",
        "Split workbook listening and QR listening into their own focused block.",
      ),
      lessonIds: ["unit-1-lesson-8", "unit-1-lesson-9"],
    },
    {
      sectionId: "unit-1-section-5",
      title: text("Section 5: Review", "Section 5: review and output"),
      summary: text(
        "On tap cuoi unit bang bai tong hop va bai san sinh co khung.",
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
    text("On workbook 1", "Review checkpoint 1"),
    text(
      "On lai cac loi hay gap truoc khi vao phan tong hop cuoi.",
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
          "Keo lai cau gioi thieu goc de noi sang phan tong hop.",
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
    text("On tap tong hop", "Cumulative review"),
    text(
      "Khoa lai Unit 1 bang nhieu cau phai tu go va tu noi hon.",
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
          "Noi tron loi chao va ten voi do tu dong cao hon.",
          "Say the full greeting and name with more automaticity.",
        ),
        ["N + 저는"],
      ),
      speak(
        "review-b-extra-2",
        `${hello.korean} ${student.korean} ${nice.korean}`,
        "blended",
        text(
          "Ket unit bang mot mini self-introduction day du hon.",
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
    text("Mo bai di duong", "Open the directions topic"),
    text(
      "Lam quen voi phuong tien giao thong cot loi va cau hoi trung tam cua bai 16.",
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
        text("Bat dau bang phuong tien quen thuoc nhat.", "Start with the most familiar vehicle."),
      ),
      wmImage(
        "u16-l1-subway",
        subwayVisual,
        lookups.visualVocabPool,
        "textbook",
        text("Tau dien ngam se lap lai nhieu trong phan hoi duong.", "The subway repeats often in directions."),
      ),
      wmImage(
        "u16-l1-station",
        stationVisual,
        lookups.visualVocabPool,
        "workbook",
        text("Danh tu dia diem nay la moc neo cua unit.", "This place noun anchors the whole unit."),
      ),
      wmImage(
        "u16-l1-bus-stop",
        busStopVisual,
        lookups.visualVocabPool,
        "workbook",
        text("Nho tu nay de doc duoc huong dan di xe buyt.", "Know this word to follow bus directions."),
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
          "Hieu cau hoi duong di truoc khi bat dau ghep lo trinh.",
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
          "Dien dia diem len xe buyt vao cau huong dan.",
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
          "Sap xep lai cau hoi duong di trung tam cua bai.",
          "Rebuild the central directions question of the unit.",
        ),
      ),
      speak(
        "u16-l1-speak-title",
        titleQuestion.korean,
        "textbook",
        text(
          "Ket lesson bang cau hoi duong di cot loi.",
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
    text("Tap trung 에서, 까지", "Focus on 에서, 까지"),
    text(
      "Khoa mau chi diem bat dau va diem ket thuc, dong thoi giu duoc cau hoi thoi gian di lai.",
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
          "Bat dau bang cau hoi thoi gian di lai quen thuoc.",
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
          "Doi y nghia sang cau tra loi ngan va tu nhien.",
          "Convert the meaning into a short natural answer.",
        ),
      ),
      gram(
        "u16-l2-from",
        "도서관___ 식당까지 버스를 타고 가요.",
        "에서",
        "workbook",
        text(
          "Chon tro tu chi diem bat dau cua lo trinh.",
          "Choose the particle that marks the starting point of the route.",
        ),
        ["에서, 까지"],
        ["에서", "까지"],
        text("tu thu vien den nha hang", "from the library to the restaurant"),
      ),
      gram(
        "u16-l2-to",
        "도서관에서 식당___ 버스를 타고 가요.",
        "까지",
        "workbook",
        text(
          "Chon tro tu chi diem ket thuc cua lo trinh.",
          "Choose the particle that marks the destination.",
        ),
        ["에서, 까지"],
        ["에서", "까지"],
        text("den nha hang", "to the restaurant"),
      ),
      fill(
        "u16-l2-subway-from",
        "지하철역___ 여행사까지 걸어가요.",
        ["에서"],
        "workbook",
        ["에서, 까지"],
        text(
          "Dien tro tu cho phan diem xuat phat.",
          "Fill in the particle for the departure point.",
        ),
        text("tu ga tau dien ngam", "from the subway station"),
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
          "Dien tro tu cho diem den cua cau.",
          "Fill in the particle for the destination.",
        ),
        text("den cong ty du lich", "to the travel agency"),
        {
          choices: ["에서", "까지"],
        },
      ),
      arr(
        "u16-l2-arrange-route",
        text(
          "Tu thu vien den nha hang di xe buyt.",
          "Go by bus from the library to the restaurant.",
        ),
        ["도서관에서", "식당까지", "버스를", "타고", "가요"],
        ["가요", "타고", "버스를", "식당까지", "도서관에서"],
        "workbook",
        ["에서, 까지"],
        text(
          "Sap xep lai mot cau lo trinh day du voi ca diem di va diem den.",
          "Rebuild a full route sentence with both start and end points.",
        ),
      ),
      speak(
        "u16-l2-speak-route-question",
        homeSchool.korean,
        "textbook",
        text(
          "Noi tron cau hoi thoi gian de tao phan xa nhanh.",
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
    text("Hoi duong va huong dan", "Ask directions and give instructions"),
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
          "Hieu dung cau chi duong lich su truoc khi tu ghep lai.",
          "Understand the polite direction first before rebuilding it.",
        ),
      ),
      dial(
        "u16-l3-title-question",
        titleQuestion,
        "textbook",
        text(
          "Ghep lai cau hoi duong di mo dau cuoc hoi thoai.",
          "Rebuild the question that opens the directions dialogue.",
        ),
      ),
      dial(
        "u16-l3-instruction",
        instruction,
        "textbook",
        text(
          "Ghep lai cau len xe buyt co menh lenh lich su.",
          "Rebuild the polite instruction for taking the bus.",
        ),
      ),
      dial(
        "u16-l3-route",
        route,
        "textbook",
        text(
          "Ghep lai cau noi xe buyt se di den dau.",
          "Rebuild the line that states where the bus goes.",
        ),
      ),
      dial(
        "u16-l3-bank-paper",
        bankPaper,
        "blended",
        text(
          "Ghep lai chuoi huong dan ngan trong ngan hang.",
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
          "Dien menh lenh lich su cho buoc dau tien trong cong viec nau an.",
          "Fill the polite command for the first step in cooking.",
        ),
        text("hay rua rau truoc", "wash the vegetables first"),
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
          "Dien loi khuyen lich su cho nguoi hoc tieng Han.",
          "Fill the polite suggestion for someone studying Korean.",
        ),
        text("hay nghe nhieu bai hat Han Quoc", "listen to a lot of Korean songs"),
        {
          choices: ["들으십시오", "씻으십시오", "오십시오"],
        },
      ),
      speak(
        "u16-l3-speak-finish",
        bankFinish.korean,
        "textbook",
        text(
          "Ket lesson bang mot cau ket thuc lich su va tu nhien.",
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
      title: text("QR nghe: Seoul Station", "QR listening: Seoul Station route"),
      summary: text(
        "Tach QR nghe ve tinh huong giao thong va duong den Seoul Station thanh mot lesson nghe rieng.",
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
            "Nghe lai audio QR ve giao thong va dien cum ket thuc cau.",
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
            "Dien so xe buyt duoc nghe trong hoi thoai QR den Seoul Station.",
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
            "Sap xep lai cau hoi lo trinh xuat hien trong doan QR.",
            "Rebuild the route question that appears in the QR dialogue.",
          ),
        ),
        speak(
          "u16-qr-bus-speak",
          "저기 정류장에서 100번 버스를 타십시오.",
          "workbook",
          text(
            "Noi lai cau chi duong lich su sau khi nghe audio QR.",
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
            "Dien cum mo ta khoang cach trong cau tra loi cua QR audio.",
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
      title: text("QR nghe: Airport and follow-up", "QR listening: airport and follow-up"),
      summary: text(
        "Tiep tuc section nghe bang diem den cong san bay, loi khuyen di chuyen, va cau tra loi ve khoang cach.",
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
            "Nghe lai audio QR ve diem den va dien noi muon den.",
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
            "Dien so xe buyt duoc goi y trong audio QR di san bay.",
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
            "Noi lai loi khuyen di san bay de giu section nghe van co production.",
            "Say the airport bus advice aloud so the listening section still includes production.",
          ),
          ["qr-listening", "destination"],
        ),
        arr(
          "u16-qr-route-finish-arrange",
          text("Xe buyt đó đi đến ga Seoul.", "That bus goes to Seoul Station."),
          ["그", "버스가", "서울역까지", "갑니다."],
          ["갑니다.", "서울역까지", "버스가", "그"],
          "workbook",
          ["qr-listening", "directions"],
          text(
            "Sap xep lai cau ket luan cua doan QR Seoul Station.",
            "Rebuild the closing route line from the Seoul Station QR dialogue.",
          ),
        ),
        speak(
          "u16-qr-distance-speak",
          "아니요. 멀지 않아요.",
          "workbook",
          text(
            "Ket lesson bang cau tra loi ngan ve khoang cach.",
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
        title: text("Transport basics", "Transport basics in workbook"),
        summary: text(
          "Bat dau cum workbook bang tu vung phuong tien va cach su dung noi di chuyen.",
          "Open the workbook block with transport vocabulary and basic usage phrases.",
        ),
        focusConcepts: ["transport", "bus", "train", "subway"],
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
        title: text("Route setup", "Route setup drills"),
        summary: text(
          "Tiep tuc bang dia diem len xuong, chuyen tuong lai, va di bo trong workbook.",
          "Continue with stations, bus stops, transfer language, and walking routes in the workbook.",
        ),
        focusConcepts: ["station", "bus-stop", "transfer", "movement"],
        exerciseIds: [
          "wb16-match-airplane",
          "wb16-match-station",
          "wb16-match-bus-stop",
          "wb16-future-transfer",
          "wb16-walk-school",
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
        title: text("From-to drills 1", "From-to drills 1"),
        summary: text(
          "Gom nam bai tuyen duong de giu moi lesson trong section nay o muc 8-10 task.",
          "Group five route exercises so this section stays within the 8-10 task window.",
        ),
        focusConcepts: ["from-to", "library", "subway", "agency"],
        exerciseIds: [
          "wb16-bike-ride",
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
        title: text("From-to drills 2", "From-to drills 2 and commands"),
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
      title: text("Section 1: Basics", "Section 1: transport basics"),
      summary: text(
        "Tu vung giao thong va mau ngu phap from-to cot loi cua unit.",
        "Transport vocabulary and the core from-to grammar of the unit.",
      ),
      lessonIds: ["unit-16-lesson-1", "unit-16-lesson-2"],
    },
    {
      sectionId: "unit-16-section-2",
      title: text("Section 2: Dialogue", "Section 2: dialogue and command"),
      summary: text(
        "Hoi duong, nghe chi duong, va dua phan workbook phuong tien vao main path.",
        "Ask for directions, listen to instructions, and fold the first transport workbook lesson into the path.",
      ),
      lessonIds: ["unit-16-lesson-3", "unit-16-lesson-4"],
    },
    {
      sectionId: "unit-16-section-3",
      title: text("Section 3: Route Drills", "Section 3: route drills"),
      summary: text(
        "Ba lesson workbook lien tiep de phu het bai route drill cua sach bai tap.",
        "Three workbook lessons in a row to keep the full route drills from the workbook.",
      ),
      lessonIds: ["unit-16-lesson-5", "unit-16-lesson-6", "unit-16-lesson-7"],
    },
    {
      sectionId: "unit-16-section-4",
      title: text("Section 4: QR Listening", "Section 4: QR listening"),
      summary: text(
        "Don toan bo bai nghe QR vao mot block rieng de nghe, dien, sap xep, va lap lai.",
        "Move every QR listening exercise into its own block for listening, fill, ordering, and speaking follow-up.",
      ),
      lessonIds: ["unit-16-lesson-8", "unit-16-lesson-9"],
    },
    {
      sectionId: "unit-16-section-5",
      title: text("Section 5: Review", "Section 5: reading and production"),
      summary: text(
        "Ket unit bang doc hieu va san sinh, khong tron QR vao phan review cuoi.",
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
    text("Mo bai tiec tan gia", "Open the housewarming topic"),
    text(
      "Lam quen voi tu vung cot loi, loi nho giup do, va cau hoi mo bai cua bai 17.",
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
        text("Day la danh tu trung tam cua ca bai 17.", "This is the central noun of Unit 17."),
      ),
      wmImage(
        "u17-l1-invitation-card",
        invitationCardVisual,
        lookups.visualVocabPool,
        "textbook",
        text(
          "Vat dung nay xuat hien ngay tu phan mo bai workbook.",
          "This item appears immediately in the workbook warm-up.",
        ),
      ),
      wmImage(
        "u17-l1-prepare",
        prepareVisual,
        lookups.visualVocabPool,
        "workbook",
        text(
          "Dong tu nay noi voi viec chuan bi do an va tiec.",
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
          "Hieu dung cau nho giup do truoc khi tu noi lai.",
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
          "Doi tu y nghia sang cau de nghi giup do lich su.",
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
          "Dien dung vat dung duoc dung de moi ban be.",
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
          "Sap xep lai cau nho giup do de quen trat tu.",
          "Rebuild the help-request sentence to lock in its word order.",
        ),
      ),
      speak(
        "u17-l1-speak-title",
        titleQuestion.korean,
        "textbook",
        text(
          "Ket lesson bang cau hoi cot loi cua bai 17.",
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
    text("Tap trung -아/어야 되다", "Focus on -아/어야 되다"),
    text(
      "Khoa mau nghia vu bang dang bien doi dong tu va cac cau can phai lam.",
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
          "Bat dau bang dang bien doi cot loi cua mau nghia vu.",
          "Start with the core conjugation pattern for obligation.",
        ),
        ["-아/어야 되다"],
        ["먹어야 되다", "먹고요", "먹어요"],
        text("phai an", "have to eat"),
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
        text("phai hoc tieng Han", "have to study Korean"),
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
        text("phai gap ban", "have to meet a friend"),
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
          "Noi viec bat buoc phai di den mot noi nao do.",
          "State that you must go somewhere.",
        ),
        text("phai den benh vien", "have to go to the hospital"),
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
          "Dich cau nghia vu goc cua bai 17 sang tieng Han.",
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
          "Sap xep lai cau can phai mang theo do dung.",
          "Rebuild the sentence about something you have to bring.",
        ),
      ),
      speak(
        "u17-l2-speak-title",
        mustBuy.korean,
        "textbook",
        text(
          "Lap lai cau hoi phai lam gi de tao phan xa.",
          "Say the core must-do question aloud to build reflex.",
        ),
        ["-아/어야 되다"],
      ),
      speak(
        "u17-l2-speak-swimcap",
        swimCap.korean,
        "blended",
        text(
          "Ket lesson bang mot cau nghia vu dai hon.",
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
    text("Ghep hoi thoai va -고요", "Rebuild dialogue and -고요"),
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
          "Hieu cau hoi ve tiec tan gia truoc khi ghep lai phan tra loi.",
          "Understand the housewarming question before rebuilding the answer.",
        ),
      ),
      dial(
        "u17-l3-activities",
        activities,
        "textbook",
        text(
          "Ghep lai luot thoai ve cac hoat dong trong tiec tan gia.",
          "Rebuild the line about what people do at the housewarming.",
        ),
      ),
      dial(
        "u17-l3-invite",
        invite,
        "textbook",
        text(
          "Ghep lai cau moi den tiec tan gia vao cuoi tuan.",
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
        text("do an cung ngon", "the food is tasty too"),
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
        text("cung co the ket ban", "you can make friends too"),
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
          "Sap xep lai cau noi hai hoat dong lien tiep.",
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
      title: text("QR nghe: time and meetup", "QR listening: time and meetup"),
      summary: text(
        "Tach doan nghe QR ra thanh lesson rieng de khoa gio bat dau va cau hen gap.",
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
            "Nghe lai doan QR va dien gio dien ra tiec tan gia.",
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
            "Noi lai cau tra loi ve gio bat dau cua tiec tan gia.",
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
            "Sap xep lai cau hoi gio giac xuat hien trong audio QR.",
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
            "Dien dong tu cuoi cau hen gap trong doan QR.",
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
            "Sap xep lai cau ket thuc cua doan hoi thoai QR.",
            "Rebuild the closing line of the QR dialogue.",
          ),
        ),
        speak(
          "u17-qr-meetup-speak",
          "그럼 샤오위 씨 집에서 만나요.",
          "workbook",
          text(
            "Ket lesson bang cau hen gap tu nhien trong doan QR.",
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
      title: text("QR nghe: gifts and response", "QR listening: gifts and response"),
      summary: text(
        "Tiep tuc QR section bang phan mua qua mang den va cau hoi phan hoi lich su.",
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
            "Dien mon qua xuat hien dau tien trong cau tra loi cua QR.",
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
            "Dien cum phan hoi lich su de de nghi mua mang den.",
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
            "Noi lai cau de nghi giup do trong audio QR.",
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
            "Sap xep lai cau noi ve nhung mon qua nen mua dem theo.",
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
            "Viet lai cau hoi xuat hien o giua doan hoi thoai QR.",
            "Write the question that appears in the middle of the QR dialogue.",
          ),
        ),
        speak(
          "u17-qr-buy-question-speak",
          "집들이에 뭘 사 가야 돼요?",
          "workbook",
          text(
            "Ket lesson bang cau hoi hoi y kien ve qua mang den.",
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
        title: text("Grammar forms in workbook", "Workbook grammar forms"),
        summary: text(
          "Day nhanh qua workbook form-change truoc khi vao cum bai tap dai hon.",
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
        title: text("Picture vocab drills", "Picture vocab drills"),
        summary: text(
          "Giu du phan tu vung hinh anh cua workbook thay vi cat bot.",
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
        title: text("Shopping dialogue drills", "Shopping dialogue drills"),
        summary: text(
          "Gom du chat, hoi, va cau de nghi giup do trong workbook vao cung mot lesson.",
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
        title: text("Must-do drills", "Must-do drills"),
        summary: text(
          "Giu tron cum bai phai lam cua workbook truoc khi sang section nghe QR.",
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
      title: text("Section 1: Housewarming", "Section 1: housewarming basics"),
      summary: text(
        "Mo bai bang tu vung tiec tan gia va mau cau nghia vu co ban.",
        "Open with housewarming vocabulary and the first obligation patterns.",
      ),
      lessonIds: ["unit-17-lesson-1", "unit-17-lesson-2"],
    },
    {
      sectionId: "unit-17-section-2",
      title: text("Section 2: Dialogue", "Section 2: dialogue and forms"),
      summary: text(
        "Ghep hoi thoai, -고요, va day tiep bang workbook form-change.",
        "Rebuild the dialogue, reinforce -고요, and extend it with workbook form changes.",
      ),
      lessonIds: ["unit-17-lesson-3", "unit-17-lesson-4"],
    },
    {
      sectionId: "unit-17-section-3",
      title: text("Section 3: Workbook Core", "Section 3: workbook core"),
      summary: text(
        "Ba lesson de giu tron picture vocab, shopping chat, va must-do drills cua workbook.",
        "Three lessons to preserve the picture vocab, shopping chat, and must-do drills from the workbook.",
      ),
      lessonIds: ["unit-17-lesson-5", "unit-17-lesson-6", "unit-17-lesson-7"],
    },
    {
      sectionId: "unit-17-section-4",
      title: text("Section 4: QR Listening", "Section 4: QR listening"),
      summary: text(
        "Don toan bo bai nghe QR ve gio giac va qua mang den vao mot block nghe rieng.",
        "Move the full QR audio about time and gifts into its own listening block.",
      ),
      lessonIds: ["unit-17-lesson-8", "unit-17-lesson-9"],
    },
    {
      sectionId: "unit-17-section-5",
      title: text("Section 5: Email", "Section 5: email and production"),
      summary: text(
        "Ket unit bang email va phan san sinh, khong tron QR vao section cuoi.",
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
    text("On tap email va nghe", "Email and listening review"),
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
    text("Noi va viet co khung", "Scaffolded speaking and writing"),
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
        title: text("Email review", "Email review"),
        summary: text(
          "Khoa phan email cua workbook thanh mot lesson rieng khong tron QR listening.",
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
        title: text("Output review", "Production review"),
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
      "Bat dau bang textbook input, day nang workbook practice, va giu listening hoat dong xuyen suot unit.",
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
    text("On nghe va chi duong", "Listening and route review"),
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
    text("On doc va san sinh", "Reading and production review"),
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
        title: text("Reading review", "Reading review"),
        summary: text(
          "Don phan doc hieu du lich vao review rieng, khong tron lai QR listening.",
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
        title: text("Production review", "Production review"),
        summary: text(
          "Ket unit bang advice va san sinh, dong thoi giu lai mot command workbook con thieu.",
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
