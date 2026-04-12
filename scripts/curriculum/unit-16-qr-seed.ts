import type {
  LocalizedText,
  ListeningTtsConfig,
  SourceAudioAsset,
  SourceListeningItem,
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

const QR_269_TRANSCRIPT =
  "리사: 실례합니다. 여기에서 서울역까지 어떻게 가요? 남자: 저기 정류장에서 100번 버스를 타십시오. 그 버스가 서울역까지 갑니다. 리사: 감사합니다. 그런데 여기에서 서울역까지 많이 멀어요? 남자: 아니요. 멀지 않아요.";
const QR_264_DIALOGUE_1 = "지금 길이 많이 막혀요";
const QR_264_DIALOGUE_2 = "버스를 타고 십오 분쯤 걸려요";
const QR_264_DIALOGUE_2_TIME = "십오 분쯤 걸려요";
const SERVICE_SCENE_PROMPT = "맞는 그림을 고르세요.";
const SERVICE_SCENE_PAGE = 268;

// PDF page 269 corresponds to the printed workbook page 268 in the local source PDF.
const SERVICE_SCENE_CROPS: readonly SeededQrImageCrop[] = [
  {
    id: "wb16-service-airport-counter",
    label: "Airport counter scene",
    page: 269,
    imagePath: "/generated/listening-cards/unit-16/airport-counter.png",
    bounds: { x: 88, y: 338, width: 400, height: 215 },
    sourceItemId: "u16-qr-service-book-ticket",
  },
  {
    id: "wb16-service-receptionist-help",
    label: "Receptionist help scene",
    page: 269,
    imagePath: "/generated/listening-cards/unit-16/receptionist-help.png",
    bounds: { x: 552, y: 338, width: 377, height: 215 },
    sourceItemId: "u16-qr-service-wait",
  },
  {
    id: "wb16-service-passport-request",
    label: "Passport request scene",
    page: 269,
    imagePath: "/generated/listening-cards/unit-16/passport-request.png",
    bounds: { x: 88, y: 670, width: 410, height: 185 },
    sourceItemId: "u16-qr-service-passport",
  },
  {
    id: "wb16-service-asking-about-person",
    label: "Asking about a person scene",
    page: 269,
    imagePath: "/generated/listening-cards/unit-16/asking-about-person.png",
    bounds: { x: 552, y: 670, width: 377, height: 185 },
    sourceItemId: "u16-qr-service-ask-min-guk",
  },
  {
    id: "wb16-service-restaurant-scene",
    label: "Restaurant scene",
    page: 269,
    imagePath: "/generated/listening-cards/unit-16/restaurant-scene.png",
    bounds: { x: 88, y: 1015, width: 410, height: 185 },
    sourceItemId: "u16-qr-service-book-ticket",
  },
];

function tts(
  textValue: string,
  voice: ListeningTtsConfig["voice"] = "ko-KR",
): ListeningTtsConfig {
  return {
    text: textValue,
    voice,
    speed: 0.9,
  };
}

function choiceText(label: "A" | "B"): LocalizedText {
  return text(label, label);
}

export const UNIT_16_QR_SEED: UnitQrSeedDefinition = {
  listeningPages: [269, 270, 271],
  imageCrops: SERVICE_SCENE_CROPS,
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
          id: "wb16-qr-service-scenes",
          exerciseType: "listening",
          prompt: args.text(
            "Nghe từng câu và chọn đúng hình minh họa trong sách.",
            "Listen to each sentence and choose the matching textbook illustration.",
          ),
          localizedText: args.text("tình huống dịch vụ", "service scene"),
          answer: "tình huống dịch vụ",
          metadata: {
            target: "qr_listening",
            variant: "service_scene_tts",
          },
          coverageTags: ["qr-listening", "service-scene", "image-choice"],
          pages: page(SERVICE_SCENE_PAGE),
          sourceRef: capture(
            "wb16-qr-service-scenes",
            SERVICE_SCENE_PAGE,
            "Workbook page 268 service-scene listening. Match each fixed sentence to the correct textbook illustration.",
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
      id: "u16-qr-service-ask-min-guk",
      sourceExerciseIds: ["wb16-qr-service-scenes"],
      tts: tts("민국 씨 자리에 있습니까?", "female"),
      type: "choose_image",
      prompt: text(SERVICE_SCENE_PROMPT, SERVICE_SCENE_PROMPT),
      transcriptKo: "민국 씨 자리에 있습니까?",
      choices: [
        { id: "a", text: choiceText("A"), imageId: "asking_about_person" },
        { id: "b", text: choiceText("B"), imageId: "receptionist_help" },
      ],
      correctChoiceId: "a",
      coverageTags: ["qr-listening", "asking-about-person", "person"],
      difficulty: "easy",
      pages: page(SERVICE_SCENE_PAGE),
      sourceRef: capture(
        "u16-qr-service-ask-min-guk",
        SERVICE_SCENE_PAGE,
        "민국 씨 자리에 있습니까? choose_image tts",
      ),
      needsReview: args.needsReview,
    },
    {
      id: "u16-qr-service-wait",
      sourceExerciseIds: ["wb16-qr-service-scenes"],
      tts: tts("잠시만 기다리십시오.", "male"),
      type: "choose_image",
      prompt: text(SERVICE_SCENE_PROMPT, SERVICE_SCENE_PROMPT),
      transcriptKo: "잠시만 기다리십시오.",
      choices: [
        { id: "a", text: choiceText("A"), imageId: "asking_about_person" },
        { id: "b", text: choiceText("B"), imageId: "receptionist_help" },
      ],
      correctChoiceId: "b",
      coverageTags: ["qr-listening", "receptionist-help", "wait"],
      difficulty: "easy",
      pages: page(SERVICE_SCENE_PAGE),
      sourceRef: capture(
        "u16-qr-service-wait",
        SERVICE_SCENE_PAGE,
        "잠시만 기다리십시오. choose_image tts",
      ),
      needsReview: args.needsReview,
    },
    {
      id: "u16-qr-service-book-ticket",
      sourceExerciseIds: ["wb16-qr-service-scenes"],
      tts: tts("비행기 표를 예매하고 싶습니다.", "male"),
      type: "choose_image",
      prompt: text(SERVICE_SCENE_PROMPT, SERVICE_SCENE_PROMPT),
      transcriptKo: "비행기 표를 예매하고 싶습니다.",
      choices: [
        { id: "a", text: choiceText("A"), imageId: "airport_counter" },
        { id: "b", text: choiceText("B"), imageId: "restaurant_scene" },
      ],
      correctChoiceId: "a",
      coverageTags: ["qr-listening", "airport-counter", "ticket"],
      difficulty: "easy",
      pages: page(SERVICE_SCENE_PAGE),
      sourceRef: capture(
        "u16-qr-service-book-ticket",
        SERVICE_SCENE_PAGE,
        "비행기 표를 예매하고 싶습니다. choose_image tts",
      ),
      needsReview: args.needsReview,
    },
    {
      id: "u16-qr-service-passport",
      sourceExerciseIds: ["wb16-qr-service-scenes"],
      tts: tts("그럼 여권을 주십시오.", "male"),
      type: "choose_image",
      prompt: text(SERVICE_SCENE_PROMPT, SERVICE_SCENE_PROMPT),
      transcriptKo: "그럼 여권을 주십시오.",
      choices: [
        { id: "a", text: choiceText("A"), imageId: "airport_counter" },
        { id: "b", text: choiceText("B"), imageId: "passport_request" },
      ],
      correctChoiceId: "b",
      coverageTags: ["qr-listening", "passport-request", "passport"],
      difficulty: "easy",
      pages: page(SERVICE_SCENE_PAGE),
      sourceRef: capture(
        "u16-qr-service-passport",
        SERVICE_SCENE_PAGE,
        "그럼 여권을 주십시오. choose_image tts",
      ),
      needsReview: args.needsReview,
    },
    {
      id: "u16-qr-service-phone-number",
      sourceExerciseIds: ["wb16-qr-service-scenes"],
      tts: tts("전화번호는 어디에 써요?", "female"),
      type: "choose_image",
      prompt: text(SERVICE_SCENE_PROMPT, SERVICE_SCENE_PROMPT),
      transcriptKo: "전화번호는 어디에 써요?",
      choices: [
        { id: "a", text: choiceText("A"), imageId: "receptionist_help" },
        { id: "b", text: choiceText("B"), imageId: "asking_about_person" },
      ],
      correctChoiceId: "a",
      coverageTags: ["qr-listening", "receptionist-help", "phone-number"],
      difficulty: "easy",
      pages: page(SERVICE_SCENE_PAGE),
      sourceRef: capture(
        "u16-qr-service-phone-number",
        SERVICE_SCENE_PAGE,
        "전화번호는 어디에 써요? choose_image tts",
      ),
      needsReview: args.needsReview,
    },
    {
      id: "u16-qr-service-name-below",
      sourceExerciseIds: ["wb16-qr-service-scenes"],
      tts: tts("이름 아래에 쓰십시오.", "male"),
      type: "choose_image",
      prompt: text(SERVICE_SCENE_PROMPT, SERVICE_SCENE_PROMPT),
      transcriptKo: "이름 아래에 쓰십시오.",
      choices: [
        { id: "a", text: choiceText("A"), imageId: "passport_request" },
        { id: "b", text: choiceText("B"), imageId: "receptionist_help" },
      ],
      correctChoiceId: "b",
      coverageTags: ["qr-listening", "receptionist-help", "write-name"],
      difficulty: "easy",
      pages: page(SERVICE_SCENE_PAGE),
      sourceRef: capture(
        "u16-qr-service-name-below",
        SERVICE_SCENE_PAGE,
        "이름 아래에 쓰십시오. choose_image tts",
      ),
      needsReview: args.needsReview,
    },
    {
      id: "u16-qr-service-which-exercise",
      sourceExerciseIds: ["wb16-qr-service-scenes"],
      tts: tts("무슨 운동이 좋을까요?", "female"),
      type: "choose_image",
      prompt: text(SERVICE_SCENE_PROMPT, SERVICE_SCENE_PROMPT),
      transcriptKo: "무슨 운동이 좋을까요?",
      choices: [
        { id: "a", text: choiceText("A"), imageId: "asking_about_person" },
        { id: "b", text: choiceText("B"), imageId: "restaurant_scene" },
      ],
      correctChoiceId: "a",
      coverageTags: ["qr-listening", "asking-about-person", "exercise"],
      difficulty: "easy",
      pages: page(SERVICE_SCENE_PAGE),
      sourceRef: capture(
        "u16-qr-service-which-exercise",
        SERVICE_SCENE_PAGE,
        "무슨 운동이 좋을까요? choose_image tts",
      ),
      needsReview: args.needsReview,
    },
    {
      id: "u16-qr-service-walk-daily",
      sourceExerciseIds: ["wb16-qr-service-scenes"],
      tts: tts("매일 30분 걸으십시오.", "male"),
      type: "choose_image",
      prompt: text(SERVICE_SCENE_PROMPT, SERVICE_SCENE_PROMPT),
      transcriptKo: "매일 30분 걸으십시오.",
      choices: [
        { id: "a", text: choiceText("A"), imageId: "receptionist_help" },
        { id: "b", text: choiceText("B"), imageId: "asking_about_person" },
      ],
      correctChoiceId: "b",
      coverageTags: ["qr-listening", "asking-about-person", "walking"],
      difficulty: "easy",
      pages: page(SERVICE_SCENE_PAGE),
      sourceRef: capture(
        "u16-qr-service-walk-daily",
        SERVICE_SCENE_PAGE,
        "매일 30분 걸으십시오. choose_image tts",
      ),
      needsReview: args.needsReview,
    },
  ];
}

export const UNIT_16_QR_LISTENING_PAGES = UNIT_16_QR_SEED.listeningPages;
