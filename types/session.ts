import type {
  ArrangeSentenceTask,
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

export type SessionItemType =
  | "word_match"
  | "listen_select"
  | "translate"
  | "arrange_sentence"
  | "fill_blank"
  | "grammar_select"
  | "dialogue_reconstruct"
  | "speaking";

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
  source: string;
  grammarTags: string[];
  srWeight: number;
  errorPatternKey: string;
  weakItemLabel: SessionDisplayText;
  correctAnswer: SessionDisplayText;
  interactionMode?: InteractionMode;
  sentenceKey?: string;
};

export type LocalizedChoiceSessionItem = SessionItemBase & {
  type: "word_match" | "listen_select";
  koreanText?: string;
  choices: LocalizedChoice[];
  answer: string;
  audioText?: string;
  audioUrl?: string;
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
  type: "arrange_sentence" | "dialogue_reconstruct";
  wordBank: string[];
  answer: string[];
  meaning?: LocalizedText;
  speaker?: string;
  translation?: LocalizedText;
};

export type SpeakingSessionItem = SessionItemBase & {
  type: "speaking";
  koreanText: string;
  expectedSpeech: string;
};

export type SessionItem =
  | LocalizedChoiceSessionItem
  | GrammarChoiceSessionItem
  | TextInputSessionItem
  | ArrangeSessionItem
  | SpeakingSessionItem;

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
