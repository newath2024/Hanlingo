import type {
  LocalizedText,
  SourceAudioAsset,
  SourceWorkbookExercise,
} from "@/types/curriculum";
import type { QrSeedFactoryArgs, UnitQrSeedDefinition } from "./qr-seed";

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

const PARTY_TIME_OPTIONS = [
  { id: "six-pm", label: text("6 giờ tối", "6 PM"), correct: true },
  { id: "seven-pm", label: text("7 giờ tối", "7 PM"), correct: false },
  { id: "eight-pm", label: text("8 giờ tối", "8 PM"), correct: false },
];

const GIFT_OPTIONS = [
  { id: "flowers", label: text("hoa", "flowers"), correct: false },
  {
    id: "tissue-detergent",
    label: text("khăn giấy và nước giặt", "tissue paper and detergent"),
    correct: true,
  },
  { id: "invitation-card", label: text("thiệp mời", "invitation card"), correct: false },
];

const QR_DIALOGUE_TRANSCRIPT =
  "지훈: 내일 샤오위 씨, 집들이가 몇 시예요? 리사: 저녁 여섯 시예요. 그런데 집들이에 뭘 사 가야 돼요? 지훈: 보통 세제를 사 가고, 휴지도 사 가요. 리사: 그럼 휴지하고 세제를 제가 사 갈까요? 지훈: 좋아요. 그럼 샤오위 씨 집에서 만나요.";

export const UNIT_17_QR_SEED: UnitQrSeedDefinition = {
  listeningPages: [287, 288],
  createAudioAssets(args: QrSeedFactoryArgs): SourceAudioAsset[] {
    return [
      {
        id: "wb17-qr-dialogue-audio",
        document: "workbook",
        page: 287,
        qrValue: "http://m.site.naver.com/0YybK",
        transcript: QR_DIALOGUE_TRANSCRIPT,
        transcriptConfidence: 0.7,
        needsReview: args.needsReview,
      },
      {
        id: "wb17-qr-followup-audio",
        document: "workbook",
        page: 288,
        qrValue: "http://m.site.naver.com/0Yyc0",
        needsReview: args.needsReview,
      },
    ];
  },
  createWorkbookExercises(args: QrSeedFactoryArgs): SourceWorkbookExercise[] {
    const capture = args.capture;

    return [
      workbookExercise(
        {
          id: "wb17-qr-party-time",
          exerciseType: "listening",
          prompt: args.text(
            "Nghe hội thoại QR và chọn giờ diễn ra tiệc tân gia.",
            "Listen to the QR dialogue and choose the housewarming time.",
          ),
          localizedText: args.text("6 giờ tối", "6 PM"),
          answer: "6 giờ tối",
          audioAssetId: "wb17-qr-dialogue-audio",
          options: PARTY_TIME_OPTIONS.map((option) => ({
            id: option.id,
            label: option.label,
            correct: option.correct,
          })),
          metadata: {
            target: "qr_listening",
            variant: "time_choice",
          },
          coverageTags: ["qr-listening", "housewarming", "time"],
          pages: page(287),
          sourceRef: capture(
            "wb17-qr-party-time",
            287,
            "내일 샤오위 씨, 집들이가 몇 시예요? 저녁 여섯 시예요.",
          ),
        },
        args.needsReview,
      ),
      workbookExercise(
        {
          id: "wb17-qr-buy-gifts",
          exerciseType: "listening",
          prompt: args.text(
            "Nghe hội thoại QR và chọn những thứ Lisa sẽ mua mang đến.",
            "Listen to the QR dialogue and choose what Lisa will bring.",
          ),
          localizedText: args.text("khăn giấy và nước giặt", "tissue paper and detergent"),
          answer: "khăn giấy và nước giặt",
          audioAssetId: "wb17-qr-dialogue-audio",
          options: GIFT_OPTIONS.map((option) => ({
            id: option.id,
            label: option.label,
            correct: option.correct,
          })),
          metadata: {
            target: "qr_listening",
            variant: "gift_choice",
          },
          coverageTags: ["qr-listening", "gifts", "housewarming"],
          pages: page(287),
          sourceRef: capture(
            "wb17-qr-buy-gifts",
            287,
            "보통 세제를 사 가고, 휴지도 사 가요. 그럼 휴지하고 세제를 제가 사 갈까요?",
          ),
        },
        args.needsReview,
      ),
    ];
  },
};

export function createUnit17QrAudioAssets(args: QrSeedFactoryArgs) {
  return UNIT_17_QR_SEED.createAudioAssets(args);
}

export function createUnit17QrWorkbookExercises(args: QrSeedFactoryArgs) {
  return UNIT_17_QR_SEED.createWorkbookExercises(args);
}

export const UNIT_17_QR_LISTENING_PAGES = UNIT_17_QR_SEED.listeningPages;

