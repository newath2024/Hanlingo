import type {
  ArrangeSentenceTask,
  DialogueReconstructTask,
  GrammarSelectTask,
  InteractionMode,
  LocalizedText,
  RuntimeLesson,
  RuntimeTask,
  TranslateTask,
} from "@/types/curriculum";
import type { SentenceExposureMap } from "./storage";

export type AdaptiveSentenceSourceTask =
  | TranslateTask
  | ArrangeSentenceTask
  | DialogueReconstructTask;

export type AdaptiveSentenceRuntimeTask =
  | ArrangeSentenceTask
  | GrammarSelectTask
  | TranslateTask;

export type SentenceTaskGeneratorInput = {
  baseTask: AdaptiveSentenceSourceTask;
  sentenceKr: string;
  meaning: LocalizedText;
  unitLevel: number;
  seenCount: number;
  sentenceKey: string;
  distractorPool?: string[];
};

export type SentenceTaskGeneratorResult = {
  task: AdaptiveSentenceRuntimeTask;
  interactionMode: InteractionMode;
  sentenceKey: string;
  chunks: string[];
  blankIndex?: number;
};

export type ExtractedSentenceTask = {
  baseTask: AdaptiveSentenceSourceTask;
  sentenceKr: string;
  meaning: LocalizedText;
  sentenceKey: string;
  chunks: string[];
};

const BASIC_DISTRACTOR_CHUNKS = [
  "안녕하세요",
  "저는",
  "학생입니다",
  "선생님입니다",
  "회사원입니다",
  "민수입니다",
  "지수입니다",
  "반갑습니다",
  "처음 뵙겠습니다",
];

const EXTENDED_DISTRACTOR_CHUNKS = [
  "우리",
  "한국어를",
  "배웁니다",
  "좋아합니다",
  "친구입니다",
  "괜찮습니다",
];

function normalizeSpacing(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function stripTerminalPunctuation(value: string) {
  return value.replace(/[.?!,]+$/g, "");
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter((value) => value.trim()))];
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function deterministicShuffle(values: string[], seed: string) {
  return [...values]
    .map((value, index) => ({
      value,
      index,
      score: hashString(`${seed}:${value}:${index}`),
    }))
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map((entry) => entry.value);
}

function scoreDistractorCandidate(candidate: string, correctChunk: string) {
  const cleanCandidate = stripTerminalPunctuation(candidate);
  const cleanCorrectChunk = stripTerminalPunctuation(correctChunk);

  if (!cleanCandidate || cleanCandidate === cleanCorrectChunk) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;

  if (cleanCandidate.at(-1) === cleanCorrectChunk.at(-1)) {
    score += 3;
  }

  if (cleanCandidate.slice(-2) === cleanCorrectChunk.slice(-2)) {
    score += 4;
  }

  if (/[.?!,]$/.test(candidate) === /[.?!,]$/.test(correctChunk)) {
    score += 1;
  }

  score -= Math.abs(cleanCandidate.length - cleanCorrectChunk.length);

  return score;
}

function getFallbackDistractorPool(unitLevel: number) {
  return unitLevel <= 1
    ? BASIC_DISTRACTOR_CHUNKS
    : [...BASIC_DISTRACTOR_CHUNKS, ...EXTENDED_DISTRACTOR_CHUNKS];
}

function getHybridSupportText(
  meaning: LocalizedText,
  baseTask: AdaptiveSentenceSourceTask,
): LocalizedText {
  if (baseTask.type !== "dialogue_reconstruct" || !baseTask.speaker.trim()) {
    return meaning;
  }

  return {
    en: `${baseTask.speaker}: ${meaning.en}`,
    vi: `${baseTask.speaker}: ${meaning.vi}`,
  };
}

function buildAdaptivePrompt(mode: InteractionMode): LocalizedText {
  if (mode === "word_bank") {
    return {
      en: "Arrange the Korean chunks into the full sentence.",
      vi: "Sap xep cac cum tieng Han thanh cau hoan chinh.",
    };
  }

  if (mode === "hybrid") {
    return {
      en: "Complete the sentence.",
      vi: "Hoan thanh cau.",
    };
  }

  return {
    en: "Translate the meaning into Korean.",
    vi: "Dich nghia sang tieng Han.",
  };
}

export function normalizeSentenceKey(value: string) {
  return normalizeSpacing(value)
    .toLowerCase()
    .replace(/[.,!?'"`~:;()[\]{}]/g, "");
}

export function chunkKoreanSentence(sentenceKr: string) {
  const normalizedSentence = normalizeSpacing(sentenceKr);

  if (!normalizedSentence) {
    return [];
  }

  return normalizedSentence.split(" ").filter(Boolean);
}

export function decideInteractionMode(seenCount: number): InteractionMode {
  if (seenCount <= 0) {
    return "word_bank";
  }

  if (seenCount <= 2) {
    return "hybrid";
  }

  return "full_input";
}

export function selectHybridBlankIndex(chunks: string[]) {
  return Math.max(chunks.length - 1, 0);
}

export function extractSentenceTask(task: RuntimeTask): ExtractedSentenceTask | null {
  if (task.type === "translate") {
    const sentenceKr =
      task.direction === "meaning_to_ko"
        ? normalizeSpacing(task.acceptedAnswers?.[0] ?? "")
        : normalizeSpacing(task.koreanText ?? "");
    const chunks = chunkKoreanSentence(sentenceKr);

    if (chunks.length < 2) {
      return null;
    }

    return {
      baseTask: task,
      sentenceKr,
      meaning: task.meaning,
      sentenceKey: normalizeSentenceKey(sentenceKr),
      chunks,
    };
  }

  if (task.type === "arrange_sentence" || task.type === "dialogue_reconstruct") {
    const sentenceKr = normalizeSpacing(task.answer.join(" "));
    const chunks = chunkKoreanSentence(sentenceKr);

    if (chunks.length < 2) {
      return null;
    }

    return {
      baseTask: task,
      sentenceKr,
      meaning: task.type === "arrange_sentence" ? task.meaning : task.translation,
      sentenceKey: normalizeSentenceKey(sentenceKr),
      chunks,
    };
  }

  return null;
}

export function collectLessonSentenceDistractorPool(lesson: RuntimeLesson) {
  return uniqueValues(
    lesson.tasks.flatMap((task) => extractSentenceTask(task)?.chunks ?? []),
  );
}

export function getSentenceSeenCount(
  sentenceKey: string,
  sentenceSeenCounts: SentenceExposureMap = {},
) {
  return sentenceSeenCounts[sentenceKey] ?? 0;
}

function selectDistractors(
  correctChunk: string,
  usedChunks: string[],
  unitLevel: number,
  sentenceKey: string,
  distractorPool: string[] = [],
  desiredCount = 2,
) {
  const forbidden = new Set([
    ...usedChunks.map((chunk) => normalizeSentenceKey(chunk)),
    normalizeSentenceKey(correctChunk),
  ]);
  const rankedCandidates = uniqueValues([
    ...distractorPool,
    ...getFallbackDistractorPool(unitLevel),
  ])
    .filter((candidate) => !forbidden.has(normalizeSentenceKey(candidate)))
    .map((candidate) => ({
      candidate,
      score: scoreDistractorCandidate(candidate, correctChunk),
    }))
    .sort((left, right) => right.score - left.score || left.candidate.localeCompare(right.candidate))
    .map((entry) => entry.candidate);
  const selected = rankedCandidates.slice(0, desiredCount);

  if (selected.length === desiredCount) {
    return deterministicShuffle(selected, `${sentenceKey}:distractors`);
  }

  const fallbackCandidates = getFallbackDistractorPool(unitLevel).filter(
    (candidate) =>
      !forbidden.has(normalizeSentenceKey(candidate)) && !selected.includes(candidate),
  );

  return deterministicShuffle(
    [...selected, ...fallbackCandidates.slice(0, desiredCount - selected.length)],
    `${sentenceKey}:fallback-distractors`,
  );
}

function createWordBankTask(
  input: SentenceTaskGeneratorInput,
  chunks: string[],
): SentenceTaskGeneratorResult {
  const distractors = selectDistractors(
    chunks[chunks.length - 1] ?? "",
    chunks,
    input.unitLevel,
    input.sentenceKey,
    input.distractorPool,
  );
  const wordBank = deterministicShuffle(
    uniqueValues([...chunks, ...distractors]),
    `${input.sentenceKey}:word-bank`,
  );

  return {
    interactionMode: "word_bank",
    sentenceKey: input.sentenceKey,
    chunks,
    task: {
      ...input.baseTask,
      type: "arrange_sentence",
      prompt: buildAdaptivePrompt("word_bank"),
      meaning: input.meaning,
      wordBank,
      answer: chunks,
      interactionMode: "word_bank",
      sentenceKey: input.sentenceKey,
    },
  };
}

function createHybridTask(
  input: SentenceTaskGeneratorInput,
  chunks: string[],
): SentenceTaskGeneratorResult {
  const blankIndex = selectHybridBlankIndex(chunks);
  const answer = chunks[blankIndex] ?? "";
  const choices = deterministicShuffle(
    uniqueValues([
      answer,
      ...selectDistractors(
        answer,
        chunks,
        input.unitLevel,
        input.sentenceKey,
        input.distractorPool,
      ),
    ]).slice(0, 3),
    `${input.sentenceKey}:hybrid-choices`,
  );

  return {
    interactionMode: "hybrid",
    sentenceKey: input.sentenceKey,
    chunks,
    blankIndex,
    task: {
      ...input.baseTask,
      type: "grammar_select",
      prompt: buildAdaptivePrompt("hybrid"),
      supportText: getHybridSupportText(input.meaning, input.baseTask),
      koreanText: chunks
        .map((chunk, index) => (index === blankIndex ? "____" : chunk))
        .join(" "),
      choices,
      answer,
      interactionMode: "hybrid",
      sentenceKey: input.sentenceKey,
    },
  };
}

function createFullInputTask(
  input: SentenceTaskGeneratorInput,
  chunks: string[],
): SentenceTaskGeneratorResult {
  return {
    interactionMode: "full_input",
    sentenceKey: input.sentenceKey,
    chunks,
    task: {
      ...input.baseTask,
      type: "translate",
      direction: "meaning_to_ko",
      prompt: buildAdaptivePrompt("full_input"),
      meaning: input.meaning,
      koreanText: undefined,
      acceptedAnswers: [input.sentenceKr],
      placeholder: {
        en: "Type the Korean sentence",
        vi: "Nhap cau tieng Han",
      },
      interactionMode: "full_input",
      sentenceKey: input.sentenceKey,
    },
  };
}

export function generateSentenceTask(input: SentenceTaskGeneratorInput): SentenceTaskGeneratorResult {
  const chunks = chunkKoreanSentence(input.sentenceKr);
  const mode = decideInteractionMode(input.seenCount);

  if (mode === "word_bank") {
    return createWordBankTask(input, chunks);
  }

  if (mode === "hybrid") {
    return createHybridTask(input, chunks);
  }

  return createFullInputTask(input, chunks);
}
