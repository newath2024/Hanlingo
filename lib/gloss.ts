import type { GlossQuestionType, GlossSegment } from "@/types/curriculum";

type LocalizedGloss = {
  meaningEn: string;
  meaningVi: string;
};

type GlossResolverContext = {
  chunk: string;
  normalizedChunk: string;
  chunks: string[];
  index: number;
};

type ChunkToken = {
  text: string;
  normalizedText: string;
  start: number;
  end: number;
};

type GlossResolver = LocalizedGloss | ((context: GlossResolverContext) => LocalizedGloss | null);

const TRAILING_PUNCTUATION = /[.,!?]+$/;

export const GLOSS_ENABLED_TYPES: GlossQuestionType[] = [
  "speaking_prompt",
  "speaking_scaffold",
  "lesson_example",
  "grammar_example",
  "vocabulary_intro",
  "dialogue_example",
  "reading_support",
  "lesson_content",
  "review_light",
];

export function isGlossEnabled(input: {
  supportsGloss?: boolean;
  questionType?: GlossQuestionType;
}) {
  return input.supportsGloss ?? GLOSS_ENABLED_TYPES.includes(input.questionType ?? "active_recall");
}

const EXACT_CHUNK_GLOSSARY: Record<string, GlossResolver> = {
  "안녕하세요": { meaningEn: "hello", meaningVi: "xin chào" },
  "반갑습니다": { meaningEn: "nice to meet you", meaningVi: "rất vui được gặp" },
  "저는": (context) =>
    hasCopulaPredicateAfter(context.chunks, context.index)
      ? { meaningEn: "I am", meaningVi: "tôi là" }
      : { meaningEn: "I (topic)", meaningVi: "tôi (chủ đề)" },
  "저도": (context) =>
    hasCopulaPredicateAfter(context.chunks, context.index)
      ? { meaningEn: "I am too", meaningVi: "tôi cũng là" }
      : { meaningEn: "me too", meaningVi: "tôi cũng" },
  "저": { meaningEn: "I / me", meaningVi: "tôi" },
  "좀": { meaningEn: "a bit", meaningVi: "một chút" },
  "도와줄": { meaningEn: "help", meaningVi: "giúp" },
  "수": { meaningEn: "ability / can", meaningVi: "khả năng / có thể" },
  "있어요": { meaningEn: "there is / have", meaningVi: "có" },
  "있어요?": { meaningEn: "is there? / do you have?", meaningVi: "có không?" },
  "지수입니다": { meaningEn: "am Jisu", meaningVi: "là Jisu" },
  "민수입니다": { meaningEn: "am Minsu", meaningVi: "là Minsu" },
  "학생입니다": { meaningEn: "am a student", meaningVi: "là học sinh" },
  "학생이에요": { meaningEn: "am a student", meaningVi: "là học sinh" },
  "회사원입니다": { meaningEn: "am an office worker", meaningVi: "là nhân viên văn phòng" },
  "회사원이에요": { meaningEn: "am an office worker", meaningVi: "là nhân viên văn phòng" },
  "의사입니다": { meaningEn: "am a doctor", meaningVi: "là bác sĩ" },
  "의사예요": { meaningEn: "am a doctor", meaningVi: "là bác sĩ" },
  "여기에서": { meaningEn: "from here", meaningVi: "từ đây" },
  "서울역까지": { meaningEn: "to Seoul Station", meaningVi: "đến ga Seoul" },
  "어떻게": { meaningEn: "how", meaningVi: "như thế nào" },
  "가요?": { meaningEn: "do I go?", meaningVi: "đi?" },
  "정류장에서": { meaningEn: "at the bus stop", meaningVi: "ở bến xe buýt" },
  "버스를": { meaningEn: "the bus (object)", meaningVi: "xe buýt (tân ngữ)" },
  "타십시오.": { meaningEn: "please take [it]", meaningVi: "hãy đi / bắt" },
  "집에서": { meaningEn: "from home", meaningVi: "từ nhà" },
  "학교까지": { meaningEn: "to school", meaningVi: "đến trường" },
  "시간이": { meaningEn: "time (subject)", meaningVi: "thời gian (chủ ngữ)" },
  "얼마나": { meaningEn: "how much / how long", meaningVi: "bao nhiêu / bao lâu" },
  "걸려요?": { meaningEn: "does it take?", meaningVi: "mất?" },
  "도서관에서": { meaningEn: "from the library", meaningVi: "từ thư viện" },
  "식당까지": { meaningEn: "to the cafeteria", meaningVi: "đến nhà ăn" },
  "타고": { meaningEn: "ride and", meaningVi: "đi / bắt rồi" },
  "가요.": { meaningEn: "go", meaningVi: "đi" },
  "지하철역에서": { meaningEn: "from the subway station", meaningVi: "từ ga tàu điện ngầm" },
  "여행사까지": { meaningEn: "to the travel agency", meaningVi: "đến công ty du lịch" },
  "걸어가요.": { meaningEn: "walk there", meaningVi: "đi bộ đến" },
  "먼저": { meaningEn: "first", meaningVi: "trước tiên" },
  "야채들을": { meaningEn: "the vegetables (object)", meaningVi: "rau củ (tân ngữ)" },
  "한국": { meaningEn: "Korea / Korean", meaningVi: "Hàn Quốc / tiếng Hàn" },
  "노래를": { meaningEn: "songs (object)", meaningVi: "bài hát (tân ngữ)" },
  "많이": { meaningEn: "a lot", meaningVi: "nhiều" },
  "들으세요.": { meaningEn: "please listen", meaningVi: "hãy nghe" },
  "친구를": { meaningEn: "a friend (object)", meaningVi: "bạn (tân ngữ)" },
  "초대하려고": { meaningEn: "to invite", meaningVi: "để mời" },
  "초대장": { meaningEn: "invitation card", meaningVi: "thiệp mời" },
  "만들었어요.": { meaningEn: "made [it]", meaningVi: "đã làm" },
  "안": { meaningEn: "not", meaningVi: "không" },
  "돼요.": (context) =>
    previousChunkLooksLikeObligationStem(context.chunks, context.index)
      ? { meaningEn: "have to / must", meaningVi: "phải" }
      : { meaningEn: "works / is allowed", meaningVi: "được / ổn" },
  "돼요?": { meaningEn: "is it okay? / must [I]?", meaningVi: "được không? / có phải?" },
  "한국어": { meaningEn: "Korean", meaningVi: "tiếng Hàn" },
  "공부를": { meaningEn: "study (object)", meaningVi: "việc học (tân ngữ)" },
  "해야": { meaningEn: "must do", meaningVi: "phải làm" },
  "친구들": { meaningEn: "friends", meaningVi: "bạn bè" },
  "약속이": { meaningEn: "plans (subject)", meaningVi: "cuộc hẹn (chủ ngữ)" },
  "만나야": { meaningEn: "must meet", meaningVi: "phải gặp" },
  "몸이": { meaningEn: "body / health (subject)", meaningVi: "người / sức khỏe (chủ ngữ)" },
  "좋아서": { meaningEn: "because [it is] good", meaningVi: "vì tốt" },
  "안좋아서": { meaningEn: "because [I am] not well", meaningVi: "vì không khỏe" },
  "안좋아요.": { meaningEn: "am not well", meaningVi: "không khỏe" },
  "병원에": { meaningEn: "to the hospital", meaningVi: "đến bệnh viện" },
  "가야": { meaningEn: "must go", meaningVi: "phải đi" },
  "지훈": { meaningEn: "Jihun", meaningVi: "Jihun" },
  "씨,": { meaningEn: "Mr./Ms.", meaningVi: "anh/chị" },
  "집들이에서": { meaningEn: "at the housewarming", meaningVi: "ở tiệc tân gia" },
  "보통": { meaningEn: "usually", meaningVi: "thường" },
  "뭘": { meaningEn: "what", meaningVi: "gì" },
  "해요?": { meaningEn: "do?", meaningVi: "làm?" },
  "직원들이": { meaningEn: "the staff (subject)", meaningVi: "nhân viên (chủ ngữ)" },
  "친절해요.": { meaningEn: "are kind", meaningVi: "thân thiện" },
  "음식도": { meaningEn: "food too", meaningVi: "đồ ăn cũng" },
  "맛있고요.": { meaningEn: "is tasty too", meaningVi: "cũng ngon nữa" },
  "친구도": { meaningEn: "friends too", meaningVi: "bạn bè cũng" },
  "사귈": { meaningEn: "make / befriend", meaningVi: "kết bạn" },
  "있고요.": { meaningEn: "can also [do it]", meaningVi: "cũng có thể" },
  "내일": { meaningEn: "tomorrow", meaningVi: "ngày mai" },
  "집들이에": { meaningEn: "to the housewarming", meaningVi: "đến tiệc tân gia" },
  "사": { meaningEn: "buy", meaningVi: "mua" },
  "갈까요?": { meaningEn: "shall [we] bring?", meaningVi: "mang đi nhé?" },
  "세제를": { meaningEn: "detergent (object)", meaningVi: "nước giặt / chất tẩy (tân ngữ)" },
  "휴지도": { meaningEn: "tissue paper too", meaningVi: "giấy cũng" },
  "좋고요.": { meaningEn: "is fine too", meaningVi: "cũng ổn nữa" },
  "그럼": { meaningEn: "then", meaningVi: "vậy thì" },
  "휴지를": { meaningEn: "tissue paper (object)", meaningVi: "giấy (tân ngữ)" },
  "갑시다.": { meaningEn: "let's go / let's do it", meaningVi: "hãy cùng" },
  "죄송하지만": { meaningEn: "sorry, but", meaningVi: "xin lỗi nhưng" },
  "제가": { meaningEn: "I will", meaningVi: "để tôi" },
  "도와줄게요.": { meaningEn: "will help", meaningVi: "sẽ giúp" },
  "학생": { meaningEn: "student", meaningVi: "học sinh" },
  "지연": { meaningEn: "Jiyeon", meaningVi: "Jiyeon" },
  "잘": { meaningEn: "well", meaningVi: "khỏe / tốt" },
  "지냈어요?": { meaningEn: "have you been?", meaningVi: "dạo này thế nào?" },
  "어떤": { meaningEn: "what kind of", meaningVi: "loại nào / gì" },
  "메일": { meaningEn: "email", meaningVi: "email / thư điện tử" },
  "주세요.": { meaningEn: "please give/send [it]", meaningVi: "hãy gửi / cho tôi nhé" },
  "네,": { meaningEn: "yes,", meaningVi: "vâng," },
  "그래서": { meaningEn: "so / therefore", meaningVi: "vì vậy / cho nên" },
  "재미있어요.": { meaningEn: "it is fun", meaningVi: "thú vị" },
  "봐요.": { meaningEn: "see you / let's see", meaningVi: "gặp nhé / xem nhé" },
  "가깝습니다.": { meaningEn: "is close", meaningVi: "thì gần" },
  "가까워요.": { meaningEn: "is close", meaningVi: "gần" },
  "봅시다.": { meaningEn: "let's see", meaningVi: "hãy xem nào" },
  "한번": { meaningEn: "once / first", meaningVi: "một lần / thử" },
  "한": { meaningEn: "one", meaningVi: "một" },
  "세": { meaningEn: "three", meaningVi: "ba" },
  "시간": { meaningEn: "hours", meaningVi: "tiếng / giờ" },
  "이": { meaningEn: "this", meaningVi: "này" },
  "사람이": { meaningEn: "the person (subject)", meaningVi: "người này (chủ ngữ)" },
  "이용하지": { meaningEn: "do not use", meaningVi: "không sử dụng" },
  "않은": { meaningEn: "not used", meaningVi: "không dùng" },
  "바로": { meaningEn: "directly", meaningVi: "trực tiếp" },
  "가지": { meaningEn: "go", meaningVi: "đi" },
  "않아서": { meaningEn: "because [it] does not", meaningVi: "vì không..." },
  "가고": { meaningEn: "go and / want to go", meaningVi: "đi và / muốn đi" },
  "싶어요.": { meaningEn: "want to", meaningVi: "muốn" },
  "운동하러": { meaningEn: "to exercise", meaningVi: "để tập thể dục" },
  "먹다": { meaningEn: "to eat", meaningVi: "ăn" },
  "만들다": { meaningEn: "to make", meaningVi: "làm / tạo" },
  "번": { meaningEn: "time / occurrence", meaningVi: "lần" },
  "갔습니다.": { meaningEn: "went", meaningVi: "đã đi" },
  "여기에": { meaningEn: "here / in here", meaningVi: "ở đây / vào đây" },
  "저기": { meaningEn: "over there", meaningVi: "đằng kia" },
  "100번": { meaningEn: "number 100", meaningVi: "số 100" },
  "3호선을": { meaningEn: "Line 3 (object)", meaningVi: "tuyến số 3 (tân ngữ)" },
  "준비하다": { meaningEn: "to prepare", meaningVi: "chuẩn bị" },
  "수영": { meaningEn: "swimming", meaningVi: "bơi" },
  "모자도": { meaningEn: "hat too", meaningVi: "mũ cũng" },
  "가져가야": { meaningEn: "must bring", meaningVi: "phải mang theo" },
  "해요.": { meaningEn: "do / have to do", meaningVi: "làm / phải làm" },
  "구경해요.": { meaningEn: "look around", meaningVi: "tham quan / ngắm" },
  "같이": { meaningEn: "together", meaningVi: "cùng nhau" },
  "식사도": { meaningEn: "meal too", meaningVi: "bữa ăn cũng" },
  "하고요.": { meaningEn: "do too / and also do", meaningVi: "cũng làm / và cũng" },
  "도와줄까요?": { meaningEn: "shall I help?", meaningVi: "để tôi giúp nhé?" },
};

const BASE_NOUN_GLOSSARY: Record<string, LocalizedGloss> = {
  저: { meaningEn: "I / me", meaningVi: "tôi" },
  지수: { meaningEn: "Jisu", meaningVi: "Jisu" },
  민수: { meaningEn: "Minsu", meaningVi: "Minsu" },
  학생: { meaningEn: "student", meaningVi: "học sinh" },
  회사원: { meaningEn: "office worker", meaningVi: "nhân viên văn phòng" },
  의사: { meaningEn: "doctor", meaningVi: "bác sĩ" },
  서울역: { meaningEn: "Seoul Station", meaningVi: "ga Seoul" },
  정류장: { meaningEn: "bus stop", meaningVi: "bến xe buýt" },
  집: { meaningEn: "home / house", meaningVi: "nhà" },
  학교: { meaningEn: "school", meaningVi: "trường" },
  도서관: { meaningEn: "library", meaningVi: "thư viện" },
  식당: { meaningEn: "cafeteria / restaurant", meaningVi: "nhà ăn" },
  지하철역: { meaningEn: "subway station", meaningVi: "ga tàu điện ngầm" },
  여행사: { meaningEn: "travel agency", meaningVi: "công ty du lịch" },
  병원: { meaningEn: "hospital", meaningVi: "bệnh viện" },
  친구: { meaningEn: "friend", meaningVi: "bạn" },
  친구들: { meaningEn: "friends", meaningVi: "bạn bè" },
  집들이: { meaningEn: "housewarming", meaningVi: "tiệc tân gia" },
  세제: { meaningEn: "detergent", meaningVi: "nước giặt / chất tẩy" },
  휴지: { meaningEn: "tissue paper", meaningVi: "giấy" },
  초대장: { meaningEn: "invitation card", meaningVi: "thiệp mời" },
  한국어: { meaningEn: "Korean", meaningVi: "tiếng Hàn" },
  약속: { meaningEn: "plans / appointment", meaningVi: "cuộc hẹn" },
  버스: { meaningEn: "bus", meaningVi: "xe buýt" },
  지하철: { meaningEn: "subway", meaningVi: "tàu điện ngầm" },
  역: { meaningEn: "station", meaningVi: "ga / trạm" },
  음식: { meaningEn: "food", meaningVi: "món ăn / đồ ăn" },
  메일: { meaningEn: "email", meaningVi: "email / thư điện tử" },
  메시지: { meaningEn: "message", meaningVi: "tin nhắn" },
  서울: { meaningEn: "Seoul", meaningVi: "Seoul" },
  부산역: { meaningEn: "Busan Station", meaningVi: "ga Busan" },
  서면역: { meaningEn: "Seomyeon Station", meaningVi: "ga Seomyeon" },
  경주: { meaningEn: "Gyeongju", meaningVi: "Gyeongju" },
  공원: { meaningEn: "park", meaningVi: "công viên" },
  회사: { meaningEn: "company / office", meaningVi: "công ty / văn phòng" },
  박물관: { meaningEn: "museum", meaningVi: "bảo tàng" },
  비행기: { meaningEn: "airplane", meaningVi: "máy bay" },
  기차: { meaningEn: "train", meaningVi: "tàu hỏa" },
  교통수단: { meaningEn: "means of transportation", meaningVi: "phương tiện giao thông" },
  자전거: { meaningEn: "bicycle", meaningVi: "xe đạp" },
  한국: { meaningEn: "Korea", meaningVi: "Hàn Quốc" },
  말하기: { meaningEn: "speaking", meaningVi: "nói / kỹ năng nói" },
};

function stripTrailingPunctuation(value: string) {
  return value.replace(TRAILING_PUNCTUATION, "");
}

function hasCopulaPredicateAfter(chunks: string[], index: number) {
  const nextChunk = stripTrailingPunctuation(chunks[index + 1] ?? "");
  return (
    nextChunk.endsWith("입니다") ||
    nextChunk.endsWith("이에요") ||
    nextChunk.endsWith("예요")
  );
}

function previousChunkLooksLikeObligationStem(chunks: string[], index: number) {
  const previousChunk = stripTrailingPunctuation(chunks[index - 1] ?? "");
  return previousChunk.endsWith("해야") || previousChunk.endsWith("가야") || previousChunk.endsWith("만나야");
}

function tokenizeBySpaces(text: string) {
  const tokens: ChunkToken[] = [];
  const matcher = /\S+/g;

  for (const match of text.matchAll(matcher)) {
    const token = match[0] ?? "";
    const start = match.index ?? 0;

    tokens.push({
      text: token,
      normalizedText: stripTrailingPunctuation(token),
      start,
      end: start + token.length,
    });
  }

  return tokens;
}

function resolveFromExactDictionary(context: GlossResolverContext) {
  const resolver =
    EXACT_CHUNK_GLOSSARY[context.chunk] ??
    EXACT_CHUNK_GLOSSARY[context.normalizedChunk];

  if (!resolver) {
    return null;
  }

  return typeof resolver === "function" ? resolver(context) : resolver;
}

function resolveCopulaChunk(normalizedChunk: string) {
  for (const ending of ["입니다", "이에요", "예요"]) {
    if (!normalizedChunk.endsWith(ending) || normalizedChunk.length <= ending.length) {
      continue;
    }

    const stem = normalizedChunk.slice(0, -ending.length);
    const base = BASE_NOUN_GLOSSARY[stem];

    if (!base) {
      continue;
    }

    return {
      meaningEn: `am ${base.meaningEn}`,
      meaningVi: `là ${base.meaningVi}`,
    } satisfies LocalizedGloss;
  }

  return null;
}

function resolveParticleChunk(normalizedChunk: string) {
  const particlePatterns = [
    {
      suffix: "에서는",
      build: (base: LocalizedGloss) => ({
        meaningEn: `${base.meaningEn} (topic/location)`,
        meaningVi: `${base.meaningVi} (chủ đề/địa điểm)`,
      }),
    },
    {
      suffix: "에서",
      build: (base: LocalizedGloss) => ({
        meaningEn: `from / at ${base.meaningEn}`,
        meaningVi: `từ / ở ${base.meaningVi}`,
      }),
    },
    {
      suffix: "까지",
      build: (base: LocalizedGloss) => ({
        meaningEn: `to ${base.meaningEn}`,
        meaningVi: `đến ${base.meaningVi}`,
      }),
    },
    {
      suffix: "에는",
      build: (base: LocalizedGloss) => ({
        meaningEn: `at / to ${base.meaningEn}`,
        meaningVi: `ở / đến ${base.meaningVi}`,
      }),
    },
    {
      suffix: "에",
      build: (base: LocalizedGloss) => ({
        meaningEn: `at / in / to ${base.meaningEn}`,
        meaningVi: `ở / trong / đến ${base.meaningVi}`,
      }),
    },
    {
      suffix: "은",
      build: (base: LocalizedGloss) => ({
        meaningEn: `${base.meaningEn} (topic)`,
        meaningVi: `${base.meaningVi} (chủ đề)`,
      }),
    },
    {
      suffix: "는",
      build: (base: LocalizedGloss) => ({
        meaningEn: `${base.meaningEn} (topic)`,
        meaningVi: `${base.meaningVi} (chủ đề)`,
      }),
    },
    {
      suffix: "이",
      build: (base: LocalizedGloss) => ({
        meaningEn: `${base.meaningEn} (subject)`,
        meaningVi: `${base.meaningVi} (chủ ngữ)`,
      }),
    },
    {
      suffix: "가",
      build: (base: LocalizedGloss) => ({
        meaningEn: `${base.meaningEn} (subject)`,
        meaningVi: `${base.meaningVi} (chủ ngữ)`,
      }),
    },
    {
      suffix: "을",
      build: (base: LocalizedGloss) => ({
        meaningEn: `${base.meaningEn} (object)`,
        meaningVi: `${base.meaningVi} (tân ngữ)`,
      }),
    },
    {
      suffix: "를",
      build: (base: LocalizedGloss) => ({
        meaningEn: `${base.meaningEn} (object)`,
        meaningVi: `${base.meaningVi} (tân ngữ)`,
      }),
    },
    {
      suffix: "도",
      build: (base: LocalizedGloss) => ({
        meaningEn: `${base.meaningEn} too`,
        meaningVi: `${base.meaningVi} cũng`,
      }),
    },
  ] as const;

  for (const pattern of particlePatterns) {
    if (!normalizedChunk.endsWith(pattern.suffix) || normalizedChunk.length <= pattern.suffix.length) {
      continue;
    }

    const stem = normalizedChunk.slice(0, -pattern.suffix.length);
    const base = BASE_NOUN_GLOSSARY[stem];

    if (!base) {
      continue;
    }

    return pattern.build(base);
  }

  return null;
}

function resolveBaseNounChunk(normalizedChunk: string) {
  return BASE_NOUN_GLOSSARY[normalizedChunk] ?? null;
}

function resolveChunkGloss(context: GlossResolverContext) {
  return (
    resolveFromExactDictionary(context) ??
    resolveCopulaChunk(context.normalizedChunk) ??
    resolveParticleChunk(context.normalizedChunk) ??
    resolveBaseNounChunk(context.normalizedChunk)
  );
}

function getPreferredGloss(chunk: ChunkToken, preferredSegments: GlossSegment[]) {
  return (
    preferredSegments.find((segment) => segment.textKo === chunk.text) ??
    preferredSegments.find((segment) => segment.textKo === chunk.normalizedText) ??
    null
  );
}

function buildSentenceMeaning(segments: GlossSegment[], locale: "en" | "vi") {
  return segments
    .map((segment) => (locale === "vi" ? segment.meaningVi : segment.meaningEn).trim())
    .filter(Boolean)
    .join(" · ");
}

export function getPromptGlossData(
  text?: string,
  preferredSegments: GlossSegment[] = [],
) {
  if (!text) {
    return {
      segments: [] as GlossSegment[],
      sentenceMeaningEn: "",
      sentenceMeaningVi: "",
    };
  }

  const chunkTokens = tokenizeBySpaces(text);
  const segments = chunkTokens
    .map((chunk, index) => {
      const preferredGloss = getPreferredGloss(chunk, preferredSegments);

      if (preferredGloss) {
        return preferredGloss;
      }

      const resolvedGloss = resolveChunkGloss({
        chunk: chunk.text,
        normalizedChunk: chunk.normalizedText,
        chunks: chunkTokens.map((token) => token.text),
        index,
      });

      return resolvedGloss
        ? {
            textKo: chunk.text,
            ...resolvedGloss,
          }
        : null;
    })
    .filter((segment): segment is GlossSegment => Boolean(segment))
    .filter(
      (segment) =>
        typeof segment.textKo === "string" &&
        typeof segment.meaningEn === "string" &&
        typeof segment.meaningVi === "string" &&
        segment.textKo.trim() &&
        (segment.meaningEn.trim() || segment.meaningVi.trim()),
    );

  return {
    segments,
    sentenceMeaningEn: buildSentenceMeaning(segments, "en"),
    sentenceMeaningVi: buildSentenceMeaning(segments, "vi"),
  };
}

export function getPromptGlossSegments(
  text?: string,
  preferredSegments: GlossSegment[] = [],
): GlossSegment[] {
  return getPromptGlossData(text, preferredSegments).segments;
}
