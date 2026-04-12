import type {
  LocalizedText,
  SourceAudioAsset,
  SourceCaptureRef,
  SourceWorkbookExercise,
} from "@/types/curriculum";
import type { QrSeedFactoryArgs, SeededQrImageCrop, UnitQrSeedDefinition } from "./qr-seed";

function page(startPage: number, endPage = startPage) {
  return { startPage, endPage };
}

function workbookExercise(
  exercise: Omit<SourceWorkbookExercise, "needsReview">,
  needsReview: boolean,
): SourceWorkbookExercise {
  return {
    ...exercise,
    needsReview,
  };
}

function text(vi: string, en: string): LocalizedText {
  return { vi, en };
}

const PAGE_20_FLAG_CROPS: readonly SeededQrImageCrop[] = [
  {
    id: "wb-p20-flag-korea",
    label: "South Korea flag",
    page: 20,
    imagePath: "/generated/curriculum/unit-1/workbook/page-20/flag-korea.png",
    bounds: { x: 330, y: 938, width: 125, height: 96 },
    sourceItemId: "wb-qr-listen-country-left",
  },
  {
    id: "wb-p20-flag-usa",
    label: "United States flag",
    page: 20,
    imagePath: "/generated/curriculum/unit-1/workbook/page-20/flag-usa.png",
    bounds: { x: 459, y: 938, width: 125, height: 96 },
    sourceItemId: "wb-qr-listen-country-right",
  },
  {
    id: "wb-p20-flag-vietnam",
    label: "Vietnam flag",
    page: 20,
    imagePath: "/generated/curriculum/unit-1/workbook/page-20/flag-vietnam.png",
    bounds: { x: 590, y: 938, width: 125, height: 96 },
    sourceItemId: "wb-qr-listen-country-left",
  },
  {
    id: "wb-p20-flag-russia",
    label: "Russia flag",
    page: 20,
    imagePath: "/generated/curriculum/unit-1/workbook/page-20/flag-russia.png",
    bounds: { x: 722, y: 938, width: 125, height: 96 },
    sourceItemId: "wb-qr-listen-country-right",
  },
];

const COUNTRY_FLAG_OPTIONS = [
  {
    id: "south-korea",
    label: text("Hàn Quốc", "South Korea"),
    imagePath: "/generated/curriculum/unit-1/workbook/page-20/flag-korea.png",
  },
  {
    id: "united-states",
    label: text("Mỹ", "United States"),
    imagePath: "/generated/curriculum/unit-1/workbook/page-20/flag-usa.png",
  },
  {
    id: "vietnam",
    label: text("Việt Nam", "Vietnam"),
    imagePath: "/generated/curriculum/unit-1/workbook/page-20/flag-vietnam.png",
  },
  {
    id: "russia",
    label: text("Nga", "Russia"),
    imagePath: "/generated/curriculum/unit-1/workbook/page-20/flag-russia.png",
  },
];

const QR_AUDIO_TRANSCRIPT_1 =
  "\ub4e3\uace0 \ub9d0\ud558\uae30 1. \ub450 \uc0ac\ub78c\uc774 \ucc98\uc74c \ub9cc\ub0ac\uc2b5\ub2c8\ub2e4. \ub300\ud654\ub97c \ub4e3\uace0 \ube48 \uce78\uc5d0 \uc54c\ub9de\uc740 \ub9d0\uc744 \uc4f0\uc138\uc694. \uc548\ub155\ud558\uc138\uc694. \uc800\ub294 \uc9c0\ud6c8\uc774\uc5d0\uc694. \uc548\ub155\ud558\uc138\uc694. \uc800\ub294 \ub098\ud0c0\uc0e4\uc608\uc694. \ub098\ud0c0\uc0e4 \uc528\ub294 \uc5b4\ub290 \ub098\ub77c \uc0ac\ub78c\uc774\uc5d0\uc694? \uc800\ub294 \ub7ec\uc2dc\uc544 \uc0ac\ub78c\uc774\uc5d0\uc694. \uc800\ub294 \ud55c\uad6d \uc0ac\ub78c\uc774\uc5d0\uc694. \ud559\uc0dd\uc774\uc5d0\uc694.";

const QR_AUDIO_TRANSCRIPT_2 =
  "\ub4e3\uace0 \ub9d0\ud558\uae30 2. \ub2e4\uc74c\uc744 \ub4e3\uace0 \ubb34\ub984\uc5d0 \ub2f5\ud558\uc138\uc694. \uc548\ub155\ud558\uc138\uc694. \uc800\ub294 \ub9ac\uc0ac\uc608\uc694. \uc774\ub984\uc774 \ubb50\uc608\uc694? \uc548\ub155\ud558\uc138\uc694. \uc800\ub294 \uac00\uc601\uc774\uc5d0\uc694. \uac00\uc601 \uc528\ub294 \uc5b4\ub290 \ub098\ub77c \uc0ac\ub78c\uc774\uc5d0\uc694? \uc800\ub294 \ud55c\uad6d \uc0ac\ub78c\uc774\uc5d0\uc694. \uc800\ub294 \ubbf8\uad6d \uc0ac\ub78c\uc774\uc5d0\uc694. \uc601\uc5b4 \uc120\uc0dd\ub2d8\uc774\uc5d0\uc694.";

export const UNIT_1_QR_SEED: UnitQrSeedDefinition = {
  listeningPages: [20],
  imageCrops: PAGE_20_FLAG_CROPS,
  createAudioAssets(args: QrSeedFactoryArgs): SourceAudioAsset[] {
    return [
      {
        id: "wb-qr-country-1-audio",
        document: "workbook",
        page: 20,
        qrValue: "http://m.site.naver.com/0YvmA",
        transcript: QR_AUDIO_TRANSCRIPT_1,
        transcriptConfidence: 0.7,
        needsReview: args.needsReview,
      },
      {
        id: "wb-qr-country-2-audio",
        document: "workbook",
        page: 20,
        qrValue: "http://m.site.naver.com/0YvmL",
        transcript: QR_AUDIO_TRANSCRIPT_2,
        transcriptConfidence: 0.7,
        needsReview: args.needsReview,
      },
    ];
  },
  createWorkbookExercises(args: QrSeedFactoryArgs): SourceWorkbookExercise[] {
    const capture = args.capture;

    return [
      workbookExercise(
        {
          id: "wb-qr-listen-country-left",
          exerciseType: "listening",
          prompt: args.text(
            "Nghe hội thoại và chọn lá cờ quốc gia của Natasha.",
            "Listen to the dialogue and choose Natasha's country flag.",
          ),
          localizedText: args.text("Nga", "Russia"),
          answer: "Nga",
          audioAssetId: "wb-qr-country-1-audio",
          options: COUNTRY_FLAG_OPTIONS.map((option) => ({
            id: option.id,
            label: option.label,
            imagePath: option.imagePath,
            correct: option.id === "russia",
          })),
          metadata: {
            target: "qr_listening",
            variant: "image_choice",
          },
          coverageTags: ["qr-listening", "country", "flags", "image-choice"],
          pages: page(20),
          sourceRef: capture(
            "wb-qr-listen-country-left",
            20,
            "QR listening: Natasha's country. Choose the correct flag after listening.",
          ),
        },
        args.needsReview,
      ),
      workbookExercise(
        {
          id: "wb-qr-listen-country-right",
          exerciseType: "listening",
          prompt: args.text(
            "Nghe hội thoại và chọn lá cờ quốc gia của Gayoung.",
            "Listen to the dialogue and choose Gayoung's country flag.",
          ),
          localizedText: args.text("Hàn Quốc", "South Korea"),
          answer: "Hàn Quốc",
          audioAssetId: "wb-qr-country-2-audio",
          options: COUNTRY_FLAG_OPTIONS.map((option) => ({
            id: option.id,
            label: option.label,
            imagePath: option.imagePath,
            correct: option.id === "south-korea",
          })),
          metadata: {
            target: "qr_listening",
            variant: "image_choice",
          },
          coverageTags: ["qr-listening", "country", "flags", "image-choice"],
          pages: page(20),
          sourceRef: capture(
            "wb-qr-listen-country-right",
            20,
            "QR listening: Gayoung's country. Choose the correct flag after listening.",
          ),
        },
        args.needsReview,
      ),
    ];
  },
};

export function createUnit1QrAudioAssets(args: QrSeedFactoryArgs): SourceAudioAsset[] {
  return UNIT_1_QR_SEED.createAudioAssets(args);
}

export function createUnit1QrWorkbookExercises(
  args: QrSeedFactoryArgs,
): SourceWorkbookExercise[] {
  return UNIT_1_QR_SEED.createWorkbookExercises(args);
}

export const UNIT_1_QR_LISTENING_PAGES = UNIT_1_QR_SEED.listeningPages;

export type { QrSeedFactoryArgs, SeededQrImageCrop } from "./qr-seed";
export type { LocalizedText, SourceAudioAsset, SourceCaptureRef, SourceWorkbookExercise };
