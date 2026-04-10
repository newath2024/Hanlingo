"use client";

import { useAppLocale } from "@/hooks/useAppLocale";
import { getLocalizedText } from "@/lib/localized";
import { containsKoreanText, speakKoreanText } from "@/lib/speech";
import Image from "next/image";
import type {
  GrammarChoiceSessionItem,
  LocalizedChoiceSessionItem,
  SessionItemResult,
} from "@/types/session";
import { useEffect, useRef, useState } from "react";

type SessionChoiceQuestionProps = {
  item: LocalizedChoiceSessionItem | GrammarChoiceSessionItem;
  onResolve: (result: SessionItemResult) => void;
};

function getInstruction(
  locale: "en" | "vi",
  item: SessionChoiceQuestionProps["item"],
) {
  if (item.type === "listen_select") {
    return getLocalizedText(
      {
        en: "Listen, then choose the best answer.",
        vi: "Nghe roi chon dap an phu hop nhat.",
      },
      locale,
    );
  }

  if (item.interactionMode === "hybrid") {
    return getLocalizedText(
      {
        en: "Choose the Korean chunk that completes the sentence.",
        vi: "Chon cum tieng Han de hoan thanh cau.",
      },
      locale,
    );
  }

  if (item.type === "grammar_select" && item.supportText) {
    return getLocalizedText(
      {
        en: "Choose the Korean answer that matches the meaning.",
        vi: "Chon dap an tieng Han khop voi nghia.",
      },
      locale,
    );
  }

  return getLocalizedText(
    {
      en: "Choose the answer that matches the prompt.",
      vi: "Chon dap an khop voi de bai.",
    },
    locale,
  );
}

function getSessionItemLabel(
  locale: "en" | "vi",
  item: SessionChoiceQuestionProps["item"],
) {
  if (item.type === "listen_select") {
    return getLocalizedText({ en: "Listen & Select", vi: "Nghe va chon" }, locale);
  }

  if (item.interactionMode === "hybrid") {
    return getLocalizedText({ en: "Complete Sentence", vi: "Hoan thanh cau" }, locale);
  }

  if (item.type === "grammar_select") {
    return getLocalizedText({ en: "Grammar", vi: "Ngu phap" }, locale);
  }

  return getLocalizedText({ en: "Word Match", vi: "Noi tu" }, locale);
}

export default function SessionChoiceQuestion({
  item,
  onResolve,
}: SessionChoiceQuestionProps) {
  const { locale } = useAppLocale();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [selectedOption, setSelectedOption] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const prompt = getLocalizedText(item.prompt, locale);
  const supportText = item.supportText ? getLocalizedText(item.supportText, locale) : "";
  const hasAudio =
    ("audioUrl" in item && Boolean(item.audioUrl)) ||
    ("audioText" in item && Boolean(item.audioText));
  const ui = (en: string, vi: string) => getLocalizedText({ en, vi }, locale);
  const supportLabel =
    supportText && item.type === "grammar_select"
      ? `${ui("Meaning", "Nghia")}: ${supportText}`
      : supportText;

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  async function handlePlayAudio() {
    if (typeof window === "undefined") {
      return;
    }

    if ("audioUrl" in item && item.audioUrl) {
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
      "audioText" in item &&
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

  function handleOptionSelect(optionId: string, spokenText?: string) {
    setSelectedOption(optionId);

    if (!spokenText || !containsKoreanText(spokenText)) {
      return;
    }

    setIsPlaying(false);
    speakKoreanText(spokenText, {
      rate: 0.92,
      onStart: () => setIsPlaying(true),
      onEnd: () => setIsPlaying(false),
      onError: () => setIsPlaying(false),
    });
  }

  function handleCheckAnswer() {
    if (!selectedOption) {
      return;
    }

    const wasCorrect = selectedOption === item.answer;

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
                : getSessionItemLabel(locale, item)}
            </p>
            <h3 className="font-display text-3xl text-foreground sm:text-4xl">
              {getInstruction(locale, item)}
            </h3>
          </div>
          {hasAudio ? (
            <button type="button" onClick={handlePlayAudio} className="secondary-button">
              {isPlaying ? ui("Playing...", "Dang phat...") : ui("Play audio", "Phat audio")}
            </button>
          ) : (
            <span className="pill bg-card-strong text-foreground">
              {item.isRetry ? ui("Retry", "Lam lai") : ui("Fresh question", "Cau hoi moi")}
            </span>
          )}
        </div>

        <article className="lesson-card space-y-5">
          <div className="rounded-[2rem] bg-card-soft p-6 shadow-[0_14px_30px_rgba(47,92,51,0.08)]">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {prompt}
            </p>

            {item.koreanText ? <p className="mt-4 korean-display">{item.koreanText}</p> : null}

            {supportLabel ? (
              <p className="mt-4 text-base font-bold text-muted-foreground">{supportLabel}</p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {"choices" in item && item.type !== "grammar_select"
              ? item.choices.map((option) => {
                  const isSelected = selectedOption === option.id;
                  const label = getLocalizedText(option.text, locale);

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleOptionSelect(option.id, label)}
                      className={`choice-button text-left ${
                        isSelected ? "border-accent bg-card-strong" : ""
                      }`}
                    >
                      {option.imageUrl ? (
                        <div className="overflow-hidden rounded-[1.2rem] border border-accent/10 bg-white">
                          <Image
                            src={option.imageUrl}
                            alt={label}
                            width={320}
                            height={160}
                            className="h-32 w-full object-cover"
                          />
                        </div>
                      ) : null}
                      <p className={`font-extrabold text-foreground ${option.imageUrl ? "mt-3" : ""}`}>
                        {label}
                      </p>
                    </button>
                  );
                })
              : item.choices.map((option) => {
                  const isSelected = selectedOption === option;

                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleOptionSelect(option, option)}
                      className={`choice-button ${
                        isSelected ? "border-accent bg-card-strong" : ""
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
          </div>

          <button
            type="button"
            onClick={handleCheckAnswer}
            disabled={!selectedOption}
            className="primary-button w-full"
          >
            {ui("Check answer", "Kiem tra dap an")}
          </button>
        </article>
      </div>
    </section>
  );
}
