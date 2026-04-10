import type {
  LocalizedText,
  SourceAudioAsset,
  SourceBounds,
  SourceCaptureRef,
  SourceWorkbookExercise,
} from "@/types/curriculum";

export type QrSeedFactoryArgs = {
  needsReview: boolean;
  text: (vi: string, en: string) => LocalizedText;
  capture: (
    sourceBlockId: string,
    page: number,
    rawText: string,
    confidence?: number,
  ) => SourceCaptureRef;
};

export type SeededQrImageCrop = {
  id: string;
  label: string;
  page: number;
  imagePath: string;
  bounds: SourceBounds;
  sourceItemId: string;
};

export type UnitQrSeedDefinition = {
  listeningPages: readonly number[];
  imageCrops?: readonly SeededQrImageCrop[];
  createAudioAssets: (args: QrSeedFactoryArgs) => SourceAudioAsset[];
  createWorkbookExercises: (args: QrSeedFactoryArgs) => SourceWorkbookExercise[];
};
