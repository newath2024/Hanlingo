import path from "node:path";
import type {
  ExtractionMode,
  RawImageCrop,
  RawQrDetection,
  RawSourceBlock,
  RawUnitDraft,
  SourceBlockKind,
  SourceDocumentRole,
  SourceUnit,
} from "@/types/curriculum";
import { createUnit1SourceSeed, UNIT_1_PAGE_SPANS } from "./manual-unit-1";
import { createUnit16SourceSeed, UNIT_16_PAGE_SPANS } from "./manual-unit-16";
import { createUnit17SourceSeed, UNIT_17_PAGE_SPANS } from "./manual-unit-17";
import {
  getExtractedSourcePath,
  getRawDraftPath,
  getReviewedSourcePath,
  writeJsonFile,
} from "./io";
import { inspectPdf, resolvePdfFiles } from "./pdf";
import { extractWorkbookListeningArtifacts } from "./qr-listening";
import { UNIT_1_QR_SEED } from "./unit-1-qr-seed";
import { UNIT_16_QR_SEED } from "./unit-16-qr-seed";
import { UNIT_17_QR_SEED } from "./unit-17-qr-seed";
import type { UnitQrSeedDefinition } from "./qr-seed";
import { maybeExtractVisionBlocks } from "./vision";

type ExtractOptions = {
  cwd: string;
  emitReviewedSeed?: boolean;
  unitId?: string;
};

type PageSpans = {
  textbook: {
    startPage: number;
    endPage: number;
  };
  workbook: {
    startPage: number;
    endPage: number;
  };
};

type SeedUnitConfig = {
  unitId: string;
  unitLabel: string;
  pageSpans: PageSpans;
  createSourceSeed: typeof createUnit1SourceSeed;
  qrSeed: UnitQrSeedDefinition;
};

const SEEDED_UNIT_CONFIGS: Record<string, SeedUnitConfig> = {
  "1": {
    unitId: "1",
    unitLabel: "Unit 1",
    pageSpans: UNIT_1_PAGE_SPANS,
    createSourceSeed: createUnit1SourceSeed,
    qrSeed: UNIT_1_QR_SEED,
  },
  "16": {
    unitId: "16",
    unitLabel: "Unit 16",
    pageSpans: UNIT_16_PAGE_SPANS,
    createSourceSeed: createUnit16SourceSeed,
    qrSeed: UNIT_16_QR_SEED,
  },
  "17": {
    unitId: "17",
    unitLabel: "Unit 17",
    pageSpans: UNIT_17_PAGE_SPANS,
    createSourceSeed: createUnit17SourceSeed,
    qrSeed: UNIT_17_QR_SEED,
  },
};

function assertPageRange(
  label: string,
  totalPages: number,
  pageRange: { startPage: number; endPage: number },
) {
  if (
    pageRange.startPage < 1 ||
    pageRange.endPage > totalPages ||
    pageRange.startPage > pageRange.endPage
  ) {
    throw new Error(
      `${label} page span ${pageRange.startPage}-${pageRange.endPage} is outside the PDF range 1-${totalPages}.`,
    );
  }
}

function toRawBlock(
  document: SourceDocumentRole,
  kind: SourceBlockKind,
  sourceItemId: string,
  sourceRef: SourceUnit["textbook"]["vocab"][number]["sourceRef"],
  needsReview: boolean,
): RawSourceBlock {
  return {
    id: sourceRef.sourceBlockId,
    document,
    page: sourceRef.page,
    kind,
    text: sourceRef.rawText,
    confidence: sourceRef.confidence,
    sourceItemId,
    needsReview,
  };
}

function withPlaceholderPages(
  blocks: RawSourceBlock[],
  document: SourceDocumentRole,
  pageRange: { startPage: number; endPage: number },
) {
  const pageIssues: RawUnitDraft["pageIssues"] = [];
  const pagesWithBlocks = new Set(
    blocks.filter((block) => block.document === document).map((block) => block.page),
  );

  for (let page = pageRange.startPage; page <= pageRange.endPage; page += 1) {
    if (pagesWithBlocks.has(page)) {
      continue;
    }

    blocks.push({
      id: `${document}-page-${page}-placeholder`,
      document,
      page,
      kind: "unknown",
      text: `Page ${page} captured but not normalized yet.`,
      confidence: 0,
      needsReview: true,
    });
    pageIssues.push({
      document,
      page,
      reason: "No normalized items mapped to this page yet.",
    });
  }

  return pageIssues;
}

function buildSeededRawDraft(
  source: SourceUnit,
  qrDetections: RawQrDetection[],
  imageCrops: RawImageCrop[],
  extraPageIssues: RawUnitDraft["pageIssues"] = [],
): RawUnitDraft {
  const blocks: RawSourceBlock[] = [
    ...source.textbook.vocab.map((entry) =>
      toRawBlock("textbook", "vocab", entry.id, entry.sourceRef, entry.needsReview),
    ),
    ...source.textbook.grammar.map((entry) =>
      toRawBlock("textbook", "grammar", entry.id, entry.sourceRef, entry.needsReview),
    ),
    ...source.textbook.dialogue.map((entry) =>
      toRawBlock("textbook", "dialogue", entry.id, entry.sourceRef, entry.needsReview),
    ),
    ...source.textbook.examples.map((entry) =>
      toRawBlock("textbook", "example", entry.id, entry.sourceRef, entry.needsReview),
    ),
    ...source.workbook.exercises.map((entry) =>
      toRawBlock("workbook", "exercise", entry.id, entry.sourceRef, entry.needsReview),
    ),
  ];

  const pageIssues = [
    ...extraPageIssues,
    ...withPlaceholderPages(
      blocks,
      "textbook",
      source.sourceDocuments.textbook.unitPages,
    ),
    ...withPlaceholderPages(
      blocks,
      "workbook",
      source.sourceDocuments.workbook.unitPages,
    ),
  ];

  return {
    unitId: source.unitId,
    unitNumber: source.unitNumber,
    extractionMode: "seeded_raw_blocks",
    blocks,
    qrDetections,
    imageCrops,
    pageIssues,
    reviewNotes: [
      "Seeded raw blocks mirror the reviewed normalized source because the local PDFs do not expose a usable text layer.",
      "Pages without mapped items are emitted as placeholder unknown blocks instead of being silently skipped.",
      "Swap these blocks with OCR or vision output when richer PDF extraction is available.",
    ],
  };
}

function buildRawDraftFromBlocks(
  source: SourceUnit,
  extractionMode: ExtractionMode,
  blocks: RawSourceBlock[],
  qrDetections: RawQrDetection[],
  imageCrops: RawImageCrop[],
  extraPageIssues: RawUnitDraft["pageIssues"] = [],
): RawUnitDraft {
  const hydratedBlocks = [...blocks];
  const pageIssues = [
    ...extraPageIssues,
    ...withPlaceholderPages(
      hydratedBlocks,
      "textbook",
      source.sourceDocuments.textbook.unitPages,
    ),
    ...withPlaceholderPages(
      hydratedBlocks,
      "workbook",
      source.sourceDocuments.workbook.unitPages,
    ),
  ];

  return {
    unitId: source.unitId,
    unitNumber: source.unitNumber,
    extractionMode,
    blocks: hydratedBlocks,
    qrDetections,
    imageCrops,
    pageIssues,
    reviewNotes: [
      "OCR/vision blocks are stored separately from the normalized reviewed source.",
      "Any page still missing parsed blocks is emitted as an unknown placeholder with needsReview=true.",
      "Normalized curriculum generation still compiles only from the reviewed source layer.",
    ],
  };
}

function resolveExtractionMode(hasTextLayer: boolean): ExtractionMode {
  return hasTextLayer ? "text_layer" : "seeded_raw_blocks";
}

function applyListeningReviewState(source: SourceUnit) {
  const unresolvedAudioAssets = new Set(
    source.workbook.audioAssets
      .filter((asset) => asset.needsReview || !asset.remoteUrl)
      .map((asset) => asset.id),
  );

  source.workbook.exercises = source.workbook.exercises.map((exercise) =>
    exercise.audioAssetId && unresolvedAudioAssets.has(exercise.audioAssetId)
      ? {
          ...exercise,
          needsReview: true,
        }
      : exercise,
  );

  source.workbook.listeningItems = source.workbook.listeningItems.map((item) =>
    unresolvedAudioAssets.has(item.audioAssetId)
      ? {
          ...item,
          needsReview: true,
        }
      : item,
  );
}

function getSeedUnitConfig(unitId: string) {
  const config = SEEDED_UNIT_CONFIGS[unitId];

  if (!config) {
    throw new Error(`This pilot implementation currently supports units ${Object.keys(SEEDED_UNIT_CONFIGS).join(", ")} only.`);
  }

  return config;
}

async function extractSeededUnit(options: ExtractOptions, config: SeedUnitConfig) {
  const pdfFiles = await resolvePdfFiles(options.cwd);
  const [textbookInspection, workbookInspection] = await Promise.all([
    inspectPdf("textbook", pdfFiles.textbook),
    inspectPdf("workbook", pdfFiles.workbook),
  ]);

  assertPageRange(
    `Textbook ${config.unitLabel}`,
    textbookInspection.totalPages,
    config.pageSpans.textbook,
  );
  assertPageRange(
    `Workbook ${config.unitLabel}`,
    workbookInspection.totalPages,
    config.pageSpans.workbook,
  );

  const sourceUnit = config.createSourceSeed(
    {
      textbook: {
        fileName: path.basename(pdfFiles.textbook),
        totalPages: textbookInspection.totalPages,
        unitPages: { ...config.pageSpans.textbook },
        boundarySource: textbookInspection.hasTextLayer
          ? "pdf_text_layer"
          : "configured_page_spans",
        hasTextLayer: textbookInspection.hasTextLayer,
        textPagesDetected: textbookInspection.textPagesDetected,
      },
      workbook: {
        fileName: path.basename(pdfFiles.workbook),
        totalPages: workbookInspection.totalPages,
        unitPages: { ...config.pageSpans.workbook },
        boundarySource: workbookInspection.hasTextLayer
          ? "pdf_text_layer"
          : "configured_page_spans",
        hasTextLayer: workbookInspection.hasTextLayer,
        textPagesDetected: workbookInspection.textPagesDetected,
      },
    },
    {
      needsReview: true,
    },
  );

  sourceUnit.extractionMode =
    textbookInspection.hasTextLayer || workbookInspection.hasTextLayer
      ? resolveExtractionMode(true)
      : "seeded_raw_blocks";

  const workbookListeningArtifacts = await extractWorkbookListeningArtifacts({
    pdfPath: pdfFiles.workbook,
    audioAssets: sourceUnit.workbook.audioAssets,
    listeningPages: config.qrSeed.listeningPages,
    imageCropSeeds: config.qrSeed.imageCrops,
  });
  sourceUnit.workbook.audioAssets = workbookListeningArtifacts.audioAssets;
  applyListeningReviewState(sourceUnit);

  if (sourceUnit.unitId !== config.unitId) {
    throw new Error(`Textbook and workbook ${config.unitLabel} seed are not aligned to the same unit id.`);
  }

  const [textbookVisionBlocks, workbookVisionBlocks] = await Promise.all([
    maybeExtractVisionBlocks({
      pdfPath: pdfFiles.textbook,
      document: "textbook",
      startPage: config.pageSpans.textbook.startPage,
      endPage: config.pageSpans.textbook.endPage,
    }),
    maybeExtractVisionBlocks({
      pdfPath: pdfFiles.workbook,
      document: "workbook",
      startPage: config.pageSpans.workbook.startPage,
      endPage: config.pageSpans.workbook.endPage,
    }),
  ]);

  const rawDraft =
    textbookVisionBlocks || workbookVisionBlocks
      ? buildRawDraftFromBlocks(sourceUnit, "openai_vision", [
          ...(textbookVisionBlocks ?? []),
          ...(workbookVisionBlocks ?? []),
        ], workbookListeningArtifacts.qrDetections, workbookListeningArtifacts.imageCrops, workbookListeningArtifacts.pageIssues)
      : buildSeededRawDraft(
          sourceUnit,
          workbookListeningArtifacts.qrDetections,
          workbookListeningArtifacts.imageCrops,
          workbookListeningArtifacts.pageIssues,
        );
  const rawPath = getRawDraftPath(sourceUnit.unitId);
  const extractedPath = getExtractedSourcePath(sourceUnit.unitId);

  sourceUnit.extractionMode = rawDraft.extractionMode;

  await writeJsonFile(rawPath, rawDraft);
  await writeJsonFile(extractedPath, sourceUnit);

  if (options.emitReviewedSeed) {
    const reviewedPath = getReviewedSourcePath(sourceUnit.unitId);
    const reviewedSource = config.createSourceSeed(
      {
        textbook: sourceUnit.sourceDocuments.textbook,
        workbook: sourceUnit.sourceDocuments.workbook,
      },
      {
        needsReview: false,
      },
    );
    reviewedSource.workbook.audioAssets = workbookListeningArtifacts.audioAssets.map((asset) => ({
      ...asset,
    }));
    applyListeningReviewState(reviewedSource);

    await writeJsonFile(reviewedPath, reviewedSource);
  }

  return {
    rawPath,
    extractedPath,
    sourceUnit,
    rawDraft,
  };
}

export async function extractUnit(options: ExtractOptions & { unitId: string }) {
  return extractSeededUnit(options, getSeedUnitConfig(options.unitId));
}

export async function extractUnit1(options: ExtractOptions) {
  return extractSeededUnit(options, getSeedUnitConfig("1"));
}
