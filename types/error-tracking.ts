import type { SessionItem } from "@/types/session";

export type ErrorType = "vocab" | "grammar" | "listening" | "speaking";

export type PracticeQuestionSource =
  | "progression"
  | "due_review"
  | "weak_reinforcement"
  | "confidence_builder";

export type PracticeQuestion = SessionItem & {
  questionId: string;
  lessonId: string;
  unitId: string;
  source: PracticeQuestionSource;
  errorCount: number;
};

export type UserErrorState = {
  id: string;
  userId: string;
  questionId: string;
  lessonId: string;
  errorType: ErrorType;
  userAnswer: string;
  correctAnswer: string;
  errorCount: number;
  lastSeenAt: string;
  nextReviewAt: string;
  createdAt: string;
};
