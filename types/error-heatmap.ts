export type HeatmapScopeType =
  | "unit"
  | "lesson"
  | "node"
  | "skill"
  | "question_type"
  | "knowledge_target";

export type HeatmapSkillType =
  | "vocab"
  | "grammar"
  | "listening"
  | "speaking"
  | "sentence_ordering"
  | "reading";

export type HeatmapQuestionFormat =
  | "multiple_choice"
  | "typing"
  | "reorder"
  | "listening_select"
  | "speaking_repeat";

export type HeatmapRecommendationTag =
  | "Needs urgent review"
  | "Weak grammar area"
  | "Often confused vocab"
  | "Steady watch";

export type RecentTrend = "up" | "down" | "stable";

export type AttemptSourceContext = "lesson" | "practice_mixed" | "practice_errors";

export type KnowledgeTargetKind = "vocab" | "grammar_pattern" | "sentence_pattern";

export type UserErrorHeatmapEntry = {
  scopeType: HeatmapScopeType;
  scopeId: string;
  label: string;
  wrongCount: number;
  seenCount: number;
  accuracy: number;
  errorRate: number;
  uniqueWrongCount: number;
  repeatedWrongCount: number;
  repeatedFailureStreak: number;
  weightedWrongScore: number;
  recentTrend: RecentTrend;
  recommendationTag: HeatmapRecommendationTag;
};

export type UserErrorHeatmapResponse = {
  userId: string;
  generatedAt: string;
  summary: {
    totalSeen: number;
    totalWrong: number;
    overallAccuracy: number;
    mostMissedUnits: UserErrorHeatmapEntry[];
    mostMissedLessons: UserErrorHeatmapEntry[];
    mostMissedSkills: UserErrorHeatmapEntry[];
    mostMissedVocabulary: UserErrorHeatmapEntry[];
    mostMissedGrammarPatterns: UserErrorHeatmapEntry[];
  };
  heatmap: UserErrorHeatmapEntry[];
};

export type UserQuestionAttemptInput = {
  questionId: string;
  lessonId: string;
  sourceContext: AttemptSourceContext;
  wasCorrect: boolean;
  responseTimeMs: number;
};

