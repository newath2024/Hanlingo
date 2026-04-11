"use client";

import { useAppLocale } from "@/hooks/useAppLocale";
import { getLocalizedText } from "@/lib/localized";
import { speakIfKoreanText } from "@/lib/speech";
import type { ArrangeSessionItem, SessionItemResult } from "@/types/session";
import { useState } from "react";

type SessionBuildSentenceQuestionProps = {
  item: ArrangeSessionItem;
  onResolve: (result: SessionItemResult) => void;
};

function matchesAnswer(selectedWords: string[], answer: string[]) {
  return (
    selectedWords.length === answer.length &&
    selectedWords.every((word, index) => word === answer[index])
  );
}

export default function SessionBuildSentenceQuestion({
  item,
  onResolve,
}: SessionBuildSentenceQuestionProps) {
  const { locale } = useAppLocale();
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const prompt = getLocalizedText(item.prompt, locale);
  const explanation = getLocalizedText(item.explanation, locale);
  const ui = (en: string, vi: string) => getLocalizedText({ en, vi }, locale);
  const isAdaptiveWordBank = item.interactionMode === "word_bank";

  function handleToggleWord(word: string) {
    speakIfKoreanText(word, { rate: 0.92 });

    setSelectedWords((previous) =>
      previous.includes(word)
        ? previous.filter((selectedWord) => selectedWord !== word)
        : [...previous, word],
    );
  }

  function handleClear() {
    if (selectedWords.length === 0) {
      return;
    }

    setSelectedWords([]);
  }

  function handleCheckAnswer() {
    if (selectedWords.length === 0) {
      return;
    }

    const wasCorrect = matchesAnswer(selectedWords, item.answer);

    onResolve({
      status: wasCorrect ? "correct" : "incorrect",
      awardedXp: 0,
      shouldRetryLater: !wasCorrect,
      weakItemLabel: item.weakItemLabel,
      userAnswer: selectedWords.join(" "),
      answerTokens: selectedWords,
      correctAnswer: item.correctAnswer,
      explanation: item.explanation,
    });
  }

  return (
    <section className="panel">
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {item.isRetry
              ? ui("Retry question", "Cau hoi lam lai")
              : isAdaptiveWordBank
                ? ui("Sentence Builder", "Ghep cau")
                : item.type === "dialogue_reconstruct"
                  ? ui("Dialogue Reconstruct", "Ghep lai hoi thoai")
                  : item.type === "sentence_build"
                    ? ui("Sentence Builder", "Ghep cau")
                    : item.type === "reorder_sentence"
                      ? ui("Reorder Sentence", "Sap xep lai cau")
                  : ui("Arrange Sentence", "Sap xep cau")}
          </p>
          <h3 className="font-display text-3xl text-foreground sm:text-4xl">
            {isAdaptiveWordBank
              ? ui(
                  "Tap the Korean chunks to build the full sentence.",
                  "Cham vao cac cum tieng Han de ghep thanh cau hoan chinh.",
                )
              : ui(
                  "Tap the Korean chunks to build the target sentence.",
                  "Cham vao cac cum tieng Han de ghep thanh cau dich.",
                )}
          </h3>
        </div>

        <article className="lesson-card space-y-5">
          <div className="rounded-[1.9rem] bg-card-soft p-5 shadow-[0_14px_30px_rgba(47,92,51,0.08)]">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {prompt}
            </p>

            {item.type === "dialogue_reconstruct" ? (
              <div className="mt-4 space-y-2">
                <span className="pill bg-accent-cool text-accent-strong">{item.speaker}</span>
                <p className="text-2xl font-extrabold leading-tight text-foreground">
                  {getLocalizedText(item.translation, locale)}
                </p>
              </div>
            ) : item.type === "sentence_build" && item.targetMeaning ? (
              <div className="mt-4 space-y-2">
                <p className="text-2xl font-extrabold leading-tight text-foreground">
                  {item.targetMeaning}
                </p>
              </div>
            ) : item.meaning ? (
              <div className="mt-4 space-y-2">
                <p className="text-2xl font-extrabold leading-tight text-foreground">
                  {getLocalizedText(item.meaning, locale)}
                </p>
              </div>
            ) : null}

            <p className="mt-4 text-sm font-bold text-muted-foreground">{explanation}</p>
          </div>

          <div className="sentence-well">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {ui("Your sentence", "Cau cua ban")}
            </p>

            {selectedWords.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-3">
                {selectedWords.map((word) => (
                  <button
                    key={`selected-${word}`}
                    type="button"
                    onClick={() => handleToggleWord(word)}
                    className="chip-button chip-button-active"
                  >
                    {word}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-base font-bold text-muted-foreground">
                {ui(
                  "Tap words below to build the answer.",
                  "Cham vao cac tu ben duoi de ghep cau tra loi.",
                )}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {ui("Word bank", "Ngan tu")}
            </p>
            <div className="flex flex-wrap gap-3">
              {item.wordBank.map((word) => {
                const isSelected = selectedWords.includes(word);

                return (
                  <button
                    key={`bank-${word}`}
                    type="button"
                    onClick={() => handleToggleWord(word)}
                    className={`chip-button ${isSelected ? "chip-button-active" : ""}`}
                  >
                    {word}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
            <button
              type="button"
              onClick={handleClear}
              disabled={selectedWords.length === 0}
              className="secondary-button w-full"
            >
              {ui("Clear", "Xoa")}
            </button>
            <button
              type="button"
              onClick={handleCheckAnswer}
              disabled={selectedWords.length === 0}
              className="primary-button w-full"
            >
              {ui("Check answer", "Kiem tra dap an")}
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}
