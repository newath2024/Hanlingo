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
import { resolveSourceListeningItems } from "./listening";

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

      if (
        task.type === "listening" &&
        task.correctChoiceId &&
        !task.choices?.some((choice) => choice.id === task.correctChoiceId)
      ) {
        throw new Error(`${task.id} listening correctChoiceId is missing from choices.`);
      }

      if (
        task.type === "listening" &&
        task.correctOrderChoiceIds?.some(
          (choiceId) => !task.choices?.some((choice) => choice.id === choiceId),
        )
      ) {
        throw new Error(`${task.id} listening correctOrderChoiceIds must exist in choices.`);
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

function validateSourceContent(
  source: SourceUnit,
  options?: {
    requireCompileable?: boolean;
    compileableListeningExerciseIds?: Set<string>;
  },
) {
  if (source.textbook.vocab.length === 0 || source.textbook.grammar.length === 0 || source.textbook.dialogue.length === 0 || source.textbook.examples.length === 0) {
    throw new Error("Source unit must contain textbook vocab, grammar, dialogue, and examples.");
  }

  const exerciseCount = options?.requireCompileable
    ? source.workbook.exercises.filter(
        (exercise) =>
          !exercise.needsReview &&
          (exercise.exerciseType !== "listening" ||
            !exercise.audioAssetId ||
            options.compileableListeningExerciseIds?.has(exercise.id) ||
            false),
      ).length
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

function validateImageBackedVocabSource(source: SourceUnit) {
  const imageBackedVocabIds = new Set(
    source.textbook.vocab
      .filter((entry) => Boolean(entry.imagePath))
      .map((entry) => entry.id),
  );

  source.workbook.exercises.forEach((exercise) => {
    if (exercise.exerciseType !== "matching") {
      return;
    }

    const isPictureMatching =
      exercise.coverageTags.includes("picture") ||
      exercise.prompt.en.toLowerCase().includes("picture");

    if (!isPictureMatching) {
      return;
    }

    const vocabId =
      typeof exercise.metadata.vocabId === "string" ? exercise.metadata.vocabId : undefined;

    if (!vocabId) {
      throw new Error(`${exercise.id} must define metadata.vocabId for picture vocab tasks.`);
    }

    if (!imageBackedVocabIds.has(vocabId)) {
      throw new Error(`${exercise.id} points to ${vocabId}, but that vocab is missing imagePath.`);
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

function validateSections(unit: RuntimeUnit) {
  if (unit.sections.length !== 5) {
    throw new Error(`${unit.unitId} must define exactly 5 sections.`);
  }

  const lessonById = new Map(unit.lessons.map((lesson) => [lesson.lessonId, lesson] as const));
  const seenLessonIds = new Set<string>();

  unit.sections.forEach((section, index) => {
    if (section.order !== index + 1) {
      throw new Error(`${section.sectionId} must have order ${index + 1}.`);
    }

    if (section.lessonIds.length < 2 || section.lessonIds.length > 3) {
      throw new Error(`${section.sectionId} must contain 2-3 lessons.`);
    }

    section.lessonIds.forEach((lessonId) => {
      const lesson = lessonById.get(lessonId);

      if (!lesson) {
        throw new Error(`${section.sectionId} references missing lesson ${lessonId}.`);
      }

      if (seenLessonIds.has(lessonId)) {
        throw new Error(`${lessonId} appears in more than one section.`);
      }

      if (lesson.sectionId !== section.sectionId || lesson.sectionOrder !== section.order) {
        throw new Error(`${lessonId} must point back to ${section.sectionId}.`);
      }

      seenLessonIds.add(lessonId);
    });
  });

  if (seenLessonIds.size !== unit.lessons.length) {
    throw new Error(`${unit.unitId} has lessons that are not assigned to sections.`);
  }
}

function validateCoverage(
  unit: RuntimeUnit,
  source: SourceUnit,
  compileableListeningExerciseIds: Set<string>,
) {
  const readyAudioAssetIds = new Set(
    source.workbook.audioAssets
      .filter((asset) => asset.remoteUrl && !asset.needsReview)
      .map((asset) => asset.id),
  );
  const eligibleExercises = source.workbook.exercises.filter(
    (exercise) =>
      !exercise.needsReview &&
      (exercise.exerciseType === "listening" && exercise.audioAssetId
        ? compileableListeningExerciseIds.has(exercise.id)
        : !exercise.audioAssetId || readyAudioAssetIds.has(exercise.audioAssetId)),
  );
  const coveredIds = new Set(unit.lessons.flatMap((lesson) => lesson.sourceExerciseIds));
  const missingExerciseIds = eligibleExercises
    .map((exercise) => exercise.id)
    .filter((exerciseId) => !coveredIds.has(exerciseId));

  if (missingExerciseIds.length > 0) {
    throw new Error(`Runtime path is missing workbook coverage for: ${missingExerciseIds.join(", ")}.`);
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

function validateQrListeningSections(unit: RuntimeUnit, source: SourceUnit) {
  const readyAudioAssetIds = new Set(
    source.workbook.audioAssets
      .filter((asset) => asset.remoteUrl && !asset.needsReview)
      .map((asset) => asset.id),
  );
  const qrExerciseIds = source.workbook.exercises
    .filter(
      (exercise) =>
        !exercise.needsReview &&
        exercise.coverageTags.includes("qr-listening") &&
        (!exercise.audioAssetId || readyAudioAssetIds.has(exercise.audioAssetId)),
    )
    .map((exercise) => exercise.id);

  if (qrExerciseIds.length === 0) {
    return;
  }

  const listeningSection = unit.sections.find((section) => section.order === 4);

  if (!listeningSection) {
    throw new Error(`${unit.unitId} is missing section 4 for QR listening.`);
  }

  const listeningLessonIds = new Set(listeningSection.lessonIds);
  const qrInListeningSection = new Set(
    unit.lessons
      .filter((lesson) => listeningLessonIds.has(lesson.lessonId))
      .flatMap((lesson) => lesson.sourceExerciseIds.filter((exerciseId) => qrExerciseIds.includes(exerciseId))),
  );
  const qrOutsideListeningSection = unit.lessons
    .filter((lesson) => !listeningLessonIds.has(lesson.lessonId))
    .flatMap((lesson) => lesson.sourceExerciseIds.filter((exerciseId) => qrExerciseIds.includes(exerciseId)));

  const missingQrIds = qrExerciseIds.filter((exerciseId) => !qrInListeningSection.has(exerciseId));

  if (missingQrIds.length > 0) {
    throw new Error(`Section 4 is missing QR listening exercises: ${missingQrIds.join(", ")}.`);
  }

  if (qrOutsideListeningSection.length > 0) {
    throw new Error(
      `QR listening exercises must stay inside section 4 only. Found outside: ${[...new Set(qrOutsideListeningSection)].join(", ")}.`,
    );
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

      if (task.type !== "listening") {
        return;
      }

      if (!task.audioUrl.startsWith("/api/audio/")) {
        throw new Error(`${task.id} must use an internal audio proxy URL.`);
      }

      if (!task.prompt.vi.trim() || !task.prompt.en.trim()) {
        throw new Error(`${task.id} is missing listening prompt text.`);
      }

      const hasStart = typeof task.clipStartMs === "number";
      const hasEnd = typeof task.clipEndMs === "number";

      if (hasStart !== hasEnd) {
        throw new Error(`${task.id} must provide clipStartMs and clipEndMs together.`);
      }

      if (hasStart && hasEnd && task.clipStartMs! >= task.clipEndMs!) {
        throw new Error(`${task.id} clipStartMs must be less than clipEndMs.`);
      }

      const answerTargetCount =
        (task.correctChoiceId ? 1 : 0) +
        ((task.correctText || task.acceptedAnswers?.length) ? 1 : 0) +
        ((task.correctOrderChoiceIds?.length ?? 0) > 0 ? 1 : 0);

      if (answerTargetCount !== 1) {
        throw new Error(`${task.id} must define exactly one listening answer target.`);
      }

      if (
        (task.listeningType === "multiple_choice" ||
          task.listeningType === "choose_image" ||
          task.listeningType === "yes_no") &&
        (task.choices?.length ?? 0) < 2
      ) {
        throw new Error(`${task.id} must provide at least 2 listening choices.`);
      }

      if (task.listeningType === "yes_no" && (task.choices?.length ?? 0) !== 2) {
        throw new Error(`${task.id} yes_no listening tasks must provide exactly 2 choices.`);
      }

      if (
        task.listeningType === "choose_image" &&
        task.choices?.some((choice) => !choice.imageUrl?.trim())
      ) {
        throw new Error(`${task.id} choose_image listening tasks require image choices.`);
      }

      if (
        task.listeningType === "fill_blank" &&
        !task.correctText?.trim() &&
        !(task.acceptedAnswers?.length ?? 0)
      ) {
        throw new Error(`${task.id} fill_blank listening tasks require correctText or acceptedAnswers.`);
      }

      if (
        task.listeningType === "order_step" &&
        ((task.correctOrderChoiceIds?.length ?? 0) < 2 || (task.choices?.length ?? 0) < 2)
      ) {
        throw new Error(`${task.id} order_step listening tasks require choices and correct order schema.`);
      }
    });
  });
}

function validateImageCardRuntime(unit: RuntimeUnit) {
  unit.lessons.forEach((lesson) => {
    lesson.tasks.forEach((task) => {
      if (
        (task.type !== "word_match" && task.type !== "listen_select") ||
        task.presentation !== "image_cards"
      ) {
        return;
      }

      if (task.choices.length !== 4) {
        throw new Error(`${task.id} must provide exactly 4 image-card choices.`);
      }

      if (
        !task.choices.every(
          (choice) => Boolean(choice.imageUrl?.trim()) && Boolean(choice.koreanLabel?.trim()),
        )
      ) {
        throw new Error(`${task.id} image-card choices must include imageUrl and koreanLabel.`);
      }

      if (
        task.type === "word_match" &&
        (!task.questionText?.vi?.trim() || !task.questionText?.en?.trim())
      ) {
        throw new Error(`${task.id} must provide questionText for image-card word match.`);
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
  const resolvedListening = resolveSourceListeningItems(reviewedSource);
  const readyAudioAssetIds = new Set(
    reviewedSource.workbook.audioAssets
      .filter((asset) => asset.remoteUrl && !asset.needsReview)
      .map((asset) => asset.id),
  );
  const compileableListeningExerciseIds = new Set(
    resolvedListening.items
      .filter((item) => !item.needsReview && readyAudioAssetIds.has(item.audioAssetId))
      .flatMap((item) => item.sourceExerciseIds),
  );

  if (reviewedSource.needsReview) {
    throw new Error("Reviewed source file must have needsReview=false.");
  }
  validateSourceContent(reviewedSource, {
    requireCompileable: true,
    compileableListeningExerciseIds,
  });
  validateImageBackedVocabSource(reviewedSource);

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
  validateSections(runtimeUnit);
  validateLessonRoles(runtimeUnit);
  validateCoverage(runtimeUnit, reviewedSource, compileableListeningExerciseIds);
  validateQrListeningSections(runtimeUnit, reviewedSource);
  validateErrorPatternKeys(runtimeUnit);
  validateListeningRuntime(runtimeUnit);
  validateImageCardRuntime(runtimeUnit);

  if (!curriculumIndex.units.some((entry) => entry.id === options.unitId)) {
    throw new Error(`Generated index is missing unit ${options.unitId}.`);
  }

  return {
    rawPath,
    extractedPath,
    reviewedPath,
    runtimePath,
    indexPath,
    warnings: resolvedListening.warnings,
  };
}
