import type {
  LocalizedText,
  SourceCaptureRef,
  SourceDocumentInfo,
  SourceUnit,
  SourceWorkbookExercise,
} from "@/types/curriculum";
import {
  createUnit17QrAudioAssets,
  createUnit17QrWorkbookExercises,
} from "./unit-17-qr-seed";

export const UNIT_17_PAGE_SPANS = {
  textbook: {
    startPage: 220,
    endPage: 231,
  },
  workbook: {
    startPage: 277,
    endPage: 294,
  },
} as const;

function text(vi: string, en: string): LocalizedText {
  return { vi, en };
}

function page(startPage: number, endPage = startPage) {
  return { startPage, endPage };
}

function vocabIcon(vocabId: string) {
  return `/generated/vocab-icons/unit-17/${vocabId}.svg`;
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

export function createUnit17SourceSeed(
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
        id: "wb17-write-housewarming",
        exerciseType: "writing",
        prompt: text(
          "Viet tu 'tiệc tân gia' bang tieng Han.",
          "Write the word 'housewarming party' in Korean.",
        ),
        localizedText: text("tiệc tân gia", "housewarming party"),
        answer: "집들이",
        metadata: { target: "vocab" },
        coverageTags: ["housewarming", "review", "writing"],
        pages: page(277),
        sourceRef: capture("wb17-write-housewarming", 277, "집들이 어휘를 쓰세요."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb17-write-invite",
        exerciseType: "writing",
        prompt: text("Viet tu 'loi moi' bang tieng Han.", "Write the word 'invitation' in Korean."),
        localizedText: text("loi moi", "invitation"),
        answer: "초대",
        metadata: { target: "vocab" },
        coverageTags: ["invitation", "review", "writing"],
        pages: page(277),
        sourceRef: capture("wb17-write-invite", 277, "초대 어휘를 쓰세요."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb17-must-form-eat",
        exerciseType: "fill_blank",
        prompt: text(
          "Hoan thanh dang -아/어야 되다 cua dong tu.",
          "Complete the -아/어야 되다 form of the verb.",
        ),
        koreanText: "먹다 -> ___",
        localizedText: text("phai an", "have to eat"),
        answer: "먹어야 되다",
        metadata: {
          target: "grammar",
          grammarTag: "-아/어야 되다",
          choices: ["먹어야 되다", "먹고요", "먹어요"],
        },
        coverageTags: ["grammar", "must", "form-change"],
        pages: page(277),
        sourceRef: capture("wb17-must-form-eat", 277, "먹다 -> 먹어야 되다"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb17-goyo-form-make",
        exerciseType: "fill_blank",
        prompt: text("Hoan thanh dang -고요 cua dong tu.", "Complete the -고요 form of the verb."),
        koreanText: "만들다 -> ___",
        localizedText: text("va lam", "and make"),
        answer: "만들고요",
        metadata: {
          target: "grammar",
          grammarTag: "-고요",
          choices: ["만들고요", "만들어야 되다", "만들어요"],
        },
        coverageTags: ["grammar", "goyo", "form-change"],
        pages: page(278),
        sourceRef: capture("wb17-goyo-form-make", 278, "만들다 -> 만들고요"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb17-match-housewarming-picture",
        exerciseType: "matching",
        prompt: text("Xem tranh va noi voi tu dung.", "Look at the picture and match it with the correct word."),
        koreanText: "집들이",
        localizedText: text("tiệc tân gia", "housewarming party"),
        answer: "tiệc tân gia",
        metadata: { target: "vocab", vocabId: "v-housewarming" },
        coverageTags: ["housewarming", "vocab", "picture"],
        pages: page(279),
        sourceRef: capture("wb17-match-housewarming-picture", 279, "그림 보고 맞는 것을 골라 쓰세요. 집들이"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb17-match-invitation-card-picture",
        exerciseType: "matching",
        prompt: text("Xem tranh va noi voi tu dung.", "Look at the picture and match it with the correct word."),
        koreanText: "초대장",
        localizedText: text("thiep moi", "invitation card"),
        answer: "thiep moi",
        metadata: { target: "vocab", vocabId: "v-invitation-card" },
        coverageTags: ["invitation-card", "vocab", "picture"],
        pages: page(279),
        sourceRef: capture("wb17-match-invitation-card-picture", 279, "그림 보고 맞는 것을 골라 쓰세요. 초대장"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb17-match-tissue-picture",
        exerciseType: "matching",
        prompt: text("Xem tranh va noi voi tu dung.", "Look at the picture and match it with the correct word."),
        koreanText: "휴지",
        localizedText: text("khan giay", "tissue paper"),
        answer: "khan giay",
        metadata: { target: "vocab", vocabId: "v-tissue" },
        coverageTags: ["tissue", "vocab", "picture"],
        pages: page(279),
        sourceRef: capture("wb17-match-tissue-picture", 279, "그림 보고 맞는 것을 골라 쓰세요. 휴지"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb17-match-detergent-picture",
        exerciseType: "matching",
        prompt: text("Xem tranh va noi voi tu dung.", "Look at the picture and match it with the correct word."),
        koreanText: "세제",
        localizedText: text("nuoc giat", "detergent"),
        answer: "nuoc giat",
        metadata: { target: "vocab", vocabId: "v-detergent" },
        coverageTags: ["detergent", "vocab", "picture"],
        pages: page(279),
        sourceRef: capture("wb17-match-detergent-picture", 279, "그림 보고 맞는 것을 골라 쓰세요. 세제"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb17-chat-housewarming",
        exerciseType: "fill_blank",
        prompt: text("Dien tu thich hop vao hoi thoai.", "Fill the correct word into the dialogue."),
        koreanText: "내일 ___에 뭘 사 갈까요?",
        localizedText: text("tiệc tân gia", "housewarming party"),
        answer: "집들이",
        metadata: {
          target: "dialogue",
          choices: ["집들이", "초대장", "세제"],
        },
        coverageTags: ["dialogue", "housewarming", "shopping"],
        pages: page(280),
        sourceRef: capture("wb17-chat-housewarming", 280, "내일 집들이에 뭘 사 갈까요?"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb17-chat-detergent",
        exerciseType: "fill_blank",
        prompt: text("Dien tu thich hop vao hoi thoai.", "Fill the correct word into the dialogue."),
        koreanText: "보통 ___을/를 사 가요. 휴지도 좋고요.",
        localizedText: text("nuoc giat", "detergent"),
        answer: "세제",
        metadata: {
          target: "dialogue",
          choices: ["세제", "휴지", "초대장"],
        },
        coverageTags: ["dialogue", "detergent", "shopping"],
        pages: page(280),
        sourceRef: capture("wb17-chat-detergent", 280, "보통 세제를 사 가요. 휴지도 좋고요."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb17-chat-tissue",
        exerciseType: "fill_blank",
        prompt: text("Dien tu thich hop vao hoi thoai.", "Fill the correct word into the dialogue."),
        koreanText: "그럼 ___을/를 사 갑시다. 내일 봐요.",
        localizedText: text("khan giay", "tissue paper"),
        answer: "휴지",
        metadata: {
          target: "dialogue",
          choices: ["휴지", "세제", "집들이"],
        },
        coverageTags: ["dialogue", "tissue", "shopping"],
        pages: page(280),
        sourceRef: capture("wb17-chat-tissue", 280, "그럼 휴지를 사 갑시다. 내일 봐요."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb17-dialogue-help-request",
        exerciseType: "fill_blank",
        prompt: text(
          "Hoan thanh loi nho giup do trong hoi thoai.",
          "Complete the help-request line in the dialogue.",
        ),
        koreanText: "죄송하지만 저 좀 ___?",
        localizedText: text("Ban co the giup toi mot chut duoc khong?", "Could you help me a bit?"),
        answer: "도와줄 수 있어요",
        metadata: {
          target: "dialogue",
          choices: ["도와줄 수 있어요", "이사했어요", "초대할까요"],
        },
        coverageTags: ["dialogue", "help", "request"],
        pages: page(281),
        sourceRef: capture("wb17-dialogue-help-request", 281, "죄송하지만 저 좀 도와줄 수 있어요?"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb17-dialogue-help-offer",
        exerciseType: "fill_blank",
        prompt: text(
          "Hoan thanh loi de nghi giup do trong hoi thoai.",
          "Complete the help-offer line in the dialogue.",
        ),
        koreanText: "네, 제가 ___.",
        localizedText: text("De toi giup ban.", "I will help you."),
        answer: "도와 드릴게요",
        metadata: {
          target: "dialogue",
          choices: ["도와 드릴게요", "이사할게요", "초대할게요"],
        },
        coverageTags: ["dialogue", "help", "offer"],
        pages: page(281),
        sourceRef: capture("wb17-dialogue-help-offer", 281, "네, 제가 도와 드릴게요."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb17-must-study",
        exerciseType: "fill_blank",
        prompt: text("Dien dang -아/어야 되다 vao cho trong.", "Fill in the correct -아/어야 되다 form."),
        koreanText: "안 돼요. 한국어 공부를 ___.",
        localizedText: text("phai hoc tieng Han", "have to study Korean"),
        answer: "해야 돼요",
        metadata: {
          target: "grammar",
          grammarTag: "-아/어야 되다",
          choices: ["해야 돼요", "하고요", "해요"],
        },
        coverageTags: ["grammar", "must", "study"],
        pages: page(284),
        sourceRef: capture("wb17-must-study", 284, "안 돼요. 한국어 공부를 해야 돼요."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb17-must-meet-friend",
        exerciseType: "fill_blank",
        prompt: text("Dien dang -아/어야 되다 vao cho trong.", "Fill in the correct -아/어야 되다 form."),
        koreanText: "친구들 약속이 있어요. 친구를 ___.",
        localizedText: text("phai gap ban", "have to meet a friend"),
        answer: "만나야 돼요",
        metadata: {
          target: "grammar",
          grammarTag: "-아/어야 되다",
          choices: ["만나야 돼요", "만나고요", "만나요"],
        },
        coverageTags: ["grammar", "must", "meeting"],
        pages: page(284),
        sourceRef: capture("wb17-must-meet-friend", 284, "친구들 약속이 있어요. 친구를 만나야 돼요."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb17-must-go-hospital",
        exerciseType: "fill_blank",
        prompt: text("Dien dang -아/어야 되다 vao cho trong.", "Fill in the correct -아/어야 되다 form."),
        koreanText: "몸이 안 좋아서 병원에 ___.",
        localizedText: text("phai den benh vien", "have to go to the hospital"),
        answer: "가야 돼요",
        metadata: {
          target: "grammar",
          grammarTag: "-아/어야 되다",
          choices: ["가야 돼요", "가고요", "가요"],
        },
        coverageTags: ["grammar", "must", "hospital"],
        pages: page(284),
        sourceRef: capture("wb17-must-go-hospital", 284, "몸이 안 좋아서 병원에 가야 돼요."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb17-must-practice-speaking",
        exerciseType: "fill_blank",
        prompt: text("Dien dang -아/어야 되다 vao cho trong.", "Fill in the correct -아/어야 되다 form."),
        koreanText: "그래서 한국어 말하기를 ___.",
        localizedText: text("phai luyen noi tieng Han", "have to practice speaking Korean"),
        answer: "연습해야 돼요",
        metadata: {
          target: "grammar",
          grammarTag: "-아/어야 되다",
          choices: ["연습해야 돼요", "연습하고요", "연습해요"],
        },
        coverageTags: ["grammar", "must", "speaking"],
        pages: page(284),
        sourceRef: capture("wb17-must-practice-speaking", 284, "그래서 한국어 말하기를 연습해야 돼요."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb17-goyo-school-food",
        exerciseType: "fill_blank",
        prompt: text("Dien dang -고요 vao cho trong.", "Fill in the correct -고요 form."),
        koreanText: "직원들이 친절해요. 음식도 ___.",
        localizedText: text("do an cung ngon", "the food is tasty too"),
        answer: "맛있고요",
        metadata: {
          target: "grammar",
          grammarTag: "-고요",
          choices: ["맛있고요", "맛있어야 돼요", "맛있어요"],
        },
        coverageTags: ["grammar", "goyo", "food"],
        pages: page(285),
        sourceRef: capture("wb17-goyo-school-food", 285, "직원들이 친절해요. 음식도 맛있고요."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb17-goyo-make-friends",
        exerciseType: "fill_blank",
        prompt: text("Dien dang -고요 vao cho trong.", "Fill in the correct -고요 form."),
        koreanText: "재미있어요. 친구도 사귈 수 ___.",
        localizedText: text("cung co the ket ban", "you can make friends too"),
        answer: "있고요",
        metadata: {
          target: "grammar",
          grammarTag: "-고요",
          choices: ["있고요", "있어야 돼요", "있어요"],
        },
        coverageTags: ["grammar", "goyo", "friends"],
        pages: page(285),
        sourceRef: capture("wb17-goyo-make-friends", 285, "재미있어요. 친구도 사귈 수 있고요."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb17-email-hi",
        exerciseType: "fill_blank",
        prompt: text("Hoan thanh email moi du tiec tan gia.", "Complete the housewarming invitation email."),
        koreanText: "지연 씨, ___ 잘 지냈어요?",
        localizedText: text("Lau roi khong gap", "Long time no see"),
        answer: "오랜만이에요",
        metadata: {
          target: "email",
          choices: ["오랜만이에요", "해야 돼요", "되고요", "준비해야 돼요"],
        },
        coverageTags: ["email", "writing", "greeting"],
        pages: page(289),
        sourceRef: capture("wb17-email-hi", 289, "지연 씨, 오랜만이에요. 잘 지냈어요?"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb17-email-do",
        exerciseType: "fill_blank",
        prompt: text("Hoan thanh email moi du tiec tan gia.", "Complete the housewarming invitation email."),
        koreanText: "집들이에서 뭘 ___?",
        localizedText: text("Can phai lam gi o tiec tan gia?", "What should I do at the housewarming?"),
        answer: "해야 돼요",
        metadata: {
          target: "email",
          grammarTag: "-아/어야 되다",
          choices: ["해야 돼요", "하고요", "해요"],
        },
        coverageTags: ["email", "must", "housewarming"],
        pages: page(289),
        sourceRef: capture("wb17-email-do", 289, "집들이에서 뭘 해야 돼요?"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb17-email-food",
        exerciseType: "fill_blank",
        prompt: text("Hoan thanh email moi du tiec tan gia.", "Complete the housewarming invitation email."),
        koreanText: "집들이에 어떤 음식을 ___?",
        localizedText: text("Can chuan bi mon an gi?", "What food should I prepare?"),
        answer: "준비해야 돼요",
        metadata: {
          target: "email",
          grammarTag: "-아/어야 되다",
          choices: ["준비해야 돼요", "준비하고요", "준비해요"],
        },
        coverageTags: ["email", "must", "food"],
        pages: page(289),
        sourceRef: capture("wb17-email-food", 289, "집들이에 어떤 음식을 준비해야 돼요?"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb17-email-message",
        exerciseType: "fill_blank",
        prompt: text("Hoan thanh email moi du tiec tan gia.", "Complete the housewarming invitation email."),
        koreanText: "메일 주세요. 메시지도 ___.",
        localizedText: text("Tin nhan cung duoc", "A message is fine too"),
        answer: "되고요",
        metadata: {
          target: "email",
          grammarTag: "-고요",
          choices: ["되고요", "해야 돼요", "가고요"],
        },
        coverageTags: ["email", "goyo", "contact"],
        pages: page(289),
        sourceRef: capture("wb17-email-message", 289, "메일 주세요. 메시지도 되고요."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb17-travel-place",
        exerciseType: "fill_blank",
        prompt: text(
          "Hoan thanh cau -고요 khi noi ve ke hoach di choi.",
          "Complete the -고요 sentence about a travel plan.",
        ),
        koreanText: "서울에 가고 싶어요. ___.",
        localizedText: text("Toi cung muon den Busan nua", "I also want to go to Busan"),
        answer: "부산도 가고요",
        metadata: {
          target: "travel",
          grammarTag: "-고요",
          choices: ["부산도 가고요", "부산에 가야 돼요", "부산에 가요"],
        },
        coverageTags: ["travel", "goyo", "places"],
        pages: page(293),
        sourceRef: capture("wb17-travel-place", 293, "서울에 가고 싶어요. 부산도 가고요."),
      },
      needsReview,
    ),
    ...createUnit17QrWorkbookExercises(qrSeedArgs),
  ];

  return {
    unitId: "17",
    unitNumber: 17,
    title: text(
      "Toi nen mang gi den tiec tan gia?",
      "What should I bring to the housewarming?",
    ),
    needsReview,
    extractionMode: needsReview ? "seeded_raw_blocks" : "manual_seed",
    sourceDocuments: documents,
    textbook: {
      vocab: [
        {
          id: "v-housewarming",
          korean: "집들이",
          translations: text("tiec tan gia", "housewarming party"),
          romanization: "jipdeuri",
          imagePath: vocabIcon("v-housewarming"),
          pages: page(221),
          sourceRef: capture("v-housewarming", 221, "집들이"),
          needsReview,
        },
        {
          id: "v-invitation",
          korean: "초대",
          translations: text("loi moi", "invitation"),
          romanization: "chodae",
          pages: page(221),
          sourceRef: capture("v-invitation", 221, "초대"),
          needsReview,
        },
        {
          id: "v-invitation-card",
          korean: "초대장",
          translations: text("thiep moi", "invitation card"),
          romanization: "chodaejang",
          imagePath: vocabIcon("v-invitation-card"),
          pages: page(221),
          sourceRef: capture("v-invitation-card", 221, "초대장"),
          needsReview,
        },
        {
          id: "v-tissue",
          korean: "휴지",
          translations: text("khan giay", "tissue paper"),
          romanization: "hyuji",
          imagePath: vocabIcon("v-tissue"),
          pages: page(221),
          sourceRef: capture("v-tissue", 221, "휴지"),
          needsReview,
        },
        {
          id: "v-detergent",
          korean: "세제",
          translations: text("nuoc giat", "detergent"),
          romanization: "seje",
          imagePath: vocabIcon("v-detergent"),
          pages: page(221),
          sourceRef: capture("v-detergent", 221, "세제"),
          needsReview,
        },
        {
          id: "v-move",
          korean: "이사하다",
          translations: text("chuyen nha", "move house"),
          romanization: "isahada",
          pages: page(221),
          sourceRef: capture("v-move", 221, "새집으로 이사해서 기분이 좋아요."),
          needsReview,
        },
        {
          id: "v-help",
          korean: "도와주다",
          translations: text("giup do", "help"),
          romanization: "dowajuda",
          pages: page(221),
          sourceRef: capture("v-help", 221, "짐 좀 도와줄 수 있어요?"),
          needsReview,
        },
        {
          id: "v-invite-verb",
          korean: "초대하다",
          translations: text("moi", "invite"),
          romanization: "chodaehada",
          pages: page(221),
          sourceRef: capture("v-invite-verb", 221, "생일 파티에 누구를 초대하고 싶어요?"),
          needsReview,
        },
        {
          id: "v-prepare",
          korean: "준비하다",
          translations: text("chuan bi", "prepare"),
          romanization: "junbihada",
          imagePath: vocabIcon("v-prepare"),
          pages: page(221),
          sourceRef: capture("v-prepare", 221, "한국 음식을 준비할 거예요."),
          needsReview,
        },
      ],
      grammar: [
        {
          id: "g-must-do",
          pattern: "동사 + -아/어야 되다",
          explanation: text(
            "Dien ta nghia vu, viec can phai lam, hoac su can thiet trong tinh huong nao do.",
            "Expresses obligation, necessity, or something that must be done in a situation.",
          ),
          exampleIds: [
            "ex-must-buy",
            "ex-must-make-food",
            "ex-must-bring-swim-cap",
          ],
          pages: page(223),
          sourceRef: capture("g-must-do", 223, "동사 + -아/어야 되다"),
          needsReview,
        },
        {
          id: "g-goyo",
          pattern: "동사 + -고요",
          explanation: text(
            "Dung de noi tiep noi hoac bo sung them mot y nua trong cung luot noi.",
            "Used to continue speaking or add one more connected point in the same turn.",
          ),
          exampleIds: ["ex-look-around", "ex-healthy-too", "ex-travel-place"],
          pages: page(224),
          sourceRef: capture("g-goyo", 224, "동사 + -고요"),
          needsReview,
        },
      ],
      dialogue: [
        {
          id: "d-usual-housewarming-q",
          speaker: "Jihun",
          korean: "지훈 씨, 집들이에서 보통 뭘 해요?",
          translations: text(
            "Jihun, o tiec tan gia thuong lam gi?",
            "Jihun, what do people usually do at a housewarming?",
          ),
          pages: page(224),
          sourceRef: capture("d-usual-housewarming-q", 224, "지훈 씨, 집들이에서 보통 뭘 해요?"),
          needsReview,
        },
        {
          id: "d-housewarming-activities",
          speaker: "Lisa",
          korean: "집을 구경해요. 같이 식사도 하고요.",
          translations: text(
            "Moi nguoi xem nha, va cung an cung nhau nua.",
            "People look around the house, and they eat together too.",
          ),
          pages: page(224),
          sourceRef: capture("d-housewarming-activities", 224, "집을 구경해요. 같이 식사도 하고요."),
          needsReview,
        },
        {
          id: "d-weekend-housewarming",
          speaker: "Jihun",
          korean: "리사 씨, 주말에 집들이를 하려고 해요. 올 수 있어요?",
          translations: text(
            "Lisa, cuoi tuan nay toi dinh to chuc tiec tan gia. Ban co the den duoc khong?",
            "Lisa, I am planning a housewarming this weekend. Can you come?",
          ),
          pages: page(223),
          sourceRef: capture("d-weekend-housewarming", 223, "리사 씨, 주말에 집들이를 하려고 해요. 올 수 있어요?"),
          needsReview,
        },
        {
          id: "d-help-offer-question",
          speaker: "Lisa",
          korean: "그럼요. 제가 좀 도와줄까요?",
          translations: text(
            "Tat nhien roi. Toi co the giup mot chut khong?",
            "Of course. Should I help a little?",
          ),
          pages: page(223),
          sourceRef: capture("d-help-offer-question", 223, "그럼요. 제가 좀 도와줄까요?"),
          needsReview,
        },
        {
          id: "d-must-make-food",
          speaker: "Jihun",
          korean: "고마워요. 음식을 만들어야 돼요.",
          translations: text(
            "Cam on ban. Toi phai lam do an.",
            "Thanks. I have to make food.",
          ),
          pages: page(223),
          sourceRef: capture("d-must-make-food", 223, "고마워요. 음식을 만들어야 돼요."),
          needsReview,
        },
        {
          id: "d-come-early",
          speaker: "Jihun",
          korean: "그럼 좀 일찍 오세요.",
          translations: text(
            "Vay thi ban den som mot chut nhe.",
            "Then please come a little early.",
          ),
          pages: page(223),
          sourceRef: capture("d-come-early", 223, "그럼 좀 일찍 오세요."),
          needsReview,
        },
      ],
      examples: [
        {
          id: "ex-help-request",
          korean: "저 좀 도와줄 수 있어요?",
          translations: text("Ban co the giup toi mot chut duoc khong?", "Could you help me a bit?"),
          grammarTags: ["help expression"],
          pages: page(222),
          sourceRef: capture("ex-help-request", 222, "저 좀 도와줄 수 있어요?"),
          needsReview,
        },
        {
          id: "ex-help-offer",
          korean: "제가 도와 드릴게요.",
          translations: text("De toi giup ban.", "I will help you."),
          grammarTags: ["help expression"],
          pages: page(222),
          sourceRef: capture("ex-help-offer", 222, "제가 도와 드릴게요."),
          needsReview,
        },
        {
          id: "ex-must-buy",
          korean: "집들이에 뭘 사 가야 돼요?",
          translations: text("Toi nen mua gi de mang den tiec tan gia?", "What should I buy and bring to the housewarming?"),
          grammarTags: ["-아/어야 되다"],
          pages: page(220),
          sourceRef: capture("ex-must-buy", 220, "집들이에 뭘 사 가야 돼요?"),
          needsReview,
        },
        {
          id: "ex-must-make-food",
          korean: "음식을 만들어야 돼요.",
          translations: text("Phai lam do an.", "I have to make food."),
          grammarTags: ["-아/어야 되다"],
          pages: page(223),
          sourceRef: capture("ex-must-make-food", 223, "음식을 만들어야 돼요."),
          needsReview,
        },
        {
          id: "ex-healthy-too",
          korean: "건강에도 좋고요.",
          translations: text("Cung tot cho suc khoe nua.", "It is good for your health too."),
          grammarTags: ["-고요"],
          pages: page(224),
          sourceRef: capture("ex-healthy-too", 224, "건강에도 좋고요."),
          needsReview,
        },
        {
          id: "ex-delicious-too",
          korean: "경치가 예뻐요. 음식도 맛있고요.",
          translations: text("Phong canh dep, va do an cung ngon nua.", "The scenery is beautiful, and the food is tasty too."),
          grammarTags: ["-고요"],
          pages: page(224),
          sourceRef: capture("ex-delicious-too", 224, "경치가 예뻐요. 음식도 맛있고요."),
          needsReview,
        },
        {
          id: "ex-look-around",
          korean: "집을 구경해요. 같이 식사도 하고요.",
          translations: text("Moi nguoi xem nha, va cung an cung nhau nua.", "People look around the house, and they eat together too."),
          grammarTags: ["-고요"],
          pages: page(224),
          sourceRef: capture("ex-look-around", 224, "집을 구경해요. 같이 식사도 하고요."),
          needsReview,
        },
        {
          id: "ex-email-what-do",
          korean: "집들이에서 뭘 해야 돼요?",
          translations: text("Toi can lam gi o tiec tan gia?", "What should I do at the housewarming?"),
          grammarTags: ["-아/어야 되다"],
          pages: page(229),
          sourceRef: capture("ex-email-what-do", 229, "집들이에서 뭘 해야 돼요?"),
          needsReview,
        },
        {
          id: "ex-email-what-food",
          korean: "집들이에 어떤 음식을 준비해야 돼요?",
          translations: text("Toi can chuan bi mon an gi cho tiec tan gia?", "What food should I prepare for the housewarming?"),
          grammarTags: ["-아/어야 되다"],
          pages: page(229),
          sourceRef: capture("ex-email-what-food", 229, "집들이에 어떤 음식을 준비해야 돼요?"),
          needsReview,
        },
        {
          id: "ex-must-bring-swim-cap",
          korean: "그리고 수영 모자도 가져가야 해요.",
          translations: text("Va cung phai mang theo mu boi nua.", "And I also have to bring a swim cap."),
          grammarTags: ["-아/어야 되다"],
          pages: page(291),
          sourceRef: capture("ex-must-bring-swim-cap", 291, "그리고 수영 모자도 가져가야 해요."),
          needsReview,
        },
        {
          id: "ex-travel-place",
          korean: "서울에 가고 싶어요. 부산도 가고요.",
          translations: text("Toi muon di Seoul, va cung muon di Busan nua.", "I want to go to Seoul, and I want to go to Busan too."),
          grammarTags: ["-고요"],
          pages: page(293),
          sourceRef: capture("ex-travel-place", 293, "서울에 가고 싶어요. 부산도 가고요."),
          needsReview,
        },
      ],
    },
    workbook: {
      audioAssets: createUnit17QrAudioAssets(qrSeedArgs),
      exercises: workbookExercises,
    },
    reviewNotes: [
      "Unit 17 is manually normalized from the provided textbook/workbook page spans and kept bilingual at the reviewed layer.",
      "Workbook coverage keeps the opening review page, picture-driven vocab, grammar drills, email writing, and one late travel-goyo prompt.",
      "QR listening pages 287-288 are traced locally; audio-backed tasks compile only when the remote asset resolves to a usable audio response.",
    ],
  };
}
