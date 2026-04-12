"use client";

import { useAppLocale } from "@/hooks/useAppLocale";
import { getLocalizedText } from "@/lib/localized";
import { containerVariants, itemVariants } from "@/lib/practice-motion";
import { playAudioUrl, speakIfKoreanText } from "@/lib/speech";
import type { ListeningSessionItem, SessionItemResult } from "@/types/session";
import { motion } from "framer-motion";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AnswerBuilder from "./AnswerBuilder";
import CheckButton from "./CheckButton";
import type { WordChipToken } from "./WordChip";

type SegmentedListeningQuestionProps = {
  item: ListeningSessionItem;
  onResolve: (result: SessionItemResult) => void;
};

function normalizeAnswer(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.,!?'"`~:;()[\]{}]/g, "")
    .replace(/\s+/g, " ");
}

function getChoiceLabel(
  choice: NonNullable<ListeningSessionItem["choices"]>[number],
  locale: "en" | "vi",
) {
  return getLocalizedText(choice.text, locale);
}

function getExpectedAnswers(item: ListeningSessionItem) {
  return [item.correctText ?? "", ...(item.acceptedAnswers ?? [])]
    .map((value) => value.trim())
    .filter(Boolean);
}

function getDisplayValue(
  value: ListeningSessionItem["correctAnswer"] | ListeningSessionItem["weakItemLabel"],
  locale: "en" | "vi",
) {
  return typeof value === "string" ? value : getLocalizedText(value, locale);
}

function buildOrderTokens(
  item: ListeningSessionItem,
  locale: "en" | "vi",
): WordChipToken[] {
  return (item.choices ?? []).map((choice, index) => ({
    id: choice.id,
    text: getChoiceLabel(choice, locale),
    index,
  }));
}

export default function SegmentedListeningQuestion({
  item,
  onResolve,
}: SegmentedListeningQuestionProps) {
  const { locale } = useAppLocale();
  const didAutoplayRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedChoiceId, setSelectedChoiceId] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [selectedOrderChoiceIds, setSelectedOrderChoiceIds] = useState<string[]>([]);
  const [incorrectIndexes, setIncorrectIndexes] = useState<number[]>([]);
  const prompt = getLocalizedText(item.prompt, locale);
  const questionText = item.questionText ? getLocalizedText(item.questionText, locale) : "";
  const explanation = getLocalizedText(item.explanation, locale);
  const contextTitle = item.contextTitle ? getLocalizedText(item.contextTitle, locale) : "";
  const contextSummary = item.contextSummary ? getLocalizedText(item.contextSummary, locale) : "";
  const hasChoiceFill =
    item.listeningType === "fill_blank" && (item.choices?.length ?? 0) >= 2;
  const orderTokens = useMemo(() => buildOrderTokens(item, locale), [item, locale]);
  const tokenMap = useMemo(
    () => new Map(orderTokens.map((token) => [token.id, token])),
    [orderTokens],
  );
  const selectedOrderTexts = selectedOrderChoiceIds
    .map((choiceId) => tokenMap.get(choiceId)?.text ?? "")
    .filter(Boolean);
  const ui = (en: string, vi: string) => getLocalizedText({ en, vi }, locale);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handlePlayAudio = useCallback(async () => {
    await playAudioUrl(item.audioUrl, {
      clipStartMs: item.clipStartMs,
      clipEndMs: item.clipEndMs,
      onStart: () => setIsPlaying(true),
      onEnd: () => setIsPlaying(false),
      onError: () => setIsPlaying(false),
    });
  }, [item.audioUrl, item.clipEndMs, item.clipStartMs]);

  useEffect(() => {
    if (didAutoplayRef.current) {
      return;
    }

    didAutoplayRef.current = true;
    void handlePlayAudio();
  }, [handlePlayAudio, item.id]);

  function handleChoiceSelect(choiceId: string) {
    setSelectedChoiceId(choiceId);
    const choiceEntry = item.choices?.find((choice) => choice.id === choiceId);
    if (choiceEntry) {
      speakIfKoreanText(getChoiceLabel(choiceEntry, locale), {
        rate: 0.92,
        onStart: () => setIsPlaying(true),
        onEnd: () => setIsPlaying(false),
        onError: () => setIsPlaying(false),
      });
    }
  }

  function handleOrderToggle(token: WordChipToken) {
    speakIfKoreanText(token.text, { rate: 0.92 });
    setIncorrectIndexes([]);
    setSelectedOrderChoiceIds((previous) =>
      previous.includes(token.id)
        ? previous.filter((choiceId) => choiceId !== token.id)
        : [...previous, token.id],
    );
  }

  function handleResolve(result: {
    wasCorrect: boolean;
    userAnswer: string;
    answerOptionId?: string;
    answerTokens?: string[];
  }) {
    onResolve({
      status: result.wasCorrect ? "correct" : "incorrect",
      awardedXp: 0,
      shouldRetryLater: !result.wasCorrect,
      weakItemLabel: item.weakItemLabel,
      userAnswer: result.userAnswer,
      answerOptionId: result.answerOptionId,
      answerTokens: result.answerTokens,
      correctAnswer: item.correctAnswer,
      explanation: item.explanation,
    });
  }

  function handleCheckChoiceAnswer() {
    if (!selectedChoiceId) {
      return;
    }

    const selectedChoice = item.choices?.find((choice) => choice.id === selectedChoiceId);
    const selectedLabel = selectedChoice ? getChoiceLabel(selectedChoice, locale) : selectedChoiceId;
    const expectedAnswers = getExpectedAnswers(item).map(normalizeAnswer);
    const wasCorrect =
      selectedChoiceId === item.correctChoiceId ||
      expectedAnswers.includes(normalizeAnswer(selectedLabel));

    handleResolve({
      wasCorrect,
      userAnswer: selectedLabel,
      answerOptionId: selectedChoiceId,
      answerTokens: selectedLabel.split(/\s+/).filter(Boolean),
    });
  }

  function handleCheckInputAnswer() {
    const rawAnswer = inputValue.trim();

    if (!rawAnswer) {
      return;
    }

    const normalizedInput = normalizeAnswer(rawAnswer);
    const wasCorrect = getExpectedAnswers(item)
      .map(normalizeAnswer)
      .includes(normalizedInput);

    handleResolve({
      wasCorrect,
      userAnswer: rawAnswer,
      answerTokens: rawAnswer.split(/\s+/).filter(Boolean),
    });
  }

  function handleCheckOrderAnswer() {
    if (selectedOrderChoiceIds.length === 0) {
      return;
    }

    const correctOrder = item.correctOrderChoiceIds ?? [];
    const wasCorrect =
      selectedOrderChoiceIds.length === correctOrder.length &&
      selectedOrderChoiceIds.every((choiceId, index) => choiceId === correctOrder[index]);

    setIncorrectIndexes(
      wasCorrect
        ? []
        : selectedOrderChoiceIds.reduce<number[]>((indexes, choiceId, index) => {
            if (correctOrder[index] !== choiceId) {
              indexes.push(index);
            }
            return indexes;
          }, []),
    );

    handleResolve({
      wasCorrect,
      userAnswer: selectedOrderTexts.join(" "),
      answerTokens: selectedOrderTexts,
    });
  }

  function renderChoiceButtons() {
    if (!item.choices?.length) {
      return null;
    }

    if (item.listeningType === "choose_image") {
      return (
        <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4">
          {item.choices.map((choice) => {
            const label = getChoiceLabel(choice, locale);
            const isSelected = selectedChoiceId === choice.id;

            return (
              <motion.button
                key={choice.id}
                type="button"
                onClick={() => handleChoiceSelect(choice.id)}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className={`group overflow-hidden rounded-[1.8rem] border-2 bg-white text-left shadow-[0_14px_28px_rgba(47,92,51,0.08)] transition ${
                  isSelected ? "border-accent bg-card-strong" : "border-accent/10"
                }`}
              >
                <div className="relative h-40 bg-[linear-gradient(180deg,#fff7da_0%,#f3f9f0_100%)]">
                  {choice.imageUrl ? (
                    <Image
                      src={choice.imageUrl}
                      alt={label}
                      fill
                      sizes="(max-width: 768px) 45vw, 18rem"
                      className="object-contain p-4"
                    />
                  ) : null}
                </div>
                <div className="px-4 py-4">
                  <p className="text-base font-extrabold text-foreground">{label}</p>
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      );
    }

    return (
      <motion.div
        variants={itemVariants}
        className={`grid gap-3 ${
          item.listeningType === "yes_no" ? "sm:grid-cols-2" : "sm:grid-cols-2"
        }`}
      >
        {item.choices.map((choice) => {
          const label = getChoiceLabel(choice, locale);
          const isSelected = selectedChoiceId === choice.id;

          return (
            <motion.button
              key={choice.id}
              type="button"
              onClick={() => handleChoiceSelect(choice.id)}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className={`choice-button text-left ${
                isSelected ? "border-accent bg-card-strong" : ""
              }`}
            >
              {label}
            </motion.button>
          );
        })}
      </motion.div>
    );
  }

  function renderAnswerArea() {
    if (
      item.listeningType === "yes_no" ||
      item.listeningType === "multiple_choice" ||
      item.listeningType === "choose_image"
    ) {
      return (
        <>
          {renderChoiceButtons()}
          <CheckButton
            label={ui("Check answer", "Kiểm tra đáp án")}
            onClick={handleCheckChoiceAnswer}
            disabled={!selectedChoiceId}
            fullWidth
          />
        </>
      );
    }

    if (item.listeningType === "fill_blank") {
      return (
        <>
          {hasChoiceFill ? (
            renderChoiceButtons()
          ) : (
            <motion.div variants={itemVariants}>
              <input
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                placeholder={ui("Type what you heard", "Nhập đáp án bạn nghe được")}
                className="w-full rounded-[1.8rem] border border-accent/15 bg-white px-5 py-4 text-xl font-bold text-foreground outline-none transition focus:border-accent"
              />
            </motion.div>
          )}
          <CheckButton
            label={ui("Check answer", "Kiểm tra đáp án")}
            onClick={hasChoiceFill ? handleCheckChoiceAnswer : handleCheckInputAnswer}
            disabled={hasChoiceFill ? !selectedChoiceId : !inputValue.trim()}
            fullWidth
          />
        </>
      );
    }

    return (
      <>
        <motion.div variants={itemVariants}>
          <AnswerBuilder
            groupId={item.id}
            tokens={orderTokens}
            selectedTokenIds={selectedOrderChoiceIds}
            incorrectIndexes={incorrectIndexes}
            onToggleToken={handleOrderToggle}
            answerLabel={ui("Your sentence", "Câu của bạn")}
            bankLabel={ui("Chunk bank", "Ngân cụm từ")}
            emptyState={ui(
              "Tap the chunks below to rebuild the sentence.",
              "Chạm các cụm bên dưới để ghép lại câu.",
            )}
          />
        </motion.div>

        {incorrectIndexes.length > 0 ? (
          <motion.div variants={itemVariants} className="feedback-incorrect space-y-2">
            <p>
              {ui(
                "Most chunks are there, but the sentence order is off.",
                "Bạn đã có gần đủ cụm, nhưng thứ tự câu vẫn chưa đúng.",
              )}
            </p>
            <p className="font-semibold">
              {ui("Correct order", "Thứ tự đúng")}:{" "}
              {getDisplayValue(item.correctAnswer, locale)}
            </p>
          </motion.div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
          <button
            type="button"
            onClick={() => {
              setSelectedOrderChoiceIds([]);
              setIncorrectIndexes([]);
            }}
            disabled={selectedOrderChoiceIds.length === 0}
            className="secondary-button w-full"
          >
            {ui("Clear", "Xóa")}
          </button>
          <CheckButton
            label={ui("Check answer", "Kiểm tra đáp án")}
            onClick={handleCheckOrderAnswer}
            disabled={selectedOrderChoiceIds.length === 0}
            fullWidth
          />
        </div>
      </>
    );
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
          variants={itemVariants}
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="space-y-2">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {item.isRetry ? ui("Retry listening", "Làm lại phần nghe") : ui("Listening", "Nghe hiểu")}
            </p>
            <h3 className="font-display text-3xl text-foreground sm:text-4xl">
              {item.listeningType === "yes_no"
                ? ui("Listen and decide if the statement is right.", "Nghe rồi quyết định phát biểu đúng hay sai.")
                : item.listeningType === "multiple_choice"
                  ? ui("Listen and choose the best answer.", "Nghe rồi chọn đáp án phù hợp nhất.")
                  : item.listeningType === "choose_image"
                    ? ui("Listen and tap the matching image.", "Nghe rồi chọn hình phù hợp.")
                    : item.listeningType === "fill_blank"
                      ? ui("Listen and complete the missing part.", "Nghe rồi điền phần còn thiếu.")
                      : ui(
                          "Listen and rebuild the sentence from the chunks.",
                          "Nghe rồi ghép lại câu từ các cụm từ.",
                        )}
            </h3>
          </div>
          <button type="button" onClick={() => void handlePlayAudio()} className="secondary-button">
            {isPlaying ? ui("Playing...", "Đang phát...") : ui("Replay audio", "Phát lại audio")}
          </button>
        </motion.div>

        <motion.article className="lesson-card space-y-5" variants={itemVariants}>
          <motion.div
            variants={itemVariants}
            className="rounded-[2rem] bg-card-soft p-6 shadow-[0_14px_30px_rgba(47,92,51,0.08)]"
          >
            {(contextTitle || contextSummary) && (
              <div className="mb-4 rounded-[1.4rem] bg-white/85 px-4 py-3">
                {contextTitle ? (
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {contextTitle}
                  </p>
                ) : null}
                {contextSummary ? (
                  <p className="mt-1 text-sm font-bold text-foreground">{contextSummary}</p>
                ) : null}
              </div>
            )}

            <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {prompt}
            </p>

            {questionText ? (
              <div className="mt-4 rounded-[1.8rem] bg-white/80 px-5 py-5 shadow-[0_10px_24px_rgba(47,92,51,0.06)]">
                <p className="text-lg font-extrabold leading-tight text-foreground sm:text-2xl">
                  {questionText}
                </p>
              </div>
            ) : null}

            <p className="mt-4 text-sm font-bold text-muted-foreground">{explanation}</p>
          </motion.div>

          {renderAnswerArea()}
        </motion.article>
      </motion.div>
    </motion.section>
  );
}
