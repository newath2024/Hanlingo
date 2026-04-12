import type { CurriculumIndex, LocalizedText, RuntimeTask, RuntimeUnit } from "@/types/curriculum";
import {
  getGeneratedIndexPath,
  getRuntimeUnitPath,
  readJsonFile,
} from "./io";
import {
  curriculumIndexSchema,
  runtimeUnitSchema,
} from "./schema";

type AuditDuplicateOptions = {
  unitId?: string;
};

type TaskSignatureEntry = {
  unitId: string;
  lessonId: string;
  lessonRole: RuntimeUnit["lessons"][number]["lessonRole"];
  lessonTitle: string;
  taskId: string;
  taskType: RuntimeTask["type"];
  preview: string;
  stemSignature: string;
  exactSignature: string;
};

type LessonSnapshot = {
  unitId: string;
  lessonId: string;
  lessonRole: RuntimeUnit["lessons"][number]["lessonRole"];
  lessonTitle: string;
  sourceExerciseIds: string[];
  tasks: TaskSignatureEntry[];
};

type DuplicateTaskFinding = {
  taskId: string;
  taskType: RuntimeTask["type"];
  preview: string;
};

type SameLessonDuplicateFinding = {
  unitId: string;
  lessonId: string;
  lessonRole: RuntimeUnit["lessons"][number]["lessonRole"];
  lessonTitle: string;
  duplicateGroups: DuplicateTaskFinding[][];
};

type CrossLessonDuplicateFinding = {
  left: {
    unitId: string;
    lessonId: string;
    lessonRole: RuntimeUnit["lessons"][number]["lessonRole"];
    lessonTitle: string;
  };
  right: {
    unitId: string;
    lessonId: string;
    lessonRole: RuntimeUnit["lessons"][number]["lessonRole"];
    lessonTitle: string;
  };
  sourceExerciseOverlap: string[];
  exactDuplicates: Array<{
    left: DuplicateTaskFinding;
    right: DuplicateTaskFinding;
  }>;
  stemDuplicateCount: number;
};

export type DuplicateAuditResult = {
  unitsAudited: string[];
  lessonCount: number;
  taskCount: number;
  sameLessonDuplicates: SameLessonDuplicateFinding[];
  crossLessonDuplicates: CrossLessonDuplicateFinding[];
  nonReviewCrossLessonDuplicates: CrossLessonDuplicateFinding[];
  reviewRelatedDuplicates: CrossLessonDuplicateFinding[];
};

function normalize(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLocalizedText(value: LocalizedText | string | null | undefined) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return normalize(value);
  }

  return `${normalize(value.en)}|${normalize(value.vi)}`;
}

function toSortedNormalizedArray(values: string[] | undefined) {
  return [...(values ?? [])]
    .map((value) => normalize(value))
    .sort();
}

function getTaskPreview(task: RuntimeTask) {
  if (task.type === "translate") {
    return task.koreanText ? `${task.type}: ${task.koreanText}` : `${task.type}: ${task.meaning.vi}`;
  }

  if (task.type === "word_match" || task.type === "grammar_select" || task.type === "fill_blank") {
    return `${task.type}: ${task.koreanText}`;
  }

  if (task.type === "listen_select") {
    return `${task.type}: ${task.audioText ?? task.prompt.vi}`;
  }

  if (task.type === "arrange_sentence") {
    return `${task.type}: ${task.meaning.vi}`;
  }

  if (task.type === "dialogue_reconstruct") {
    return `${task.type}: ${task.translation.vi}`;
  }

  return `${task.type}: ${task.koreanText}`;
}

function buildStemSignature(task: RuntimeTask) {
  if (task.type === "word_match") {
    return JSON.stringify({
      type: task.type,
      koreanText: normalize(task.koreanText),
      questionText: normalizeLocalizedText(task.questionText),
      prompt: normalizeLocalizedText(task.prompt),
    });
  }

  if (task.type === "listen_select") {
    return JSON.stringify({
      type: task.type,
      audioText: normalize(task.audioText),
      questionText: normalizeLocalizedText(task.questionText),
      prompt: normalizeLocalizedText(task.prompt),
    });
  }

  if (task.type === "translate") {
    return JSON.stringify({
      type: task.type,
      direction: task.direction,
      koreanText: normalize(task.koreanText),
      meaning: normalizeLocalizedText(task.meaning),
      prompt: normalizeLocalizedText(task.prompt),
    });
  }

  if (task.type === "fill_blank") {
    return JSON.stringify({
      type: task.type,
      koreanText: normalize(task.koreanText),
      prompt: normalizeLocalizedText(task.prompt),
      clue: normalizeLocalizedText(task.clue),
    });
  }

  if (task.type === "grammar_select") {
    return JSON.stringify({
      type: task.type,
      koreanText: normalize(task.koreanText),
      prompt: normalizeLocalizedText(task.prompt),
    });
  }

  if (task.type === "arrange_sentence") {
    return JSON.stringify({
      type: task.type,
      meaning: normalizeLocalizedText(task.meaning),
      prompt: normalizeLocalizedText(task.prompt),
    });
  }

  if (task.type === "dialogue_reconstruct") {
    return JSON.stringify({
      type: task.type,
      speaker: normalize(task.speaker),
      translation: normalizeLocalizedText(task.translation),
      prompt: normalizeLocalizedText(task.prompt),
    });
  }

  return JSON.stringify({
    type: task.type,
    koreanText: normalize(task.koreanText),
    expectedSpeech: normalize(task.expectedSpeech),
    prompt: normalizeLocalizedText(task.prompt),
  });
}

function buildExactSignature(task: RuntimeTask) {
  if (task.type === "word_match") {
    return JSON.stringify({
      type: task.type,
      koreanText: normalize(task.koreanText),
      questionText: normalizeLocalizedText(task.questionText),
      prompt: normalizeLocalizedText(task.prompt),
      answer: normalize(task.answer),
      choices: [...task.choices]
        .map((choice) => `${normalizeLocalizedText(choice.text)}:${normalize(choice.koreanLabel)}`)
        .sort(),
    });
  }

  if (task.type === "listen_select") {
    return JSON.stringify({
      type: task.type,
      audioText: normalize(task.audioText),
      questionText: normalizeLocalizedText(task.questionText),
      prompt: normalizeLocalizedText(task.prompt),
      answer: normalize(task.answer),
      choices: [...task.choices]
        .map((choice) => `${normalizeLocalizedText(choice.text)}:${normalize(choice.koreanLabel)}`)
        .sort(),
    });
  }

  if (task.type === "translate") {
    return JSON.stringify({
      type: task.type,
      direction: task.direction,
      koreanText: normalize(task.koreanText),
      meaning: normalizeLocalizedText(task.meaning),
      prompt: normalizeLocalizedText(task.prompt),
      acceptedAnswers: toSortedNormalizedArray(task.acceptedAnswers),
    });
  }

  if (task.type === "fill_blank") {
    return JSON.stringify({
      type: task.type,
      koreanText: normalize(task.koreanText),
      prompt: normalizeLocalizedText(task.prompt),
      clue: normalizeLocalizedText(task.clue),
      acceptedAnswers: toSortedNormalizedArray(task.acceptedAnswers),
      choices: toSortedNormalizedArray(task.choices),
    });
  }

  if (task.type === "grammar_select") {
    return JSON.stringify({
      type: task.type,
      koreanText: normalize(task.koreanText),
      prompt: normalizeLocalizedText(task.prompt),
      answer: normalize(task.answer),
      choices: toSortedNormalizedArray(task.choices),
    });
  }

  if (task.type === "arrange_sentence") {
    return JSON.stringify({
      type: task.type,
      meaning: normalizeLocalizedText(task.meaning),
      prompt: normalizeLocalizedText(task.prompt),
      answer: task.answer.map((value) => normalize(value)),
      wordBank: toSortedNormalizedArray(task.wordBank),
    });
  }

  if (task.type === "dialogue_reconstruct") {
    return JSON.stringify({
      type: task.type,
      speaker: normalize(task.speaker),
      translation: normalizeLocalizedText(task.translation),
      prompt: normalizeLocalizedText(task.prompt),
      answer: task.answer.map((value) => normalize(value)),
      wordBank: toSortedNormalizedArray(task.wordBank),
    });
  }

  return JSON.stringify({
    type: task.type,
    koreanText: normalize(task.koreanText),
    expectedSpeech: normalize(task.expectedSpeech),
    prompt: normalizeLocalizedText(task.prompt),
  });
}

async function loadRuntimeUnits(unitId?: string) {
  if (unitId) {
    const runtimeUnit = runtimeUnitSchema.parse(
      await readJsonFile<RuntimeUnit>(getRuntimeUnitPath(unitId)),
    );
    return [runtimeUnit];
  }

  const indexPath = getGeneratedIndexPath();
  const curriculumIndex = curriculumIndexSchema.parse(
    await readJsonFile<CurriculumIndex>(indexPath),
  );

  return Promise.all(
    curriculumIndex.units.map(async (entry) =>
      runtimeUnitSchema.parse(await readJsonFile<RuntimeUnit>(getRuntimeUnitPath(entry.id))),
    ),
  );
}

function toLessonSnapshots(runtimeUnits: RuntimeUnit[]) {
  return runtimeUnits.flatMap((unit) =>
    unit.lessons.map<LessonSnapshot>((lesson) => ({
      unitId: unit.unitId,
      lessonId: lesson.lessonId,
      lessonRole: lesson.lessonRole,
      lessonTitle: lesson.title.vi,
      sourceExerciseIds: lesson.sourceExerciseIds,
      tasks: lesson.tasks.map((task) => ({
        unitId: unit.unitId,
        lessonId: lesson.lessonId,
        lessonRole: lesson.lessonRole,
        lessonTitle: lesson.title.vi,
        taskId: task.id,
        taskType: task.type,
        preview: getTaskPreview(task),
        stemSignature: buildStemSignature(task),
        exactSignature: buildExactSignature(task),
      })),
    })),
  );
}

export async function auditDuplicateLessons(
  options: AuditDuplicateOptions = {},
): Promise<DuplicateAuditResult> {
  const runtimeUnits = await loadRuntimeUnits(options.unitId);
  const lessons = toLessonSnapshots(runtimeUnits);

  const sameLessonDuplicates: SameLessonDuplicateFinding[] = [];

  for (const lesson of lessons) {
    const exactGroups = new Map<string, TaskSignatureEntry[]>();

    for (const task of lesson.tasks) {
      const group = exactGroups.get(task.exactSignature) ?? [];
      group.push(task);
      exactGroups.set(task.exactSignature, group);
    }

    const duplicateGroups = [...exactGroups.values()]
      .filter((group) => group.length > 1)
      .map((group) =>
        group.map((task) => ({
          taskId: task.taskId,
          taskType: task.taskType,
          preview: task.preview,
        })),
      );

    if (duplicateGroups.length > 0) {
      sameLessonDuplicates.push({
        unitId: lesson.unitId,
        lessonId: lesson.lessonId,
        lessonRole: lesson.lessonRole,
        lessonTitle: lesson.lessonTitle,
        duplicateGroups,
      });
    }
  }

  const crossLessonDuplicates: CrossLessonDuplicateFinding[] = [];

  for (let leftIndex = 0; leftIndex < lessons.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < lessons.length; rightIndex += 1) {
      const leftLesson = lessons[leftIndex];
      const rightLesson = lessons[rightIndex];
      const sourceExerciseOverlap = leftLesson.sourceExerciseIds.filter((exerciseId) =>
        rightLesson.sourceExerciseIds.includes(exerciseId),
      );
      const exactDuplicates: CrossLessonDuplicateFinding["exactDuplicates"] = [];
      const seenExactSignatures = new Set<string>();

      for (const leftTask of leftLesson.tasks) {
        if (seenExactSignatures.has(leftTask.exactSignature)) {
          continue;
        }

        const rightTask = rightLesson.tasks.find(
          (candidate) => candidate.exactSignature === leftTask.exactSignature,
        );

        if (!rightTask) {
          continue;
        }

        seenExactSignatures.add(leftTask.exactSignature);
        exactDuplicates.push({
          left: {
            taskId: leftTask.taskId,
            taskType: leftTask.taskType,
            preview: leftTask.preview,
          },
          right: {
            taskId: rightTask.taskId,
            taskType: rightTask.taskType,
            preview: rightTask.preview,
          },
        });
      }

      const stemDuplicates = new Set(
        leftLesson.tasks
          .map((task) => task.stemSignature)
          .filter((signature) =>
            rightLesson.tasks.some((candidate) => candidate.stemSignature === signature),
          ),
      );

      if (sourceExerciseOverlap.length === 0 && exactDuplicates.length === 0 && stemDuplicates.size === 0) {
        continue;
      }

      crossLessonDuplicates.push({
        left: {
          unitId: leftLesson.unitId,
          lessonId: leftLesson.lessonId,
          lessonRole: leftLesson.lessonRole,
          lessonTitle: leftLesson.lessonTitle,
        },
        right: {
          unitId: rightLesson.unitId,
          lessonId: rightLesson.lessonId,
          lessonRole: rightLesson.lessonRole,
          lessonTitle: rightLesson.lessonTitle,
        },
        sourceExerciseOverlap,
        exactDuplicates,
        stemDuplicateCount: stemDuplicates.size,
      });
    }
  }

  crossLessonDuplicates.sort((left, right) => {
    const rightScore =
      right.exactDuplicates.length * 10 + right.stemDuplicateCount * 3 + right.sourceExerciseOverlap.length;
    const leftScore =
      left.exactDuplicates.length * 10 + left.stemDuplicateCount * 3 + left.sourceExerciseOverlap.length;
    return rightScore - leftScore;
  });

  const nonReviewCrossLessonDuplicates = crossLessonDuplicates.filter(
    (finding) =>
      finding.exactDuplicates.length > 0 &&
      finding.left.lessonRole !== "review" &&
      finding.right.lessonRole !== "review",
  );
  const reviewRelatedDuplicates = crossLessonDuplicates.filter(
    (finding) =>
      finding.exactDuplicates.length > 0 &&
      (finding.left.lessonRole === "review" || finding.right.lessonRole === "review"),
  );

  return {
    unitsAudited: runtimeUnits.map((unit) => unit.unitId),
    lessonCount: lessons.length,
    taskCount: lessons.reduce((count, lesson) => count + lesson.tasks.length, 0),
    sameLessonDuplicates,
    crossLessonDuplicates,
    nonReviewCrossLessonDuplicates,
    reviewRelatedDuplicates,
  };
}
