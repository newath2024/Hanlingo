"use client";

import { useAppLocale } from "@/hooks/useAppLocale";
import { getPromptGlossData } from "@/lib/gloss";
import { getLocalizedText } from "@/lib/localized";
import { containerVariants, itemVariants } from "@/lib/practice-motion";
import {
  containsKoreanText,
  isLikelyKoreanVocabText,
  playAudioUrl,
  speakKoreanText,
} from "@/lib/speech";
import { motion } from "framer-motion";
import Image from "next/image";
import type {
  GrammarChoiceSessionItem,
  LocalizedChoiceSessionItem,
  SelectSessionItem,
  SessionItemResult,
} from "@/types/session";
import { useCallback, useEffect, useRef, useState } from "react";
import CheckButton from "./CheckButton";
import KoreanTextWithGloss from "./KoreanTextWithGloss";

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
        vi: "Nghe rồi chọn đáp án phù hợp nhất.",
      },
      locale,
    );
  }

  if (item.type === "translation_select") {
    return getLocalizedText(
      {
        en: "Read the Korean line, then choose the best meaning.",
        vi: "Đọc câu tiếng Hàn, rồi chọn nghĩa phù hợp nhất.",
      },
      locale,
    );
  }

  if (item.type === "dialogue_response") {
    return getLocalizedText(
      {
        en: "Read the dialogue and choose the best response.",
        vi: "Đọc hội thoại và chọn câu đáp phù hợp nhất.",
      },
      locale,
    );
  }

  if (item.interactionMode === "hybrid") {
    return getLocalizedText(
      {
        en: "Choose the Korean chunk that completes the sentence.",
        vi: "Chọn cụm tiếng Hàn để hoàn thành câu.",
      },
      locale,
    );
  }

  if (item.type === "grammar_select" && item.supportText) {
    return getLocalizedText(
      {
        en: "Choose the Korean answer that matches the meaning.",
        vi: "Chọn đáp án tiếng Hàn khớp với nghĩa.",
      },
      locale,
    );
  }

  return getLocalizedText(
    {
      en: "Choose the answer that matches the prompt.",
      vi: "Chọn đáp án khớp với đề bài.",
    },
    locale,
  );
}

function getSessionItemLabel(
  locale: "en" | "vi",
  item: SessionChoiceQuestionProps["item"],
) {
  if (item.type === "listen_select") {
    return getLocalizedText({ en: "Listen & Select", vi: "Nghe và chọn" }, locale);
  }

  if (item.interactionMode === "hybrid") {
    return getLocalizedText({ en: "Complete Sentence", vi: "Hoàn thành câu" }, locale);
  }

  if (item.type === "grammar_select") {
    return getLocalizedText({ en: "Grammar", vi: "Ngữ pháp" }, locale);
  }

  if (item.type === "translation_select") {
    return getLocalizedText({ en: "Select Translation", vi: "Chọn nghĩa" }, locale);
  }

  if (item.type === "dialogue_response") {
    return getLocalizedText({ en: "Dialogue Response", vi: "Đáp hội thoại" }, locale);
  }

  return getLocalizedText({ en: "Word Match", vi: "Nối từ" }, locale);
}

function getPromptReplayText(item: SessionChoiceQuestionProps["item"]) {
  if ("audioText" in item && item.audioText && isLikelyKoreanVocabText(item.audioText)) {
    return item.audioText;
  }

  if ("koreanText" in item && item.koreanText && isLikelyKoreanVocabText(item.koreanText)) {
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
  const canShowInlineReplay = isVocabQuestion && "koreanText" in item && Boolean(item.koreanText);
  const hasAudio =
    ("audioUrl" in item && Boolean(item.audioUrl)) ||
    ("audioText" in item && Boolean(item.audioText)) ||
    Boolean(replayText);
  const ui = (en: string, vi: string) => getLocalizedText({ en, vi }, locale);
  const supportLabel =
    supportText && item.type === "grammar_select"
      ? `${ui("Meaning", "Nghĩa")}: ${supportText}`
      : supportText;
  const choiceItem = isLocalizedChoiceItem(item) ? item : null;
  const selectItem = isSelectItem(item) ? item : null;
  const stringChoiceItem = getStringChoiceItem(item);
  const stringChoices = stringChoiceItem?.choices ?? [];
  const grammarPromptGloss =
    item.type === "grammar_select"
      ? getPromptGlossData(item.koreanText, item.glossSegments)
      : null;
  const grammarPromptGlossSegments = grammarPromptGloss?.segments ?? [];

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
    <motion.section
      className="panel"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div className="space-y-6" variants={containerVariants}>
        <motion.div
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          variants={itemVariants}
        >
          <div className="space-y-2">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {item.isRetry
                ? ui("Retry question", "Câu hỏi làm lại")
                : getSessionItemLabel(locale, item)}
            </p>
            <h3 className="font-display text-3xl text-foreground sm:text-4xl">
              {getInstruction(locale, item)}
            </h3>
          </div>
          {hasAudio && !canShowInlineReplay ? (
            <button
              type="button"
              onClick={() => void handlePlayAudio()}
              className="secondary-button min-w-[10rem] shrink-0 justify-center whitespace-nowrap"
            >
              {isPlaying
                ? ui("Playing...", "Đang phát...")
                : isVocabQuestion
                  ? ui("Replay audio", "Nghe lại")
                  : ui("Play audio", "Phát audio")}
            </button>
          ) : (
            <span className="pill bg-card-strong text-foreground">
              {item.isRetry ? ui("Retry", "Làm lại") : ui("Fresh question", "Câu hỏi mới")}
            </span>
          )}
        </motion.div>

        <motion.article className="lesson-card space-y-5" variants={itemVariants}>
          <motion.div
            variants={itemVariants}
            className="rounded-[2rem] bg-card-soft p-6 shadow-[0_14px_30px_rgba(47,92,51,0.08)]"
          >
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {prompt}
            </p>

            {"koreanText" in item && item.koreanText ? (
              <div className="mt-4 flex items-start justify-between gap-3">
                {item.type === "grammar_select" && grammarPromptGlossSegments.length > 0 ? (
                  <KoreanTextWithGloss
                    text={item.koreanText}
                    locale={locale}
                    segments={grammarPromptGlossSegments}
                    sentenceMeaning={
                      locale === "vi"
                        ? grammarPromptGloss?.sentenceMeaningVi
                        : grammarPromptGloss?.sentenceMeaningEn
                    }
                    supportsGloss
                    showSentenceMeaning={false}
                    textClassName="korean-display"
                  />
                ) : (
                  <p className="korean-display">{item.koreanText}</p>
                )}
                {canShowInlineReplay ? (
                  <button
                    type="button"
                    onClick={() => void handlePlayAudio()}
                    aria-label={ui("Replay Korean audio", "Phát lại audio tiếng Hàn")}
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
          </motion.div>

          <motion.div variants={itemVariants} className="grid gap-3 sm:grid-cols-2">
            {choiceItem
              ? choiceItem.choices.map((option) => {
                  const isSelected = selectedOption === option.id;
                  const label = getLocalizedText(option.text, locale);

                  return (
                    <motion.button
                      key={option.id}
                      type="button"
                      onClick={() => handleOptionSelect(option.id, label)}
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
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
                    </motion.button>
                  );
                })
              : stringChoices.map((option) => {
                  const isSelected = selectedOption === option;

                  return (
                    <motion.button
                      key={option}
                      type="button"
                      onClick={() => handleOptionSelect(option, option)}
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className={`choice-button ${isSelected ? "border-accent bg-card-strong" : ""}`}
                    >
                      {option}
                    </motion.button>
                  );
                })}
          </motion.div>

          <CheckButton
            label={ui("Check answer", "Kiểm tra đáp án")}
            onClick={handleCheckAnswer}
            disabled={!selectedOption}
            fullWidth
          />
        </motion.article>
      </motion.div>
    </motion.section>
  );
}
