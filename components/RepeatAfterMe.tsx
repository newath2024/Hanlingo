"use client";

import { useSpeechRecognitionSupport } from "@/hooks/useHanlingoSnapshot";
import type { DialogueLine } from "@/types/lesson";
import { useEffect, useMemo, useRef, useState } from "react";

type RepeatAfterMeProps = {
  lines: DialogueLine[];
  onComplete: () => void;
  onSkip: () => void;
};

type ChunkStatus = "pending" | "correct" | "incorrect";

type PronunciationChunk = {
  displayText: string;
  normalizedText: string;
  status: ChunkStatus;
};

type RepeatLineState = {
  lineIndex: number;
  transcript: string;
  chunks: PronunciationChunk[];
  attempts: number;
};

type RecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type RecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type RecognitionConstructor = new () => RecognitionInstance;

function normalizeForMatch(text: string) {
  return text
    .toLowerCase()
    .replace(/[.,!?'"`~:;()[\]{}]/g, "")
    .replace(/\s+/g, "");
}

function createChunks(text: string): PronunciationChunk[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((chunk) => ({
      displayText: chunk,
      normalizedText: normalizeForMatch(chunk),
      status: "pending" as ChunkStatus,
    }));
}

function createLineStates(lines: DialogueLine[]): RepeatLineState[] {
  return lines.map((line, lineIndex) => ({
    lineIndex,
    transcript: "",
    chunks: createChunks(line.text),
    attempts: 0,
  }));
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

function getSimilarity(left: string, right: string) {
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

function isChunkMatched(normalizedTranscript: string, chunk: PronunciationChunk) {
  if (!normalizedTranscript || !chunk.normalizedText) {
    return false;
  }

  if (normalizedTranscript.includes(chunk.normalizedText)) {
    return true;
  }

  return getSimilarity(normalizedTranscript, chunk.normalizedText) >= 0.65;
}

function evaluateChunks(
  chunks: PronunciationChunk[],
  transcript: string,
  finalizeUnmatched: boolean,
) {
  const normalizedTranscript = normalizeForMatch(transcript);

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

export default function RepeatAfterMe({
  lines,
  onComplete,
  onSkip,
}: RepeatAfterMeProps) {
  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const mockAudioTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualModeRef = useRef(false);
  const speechSupported = useSpeechRecognitionSupport();

  const [lineStates, setLineStates] = useState(() => createLineStates(lines));
  const [reviewQueue, setReviewQueue] = useState<number[] | null>(null);
  const [queuePosition, setQueuePosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [listening, setListening] = useState(false);
  const [reviewRoundCount, setReviewRoundCount] = useState(0);
  const [showReviewSummary, setShowReviewSummary] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const activeLineIndex = reviewQueue ? reviewQueue[queuePosition] : queuePosition;
  const currentLine = lines[activeLineIndex];
  const currentState = lineStates[activeLineIndex];

  const totalChunks = useMemo(
    () => lineStates.reduce((total, lineState) => total + lineState.chunks.length, 0),
    [lineStates],
  );

  const correctChunks = useMemo(
    () =>
      lineStates.reduce(
        (total, lineState) =>
          total +
          lineState.chunks.filter((chunk) => chunk.status === "correct").length,
        0,
      ),
    [lineStates],
  );

  const repeatScore = totalChunks > 0 ? correctChunks / totalChunks : 0;
  const canPass = repeatScore >= 0.7;
  const failedLineIndices = useMemo(
    () =>
      lineStates
        .filter((lineState) =>
          lineState.chunks.some((chunk) => chunk.status !== "correct"),
        )
        .map((lineState) => lineState.lineIndex),
    [lineStates],
  );

  const currentLinePassed = currentState.chunks.every(
    (chunk) => chunk.status === "correct",
  );
  const currentLineAttempted = currentState.attempts > 0;
  const currentLineHasChanges =
    currentState.attempts > 0 ||
    currentState.chunks.some((chunk) => chunk.status !== "pending");
  const isLastQueueItem = reviewQueue
    ? queuePosition === reviewQueue.length - 1
    : queuePosition === lines.length - 1;

  useEffect(() => {
    const speechWindow = window as Window & {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };

    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "ko-KR";

    recognition.onresult = (event) => {
      let nextTranscript = "";

      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        nextTranscript += result[0]?.transcript ?? "";
      }

      setLineStates((previous) =>
        previous.map((lineState) =>
          lineState.lineIndex === activeLineIndex
            ? {
                ...lineState,
                transcript: nextTranscript.trim(),
                chunks: evaluateChunks(lineState.chunks, nextTranscript, false),
              }
            : lineState,
        ),
      );
    };

    recognition.onerror = (event) => {
      setListening(false);
      setErrorMessage(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access is blocked. Allow mic permission in your browser, then try again."
          : `Speech recognition error: ${event.error}`,
      );
    };

    recognition.onend = () => {
      setListening(false);

      if (manualModeRef.current) {
        return;
      }

      setLineStates((previous) =>
        previous.map((lineState) =>
          lineState.lineIndex === activeLineIndex
            ? {
                ...lineState,
                attempts: lineState.attempts + 1,
                chunks: evaluateChunks(
                  lineState.chunks,
                  lineState.transcript,
                  true,
                ),
              }
            : lineState,
        ),
      );
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, [activeLineIndex, speechSupported]);

  useEffect(() => {
    return () => {
      if (mockAudioTimeoutRef.current) {
        clearTimeout(mockAudioTimeoutRef.current);
      }

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }

      recognitionRef.current?.stop();
    };
  }, []);

  function handlePlayAudio() {
    if (typeof window === "undefined") {
      return;
    }

    if ("speechSynthesis" in window && "SpeechSynthesisUtterance" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(currentLine.text);
      utterance.lang = "ko-KR";
      utterance.rate = 0.88;
      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);
      window.speechSynthesis.speak(utterance);
      return;
    }

    setIsPlaying(true);

    if (mockAudioTimeoutRef.current) {
      clearTimeout(mockAudioTimeoutRef.current);
    }

    mockAudioTimeoutRef.current = setTimeout(() => {
      setIsPlaying(false);
    }, 900);
  }

  function handleStartListening() {
    if (!recognitionRef.current) {
      return;
    }

    setErrorMessage("");
    manualModeRef.current = false;

    setLineStates((previous) =>
      previous.map((lineState) =>
        lineState.lineIndex === activeLineIndex
          ? {
              ...lineState,
              transcript: "",
              chunks: lineState.chunks.map((chunk) => ({
                ...chunk,
                status: chunk.status === "correct" ? "correct" : "pending",
              })),
            }
          : lineState,
      ),
    );

    try {
      setListening(true);
      recognitionRef.current.start();
    } catch {
      setListening(false);
      setErrorMessage("Speech recognition is already running.");
    }
  }

  function handleRetryLine() {
    recognitionRef.current?.stop();
    setListening(false);
    setErrorMessage("");
    setLineStates((previous) =>
      previous.map((lineState) =>
        lineState.lineIndex === activeLineIndex
          ? {
              ...lineState,
              transcript: "",
              chunks: createChunks(lines[activeLineIndex].text),
              attempts: lineState.attempts,
            }
          : lineState,
      ),
    );
  }

  function handleToggleManualChunk(displayText: string) {
    if (speechSupported) {
      return;
    }

    manualModeRef.current = true;

    setLineStates((previous) =>
      previous.map((lineState) =>
        lineState.lineIndex === activeLineIndex
          ? {
              ...lineState,
              chunks: lineState.chunks.map((chunk) =>
                chunk.displayText === displayText
                  ? {
                      ...chunk,
                      status:
                        chunk.status === "correct"
                          ? "incorrect"
                          : chunk.status === "incorrect"
                            ? "pending"
                            : "correct",
                    }
                  : chunk,
              ),
            }
          : lineState,
      ),
    );
  }

  function finalizeManualAttempt() {
    setLineStates((previous) =>
      previous.map((lineState) =>
        lineState.lineIndex === activeLineIndex
          ? {
              ...lineState,
              attempts: lineState.attempts + 1,
              chunks: lineState.chunks.map((chunk) =>
                chunk.status === "pending"
                  ? {
                      ...chunk,
                      status: "incorrect" as ChunkStatus,
                    }
                  : chunk,
              ),
            }
          : lineState,
      ),
    );
  }

  function moveToNextLine() {
    setErrorMessage("");

    if (reviewQueue) {
      if (isLastQueueItem) {
        setShowReviewSummary(true);
        return;
      }

      setQueuePosition((previous) => previous + 1);
      return;
    }

    if (queuePosition === lines.length - 1) {
      if (canPass) {
        onComplete();
        return;
      }

      setShowReviewSummary(true);
      return;
    }

    setQueuePosition((previous) => previous + 1);
  }

  function handleContinue() {
    if (!speechSupported && !currentLineAttempted) {
      finalizeManualAttempt();
      return;
    }

    if (speechSupported && !currentLineHasChanges) {
      return;
    }

    moveToNextLine();
  }

  function handleRetryFailedLines() {
    if (failedLineIndices.length === 0) {
      onComplete();
      return;
    }

    setReviewRoundCount((previous) => previous + 1);
    setReviewQueue(failedLineIndices);
    setQueuePosition(0);
    setShowReviewSummary(false);
    setErrorMessage("");
    setLineStates((previous) =>
      previous.map((lineState) =>
        failedLineIndices.includes(lineState.lineIndex)
          ? {
              ...lineState,
              transcript: "",
              chunks: createChunks(lines[lineState.lineIndex].text).map(
                (freshChunk, index) => ({
                  ...freshChunk,
                  status:
                    lineState.chunks[index]?.status === "correct"
                      ? "correct"
                      : "pending",
                }),
              ),
            }
          : lineState,
      ),
    );
  }

  function handleSkipForNow() {
    recognitionRef.current?.stop();
    setListening(false);
    setErrorMessage("");
    onSkip();
  }

  function getChunkTone(status: ChunkStatus) {
    if (status === "correct") {
      return "border-accent bg-success-soft text-accent-strong";
    }

    if (status === "incorrect") {
      return "border-danger bg-danger-soft text-danger";
    }

    return "border-accent/12 bg-white text-foreground";
  }

  if (showReviewSummary) {
    return (
      <section className="panel">
        <div className="lesson-card space-y-6">
          <div className="space-y-2 text-center">
            <span className="pill mx-auto bg-card-strong text-foreground">
              Pronunciation review
            </span>
            <h3 className="font-display text-3xl text-foreground sm:text-4xl">
              {Math.round(repeatScore * 100)}% chunk accuracy
            </h3>
            <p className="text-base font-bold text-muted-foreground">
              {canPass
                ? "You hit the pass threshold. You can continue or review failed chunks."
                : "You are close. Retry the failed lines and keep moving."}
            </p>
          </div>

          <div className="rounded-[1.9rem] bg-card-soft p-5">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Failed chunks
            </p>
            <div className="mt-4 space-y-4">
              {failedLineIndices.length > 0 ? (
                failedLineIndices.map((lineIndex) => {
                  const line = lines[lineIndex];
                  const lineState = lineStates[lineIndex];

                  return (
                    <div key={lineIndex} className="rounded-[1.5rem] bg-white p-4">
                      <p className="text-lg font-extrabold text-foreground">{line.text}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {lineState.chunks
                          .filter((chunk) => chunk.status !== "correct")
                          .map((chunk) => (
                            <span
                              key={`${lineIndex}-${chunk.displayText}`}
                              className="chip-button border-danger bg-danger-soft text-danger"
                            >
                              {chunk.displayText}
                            </span>
                          ))}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-base font-bold text-muted-foreground">
                  No failed chunks. You can continue.
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-3">
            <button type="button" onClick={handleRetryFailedLines} className="primary-button w-full">
              {failedLineIndices.length > 0 ? "Retry failed lines" : "Continue"}
            </button>
            <button type="button" onClick={handleSkipForNow} className="secondary-button w-full">
              No mic right now, skip this step
            </button>
            {(reviewRoundCount > 0 || canPass) && (
              <button type="button" onClick={onComplete} className="secondary-button w-full">
                Continue for now
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Repeat After Me
            </p>
            <h3 className="font-display text-3xl text-foreground sm:text-4xl">
              Hear the line, speak it, and watch chunks turn green.
            </h3>
          </div>
          <span className="pill bg-card-strong text-foreground">
            Practice {activeLineIndex + 1} of {lines.length}
          </span>
        </div>

        <article className="lesson-card space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="pill bg-accent-cool text-accent-strong">
              {currentLine.speaker}
            </span>
            <span className="pill bg-card-strong text-foreground">
              {Math.round(repeatScore * 100)}% correct overall
            </span>
          </div>

          <div className="space-y-3 text-center">
            <p className="korean-display">{currentLine.text}</p>
            <p className="text-lg font-bold text-muted-foreground">
              {currentLine.translation}
            </p>
          </div>

          <div className="rounded-[1.8rem] bg-card-soft p-5">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Chunks
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {currentState.chunks.map((chunk) => (
                <button
                  key={`${activeLineIndex}-${chunk.displayText}`}
                  type="button"
                  onClick={() => handleToggleManualChunk(chunk.displayText)}
                  className={`chip-button ${getChunkTone(chunk.status)}`}
                >
                  {chunk.displayText}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[1.8rem] bg-card-soft p-5 text-left">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Live transcript
              </p>
              <span className="pill bg-white text-muted-foreground">
                {speechSupported
                  ? listening
                    ? "Listening"
                    : "Ready"
                  : "Manual fallback"}
              </span>
            </div>
            <p className="mt-3 text-base font-bold text-foreground">
              {speechSupported
                ? currentState.transcript || "Your spoken Korean will appear here."
                : "Speech recognition is unavailable here. Speak aloud, then tap each chunk to self-mark it."}
            </p>
          </div>

          {speechSupported && !currentLineAttempted && !listening ? (
            <div className="rounded-[1.6rem] bg-accent-cool px-4 py-3 text-left text-sm font-bold text-accent-strong">
              Tap the green microphone button below, allow browser mic access if asked, then read the line aloud.
            </div>
          ) : null}

          {currentLineAttempted && (
            <div className={currentLinePassed ? "feedback-correct" : "feedback-incorrect"}>
              {currentLinePassed
                ? "Nice! This line is landing cleanly."
                : "Good try. The red chunks still need another pass."}
            </div>
          )}

          {errorMessage ? <div className="feedback-incorrect">{errorMessage}</div> : null}

          <div className="grid gap-3">
            <button type="button" onClick={handlePlayAudio} className="secondary-button w-full">
              {isPlaying ? "Playing again..." : "Play line again"}
            </button>

            {speechSupported ? (
              listening ? (
                <button type="button" onClick={() => recognitionRef.current?.stop()} className="primary-button w-full">
                  Stop microphone
                </button>
              ) : !currentLineAttempted ? (
                <button type="button" onClick={handleStartListening} className="primary-button w-full">
                  Start microphone to speak
                </button>
              ) : (
                <button type="button" onClick={handleContinue} className="primary-button w-full">
                  {isLastQueueItem ? "Review result" : "Continue"}
                </button>
              )
            ) : !currentLineAttempted ? (
              <button type="button" onClick={handleContinue} className="primary-button w-full">
                Check this line
              </button>
            ) : (
              <button type="button" onClick={handleContinue} className="primary-button w-full">
                {isLastQueueItem ? "Review result" : "Continue"}
              </button>
            )}

            {currentLineHasChanges && (
              <button type="button" onClick={handleRetryLine} className="secondary-button w-full">
                Retry line
              </button>
            )}

            {!listening && (
              <button type="button" onClick={handleSkipForNow} className="secondary-button w-full">
                No mic right now, skip this step
              </button>
            )}
          </div>

          {!listening && (
            <p className="text-center text-sm font-bold text-muted-foreground">
              Skip keeps your lesson moving, but this step will not award XP.
            </p>
          )}
        </article>
      </div>
    </section>
  );
}
