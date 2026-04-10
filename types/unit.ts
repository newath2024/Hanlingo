import type { LessonRole, LocalizedText, RuntimeLesson, RuntimeUnit } from "./curriculum";

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

export type UnitDefinition = RuntimeUnit & {
  id: string;
  nodes: NodeDefinition[];
};

export type NodeMatch = {
  unit: UnitDefinition;
  node: NodeDefinition;
  lesson: RuntimeLesson;
};

export type NodeProgress = {
  completed: boolean;
  lastScore: number;
  bestScore: number;
  weak: boolean;
  plays: number;
};

export type NodeState = "completed" | "current" | "locked";
