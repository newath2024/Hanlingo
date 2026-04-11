"use client";

import { useAppLocale } from "@/hooks/useAppLocale";
import { getLocalizedText } from "@/lib/localized";
import { containerVariants, itemVariants } from "@/lib/practice-motion";
import { speakIfKoreanText } from "@/lib/speech";
import type { ArrangeSessionItem, SessionItemResult } from "@/types/session";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import AnswerBuilder from "./AnswerBuilder";
import CheckButton from "./CheckButton";
import type { WordChipToken } from "./WordChip";

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

function getMismatchIndexes(selectedWords: string[], answer: string[]) {
  const mismatches: number[] = [];

  selectedWords.forEach((word, index) => {
    if (word !== answer[index]) {
      mismatches.push(index);
    }
  });

  return mismatches;
}

function buildWordTokens(item: ArrangeSessionItem): WordChipToken[] {
  return item.wordBank.map((word, index) => ({
    id: `${item.id}-${index}`,
    text: word,
    index,
  }));
}

export default function SessionBuildSentenceQuestion({
  item,
  onResolve,
}: SessionBuildSentenceQuestionProps) {
  const { locale } = useAppLocale();
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([]);
  const [incorrectIndexes, setIncorrectIndexes] = useState<number[]>([]);
  const prompt = getLocalizedText(item.prompt, locale);
  const explanation = getLocalizedText(item.explanation, locale);
  const ui = (en: string, vi: string) => getLocalizedText({ en, vi }, locale);
  const isAdaptiveWordBank = item.interactionMode === "word_bank";
  const wordTokens = useMemo(() => buildWordTokens(item), [item]);
  const tokenMap = useMemo(
    () => new Map(wordTokens.map((token) => [token.id, token])),
    [wordTokens],
  );
  const selectedWords = selectedTokenIds
    .map((tokenId) => tokenMap.get(tokenId)?.text ?? "")
    .filter(Boolean);

  function handleToggleWord(token: WordChipToken) {
    speakIfKoreanText(token.text, { rate: 0.92 });
    setIncorrectIndexes([]);

    setSelectedTokenIds((previous) =>
      previous.includes(token.id)
        ? previous.filter((selectedTokenId) => selectedTokenId !== token.id)
        : [...previous, token.id],
    );
  }

  function handleClear() {
    if (selectedTokenIds.length === 0) {
      return;
    }

    setSelectedTokenIds([]);
    setIncorrectIndexes([]);
  }

  function handleCheckAnswer() {
    if (selectedWords.length === 0) {
      return;
    }

    const wasCorrect = matchesAnswer(selectedWords, item.answer);

    setIncorrectIndexes(wasCorrect ? [] : getMismatchIndexes(selectedWords, item.answer));

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
    <motion.section
      className="panel"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div className="space-y-6" variants={containerVariants}>
        <motion.div className="space-y-2" variants={itemVariants}>
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
        </motion.div>

        <motion.article className="lesson-card space-y-5" variants={itemVariants}>
          <motion.div
            variants={itemVariants}
            className="rounded-[1.9rem] bg-card-soft p-5 shadow-[0_14px_30px_rgba(47,92,51,0.08)]"
          >
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
          </motion.div>

          <motion.div variants={itemVariants}>
            <AnswerBuilder
              groupId={item.id}
              tokens={wordTokens}
              selectedTokenIds={selectedTokenIds}
              incorrectIndexes={incorrectIndexes}
              onToggleToken={handleToggleWord}
              answerLabel={ui("Your sentence", "Cau cua ban")}
              bankLabel={ui("Word bank", "Ngan tu")}
              emptyState={ui(
                "Tap words below to build the answer.",
                "Cham vao cac tu ben duoi de ghep cau tra loi.",
              )}
            />
          </motion.div>

          {incorrectIndexes.length > 0 ? (
            <motion.div variants={itemVariants} className="feedback-incorrect space-y-2">
              <p>
                {ui(
                  "A few chunks are out of place. Watch the word order.",
                  "Mot vai cum dang sai vi tri. Hay de y thu tu tu.",
                )}
              </p>
              <p className="font-semibold">
                {ui("Correct order", "Thu tu dung")}: {item.answer.join(" ")}
              </p>
              <p className="text-sm font-bold text-danger/90">
                {ui(
                  "Hint: start from the subject and rebuild the sentence one chunk at a time.",
                  "Goi y: bat dau tu chu ngu roi ghep lai tung cum mot.",
                )}
              </p>
            </motion.div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
            <button
              type="button"
              onClick={handleClear}
              disabled={selectedTokenIds.length === 0}
              className="secondary-button w-full"
            >
              {ui("Clear", "Xoa")}
            </button>
            <CheckButton
              label={ui("Check answer", "Kiem tra dap an")}
              onClick={handleCheckAnswer}
              disabled={selectedTokenIds.length === 0}
              fullWidth
            />
          </div>
        </motion.article>
      </motion.div>
    </motion.section>
  );
}
