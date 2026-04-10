import fs from "node:fs/promises";
import type { RawUnitDraft, RuntimeTask, RuntimeUnit, SourceUnit } from "@/types/curriculum";
import {
  getExtractedSourcePath,
  getGeneratedIndexPath,
  getRawDraftPath,
  getReviewedSourcePath,
  getRuntimeUnitPath,
  readJsonFile,
} from "./io";
import {
  curriculumIndexSchema,
  rawUnitDraftSchema,
  runtimeUnitSchema,
  sourceUnitSchema,
} from "./schema";

type ValidateOptions = {
  unitId: string;
};

const STAGE_ORDER: Record<RuntimeTask["stage"], number> = {
  recognition: 0,
  recall: 1,
  construction: 2,
  production: 3,
};

const FILL_BLANK_GRAMMAR_ENDINGS = new Set([
  "입니다",
  "입니까",
  "이에요",
  "예요",
  "은",
  "는",
  "이",
  "가",
  "도",
]);

function normalizeFillBlankValue(value: string) {
  return value.replace(/[.,!?]/g, "").trim();
}

function isGrammarEndingValue(value: string) {
  return FILL_BLANK_GRAMMAR_ENDINGS.has(normalizeFillBlankValue(value));
}

function isAmbiguousFillBlank(task: Extract<RuntimeTask, { type: "fill_blank" }>) {
  const answer = normalizeFillBlankValue(task.acceptedAnswers[0] ?? "");

  if (!answer || isGrammarEndingValue(answer)) {
    return false;
  }

  return (
    /___\s*(입니다|입니까|이에요|예요)/.test(task.koreanText) ||
    /^\s*___/.test(task.koreanText) ||
    /___\s*$/.test(task.koreanText)
  );
}

function isAmbiguousGrammarSelect(task: Extract<RuntimeTask, { type: "grammar_select" }>) {
  if (isGrammarEndingValue(task.answer)) {
    return false;
  }

  return /___/.test(task.koreanText);
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function validateTaskOrder(unit: RuntimeUnit) {
  unit.lessons.forEach((lesson) => {
    lesson.tasks.reduce((previous, task) => {
      const rank = STAGE_ORDER[task.stage];
      if (rank < previous) {
        throw new Error(`${lesson.lessonId} breaks difficulty order at task ${task.id}.`);
      }
      return rank;
    }, -1);
  });
}

function validateChoiceAnswers(unit: RuntimeUnit) {
  unit.lessons.forEach((lesson) => {
    lesson.tasks.forEach((task) => {
      if ((task.type === "word_match" || task.type === "listen_select") && !task.choices.some((choice) => choice.id === task.answer)) {
        throw new Error(`${task.id} answer is missing from choices.`);
      }

      if (task.type === "grammar_select" && !task.choices.includes(task.answer)) {
        throw new Error(`${task.id} grammar answer is missing from choices.`);
      }

      if (
        task.type === "fill_blank" &&
        task.choices?.length &&
        !task.choices.some((choice) =>
          task.acceptedAnswers.some(
            (acceptedAnswer) =>
              normalizeFillBlankValue(choice) === normalizeFillBlankValue(acceptedAnswer),
          ),
        )
      ) {
        throw new Error(`${task.id} fill-blank answer is missing from choices.`);
      }
    });
  });
}

function validateFillBlankSolvability(unit: RuntimeUnit) {
  unit.lessons.forEach((lesson) => {
    lesson.tasks.forEach((task) => {
      if (task.type !== "fill_blank") {
        return;
      }

      if (
        isAmbiguousFillBlank(task) &&
        (!task.clue || !task.clue.vi.trim()) &&
        (!task.choices || task.choices.length < 2)
      ) {
        throw new Error(
          `${task.id} is an ambiguous fill-blank and must provide a clue or fixed choices.`,
        );
      }
    });
  });
}

function validateGrammarSelectSolvability(unit: RuntimeUnit) {
  unit.lessons.forEach((lesson) => {
    lesson.tasks.forEach((task) => {
      if (task.type !== "grammar_select") {
        return;
      }

      if (
        isAmbiguousGrammarSelect(task) &&
        !task.supportText?.vi.trim() &&
        !task.supportText?.en.trim() &&
        !task.audioText?.trim() &&
        !task.audioUrl?.trim()
      ) {
        throw new Error(
          `${task.id} is an ambiguous grammar-select task and must provide meaning support or audio context.`,
        );
      }
    });
  });
}

function validateSourceContent(source: SourceUnit, options?: { requireCompileable?: boolean }) {
  if (source.textbook.vocab.length === 0 || source.textbook.grammar.length === 0 || source.textbook.dialogue.length === 0 || source.textbook.examples.length === 0) {
    throw new Error("Source unit must contain textbook vocab, grammar, dialogue, and examples.");
  }

  const exerciseCount = options?.requireCompileable
    ? source.workbook.exercises.filter((exercise) => !exercise.needsReview).length
    : source.workbook.exercises.length;

  if (exerciseCount < 18) {
    throw new Error(
      `Normalized workbook must contain at least 18 ${options?.requireCompileable ? "compileable " : ""}exercises. Found ${exerciseCount}.`,
    );
  }

  source.workbook.exercises.forEach((exercise) => {
    if (!exercise.sourceRef.rawText.trim()) {
      throw new Error(`${exercise.id} is missing raw OCR/source text.`);
    }

    if (exercise.audioAssetId && !source.workbook.audioAssets.some((asset) => asset.id === exercise.audioAssetId)) {
      throw new Error(`${exercise.id} references missing audio asset ${exercise.audioAssetId}.`);
    }
  });
}

function validateRawDraft(rawDraft: RawUnitDraft, reviewedSource: SourceUnit) {
  const workbookPages = new Set(
    rawDraft.blocks.filter((block) => block.document === "workbook").map((block) => block.page),
  );
  const workbookIssuePages = new Set(
    rawDraft.pageIssues
      .filter((issue) => issue.document === "workbook")
      .map((issue) => issue.page),
  );

  for (
    let page = reviewedSource.sourceDocuments.workbook.unitPages.startPage;
    page <= reviewedSource.sourceDocuments.workbook.unitPages.endPage;
    page += 1
  ) {
    if (!workbookPages.has(page) && !workbookIssuePages.has(page)) {
      throw new Error(`Workbook page ${page} is missing both raw blocks and needsReview/pageIssue coverage.`);
    }
  }

  reviewedSource.workbook.audioAssets.forEach((asset) => {
    const hasQrTrace = rawDraft.qrDetections.some(
      (detection) => detection.page === asset.page && detection.qrValue === asset.qrValue,
    );
    const hasPageIssue = rawDraft.pageIssues.some(
      (issue) =>
        issue.document === "workbook" &&
        issue.page === asset.page &&
        issue.reason.toLowerCase().includes("qr"),
    );

    if (!hasQrTrace && !hasPageIssue) {
      throw new Error(`Workbook listening page ${asset.page} is missing QR review trace for ${asset.id}.`);
    }
  });
}

function validateLessonRoles(unit: RuntimeUnit) {
  if (unit.lessons[0]?.lessonRole !== "intro") {
    throw new Error("Lesson 1 must be an intro lesson.");
  }

  if (unit.lessons[1]?.lessonRole !== "grammar") {
    throw new Error("Lesson 2 must be a grammar lesson.");
  }

  if (unit.lessons[2]?.lessonRole !== "dialogue") {
    throw new Error("Lesson 3 must be a dialogue lesson.");
  }

  unit.lessons.slice(3, -2).forEach((lesson) => {
    if (lesson.lessonRole !== "workbook_practice") {
      throw new Error(`${lesson.lessonId} must be a workbook practice lesson.`);
    }
  });

  unit.lessons.slice(-2).forEach((lesson) => {
    if (lesson.lessonRole !== "review") {
      throw new Error(`${lesson.lessonId} must be a review lesson.`);
    }
  });
}

function validateCoverage(unit: RuntimeUnit, source: SourceUnit) {
  const eligibleExercises = source.workbook.exercises.filter((exercise) => !exercise.needsReview);
  const nonReviewLessons = unit.lessons.filter((lesson) => lesson.lessonRole !== "review");
  const coveredIds = new Set(nonReviewLessons.flatMap((lesson) => lesson.sourceExerciseIds));
  const directCoverageRatio = coveredIds.size / eligibleExercises.length;

  if (directCoverageRatio < 0.8) {
    throw new Error(`Non-review lessons cover only ${(directCoverageRatio * 100).toFixed(1)}% of workbook exercise IDs.`);
  }

  const nonIntroLessons = unit.lessons.slice(2);
  const totalTasks = nonIntroLessons.reduce((sum, lesson) => sum + lesson.tasks.length, 0);
  const workbookTasks = nonIntroLessons.reduce(
    (sum, lesson) =>
      sum + lesson.tasks.filter((task) => task.source === "workbook" || task.source === "blended").length,
    0,
  );

  if (totalTasks === 0 || workbookTasks / totalTasks < 0.6) {
    throw new Error("Workbook-derived tasks must account for at least 60% of authored tasks outside the first two lessons.");
  }
}

function validateListeningRuntime(unit: RuntimeUnit) {
  unit.lessons.forEach((lesson) => {
    lesson.tasks.forEach((task) => {
      if (task.type === "listen_select" && task.audioUrl && !task.audioUrl.startsWith("/api/audio/")) {
        throw new Error(`${task.id} must use an internal audio proxy URL.`);
      }

      if (
        task.type === "listen_select" &&
        task.choices.filter((choice) => Boolean(choice.imageUrl)).length > 0 &&
        task.choices.length < 2
      ) {
        throw new Error(`${task.id} must provide at least 2 image-capable choices.`);
      }
    });
  });
}

function validateErrorPatternKeys(unit: RuntimeUnit) {
  unit.lessons.forEach((lesson) => {
    lesson.tasks.forEach((task) => {
      if (!task.errorPatternKey.trim()) {
        throw new Error(`${task.id} is missing an errorPatternKey.`);
      }

      if (task.srWeight <= 0) {
        throw new Error(`${task.id} must have a positive srWeight.`);
      }
    });
  });
}

export async function validateCurriculum(options: ValidateOptions) {
  const rawPath = getRawDraftPath(options.unitId);
  const extractedPath = getExtractedSourcePath(options.unitId);
  const reviewedPath = getReviewedSourcePath(options.unitId);
  const runtimePath = getRuntimeUnitPath(options.unitId);
  const indexPath = getGeneratedIndexPath();

  if (await exists(extractedPath)) {
    const extractedSource = sourceUnitSchema.parse(await readJsonFile<SourceUnit>(extractedPath));
    validateSourceContent(extractedSource);
    if (!extractedSource.needsReview) {
      throw new Error("Extracted source should remain reviewable with needsReview=true.");
    }
  }

  const reviewedSource = sourceUnitSchema.parse(await readJsonFile<SourceUnit>(reviewedPath));
  if (reviewedSource.needsReview) {
    throw new Error("Reviewed source file must have needsReview=false.");
  }
  validateSourceContent(reviewedSource, { requireCompileable: true });

  if (await exists(rawPath)) {
    const rawDraft = rawUnitDraftSchema.parse(await readJsonFile<RawUnitDraft>(rawPath));
    validateRawDraft(rawDraft, reviewedSource);
  } else {
    throw new Error(`Missing raw draft file for unit ${options.unitId}.`);
  }

  const runtimeUnit = runtimeUnitSchema.parse(await readJsonFile<RuntimeUnit>(runtimePath));
  const curriculumIndex = curriculumIndexSchema.parse(await readJsonFile(indexPath));

  validateTaskOrder(runtimeUnit);
  validateChoiceAnswers(runtimeUnit);
  validateFillBlankSolvability(runtimeUnit);
  validateGrammarSelectSolvability(runtimeUnit);
  validateLessonRoles(runtimeUnit);
  validateCoverage(runtimeUnit, reviewedSource);
  validateErrorPatternKeys(runtimeUnit);
  validateListeningRuntime(runtimeUnit);

  if (!curriculumIndex.units.some((entry) => entry.id === options.unitId)) {
    throw new Error(`Generated index is missing unit ${options.unitId}.`);
  }

  return {
    rawPath,
    extractedPath,
    reviewedPath,
    runtimePath,
    indexPath,
  };
}
