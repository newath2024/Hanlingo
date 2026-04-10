export type RecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

export type RecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export type RecognitionConstructor = new () => RecognitionInstance;

export type ChunkStatus = "pending" | "correct" | "incorrect";

export type SpeechChunk = {
  displayText: string;
  normalizedText: string;
  status: ChunkStatus;
};

type KoreanSpeechOptions = {
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
};

type AudioPlaybackOptions = {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
};

type FeedbackToneKind = "correct" | "wrong";

const HANGUL_REGEX = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;
const PREFERRED_KOREAN_VOICE_HINTS = [
  "ko-kr",
  "korean",
  "google ko",
  "microsoft heami",
  "microsoft sunhi",
  "yuna",
];

function getPreferredKoreanVoice(voices: SpeechSynthesisVoice[]) {
  const koreanVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("ko"));

  if (koreanVoices.length === 0) {
    return null;
  }

  return (
    koreanVoices.find((voice) =>
      PREFERRED_KOREAN_VOICE_HINTS.some((hint) => {
        const combined = `${voice.name} ${voice.lang}`.toLowerCase();
        return combined.includes(hint);
      }),
    ) ?? koreanVoices[0]
  );
}

function getWordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function containsKoreanText(text: string) {
  return HANGUL_REGEX.test(text);
}

export function isLikelyKoreanVocabText(text: string, maxWords = 4) {
  return containsKoreanText(text) && getWordCount(text) <= maxWords;
}

export function speakKoreanText(text: string, options: KoreanSpeechOptions = {}) {
  if (
    typeof window === "undefined" ||
    !text.trim() ||
    !("speechSynthesis" in window) ||
    !("SpeechSynthesisUtterance" in window)
  ) {
    options.onError?.();
    return false;
  }

  const utterance = new SpeechSynthesisUtterance(text.trim());
  const selectedVoice = getPreferredKoreanVoice(window.speechSynthesis.getVoices());

  utterance.lang = selectedVoice?.lang ?? "ko-KR";
  utterance.voice = selectedVoice;
  utterance.rate = options.rate ?? 0.9;
  utterance.pitch = options.pitch ?? 1;
  utterance.volume = options.volume ?? 1;
  utterance.onstart = () => options.onStart?.();
  utterance.onend = () => options.onEnd?.();
  utterance.onerror = () => options.onError?.();

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

export function speakIfKoreanText(text: string, options: KoreanSpeechOptions = {}) {
  if (!containsKoreanText(text)) {
    return false;
  }

  return speakKoreanText(text, options);
}

export async function playAudioUrl(url: string, options: AudioPlaybackOptions = {}) {
  if (typeof window === "undefined" || !url.trim()) {
    options.onError?.();
    return false;
  }

  try {
    const audio = new Audio(url);
    audio.onplay = () => options.onStart?.();
    audio.onended = () => options.onEnd?.();
    audio.onerror = () => options.onError?.();
    await audio.play();
    return true;
  } catch {
    options.onError?.();
    return false;
  }
}

export function playFeedbackTone(kind: FeedbackToneKind) {
  if (typeof window === "undefined") {
    return false;
  }

  const AudioContextConstructor =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextConstructor) {
    return false;
  }

  const context = new AudioContextConstructor();
  const now = context.currentTime;
  const steps =
    kind === "correct"
      ? [
          { frequency: 659.25, duration: 0.1 },
          { frequency: 783.99, duration: 0.14 },
        ]
      : [
          { frequency: 392.0, duration: 0.14 },
          { frequency: 311.13, duration: 0.18 },
        ];

  let cursor = now;

  steps.forEach((step) => {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = kind === "correct" ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(step.frequency, cursor);
    gainNode.gain.setValueAtTime(0.0001, cursor);
    gainNode.gain.exponentialRampToValueAtTime(0.12, cursor + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, cursor + step.duration);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(cursor);
    oscillator.stop(cursor + step.duration);

    cursor += step.duration + 0.03;
  });

  void context.resume();
  window.setTimeout(() => {
    void context.close();
  }, Math.ceil((cursor - now) * 1000) + 100);

  return true;
}

export function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  const speechWindow = window as Window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };

  return (
    speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
  );
}

export function normalizeSpeechText(text: string) {
  return text
    .toLowerCase()
    .replace(/[.,!?'"`~:;()[\]{}]/g, "")
    .replace(/\s+/g, "");
}

function getBigrams(value: string) {
  if (value.length < 2) {
    return [value];
  }

  const bigrams: string[] = [];

  for (let index = 0; index < value.length - 1; index += 1) {
    bigrams.push(value.slice(index, index + 2));
  }

  return bigrams;
}

export function getSimilarity(left: string, right: string) {
  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  const leftBigrams = getBigrams(left);
  const rightBigrams = getBigrams(right);
  const rightCounts = new Map<string, number>();

  rightBigrams.forEach((bigram) => {
    rightCounts.set(bigram, (rightCounts.get(bigram) ?? 0) + 1);
  });

  let overlap = 0;

  leftBigrams.forEach((bigram) => {
    const count = rightCounts.get(bigram) ?? 0;

    if (count > 0) {
      overlap += 1;
      rightCounts.set(bigram, count - 1);
    }
  });

  return (2 * overlap) / (leftBigrams.length + rightBigrams.length);
}

export function matchesSpeechText(transcript: string, expected: string, threshold = 0.65) {
  const normalizedTranscript = normalizeSpeechText(transcript);
  const normalizedExpected = normalizeSpeechText(expected);

  if (!normalizedTranscript || !normalizedExpected) {
    return false;
  }

  if (
    normalizedTranscript.includes(normalizedExpected) ||
    normalizedExpected.includes(normalizedTranscript)
  ) {
    return true;
  }

  return getSimilarity(normalizedTranscript, normalizedExpected) >= threshold;
}

export function createSpeechChunks(text: string): SpeechChunk[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((chunk) => ({
      displayText: chunk,
      normalizedText: normalizeSpeechText(chunk),
      status: "pending" as ChunkStatus,
    }));
}

function isChunkMatched(normalizedTranscript: string, chunk: SpeechChunk) {
  if (!normalizedTranscript || !chunk.normalizedText) {
    return false;
  }

  if (normalizedTranscript.includes(chunk.normalizedText)) {
    return true;
  }

  return getSimilarity(normalizedTranscript, chunk.normalizedText) >= 0.65;
}

export function evaluateSpeechChunks(
  chunks: SpeechChunk[],
  transcript: string,
  finalizeUnmatched: boolean,
) {
  const normalizedTranscript = normalizeSpeechText(transcript);

  return chunks.map((chunk) => {
    if (chunk.status === "correct") {
      return chunk;
    }

    if (isChunkMatched(normalizedTranscript, chunk)) {
      return {
        ...chunk,
        status: "correct" as ChunkStatus,
      };
    }

    if (finalizeUnmatched) {
      return {
        ...chunk,
        status: "incorrect" as ChunkStatus,
      };
    }

    return {
      ...chunk,
      status: "pending" as ChunkStatus,
    };
  });
}

export function getChunkAccuracy(chunks: SpeechChunk[]) {
  if (chunks.length === 0) {
    return 0;
  }

  const correctChunks = chunks.filter((chunk) => chunk.status === "correct").length;
  return correctChunks / chunks.length;
}

function stripPromptPrefix(prompt: string) {
  return prompt.replace(/^say:\s*/i, "").trim();
}

export function extractExpectedSpeech(prompt: string) {
  return stripPromptPrefix(prompt);
}

export function matchesPromptSpeech(transcript: string, prompt: string) {
  const normalizedTranscript = normalizeSpeechText(transcript);
  const rawPrompt = stripPromptPrefix(prompt);
  const normalizedExpected = normalizeSpeechText(rawPrompt.replace(/\[[^\]]+\]/g, ""));
  const promptSegments = rawPrompt
    .split(/\[[^\]]+\]/g)
    .map((segment) => normalizeSpeechText(segment))
    .filter(Boolean);

  if (!normalizedTranscript) {
    return false;
  }

  if (normalizedExpected && matchesSpeechText(normalizedTranscript, normalizedExpected, 0.6)) {
    return true;
  }

  if (promptSegments.length === 0) {
    return false;
  }

  let cursor = 0;
  let matchedSegments = 0;

  promptSegments.forEach((segment) => {
    const nextIndex = normalizedTranscript.indexOf(segment, cursor);

    if (nextIndex !== -1) {
      matchedSegments += 1;
      cursor = nextIndex + segment.length;
    }
  });

  return matchedSegments / promptSegments.length >= 0.7;
}
