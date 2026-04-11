"use client";

import { useAppLocale } from "@/hooks/useAppLocale";
import { getLocalizedText } from "@/lib/localized";
import {
  containsKoreanText,
  isLikelyKoreanVocabText,
  playAudioUrl,
  playFeedbackTone,
  speakKoreanText,
} from "@/lib/speech";
import Image from "next/image";
import type { LocalizedChoiceSessionItem, SessionItemResult } from "@/types/session";
import { useCallback, useEffect, useRef, useState } from "react";

type SessionVocabImageChoiceQuestionProps = {
  item: LocalizedChoiceSessionItem;
  onResolve: (result: SessionItemResult) => void;
};

function getPromptReplayText(item: LocalizedChoiceSessionItem) {
  if (item.audioText && isLikelyKoreanVocabText(item.audioText)) {
    return item.audioText;
  }

  if (item.koreanText && isLikelyKoreanVocabText(item.koreanText)) {
    return item.koreanText;
  }

  return null;
}

export default function SessionVocabImageChoiceQuestion({
  item,
  onResolve,
}: SessionVocabImageChoiceQuestionProps) {
  const { locale } = useAppLocale();
  const didAutoplayRef = useRef(false);
  const [selectedOption, setSelectedOption] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const prompt = getLocalizedText(item.prompt, locale);
  const questionText = item.questionText ? getLocalizedText(item.questionText, locale) : "";
  const supportText = item.supportText ? getLocalizedText(item.supportText, locale) : "";
  const replayText = getPromptReplayText(item);
  const hasAudio = Boolean(item.audioUrl || replayText);
  const isListenCard = item.type === "listen_select";
  const ui = (en: string, vi: string) => getLocalizedText({ en, vi }, locale);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    didAutoplayRef.current = false;
  }, [item.id]);

  const handlePlayAudio = useCallback(async () => {
    if (typeof window === "undefined") {
      return;
    }

    if (item.audioUrl) {
      await playAudioUrl(item.audioUrl, {
        onStart: () => setIsPlaying(true),
        onEnd: () => setIsPlaying(false),
        onError: () => setIsPlaying(false),
      });
      return;
    }

    if (replayText) {
      speakKoreanText(replayText, {
        rate: 0.9,
        onStart: () => setIsPlaying(true),
        onEnd: () => setIsPlaying(false),
        onError: () => setIsPlaying(false),
      });
    }
  }, [item.audioUrl, replayText]);

  useEffect(() => {
    if (!hasAudio || didAutoplayRef.current) {
      return;
    }

    didAutoplayRef.current = true;
    void handlePlayAudio();
  }, [handlePlayAudio, hasAudio, item.id]);

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

    const selectedChoice = item.choices.find((choice) => choice.id === selectedOption);
    const wasCorrect = selectedOption === item.answer;
    const userAnswer =
      selectedChoice?.koreanLabel ??
      getLocalizedText(
        selectedChoice?.text ?? {
          en: selectedOption,
          vi: selectedOption,
        },
        locale,
      );

    playFeedbackTone(wasCorrect ? "correct" : "wrong");

    onResolve({
      status: wasCorrect ? "correct" : "incorrect",
      awardedXp: 0,
      shouldRetryLater: !wasCorrect,
      weakItemLabel: item.weakItemLabel,
      userAnswer,
      answerOptionId: selectedOption,
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
                ? ui("Retry image card", "The hinh anh lam lai")
                : isListenCard
                  ? ui("Listen and choose", "Nghe va chon")
                  : ui("Image vocab", "Tu vung hinh anh")}
            </p>
            <h3 className="font-display text-3xl text-foreground sm:text-4xl">
              {isListenCard
                ? ui("Listen and pick the matching Korean card.", "Nghe va chon the tieng Han phu hop.")
                : ui("Tap the Korean card that matches this meaning.", "Chon the tieng Han khop voi y nghia nay.")}
            </h3>
          </div>
          {hasAudio ? (
            <button type="button" onClick={() => void handlePlayAudio()} className="secondary-button">
              {isPlaying ? ui("Playing...", "Dang phat...") : ui("Replay audio", "Phat lai audio")}
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

            {questionText ? (
              <div className="mt-4 rounded-[1.8rem] bg-white/80 px-5 py-5 shadow-[0_10px_24px_rgba(47,92,51,0.06)]">
                <p className="text-lg font-extrabold leading-tight text-foreground sm:text-2xl">
                  {questionText}
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-[1.8rem] border border-accent/10 bg-white/70 px-5 py-5">
                <p className="text-base font-bold text-foreground">
                  {ui(
                    "Listen to the Korean word, then choose the matching card below.",
                    "Nghe tu tieng Han roi chon the dung o ben duoi.",
                  )}
                </p>
              </div>
            )}

            {supportText ? (
              <p className="mt-4 text-sm font-bold text-muted-foreground">{supportText}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {item.choices.map((option) => {
              const isSelected = selectedOption === option.id;
              const meaningLabel = getLocalizedText(option.text, locale);
              const koreanLabel = option.koreanLabel ?? meaningLabel;

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleOptionSelect(option.id, koreanLabel)}
                  aria-pressed={isSelected}
                  aria-label={`${koreanLabel} - ${meaningLabel}${isSelected ? `, ${ui("selected", "da chon")}` : ""}`}
                  className={`group relative overflow-hidden rounded-[1.9rem] border-2 bg-white text-left shadow-[0_14px_28px_rgba(47,92,51,0.08)] transition duration-200 hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20 ${
                    isSelected
                      ? "border-accent bg-card-strong shadow-[0_18px_34px_rgba(87,185,92,0.22)]"
                      : "border-accent/10 hover:border-accent/30"
                  }`}
                >
                  <div className="flex h-full flex-col">
                    <div className="relative h-40 overflow-hidden bg-[linear-gradient(180deg,#fff7da_0%,#f3f9f0_100%)] sm:h-44">
                      {option.imageUrl ? (
                        <Image
                          src={option.imageUrl}
                          alt={meaningLabel}
                          fill
                          sizes="(max-width: 768px) 45vw, 18rem"
                          className="object-cover p-4"
                        />
                      ) : null}
                    </div>
                    <div className="space-y-2 px-4 py-4">
                      <p className="text-2xl font-black text-foreground">{koreanLabel}</p>
                      <p className="text-sm font-bold text-muted-foreground">{meaningLabel}</p>
                    </div>
                  </div>
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
