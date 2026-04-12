import { z } from "zod";

const reviewStateSchema = z.object({
  repetition: z.number().int().nonnegative(),
  interval: z.number().int().nonnegative(),
  easeFactor: z.number().positive(),
  dueAt: z.string().min(1),
  lastReviewedAt: z.string().min(1),
});

const nodeProgressSchema = z.object({
  completed: z.boolean(),
  lastScore: z.number().int().nonnegative(),
  bestScore: z.number().int().nonnegative(),
  weak: z.boolean(),
  plays: z.number().int().nonnegative(),
});

const progressStateSchema = z.object({
  xp: z.number().int().nonnegative(),
  completedLessons: z.array(z.string().min(1)),
  claimedStepRewards: z.array(z.string().min(1)),
  completedNodes: z.array(z.string().min(1)),
  completedUnits: z.array(z.string().min(1)),
  pathVersions: z.record(z.string(), z.number().int().nonnegative()).default({}),
  nodeRuns: z.record(z.string(), nodeProgressSchema),
  errorPatternMisses: z.record(z.string(), z.number().int().nonnegative()),
});

export const registerSchema = z.object({
  email: z.email().max(200),
  username: z
    .string()
    .trim()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only use letters, numbers, and underscores."),
  password: z.string().min(8).max(200),
});

export const loginSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(200),
});

export const importLocalProgressSchema = z.object({
  progress: progressStateSchema,
  reviews: z.record(z.string(), reviewStateSchema),
  sentenceExposures: z.record(z.string(), z.number().int().nonnegative()),
});

export const sessionCompleteSchema = z.object({
  completionId: z.string().trim().min(1),
  lessonId: z.string().trim().min(1),
  nodeId: z.string().trim().min(1),
  unitId: z.string().trim().min(1),
  score: z.number().int().nonnegative(),
  totalQuestions: z.number().int().positive(),
  awardedXp: z.number().int().nonnegative(),
  completeUnit: z.boolean().default(false),
  errorPatternMisses: z.record(z.string(), z.number().int().nonnegative()).default({}),
  sentenceExposureDeltas: z.record(z.string(), z.number().int().nonnegative()).default({}),
});

export const reviewMutationSchema = z.object({
  lessonId: z.string().trim().min(1),
  word: z.string().trim().min(1),
  rating: z.enum(["again", "good", "easy"]),
});

export const errorReportSchema = z.object({
  events: z
    .array(
      z.object({
        questionId: z.string().trim().min(1),
        lessonId: z.string().trim().min(1),
        userAnswer: z.string().trim().max(500).optional(),
        answerOptionId: z.string().trim().max(200).optional(),
        answerTokens: z.array(z.string().trim().min(1).max(100)).max(40).optional(),
        responseTimeMs: z.number().int().nonnegative(),
        priorAttempts: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(50),
});

export const practiceAnswerSchema = z.object({
  questionId: z.string().trim().min(1),
  lessonId: z.string().trim().min(1),
  sourceContext: z.enum(["practice_mixed", "practice_errors"]),
  userAnswer: z.string().trim().max(500).optional(),
  answerOptionId: z.string().trim().max(200).optional(),
  answerTokens: z.array(z.string().trim().min(1).max(100)).max(40).optional(),
  responseTimeMs: z.number().int().nonnegative(),
  priorAttempts: z.number().int().nonnegative(),
  wasCorrect: z.boolean(),
});

export const practiceQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(20).default(5),
});

export const adaptiveLessonQuerySchema = z.object({
  mode: z.enum(["balanced_progress", "focused_review", "weak_points"]),
  targetUnitId: z.string().trim().min(1).optional(),
  targetLessonId: z.string().trim().min(1).optional(),
  sessionSize: z.coerce.number().int().positive().max(20).default(10),
  seed: z.string().trim().min(1).optional(),
  debug: z
    .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
    .optional(),
});

export const adaptiveSessionCompleteSchema = z.object({
  sessionId: z.string().trim().min(1),
  mode: z.enum(["balanced_progress", "focused_review", "weak_points"]),
  targetUnitId: z.string().trim().min(1).optional(),
  targetLessonId: z.string().trim().min(1).optional(),
  sessionSize: z.number().int().positive().max(20),
  selectedQuestionIds: z.array(z.string().trim().min(1)).min(1).max(20),
  correctCount: z.number().int().nonnegative(),
  totalCount: z.number().int().positive(),
});

export const attemptBatchSchema = z.object({
  events: z
    .array(
      z.object({
        questionId: z.string().trim().min(1),
        lessonId: z.string().trim().min(1),
        wasCorrect: z.boolean(),
        responseTimeMs: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(50),
});

export const heatmapQuerySchema = z.object({
  scope: z
    .enum(["unit", "lesson", "node", "skill", "question_type", "knowledge_target"])
    .optional(),
  unitId: z.string().trim().min(1).optional(),
  lessonId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().max(20).default(6),
});

export const analyticsOverviewQuerySchema = z.object({
  timeZone: z.string().trim().min(1).max(100).optional(),
});

export const shellSidebarSummaryQuerySchema = z.object({
  timeZone: z.string().trim().min(1).max(100).optional(),
});
