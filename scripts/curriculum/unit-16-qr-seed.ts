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

const TRAFFIC_OPTIONS = [
  { id: "clear-road", label: text("đường vắng xe", "the road is clear"), correct: false },
  { id: "traffic-jam", label: text("đường đang tắc", "the road is jammed"), correct: true },
];

const BUS_NUMBER_OPTIONS = [
  { id: "50", label: text("xe buýt 50", "bus 50"), correct: false },
  { id: "100", label: text("xe buýt 100", "bus 100"), correct: true },
  { id: "150", label: text("xe buýt 150", "bus 150"), correct: false },
  { id: "200", label: text("xe buýt 200", "bus 200"), correct: false },
];

const DISTANCE_OPTIONS = [
  { id: "far", label: text("rất xa", "very far"), correct: false },
  { id: "not-far", label: text("không xa", "not far"), correct: true },
  { id: "three-hours", label: text("mất ba tiếng", "it takes three hours"), correct: false },
];

const DESTINATION_OPTIONS = [
  { id: "airport", label: text("sân bay", "airport"), correct: true },
  { id: "seoul-station", label: text("ga Seoul", "Seoul Station"), correct: false },
  { id: "terminal", label: text("bến xe", "terminal"), correct: false },
  { id: "harbor", label: text("cảng", "harbor"), correct: false },
];

const QR_269_TRANSCRIPT =
  "리사: 실례합니다. 여기에서 서울역까지 어떻게 가요? 남자: 저기 정류장에서 100번 버스를 타십시오. 그 버스가 서울역까지 갑니다. 리사: 감사합니다. 그런데 여기에서 서울역까지 많이 멀어요? 남자: 아니요. 멀지 않아요.";

export const UNIT_16_QR_SEED: UnitQrSeedDefinition = {
  listeningPages: [265, 269, 270, 271],
  createAudioAssets(args: QrSeedFactoryArgs): SourceAudioAsset[] {
    return [
      {
        id: "wb16-qr-traffic-audio",
        document: "workbook",
        page: 265,
        qrValue: "http://m.site.naver.com/0Yyb6",
        transcript: "퇴근 시간이라 길이 막힙니다.",
        transcriptConfidence: 0.6,
        needsReview: args.needsReview,
      },
      {
        id: "wb16-qr-seoul-station-audio",
        document: "workbook",
        page: 269,
        qrValue: "http://m.site.naver.com/0Yybi",
        transcript: QR_269_TRANSCRIPT,
        transcriptConfidence: 0.7,
        needsReview: args.needsReview,
      },
      {
        id: "wb16-qr-airport-audio",
        document: "workbook",
        page: 270,
        qrValue: "http://m.site.naver.com/0Yybr",
        transcript:
          "지연 씨는 공항에 가려고 해요. 여기에서 600번 버스를 타고 가세요.",
        transcriptConfidence: 0.55,
        needsReview: args.needsReview,
      },
      {
        id: "wb16-qr-trip-audio",
        document: "workbook",
        page: 271,
        qrValue: "http://m.site.naver.com/0Yybx",
        transcript:
          "지난 주말에 부산에 다녀왔습니다. 서울역에서 기차를 탔습니다.",
        transcriptConfidence: 0.55,
        needsReview: args.needsReview,
      },
    ];
  },
  createWorkbookExercises(args: QrSeedFactoryArgs): SourceWorkbookExercise[] {
    const capture = args.capture;

    return [
      workbookExercise(
        {
          id: "wb16-qr-traffic-jam",
          exerciseType: "listening",
          prompt: args.text(
            "Nghe QR và chọn tình huống giao thông đúng.",
            "Listen to the QR audio and choose the correct traffic situation.",
          ),
          localizedText: args.text("đường đang tắc", "the road is jammed"),
          answer: "đường đang tắc",
          audioAssetId: "wb16-qr-traffic-audio",
          options: TRAFFIC_OPTIONS.map((option) => ({
            id: option.id,
            label: option.label,
            correct: option.correct,
          })),
          metadata: {
            target: "qr_listening",
            variant: "situation_choice",
          },
          coverageTags: ["qr-listening", "traffic", "situation"],
          pages: page(264),
          sourceRef: capture(
            "wb16-qr-traffic-jam",
            264,
            "길이 막히다 listening prompt. Choose the picture that matches the jammed road.",
          ),
        },
        args.needsReview,
      ),
      workbookExercise(
        {
          id: "wb16-qr-seoul-bus-number",
          exerciseType: "listening",
          prompt: args.text(
            "Nghe hội thoại QR và chọn số xe buýt cần đi.",
            "Listen to the QR dialogue and choose the bus number to take.",
          ),
          localizedText: args.text("xe buýt 100", "bus 100"),
          answer: "xe buýt 100",
          audioAssetId: "wb16-qr-seoul-station-audio",
          options: BUS_NUMBER_OPTIONS.map((option) => ({
            id: option.id,
            label: option.label,
            correct: option.correct,
          })),
          metadata: {
            target: "qr_listening",
            variant: "bus_number_choice",
          },
          coverageTags: ["qr-listening", "directions", "bus-number"],
          pages: page(269),
          sourceRef: capture(
            "wb16-qr-seoul-bus-number",
            269,
            "정류장에서 100번 버스를 타십시오.",
          ),
        },
        args.needsReview,
      ),
      workbookExercise(
        {
          id: "wb16-qr-seoul-distance",
          exerciseType: "listening",
          prompt: args.text(
            "Nghe hội thoại QR và chọn cách mô tả khoảng cách đúng.",
            "Listen to the QR dialogue and choose the correct distance description.",
          ),
          localizedText: args.text("không xa", "not far"),
          answer: "không xa",
          audioAssetId: "wb16-qr-seoul-station-audio",
          options: DISTANCE_OPTIONS.map((option) => ({
            id: option.id,
            label: option.label,
            correct: option.correct,
          })),
          metadata: {
            target: "qr_listening",
            variant: "distance_choice",
          },
          coverageTags: ["qr-listening", "distance", "directions"],
          pages: page(269),
          sourceRef: capture(
            "wb16-qr-seoul-distance",
            269,
            "여기에서 서울역까지 많이 멀어요? 아니요. 멀지 않아요.",
          ),
        },
        args.needsReview,
      ),
      workbookExercise(
        {
          id: "wb16-qr-destination",
          exerciseType: "listening",
          prompt: args.text(
            "Nghe QR và chọn địa điểm mà Jiyeon muốn đến.",
            "Listen to the QR audio and choose Jiyeon's destination.",
          ),
          localizedText: args.text("sân bay", "airport"),
          answer: "sân bay",
          audioAssetId: "wb16-qr-airport-audio",
          options: DESTINATION_OPTIONS.map((option) => ({
            id: option.id,
            label: option.label,
            correct: option.correct,
          })),
          metadata: {
            target: "qr_listening",
            variant: "destination_choice",
          },
          coverageTags: ["qr-listening", "destination", "travel"],
          pages: page(270),
          sourceRef: capture(
            "wb16-qr-destination",
            270,
            "지연 씨는 공항에 가려고 해요.",
          ),
        },
        args.needsReview,
      ),
    ];
  },
};

export function createUnit16QrAudioAssets(args: QrSeedFactoryArgs) {
  return UNIT_16_QR_SEED.createAudioAssets(args);
}

export function createUnit16QrWorkbookExercises(args: QrSeedFactoryArgs) {
  return UNIT_16_QR_SEED.createWorkbookExercises(args);
}

export const UNIT_16_QR_LISTENING_PAGES = UNIT_16_QR_SEED.listeningPages;
