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
