import type {
  LessonRole,
  LocalizedText,
  RuntimeLesson,
  RuntimeUnitSection,
} from "./curriculum";

export type UnitSectionDefinition = RuntimeUnitSection;

export type NodeType = "standard" | "review";

export type NodeDefinition = {
  id: string;
  unitId: string;
  lessonId: string;
  order: number;
  sectionId: string;
  sectionOrder: number;
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
  sections: UnitSectionDefinition[];
  lessons: RuntimeLesson[];
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
