import type {
  ArrangeSentenceTask,
  ChoicePresentation,
  DialogueReconstructTask,
  FillBlankTask,
  GrammarSelectTask,
  InteractionMode,
  ListenSelectTask,
  LocalizedChoice,
  LocalizedText,
  MeaningDirection,
  SpeakingTask,
  TranslateTask,
  WordMatchTask,
} from "./curriculum";
import type { FingerprintSummary } from "./error-fingerprint";

export type SessionItemType =
  | "word_match"
  | "listen_select"
  | "translate"
  | "translation_select"
  | "arrange_sentence"
  | "sentence_build"
  | "reorder_sentence"
  | "fill_blank"
  | "grammar_select"
  | "dialogue_reconstruct"
  | "dialogue_response"
  | "speaking"
  | "listen_repeat";

export type SessionDisplayText = LocalizedText | string;

type SessionItemBase = {
  id: string;
  sourceId: string;
  type: SessionItemType;
  isRetry: boolean;
  retryable: boolean;
  prompt: LocalizedText;
  explanation: LocalizedText;
  supportText?: LocalizedText;
  stage: string;
  curriculumSource: string;
  grammarTags: string[];
  srWeight: number;
  errorPatternKey: string;
  weakItemLabel: SessionDisplayText;
  correctAnswer: SessionDisplayText;
  tracksServerState: boolean;
  interactionMode?: InteractionMode;
  sentenceKey?: string;
};

export type LocalizedChoiceSessionItem = SessionItemBase & {
  type: "word_match" | "listen_select";
  matchMode?: "choice";
  koreanText?: string;
  choices: LocalizedChoice[];
  answer: string;
  audioText?: string;
  audioUrl?: string;
  presentation?: ChoicePresentation;
  questionText?: LocalizedText;
};

export type PairMatchSessionItem = SessionItemBase & {
  type: "word_match";
  matchMode: "pairs";
  pairs: Array<{
    left: string;
    right: string;
  }>;
  rightOptions: string[];
  answer: Array<[string, string]>;
};

export type SelectSessionItem = SessionItemBase & {
  type: "translation_select" | "dialogue_response";
  question: string;
  choices: string[];
  answer: string;
  context?: Array<{
    speaker: string;
    text: string;
  }>;
};

export type GrammarChoiceSessionItem = SessionItemBase & {
  type: "grammar_select";
  koreanText: string;
  choices: string[];
  answer: string;
};

export type TextInputSessionItem = SessionItemBase & {
  type: "translate" | "fill_blank";
  koreanText?: string;
  meaning?: LocalizedText;
  acceptedAnswers?: string[];
  choices?: string[];
  placeholder?: LocalizedText;
  clue?: LocalizedText;
  direction?: MeaningDirection;
  audioText?: string;
  audioUrl?: string;
};

export type ArrangeSessionItem = SessionItemBase & {
  type:
    | "arrange_sentence"
    | "dialogue_reconstruct"
    | "sentence_build"
    | "reorder_sentence";
  wordBank: string[];
  answer: string[];
  meaning?: LocalizedText;
  speaker?: string;
  translation?: LocalizedText;
  targetMeaning?: string;
  questionText?: string;
};

export type SpeakingSessionItem = SessionItemBase & {
  type: "speaking";
  koreanText: string;
  expectedSpeech: string;
};

export type ListenRepeatSessionItem = SessionItemBase & {
  type: "listen_repeat";
  text: string;
  ttsText: string;
  expectedChunks: string[];
  passRule: {
    mode: "chunk_match";
    min_correct_chunks: number;
  };
};

export type SessionItem =
  | LocalizedChoiceSessionItem
  | PairMatchSessionItem
  | SelectSessionItem
  | GrammarChoiceSessionItem
  | TextInputSessionItem
  | ArrangeSessionItem
  | SpeakingSessionItem
  | ListenRepeatSessionItem;

export type SessionItemResultStatus =
  | "correct"
  | "incorrect"
  | "practiced"
  | "skipped";

export type SessionItemResult = {
  status: SessionItemResultStatus;
  awardedXp: number;
  shouldRetryLater: boolean;
  weakItemLabel: SessionDisplayText;
  userAnswer?: string;
  answerOptionId?: string;
  answerTokens?: string[];
  mistakeFingerprint?: FingerprintSummary;
  correctAnswer?: SessionDisplayText;
  explanation?: LocalizedText;
  detail?: string;
};

export type WeakSessionItem = {
  sourceId: string;
  type: SessionItemType;
  label: SessionDisplayText;
  reason: SessionItemResultStatus;
  errorPatternKey: string;
  interactionMode?: InteractionMode;
};

export type SupportedRuntimeTask =
  | WordMatchTask
  | ListenSelectTask
  | TranslateTask
  | ArrangeSentenceTask
  | FillBlankTask
  | GrammarSelectTask
  | DialogueReconstructTask
  | SpeakingTask;
