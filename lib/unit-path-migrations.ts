import { extractSentenceTask } from "@/lib/sentence-task-generator";
import { runtimeUnitCatalog } from "@/lib/units";

export const UNIT_PATH_VERSIONS: Record<string, number> = {
  "1": 1,
  "16": 1,
  "17": 1,
};

const ERROR_PATTERN_PREFIXES: Record<string, string[]> = {
  "1": ["l1-", "l2-", "l3-", "u1-", "wb-", "review-"],
  "16": ["u16-", "wb16-"],
  "17": ["u17-", "wb17-"],
};

export type UnitPathMigrationScope = {
  unitId: string;
  version: number;
  lessonIds: string[];
  nodeIds: string[];
  questionIds: string[];
  errorPatternKeys: string[];
  errorPatternPrefixes: string[];
  sentenceKeys: string[];
};

function buildUnitPathMigrationScope(unitId: string, version: number): UnitPathMigrationScope {
  const unit = runtimeUnitCatalog.find((entry) => entry.id === unitId);

  if (!unit) {
    throw new Error(`Missing runtime unit ${unitId} for path migration scope.`);
  }

  const questionIds = unit.lessons.flatMap((lesson) => lesson.tasks.map((task) => task.id));
  const errorPatternKeys = unit.lessons.flatMap((lesson) =>
    lesson.tasks.map((task) => task.errorPatternKey),
  );
  const sentenceKeys = unit.lessons.flatMap((lesson) =>
    lesson.tasks
      .map((task) => extractSentenceTask(task)?.sentenceKey ?? null)
      .filter((sentenceKey): sentenceKey is string => Boolean(sentenceKey)),
  );

  return {
    unitId,
    version,
    lessonIds: unit.lessons.map((lesson) => lesson.lessonId),
    nodeIds: unit.nodes.map((node) => node.id),
    questionIds,
    errorPatternKeys,
    errorPatternPrefixes: ERROR_PATTERN_PREFIXES[unitId] ?? [],
    sentenceKeys: [...new Set(sentenceKeys)],
  };
}

export const UNIT_PATH_MIGRATION_SCOPES = Object.entries(UNIT_PATH_VERSIONS).map(
  ([unitId, version]) => buildUnitPathMigrationScope(unitId, version),
);

export function listPendingUnitPathMigrations(pathVersions: Record<string, number>) {
  return UNIT_PATH_MIGRATION_SCOPES.filter(
    (scope) => (pathVersions[scope.unitId] ?? 0) !== scope.version,
  );
}

