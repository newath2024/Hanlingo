"use client";

import { useAppLocale } from "@/hooks/useAppLocale";
import { getLocalizedText } from "@/lib/localized";
import { containerVariants, itemVariants } from "@/lib/practice-motion";
import { speakIfKoreanText } from "@/lib/speech";
import { motion } from "framer-motion";
import type { PairMatchSessionItem, SessionItemResult } from "@/types/session";
import { useMemo, useState } from "react";
import CheckButton from "./CheckButton";

type SessionWordMatchQuestionProps = {
  item: PairMatchSessionItem;
  onResolve: (result: SessionItemResult) => void;
};

function normalizePairs(pairs: Array<[string, string]>) {
  return [...pairs]
    .map(([left, right]) => `${left}=>${right}`)
    .sort()
    .join("|");
}

export default function SessionWordMatchQuestion({
  item,
  onResolve,
}: SessionWordMatchQuestionProps) {
  const { locale } = useAppLocale();
  const [selectedLeft, setSelectedLeft] = useState("");
  const [matches, setMatches] = useState<Array<[string, string]>>([]);
  const prompt = getLocalizedText(item.prompt, locale);
  const explanation = getLocalizedText(item.explanation, locale);
  const ui = (en: string, vi: string) => getLocalizedText({ en, vi }, locale);
  const usedLeftValues = useMemo(() => new Set(matches.map(([left]) => left)), [matches]);
  const usedRightValues = useMemo(() => new Set(matches.map(([, right]) => right)), [matches]);

  function handleSelectLeft(left: string) {
    if (usedLeftValues.has(left)) {
      return;
    }

    setSelectedLeft(left);
    speakIfKoreanText(left, { rate: 0.92 });
  }

  function handleSelectRight(right: string) {
    if (!selectedLeft || usedRightValues.has(right)) {
      return;
    }

    setMatches((previous) => [...previous, [selectedLeft, right]]);
    setSelectedLeft("");
  }

  function handleRemoveMatch(pair: [string, string]) {
    setMatches((previous) =>
      previous.filter(
        ([left, right]) => !(left === pair[0] && right === pair[1]),
      ),
    );
  }

  function handleCheckAnswer() {
    if (matches.length !== item.answer.length) {
      return;
    }

    const wasCorrect = normalizePairs(matches) === normalizePairs(item.answer);

    onResolve({
      status: wasCorrect ? "correct" : "incorrect",
      awardedXp: 0,
      shouldRetryLater: !wasCorrect,
      weakItemLabel: item.weakItemLabel,
      userAnswer: matches.map(([left, right]) => `${left} = ${right}`).join("; "),
      answerTokens: matches.flatMap(([left, right]) => [left, right]),
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
            {item.isRetry ? ui("Retry question", "Cau hoi lam lai") : ui("Word Match", "Noi tu")}
          </p>
          <h3 className="font-display text-3xl text-foreground sm:text-4xl">
            {ui(
              "Tap a Korean item, then tap its meaning.",
              "Cham vao muc tieng Han, roi cham vao nghia cua no.",
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
            <p className="mt-4 text-sm font-bold text-muted-foreground">{explanation}</p>
            {selectedLeft ? (
              <div className="mt-4 rounded-[1.4rem] bg-white/80 px-4 py-3 text-sm font-bold text-foreground">
                {ui("Selected Korean item", "Muc tieng Han da chon")}: {selectedLeft}
              </div>
            ) : null}
          </motion.div>

          {matches.length > 0 ? (
            <motion.div variants={itemVariants} className="space-y-3">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {ui("Current matches", "Cac cap da noi")}
              </p>
              <div className="flex flex-wrap gap-3">
                {matches.map((pair) => (
                  <button
                    key={`${pair[0]}-${pair[1]}`}
                    type="button"
                    onClick={() => handleRemoveMatch(pair)}
                    className="chip-button chip-button-active"
                  >
                    {pair[0]} = {pair[1]}
                  </button>
                ))}
              </div>
            </motion.div>
          ) : null}

          <motion.div variants={itemVariants} className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {ui("Korean", "Tieng Han")}
              </p>
              <div className="grid gap-3">
                {item.pairs.map((pair) => {
                  const isUsed = usedLeftValues.has(pair.left);
                  const isSelected = selectedLeft === pair.left;

                  return (
                    <motion.button
                      key={pair.left}
                      type="button"
                      disabled={isUsed}
                      onClick={() => handleSelectLeft(pair.left)}
                      whileHover={isUsed ? undefined : { scale: 1.02, y: -2 }}
                      whileTap={isUsed ? undefined : { scale: 0.98 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className={`choice-button text-left ${
                        isSelected ? "border-accent bg-card-strong" : ""
                      }`}
                    >
                      {pair.left}
                    </motion.button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {ui("Meanings", "Nghia")}
              </p>
              <div className="grid gap-3">
                {item.rightOptions.map((right) => {
                  const isUsed = usedRightValues.has(right);

                  return (
                    <motion.button
                      key={right}
                      type="button"
                      disabled={isUsed || !selectedLeft}
                      onClick={() => handleSelectRight(right)}
                      whileHover={isUsed || !selectedLeft ? undefined : { scale: 1.02, y: -2 }}
                      whileTap={isUsed || !selectedLeft ? undefined : { scale: 0.98 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="choice-button text-left"
                    >
                      {right}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </motion.div>

          <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
            <button
              type="button"
              onClick={() => {
                setMatches([]);
                setSelectedLeft("");
              }}
              disabled={matches.length === 0 && !selectedLeft}
              className="secondary-button w-full"
            >
              {ui("Clear", "Xoa")}
            </button>
            <CheckButton
              label={ui("Check answer", "Kiem tra dap an")}
              onClick={handleCheckAnswer}
              disabled={matches.length !== item.answer.length}
              fullWidth
            />
          </div>
        </motion.article>
      </motion.div>
    </motion.section>
  );
}
