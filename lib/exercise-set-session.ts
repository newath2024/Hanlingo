import type { ExerciseSetLesson, UnitExercise } from "@/types/exercise-set";
import type {
  ArrangeSessionItem,
  ListenRepeatSessionItem,
  PairMatchSessionItem,
  SelectSessionItem,
  SessionItem,
  TextInputSessionItem,
} from "@/types/session";

type ExerciseSessionItemBase = {
  id: string;
  sourceId: string;
  isRetry: boolean;
  retryable: boolean;
  prompt: {
    en: string;
    vi: string;
  };
  explanation: {
    en: string;
    vi: string;
  };
  stage: string;
  curriculumSource: string;
  grammarTags: string[];
  srWeight: number;
  errorPatternKey: string;
  weakItemLabel: string;
  correctAnswer: string;
  tracksServerState: boolean;
};

function toLocalizedText(value: string) {
  return {
    en: value,
    vi: value,
  };
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function deterministicShuffle(values: string[], seed: string) {
  return [...values]
    .map((value, index) => ({
      value,
      index,
      score: hashString(`${seed}:${value}:${index}`),
    }))
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map((entry) => entry.value);
}

function formatPairAnswer(answer: Array<[string, string]>) {
  return answer.map(([left, right]) => `${left} = ${right}`).join("; ");
}

function getExerciseSource(exerciseId: string) {
  return exerciseId.includes("_wb_") ? "workbook" : "textbook";
}

function createBaseItem(
  exercise: UnitExercise,
  stage: string,
  explanation: string,
): ExerciseSessionItemBase {
  return {
    id: exercise.id,
    sourceId: exercise.id,
    isRetry: false,
    retryable: true,
    prompt: toLocalizedText(exercise.prompt),
    explanation: toLocalizedText(explanation),
    stage,
    curriculumSource: getExerciseSource(exercise.id),
    grammarTags: exercise.focus,
    srWeight: stage === "production" ? 2.1 : stage === "construction" ? 1.7 : 1.2,
    errorPatternKey: `${exercise.id}.${exercise.type}`,
    weakItemLabel: exercise.prompt,
    correctAnswer: "",
    tracksServerState: false,
  };
}

function buildWordMatchItem(exercise: Extract<UnitExercise, { type: "word_match" }>): PairMatchSessionItem {
  const base = createBaseItem(
    exercise,
    "recognition",
    "Match each Korean item with the correct meaning.",
  );

  return {
    ...base,
    type: "word_match",
    matchMode: "pairs",
    pairs: exercise.pairs,
    rightOptions: deterministicShuffle(
      exercise.pairs.map((pair) => pair.right),
      `${exercise.id}:rights`,
    ),
    answer: exercise.answer,
    correctAnswer: formatPairAnswer(exercise.answer),
  };
}

function buildFillBlankItem(exercise: Extract<UnitExercise, { type: "fill_blank" }>): TextInputSessionItem {
  const base = createBaseItem(exercise, "construction", exercise.explanation);

  return {
    ...base,
    type: "fill_blank",
    koreanText: exercise.question,
    acceptedAnswers: exercise.answer,
    choices: exercise.choices,
    placeholder: toLocalizedText("Choose the missing answer"),
    clue: undefined,
    correctAnswer: exercise.answer[0] ?? "",
  };
}

function buildSentenceExerciseItem(
  exercise: Extract<UnitExercise, { type: "sentence_build" | "reorder_sentence" }>,
): ArrangeSessionItem {
  const base = createBaseItem(
    exercise,
    "construction",
    exercise.type === "sentence_build"
      ? "Use all correct chunks and ignore the distractors."
      : "Rebuild the sentence in natural Korean order.",
  );

  if (exercise.type === "sentence_build") {
    return {
      ...base,
      type: "sentence_build",
      wordBank: deterministicShuffle(
        [...exercise.tokens, ...exercise.distractors],
        `${exercise.id}:word-bank`,
      ),
      answer: exercise.tokens,
      meaning: toLocalizedText(exercise.target_meaning),
      targetMeaning: exercise.target_meaning,
      correctAnswer: exercise.answer,
    };
  }

  return {
    ...base,
    type: "reorder_sentence",
    wordBank: exercise.scrambled_tokens,
    answer: exercise.answer_tokens,
    correctAnswer: exercise.answer,
  };
}

function buildSelectItem(
  exercise: Extract<UnitExercise, { type: "translation_select" | "dialogue_response" }>,
): SelectSessionItem {
  const base = createBaseItem(
    exercise,
    "recall",
    exercise.type === "dialogue_response"
      ? "Pick the response that makes the dialogue flow naturally."
      : "Choose the meaning that matches the Korean line.",
  );

  if (exercise.type === "dialogue_response") {
    return {
      ...base,
      type: "dialogue_response",
      question: exercise.context[0]?.text ?? "",
      context: exercise.context,
      choices: exercise.choices,
      answer: exercise.answer,
      correctAnswer: exercise.answer,
      weakItemLabel: exercise.context[0]?.text ?? exercise.prompt,
    };
  }

  return {
    ...base,
    type: "translation_select",
    question: exercise.question,
    choices: exercise.choices,
    answer: exercise.answer,
    correctAnswer: exercise.answer,
    weakItemLabel: exercise.question,
  };
}

function buildListenRepeatItem(
  exercise: Extract<UnitExercise, { type: "listen_repeat" }>,
): ListenRepeatSessionItem {
  const base = createBaseItem(
    exercise,
    "production",
    "Repeat enough chunks clearly to pass the prompt.",
  );

  return {
    ...base,
    type: "listen_repeat",
    text: exercise.text,
    ttsText: exercise.tts_text,
    expectedChunks: exercise.expected_chunks,
    passRule: exercise.pass_rule,
    correctAnswer: exercise.text,
    weakItemLabel: exercise.text,
  };
}

function buildSessionItem(exercise: UnitExercise): SessionItem {
  if (exercise.type === "word_match") {
    return buildWordMatchItem(exercise);
  }

  if (exercise.type === "fill_blank") {
    return buildFillBlankItem(exercise);
  }

  if (exercise.type === "sentence_build" || exercise.type === "reorder_sentence") {
    return buildSentenceExerciseItem(exercise);
  }

  if (exercise.type === "translation_select" || exercise.type === "dialogue_response") {
    return buildSelectItem(exercise);
  }

  return buildListenRepeatItem(exercise);
}

export function createExerciseSetSession(lesson: ExerciseSetLesson) {
  return lesson.exercises.map((exercise) => buildSessionItem(exercise));
}
