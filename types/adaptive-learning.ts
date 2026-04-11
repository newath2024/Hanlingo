import type { LocalizedText } from "@/types/curriculum";
import type { PracticeQuestion, PracticeQuestionSource } from "@/types/error-tracking";

export type AdaptiveSessionMode =
  | "balanced_progress"
  | "focused_review"
  | "weak_points";

export type AdaptiveSelectionSource = PracticeQuestionSource;

export type AdaptiveVariantType =
  | "exact"
  | "interaction_mode_variant"
  | "related_task_variant"
  | "exact_fallback";

export type AdaptiveWeightBreakdown = {
  weaknessWeight: number;
  recencyDueWeight: number;
  repeatedErrorWeight: number;
  fingerprintPriorityWeight: number;
  progressionRelevanceWeight: number;
  overexposurePenalty: number;
  totalScore: number;
};

export type AdaptiveSelectionDebug = {
  questionId: string;
  selectionSource: AdaptiveSelectionSource;
  variantType: AdaptiveVariantType;
  weightBreakdown: AdaptiveWeightBreakdown;
  reason: string;
  relatedFromQuestionId?: string;
  targetIds: string[];
};

export type AdaptiveSessionItem = PracticeQuestion & {
  sessionLabel: LocalizedText;
  selectionSource: AdaptiveSelectionSource;
  variantType: AdaptiveVariantType;
  relatedFromQuestionId?: string;
  selectionDebug?: AdaptiveSelectionDebug;
};

export type AdaptiveSessionResponse = {
  sessionId: string;
  mode: AdaptiveSessionMode;
  sessionLabel: LocalizedText;
  items: AdaptiveSessionItem[];
  debug?: AdaptiveSelectionDebug[];
};
