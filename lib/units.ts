import curriculumIndex from "@/data/generated/index.json";
import unit1ExerciseSetData from "@/data/generated/unit-1.exercise-set.json";
import unit16ExerciseSetData from "@/data/generated/unit-16.exercise-set.json";
import unit17ExerciseSetData from "@/data/generated/unit-17.exercise-set.json";
import unit1Data from "@/data/generated/unit-1.runtime.json";
import unit16Data from "@/data/generated/unit-16.runtime.json";
import unit17Data from "@/data/generated/unit-17.runtime.json";
import type { ProgressState } from "@/lib/progress-state";
import type { CurriculumIndex, RuntimeLesson, RuntimeUnit } from "@/types/curriculum";
import type { ExerciseSetLesson, UnitExerciseSet } from "@/types/exercise-set";
import type {
  AppLesson,
  NodeDefinition,
  NodeMatch,
  NodeProgress,
  NodeState,
  UnitDefinition,
} from "@/types/unit";

type RuntimeUnitDefinition = Omit<UnitDefinition, "lessons"> & {
  lessons: RuntimeLesson[];
};

const generatedIndex = curriculumIndex as CurriculumIndex;
const runtimeUnits: Record<string, RuntimeUnit> = {
  "1": unit1Data as RuntimeUnit,
  "16": unit16Data as RuntimeUnit,
  "17": unit17Data as RuntimeUnit,
};
const exerciseSets: Record<string, UnitExerciseSet> = {
  "1": unit1ExerciseSetData as UnitExerciseSet,
  "16": unit16ExerciseSetData as UnitExerciseSet,
  "17": unit17ExerciseSetData as UnitExerciseSet,
};

function toLocalizedText(value: string) {
  return {
    en: value,
    vi: value,
  };
}

function buildNodeDefinition(
  unitId: string,
  lesson: AppLesson,
  order: number,
): NodeDefinition {
  const sourceExerciseIds =
    "tasks" in lesson ? lesson.sourceExerciseIds : lesson.exerciseIds;
  const sessionLength = "tasks" in lesson ? lesson.tasks.length : lesson.exercises.length;

  return {
    id: lesson.lessonId,
    unitId,
    lessonId: lesson.lessonId,
    order,
    title: lesson.title,
    summary: lesson.summary,
    focusConcepts: lesson.focusConcepts,
    type: lesson.lessonRole === "review" ? "review" : "standard",
    lessonRole: lesson.lessonRole,
    sourceExerciseIds,
    coverageTags: lesson.coverageTags,
    sessionLength,
  };
}

function buildRuntimeUnitDefinition(runtimeUnit: RuntimeUnit): RuntimeUnitDefinition {
  const nodes = runtimeUnit.lessons.map((lesson, index) =>
    buildNodeDefinition(runtimeUnit.unitId, lesson, index + 1),
  );

  return {
    id: runtimeUnit.unitId,
    unitId: runtimeUnit.unitId,
    unitNumber: runtimeUnit.unitNumber,
    title: runtimeUnit.title,
    subtitle: runtimeUnit.subtitle,
    reviewWords: runtimeUnit.reviewWords,
    lessons: runtimeUnit.lessons,
    nodes,
  };
}

function getStageLessonRole(order: number) {
  if (order === 3) {
    return "review" as const;
  }

  if (order === 2) {
    return "grammar" as const;
  }

  return "intro" as const;
}

function getStageLessonTitle(order: number) {
  if (order === 1) {
    return "Stage 1";
  }

  if (order === 2) {
    return "Stage 2";
  }

  return "Stage 3";
}

function buildExerciseLessons(unitId: string): ExerciseSetLesson[] {
  const exerciseSet = exerciseSets[unitId];

  if (!exerciseSet) {
    return [];
  }

  return exerciseSet.stages.map((stage, index) => {
    const focusConcepts = [...new Set(stage.exercises.flatMap((exercise) => exercise.focus))];

    return {
      ...stage,
      lessonId: `unit-${unitId}-lesson-${index + 1}`,
      lessonRole: getStageLessonRole(index + 1),
      order: index + 1,
      title: toLocalizedText(getStageLessonTitle(index + 1)),
      summary: toLocalizedText(stage.stage_goal),
      focusConcepts,
      coverageTags: focusConcepts,
      exerciseIds: stage.exercises.map((exercise) => exercise.id),
    };
  });
}

function buildExerciseUnitDefinition(runtimeUnit: RuntimeUnit): UnitDefinition {
  const exerciseSet = exerciseSets[runtimeUnit.unitId];

  if (!exerciseSet || exerciseSet.unit_id !== runtimeUnit.unitId) {
    throw new Error(`Exercise-set artifact is out of sync for unit ${runtimeUnit.unitId}.`);
  }

  const lessons = buildExerciseLessons(runtimeUnit.unitId);
  const nodes = lessons.map((lesson, index) =>
    buildNodeDefinition(runtimeUnit.unitId, lesson, index + 1),
  );

  return {
    id: runtimeUnit.unitId,
    unitId: runtimeUnit.unitId,
    unitNumber: runtimeUnit.unitNumber,
    title: runtimeUnit.title,
    subtitle: runtimeUnit.subtitle,
    reviewWords: runtimeUnit.reviewWords,
    lessons,
    nodes,
  };
}

function buildStandardUnitDefinition(unitId: string) {
  const runtimeUnit = runtimeUnits[unitId];

  if (!runtimeUnit) {
    return null;
  }

  if (exerciseSets[unitId]) {
    return buildExerciseUnitDefinition(runtimeUnit);
  }

  return buildRuntimeUnitDefinition(runtimeUnit);
}

function buildRuntimeCatalogUnit(unitId: string) {
  const runtimeUnit = runtimeUnits[unitId];

  if (!runtimeUnit) {
    return null;
  }

  return buildRuntimeUnitDefinition(runtimeUnit);
}

export const unitCatalog: UnitDefinition[] = generatedIndex.units
  .map((entry) => buildStandardUnitDefinition(entry.id))
  .filter((unit): unit is UnitDefinition => unit !== null);

export const runtimeUnitCatalog: RuntimeUnitDefinition[] = generatedIndex.units
  .map((entry) => buildRuntimeCatalogUnit(entry.id))
  .filter((unit): unit is RuntimeUnitDefinition => unit !== null);

export const nodeCatalog = unitCatalog.flatMap((unit) => unit.nodes);

export function getUnitById(id: string) {
  return unitCatalog.find((unit) => unit.id === id) ?? null;
}

export function getRuntimeUnitById(id: string) {
  return runtimeUnitCatalog.find((unit) => unit.id === id) ?? null;
}

export function getNodeById(id: string): NodeMatch | null {
  const node = nodeCatalog.find((candidate) => candidate.id === id);

  if (!node) {
    return null;
  }

  const unit = getUnitById(node.unitId);

  if (!unit) {
    return null;
  }

  const lesson = unit.lessons.find((entry) => entry.lessonId === node.lessonId);

  if (!lesson) {
    return null;
  }

  return {
    unit,
    node,
    lesson,
  };
}

export function getLessonForNode(unit: UnitDefinition, node: NodeDefinition) {
  return unit.lessons.find((lesson) => lesson.lessonId === node.lessonId) ?? null;
}

export function getRuntimeLessonForNode(
  unit: RuntimeUnitDefinition,
  node: NodeDefinition,
) {
  return unit.lessons.find((lesson) => lesson.lessonId === node.lessonId) ?? null;
}

export function getUnitWords(unit: UnitDefinition) {
  return unit.reviewWords;
}

export function isNodeCompleted(progress: ProgressState, nodeId: string) {
  return progress.completedNodes.includes(nodeId);
}

export function isUnitCompleted(progress: ProgressState, unitId: string) {
  return progress.completedUnits.includes(unitId);
}

export function getNodeRun(progress: ProgressState, nodeId: string): NodeProgress | null {
  return progress.nodeRuns[nodeId] ?? null;
}

export function isNodeUnlocked(
  progress: ProgressState,
  unit: UnitDefinition,
  nodeId: string,
) {
  const node = unit.nodes.find((candidate) => candidate.id === nodeId);

  if (!node) {
    return false;
  }

  if (node.order === 1) {
    return true;
  }

  const previousNode = unit.nodes.find((candidate) => candidate.order === node.order - 1);
  return previousNode ? progress.completedNodes.includes(previousNode.id) : true;
}

export function getNodeState(
  progress: ProgressState,
  unit: UnitDefinition,
  nodeId: string,
): NodeState {
  if (isNodeCompleted(progress, nodeId)) {
    return "completed";
  }

  return isNodeUnlocked(progress, unit, nodeId) ? "current" : "locked";
}

export function getCompletedNodeCount(progress: ProgressState, unit: UnitDefinition) {
  return unit.nodes.filter((node) => isNodeCompleted(progress, node.id)).length;
}

export function getCurrentNode(unit: UnitDefinition, progress: ProgressState) {
  return unit.nodes.find((node) => getNodeState(progress, unit, node.id) === "current") ?? null;
}

export function getNextNode(unit: UnitDefinition, nodeId: string) {
  const node = unit.nodes.find((candidate) => candidate.id === nodeId);

  if (!node) {
    return null;
  }

  return unit.nodes.find((candidate) => candidate.order === node.order + 1) ?? null;
}
