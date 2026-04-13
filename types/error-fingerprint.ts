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
  uiReason: LocalizedText;
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
    vi: "Bạn đã nhầm từ vựng",
  },
  GRAMMAR_MISMATCH: {
    en: "Grammar ending mistake",
    vi: "Bạn sai mẫu ngữ pháp",
  },
  RANDOM_GUESS: {
    en: "Looks like a guess",
    vi: "Có vẻ đây là một lần đoán",
  },
  LISTENING_MISHEAR: {
    en: "You misheard the audio",
    vi: "Bạn nghe nhầm âm thanh",
  },
  ORDERING_BREAKDOWN: {
    en: "Word order broke down",
    vi: "Bạn bị rối trật tự câu",
  },
};

const FINGERPRINT_UI_REASON_BY_SHORT_REASON: Record<string, LocalizedText> = {
  "Most chunks are present, but the sentence order broke down.": {
    en: "Most chunks are present, but the sentence order broke down.",
    vi: "Phần lớn thành phần đã đúng, nhưng trật tự câu bị rối.",
  },
  "The wrong answer sounds close to the audio cue.": {
    en: "The wrong answer sounds close to the audio cue.",
    vi: "Đáp án sai nghe khá giống với âm thanh vừa nghe.",
  },
  "Vocabulary was partly there, but the grammar form was off.": {
    en: "Vocabulary was partly there, but the grammar form was off.",
    vi: "Từ vựng có phần đúng, nhưng dạng ngữ pháp chưa khớp.",
  },
  "The answer looks close to a related word or particle.": {
    en: "The answer looks close to a related word or particle.",
    vi: "Câu trả lời của bạn gần với một từ hoặc tiểu từ liên quan.",
  },
  "The answer looks like a low-signal guess.": {
    en: "The answer looks like a low-signal guess.",
    vi: "Câu trả lời này trông giống một lần đoán thiếu căn cứ.",
  },
  "The wrong answer does not relate closely to the prompt.": {
    en: "The wrong answer does not relate closely to the prompt.",
    vi: "Câu trả lời sai không liên hệ chặt với gợi ý.",
  },
};

const DEFAULT_FINGERPRINT_UI_REASONS: Record<FingerprintType, LocalizedText> = {
  WORD_CONFUSION: {
    en: "The answer looks close to a related word or particle.",
    vi: "Câu trả lời của bạn gần với một từ hoặc tiểu từ liên quan.",
  },
  GRAMMAR_MISMATCH: {
    en: "Vocabulary was partly there, but the grammar form was off.",
    vi: "Từ vựng có phần đúng, nhưng dạng ngữ pháp chưa khớp.",
  },
  RANDOM_GUESS: {
    en: "The answer looks like a low-signal guess.",
    vi: "Câu trả lời này trông giống một lần đoán thiếu căn cứ.",
  },
  LISTENING_MISHEAR: {
    en: "The wrong answer sounds close to the audio cue.",
    vi: "Đáp án sai nghe khá giống với âm thanh vừa nghe.",
  },
  ORDERING_BREAKDOWN: {
    en: "Most chunks are present, but the sentence order broke down.",
    vi: "Phần lớn thành phần đã đúng, nhưng trật tự câu bị rối.",
  },
};

export function getFingerprintUiReason(
  type: FingerprintType,
  shortReason: string,
): LocalizedText {
  return FINGERPRINT_UI_REASON_BY_SHORT_REASON[shortReason] ?? DEFAULT_FINGERPRINT_UI_REASONS[type];
}

export type FingerprintQuestionLike = SessionItem;
