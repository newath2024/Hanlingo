import type {
  LocalizedText,
  SourceCaptureRef,
  SourceDocumentInfo,
  SourceUnit,
  SourceWorkbookExercise,
} from "@/types/curriculum";
import {
  createUnit16QrAudioAssets,
  createUnit16QrWorkbookExercises,
} from "./unit-16-qr-seed";

export const UNIT_16_PAGE_SPANS = {
  textbook: {
    startPage: 208,
    endPage: 218,
  },
  workbook: {
    startPage: 261,
    endPage: 276,
  },
} as const;

function text(vi: string, en: string): LocalizedText {
  return { vi, en };
}

function page(startPage: number, endPage = startPage) {
  return { startPage, endPage };
}

function capture(
  sourceItemId: string,
  pageNumber: number,
  rawText: string,
  confidence = 0.98,
): SourceCaptureRef {
  return {
    rawText,
    confidence,
    sourceBlockId: `${sourceItemId}-seed`,
    page: pageNumber,
  };
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

export function createUnit16SourceSeed(
  documents: {
    textbook: SourceDocumentInfo;
    workbook: SourceDocumentInfo;
  },
  options?: {
    needsReview?: boolean;
  },
): SourceUnit {
  const needsReview = options?.needsReview ?? false;
  const qrSeedArgs = {
    needsReview,
    text,
    capture,
  };

  const workbookExercises: SourceWorkbookExercise[] = [
    workbookExercise(
      {
        id: "wb16-write-transport",
        exerciseType: "translation",
        prompt: text(
          "Viet cum 'phuong tien giao thong' bang tieng Han.",
          "Write the phrase 'means of transportation' in Korean.",
        ),
        localizedText: text("phuong tien giao thong", "means of transportation"),
        answer: "교통수단",
        metadata: {
          direction: "meaning_to_ko",
        },
        coverageTags: ["review", "transport", "category"],
        pages: page(261),
        sourceRef: capture("wb16-write-transport", 261, "교통수단"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-write-transport-use",
        exerciseType: "translation",
        prompt: text(
          "Viet cum 'su dung phuong tien giao thong' bang tieng Han.",
          "Write the phrase 'using transportation' in Korean.",
        ),
        localizedText: text("su dung phuong tien giao thong", "using transportation"),
        answer: "교통수단 이용",
        metadata: {
          direction: "meaning_to_ko",
        },
        coverageTags: ["review", "transport", "category"],
        pages: page(261),
        sourceRef: capture("wb16-write-transport-use", 261, "교통수단 이용"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-match-bus",
        exerciseType: "matching",
        prompt: text("Noi tranh voi tu dung.", "Match the picture with the correct word."),
        koreanText: "버스",
        localizedText: text("xe buyt", "bus"),
        answer: "xe buyt",
        metadata: { target: "vocab" },
        coverageTags: ["transport", "vocab", "bus"],
        pages: page(262),
        sourceRef: capture("wb16-match-bus", 262, "버스"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-match-train",
        exerciseType: "matching",
        prompt: text("Noi tranh voi tu dung.", "Match the picture with the correct word."),
        koreanText: "기차",
        localizedText: text("tau hoa", "train"),
        answer: "tau hoa",
        metadata: { target: "vocab" },
        coverageTags: ["transport", "vocab", "train"],
        pages: page(262),
        sourceRef: capture("wb16-match-train", 262, "기차"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-match-subway",
        exerciseType: "matching",
        prompt: text("Noi tranh voi tu dung.", "Match the picture with the correct word."),
        koreanText: "지하철",
        localizedText: text("tau dien ngam", "subway"),
        answer: "tau dien ngam",
        metadata: { target: "vocab" },
        coverageTags: ["transport", "vocab", "subway"],
        pages: page(262),
        sourceRef: capture("wb16-match-subway", 262, "지하철"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-match-airplane",
        exerciseType: "matching",
        prompt: text("Noi tranh voi tu dung.", "Match the picture with the correct word."),
        koreanText: "비행기",
        localizedText: text("may bay", "airplane"),
        answer: "may bay",
        metadata: { target: "vocab" },
        coverageTags: ["transport", "vocab", "airplane"],
        pages: page(262),
        sourceRef: capture("wb16-match-airplane", 262, "비행기"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-match-station",
        exerciseType: "matching",
        prompt: text("Noi tranh voi tu dung.", "Match the picture with the correct word."),
        koreanText: "역",
        localizedText: text("ga", "station"),
        answer: "ga",
        metadata: { target: "vocab" },
        coverageTags: ["transport-use", "vocab", "station"],
        pages: page(262),
        sourceRef: capture("wb16-match-station", 262, "역"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-match-bus-stop",
        exerciseType: "matching",
        prompt: text("Noi tranh voi tu dung.", "Match the picture with the correct word."),
        koreanText: "정류장",
        localizedText: text("tram xe buyt", "bus stop"),
        answer: "tram xe buyt",
        metadata: { target: "vocab" },
        coverageTags: ["transport-use", "vocab", "bus-stop"],
        pages: page(262),
        sourceRef: capture("wb16-match-bus-stop", 262, "정류장"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-future-transfer",
        exerciseType: "fill_blank",
        prompt: text(
          "Chon cum thich hop de dien vao cho trong.",
          "Fill in the blank with the correct phrase.",
        ),
        koreanText: "이 비행기는 한국까지 바로 가지 않아서 비행기를 ___.",
        localizedText: text("toi se phai chuyen may bay", "I will have to transfer planes"),
        answer: "갈아탈 거예요",
        metadata: {
          target: "grammar",
          choices: ["갈아탈 거예요", "걸어갈 거예요", "탈 거예요"],
        },
        coverageTags: ["transport-use", "transfer", "future"],
        pages: page(263),
        sourceRef: capture("wb16-future-transfer", 263, "비행기를 갈아탈 거예요."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-walk-school",
        exerciseType: "fill_blank",
        prompt: text(
          "Chon cum thich hop de dien vao cho trong.",
          "Fill in the blank with the correct phrase.",
        ),
        koreanText: "저는 운동하러 학교까지 ___.",
        localizedText: text("toi di bo den truong de tap the duc", "I walk to school for exercise"),
        answer: "걸어가요",
        metadata: {
          target: "grammar",
          choices: ["걸어가요", "갈아타요", "타요"],
        },
        coverageTags: ["transport-use", "walk", "movement"],
        pages: page(263),
        sourceRef: capture("wb16-walk-school", 263, "학교까지 걸어가요."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-bike-ride",
        exerciseType: "fill_blank",
        prompt: text(
          "Chon cum thich hop de dien vao cho trong.",
          "Fill in the blank with the correct phrase.",
        ),
        koreanText: "저는 자전거를 ___.",
        localizedText: text("toi co the di xe dap", "I can ride a bicycle"),
        answer: "탈 수 있어요",
        metadata: {
          target: "grammar",
          choices: ["탈 수 있어요", "걸어갈 수 있어요", "갈아탈 수 있어요"],
        },
        coverageTags: ["transport-use", "ride", "ability"],
        pages: page(263),
        sourceRef: capture("wb16-bike-ride", 263, "자전거를 탈 수 있어요."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-library-from",
        exerciseType: "fill_blank",
        prompt: text("Dien tro tu dung vao cho trong.", "Fill in the correct particle."),
        koreanText: "도서관___ 식당까지 버스를 타고 가요.",
        localizedText: text("tu thu vien den nha hang", "from the library to the restaurant"),
        answer: "에서",
        metadata: {
          target: "grammar",
          grammarTag: "에서, 까지",
          choices: ["에서", "까지"],
        },
        coverageTags: ["grammar", "from-to", "library", "restaurant"],
        pages: page(265),
        sourceRef: capture("wb16-library-from", 265, "도서관에서 식당까지 버스를 타고 가요."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-restaurant-to",
        exerciseType: "fill_blank",
        prompt: text("Dien tro tu dung vao cho trong.", "Fill in the correct particle."),
        koreanText: "도서관에서 식당___ 버스를 타고 가요.",
        localizedText: text("den nha hang", "to the restaurant"),
        answer: "까지",
        metadata: {
          target: "grammar",
          grammarTag: "에서, 까지",
          choices: ["에서", "까지"],
        },
        coverageTags: ["grammar", "from-to", "library", "restaurant"],
        pages: page(265),
        sourceRef: capture("wb16-restaurant-to", 265, "도서관에서 식당까지 버스를 타고 가요."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-subway-from",
        exerciseType: "fill_blank",
        prompt: text("Dien tro tu dung vao cho trong.", "Fill in the correct particle."),
        koreanText: "지하철역___ 여행사까지 걸어가요.",
        localizedText: text(
          "tu ga tau dien ngam den cong ty du lich",
          "from the subway station to the travel agency",
        ),
        answer: "에서",
        metadata: {
          target: "grammar",
          grammarTag: "에서, 까지",
          choices: ["에서", "까지"],
        },
        coverageTags: ["grammar", "from-to", "subway", "agency"],
        pages: page(265),
        sourceRef: capture("wb16-subway-from", 265, "지하철역에서 여행사까지 걸어가요."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-agency-to",
        exerciseType: "fill_blank",
        prompt: text("Dien tro tu dung vao cho trong.", "Fill in the correct particle."),
        koreanText: "지하철역에서 여행사___ 걸어가요.",
        localizedText: text("den cong ty du lich", "to the travel agency"),
        answer: "까지",
        metadata: {
          target: "grammar",
          grammarTag: "에서, 까지",
          choices: ["에서", "까지"],
        },
        coverageTags: ["grammar", "from-to", "subway", "agency"],
        pages: page(265),
        sourceRef: capture("wb16-agency-to", 265, "지하철역에서 여행사까지 걸어가요."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-company-from",
        exerciseType: "fill_blank",
        prompt: text("Dien tro tu dung vao cho trong.", "Fill in the correct particle."),
        koreanText: "회사___ 공원까지 가까워요.",
        localizedText: text(
          "tu cong ty den cong vien thi gan",
          "it is close from the company to the park",
        ),
        answer: "에서",
        metadata: {
          target: "grammar",
          grammarTag: "에서, 까지",
          choices: ["에서", "까지"],
        },
        coverageTags: ["grammar", "from-to", "company", "park"],
        pages: page(265),
        sourceRef: capture("wb16-company-from", 265, "회사에서 공원까지 가까워요."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-park-to",
        exerciseType: "fill_blank",
        prompt: text("Dien tro tu dung vao cho trong.", "Fill in the correct particle."),
        koreanText: "회사에서 공원___ 가까워요.",
        localizedText: text("den cong vien", "to the park"),
        answer: "까지",
        metadata: {
          target: "grammar",
          grammarTag: "에서, 까지",
          choices: ["에서", "까지"],
        },
        coverageTags: ["grammar", "from-to", "company", "park"],
        pages: page(265),
        sourceRef: capture("wb16-park-to", 265, "회사에서 공원까지 가까워요."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-command-wash",
        exerciseType: "fill_blank",
        prompt: text("Hoan thanh menh lenh lich su.", "Complete the polite command."),
        koreanText: "먼저 야채들을 ___.",
        localizedText: text("hay rua rau truoc", "wash the vegetables first"),
        answer: "씻으십시오",
        metadata: {
          target: "grammar",
          grammarTag: "-으십시오/-십시오",
          choices: ["씻으십시오", "들으십시오", "누우십시오"],
        },
        coverageTags: ["grammar", "command", "cooking"],
        pages: page(267),
        sourceRef: capture("wb16-command-wash", 267, "먼저 야채들을 씻으십시오."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-command-walk-museum",
        exerciseType: "fill_blank",
        prompt: text("Hoan thanh menh lenh lich su.", "Complete the polite command."),
        koreanText: "박물관이 여기에서 가깝습니다. ___.",
        localizedText: text("hay di bo den bao tang", "walk to the museum"),
        answer: "걸어가십시오",
        metadata: {
          target: "grammar",
          grammarTag: "-으십시오/-십시오",
          choices: ["걸어가십시오", "오십시오", "누우십시오"],
        },
        coverageTags: ["grammar", "command", "museum"],
        pages: page(267),
        sourceRef: capture(
          "wb16-command-walk-museum",
          267,
          "박물관이 여기에서 가깝습니다. 걸어가십시오.",
        ),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-command-listen",
        exerciseType: "fill_blank",
        prompt: text("Hoan thanh menh lenh lich su.", "Complete the polite command."),
        koreanText: "그럼 한국 노래를 많이 ___.",
        localizedText: text("hay nghe nhieu bai hat Han Quoc", "listen to a lot of Korean songs"),
        answer: "들으십시오",
        metadata: {
          target: "grammar",
          grammarTag: "-으십시오/-십시오",
          choices: ["들으십시오", "씻으십시오", "오십시오"],
        },
        coverageTags: ["grammar", "command", "music"],
        pages: page(267),
        sourceRef: capture("wb16-command-listen", 267, "그럼 한국 노래를 많이 들으십시오."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-command-lie-down",
        exerciseType: "fill_blank",
        prompt: text("Hoan thanh menh lenh lich su.", "Complete the polite command."),
        koreanText: "한번 봅시다. 여기에 ___.",
        localizedText: text("hay nam xuong o day", "lie down here"),
        answer: "누우십시오",
        metadata: {
          target: "grammar",
          grammarTag: "-으십시오/-십시오",
          choices: ["누우십시오", "들으십시오", "씻으십시오"],
        },
        coverageTags: ["grammar", "command", "hospital"],
        pages: page(267),
        sourceRef: capture("wb16-command-lie-down", 267, "한번 봅시다. 여기에 누우십시오."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-reading-train",
        exerciseType: "fill_blank",
        prompt: text(
          "Dien dong tu qua khu thich hop vao cho trong.",
          "Fill in the correct past-tense verb.",
        ),
        koreanText: "서울역에서 기차를 ___.",
        localizedText: text("toi da di tau o ga Seoul", "I took a train at Seoul Station"),
        answer: "탔습니다",
        metadata: {
          target: "reading",
          choices: ["탔습니다", "갈아탔습니다", "걸렸습니다"],
        },
        coverageTags: ["reading", "busan", "train"],
        pages: page(271),
        sourceRef: capture("wb16-reading-train", 271, "서울역에서 기차를 탔습니다."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-reading-time",
        exerciseType: "fill_blank",
        prompt: text(
          "Dien dong tu qua khu thich hop vao cho trong.",
          "Fill in the correct past-tense verb.",
        ),
        koreanText: "부산역까지 세 시간 ___.",
        localizedText: text(
          "da mat ba tieng den ga Busan",
          "it took three hours to Busan Station",
        ),
        answer: "걸렸습니다",
        metadata: {
          target: "reading",
          choices: ["걸렸습니다", "탔습니다", "갈아탔습니다"],
        },
        coverageTags: ["reading", "busan", "time"],
        pages: page(271),
        sourceRef: capture("wb16-reading-time", 271, "부산역까지 세 시간 걸렸습니다."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-reading-transfer",
        exerciseType: "fill_blank",
        prompt: text(
          "Dien dong tu qua khu thich hop vao cho trong.",
          "Fill in the correct past-tense verb.",
        ),
        koreanText: "서면역에서 한 번 ___.",
        localizedText: text(
          "toi da chuyen tau mot lan o ga Seomyeon",
          "I transferred once at Seomyeon Station",
        ),
        answer: "갈아탔습니다",
        metadata: {
          target: "reading",
          choices: ["갈아탔습니다", "걸렸습니다", "탔습니다"],
        },
        coverageTags: ["reading", "busan", "transfer"],
        pages: page(271),
        sourceRef: capture("wb16-reading-transfer", 271, "서면역에서 한 번 갈아탔습니다."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-reading-gyeongju-bus",
        exerciseType: "fill_blank",
        prompt: text(
          "Dua vao bai doc va dien dap an dung.",
          "Use the reading passage to fill in the correct answer.",
        ),
        koreanText: "서울에서 경주까지 ___를 타고 갔습니다.",
        localizedText: text(
          "nguoi nay da di Gyeongju bang xe buyt",
          "the person went to Gyeongju by bus",
        ),
        answer: "버스",
        metadata: {
          target: "reading",
          choices: ["버스", "기차", "택시"],
        },
        coverageTags: ["reading", "gyeongju", "bus"],
        pages: page(272),
        sourceRef: capture(
          "wb16-reading-gyeongju-bus",
          272,
          "서울에서 경주까지 버스를 타고 갔습니다.",
        ),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-reading-not-used",
        exerciseType: "fill_blank",
        prompt: text(
          "Dua vao bai doc va dien dap an dung.",
          "Use the reading passage to fill in the correct answer.",
        ),
        koreanText: "이 사람이 이용하지 않은 교통수단은 ___입니다.",
        localizedText: text(
          "phuong tien nguoi nay khong dung la tau dien ngam",
          "the transport this person did not use was the subway",
        ),
        answer: "지하철",
        metadata: {
          target: "reading",
          choices: ["버스", "기차", "지하철"],
        },
        coverageTags: ["reading", "gyeongju", "transport"],
        pages: page(272),
        sourceRef: capture(
          "wb16-reading-not-used",
          272,
          "이 사람이 이용하지 않은 교통수단은 지하철입니다.",
        ),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-extension-line3",
        exerciseType: "translation",
        prompt: text(
          "Viet cau huong dan duong di den Gyeongbokgung.",
          "Write the route instruction to Gyeongbokgung.",
        ),
        localizedText: text(
          "Hay di tau dien ngam tuyen 3 va xuong o Gyeongbokgung.",
          "Take Line 3 and get off at Gyeongbokgung.",
        ),
        answer: "지하철 3호선을 타고 경복궁에서 내리십시오.",
        metadata: {
          direction: "meaning_to_ko",
        },
        coverageTags: ["extension", "directions", "commands"],
        pages: page(273),
        sourceRef: capture(
          "wb16-extension-line3",
          273,
          "지하철 3호선을 타고 경복궁에서 내리십시오.",
        ),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-extension-songs",
        exerciseType: "translation",
        prompt: text(
          "Viet mot loi khuyen lich su cho nguoi muon hoc tieng Han.",
          "Write a polite suggestion for someone who wants to study Korean.",
        ),
        localizedText: text(
          "Hay nghe nhieu bai hat Han Quoc.",
          "Listen to a lot of Korean songs.",
        ),
        answer: "한국 노래를 많이 들으십시오.",
        metadata: {
          direction: "meaning_to_ko",
        },
        coverageTags: ["extension", "advice", "commands"],
        pages: page(274),
        sourceRef: capture("wb16-extension-songs", 274, "한국 노래를 많이 들으십시오."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb16-extension-find-hotel",
        exerciseType: "translation",
        prompt: text(
          "Viet mot loi khuyen cho nguoi ban di du lich nuoc ngoai lan dau.",
          "Write a suggestion for a friend traveling abroad for the first time.",
        ),
        localizedText: text(
          "Hay tim cho o truoc.",
          "Find accommodation in advance.",
        ),
        answer: "미리 숙소를 찾으십시오.",
        metadata: {
          direction: "meaning_to_ko",
        },
        coverageTags: ["extension", "travel", "commands"],
        pages: page(275),
        sourceRef: capture("wb16-extension-find-hotel", 275, "미리 숙소를 찾으십시오."),
      },
      needsReview,
    ),
    ...createUnit16QrWorkbookExercises(qrSeedArgs),
  ];

  return {
    unitId: "16",
    unitNumber: 16,
    title: text(
      "Tu day den ga Seoul bang cach nao?",
      "How do I get to Seoul Station from here?",
    ),
    needsReview,
    extractionMode: needsReview ? "seeded_raw_blocks" : "manual_seed",
    sourceDocuments: documents,
    textbook: {
      vocab: [
        {
          id: "v-bus",
          korean: "버스",
          translations: text("xe buyt", "bus"),
          romanization: "beoseu",
          pages: page(208),
          sourceRef: capture("v-bus", 208, "버스"),
          needsReview,
        },
        {
          id: "v-subway",
          korean: "지하철",
          translations: text("tau dien ngam", "subway"),
          romanization: "jihacheol",
          pages: page(208),
          sourceRef: capture("v-subway", 208, "지하철"),
          needsReview,
        },
        {
          id: "v-train",
          korean: "기차",
          translations: text("tau hoa", "train"),
          romanization: "gicha",
          pages: page(208),
          sourceRef: capture("v-train", 208, "기차"),
          needsReview,
        },
        {
          id: "v-airplane",
          korean: "비행기",
          translations: text("may bay", "airplane"),
          romanization: "bihaenggi",
          pages: page(208),
          sourceRef: capture("v-airplane", 208, "비행기"),
          needsReview,
        },
        {
          id: "v-boat",
          korean: "배",
          translations: text("thuyen", "boat"),
          romanization: "bae",
          pages: page(208),
          sourceRef: capture("v-boat", 208, "배"),
          needsReview,
        },
        {
          id: "v-station",
          korean: "역",
          translations: text("ga", "station"),
          romanization: "yeok",
          pages: page(208),
          sourceRef: capture("v-station", 208, "역"),
          needsReview,
        },
        {
          id: "v-bus-stop",
          korean: "정류장",
          translations: text("tram xe buyt", "bus stop"),
          romanization: "jeongnyujang",
          pages: page(208),
          sourceRef: capture("v-bus-stop", 208, "정류장"),
          needsReview,
        },
        {
          id: "v-terminal",
          korean: "터미널",
          translations: text("ben xe", "terminal"),
          romanization: "teomineol",
          pages: page(208),
          sourceRef: capture("v-terminal", 208, "터미널"),
          needsReview,
        },
        {
          id: "v-ride",
          korean: "타다",
          translations: text("di bang, len xe", "ride, take"),
          romanization: "tada",
          pages: page(208),
          sourceRef: capture("v-ride", 208, "타다"),
          needsReview,
        },
        {
          id: "v-walk",
          korean: "걸어가다",
          translations: text("di bo", "walk"),
          romanization: "georeogada",
          pages: page(208),
          sourceRef: capture("v-walk", 208, "걸어가다"),
          needsReview,
        },
        {
          id: "v-transfer",
          korean: "갈아타다",
          translations: text("chuyen xe, chuyen tau", "transfer"),
          romanization: "garatada",
          pages: page(208),
          sourceRef: capture("v-transfer", 208, "갈아타다"),
          needsReview,
        },
        {
          id: "v-distance",
          korean: "거리",
          translations: text("khoang cach", "distance"),
          romanization: "geori",
          pages: page(209),
          sourceRef: capture("v-distance", 209, "거리"),
          needsReview,
        },
        {
          id: "v-far",
          korean: "멀다",
          translations: text("xa", "be far"),
          romanization: "meolda",
          pages: page(209),
          sourceRef: capture("v-far", 209, "멀다"),
          needsReview,
        },
        {
          id: "v-near",
          korean: "가깝다",
          translations: text("gan", "be near"),
          romanization: "gakkapda",
          pages: page(209),
          sourceRef: capture("v-near", 209, "가깝다"),
          needsReview,
        },
        {
          id: "v-how-long",
          korean: "얼마나",
          translations: text("bao lau, bao xa", "how long, how far"),
          romanization: "eolmana",
          pages: page(209),
          sourceRef: capture("v-how-long", 209, "얼마나"),
          needsReview,
        },
        {
          id: "v-traffic-jam",
          korean: "길이 막히다",
          translations: text("duong bi tac", "the road is jammed"),
          romanization: "giri makhida",
          pages: page(209),
          sourceRef: capture("v-traffic-jam", 209, "길이 막히다"),
          needsReview,
        },
        {
          id: "v-take-time",
          korean: "(시간이) 걸리다",
          translations: text("mat thoi gian", "take time"),
          romanization: "sigani geollida",
          pages: page(209),
          sourceRef: capture("v-take-time", 209, "(시간이) 걸리다"),
          needsReview,
        },
      ],
      grammar: [
        {
          id: "g-from-to",
          pattern: "명사 + 에서, 까지",
          explanation: text(
            "Dung de noi diem bat dau va diem ket thuc cua duong di hoac pham vi di chuyen.",
            "Used to mark the starting point and ending point of a route or movement range.",
          ),
          exampleIds: ["ex-home-school-time", "ex-busan-trip", "ex-busan-transfer"],
          pages: page(210),
          sourceRef: capture("g-from-to", 210, "명사 + 에서, 까지"),
          needsReview,
        },
        {
          id: "g-command",
          pattern: "동사 + -으십시오/-십시오",
          explanation: text(
            "Dung de dua ra huong dan, menh lenh lich su, hoac loi khuyen trang trong.",
            "Used for polite instructions, commands, or formal suggestions.",
          ),
          exampleIds: ["ex-airport-shuttle", "ex-wait", "ex-come-tomorrow"],
          pages: page(211),
          sourceRef: capture("g-command", 211, "동사 + -으십시오/-십시오"),
          needsReview,
        },
      ],
      dialogue: [
        {
          id: "d-title-question",
          speaker: "Lisa",
          korean: "여기에서 서울역까지 어떻게 가요?",
          translations: text(
            "Tu day den ga Seoul bang cach nao?",
            "How do I get to Seoul Station from here?",
          ),
          pages: page(214),
          sourceRef: capture("d-title-question", 214, "여기에서 서울역까지 어떻게 가요?"),
          needsReview,
        },
        {
          id: "d-bus-stop-instruction",
          speaker: "Man",
          korean: "저기 정류장에서 100번 버스를 타십시오.",
          translations: text(
            "Hay di den tram xe buyt dang kia va len xe buyt so 100.",
            "Take bus 100 at that bus stop over there.",
          ),
          pages: page(214),
          sourceRef: capture(
            "d-bus-stop-instruction",
            214,
            "저기 정류장에서 100번 버스를 타십시오.",
          ),
          needsReview,
        },
        {
          id: "d-bus-route",
          speaker: "Man",
          korean: "그 버스가 서울역까지 갑니다.",
          translations: text(
            "Chiec xe buyt do di den tan ga Seoul.",
            "That bus goes all the way to Seoul Station.",
          ),
          pages: page(214),
          sourceRef: capture("d-bus-route", 214, "그 버스가 서울역까지 갑니다."),
          needsReview,
        },
        {
          id: "d-distance-question",
          speaker: "Lisa",
          korean: "여기에서 서울역까지 많이 멀어요?",
          translations: text(
            "Tu day den ga Seoul co xa lam khong?",
            "Is it very far from here to Seoul Station?",
          ),
          pages: page(214),
          sourceRef: capture("d-distance-question", 214, "여기에서 서울역까지 많이 멀어요?"),
          needsReview,
        },
        {
          id: "d-distance-answer",
          speaker: "Man",
          korean: "아니요. 멀지 않아요.",
          translations: text("Khong dau. Khong xa.", "No. It is not far."),
          pages: page(214),
          sourceRef: capture("d-distance-answer", 214, "아니요. 멀지 않아요."),
          needsReview,
        },
        {
          id: "d-bank-paper",
          speaker: "Clerk",
          korean: "이 종이를 쓰십시오. 그리고 여기에 똑같이 쓰십시오.",
          translations: text(
            "Hay viet vao to giay nay, roi viet lai y nhu vay o day.",
            "Fill out this paper, and then write the same thing here.",
          ),
          pages: page(213),
          sourceRef: capture(
            "d-bank-paper",
            213,
            "이 종이를 쓰십시오. 그리고 여기에 똑같이 쓰십시오.",
          ),
          needsReview,
        },
        {
          id: "d-bank-finish",
          speaker: "Clerk",
          korean: "여기 통장입니다. 받으십시오.",
          translations: text(
            "Day la so ngan hang cua ban. Xin hay nhan lay.",
            "Here is your bankbook. Please take it.",
          ),
          pages: page(213),
          sourceRef: capture("d-bank-finish", 213, "여기 통장입니다. 받으십시오."),
          needsReview,
        },
      ],
      examples: [
        {
          id: "ex-home-school-time",
          korean: "집에서 학교까지 시간이 얼마나 걸려요?",
          translations: text(
            "Tu nha den truong mat bao lau?",
            "How long does it take from home to school?",
          ),
          grammarTags: ["에서, 까지"],
          pages: page(210),
          sourceRef: capture("ex-home-school-time", 210, "집에서 학교까지 시간이 얼마나 걸려요?"),
          needsReview,
        },
        {
          id: "ex-thirty-minutes",
          korean: "30분 걸려요.",
          translations: text("Mat 30 phut.", "It takes 30 minutes."),
          grammarTags: ["에서, 까지"],
          pages: page(210),
          sourceRef: capture("ex-thirty-minutes", 210, "30분 걸려요."),
          needsReview,
        },
        {
          id: "ex-airport-shuttle",
          korean: "공항 셔틀을 타십시오.",
          translations: text(
            "Hay len xe dua don san bay.",
            "Please take the airport shuttle.",
          ),
          grammarTags: ["-으십시오/-십시오"],
          pages: page(211),
          sourceRef: capture("ex-airport-shuttle", 211, "공항 셔틀을 타십시오."),
          needsReview,
        },
        {
          id: "ex-wait",
          korean: "잠시만 기다리십시오.",
          translations: text("Hay doi mot chut.", "Please wait a moment."),
          grammarTags: ["-으십시오/-십시오"],
          pages: page(211),
          sourceRef: capture("ex-wait", 211, "잠시만 기다리십시오."),
          needsReview,
        },
        {
          id: "ex-come-tomorrow",
          korean: "내일 다시 오십시오.",
          translations: text(
            "Hay quay lai vao ngay mai.",
            "Please come again tomorrow.",
          ),
          grammarTags: ["-으십시오/-십시오"],
          pages: page(211),
          sourceRef: capture("ex-come-tomorrow", 211, "내일 다시 오십시오."),
          needsReview,
        },
        {
          id: "ex-busan-trip",
          korean: "서울역에서 기차를 탔습니다.",
          translations: text(
            "Toi da len tau tai ga Seoul.",
            "I took a train at Seoul Station.",
          ),
          grammarTags: ["에서, 까지", "travel"],
          pages: page(216),
          sourceRef: capture("ex-busan-trip", 216, "서울역에서 기차를 탔습니다."),
          needsReview,
        },
        {
          id: "ex-busan-transfer",
          korean: "서면역에서 한 번 갈아탔습니다.",
          translations: text(
            "Toi da chuyen tau mot lan o ga Seomyeon.",
            "I transferred once at Seomyeon Station.",
          ),
          grammarTags: ["에서, 까지", "travel"],
          pages: page(216),
          sourceRef: capture("ex-busan-transfer", 216, "서면역에서 한 번 갈아탔습니다."),
          needsReview,
        },
      ],
    },
    workbook: {
      audioAssets: createUnit16QrAudioAssets(qrSeedArgs),
      exercises: workbookExercises,
    },
    reviewNotes: [
      "Unit 16 is manually normalized from textbook pages 208-218 and workbook pages 261-276.",
      "Workbook normalization keeps the closed-form transport drills, QR listening, reading cloze, and scaffolded extension prompts with canonical answers.",
      "QR audio uses the shared remote resolver so Nuri assets that require GET fallback can still compile into runtime listening tasks.",
    ],
  };
}
