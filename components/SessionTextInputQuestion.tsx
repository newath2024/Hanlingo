"use client";

import { useAppLocale } from "@/hooks/useAppLocale";
import { getLocalizedText } from "@/lib/localized";
import { speakIfKoreanText, speakKoreanText } from "@/lib/speech";
import type { SessionItemResult, TextInputSessionItem } from "@/types/session";
import { useEffect, useRef, useState } from "react";

type SessionTextInputQuestionProps = {
  item: TextInputSessionItem;
  onResolve: (result: SessionItemResult) => void;
};

function normalizeAnswer(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.,!?'"`~:;()[\]{}]/g, "")
    .replace(/\s+/g, " ");
}

export default function SessionTextInputQuestion({
  item,
  onResolve,
}: SessionTextInputQuestionProps) {
  const { locale } = useAppLocale();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [selectedChoice, setSelectedChoice] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const prompt = getLocalizedText(item.prompt, locale);
  const explanation = getLocalizedText(item.explanation, locale);
  const clue = item.clue ? getLocalizedText(item.clue, locale) : "";
  const placeholder = item.placeholder ? getLocalizedText(item.placeholder, locale) : "";
  const meaning = item.meaning ? getLocalizedText(item.meaning, locale) : "";
  const hasAudio = Boolean(item.audioUrl || item.audioText);
  const ui = (en: string, vi: string) => getLocalizedText({ en, vi }, locale);
  const isAdaptiveTyping = item.interactionMode === "full_input";
  const hasChoiceOptions =
    item.type === "fill_blank" && Array.isArray(item.choices) && item.choices.length >= 2;
  const expectsLocalizedMeaning =
    item.type === "translate" && item.direction === "ko_to_meaning" && Boolean(item.meaning);
  const expectedAnswers = expectsLocalizedMeaning
    ? [meaning]
    : item.acceptedAnswers ?? [];

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  async function handlePlayAudio() {
    if (typeof window === "undefined") {
      return;
    }

    if (item.audioUrl) {
      if (
        !audioRef.current ||
        audioRef.current.src !== new URL(item.audioUrl, window.location.origin).toString()
      ) {
        audioRef.current?.pause();
        audioRef.current = new Audio(item.audioUrl);
        audioRef.current.onplay = () => setIsPlaying(true);
        audioRef.current.onended = () => setIsPlaying(false);
        audioRef.current.onpause = () => setIsPlaying(false);
        audioRef.current.onerror = () => setIsPlaying(false);
      }

      audioRef.current.currentTime = 0;

      try {
        await audioRef.current.play();
      } catch {
        setIsPlaying(false);
      }

      return;
    }

    if (
      item.audioText &&
      speakKoreanText(item.audioText, {
        rate: 0.9,
        onStart: () => setIsPlaying(true),
        onEnd: () => setIsPlaying(false),
        onError: () => setIsPlaying(false),
      })
    ) {
      return;
    }
  }

  function handleChoiceSelect(choice: string) {
    setSelectedChoice(choice);

    speakIfKoreanText(choice, {
      rate: 0.92,
      onStart: () => setIsPlaying(true),
      onEnd: () => setIsPlaying(false),
      onError: () => setIsPlaying(false),
    });
  }

  function handleCheckAnswer() {
    const normalizedInput = normalizeAnswer(hasChoiceOptions ? selectedChoice : inputValue);

    if (!normalizedInput) {
      return;
    }

    const wasCorrect = expectedAnswers.some(
      (answer) => normalizeAnswer(answer) === normalizedInput,
    );

    onResolve({
      status: wasCorrect ? "correct" : "incorrect",
      awardedXp: 0,
      shouldRetryLater: !wasCorrect,
      weakItemLabel: item.weakItemLabel,
      correctAnswer: item.correctAnswer,
      explanation: item.explanation,
    });
  }

  return (
    <section className="panel">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {item.isRetry
                ? ui("Retry question", "Cau hoi lam lai")
                : isAdaptiveTyping
                  ? ui("Type Sentence", "Nhap cau")
                : item.type === "fill_blank"
                    ? ui("Fill Blank", "Dien khuyet")
                    : ui("Translate", "Dich")}
            </p>
            <h3 className="font-display text-3xl text-foreground sm:text-4xl">
              {isAdaptiveTyping
                ? ui("Type the full Korean sentence.", "Nhap toan bo cau tieng Han.")
                : hasChoiceOptions
                  ? ui("Choose the missing answer.", "Chon dap an con thieu.")
                : ui("Type the missing answer.", "Nhap dap an con thieu.")}
            </h3>
          </div>
          {hasAudio ? (
            <button type="button" onClick={handlePlayAudio} className="secondary-button">
              {isPlaying ? ui("Playing...", "Dang phat...") : ui("Play audio", "Phat audio")}
            </button>
          ) : null}
        </div>

        <article className="lesson-card space-y-5">
          <div className="rounded-[2rem] bg-card-soft p-6 shadow-[0_14px_30px_rgba(47,92,51,0.08)]">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {prompt}
            </p>

            {item.type === "translate" && item.direction === "meaning_to_ko" && meaning ? (
              <div className="mt-4 space-y-2">
                <p className="text-2xl font-extrabold leading-tight text-foreground">
                  {meaning}
                </p>
              </div>
            ) : null}

            {hasChoiceOptions && clue ? (
              <div className="mt-4 rounded-[1.4rem] bg-white/80 px-4 py-4 text-left">
                <p className="text-lg font-extrabold leading-tight text-foreground">{clue}</p>
              </div>
            ) : null}

            {item.koreanText ? <p className="mt-4 korean-display">{item.koreanText}</p> : null}

            {clue && !hasChoiceOptions ? (
              <div className="mt-4 rounded-[1.4rem] bg-white/80 px-4 py-3 text-left">
                <p className="text-sm font-bold text-muted-foreground">{clue}</p>
              </div>
            ) : null}

            <p className="mt-4 text-sm font-bold text-muted-foreground">{explanation}</p>
          </div>

          {hasChoiceOptions ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {item.choices?.map((choice) => {
                const isSelected = selectedChoice === choice;

                return (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => handleChoiceSelect(choice)}
                    className={`choice-button ${
                      isSelected ? "border-accent bg-card-strong" : ""
                    }`}
                  >
                    {choice}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-5">
              <input
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                placeholder={placeholder || ui("Type your answer", "Nhap cau tra loi")}
                className="w-full rounded-[1.8rem] border border-accent/15 bg-white px-5 py-4 text-xl font-bold text-foreground outline-none transition focus:border-accent"
              />
            </div>
          )}

          <button
            type="button"
            onClick={handleCheckAnswer}
            disabled={hasChoiceOptions ? !selectedChoice : !inputValue.trim()}
            className="primary-button w-full"
          >
            {ui("Check answer", "Kiem tra dap an")}
          </button>
        </article>
      </div>
    </section>
  );
}
