import type {
  LocalizedText,
  ListeningTtsConfig,
  SourceAudioAsset,
  SourceListeningItem,
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

const HOTEL_DURATION_OPTIONS = [
  {
    id: "bus-to-hotel-15",
    label: text("đi xe buýt 15 phút đến khách sạn", "take a bus for 15 minutes to the hotel"),
    correct: true,
  },
  {
    id: "walk-to-hotel-15",
    label: text("đi bộ 15 phút đến khách sạn", "walk for 15 minutes to the hotel"),
    correct: false,
  },
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
const QR_264_DIALOGUE_1 = "지금 길이 많이 막혀요";
const QR_264_DIALOGUE_2 = "버스를 타고 십오 분쯤 걸려요";
const QR_264_DIALOGUE_2_TIME = "십오 분쯤 걸려요";

function tts(textValue: string): ListeningTtsConfig {
  return {
    text: textValue,
    voice: "ko-KR",
    speed: 0.9,
  };
}

export const UNIT_16_QR_SEED: UnitQrSeedDefinition = {
  listeningPages: [269, 270, 271],
  createAudioAssets(args: QrSeedFactoryArgs): SourceAudioAsset[] {
    return [
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
          id: "wb16-qr-hotel-duration",
          exerciseType: "listening",
          prompt: args.text(
            "Nghe QR và chọn hình đúng với thời gian đi từ ga đến khách sạn.",
            "Listen to the QR audio and choose the picture that matches the trip to the hotel.",
          ),
          localizedText: args.text(
            "đi xe buýt 15 phút đến khách sạn",
            "take a bus for 15 minutes to the hotel",
          ),
          answer: "đi xe buýt 15 phút đến khách sạn",
          options: HOTEL_DURATION_OPTIONS.map((option) => ({
            id: option.id,
            label: option.label,
            correct: option.correct,
          })),
          metadata: {
            target: "qr_listening",
            variant: "hotel_duration_choice",
          },
          coverageTags: ["qr-listening", "hotel", "duration"],
          pages: page(264),
          sourceRef: capture(
            "wb16-qr-hotel-duration",
            264,
            "역에서 호텔까지 얼마나 걸려요? 버스를 타고 십오 분쯤 걸려요.",
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

export function createUnit16QrListeningItems(args: QrSeedFactoryArgs): SourceListeningItem[] {
  const capture = args.capture;

  return [
    {
      id: "u16-qr-traffic-jam-image",
      sourceExerciseIds: ["wb16-qr-traffic-jam"],
      tts: tts(QR_264_DIALOGUE_1),
      type: "choose_image",
      prompt: args.text(
        "Nghe câu ngắn rồi chọn hình đúng.",
        "Listen to the short sentence and choose the matching image.",
      ),
      questionText: args.text(
        "Tình huống giao thông nào đúng?",
        "Which traffic situation is mentioned?",
      ),
      transcriptKo: QR_264_DIALOGUE_1,
      translation: args.text(
        "Bây giờ đường đang tắc nhiều.",
        "The road is very jammed right now.",
      ),
      choices: [
        {
          id: "traffic-jam",
          text: args.text("đường đang tắc", "the road is jammed"),
          imageId: "traffic_jam",
        },
        {
          id: "clear-road",
          text: args.text("đường đang thông", "the road is clear"),
          imageId: "traffic_clear",
        },
      ],
      correctChoiceId: "traffic-jam",
      coverageTags: ["qr-listening", "traffic", "situation"],
      difficulty: "easy",
      pages: page(264),
      sourceRef: capture(
        "u16-qr-traffic-jam-image",
        264,
        "지금 길이 많이 막혀요 choose_image tts",
      ),
      needsReview: args.needsReview,
    },
    {
      id: "u16-qr-traffic-reason-choice",
      sourceExerciseIds: ["wb16-qr-traffic-jam"],
      tts: tts(QR_264_DIALOGUE_1),
      type: "multiple_choice",
      prompt: args.text(
        "Nghe câu ngắn rồi chọn đáp án đúng.",
        "Listen to the short sentence and choose the correct answer.",
      ),
      questionText: args.text(
        "Vì sao người đó chưa đến?",
        "Why has the person not arrived yet?",
      ),
      transcriptKo: QR_264_DIALOGUE_1,
      translation: args.text(
        "Bây giờ đường đang tắc nhiều.",
        "The road is very jammed right now.",
      ),
      choices: [
        {
          id: "reason-traffic",
          text: args.text("đường đang tắc nhiều", "the road is very jammed"),
        },
        {
          id: "reason-bus",
          text: args.text("đi xe buýt", "by bus"),
        },
        {
          id: "reason-fifteen",
          text: args.text("khoảng 15 phút", "about 15 minutes"),
        },
      ],
      correctChoiceId: "reason-traffic",
      coverageTags: ["qr-listening", "traffic", "reason"],
      difficulty: "easy",
      pages: page(264),
      sourceRef: capture(
        "u16-qr-traffic-reason-choice",
        264,
        "지금 길이 많이 막혀요 multiple_choice tts",
      ),
      needsReview: args.needsReview,
    },
    {
      id: "u16-qr-hotel-transport-time-image",
      sourceExerciseIds: ["wb16-qr-hotel-duration"],
      tts: tts(QR_264_DIALOGUE_2),
      type: "choose_image",
      prompt: args.text(
        "Nghe câu ngắn rồi chọn hình đúng.",
        "Listen to the short sentence and choose the matching image.",
      ),
      questionText: args.text(
        "Cách đi và thời gian nào được nhắc tới?",
        "Which transport and time are mentioned?",
      ),
      transcriptKo: QR_264_DIALOGUE_2,
      translation: args.text(
        "Đi xe buýt thì mất khoảng 15 phút.",
        "It takes about 15 minutes by bus.",
      ),
      choices: [
        {
          id: "bus-to-hotel-15",
          text: args.text("đi xe buýt 15 phút", "15 minutes by bus"),
          imageId: "bus_hotel_15",
        },
        {
          id: "walk-to-hotel-15",
          text: args.text("đi bộ 15 phút", "15 minutes on foot"),
          imageId: "walk_hotel_15",
        },
      ],
      correctChoiceId: "bus-to-hotel-15",
      coverageTags: ["qr-listening", "hotel", "transport", "duration"],
      difficulty: "easy",
      pages: page(264),
      sourceRef: capture(
        "u16-qr-hotel-transport-time-image",
        264,
        "버스를 타고 십오 분쯤 걸려요 choose_image tts",
      ),
      needsReview: args.needsReview,
    },
    {
      id: "u16-qr-hotel-time-choice",
      sourceExerciseIds: ["wb16-qr-hotel-duration"],
      tts: tts(QR_264_DIALOGUE_2_TIME),
      type: "multiple_choice",
      prompt: args.text(
        "Nghe câu ngắn rồi chọn đáp án đúng.",
        "Listen to the short sentence and choose the correct answer.",
      ),
      questionText: args.text(
        "Mất khoảng bao lâu?",
        "About how long does it take?",
      ),
      transcriptKo: QR_264_DIALOGUE_2_TIME,
      translation: args.text(
        "Mất khoảng 15 phút.",
        "It takes about 15 minutes.",
      ),
      choices: [
        {
          id: "time-5",
          text: args.text("5 phút", "5 minutes"),
        },
        {
          id: "time-15",
          text: args.text("15 phút", "15 minutes"),
        },
        {
          id: "time-30",
          text: args.text("30 phút", "30 minutes"),
        },
      ],
      correctChoiceId: "time-15",
      coverageTags: ["qr-listening", "hotel", "duration"],
      difficulty: "easy",
      pages: page(264),
      sourceRef: capture(
        "u16-qr-hotel-time-choice",
        264,
        "십오 분쯤 걸려요 multiple_choice tts",
      ),
      needsReview: args.needsReview,
    },
    {
      id: "u16-qr-hotel-transport-choice",
      sourceExerciseIds: ["wb16-qr-hotel-duration"],
      tts: tts(QR_264_DIALOGUE_2),
      type: "multiple_choice",
      prompt: args.text(
        "Nghe câu ngắn rồi chọn đáp án đúng.",
        "Listen to the short sentence and choose the correct answer.",
      ),
      questionText: args.text(
        "Đi bằng phương tiện gì?",
        "What do they take?",
      ),
      transcriptKo: QR_264_DIALOGUE_2,
      translation: args.text(
        "Đi xe buýt thì mất khoảng 15 phút.",
        "It takes about 15 minutes by bus.",
      ),
      choices: [
        {
          id: "transport-bus",
          text: args.text("xe buýt", "bus"),
        },
        {
          id: "transport-walk",
          text: args.text("đi bộ", "walking"),
        },
        {
          id: "transport-subway",
          text: args.text("tàu điện ngầm", "subway"),
        },
      ],
      correctChoiceId: "transport-bus",
      coverageTags: ["qr-listening", "hotel", "transport"],
      difficulty: "easy",
      pages: page(264),
      sourceRef: capture(
        "u16-qr-hotel-transport-choice",
        264,
        "버스를 타고 십오 분쯤 걸려요 multiple_choice tts",
      ),
      needsReview: args.needsReview,
    },
    {
      id: "u16-qr-airport-destination-image",
      sourceExerciseIds: ["wb16-qr-destination"],
      audioAssetId: "wb16-qr-airport-audio",
      clipStartMs: 0,
      clipEndMs: 2500,
      type: "choose_image",
      prompt: args.text(
        "Nghe đoạn ngắn rồi chọn nơi Jiyeon muốn đến.",
        "Listen to the short clip and choose Jiyeon's destination.",
      ),
      questionText: args.text(
        "Jiyeon muốn đến đâu?",
        "Where does Jiyeon want to go?",
      ),
      transcriptKo: "지연 씨는 공항에 가려고 해요.",
      translation: args.text("Jiyeon muốn đi sân bay.", "Jiyeon wants to go to the airport."),
      contextGroupId: "u16-qr-airport",
      contextTitle: args.text("Đi sân bay", "Going to the airport"),
      contextSummary: args.text(
        "Một đoạn nhắc tới điểm đến và lời khuyên bắt xe buýt.",
        "A short clip about a destination and bus advice.",
      ),
      choices: [
        {
          id: "airport",
          text: args.text("sân bay", "airport"),
          imagePath: "/generated/listening-cards/unit-16/airport.svg",
        },
        {
          id: "seoul-station",
          text: args.text("ga Seoul", "Seoul Station"),
          imagePath: "/generated/listening-cards/unit-16/seoul-station.svg",
        },
        {
          id: "terminal",
          text: args.text("bến xe", "terminal"),
          imagePath: "/generated/listening-cards/unit-16/terminal.svg",
        },
      ],
      correctChoiceId: "airport",
      coverageTags: ["qr-listening", "destination", "travel"],
      difficulty: "easy",
      pages: page(270),
      sourceRef: capture(
        "u16-qr-airport-destination-image",
        270,
        "지연 씨는 공항에 가려고 해요. choose_image clip",
      ),
      needsReview: args.needsReview,
    },
    {
      id: "u16-qr-airport-destination-fill",
      sourceExerciseIds: ["wb16-qr-destination"],
      audioAssetId: "wb16-qr-airport-audio",
      clipStartMs: 0,
      clipEndMs: 2500,
      type: "fill_blank",
      prompt: args.text(
        "Nghe đoạn ngắn rồi điền nơi muốn đến.",
        "Listen to the short clip and fill in the destination.",
      ),
      questionText: args.text(
        "Hoàn thành câu còn thiếu.",
        "Complete the missing destination.",
      ),
      transcriptKo: "지연 씨는 공항에 가려고 해요.",
      translation: args.text("Jiyeon muốn đi sân bay.", "Jiyeon wants to go to the airport."),
      contextGroupId: "u16-qr-airport",
      contextTitle: args.text("Đi sân bay", "Going to the airport"),
      contextSummary: args.text(
        "Một đoạn nhắc tới điểm đến và lời khuyên bắt xe buýt.",
        "A short clip about a destination and bus advice.",
      ),
      choices: [
        { id: "airport-fill", text: args.text("공항", "airport") },
        { id: "station-fill", text: args.text("서울역", "Seoul Station") },
        { id: "terminal-fill", text: args.text("터미널", "terminal") },
      ],
      correctText: "공항",
      acceptedAnswers: ["공항"],
      coverageTags: ["qr-listening", "destination", "fill-blank"],
      difficulty: "easy",
      pages: page(270),
      sourceRef: capture(
        "u16-qr-airport-destination-fill",
        270,
        "지연 씨는 ___에 가려고 해요. fill_blank clip",
      ),
      needsReview: args.needsReview,
    },
    {
      id: "u16-qr-airport-bus-fill",
      sourceExerciseIds: ["wb16-qr-destination"],
      audioAssetId: "wb16-qr-airport-audio",
      clipStartMs: 2100,
      clipEndMs: 5000,
      type: "fill_blank",
      prompt: args.text(
        "Nghe lời khuyên rồi điền số xe buýt.",
        "Listen to the advice clip and fill in the bus number.",
      ),
      questionText: args.text(
        "Điền số xe buýt được nhắc tới.",
        "Fill in the bus number that is mentioned.",
      ),
      transcriptKo: "여기에서 600번 버스를 타고 가세요.",
      translation: args.text(
        "Hãy bắt xe buýt số 600 từ đây.",
        "Take bus 600 from here.",
      ),
      contextGroupId: "u16-qr-airport",
      contextTitle: args.text("Đi sân bay", "Going to the airport"),
      contextSummary: args.text(
        "Một đoạn nhắc tới điểm đến và lời khuyên bắt xe buýt.",
        "A short clip about a destination and bus advice.",
      ),
      choices: [
        { id: "bus-100-fill", text: args.text("100", "100") },
        { id: "bus-600-fill", text: args.text("600", "600") },
        { id: "bus-900-fill", text: args.text("900", "900") },
      ],
      correctText: "600",
      acceptedAnswers: ["600"],
      coverageTags: ["qr-listening", "destination", "bus-number"],
      difficulty: "easy",
      pages: page(270),
      sourceRef: capture(
        "u16-qr-airport-bus-fill",
        270,
        "여기에서 600번 버스를 타고 가세요. fill_blank clip",
      ),
      needsReview: args.needsReview,
    },
    {
      id: "u16-qr-airport-order",
      sourceExerciseIds: ["wb16-qr-destination"],
      audioAssetId: "wb16-qr-airport-audio",
      clipStartMs: 2100,
      clipEndMs: 5000,
      type: "order_step",
      prompt: args.text(
        "Nghe lời khuyên rồi sắp xếp lại câu chỉ đường.",
        "Listen to the advice clip and arrange the sentence in order.",
      ),
      questionText: args.text(
        "Sắp xếp lại câu xuất hiện trong audio.",
        "Arrange the sentence that appears in the audio.",
      ),
      transcriptKo: "여기에서 600번 버스를 타고 가세요.",
      translation: args.text(
        "Hãy bắt xe buýt số 600 từ đây.",
        "Take bus 600 from here.",
      ),
      contextGroupId: "u16-qr-airport",
      contextTitle: args.text("Đi sân bay", "Going to the airport"),
      contextSummary: args.text(
        "Một đoạn nhắc tới điểm đến và lời khuyên bắt xe buýt.",
        "A short clip about a destination and bus advice.",
      ),
      choices: [
        { id: "airport-order-1", text: args.text("여기에서", "from here") },
        { id: "airport-order-2", text: args.text("600번", "bus 600") },
        { id: "airport-order-3", text: args.text("버스를", "the bus") },
        { id: "airport-order-4", text: args.text("타고", "take and") },
        { id: "airport-order-5", text: args.text("가세요.", "go please") },
      ],
      correctOrderChoiceIds: [
        "airport-order-1",
        "airport-order-2",
        "airport-order-3",
        "airport-order-4",
        "airport-order-5",
      ],
      coverageTags: ["qr-listening", "destination", "route-advice"],
      difficulty: "easy",
      pages: page(270),
      sourceRef: capture(
        "u16-qr-airport-order",
        270,
        "여기에서 600번 버스를 타고 가세요. order_step clip",
      ),
      needsReview: args.needsReview,
    },
  ];
}

export const UNIT_16_QR_LISTENING_PAGES = UNIT_16_QR_SEED.listeningPages;
