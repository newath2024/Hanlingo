import type { LessonRole, LocalizedText, RuntimeLesson } from "./curriculum";
import type { ExerciseSetLesson } from "./exercise-set";

export type AppLesson = RuntimeLesson | ExerciseSetLesson;

export type NodeType = "standard" | "review";

export type NodeDefinition = {
  id: string;
  unitId: string;
  lessonId: string;
  order: number;
  title: LocalizedText;
  summary: LocalizedText;
  focusConcepts: string[];
  type: NodeType;
  lessonRole: LessonRole;
  sourceExerciseIds: string[];
  coverageTags: string[];
  sessionLength: number;
};

export type UnitDefinition = {
  id: string;
  unitId: string;
  unitNumber: number;
  title: LocalizedText;
  subtitle: LocalizedText;
  reviewWords: string[];
  lessons: AppLesson[];
  nodes: NodeDefinition[];
};

export type NodeMatch = {
  unit: UnitDefinition;
  node: NodeDefinition;
  lesson: AppLesson;
};

export type NodeProgress = {
  completed: boolean;
  lastScore: number;
  bestScore: number;
  weak: boolean;
  plays: number;
};

export type NodeState = "completed" | "current" | "locked";
