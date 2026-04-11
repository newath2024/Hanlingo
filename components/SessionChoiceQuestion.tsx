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
import type {
  GrammarChoiceSessionItem,
  LocalizedChoiceSessionItem,
  SelectSessionItem,
  SessionItemResult,
} from "@/types/session";
import { useCallback, useEffect, useRef, useState } from "react";

type SessionChoiceQuestionProps = {
  item: LocalizedChoiceSessionItem | GrammarChoiceSessionItem | SelectSessionItem;
  onResolve: (result: SessionItemResult) => void;
};

function isLocalizedChoiceItem(
  item: SessionChoiceQuestionProps["item"],
): item is LocalizedChoiceSessionItem {
  return item.type === "word_match" || item.type === "listen_select";
}

function isSelectItem(item: SessionChoiceQuestionProps["item"]): item is SelectSessionItem {
  return item.type === "translation_select" || item.type === "dialogue_response";
}

function getStringChoiceItem(
  item: SessionChoiceQuestionProps["item"],
): GrammarChoiceSessionItem | SelectSessionItem | null {
  return isLocalizedChoiceItem(item) ? null : item;
}

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

  if (item.type === "translation_select") {
    return getLocalizedText(
      {
        en: "Read the Korean line, then choose the best meaning.",
        vi: "Doc cau tieng Han, roi chon nghia phu hop nhat.",
      },
      locale,
    );
  }

  if (item.type === "dialogue_response") {
    return getLocalizedText(
      {
        en: "Read the dialogue and choose the best response.",
        vi: "Doc hoi thoai va chon cau dap phu hop nhat.",
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

  if (item.type === "translation_select") {
    return getLocalizedText({ en: "Select Translation", vi: "Chon nghia" }, locale);
  }

  if (item.type === "dialogue_response") {
    return getLocalizedText({ en: "Dialogue Response", vi: "Dap hoi thoai" }, locale);
  }

  return getLocalizedText({ en: "Word Match", vi: "Noi tu" }, locale);
}

function getPromptReplayText(item: SessionChoiceQuestionProps["item"]) {
  if ("audioText" in item && item.audioText && isLikelyKoreanVocabText(item.audioText)) {
    return item.audioText;
  }

  if (item.koreanText && isLikelyKoreanVocabText(item.koreanText)) {
    return item.koreanText;
  }

  return null;
}

function isKoreanVocabQuestion(item: SessionChoiceQuestionProps["item"]) {
  if (item.type !== "word_match" && item.type !== "listen_select") {
    return false;
  }

  return Boolean(getPromptReplayText(item));
}

export default function SessionChoiceQuestion({
  item,
  onResolve,
}: SessionChoiceQuestionProps) {
  const { locale } = useAppLocale();
  const didAutoplayRef = useRef(false);
  const [selectedOption, setSelectedOption] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const prompt = getLocalizedText(item.prompt, locale);
  const supportText = item.supportText ? getLocalizedText(item.supportText, locale) : "";
  const replayText = getPromptReplayText(item);
  const isVocabQuestion = isKoreanVocabQuestion(item);
  const hasAudio =
    ("audioUrl" in item && Boolean(item.audioUrl)) ||
    ("audioText" in item && Boolean(item.audioText)) ||
    Boolean(replayText);
  const ui = (en: string, vi: string) => getLocalizedText({ en, vi }, locale);
  const supportLabel =
    supportText && item.type === "grammar_select"
      ? `${ui("Meaning", "Nghia")}: ${supportText}`
      : supportText;
  const choiceItem = isLocalizedChoiceItem(item) ? item : null;
  const selectItem = isSelectItem(item) ? item : null;
  const stringChoiceItem = getStringChoiceItem(item);
  const stringChoices = stringChoiceItem?.choices ?? [];

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

    if ("audioUrl" in item && item.audioUrl) {
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
  }, [item, replayText]);

  useEffect(() => {
    if (!isVocabQuestion || didAutoplayRef.current) {
      return;
    }

    didAutoplayRef.current = true;
    void handlePlayAudio();
  }, [handlePlayAudio, isVocabQuestion, item.id]);

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
    const userAnswer = choiceItem
      ? getLocalizedText(
          choiceItem.choices.find((choice) => choice.id === selectedOption)?.text ?? {
            en: selectedOption,
            vi: selectedOption,
          },
          locale,
        )
      : selectedOption;

    if (isVocabQuestion) {
      playFeedbackTone(wasCorrect ? "correct" : "wrong");
    }

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
                ? ui("Retry question", "Cau hoi lam lai")
                : getSessionItemLabel(locale, item)}
            </p>
            <h3 className="font-display text-3xl text-foreground sm:text-4xl">
              {getInstruction(locale, item)}
            </h3>
          </div>
          {hasAudio && !isVocabQuestion ? (
            <button type="button" onClick={() => void handlePlayAudio()} className="secondary-button">
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

            {"koreanText" in item && item.koreanText ? (
              <div className="mt-4 flex items-start justify-between gap-3">
                <p className="korean-display">{item.koreanText}</p>
                {isVocabQuestion ? (
                  <button
                    type="button"
                    onClick={() => void handlePlayAudio()}
                    aria-label={ui("Replay Korean audio", "Phat lai audio tieng Han")}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-accent/15 bg-white text-xl text-accent-strong shadow-[0_10px_24px_rgba(47,92,51,0.08)] transition hover:border-accent hover:bg-card-strong"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                      <path d="M3 10v4h4l5 4V6L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.5-4.03v8.06A4.5 4.5 0 0 0 16.5 12zm0-9.5v2.06A9 9 0 0 1 16.5 19.44v2.06a11 11 0 0 0 0-19z" />
                    </svg>
                  </button>
                ) : null}
              </div>
            ) : null}

            {selectItem?.type === "translation_select" ? (
              <p className="mt-4 korean-display">{selectItem.question}</p>
            ) : null}

            {selectItem?.type === "dialogue_response" && selectItem.context?.length ? (
              <div className="mt-4 space-y-3">
                {selectItem.context.map((line, index) => (
                  <div
                    key={`${line.speaker}-${index}`}
                    className="rounded-[1.4rem] bg-white/80 px-4 py-3 text-left"
                  >
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      {line.speaker}
                    </p>
                    <p className="mt-1 text-lg font-extrabold leading-tight text-foreground">
                      {line.text}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            {supportLabel ? (
              <p className="mt-4 text-base font-bold text-muted-foreground">{supportLabel}</p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {choiceItem
              ? choiceItem.choices.map((option) => {
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
              : stringChoices.map((option) => {
                  const isSelected = selectedOption === option;

                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleOptionSelect(option, option)}
                      className={`choice-button ${isSelected ? "border-accent bg-card-strong" : ""}`}
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
