export type DialogueLine = {
  speaker: string;
  text: string;
  translation: string;
};

export type VocabEntry = {
  word: string;
  meaning: string;
};

export type GrammarPoint = {
  pattern: string;
  explanation: string;
  examples: string[];
};

export type MultipleChoiceExercise = {
  type: "multiple_choice";
  question: string;
  options: string[];
  answer: string;
};

export type FillBlankExercise = {
  type: "fill_blank";
  question: string;
  answer: string;
};

export type ExerciseItem = MultipleChoiceExercise | FillBlankExercise;

export type SpeakingPrompt = {
  prompt: string;
};

export type BuildSentenceItem = {
  meaning: string;
  wordBank: string[];
  answer: string[];
};

export type LessonData = {
  unit: number;
  lesson: string;
  dialogue: DialogueLine[];
  buildSentence?: BuildSentenceItem[];
  vocab: VocabEntry[];
  grammar: GrammarPoint[];
  exercises: ExerciseItem[];
  speaking: SpeakingPrompt[];
};
