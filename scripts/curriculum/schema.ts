import { z } from "zod";

const localizedTextSchema = z.object({
  vi: z.string().min(1),
  en: z.string().min(1),
});

const pageRangeSchema = z.object({
  startPage: z.number().int().positive(),
  endPage: z.number().int().positive(),
});

const sourceCaptureRefSchema = z.object({
  rawText: z.string().min(1),
  confidence: z.number().min(0).max(1),
  sourceBlockId: z.string().min(1),
  page: z.number().int().positive(),
});

const sourceBoundsSchema = z.object({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
});

const sourceDocumentInfoSchema = z.object({
  fileName: z.string().min(1),
  totalPages: z.number().int().positive(),
  unitPages: pageRangeSchema,
  boundarySource: z.enum(["configured_page_spans", "pdf_text_layer"]),
  hasTextLayer: z.boolean(),
  textPagesDetected: z.number().int().nonnegative(),
});

const sourceVocabEntrySchema = z.object({
  id: z.string().min(1),
  korean: z.string().min(1),
  translations: localizedTextSchema,
  romanization: z.string().optional(),
  pages: pageRangeSchema,
  sourceRef: sourceCaptureRefSchema,
  needsReview: z.boolean(),
});

const sourceDialogueLineSchema = z.object({
  id: z.string().min(1),
  speaker: z.string().min(1),
  korean: z.string().min(1),
  translations: localizedTextSchema,
  pages: pageRangeSchema,
  sourceRef: sourceCaptureRefSchema,
  needsReview: z.boolean(),
});

const sourceExampleSchema = z.object({
  id: z.string().min(1),
  korean: z.string().min(1),
  translations: localizedTextSchema,
  grammarTags: z.array(z.string().min(1)),
  pages: pageRangeSchema,
  sourceRef: sourceCaptureRefSchema,
  needsReview: z.boolean(),
});

const sourceGrammarPointSchema = z.object({
  id: z.string().min(1),
  pattern: z.string().min(1),
  explanation: localizedTextSchema,
  exampleIds: z.array(z.string().min(1)).min(1),
  pages: pageRangeSchema,
  sourceRef: sourceCaptureRefSchema,
  needsReview: z.boolean(),
});

const sourceAudioAssetSchema = z.object({
  id: z.string().min(1),
  document: z.enum(["textbook", "workbook"]),
  page: z.number().int().positive(),
  qrValue: z.string().min(1),
  remoteUrl: z.string().url().optional(),
  mimeType: z.string().min(1).optional(),
  transcript: z.string().min(1).optional(),
  transcriptConfidence: z.number().min(0).max(1).optional(),
  needsReview: z.boolean(),
});

const sourceExerciseOptionSchema = z.object({
  id: z.string().min(1),
  label: localizedTextSchema.optional(),
  imagePath: z.string().min(1).optional(),
  correct: z.boolean(),
});

const workbookMetadataValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(z.number()),
]);

const workbookExerciseSchema = z.object({
  id: z.string().min(1),
  exerciseType: z.enum([
    "fill_blank",
    "matching",
    "sentence_ordering",
    "translation",
    "listening",
    "writing",
  ]),
  prompt: localizedTextSchema,
  koreanText: z.string().optional(),
  localizedText: localizedTextSchema.optional(),
  answer: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  audioAssetId: z.string().min(1).optional(),
  options: z.array(sourceExerciseOptionSchema).min(2).optional(),
  metadata: z.record(z.string(), workbookMetadataValueSchema),
  coverageTags: z.array(z.string().min(1)).min(1),
  pages: pageRangeSchema,
  sourceRef: sourceCaptureRefSchema,
  needsReview: z.boolean(),
});

export const sourceUnitSchema = z.object({
  unitId: z.string().min(1),
  unitNumber: z.number().int().positive(),
  title: localizedTextSchema,
  needsReview: z.boolean(),
  extractionMode: z.enum([
    "manual_seed",
    "seeded_raw_blocks",
    "text_layer",
    "openai_vision",
  ]),
  sourceDocuments: z.object({
    textbook: sourceDocumentInfoSchema,
    workbook: sourceDocumentInfoSchema,
  }),
  textbook: z.object({
    vocab: z.array(sourceVocabEntrySchema).min(1),
    grammar: z.array(sourceGrammarPointSchema).min(1),
    dialogue: z.array(sourceDialogueLineSchema).min(1),
    examples: z.array(sourceExampleSchema).min(1),
  }),
  workbook: z.object({
    audioAssets: z.array(sourceAudioAssetSchema),
    exercises: z.array(workbookExerciseSchema).min(1),
  }),
  reviewNotes: z.array(z.string().min(1)),
});

const rawSourceBlockSchema = z.object({
  id: z.string().min(1),
  document: z.enum(["textbook", "workbook"]),
  page: z.number().int().positive(),
  kind: z.enum(["vocab", "grammar", "dialogue", "example", "exercise", "unknown"]),
  text: z.string().min(1),
  confidence: z.number().min(0).max(1),
  sourceItemId: z.string().min(1).optional(),
  needsReview: z.boolean(),
});

const rawDraftPageIssueSchema = z.object({
  document: z.enum(["textbook", "workbook"]),
  page: z.number().int().positive(),
  reason: z.string().min(1),
});

const rawQrDetectionSchema = z.object({
  id: z.string().min(1),
  document: z.enum(["textbook", "workbook"]),
  page: z.number().int().positive(),
  qrValue: z.string().min(1),
  bounds: sourceBoundsSchema,
  resolvedUrl: z.string().url().optional(),
  needsReview: z.boolean(),
});

const rawImageCropSchema = z.object({
  id: z.string().min(1),
  document: z.enum(["textbook", "workbook"]),
  page: z.number().int().positive(),
  label: z.string().min(1),
  imagePath: z.string().min(1),
  bounds: sourceBoundsSchema,
  sourceItemId: z.string().min(1).optional(),
  needsReview: z.boolean(),
});

export const rawUnitDraftSchema = z.object({
  unitId: z.string().min(1),
  unitNumber: z.number().int().positive(),
  extractionMode: z.enum([
    "manual_seed",
    "seeded_raw_blocks",
    "text_layer",
    "openai_vision",
  ]),
  blocks: z.array(rawSourceBlockSchema).min(1),
  qrDetections: z.array(rawQrDetectionSchema),
  imageCrops: z.array(rawImageCropSchema),
  pageIssues: z.array(rawDraftPageIssueSchema),
  reviewNotes: z.array(z.string().min(1)),
});

const runtimeTaskBaseSchema = z.object({
  id: z.string().min(1),
  prompt: localizedTextSchema,
  explanation: localizedTextSchema,
  source: z.enum(["textbook", "workbook", "blended"]),
  stage: z.enum(["recognition", "recall", "construction", "production"]),
  grammarTags: z.array(z.string()),
  srWeight: z.number().positive(),
  errorPatternKey: z.string().min(1),
  supportText: localizedTextSchema.optional(),
  audioText: z.string().optional(),
  audioUrl: z.string().min(1).optional(),
});

const localizedChoiceSchema = z.object({
  id: z.string().min(1),
  text: localizedTextSchema,
  imageUrl: z.string().min(1).optional(),
});

const wordMatchTaskSchema = runtimeTaskBaseSchema.extend({
  type: z.literal("word_match"),
  koreanText: z.string().min(1),
  choices: z.array(localizedChoiceSchema).min(2),
  answer: z.string().min(1),
});

const listenSelectTaskSchema = runtimeTaskBaseSchema.extend({
  type: z.literal("listen_select"),
  choices: z.array(localizedChoiceSchema).min(2),
  answer: z.string().min(1),
});

const translateTaskSchema = runtimeTaskBaseSchema.extend({
  type: z.literal("translate"),
  direction: z.enum(["meaning_to_ko", "ko_to_meaning"]),
  meaning: localizedTextSchema,
  koreanText: z.string().optional(),
  acceptedAnswers: z.array(z.string().min(1)).min(1).optional(),
  placeholder: localizedTextSchema.optional(),
});

const arrangeSentenceTaskSchema = runtimeTaskBaseSchema.extend({
  type: z.literal("arrange_sentence"),
  meaning: localizedTextSchema,
  wordBank: z.array(z.string().min(1)).min(2),
  answer: z.array(z.string().min(1)).min(1),
});

const fillBlankTaskSchema = runtimeTaskBaseSchema.extend({
  type: z.literal("fill_blank"),
  koreanText: z.string().min(1),
  acceptedAnswers: z.array(z.string().min(1)).min(1),
  choices: z.array(z.string().min(1)).min(2).optional(),
  placeholder: localizedTextSchema.optional(),
  clue: localizedTextSchema.optional(),
});

const grammarSelectTaskSchema = runtimeTaskBaseSchema.extend({
  type: z.literal("grammar_select"),
  koreanText: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2),
  answer: z.string().min(1),
});

const dialogueReconstructTaskSchema = runtimeTaskBaseSchema.extend({
  type: z.literal("dialogue_reconstruct"),
  speaker: z.string().min(1),
  translation: localizedTextSchema,
  wordBank: z.array(z.string().min(1)).min(2),
  answer: z.array(z.string().min(1)).min(1),
});

const speakingTaskSchema = runtimeTaskBaseSchema.extend({
  type: z.literal("speaking"),
  koreanText: z.string().min(1),
  expectedSpeech: z.string().min(1),
});

export const runtimeTaskSchema = z.discriminatedUnion("type", [
  wordMatchTaskSchema,
  listenSelectTaskSchema,
  translateTaskSchema,
  arrangeSentenceTaskSchema,
  fillBlankTaskSchema,
  grammarSelectTaskSchema,
  dialogueReconstructTaskSchema,
  speakingTaskSchema,
]);

export const runtimeLessonSchema = z.object({
  lessonId: z.string().min(1),
  lessonRole: z.enum(["intro", "grammar", "dialogue", "workbook_practice", "review"]),
  title: localizedTextSchema,
  summary: localizedTextSchema,
  difficulty: localizedTextSchema,
  focusConcepts: z.array(z.string().min(1)),
  sourceExerciseIds: z.array(z.string().min(1)),
  coverageTags: z.array(z.string().min(1)),
  tasks: z.array(runtimeTaskSchema).min(8).max(12),
});

export const runtimeUnitSchema = z.object({
  unitId: z.string().min(1),
  unitNumber: z.number().int().positive(),
  title: localizedTextSchema,
  subtitle: localizedTextSchema,
  reviewWords: z.array(z.string().min(1)).min(1),
  lessons: z.array(runtimeLessonSchema).min(8).max(16),
});

export const curriculumIndexSchema = z.object({
  units: z.array(
    z.object({
      id: z.string().min(1),
      file: z.string().min(1),
    }),
  ),
});

const exerciseDifficultySchema = z.enum(["easy", "medium", "hard"]);

const exerciseBaseSchema = z.object({
  id: z.string().min(1),
  focus: z.array(z.string().min(1)).min(1),
  prompt: z.string().min(1),
  difficulty: exerciseDifficultySchema,
});

const wordMatchExerciseSchema = exerciseBaseSchema.extend({
  type: z.literal("word_match"),
  skill: z.literal("vocab"),
  pairs: z
    .array(
      z.object({
        left: z.string().min(1),
        right: z.string().min(1),
      }),
    )
    .min(1),
  answer: z.array(z.tuple([z.string().min(1), z.string().min(1)])).min(1),
});

const fillBlankExerciseSchema = exerciseBaseSchema.extend({
  type: z.literal("fill_blank"),
  skill: z.literal("grammar"),
  question: z.string().min(1),
  blank_count: z.literal(1),
  choices: z.array(z.string().min(1)).min(3),
  answer: z.array(z.string().min(1)).length(1),
  explanation: z.string().min(1),
});

const sentenceBuildExerciseSchema = exerciseBaseSchema.extend({
  type: z.literal("sentence_build"),
  skill: z.literal("sentence"),
  target_meaning: z.string().min(1),
  tokens: z.array(z.string().min(1)).min(2),
  distractors: z.array(z.string().min(1)),
  answer: z.string().min(1),
});

const reorderSentenceExerciseSchema = exerciseBaseSchema.extend({
  type: z.literal("reorder_sentence"),
  skill: z.literal("word_order"),
  scrambled_tokens: z.array(z.string().min(1)).min(2),
  answer_tokens: z.array(z.string().min(1)).min(2),
  answer: z.string().min(1),
});

const translationSelectExerciseSchema = exerciseBaseSchema.extend({
  type: z.literal("translation_select"),
  skill: z.literal("reading"),
  question: z.string().min(1),
  choices: z.array(z.string().min(1)).min(3),
  answer: z.string().min(1),
});

const dialogueResponseExerciseSchema = exerciseBaseSchema.extend({
  type: z.literal("dialogue_response"),
  skill: z.literal("conversation"),
  context: z
    .array(
      z.object({
        speaker: z.string().min(1),
        text: z.string().min(1),
      }),
    )
    .length(2),
  choices: z.array(z.string().min(1)).min(3),
  answer: z.string().min(1),
});

const listenRepeatExerciseSchema = exerciseBaseSchema.extend({
  type: z.literal("listen_repeat"),
  skill: z.literal("speaking"),
  text: z.string().min(1),
  tts_text: z.string().min(1),
  expected_chunks: z.array(z.string().min(1)).min(1),
  pass_rule: z.object({
    mode: z.literal("chunk_match"),
    min_correct_chunks: z.number().int().positive(),
  }),
});

export const unitExerciseSchema = z.discriminatedUnion("type", [
  wordMatchExerciseSchema,
  fillBlankExerciseSchema,
  sentenceBuildExerciseSchema,
  reorderSentenceExerciseSchema,
  translationSelectExerciseSchema,
  dialogueResponseExerciseSchema,
  listenRepeatExerciseSchema,
]);

export const exerciseStageSchema = z.object({
  stage_id: z.string().regex(/^u\d{2}_s0[1-3]$/),
  stage_goal: z.string().min(1),
  exercises: z.array(unitExerciseSchema).min(3).max(5),
});

export const unitExerciseSetSchema = z.object({
  unit_id: z.string().min(1),
  unit_title: z.string().min(1),
  stages: z.array(exerciseStageSchema).length(3),
});
