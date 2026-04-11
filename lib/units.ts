import curriculumIndex from "@/data/generated/index.json";
import unit1Data from "@/data/generated/unit-1.runtime.json";
import unit16Data from "@/data/generated/unit-16.runtime.json";
import unit17Data from "@/data/generated/unit-17.runtime.json";
import type { ProgressState } from "@/lib/progress-state";
import type { CurriculumIndex, RuntimeLesson, RuntimeUnit } from "@/types/curriculum";
import type {
  NodeDefinition,
  NodeMatch,
  NodeProgress,
  NodeState,
  UnitDefinition,
} from "@/types/unit";

const generatedIndex = curriculumIndex as CurriculumIndex;
const runtimeUnits: Record<string, RuntimeUnit> = {
  "1": unit1Data as RuntimeUnit,
  "16": unit16Data as RuntimeUnit,
  "17": unit17Data as RuntimeUnit,
};

function buildNodeDefinition(
  unitId: string,
  lesson: RuntimeLesson,
  order: number,
): NodeDefinition {
  return {
    id: lesson.lessonId,
    unitId,
    lessonId: lesson.lessonId,
    order,
    sectionId: lesson.sectionId,
    sectionOrder: lesson.sectionOrder,
    title: lesson.title,
    summary: lesson.summary,
    focusConcepts: lesson.focusConcepts,
    type: lesson.lessonRole === "review" ? "review" : "standard",
    lessonRole: lesson.lessonRole,
    sourceExerciseIds: lesson.sourceExerciseIds,
    coverageTags: lesson.coverageTags,
    sessionLength: lesson.tasks.length,
  };
}

function buildRuntimeUnitDefinition(runtimeUnit: RuntimeUnit): UnitDefinition {
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
    sections: runtimeUnit.sections,
    lessons: runtimeUnit.lessons,
    nodes,
  };
}

function buildRuntimeCatalogUnit(unitId: string) {
  const runtimeUnit = runtimeUnits[unitId];

  if (!runtimeUnit) {
    return null;
  }

  return buildRuntimeUnitDefinition(runtimeUnit);
}

export const unitCatalog: UnitDefinition[] = generatedIndex.units
  .map((entry) => buildRuntimeCatalogUnit(entry.id))
  .filter((unit): unit is UnitDefinition => unit !== null);

export const runtimeUnitCatalog: UnitDefinition[] = unitCatalog;

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
  unit: UnitDefinition,
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

export function getPreviousUnit(unitId: string) {
  const unitIndex = unitCatalog.findIndex((unit) => unit.id === unitId);

  if (unitIndex <= 0) {
    return null;
  }

  return unitCatalog[unitIndex - 1] ?? null;
}

export function isUnitUnlocked(progress: ProgressState, unitId: string) {
  const unit = getUnitById(unitId);

  if (!unit) {
    return false;
  }

  const previousUnit = getPreviousUnit(unitId);

  if (!previousUnit) {
    return true;
  }

  return isUnitCompleted(progress, previousUnit.id);
}

export function getCurrentUnit(progress: ProgressState) {
  return (
    unitCatalog.find(
      (unit) => isUnitUnlocked(progress, unit.id) && !isUnitCompleted(progress, unit.id),
    ) ??
    unitCatalog[0] ??
    null
  );
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

  if (!isUnitUnlocked(progress, unit.id)) {
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
