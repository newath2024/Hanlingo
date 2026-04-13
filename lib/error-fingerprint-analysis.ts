import {
  PARTICLE_CONFUSION_LOOKUP,
  SIMILAR_SOUNDING_LOOKUP,
  TENSE_POLITENESS_ENDING_GROUPS,
  VOCAB_CONFUSION_LOOKUP,
} from "@/lib/error-fingerprint-rules";
import {
  FINGERPRINT_UI_LABELS,
  getFingerprintUiReason,
  type FingerprintSummary,
  type MistakeAnalysisInput,
  type MistakeAnalysisPayload,
  type MistakeAnalysisResult,
} from "@/types/error-fingerprint";
import type { SessionItem } from "@/types/session";

const CHOSEONG = [
  "\u3131",
  "\u3132",
  "\u3134",
  "\u3137",
  "\u3138",
  "\u3139",
  "\u3141",
  "\u3142",
  "\u3143",
  "\u3145",
  "\u3146",
  "\u3147",
  "\u3148",
  "\u3149",
  "\u314a",
  "\u314b",
  "\u314c",
  "\u314d",
  "\u314e",
];

const JUNGSEONG = [
  "\u314f",
  "\u3150",
  "\u3151",
  "\u3152",
  "\u3153",
  "\u3154",
  "\u3155",
  "\u3156",
  "\u3157",
  "\u3158",
  "\u3159",
  "\u315a",
  "\u315b",
  "\u315c",
  "\u315d",
  "\u315e",
  "\u315f",
  "\u3160",
  "\u3161",
  "\u3162",
  "\u3163",
];

const JONGSEONG = [
  "",
  "\u3131",
  "\u3132",
  "\u3133",
  "\u3134",
  "\u3135",
  "\u3136",
  "\u3137",
  "\u3139",
  "\u313a",
  "\u313b",
  "\u313c",
  "\u313d",
  "\u313e",
  "\u313f",
  "\u3140",
  "\u3141",
  "\u3142",
  "\u3144",
  "\u3145",
  "\u3146",
  "\u3147",
  "\u3148",
  "\u314a",
  "\u314b",
  "\u314c",
  "\u314d",
  "\u314e",
];

const FAST_RESPONSE_THRESHOLDS: Record<SessionItem["type"], number> = {
  word_match: 1400,
  listen_select: 1500,
  listening: 1700,
  translate: 2500,
  translation_select: 1900,
  arrange_sentence: 3200,
  sentence_build: 3400,
  reorder_sentence: 3000,
  fill_blank: 2200,
  grammar_select: 1700,
  dialogue_reconstruct: 3400,
  dialogue_response: 2100,
  speaking: 2600,
  listen_repeat: 2800,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.,!?'"`~:;()[\]{}]/g, "")
    .replace(/\s+/g, " ");
}

function tokenizeText(value: string) {
  return normalizeText(value).split(" ").filter(Boolean);
}

function containsKorean(value: string) {
  return /[\uac00-\ud7a3]/.test(value);
}

function decomposeHangul(value: string) {
  return [...value]
    .map((char) => {
      const code = char.charCodeAt(0);

      if (code < 0xac00 || code > 0xd7a3) {
        return char;
      }

      const offset = code - 0xac00;
      const initial = Math.floor(offset / 588);
      const medial = Math.floor((offset % 588) / 28);
      const final = offset % 28;

      return `${CHOSEONG[initial]}${JUNGSEONG[medial]}${JONGSEONG[final]}`;
    })
    .join("");
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex + 1;

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const nextDiagonal = previous[rightIndex + 1];
      const cost = left[leftIndex] === right[rightIndex] ? 0 : 1;

      previous[rightIndex + 1] = Math.min(
        previous[rightIndex + 1] + 1,
        previous[rightIndex] + 1,
        diagonal + cost,
      );

      diagonal = nextDiagonal;
    }
  }

  return previous[right.length];
}

function similarityScore(left: string, right: string) {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);

  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  const maxLength = Math.max(normalizedLeft.length, normalizedRight.length);
  return clamp(1 - levenshteinDistance(normalizedLeft, normalizedRight) / maxLength, 0, 1);
}

function phoneticSimilarity(left: string, right: string) {
  const normalizedLeft = decomposeHangul(normalizeText(left));
  const normalizedRight = decomposeHangul(normalizeText(right));

  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  const maxLength = Math.max(normalizedLeft.length, normalizedRight.length);
  return clamp(1 - levenshteinDistance(normalizedLeft, normalizedRight) / maxLength, 0, 1);
}

function createTokenOverlap(userTokens: string[], correctTokens: string[]) {
  const remainingCorrect = [...correctTokens];
  const matched: string[] = [];
  const extra: string[] = [];

  for (const token of userTokens) {
    const matchIndex = remainingCorrect.indexOf(token);

    if (matchIndex >= 0) {
      matched.push(token);
      remainingCorrect.splice(matchIndex, 1);
      continue;
    }

    extra.push(token);
  }

  const missing = remainingCorrect;
  const denominator = Math.max(correctTokens.length, userTokens.length, 1);

  return {
    matched,
    missing,
    extra,
    overlapRatio: matched.length / denominator,
  };
}

function buildSummary(
  type: FingerprintSummary["type"],
  confidenceScore: number,
  shortReason: string,
) {
  return {
    type,
    confidenceScore,
    shortReason,
    uiLabel: FINGERPRINT_UI_LABELS[type],
    uiReason: getFingerprintUiReason(type, shortReason),
  } satisfies FingerprintSummary;
}

function buildResult(
  type: FingerprintSummary["type"],
  confidenceScore: number,
  shortReason: string,
  analysis: MistakeAnalysisPayload,
) {
  return {
    fingerprintType: type,
    confidenceScore,
    shortReason,
    analysis,
  } satisfies MistakeAnalysisResult;
}

function getChoiceTexts(question: SessionItem, answerOptionId?: string) {
  if (
    question.type === "listen_select" ||
    (question.type === "listening" &&
      (question.listeningType === "yes_no" ||
        question.listeningType === "multiple_choice" ||
        question.listeningType === "choose_image")) ||
    (question.type === "word_match" && "choices" in question)
  ) {
    const selectedOption = answerOptionId
      ? question.choices?.find((choice) => choice.id === answerOptionId)
      : undefined;
    const correctChoiceId =
      question.type === "listening" ? question.correctChoiceId : question.answer;
    const correctOption = question.choices?.find((choice) => choice.id === correctChoiceId);

    return {
      selectedOptionText: selectedOption?.text.en || selectedOption?.text.vi || "",
      correctOptionText: correctOption?.text.en || correctOption?.text.vi || "",
    };
  }

  if (question.type === "grammar_select") {
    return {
      selectedOptionText: answerOptionId ?? "",
      correctOptionText: question.answer,
    };
  }

  if (question.type === "translation_select" || question.type === "dialogue_response") {
    return {
      selectedOptionText: answerOptionId ?? "",
      correctOptionText: question.answer,
    };
  }

  return {
    selectedOptionText: "",
    correctOptionText: "",
  };
}

function getEndingRelation(userTokens: string[], correctTokens: string[]) {
  const userLastToken = userTokens.at(-1) ?? "";
  const correctLastToken = correctTokens.at(-1) ?? "";

  if (!userLastToken || !correctLastToken || userLastToken === correctLastToken) {
    return null;
  }

  const matchingGroup = TENSE_POLITENESS_ENDING_GROUPS.find((group) =>
    group.some((ending) => userLastToken.endsWith(ending) || correctLastToken.endsWith(ending)),
  );

  if (!matchingGroup) {
    return null;
  }

  return matchingGroup.filter(
    (ending) => userLastToken.endsWith(ending) || correctLastToken.endsWith(ending),
  );
}

function getParticleRelations(userTokens: string[], correctTokens: string[]) {
  const relationHints: string[] = [];

  for (const token of [...userTokens, ...correctTokens]) {
    const confusionTokens = PARTICLE_CONFUSION_LOOKUP.get(token);

    if (!confusionTokens) {
      continue;
    }

    if (
      userTokens.some((userToken) => confusionTokens.has(userToken)) ||
      correctTokens.some((correctToken) => confusionTokens.has(correctToken))
    ) {
      relationHints.push(`particle:${token}`);
    }
  }

  return [...new Set(relationHints)];
}

function findVocabRelation(userTokens: string[], correctTokens: string[]) {
  const relationHints: string[] = [];

  for (const token of userTokens) {
    const confusedWith = VOCAB_CONFUSION_LOOKUP.get(token);

    if (!confusedWith) {
      continue;
    }

    if (correctTokens.some((correctToken) => confusedWith.has(correctToken))) {
      relationHints.push(`vocab:${token}`);
    }
  }

  return [...new Set(relationHints)];
}

function isFastGuess(question: SessionItem, responseTimeMs: number) {
  return responseTimeMs > 0 && responseTimeMs <= FAST_RESPONSE_THRESHOLDS[question.type];
}

function classifyOrderingBreakdown(
  input: MistakeAnalysisInput,
  overlap: ReturnType<typeof createTokenOverlap>,
): MistakeAnalysisResult | null {
  if (
    input.question.type !== "arrange_sentence" &&
    input.question.type !== "dialogue_reconstruct" &&
    input.question.type !== "sentence_build" &&
    input.question.type !== "reorder_sentence" &&
    !(input.question.type === "listening" && input.question.listeningType === "order_step")
  ) {
    return null;
  }

  const answerTokens = input.answerTokens?.length
    ? input.answerTokens
    : tokenizeText(input.userAnswer);
  let correctTokens: string[];

  if (input.question.type === "listening") {
    const listeningQuestion = input.question as Extract<SessionItem, { type: "listening" }>;
    correctTokens = (listeningQuestion.correctOrderChoiceIds ?? []).map((choiceId) => {
      const choiceEntry = listeningQuestion.choices?.find((choice) => choice.id === choiceId);
      return choiceEntry?.text.en || choiceEntry?.text.vi || choiceId;
    });
  } else {
    correctTokens = input.question.answer;
  }
  const correctPositions = answerTokens.reduce((count, token, index) => {
    return count + (correctTokens[index] === token ? 1 : 0);
  }, 0);
  const sequenceRatio = correctTokens.length > 0 ? correctPositions / correctTokens.length : 0;

  if (overlap.overlapRatio >= 0.5 && sequenceRatio < 0.8) {
    return buildResult(
      "ORDERING_BREAKDOWN",
      clamp(0.72 + overlap.overlapRatio * 0.15 - sequenceRatio * 0.1, 0.7, 0.92),
      "Most chunks are present, but the sentence order broke down.",
      {
        reason: "Sentence pieces overlap strongly, but token order is off.",
        matchedRule: "ordering-breakdown",
        responseTimeMs: input.responseTimeMs,
        priorAttempts: input.priorAttempts,
        tokenOverlap: overlap,
        order: {
          correctPositions,
          totalTokens: correctTokens.length,
          sequenceRatio,
        },
      },
    );
  }

  return null;
}

function classifyListeningMishear(
  input: MistakeAnalysisInput,
  selectedOptionText: string,
  correctOptionText: string,
): MistakeAnalysisResult | null {
  const isListeningChoice =
    input.question.type === "listen_select" ||
    (input.question.type === "listening" &&
      (input.question.listeningType === "yes_no" ||
        input.question.listeningType === "multiple_choice" ||
        input.question.listeningType === "choose_image"));

  if (!isListeningChoice) {
    return null;
  }

  const selectedText = selectedOptionText || input.userAnswer;
  const correctText = correctOptionText || input.correctAnswer;
  const relationHints: string[] = [];
  const lexicalSimilarity = similarityScore(selectedText, correctText);
  const soundSimilarity =
    containsKorean(selectedText) && containsKorean(correctText)
      ? phoneticSimilarity(selectedText, correctText)
      : 0;

  if (
    SIMILAR_SOUNDING_LOOKUP.get(selectedText)?.has(correctText) ||
    SIMILAR_SOUNDING_LOOKUP.get(correctText)?.has(selectedText)
  ) {
    relationHints.push("curated-similar-sound");
  }

  if (soundSimilarity >= 0.66 || relationHints.length > 0) {
    return buildResult(
      "LISTENING_MISHEAR",
      clamp(0.74 + soundSimilarity * 0.18, 0.72, 0.95),
      "The wrong answer sounds close to the audio cue.",
      {
        reason: "Listening choice is phonetically close to the correct answer.",
        matchedRule: relationHints[0] ?? "phonetic-similarity",
        responseTimeMs: input.responseTimeMs,
        priorAttempts: input.priorAttempts,
        selectedOptionText: selectedText,
        correctOptionText: correctText,
        lexicalSimilarity,
        phoneticSimilarity: soundSimilarity,
        relationHints,
      },
    );
  }

  return null;
}

function classifyGrammarMismatch(
  input: MistakeAnalysisInput,
  overlap: ReturnType<typeof createTokenOverlap>,
  selectedOptionText: string,
  correctOptionText: string,
): MistakeAnalysisResult | null {
  const answerTokens = input.answerTokens?.length
    ? input.answerTokens
    : tokenizeText(input.userAnswer);
  const correctTokens = tokenizeText(input.correctAnswer);
  const particleRelations = getParticleRelations(answerTokens, correctTokens);
  const endingRelations = getEndingRelation(answerTokens, correctTokens);
  const isGrammarChoice = input.question.type === "grammar_select";
  const hasGrammarHints = isGrammarChoice || input.question.grammarTags.length > 0;

  if (
    particleRelations.length > 0 ||
    endingRelations?.length ||
    (hasGrammarHints && overlap.overlapRatio >= 0.34) ||
    (isGrammarChoice && selectedOptionText && correctOptionText)
  ) {
    const relationHints = [
      ...particleRelations,
      ...(endingRelations ? endingRelations.map((ending) => `ending:${ending}`) : []),
      ...input.question.grammarTags.map((tag) => `grammar:${tag}`),
    ];

    return buildResult(
      "GRAMMAR_MISMATCH",
      clamp(
        0.7 +
          (particleRelations.length > 0 ? 0.08 : 0) +
          (endingRelations?.length ? 0.1 : 0) +
          overlap.overlapRatio * 0.12,
        0.68,
        0.94,
      ),
      "Vocabulary was partly there, but the grammar form was off.",
      {
        reason: "Answer overlaps with the target, but grammar markers or endings differ.",
        matchedRule:
          particleRelations[0] ??
          (endingRelations?.length
            ? "ending-mismatch"
            : isGrammarChoice
              ? "grammar-choice"
              : "grammar-tags"),
        responseTimeMs: input.responseTimeMs,
        priorAttempts: input.priorAttempts,
        selectedOptionText,
        correctOptionText,
        normalizedUserAnswer: normalizeText(input.userAnswer),
        normalizedCorrectAnswer: normalizeText(input.correctAnswer),
        tokenOverlap: overlap,
        relationHints,
      },
    );
  }

  return null;
}

function classifyWordConfusion(
  input: MistakeAnalysisInput,
  overlap: ReturnType<typeof createTokenOverlap>,
  selectedOptionText: string,
  correctOptionText: string,
): MistakeAnalysisResult | null {
  const answerTokens = input.answerTokens?.length
    ? input.answerTokens
    : tokenizeText(input.userAnswer);
  const correctTokens = tokenizeText(input.correctAnswer);
  const relationHints = findVocabRelation(answerTokens, correctTokens);
  const lexicalSimilarity = similarityScore(
    selectedOptionText || input.userAnswer,
    correctOptionText || input.correctAnswer,
  );

  if (relationHints.length > 0 || lexicalSimilarity >= 0.45 || overlap.overlapRatio >= 0.5) {
    return buildResult(
      "WORD_CONFUSION",
      clamp(0.66 + lexicalSimilarity * 0.2 + overlap.overlapRatio * 0.08, 0.62, 0.9),
      "The answer looks close to a related word or particle.",
      {
        reason: "The wrong answer is lexically related to the correct target.",
        matchedRule: relationHints[0] ?? "lexical-similarity",
        responseTimeMs: input.responseTimeMs,
        priorAttempts: input.priorAttempts,
        selectedOptionText,
        correctOptionText,
        normalizedUserAnswer: normalizeText(input.userAnswer),
        normalizedCorrectAnswer: normalizeText(input.correctAnswer),
        tokenOverlap: overlap,
        lexicalSimilarity,
        relationHints,
      },
    );
  }

  return null;
}

function classifyRandomGuess(
  input: MistakeAnalysisInput,
  overlap: ReturnType<typeof createTokenOverlap>,
  selectedOptionText: string,
  correctOptionText: string,
) {
  const lexicalSimilarity = similarityScore(
    selectedOptionText || input.userAnswer,
    correctOptionText || input.correctAnswer,
  );
  const tooShort =
    normalizeText(input.userAnswer).length <= 2 ||
    (tokenizeText(input.userAnswer).length <= 1 && tokenizeText(input.correctAnswer).length >= 3);
  const fastGuess = isFastGuess(input.question, input.responseTimeMs);
  const repeatedGuess = input.priorAttempts >= 2 && overlap.overlapRatio < 0.34;
  const reason = repeatedGuess
    ? "Learner has repeated wrong attempts without converging on the target."
    : tooShort
      ? "Answer was unusually short for the target."
      : fastGuess
        ? "Answer landed unusually fast for this task shape."
        : "Selected answer shows little lexical or grammar relation to the target.";

  return buildResult(
    "RANDOM_GUESS",
    clamp(
      0.48 +
        (tooShort ? 0.12 : 0) +
        (fastGuess ? 0.14 : 0) +
        (repeatedGuess ? 0.14 : 0) +
        Math.max(0, 0.2 - lexicalSimilarity),
      0.35,
      0.86,
    ),
    tooShort || fastGuess || repeatedGuess
      ? "The answer looks like a low-signal guess."
      : "The wrong answer does not relate closely to the prompt.",
    {
      reason,
      matchedRule: repeatedGuess
        ? "repeated-guess"
        : tooShort
          ? "too-short"
          : fastGuess
            ? "too-fast"
            : "unrelated-answer",
      responseTimeMs: input.responseTimeMs,
      priorAttempts: input.priorAttempts,
      selectedOptionText,
      correctOptionText,
      normalizedUserAnswer: normalizeText(input.userAnswer),
      normalizedCorrectAnswer: normalizeText(input.correctAnswer),
      tokenOverlap: overlap,
      lexicalSimilarity,
      relationHints: [],
    },
  );
}

export function summarizeFingerprint(result: MistakeAnalysisResult) {
  return buildSummary(result.fingerprintType, result.confidenceScore, result.shortReason);
}

export function analyzeMistake(input: MistakeAnalysisInput): MistakeAnalysisResult {
  const normalizedUserAnswer = normalizeText(input.userAnswer);
  const normalizedCorrectAnswer = normalizeText(input.correctAnswer);
  const answerTokens = input.answerTokens?.length
    ? input.answerTokens
    : tokenizeText(normalizedUserAnswer);
  const correctTokens = tokenizeText(normalizedCorrectAnswer);
  const overlap = createTokenOverlap(answerTokens, correctTokens);
  const { selectedOptionText, correctOptionText } = getChoiceTexts(
    input.question,
    input.answerOptionId,
  );

  const orderingBreakdown = classifyOrderingBreakdown(input, overlap);

  if (orderingBreakdown) {
    return orderingBreakdown;
  }

  const listeningMishear = classifyListeningMishear(
    input,
    selectedOptionText,
    correctOptionText,
  );

  if (listeningMishear) {
    return listeningMishear;
  }

  const grammarMismatch = classifyGrammarMismatch(
    input,
    overlap,
    selectedOptionText,
    correctOptionText,
  );

  if (grammarMismatch) {
    return grammarMismatch;
  }

  const wordConfusion = classifyWordConfusion(
    input,
    overlap,
    selectedOptionText,
    correctOptionText,
  );

  if (wordConfusion) {
    return wordConfusion;
  }

  return classifyRandomGuess(input, overlap, selectedOptionText, correctOptionText);
}
