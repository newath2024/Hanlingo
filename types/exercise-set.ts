import type { LessonRole, LocalizedText } from "./curriculum";

export type ExerciseDifficulty = "easy" | "medium" | "hard";

export type WordMatchExercise = {
  type: "word_match";
  id: string;
  skill: "vocab";
  focus: string[];
  prompt: string;
  pairs: Array<{
    left: string;
    right: string;
  }>;
  answer: Array<[string, string]>;
  difficulty: ExerciseDifficulty;
};

export type FillBlankExercise = {
  type: "fill_blank";
  id: string;
  skill: "grammar";
  focus: string[];
  prompt: string;
  question: string;
  blank_count: 1;
  choices: string[];
  answer: string[];
  explanation: string;
  difficulty: ExerciseDifficulty;
};

export type SentenceBuildExercise = {
  type: "sentence_build";
  id: string;
  skill: "sentence";
  focus: string[];
  prompt: string;
  target_meaning: string;
  tokens: string[];
  distractors: string[];
  answer: string;
  difficulty: ExerciseDifficulty;
};

export type ReorderSentenceExercise = {
  type: "reorder_sentence";
  id: string;
  skill: "word_order";
  focus: string[];
  prompt: string;
  scrambled_tokens: string[];
  answer_tokens: string[];
  answer: string;
  difficulty: ExerciseDifficulty;
};

export type TranslationSelectExercise = {
  type: "translation_select";
  id: string;
  skill: "reading";
  focus: string[];
  prompt: string;
  question: string;
  choices: string[];
  answer: string;
  difficulty: ExerciseDifficulty;
};

export type DialogueResponseExercise = {
  type: "dialogue_response";
  id: string;
  skill: "conversation";
  focus: string[];
  prompt: string;
  context: Array<{
    speaker: string;
    text: string;
  }>;
  choices: string[];
  answer: string;
  difficulty: ExerciseDifficulty;
};

export type ListenRepeatExercise = {
  type: "listen_repeat";
  id: string;
  skill: "speaking";
  focus: string[];
  prompt: string;
  text: string;
  tts_text: string;
  expected_chunks: string[];
  pass_rule: {
    mode: "chunk_match";
    min_correct_chunks: number;
  };
  difficulty: ExerciseDifficulty;
};

export type UnitExercise =
  | WordMatchExercise
  | FillBlankExercise
  | SentenceBuildExercise
  | ReorderSentenceExercise
  | TranslationSelectExercise
  | DialogueResponseExercise
  | ListenRepeatExercise;

export type ExerciseStage = {
  stage_id: string;
  stage_goal: string;
  exercises: UnitExercise[];
};

export type UnitExerciseSet = {
  unit_id: string;
  unit_title: string;
  stages: ExerciseStage[];
};

export type ExerciseSetLesson = ExerciseStage & {
  lessonId: string;
  lessonRole: LessonRole;
  order: number;
  title: LocalizedText;
  summary: LocalizedText;
  focusConcepts: string[];
  coverageTags: string[];
  exerciseIds: string[];
};
