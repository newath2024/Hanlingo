import type {
  SourceDialogueLine,
  SourceUnit,
  SourceWorkbookExercise,
} from "@/types/curriculum";
import type {
  DialogueResponseExercise,
  ExerciseStage,
  FillBlankExercise,
  ListenRepeatExercise,
  ReorderSentenceExercise,
  SentenceBuildExercise,
  TranslationSelectExercise,
  UnitExercise,
  UnitExerciseSet,
  WordMatchExercise,
} from "@/types/exercise-set";
import { sourceUnitSchema, unitExerciseSetSchema } from "./schema";
import {
  getExerciseSetPath,
  getReviewedSourcePath,
  readJsonFile,
  writeJsonFile,
} from "./io";

type ExerciseSetOptions = {
  unitId: string;
  locale?: "en";
};

type SentenceCandidate = {
  id: string;
  korean: string;
  english: string;
  focus: string[];
  source: "dialogue" | "example" | "workbook_listening";
  speaker?: string;
  order: number;
};

type StageBuildState = {
  sentenceRefs: Set<string>;
  signatures: Set<string>;
};

type GenerationState = {
  sentenceUseCounts: Map<string, number>;
};

type BuiltExercise = {
  exercise: UnitExercise;
  sentenceRefs: string[];
};

const RECOGNITION_TYPES = new Set<UnitExercise["type"]>(["word_match", "translation_select"]);
const GUIDED_PRODUCTION_TYPES = new Set<UnitExercise["type"]>([
  "fill_blank",
  "sentence_build",
  "reorder_sentence",
  "listen_repeat",
]);

function assertSupportedOptions(options: ExerciseSetOptions) {
  if (options.locale && options.locale !== "en") {
    throw new Error("The exercise-set generator currently supports English output only.");
  }
}

function padUnitId(unitId: string) {
  return unitId.padStart(2, "0");
}

function makeStageId(unitId: string, stageNumber: number) {
  return `u${padUnitId(unitId)}_s0${stageNumber}`;
}

function makeExerciseId(
  unitId: string,
  source: "tb" | "wb",
  stageNumber: number,
  type: UnitExercise["type"],
  index: number,
) {
  return `u${padUnitId(unitId)}_s0${stageNumber}_${source}_${type}_${index}`;
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeTokenForSignature(token: string) {
  const normalized = token.replace(/[.,!?]$/g, "");

  if (normalized.endsWith("입니다")) {
    return "*입니다";
  }

  if (normalized.endsWith("예요") || normalized.endsWith("이에요")) {
    return "*이에요";
  }

  if (normalized.endsWith("습니다")) {
    return "*습니다";
  }

  if (normalized.endsWith("고요")) {
    return "*고요";
  }

  if (normalized.endsWith("돼요")) {
    return "*돼요";
  }

  return normalized;
}

function sentenceSignature(sentence: string) {
  return splitTokens(sentence).map(normalizeTokenForSignature).join(" ");
}

function splitTokens(sentence: string) {
  return normalizeText(sentence).split(/\s+/).filter(Boolean);
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  values.forEach((value) => {
    const trimmed = value.trim();
    const normalized = trimmed.replace(/[.?!]+$/g, "");

    if (!trimmed || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    result.push(trimmed);
  });

  return result;
}

function normalizeSentenceRef(value: string) {
  return normalizeText(value).replace(/_{3,}/g, "___");
}

function canUseSentenceRef(
  value: string,
  stageState: StageBuildState,
  generationState: GenerationState,
) {
  const normalized = normalizeSentenceRef(value);

  if (!normalized || stageState.sentenceRefs.has(normalized)) {
    return false;
  }

  return (generationState.sentenceUseCounts.get(normalized) ?? 0) < 2;
}

function reserveSentenceRefs(
  refs: string[],
  stageState: StageBuildState,
  generationState: GenerationState,
) {
  refs.forEach((ref) => {
    const normalized = normalizeSentenceRef(ref);

    if (!normalized) {
      return;
    }

    stageState.sentenceRefs.add(normalized);
    generationState.sentenceUseCounts.set(
      normalized,
      (generationState.sentenceUseCounts.get(normalized) ?? 0) + 1,
    );
  });
}

function createSentenceCandidates(source: SourceUnit): SentenceCandidate[] {
  const dialogueCandidates = source.textbook.dialogue.map((line, index) => ({
    id: line.id,
    korean: line.korean,
    english: line.translations.en,
    focus: ["textbook dialogue"],
    source: "dialogue" as const,
    speaker: line.speaker,
    order: index,
  }));

  const exampleCandidates = source.textbook.examples.map((example, index) => ({
    id: example.id,
    korean: example.korean,
    english: example.translations.en,
    focus: example.grammarTags.length ? example.grammarTags : ["textbook example"],
    source: "example" as const,
    order: source.textbook.dialogue.length + index,
  }));

  return [...dialogueCandidates, ...exampleCandidates];
}

function getShortSentenceCandidates(source: SourceUnit) {
  return createSentenceCandidates(source).filter((candidate) => splitTokens(candidate.korean).length <= 8);
}

function prioritizeCandidates(
  candidates: SentenceCandidate[],
  preferredSources: SentenceCandidate["source"][],
  sortMode: "source_order" | "shortest",
) {
  const sourcePriority = new Map(preferredSources.map((source, index) => [source, index]));

  return [...candidates].sort((left, right) => {
    const leftSourcePriority = sourcePriority.get(left.source) ?? preferredSources.length;
    const rightSourcePriority = sourcePriority.get(right.source) ?? preferredSources.length;

    if (leftSourcePriority !== rightSourcePriority) {
      return leftSourcePriority - rightSourcePriority;
    }

    if (sortMode === "shortest") {
      const tokenDelta = splitTokens(left.korean).length - splitTokens(right.korean).length;

      if (tokenDelta !== 0) {
        return tokenDelta;
      }
    }

    return left.order - right.order;
  });
}

function pickSentenceCandidate(
  candidates: SentenceCandidate[],
  generationState: GenerationState,
  stageState: StageBuildState,
  options: {
    preferredSources: SentenceCandidate["source"][];
    minTokens?: number;
    maxTokens?: number;
    sortMode?: "source_order" | "shortest";
  },
) {
  const ranked = prioritizeCandidates(
    candidates,
    options.preferredSources,
    options.sortMode ?? "source_order",
  );
  const fits = (candidate: SentenceCandidate) => {
    const tokens = splitTokens(candidate.korean);

    if (options.minTokens && tokens.length < options.minTokens) {
      return false;
    }

    if (options.maxTokens && tokens.length > options.maxTokens) {
      return false;
    }

    return canUseSentenceRef(candidate.korean, stageState, generationState);
  };

  const strictCandidate = ranked.find(
    (candidate) => fits(candidate) && !stageState.signatures.has(sentenceSignature(candidate.korean)),
  );

  if (strictCandidate) {
    return strictCandidate;
  }

  return ranked.find((candidate) => fits(candidate)) ?? null;
}

function collectEnglishDistractors(
  pool: SentenceCandidate[],
  correct: string,
  count = 2,
) {
  return uniqueStrings(
    pool
      .map((candidate) => candidate.english)
      .filter((value) => normalizeText(value) !== normalizeText(correct)),
  ).slice(0, count);
}

function collectKoreanDistractors(
  pool: SentenceCandidate[],
  correct: string,
  count = 2,
) {
  return uniqueStrings(
    pool
      .map((candidate) => candidate.korean)
      .filter((value) => normalizeText(value) !== normalizeText(correct)),
  ).slice(0, count);
}

function collectTokenDistractors(
  pool: SentenceCandidate[],
  answer: string,
  tokenIndex: number,
  count = 2,
) {
  return uniqueStrings(
    pool
      .flatMap((candidate) => {
        const tokens = splitTokens(candidate.korean);
        return tokens[tokenIndex] ? [tokens[tokenIndex]] : [];
      })
      .filter((token) => normalizeText(token) !== normalizeText(answer)),
  ).slice(0, count);
}

function collectSentenceTokens(
  pool: SentenceCandidate[],
  answerTokens: string[],
  count = 2,
) {
  return uniqueStrings(
    pool.flatMap((candidate) => splitTokens(candidate.korean)),
  )
    .filter((token) => !answerTokens.includes(token))
    .slice(0, count);
}

function ensureChoices(correct: string, distractors: string[], fallbackPool: string[]) {
  const choices = uniqueStrings([correct, ...distractors, ...fallbackPool]).slice(0, 3);

  if (!choices.includes(correct) || choices.length < 3) {
    throw new Error(`Unable to generate stable choices for "${correct}".`);
  }

  return choices;
}

function wordMatch(
  id: string,
  focus: string[],
  prompt: string,
  pairs: Array<{ left: string; right: string }>,
): WordMatchExercise {
  return {
    type: "word_match",
    id,
    skill: "vocab",
    focus,
    prompt,
    pairs,
    answer: pairs.map((pair) => [pair.left, pair.right]),
    difficulty: "easy",
  };
}

function fillBlank(
  id: string,
  focus: string[],
  prompt: string,
  question: string,
  choices: string[],
  answer: string,
  explanation: string,
): FillBlankExercise {
  return {
    type: "fill_blank",
    id,
    skill: "grammar",
    focus,
    prompt,
    question,
    blank_count: 1,
    choices,
    answer: [answer],
    explanation,
    difficulty: "easy",
  };
}

function sentenceBuild(
  id: string,
  focus: string[],
  prompt: string,
  targetMeaning: string,
  tokens: string[],
  distractors: string[],
): SentenceBuildExercise {
  return {
    type: "sentence_build",
    id,
    skill: "sentence",
    focus,
    prompt,
    target_meaning: targetMeaning,
    tokens,
    distractors,
    answer: tokens.join(" "),
    difficulty: "easy",
  };
}

function reorderSentence(
  id: string,
  focus: string[],
  prompt: string,
  sentence: string,
): ReorderSentenceExercise {
  const answerTokens = splitTokens(sentence);

  return {
    type: "reorder_sentence",
    id,
    skill: "word_order",
    focus,
    prompt,
    scrambled_tokens: [...answerTokens].reverse(),
    answer_tokens: answerTokens,
    answer: answerTokens.join(" "),
    difficulty: "easy",
  };
}

function translationSelect(
  id: string,
  focus: string[],
  prompt: string,
  question: string,
  choices: string[],
  answer: string,
): TranslationSelectExercise {
  return {
    type: "translation_select",
    id,
    skill: "reading",
    focus,
    prompt,
    question,
    choices,
    answer,
    difficulty: "easy",
  };
}

function dialogueResponse(
  id: string,
  focus: string[],
  prompt: string,
  context: DialogueResponseExercise["context"],
  choices: string[],
  answer: string,
): DialogueResponseExercise {
  return {
    type: "dialogue_response",
    id,
    skill: "conversation",
    focus,
    prompt,
    context,
    choices,
    answer,
    difficulty: "easy",
  };
}

function listenRepeat(
  id: string,
  focus: string[],
  prompt: string,
  sentence: string,
): ListenRepeatExercise {
  const expectedChunks = splitTokens(sentence);

  return {
    type: "listen_repeat",
    id,
    skill: "speaking",
    focus,
    prompt,
    text: sentence,
    tts_text: sentence,
    expected_chunks: expectedChunks,
    pass_rule: {
      mode: "chunk_match",
      min_correct_chunks: Math.min(2, expectedChunks.length),
    },
    difficulty: "easy",
  };
}

function addBuiltExercise(
  builtExercises: BuiltExercise[],
  stageState: StageBuildState,
  generationState: GenerationState,
  builtExercise: BuiltExercise,
) {
  builtExercises.push(builtExercise);
  reserveSentenceRefs(builtExercise.sentenceRefs, stageState, generationState);
  builtExercise.sentenceRefs.forEach((ref) => {
    stageState.signatures.add(sentenceSignature(ref));
  });
}

function createTextbookWordMatches(source: SourceUnit, unitId: string) {
  const selectedVocab = source.textbook.vocab
    .filter((entry) => Boolean(entry.korean) && Boolean(entry.translations.en))
    .slice(0, 8);

  if (selectedVocab.length < 2) {
    return [] as WordMatchExercise[];
  }

  const groupCount = selectedVocab.length >= 6 ? 2 : 1;
  const groupSize = Math.ceil(selectedVocab.length / groupCount);

  return Array.from({ length: groupCount }, (_, index) => {
    const group = selectedVocab.slice(index * groupSize, (index + 1) * groupSize);

    return wordMatch(
      makeExerciseId(unitId, "tb", 1, "word_match", index + 1),
      ["textbook vocab", "recognition"],
      "Match the Korean words to their meanings.",
      group.map((entry) => ({
        left: entry.korean,
        right: entry.translations.en,
      })),
    );
  }).filter((exercise) => exercise.pairs.length >= 2);
}

function buildRecognitionStage(
  source: SourceUnit,
  generationState: GenerationState,
): ExerciseStage {
  const stageState: StageBuildState = {
    sentenceRefs: new Set(),
    signatures: new Set(),
  };
  const builtExercises: BuiltExercise[] = [];
  const wordMatches = createTextbookWordMatches(source, source.unitId);
  const translationPool = getShortSentenceCandidates(source);

  wordMatches.forEach((exercise) => {
    addBuiltExercise(builtExercises, stageState, generationState, {
      exercise,
      sentenceRefs: [],
    });
  });

  const targetTranslationCount = Math.max(2, 4 - builtExercises.length);

  for (let index = 0; index < targetTranslationCount; index += 1) {
    const candidate = pickSentenceCandidate(translationPool, generationState, stageState, {
      preferredSources: ["dialogue", "example"],
      minTokens: 1,
      maxTokens: 8,
    });

    if (!candidate) {
      break;
    }

    const distractors = collectEnglishDistractors(translationPool, candidate.english);
    const choices = ensureChoices(candidate.english, distractors, source.textbook.vocab.map((entry) => entry.translations.en));

    addBuiltExercise(builtExercises, stageState, generationState, {
      exercise: translationSelect(
        makeExerciseId(source.unitId, "tb", 1, "translation_select", index + 1),
        candidate.focus,
        "Choose the best English meaning.",
        candidate.korean,
        choices,
        candidate.english,
      ),
      sentenceRefs: [candidate.korean],
    });
  }

  if (builtExercises.length < 3 || builtExercises.length > 5) {
    throw new Error(`Unable to build a valid recognition stage for unit ${source.unitId}.`);
  }

  return {
    stage_id: makeStageId(source.unitId, 1),
    stage_goal: `Recognize the core words and short lines for ${source.title.en}.`,
    exercises: builtExercises.map((entry) => entry.exercise),
  };
}

function buildTextbookFillBlank(
  source: SourceUnit,
  generationState: GenerationState,
  stageState: StageBuildState,
) {
  const pool = createSentenceCandidates(source);
  const candidate = pickSentenceCandidate(pool, generationState, stageState, {
    preferredSources: ["example", "dialogue"],
    minTokens: 2,
    maxTokens: 8,
  });

  if (!candidate) {
    return null;
  }

  const tokens = splitTokens(candidate.korean);
  const blankIndex = tokens.length >= 4 ? 0 : tokens.length - 1;
  const answer = tokens[blankIndex];
  const questionTokens = [...tokens];
  questionTokens[blankIndex] = "___";
  const distractors = collectTokenDistractors(pool, answer, blankIndex);
  const choices = ensureChoices(
    answer,
    distractors,
    source.textbook.vocab.map((entry) => entry.korean),
  );

  return {
    exercise: fillBlank(
      makeExerciseId(source.unitId, "tb", 2, "fill_blank", 1),
      candidate.focus,
      "Fill in the missing Korean chunk.",
      questionTokens.join(" "),
      choices,
      answer,
      "Choose the chunk that completes the sentence naturally.",
    ),
    sentenceRefs: [candidate.korean],
  } satisfies BuiltExercise;
}

function buildSentenceBuildExercise(
  source: SourceUnit,
  generationState: GenerationState,
  stageState: StageBuildState,
) {
  const pool = createSentenceCandidates(source);
  const candidate = pickSentenceCandidate(pool, generationState, stageState, {
    preferredSources: ["dialogue", "example"],
    minTokens: 2,
    maxTokens: 6,
  });

  if (!candidate) {
    return null;
  }

  const tokens = splitTokens(candidate.korean);
  const distractors = collectSentenceTokens(pool, tokens);

  return {
    exercise: sentenceBuild(
      makeExerciseId(source.unitId, "tb", 2, "sentence_build", 1),
      candidate.focus,
      "Build the Korean sentence.",
      candidate.english,
      tokens,
      distractors,
    ),
    sentenceRefs: [candidate.korean],
  } satisfies BuiltExercise;
}

function buildReorderSentenceExercise(
  source: SourceUnit,
  generationState: GenerationState,
  stageState: StageBuildState,
) {
  const pool = createSentenceCandidates(source);
  const candidate = pickSentenceCandidate(pool, generationState, stageState, {
    preferredSources: ["example", "dialogue"],
    minTokens: 2,
    maxTokens: 7,
  });

  if (!candidate) {
    return null;
  }

  return {
    exercise: reorderSentence(
      makeExerciseId(source.unitId, "tb", 2, "reorder_sentence", 1),
      candidate.focus,
      "Put the Korean sentence in the correct order.",
      candidate.korean,
    ),
    sentenceRefs: [candidate.korean],
  } satisfies BuiltExercise;
}

function buildListenRepeatExercise(
  source: SourceUnit,
  generationState: GenerationState,
  stageState: StageBuildState,
  stageNumber: number,
  sourcePrefix: "tb" | "wb",
  candidatePool?: SentenceCandidate[],
) {
  const pool = candidatePool ?? createSentenceCandidates(source);
  const candidate = pickSentenceCandidate(pool, generationState, stageState, {
    preferredSources: ["dialogue", "example", "workbook_listening"],
    minTokens: 1,
    maxTokens: 6,
    sortMode: "shortest",
  });

  if (!candidate) {
    return null;
  }

  return {
    exercise: listenRepeat(
      makeExerciseId(
        source.unitId,
        sourcePrefix,
        stageNumber,
        "listen_repeat",
        1,
      ),
      candidate.focus,
      "Listen and repeat the Korean sentence.",
      candidate.korean,
    ),
    sentenceRefs: [candidate.korean],
  } satisfies BuiltExercise;
}

function buildGuidedProductionStage(
  source: SourceUnit,
  generationState: GenerationState,
): ExerciseStage {
  const stageState: StageBuildState = {
    sentenceRefs: new Set(),
    signatures: new Set(),
  };
  const builtExercises: BuiltExercise[] = [];
  const requiredBuilders = [
    () => buildTextbookFillBlank(source, generationState, stageState),
    () => buildSentenceBuildExercise(source, generationState, stageState),
    () => buildReorderSentenceExercise(source, generationState, stageState),
    () => buildListenRepeatExercise(source, generationState, stageState, 2, "tb"),
  ];

  requiredBuilders.forEach((builder) => {
    const built = builder();

    if (built) {
      addBuiltExercise(builtExercises, stageState, generationState, built);
    }
  });

  if (builtExercises.length < 3 || builtExercises.length > 5) {
    throw new Error(`Unable to build a valid guided-production stage for unit ${source.unitId}.`);
  }

  return {
    stage_id: makeStageId(source.unitId, 2),
    stage_goal: `Build short Korean responses and patterns for ${source.title.en}.`,
    exercises: builtExercises.map((entry) => entry.exercise),
  };
}

function getWorkbookMatchingPairs(source: SourceUnit) {
  return source.workbook.exercises
    .filter(
      (exercise) =>
        exercise.exerciseType === "matching" &&
        exercise.koreanText &&
        exercise.localizedText?.en,
    )
    .slice(0, 4)
    .map((exercise) => ({
      left: exercise.koreanText as string,
      right: exercise.localizedText?.en as string,
    }));
}

function buildWorkbookWordMatch(source: SourceUnit) {
  const pairs = getWorkbookMatchingPairs(source);

  if (pairs.length < 2) {
    return null;
  }

  return {
    exercise: wordMatch(
      makeExerciseId(source.unitId, "wb", 3, "word_match", 1),
      ["workbook review", "matching"],
      "Match the workbook review items to their meanings.",
      pairs,
    ),
    sentenceRefs: [],
  } satisfies BuiltExercise;
}

function getWorkbookChoiceMetadata(exercise: SourceWorkbookExercise) {
  const rawChoices = exercise.metadata.choices;

  if (!Array.isArray(rawChoices)) {
    return [] as string[];
  }

  return rawChoices.filter((value): value is string => typeof value === "string");
}

function buildWorkbookFillBlank(source: SourceUnit) {
  const fillBlankExercises = source.workbook.exercises.filter(
    (exercise) =>
      exercise.exerciseType === "fill_blank" &&
      exercise.koreanText &&
      typeof exercise.answer === "string",
  );

  const selectedExercise =
    fillBlankExercises.find((exercise) => getWorkbookChoiceMetadata(exercise).length >= 3) ??
    fillBlankExercises[0];

  if (!selectedExercise || !selectedExercise.koreanText || typeof selectedExercise.answer !== "string") {
    return null;
  }

  const metadataChoices = getWorkbookChoiceMetadata(selectedExercise);
  const fallbackChoices = fillBlankExercises
    .map((exercise) => (typeof exercise.answer === "string" ? exercise.answer : ""))
    .filter(Boolean);
  const choices = ensureChoices(selectedExercise.answer, metadataChoices, fallbackChoices);

  return {
    exercise: fillBlank(
      makeExerciseId(source.unitId, "wb", 3, "fill_blank", 1),
      selectedExercise.coverageTags.length
        ? selectedExercise.coverageTags
        : ["workbook review"],
      selectedExercise.prompt.en,
      selectedExercise.koreanText,
      choices,
      selectedExercise.answer,
      selectedExercise.prompt.en,
    ),
    sentenceRefs: [selectedExercise.koreanText],
  } satisfies BuiltExercise;
}

function pickDialogueResponsePair(
  source: SourceUnit,
  generationState: GenerationState,
  stageState: StageBuildState,
) {
  const pairs = source.textbook.dialogue
    .map((line, index, dialogue) => {
      const nextLine = dialogue[index + 1];

      if (!nextLine) {
        return null;
      }

      return [line, nextLine] as const;
    })
    .filter((pair): pair is readonly [SourceDialogueLine, SourceDialogueLine] => Boolean(pair))
    .filter(([promptLine, answerLine]) => {
      if (!canUseSentenceRef(promptLine.korean, stageState, generationState)) {
        return false;
      }

      if (!canUseSentenceRef(answerLine.korean, stageState, generationState)) {
        return false;
      }

      return sentenceSignature(promptLine.korean) !== sentenceSignature(answerLine.korean);
    });

  return pairs[0] ?? null;
}

function buildDialogueResponseExercise(
  source: SourceUnit,
  generationState: GenerationState,
  stageState: StageBuildState,
) {
  const pair = pickDialogueResponsePair(source, generationState, stageState);

  if (!pair) {
    return null;
  }

  const [promptLine, answerLine] = pair;
  const distractorPool = source.textbook.dialogue
    .filter((line) => line.id !== answerLine.id)
    .map((line, index) => ({
      id: line.id,
      korean: line.korean,
      english: line.translations.en,
      focus: ["textbook dialogue"],
      source: "dialogue" as const,
      speaker: line.speaker,
      order: index,
    }));
  const distractors = collectKoreanDistractors(
    distractorPool,
    answerLine.korean,
  );
  const choices = ensureChoices(
    answerLine.korean,
    distractors,
    source.textbook.dialogue.map((line) => line.korean),
  );

  return {
    exercise: dialogueResponse(
      makeExerciseId(source.unitId, "tb", 3, "dialogue_response", 1),
      ["textbook dialogue", "response"],
      "Choose the best response to complete the dialogue.",
      [
        { speaker: promptLine.speaker, text: promptLine.korean },
        { speaker: answerLine.speaker, text: "__________" },
      ],
      choices,
      answerLine.korean,
    ),
    sentenceRefs: [promptLine.korean, answerLine.korean],
  } satisfies BuiltExercise;
}

function getWorkbookListeningCandidates(source: SourceUnit) {
  return source.workbook.exercises
    .filter(
      (exercise) =>
        exercise.exerciseType === "listening" &&
        exercise.koreanText &&
        splitTokens(exercise.koreanText).length <= 6,
    )
    .map((exercise, index) => ({
      id: exercise.id,
      korean: exercise.koreanText as string,
      english: exercise.localizedText?.en ?? exercise.prompt.en,
      focus: exercise.coverageTags.length ? exercise.coverageTags : ["workbook listening"],
      source: "workbook_listening" as const,
      order: index,
    }));
}

function buildMixedReviewStage(
  source: SourceUnit,
  generationState: GenerationState,
): ExerciseStage {
  const stageState: StageBuildState = {
    sentenceRefs: new Set(),
    signatures: new Set(),
  };
  const builtExercises: BuiltExercise[] = [];
  const workbookWordMatch = buildWorkbookWordMatch(source);

  if (workbookWordMatch) {
    addBuiltExercise(builtExercises, stageState, generationState, workbookWordMatch);
  }

  const workbookFillBlank = buildWorkbookFillBlank(source);

  if (workbookFillBlank) {
    addBuiltExercise(builtExercises, stageState, generationState, workbookFillBlank);
  }

  const dialogueExercise = buildDialogueResponseExercise(source, generationState, stageState);

  if (dialogueExercise) {
    addBuiltExercise(builtExercises, stageState, generationState, dialogueExercise);
  }

  const workbookListeningPool = getWorkbookListeningCandidates(source);
  const reviewListenRepeat =
    buildListenRepeatExercise(
      source,
      generationState,
      stageState,
      3,
      workbookListeningPool.length ? "wb" : "tb",
      workbookListeningPool.length ? workbookListeningPool : undefined,
    ) ??
    buildSentenceBuildExercise(source, generationState, stageState);

  if (reviewListenRepeat) {
    addBuiltExercise(builtExercises, stageState, generationState, reviewListenRepeat);
  }

  if (builtExercises.length < 3 || builtExercises.length > 5) {
    throw new Error(`Unable to build a valid mixed-review stage for unit ${source.unitId}.`);
  }

  return {
    stage_id: makeStageId(source.unitId, 3),
    stage_goal: `Review ${source.title.en} with dialogue and workbook reinforcement.`,
    exercises: builtExercises.map((entry) => entry.exercise),
  };
}

function buildStages(source: SourceUnit) {
  const generationState: GenerationState = {
    sentenceUseCounts: new Map(),
  };

  return [
    buildRecognitionStage(source, generationState),
    buildGuidedProductionStage(source, generationState),
    buildMixedReviewStage(source, generationState),
  ];
}

function getExerciseSentenceRefs(exercise: UnitExercise) {
  if (exercise.type === "word_match") {
    return [] as string[];
  }

  if (exercise.type === "fill_blank") {
    return [exercise.question];
  }

  if (exercise.type === "sentence_build" || exercise.type === "reorder_sentence") {
    return [exercise.answer];
  }

  if (exercise.type === "translation_select") {
    return [exercise.question];
  }

  if (exercise.type === "dialogue_response") {
    return [...exercise.context.map((entry) => entry.text), exercise.answer].filter(
      (value) => value !== "__________",
    );
  }

  return [exercise.text];
}

function exerciseUsesWorkbook(exercise: UnitExercise) {
  return exercise.id.includes("_wb_");
}

function validateStageIds(exerciseSet: UnitExerciseSet) {
  const expectedStageIds = [
    makeStageId(exerciseSet.unit_id, 1),
    makeStageId(exerciseSet.unit_id, 2),
    makeStageId(exerciseSet.unit_id, 3),
  ];
  const actualStageIds = exerciseSet.stages.map((stage) => stage.stage_id);

  if (actualStageIds.join("|") !== expectedStageIds.join("|")) {
    throw new Error(`Unexpected stage ids for unit ${exerciseSet.unit_id}.`);
  }
}

function validateStageTypeRules(exerciseSet: UnitExerciseSet) {
  const [stage1, stage2, stage3] = exerciseSet.stages;

  if (!stage1.exercises.every((exercise) => RECOGNITION_TYPES.has(exercise.type))) {
    throw new Error("Stage 1 must contain only recognition exercise types.");
  }

  if (!stage2.exercises.every((exercise) => GUIDED_PRODUCTION_TYPES.has(exercise.type))) {
    throw new Error("Stage 2 must contain only guided-production exercise types.");
  }

  if (stage1.exercises.some(exerciseUsesWorkbook) || stage2.exercises.some(exerciseUsesWorkbook)) {
    throw new Error("Workbook exercises must not appear before Stage 3.");
  }

  const stage3Types = new Set(stage3.exercises.map((exercise) => exercise.type));
  const hasRecognitionReview =
    stage3Types.has("word_match") || stage3Types.has("translation_select");
  const hasGuidedOrDialogueReview =
    stage3Types.has("fill_blank") ||
    stage3Types.has("sentence_build") ||
    stage3Types.has("reorder_sentence") ||
    stage3Types.has("listen_repeat") ||
    stage3Types.has("dialogue_response");

  if (!hasRecognitionReview || !hasGuidedOrDialogueReview) {
    throw new Error("Stage 3 must combine recognition review with guided or dialogue review.");
  }
}

function validateSentenceReuse(exerciseSet: UnitExerciseSet) {
  const globalCounts = new Map<string, number>();

  exerciseSet.stages.forEach((stage) => {
    const stageCounts = new Map<string, number>();

    stage.exercises.forEach((exercise) => {
      getExerciseSentenceRefs(exercise).forEach((ref) => {
        const normalized = normalizeSentenceRef(ref);

        if (!normalized) {
          return;
        }

        stageCounts.set(normalized, (stageCounts.get(normalized) ?? 0) + 1);
        globalCounts.set(normalized, (globalCounts.get(normalized) ?? 0) + 1);
      });
    });

    stageCounts.forEach((count, ref) => {
      if (count > 1) {
        throw new Error(`Sentence "${ref}" is repeated within stage ${stage.stage_id}.`);
      }
    });
  });

  globalCounts.forEach((count, ref) => {
    if (count > 2) {
      throw new Error(`Sentence "${ref}" is reused too many times across the unit.`);
    }
  });
}

function validateUniqueness(exerciseSet: UnitExerciseSet) {
  const allIds = exerciseSet.stages.flatMap((stage) => stage.exercises.map((exercise) => exercise.id));

  if (new Set(allIds).size !== allIds.length) {
    throw new Error("Exercise ids must be unique.");
  }
}

function validateStageLengths(exerciseSet: UnitExerciseSet) {
  exerciseSet.stages.forEach((stage) => {
    if (stage.exercises.length < 3 || stage.exercises.length > 5) {
      throw new Error(`Stage ${stage.stage_id} must contain between 3 and 5 exercises.`);
    }
  });
}

function buildExerciseSet(source: SourceUnit) {
  return {
    unit_id: source.unitId,
    unit_title: source.title.en,
    stages: buildStages(source),
  } satisfies UnitExerciseSet;
}

export async function generateExerciseSet(options: ExerciseSetOptions) {
  assertSupportedOptions(options);

  const reviewedSourcePath = getReviewedSourcePath(options.unitId);
  const source = sourceUnitSchema.parse(await readJsonFile<SourceUnit>(reviewedSourcePath));
  const exerciseSet = unitExerciseSetSchema.parse(buildExerciseSet(source));
  const exerciseSetPath = getExerciseSetPath(options.unitId);

  await writeJsonFile(exerciseSetPath, exerciseSet);

  return {
    exerciseSetPath,
  };
}

export async function validateExerciseSet(options: ExerciseSetOptions) {
  assertSupportedOptions(options);

  const exerciseSetPath = getExerciseSetPath(options.unitId);
  const exerciseSet = unitExerciseSetSchema.parse(
    await readJsonFile<UnitExerciseSet>(exerciseSetPath),
  );

  if (exerciseSet.unit_id !== options.unitId) {
    throw new Error(`Exercise-set artifact ${exerciseSetPath} does not match unit ${options.unitId}.`);
  }

  validateStageIds(exerciseSet);
  validateStageLengths(exerciseSet);
  validateStageTypeRules(exerciseSet);
  validateUniqueness(exerciseSet);
  validateSentenceReuse(exerciseSet);

  return {
    exerciseSetPath,
  };
}
