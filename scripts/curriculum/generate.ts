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
type WorkbookBundle = { exercise: SourceWorkbookExercise; tasks: RuntimeTask[] };
type Lookups = ReturnType<typeof buildLookups>;
type FillBlankSlotKind = "noun_slot" | "tail_expression" | "lead_chunk" | "generic";

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

const choice = (id: string, value: LocalizedText, imageUrl?: string): LocalizedChoice => ({
  id,
  text: value,
  ...(imageUrl ? { imageUrl } : {}),
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

  const registerMeaning = (meaning: LocalizedText) => {
    byMeaning.set(normalizeKey(meaning.vi), meaning);
    byMeaning.set(normalizeKey(meaning.en), meaning);
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
  };

  source.textbook.vocab.forEach((item) => register(item.korean, item.translations));
  source.textbook.dialogue.forEach((item) => register(item.korean, item.translations));
  source.textbook.examples.forEach((item) => register(item.korean, item.translations));
  source.workbook.exercises.forEach((item) => {
    if (item.localizedText) {
      registerMeaning(item.localizedText);
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

  return {
    byKorean: (value: string) => byKorean.get(value) ?? text(value),
    byMeaning: (value: string) => byMeaning.get(normalizeKey(value)) ?? text(value),
    choicePool,
    fillChoicePool: Array.from(fillChoicePool.values()),
  };
}

function buildChoices(correct: LocalizedText, pool: LocalizedText[], prefix: string) {
  const items = [choice(`${prefix}-correct`, correct)];
  const used = new Set([meaningKey(correct)]);

  for (const entry of pool) {
    if (items.length >= 4) {
      break;
    }

    const key = meaningKey(entry);

    if (used.has(key)) {
      continue;
    }

    used.add(key);
    items.push(choice(`${prefix}-d${items.length}`, entry));
  }

  return items;
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

  if (stableTasks.length < 8 || stableTasks.length > 12) {
    throw new Error(`${lessonId} must contain 8-12 tasks. Received ${stableTasks.length}.`);
  }

  return {
    lessonId,
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

function introLesson(source: SourceUnit, lookups: Lookups, totalLessons: number) {
  const hello = pickFrom(source.textbook.vocab, "v-hello");
  const humbleI = pickFrom(source.textbook.vocab, "v-i-humble");
  const student = pickFrom(source.textbook.vocab, "v-student");
  const nice = pickFrom(source.textbook.vocab, "v-nice-to-meet");
  const minsu = pickFrom(source.textbook.dialogue, "d-minsu-hello");

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
      wm(
        "l1-hello",
        hello.korean,
        hello.translations,
        lookups.choicePool,
        "textbook",
        text("Day la loi chao cot loi cua unit.", "This is the core greeting for the unit."),
      ),
      wm(
        "l1-jeo",
        humbleI.korean,
        humbleI.translations,
        lookups.choicePool,
        "textbook",
        text("`저` la cach xung ho lich su.", "`저` is the polite way to say I/me."),
      ),
      wm(
        "l1-student",
        student.korean,
        student.translations,
        lookups.choicePool,
        "workbook",
        text(
          "Danh tu nay lap lai nhieu lan trong workbook.",
          "This noun repeats throughout the workbook.",
        ),
      ),
      ls(
        "l1-nice",
        nice.korean,
        nice.translations,
        lookups.choicePool,
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

function workbookLessonTarget(exerciseCount: number) {
  if (exerciseCount < 18) {
    throw new Error(
      `A runtime unit needs at least 18 normalized workbook exercises before compile. Found ${exerciseCount}.`,
    );
  }

  if (exerciseCount <= 24) {
    return 4;
  }

  if (exerciseCount <= 36) {
    return 6;
  }

  return 8;
}

function buildWorkbookBundles(
  unitId: string,
  exercises: SourceWorkbookExercise[],
  lookups: Lookups,
  audioAssetsById: Map<string, SourceAudioAsset>,
) {
  return exercises
    .map((exercise) => ({
      exercise,
      tasks: exerciseToTasks(unitId, exercise, lookups, audioAssetsById),
    }))
    .filter((bundle) => bundle.tasks.length > 0);
}

function chunkWorkbookBundles(bundles: WorkbookBundle[], desiredLessonCount: number) {
  const queue = [...bundles];
  const groups: WorkbookBundle[][] = [];

  while (queue.length > 0) {
    const remainingLessons = Math.max(1, desiredLessonCount - groups.length);
    const remainingTasks = queue.reduce((sum, bundle) => sum + bundle.tasks.length, 0);
    const targetTasks = Math.max(8, Math.min(12, Math.round(remainingTasks / remainingLessons)));
    const group: WorkbookBundle[] = [];
    let groupTaskCount = 0;

    while (queue.length > 0) {
      const next = queue[0];

      if (group.length > 0 && groupTaskCount + next.tasks.length > 12) {
        break;
      }

      group.push(queue.shift() as WorkbookBundle);
      groupTaskCount += next.tasks.length;

      const restTaskCount = queue.reduce((sum, bundle) => sum + bundle.tasks.length, 0);
      const lessonsLeftAfterThis = Math.max(0, desiredLessonCount - (groups.length + 1));

      if (
        groupTaskCount >= targetTasks &&
        (lessonsLeftAfterThis === 0 || restTaskCount >= lessonsLeftAfterThis * 8)
      ) {
        break;
      }
    }

    while (queue.length > 0 && groupTaskCount < 8) {
      const next = queue[0];

      if (group.length > 0 && groupTaskCount + next.tasks.length > 12) {
        break;
      }

      group.push(queue.shift() as WorkbookBundle);
      groupTaskCount += next.tasks.length;
    }

    groups.push(group);
  }

  return groups;
}

function workbookLessons(source: SourceUnit, groups: WorkbookBundle[][], totalLessons: number) {
  return groups.map((group, index) => {
    const exercises = group.map((bundle) => bundle.exercise);
    const tags = Array.from(new Set(exercises.flatMap((exercise) => exercise.coverageTags)));
    const focus = tags.slice(0, 4);

    return lesson(
      `unit-${source.unitId}-lesson-${index + 4}`,
      "workbook_practice",
      text(
        `Luyen workbook ${index + 1}: ${focus[0] ?? "practice"}`,
        `Workbook practice ${index + 1}: ${focus[0] ?? "practice"}`,
      ),
      text(
        "Tach workbook thanh cac node ngan de moi cum bai deu co recall va production.",
        "Split the workbook into short nodes so every cluster mixes recall and production.",
      ),
      focus,
      exercises.map((exercise) => exercise.id),
      tags,
      group.flatMap((bundle) => bundle.tasks),
      index + 4,
      totalLessons,
    );
  });
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

function introLesson17(source: SourceUnit, lookups: Lookups, totalLessons: number) {
  const housewarming = pickFrom(source.textbook.vocab, "v-housewarming");
  const invitationCard = pickFrom(source.textbook.vocab, "v-invitation-card");
  const prepare = pickFrom(source.textbook.vocab, "v-prepare");
  const helpRequest = pickFrom(source.textbook.examples, "ex-help-request");
  const helpOffer = pickFrom(source.textbook.examples, "ex-help-offer");
  const titleQuestion = pickFrom(source.textbook.examples, "ex-must-buy");

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
      wm(
        "u17-l1-housewarming",
        housewarming.korean,
        housewarming.translations,
        lookups.choicePool,
        "textbook",
        text("Day la danh tu trung tam cua ca bai 17.", "This is the central noun of Unit 17."),
      ),
      wm(
        "u17-l1-invitation-card",
        invitationCard.korean,
        invitationCard.translations,
        lookups.choicePool,
        "textbook",
        text(
          "Vat dung nay xuat hien ngay tu phan mo bai workbook.",
          "This item appears immediately in the workbook warm-up.",
        ),
      ),
      wm(
        "u17-l1-prepare",
        prepare.korean,
        prepare.translations,
        lookups.choicePool,
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
  const workbookBundles = buildWorkbookBundles(
    source.unitId,
    eligibleExercises,
    lookups,
    audioAssetsById,
  );
  const workbookGroups = chunkWorkbookBundles(
    workbookBundles,
    workbookLessonTarget(eligibleExercises.length),
  );
  const totalLessons = workbookGroups.length + 5;

  if (totalLessons < 8 || totalLessons > 16) {
    throw new Error(`Computed ${totalLessons} lessons, outside the allowed 8-16 range.`);
  }

  return {
    lookups,
    audioAssetsById,
    eligibleExercises,
    workbookGroups,
    totalLessons,
  };
}

export function buildRuntimeUnit(source: SourceUnit): RuntimeUnit {
  const { lookups, audioAssetsById, workbookGroups, totalLessons } = buildRuntimeContext(source);

  return {
    unitId: source.unitId,
    unitNumber: source.unitNumber,
    title: source.title,
    subtitle: text(
      "Bat dau bang textbook input, day nang workbook practice, va giu listening hoat dong xuyen suot unit.",
      "Start with textbook input, lean into workbook practice, and keep listening active throughout the unit.",
    ),
    reviewWords: reviewWords(source),
    lessons: [
      introLesson(source, lookups, totalLessons),
      grammarLesson(source, lookups, totalLessons),
      dialogueLesson(source, lookups, totalLessons),
      ...workbookLessons(source, workbookGroups, totalLessons),
      ...reviewLessons(source, lookups, workbookGroups.length + 4, totalLessons, audioAssetsById),
    ],
  };
}

export function buildRuntimeUnit17(source: SourceUnit): RuntimeUnit {
  const { lookups, audioAssetsById, workbookGroups, totalLessons } = buildRuntimeContext(source);

  return {
    unitId: source.unitId,
    unitNumber: source.unitNumber,
    title: source.title,
    subtitle: text(
      "Mo bai bang tu vung tan gia, di sau vao -아/어야 되다 va -고요, roi khoa lai bang email va hoi thoai co khung.",
      "Open with housewarming vocabulary, push through -아/어야 되다 and -고요, then close with scaffolded email and dialogue work.",
    ),
    reviewWords: reviewWords(source),
    lessons: [
      introLesson17(source, lookups, totalLessons),
      grammarLesson17(source, lookups, totalLessons),
      dialogueLesson17(source, lookups, totalLessons),
      ...workbookLessons(source, workbookGroups, totalLessons),
      ...reviewLessons17(source, lookups, workbookGroups.length + 4, totalLessons, audioAssetsById),
    ],
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

  let runtimeUnit = source.unitId === "17" ? buildRuntimeUnit17(source) : buildRuntimeUnit(source);
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
