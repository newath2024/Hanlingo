"use client";

import type { BuildSentenceItem } from "@/types/lesson";
import { useState } from "react";

type BuildSentenceProps = {
  items: BuildSentenceItem[];
  onComplete: () => void;
};

function matchesAnswer(selectedWords: string[], answer: string[]) {
  return (
    selectedWords.length === answer.length &&
    selectedWords.every((word, index) => word === answer[index])
  );
}

export default function BuildSentence({ items, onComplete }: BuildSentenceProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);

  const currentItem = items[currentIndex];
  const isLastItem = currentIndex === items.length - 1;

  function handleToggleWord(word: string) {
    if (submitted) {
      return;
    }

    setSelectedWords((previous) =>
      previous.includes(word)
        ? previous.filter((selectedWord) => selectedWord !== word)
        : [...previous, word],
    );
  }

  function handleClear() {
    if (submitted || selectedWords.length === 0) {
      return;
    }

    setSelectedWords([]);
  }

  function handleCheck() {
    if (submitted || selectedWords.length === 0) {
      return;
    }

    setWasCorrect(matchesAnswer(selectedWords, currentItem.answer));
    setSubmitted(true);
  }

  function handleContinue() {
    if (isLastItem) {
      onComplete();
      return;
    }

    setCurrentIndex((previous) => previous + 1);
    setSelectedWords([]);
    setSubmitted(false);
    setWasCorrect(null);
  }

  const canCheck = selectedWords.length > 0;
  const feedbackTone =
    submitted && wasCorrect !== null
      ? wasCorrect
        ? "border-accent bg-success-soft"
        : "border-danger bg-danger-soft"
      : "border-accent/10 bg-card-soft";

  return (
    <section className="panel">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Build The Sentence
            </p>
            <h3 className="font-display text-3xl text-foreground sm:text-4xl">
              Tap the Korean chunks to build the sentence.
            </h3>
          </div>
          <span className="pill bg-card-strong text-foreground">
            Prompt {currentIndex + 1} of {items.length}
          </span>
        </div>

        <article className="lesson-card space-y-5">
          <div className="rounded-[1.9rem] bg-card-soft p-5 shadow-[0_14px_30px_rgba(47,92,51,0.08)]">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Meaning
            </p>
            <p className="mt-2 text-3xl font-extrabold leading-tight text-foreground">
              {currentItem.meaning}
            </p>
          </div>

          <div className={`sentence-well transition ${feedbackTone}`}>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Your sentence
            </p>

            {selectedWords.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-3">
                {selectedWords.map((word) => (
                  <button
                    key={`selected-${word}`}
                    type="button"
                    onClick={() => handleToggleWord(word)}
                    disabled={submitted}
                    className="chip-button chip-button-active"
                  >
                    {word}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-base font-bold text-muted-foreground">
                Tap words below to build the answer.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Word bank
            </p>
            <div className="flex flex-wrap gap-3">
              {currentItem.wordBank.map((word) => {
                const isSelected = selectedWords.includes(word);

                return (
                  <button
                    key={`bank-${word}`}
                    type="button"
                    onClick={() => handleToggleWord(word)}
                    disabled={submitted}
                    className={`chip-button ${isSelected ? "chip-button-active" : ""}`}
                  >
                    {word}
                  </button>
                );
              })}
            </div>
          </div>

          {submitted && wasCorrect !== null ? (
            wasCorrect ? (
              <div className="feedback-correct">
                Nice! You built the sentence correctly.
              </div>
            ) : (
              <div className="feedback-incorrect space-y-2">
                <p>Not quite. Correct answer:</p>
                <p className="font-semibold text-danger/90">
                  {currentItem.answer.join(" ")}
                </p>
              </div>
            )
          ) : null}

          {!submitted ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
              <button
                type="button"
                onClick={handleClear}
                disabled={selectedWords.length === 0}
                className="secondary-button w-full"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleCheck}
                disabled={!canCheck}
                className="primary-button w-full"
              >
                Check answer
              </button>
            </div>
          ) : (
            <button type="button" onClick={handleContinue} className="primary-button w-full">
              {isLastItem ? "Finish build step" : "Next sentence"}
            </button>
          )}
        </article>
      </div>
    </section>
  );
}
