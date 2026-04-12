import fs from "node:fs";
import path from "node:path";
import type {
  LocalizedText,
  RawUnitDraft,
  SourceCaptureRef,
  SourceDocumentInfo,
  SourceUnit,
  SourceWorkbookExercise,
} from "@/types/curriculum";
import {
  createUnit1QrAudioAssets,
  createUnit1QrWorkbookExercises,
} from "./unit-1-qr-seed";

export const UNIT_1_PAGE_SPANS = {
  textbook: {
    startPage: 17,
    endPage: 31,
  },
  workbook: {
    startPage: 19,
    endPage: 34,
  },
} as const;

function text(vi: string, en: string): LocalizedText {
  return { vi, en };
}

function page(startPage: number, endPage = startPage) {
  return { startPage, endPage };
}

function vocabIcon(vocabId: string) {
  return `/generated/vocab-icons/unit-1/${vocabId}.svg`;
}

function loadRawDraft() {
  const rawPath = path.resolve(process.cwd(), "data/curriculum/source/unit-1.raw-draft.json");
  const raw = fs.readFileSync(rawPath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw) as RawUnitDraft;
}

function createSourceRefResolver() {
  const rawDraft = loadRawDraft();
  const blocksBySourceItemId = new Map(
    rawDraft.blocks
      .filter((block) => Boolean(block.sourceItemId))
      .map((block) => [block.sourceItemId as string, block]),
  );

  return (
    sourceItemId: string,
    fallbackPage: number,
    fallbackRawText: string,
  ): SourceCaptureRef => {
    const block = blocksBySourceItemId.get(sourceItemId);

    return {
      rawText: block?.text ?? fallbackRawText,
      confidence: block?.confidence ?? 0.98,
      sourceBlockId: block?.id ?? `${sourceItemId}-seed`,
      page: block?.page ?? fallbackPage,
    };
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

export function createUnit1SourceSeed(
  documents: {
    textbook: SourceDocumentInfo;
    workbook: SourceDocumentInfo;
  },
  options?: {
    needsReview?: boolean;
  },
): SourceUnit {
  const needsReview = options?.needsReview ?? false;
  const sourceRefFor = createSourceRefResolver();
  const qrSeedArgs = {
    needsReview,
    text,
    capture: sourceRefFor,
  };

  const workbookExercises: SourceWorkbookExercise[] = [
    workbookExercise(
      {
        id: "wb-fill-student-ending",
        exerciseType: "fill_blank",
        prompt: text("Điền đuôi câu lịch sự còn thiếu.", "Fill in the missing polite ending."),
        koreanText: "저는 학생___",
        answer: "입니다.",
        metadata: {
          target: "grammar",
          grammarTag: "N + copula",
        },
        coverageTags: ["grammar", "copula", "student"],
        pages: page(20),
        sourceRef: sourceRefFor("wb-fill-student-ending", 20, "저는 학생___ / 입니다"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb-match-hello",
        exerciseType: "matching",
        prompt: text("Nối biểu thức với ý nghĩa đúng.", "Match the expression to the correct meaning."),
        koreanText: "안녕하세요",
        localizedText: text("xin chào", "hello"),
        answer: "xin chào",
        metadata: {
          target: "vocab",
        },
        coverageTags: ["greeting", "vocab"],
        pages: page(20),
        sourceRef: sourceRefFor("wb-match-hello", 20, "안녕하세요 = xin chào"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb-match-jeo",
        exerciseType: "matching",
        prompt: text("Nối từ với ý nghĩa của nó.", "Match the word with its meaning."),
        koreanText: "저",
        localizedText: text("tôi, em (khiêm nhường)", "I, me (humble)"),
        answer: "tôi, em (khiêm nhường)",
        metadata: {
          target: "vocab",
        },
        coverageTags: ["self-introduction", "vocab"],
        pages: page(20),
        sourceRef: sourceRefFor("wb-match-jeo", 20, "저 = tôi, em (khiêm nhường)"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb-match-student",
        exerciseType: "matching",
        prompt: text("Nối danh từ với ý nghĩa đúng.", "Match the noun to the correct meaning."),
        koreanText: "학생",
        localizedText: text("học sinh, sinh viên", "student"),
        answer: "học sinh, sinh viên",
        metadata: {
          target: "vocab",
        },
        coverageTags: ["student", "vocab"],
        pages: page(20),
        sourceRef: sourceRefFor("wb-match-student", 20, "학생 = học sinh, sinh viên"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb-translate-student",
        exerciseType: "translation",
        prompt: text("Dịch sang tiếng Hàn.", "Translate into Korean."),
        localizedText: text("Tôi là học sinh.", "I am a student."),
        answer: "저는 학생입니다.",
        metadata: {
          direction: "meaning_to_ko",
        },
        coverageTags: ["student", "translation", "copula"],
        pages: page(21),
        sourceRef: sourceRefFor("wb-translate-student", 21, "Tôi là học sinh. -> 저는 학생입니다."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb-translate-hello",
        exerciseType: "translation",
        prompt: text("Dịch sang ý nghĩa.", "Translate into the meaning."),
        koreanText: "안녕하세요.",
        answer: "Xin chào.",
        metadata: {
          direction: "ko_to_meaning",
        },
        coverageTags: ["greeting", "translation"],
        pages: page(21),
        sourceRef: sourceRefFor("wb-translate-hello", 21, "안녕하세요. -> Xin chào."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb-grammar-copula-choice",
        exerciseType: "writing",
        prompt: text("Chọn đuôi câu đúng sau danh từ.", "Choose the correct ending after the noun."),
        koreanText: "학생 + ___",
        answer: "입니다",
        metadata: {
          target: "grammar",
          choices: ["입니다", "은", "는"],
          grammarTag: "N + copula",
        },
        coverageTags: ["grammar", "copula"],
        pages: page(21),
        sourceRef: sourceRefFor("wb-grammar-copula-choice", 21, "학생 + ___ / 입니다"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb-listen-too",
        exerciseType: "listening",
        prompt: text("Nghe và chọn ý nghĩa đúng.", "Listen and choose the correct meaning."),
        koreanText: "저도 반갑습니다.",
        localizedText: text("Tôi cũng rất vui được gặp bạn.", "Nice to meet you too."),
        answer: "Tôi cũng rất vui được gặp bạn.",
        metadata: {
          target: "listening",
        },
        coverageTags: ["dialogue", "listening", "reply"],
        pages: page(22),
        sourceRef: sourceRefFor("wb-listen-too", 22, "저도 반갑습니다. -> Tôi cũng rất vui được gặp bạn."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb-fill-nice",
        exerciseType: "fill_blank",
        prompt: text("Điền biểu thức còn thiếu.", "Fill in the missing expression."),
        koreanText: "저도 ___",
        answer: "반갑습니다.",
        metadata: {
          target: "expression",
          choices: ["반갑습니다", "학생입니다", "회사원입니다"],
        },
        coverageTags: ["dialogue", "reply", "fill_blank"],
        pages: page(22),
        sourceRef: sourceRefFor("wb-fill-nice", 22, "저도 ___ / 반갑습니다."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb-order-jisu",
        exerciseType: "sentence_ordering",
        prompt: text("Sắp xếp câu giới thiệu của Jisu.", "Arrange Jisu's introduction."),
        answer: ["저는", "지수입니다."],
        metadata: {
          wordBank: ["저는", "지수입니다.", "반갑습니다.", "안녕하세요."],
          target: "sentence_ordering",
        },
        coverageTags: ["self-introduction", "name", "construction"],
        pages: page(23),
        sourceRef: sourceRefFor("wb-order-jisu", 23, "저는 / 지수입니다."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb-translate-jisu",
        exerciseType: "translation",
        prompt: text("Dịch sang tiếng Hàn.", "Translate into Korean."),
        localizedText: text("Tôi là Jisu.", "I am Jisu."),
        answer: "저는 지수입니다.",
        metadata: {
          direction: "meaning_to_ko",
        },
        coverageTags: ["self-introduction", "translation", "name"],
        pages: page(23),
        sourceRef: sourceRefFor("wb-translate-jisu", 23, "Tôi là Jisu. -> 저는 지수입니다."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb-translate-nice",
        exerciseType: "translation",
        prompt: text("Dịch sang ý nghĩa.", "Translate into the meaning."),
        koreanText: "반갑습니다.",
        answer: "Rất vui được gặp bạn.",
        metadata: {
          direction: "ko_to_meaning",
        },
        coverageTags: ["greeting", "translation"],
        pages: page(23),
        sourceRef: sourceRefFor("wb-translate-nice", 23, "반갑습니다. -> Rất vui được gặp bạn."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb-fill-name-line",
        exerciseType: "fill_blank",
        prompt: text("Điền đuôi câu vào mẫu giới thiệu tên.", "Fill in the ending for the name-introduction pattern."),
        koreanText: "저는 지수___",
        answer: "입니다.",
        metadata: {
          target: "grammar",
        },
        coverageTags: ["name", "copula", "fill_blank"],
        pages: page(23),
        sourceRef: sourceRefFor("wb-fill-name-line", 23, "저는 지수___ / 입니다."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb-grammar-ending",
        exerciseType: "writing",
        prompt: text("Chọn đuôi câu phù hợp sau danh từ.", "Choose the correct sentence ending after the noun."),
        koreanText: "학생 + ___",
        answer: "입니다",
        metadata: {
          target: "grammar",
          grammarTag: "N + copula",
        },
        coverageTags: ["grammar", "copula"],
        pages: page(24),
        sourceRef: sourceRefFor("wb-grammar-ending", 24, "학생 + ___ / 입니다"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb-fill-office-worker",
        exerciseType: "fill_blank",
        prompt: text("Điền nghề nghiệp còn thiếu.", "Fill in the missing job noun."),
        koreanText: "저는 ___입니다.",
        answer: "회사원",
        metadata: {
          target: "job",
          choices: ["회사원", "학생", "의사"],
        },
        coverageTags: ["role", "office-worker", "fill_blank"],
        pages: page(25),
        sourceRef: sourceRefFor("wb-fill-office-worker", 25, "저는 ___입니다. / 회사원"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb-order-office-worker",
        exerciseType: "sentence_ordering",
        prompt: text("Sắp xếp câu về nghề nghiệp.", "Arrange the sentence about the job."),
        answer: ["저는", "회사원입니다."],
        metadata: {
          wordBank: ["저는", "회사원입니다.", "안녕하세요.", "반갑습니다."],
          target: "sentence_ordering",
        },
        coverageTags: ["role", "office-worker", "construction"],
        pages: page(25),
        sourceRef: sourceRefFor("wb-order-office-worker", 25, "저는 / 회사원입니다."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb-translate-office-worker",
        exerciseType: "translation",
        prompt: text("Dịch sang tiếng Hàn.", "Translate into Korean."),
        localizedText: text("Tôi là nhân viên công ty.", "I am an office worker."),
        answer: "저는 회사원입니다.",
        metadata: {
          direction: "meaning_to_ko",
        },
        coverageTags: ["role", "office-worker", "translation"],
        pages: page(26),
        sourceRef: sourceRefFor("wb-translate-office-worker", 26, "Tôi là nhân viên công ty. -> 저는 회사원입니다."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb-listen-student",
        exerciseType: "listening",
        prompt: text("Nghe và chọn ý nghĩa đúng.", "Listen and choose the correct meaning."),
        koreanText: "저는 학생입니다.",
        localizedText: text("Tôi là học sinh.", "I am a student."),
        answer: "Tôi là học sinh.",
        metadata: {
          target: "listening",
        },
        coverageTags: ["student", "listening", "copula"],
        pages: page(26),
        sourceRef: sourceRefFor("wb-listen-student", 26, "저는 학생입니다. -> Tôi là học sinh."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb-write-doctor",
        exerciseType: "writing",
        prompt: text("Viết câu: Tôi là bác sĩ.", "Write: I am a doctor."),
        answer: "저는 의사입니다.",
        metadata: {
          target: "writing",
        },
        coverageTags: ["role", "doctor", "writing"],
        pages: page(27),
        sourceRef: sourceRefFor("wb-write-doctor", 27, "저는 의사입니다."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb-fill-intro-name",
        exerciseType: "fill_blank",
        prompt: text("Điền từ còn thiếu trong câu giới thiệu.", "Fill in the missing word in the introduction."),
        koreanText: "___ 민수입니다.",
        localizedText: text("Tôi là Minsu.", "I am Minsu."),
        answer: "저는",
        metadata: {
          target: "pattern",
          choices: ["저는", "저도", "학생은"],
        },
        coverageTags: ["self-introduction", "fill_blank"],
        pages: page(27),
        sourceRef: sourceRefFor("wb-fill-intro-name", 27, "___ 민수입니다. / 저는"),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb-translate-doctor",
        exerciseType: "translation",
        prompt: text("Dịch sang ý nghĩa.", "Translate into the meaning."),
        koreanText: "저는 의사입니다.",
        answer: "Tôi là bác sĩ.",
        metadata: {
          direction: "ko_to_meaning",
        },
        coverageTags: ["role", "doctor", "translation"],
        pages: page(28),
        sourceRef: sourceRefFor("wb-translate-doctor", 28, "저는 의사입니다. -> Tôi là bác sĩ."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb-guided-selfintro",
        exerciseType: "writing",
        prompt: text(
          "Viết giới thiệu ngắn gồm lời chào và tên.",
          "Write a short self-introduction with a greeting and your name.",
        ),
        answer: ["안녕하세요.", "저는 지수입니다."],
        metadata: {
          target: "guided_writing",
          template: ["안녕하세요.", "저는 [이름]입니다."],
        },
        coverageTags: ["self-introduction", "writing", "greeting"],
        pages: page(29),
        sourceRef: sourceRefFor("wb-guided-selfintro", 29, "안녕하세요. / 저는 [이름]입니다."),
      },
      needsReview,
    ),
    workbookExercise(
      {
        id: "wb-listen-greeting",
        exerciseType: "listening",
        prompt: text("Nghe và chọn lời chào đúng.", "Listen and choose the correct greeting."),
        koreanText: "안녕하세요",
        localizedText: text("xin chào", "hello"),
        answer: "xin chào",
        metadata: {
          target: "listening",
        },
        coverageTags: ["greeting", "listening"],
        pages: page(29),
        sourceRef: sourceRefFor("wb-listen-greeting", 29, "안녕하세요. -> xin chào"),
      },
      needsReview,
    ),
    ...createUnit1QrWorkbookExercises(qrSeedArgs),
  ];

  return {
    unitId: "1",
    unitNumber: 1,
    title: text("Chào hỏi và giới thiệu", "Greetings and introductions"),
    needsReview,
    extractionMode: needsReview ? "seeded_raw_blocks" : "manual_seed",
    sourceDocuments: documents,
    textbook: {
      vocab: [
        {
          id: "v-hello",
          korean: "안녕하세요",
          translations: text("xin chào", "hello"),
          romanization: "annyeonghaseyo",
          imagePath: vocabIcon("v-hello"),
          pages: page(18),
          sourceRef: sourceRefFor("v-hello", 18, "안녕하세요"),
          needsReview,
        },
        {
          id: "v-i-humble",
          korean: "저",
          translations: text("tôi, em (khiêm nhường)", "I, me (humble)"),
          romanization: "jeo",
          imagePath: vocabIcon("v-i-humble"),
          pages: page(18),
          sourceRef: sourceRefFor("v-i-humble", 18, "저"),
          needsReview,
        },
        {
          id: "v-first-time",
          korean: "처음",
          translations: text("lần đầu", "first time"),
          romanization: "cheoeum",
          pages: page(19),
          sourceRef: sourceRefFor("v-first-time", 19, "처음"),
          needsReview,
        },
        {
          id: "v-nice-to-meet",
          korean: "반갑습니다",
          translations: text("rất vui được gặp bạn", "nice to meet you"),
          romanization: "bangapseumnida",
          imagePath: vocabIcon("v-nice-to-meet"),
          pages: page(19),
          sourceRef: sourceRefFor("v-nice-to-meet", 19, "반갑습니다"),
          needsReview,
        },
        {
          id: "v-student",
          korean: "학생",
          translations: text("học sinh, sinh viên", "student"),
          romanization: "haksaeng",
          imagePath: vocabIcon("v-student"),
          pages: page(21),
          sourceRef: sourceRefFor("v-student", 21, "학생"),
          needsReview,
        },
        {
          id: "v-is-formal",
          korean: "입니다",
          translations: text("là, là ... ạ", "am, is, are (formal polite)"),
          romanization: "imnida",
          pages: page(21),
          sourceRef: sourceRefFor("v-is-formal", 21, "입니다"),
          needsReview,
        },
      ],
      grammar: [
        {
          id: "g-copula-imnida",
          pattern: "N + 입니다",
          explanation: text(
            "Gắn `입니다` sau danh từ để giới thiệu bản thân hoặc nói nghề nghiệp một cách lịch sự.",
            "Attach `입니다` after a noun to introduce someone or state identity politely.",
          ),
          exampleIds: ["ex-student", "ex-office-worker", "ex-doctor"],
          pages: page(21, 22),
          sourceRef: sourceRefFor("g-copula-imnida", 21, "N + 입니다"),
          needsReview,
        },
      ],
      dialogue: [
        {
          id: "d-minsu-hello",
          speaker: "Minsu",
          korean: "안녕하세요. 저는 민수입니다.",
          translations: text("Xin chào. Tôi là Minsu.", "Hello. I am Minsu."),
          pages: page(18),
          sourceRef: sourceRefFor("d-minsu-hello", 18, "안녕하세요. 저는 민수입니다."),
          needsReview,
        },
        {
          id: "d-jisu-hello",
          speaker: "Jisu",
          korean: "안녕하세요. 저는 지수입니다.",
          translations: text("Xin chào. Tôi là Jisu.", "Hello. I am Jisu."),
          pages: page(18),
          sourceRef: sourceRefFor("d-jisu-hello", 18, "안녕하세요. 저는 지수입니다."),
          needsReview,
        },
        {
          id: "d-minsu-nice",
          speaker: "Minsu",
          korean: "처음 뵙겠습니다.",
          translations: text("Lần đầu gặp bạn, rất hân hạnh.", "It is my first time meeting you."),
          pages: page(19),
          sourceRef: sourceRefFor("d-minsu-nice", 19, "처음 뵙겠습니다."),
          needsReview,
        },
        {
          id: "d-jisu-too",
          speaker: "Jisu",
          korean: "저도 반갑습니다.",
          translations: text("Tôi cũng rất vui được gặp bạn.", "Nice to meet you too."),
          pages: page(19),
          sourceRef: sourceRefFor("d-jisu-too", 19, "저도 반갑습니다."),
          needsReview,
        },
        {
          id: "d-minsu-student",
          speaker: "Minsu",
          korean: "저는 학생입니다.",
          translations: text("Tôi là học sinh.", "I am a student."),
          pages: page(21),
          sourceRef: sourceRefFor("d-minsu-student", 21, "저는 학생입니다."),
          needsReview,
        },
      ],
      examples: [
        {
          id: "ex-student",
          korean: "저는 학생입니다.",
          translations: text("Tôi là học sinh.", "I am a student."),
          grammarTags: ["N + copula"],
          pages: page(21),
          sourceRef: sourceRefFor("ex-student", 21, "저는 학생입니다."),
          needsReview,
        },
        {
          id: "ex-office-worker",
          korean: "저는 회사원입니다.",
          translations: text("Tôi là nhân viên công ty.", "I am an office worker."),
          grammarTags: ["N + copula"],
          pages: page(22),
          sourceRef: sourceRefFor("ex-office-worker", 22, "저는 회사원입니다."),
          needsReview,
        },
        {
          id: "ex-doctor",
          korean: "저는 의사입니다.",
          translations: text("Tôi là bác sĩ.", "I am a doctor."),
          grammarTags: ["N + copula"],
          pages: page(22),
          sourceRef: sourceRefFor("ex-doctor", 22, "저는 의사입니다."),
          needsReview,
        },
      ],
    },
    workbook: {
      audioAssets: createUnit1QrAudioAssets(qrSeedArgs),
      exercises: workbookExercises,
      listeningItems: [],
    },
    reviewNotes: [
      "Unit 1 source is normalized from the pilot raw draft and kept bilingual at the reviewed layer.",
      "Workbook exercises are split into smaller authored nodes so generation can build shorter lesson runs.",
      "QR listening now restores only the verified page-20 audio-backed country-flag prompts.",
    ],
  };
}
