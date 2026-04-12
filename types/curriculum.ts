export type LocalizedText = {
  vi: string;
  en: string;
};

export type MeaningDirection = "meaning_to_ko" | "ko_to_meaning";
export type InteractionMode = "word_bank" | "hybrid" | "full_input";
export type ChoicePresentation = "default" | "image_cards";

export type SourceBoundaryMode = "configured_page_spans" | "pdf_text_layer";
export type ExtractionMode =
  | "manual_seed"
  | "seeded_raw_blocks"
  | "text_layer"
  | "openai_vision";
export type CurriculumSource = "textbook" | "workbook" | "blended";
export type CurriculumStage =
  | "recognition"
  | "recall"
  | "construction"
  | "production";
export type LessonRole =
  | "intro"
  | "grammar"
  | "dialogue"
  | "workbook_practice"
  | "review";
export type SourceDocumentRole = "textbook" | "workbook";
export type SourceBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type SourceBlockKind =
  | "vocab"
  | "grammar"
  | "dialogue"
  | "example"
  | "exercise"
  | "unknown";

export type SourcePageRange = {
  startPage: number;
  endPage: number;
};

export type SourceCaptureRef = {
  rawText: string;
  confidence: number;
  sourceBlockId: string;
  page: number;
};

export type SourceDocumentInfo = {
  fileName: string;
  totalPages: number;
  unitPages: SourcePageRange;
  boundarySource: SourceBoundaryMode;
  hasTextLayer: boolean;
  textPagesDetected: number;
};

export type SourceVocabEntry = {
  id: string;
  korean: string;
  translations: LocalizedText;
  romanization?: string;
  imagePath?: string;
  pages: SourcePageRange;
  sourceRef: SourceCaptureRef;
  needsReview: boolean;
};

export type SourceDialogueLine = {
  id: string;
  speaker: string;
  korean: string;
  translations: LocalizedText;
  pages: SourcePageRange;
  sourceRef: SourceCaptureRef;
  needsReview: boolean;
};

export type SourceExampleSentence = {
  id: string;
  korean: string;
  translations: LocalizedText;
  grammarTags: string[];
  pages: SourcePageRange;
  sourceRef: SourceCaptureRef;
  needsReview: boolean;
};

export type SourceGrammarPoint = {
  id: string;
  pattern: string;
  explanation: LocalizedText;
  exampleIds: string[];
  pages: SourcePageRange;
  sourceRef: SourceCaptureRef;
  needsReview: boolean;
};

export type SourceAudioAsset = {
  id: string;
  document: SourceDocumentRole;
  page: number;
  qrValue: string;
  remoteUrl?: string;
  mimeType?: string;
  transcript?: string;
  transcriptConfidence?: number;
  needsReview: boolean;
};

export type SourceExerciseOption = {
  id: string;
  label?: LocalizedText;
  imagePath?: string;
  correct: boolean;
};

export type ListeningExerciseType =
  | "yes_no"
  | "multiple_choice"
  | "choose_image"
  | "fill_blank"
  | "order_step";

export type ListeningDifficulty = "easy" | "medium" | "hard";

export type SourceListeningChoice = {
  id: string;
  text: LocalizedText;
  imagePath?: string;
};

export type SourceListeningItem = {
  id: string;
  sourceExerciseIds: string[];
  audioAssetId: string;
  clipStartMs?: number;
  clipEndMs?: number;
  type: ListeningExerciseType;
  prompt: LocalizedText;
  questionText?: LocalizedText;
  transcriptKo?: string;
  translation?: LocalizedText;
  romanization?: string;
  contextGroupId?: string;
  contextTitle?: LocalizedText;
  contextSummary?: LocalizedText;
  choices?: SourceListeningChoice[];
  correctChoiceId?: string;
  correctText?: string;
  acceptedAnswers?: string[];
  correctOrderChoiceIds?: string[];
  coverageTags: string[];
  difficulty: ListeningDifficulty;
  pages: SourcePageRange;
  sourceRef: SourceCaptureRef;
  needsReview: boolean;
};

export type WorkbookExerciseType =
  | "fill_blank"
  | "matching"
  | "sentence_ordering"
  | "translation"
  | "listening"
  | "writing";

export type WorkbookExerciseMetadataValue =
  | string
  | number
  | boolean
  | string[]
  | number[];

export type SourceWorkbookExercise = {
  id: string;
  exerciseType: WorkbookExerciseType;
  prompt: LocalizedText;
  koreanText?: string;
  localizedText?: LocalizedText;
  answer: string | string[];
  audioAssetId?: string;
  options?: SourceExerciseOption[];
  metadata: Record<string, WorkbookExerciseMetadataValue>;
  coverageTags: string[];
  pages: SourcePageRange;
  sourceRef: SourceCaptureRef;
  needsReview: boolean;
};

export type SourceUnit = {
  unitId: string;
  unitNumber: number;
  title: LocalizedText;
  needsReview: boolean;
  extractionMode: ExtractionMode;
  sourceDocuments: {
    textbook: SourceDocumentInfo;
    workbook: SourceDocumentInfo;
  };
  textbook: {
    vocab: SourceVocabEntry[];
    grammar: SourceGrammarPoint[];
    dialogue: SourceDialogueLine[];
    examples: SourceExampleSentence[];
  };
  workbook: {
    audioAssets: SourceAudioAsset[];
    exercises: SourceWorkbookExercise[];
    listeningItems: SourceListeningItem[];
  };
  reviewNotes: string[];
};

export type RawSourceBlock = {
  id: string;
  document: SourceDocumentRole;
  page: number;
  kind: SourceBlockKind;
  text: string;
  confidence: number;
  sourceItemId?: string;
  needsReview: boolean;
};

export type RawDraftPageIssue = {
  document: SourceDocumentRole;
  page: number;
  reason: string;
};

export type RawQrDetection = {
  id: string;
  document: SourceDocumentRole;
  page: number;
  qrValue: string;
  bounds: SourceBounds;
  resolvedUrl?: string;
  needsReview: boolean;
};

export type RawImageCrop = {
  id: string;
  document: SourceDocumentRole;
  page: number;
  label: string;
  imagePath: string;
  bounds: SourceBounds;
  sourceItemId?: string;
  needsReview: boolean;
};

export type RawUnitDraft = {
  unitId: string;
  unitNumber: number;
  extractionMode: ExtractionMode;
  blocks: RawSourceBlock[];
  qrDetections: RawQrDetection[];
  imageCrops: RawImageCrop[];
  pageIssues: RawDraftPageIssue[];
  reviewNotes: string[];
};

export type LocalizedChoice = {
  id: string;
  text: LocalizedText;
  imageUrl?: string;
  koreanLabel?: string;
};

export type GlossSegment = {
  textKo: string;
  meaningEn: string;
  meaningVi: string;
};

export type RuntimeTaskBase = {
  id: string;
  prompt: LocalizedText;
  explanation: LocalizedText;
  source: CurriculumSource;
  stage: CurriculumStage;
  grammarTags: string[];
  srWeight: number;
  errorPatternKey: string;
  supportText?: LocalizedText;
  audioText?: string;
  audioUrl?: string;
  interactionMode?: InteractionMode;
  sentenceKey?: string;
};

export type WordMatchTask = RuntimeTaskBase & {
  type: "word_match";
  koreanText: string;
  choices: LocalizedChoice[];
  answer: string;
  presentation?: ChoicePresentation;
  questionText?: LocalizedText;
};

export type ListenSelectTask = RuntimeTaskBase & {
  type: "listen_select";
  choices: LocalizedChoice[];
  answer: string;
  presentation?: ChoicePresentation;
  questionText?: LocalizedText;
};

export type TranslateTask = RuntimeTaskBase & {
  type: "translate";
  direction: MeaningDirection;
  meaning: LocalizedText;
  koreanText?: string;
  acceptedAnswers?: string[];
  placeholder?: LocalizedText;
};

export type ArrangeSentenceTask = RuntimeTaskBase & {
  type: "arrange_sentence";
  meaning: LocalizedText;
  wordBank: string[];
  answer: string[];
};

export type FillBlankTask = RuntimeTaskBase & {
  type: "fill_blank";
  koreanText: string;
  acceptedAnswers: string[];
  choices?: string[];
  placeholder?: LocalizedText;
  clue?: LocalizedText;
};

export type GrammarSelectTask = RuntimeTaskBase & {
  type: "grammar_select";
  koreanText: string;
  choices: string[];
  answer: string;
};

export type DialogueReconstructTask = RuntimeTaskBase & {
  type: "dialogue_reconstruct";
  speaker: string;
  translation: LocalizedText;
  wordBank: string[];
  answer: string[];
};

export type SpeakingTask = RuntimeTaskBase & {
  type: "speaking";
  koreanText: string;
  expectedSpeech: string;
  glossSegments?: GlossSegment[];
};

export type ListeningTask = RuntimeTaskBase & {
  type: "listening";
  listeningType: ListeningExerciseType;
  audioUrl: string;
  clipStartMs?: number;
  clipEndMs?: number;
  questionText?: LocalizedText;
  transcriptKo?: string;
  translation?: LocalizedText;
  romanization?: string;
  contextGroupId?: string;
  contextTitle?: LocalizedText;
  contextSummary?: LocalizedText;
  choices?: LocalizedChoice[];
  correctChoiceId?: string;
  correctText?: string;
  acceptedAnswers?: string[];
  correctOrderChoiceIds?: string[];
};

export type RuntimeTask =
  | WordMatchTask
  | ListenSelectTask
  | TranslateTask
  | ArrangeSentenceTask
  | FillBlankTask
  | GrammarSelectTask
  | DialogueReconstructTask
  | SpeakingTask
  | ListeningTask;

export type RuntimeLesson = {
  lessonId: string;
  sectionId: string;
  sectionOrder: number;
  lessonRole: LessonRole;
  title: LocalizedText;
  summary: LocalizedText;
  difficulty: LocalizedText;
  focusConcepts: string[];
  sourceExerciseIds: string[];
  coverageTags: string[];
  tasks: RuntimeTask[];
};

export type RuntimeUnitSection = {
  sectionId: string;
  order: number;
  title: LocalizedText;
  summary: LocalizedText;
  lessonIds: string[];
};

export type RuntimeUnit = {
  unitId: string;
  unitNumber: number;
  title: LocalizedText;
  subtitle: LocalizedText;
  reviewWords: string[];
  sections: RuntimeUnitSection[];
  lessons: RuntimeLesson[];
};

export type CurriculumIndex = {
  units: Array<{
    id: string;
    file: string;
  }>;
};
