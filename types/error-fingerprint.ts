import type { LocalizedText } from "@/types/curriculum";
import type { SessionItem } from "@/types/session";

export type FingerprintType =
  | "WORD_CONFUSION"
  | "GRAMMAR_MISMATCH"
  | "RANDOM_GUESS"
  | "LISTENING_MISHEAR"
  | "ORDERING_BREAKDOWN";

export type FingerprintUiLabel = LocalizedText;

export type FingerprintSummary = {
  type: FingerprintType;
  confidenceScore: number;
  shortReason: string;
  uiLabel: FingerprintUiLabel;
};

export type MistakeAnalysisPayload = {
  reason: string;
  matchedRule: string;
  responseTimeMs: number;
  priorAttempts: number;
  selectedOptionText?: string;
  correctOptionText?: string;
  normalizedUserAnswer?: string;
  normalizedCorrectAnswer?: string;
  tokenOverlap?: {
    matched: string[];
    missing: string[];
    extra: string[];
    overlapRatio: number;
  };
  order?: {
    correctPositions: number;
    totalTokens: number;
    sequenceRatio: number;
  };
  lexicalSimilarity?: number;
  phoneticSimilarity?: number;
  relationHints?: string[];
};

export type MistakeAnalysisInput = {
  question: SessionItem;
  userAnswer: string;
  correctAnswer: string;
  answerOptionId?: string;
  answerTokens?: string[];
  responseTimeMs: number;
  priorAttempts: number;
};

export type MistakeAnalysisResult = {
  fingerprintType: FingerprintType;
  confidenceScore: number;
  shortReason: string;
  analysis: MistakeAnalysisPayload;
};

export type UserErrorFingerprintState = {
  id: string;
  userId: string;
  questionId: string;
  lessonId: string;
  exerciseType: string;
  fingerprintType: FingerprintType;
  confidenceScore: number;
  userAnswerRaw: string;
  correctAnswerRaw: string;
  analysisPayload: MistakeAnalysisPayload;
  responseTimeMs: number | null;
  priorAttempts: number;
  createdAt: string;
  updatedAt: string;
};

export const FINGERPRINT_UI_CONFIDENCE_THRESHOLD = 0.7;

export const FINGERPRINT_UI_LABELS: Record<FingerprintType, FingerprintUiLabel> = {
  WORD_CONFUSION: {
    en: "You mixed up vocabulary",
    vi: "Ban da nham tu vung",
  },
  GRAMMAR_MISMATCH: {
    en: "Grammar ending mistake",
    vi: "Ban sai mau ngu phap",
  },
  RANDOM_GUESS: {
    en: "Looks like a guess",
    vi: "Co ve day la doan",
  },
  LISTENING_MISHEAR: {
    en: "You misheard the audio",
    vi: "Ban nghe nham audio",
  },
  ORDERING_BREAKDOWN: {
    en: "Word order broke down",
    vi: "Ban roi o thu tu cau",
  },
};

export type FingerprintQuestionLike = SessionItem;
