"use client";

import { playFeedbackTone } from "@/lib/speech";
import {
  containerVariants,
  feedbackVariants,
  itemVariants,
  shakeAnimation,
} from "@/lib/practice-motion";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, type CSSProperties, type ReactNode } from "react";
import type { SessionItemResultStatus } from "@/types/session";
import CheckButton from "./CheckButton";

type ResultFeedbackProps = {
  status: SessionItemResultStatus;
  title: string;
  eyebrow?: string;
  badges?: ReactNode;
  summary?: ReactNode;
  correctAnswer?: string;
  hint?: string;
  detail?: ReactNode;
  fingerprintLabel?: string;
  fingerprintReason?: string;
  explanation?: ReactNode;
  errorMessage?: string | null;
  onContinue: () => void;
  actionLabel: string;
  actionLoadingLabel?: string;
  isContinuing?: boolean;
  showCelebration?: boolean;
  widthClassName?: string;
};

const confettiPieces = [
  { left: "8%", top: "8%", rotate: -18, color: "var(--accent)" },
  { left: "18%", top: "0%", rotate: 26, color: "var(--accent-warm)" },
  { left: "32%", top: "10%", rotate: -8, color: "var(--accent-strong)" },
  { left: "48%", top: "-2%", rotate: 18, color: "#8ce052" },
  { left: "64%", top: "8%", rotate: -22, color: "#ffd873" },
  { left: "80%", top: "4%", rotate: 32, color: "#4eb87e" },
  { left: "92%", top: "12%", rotate: -14, color: "#f2d46a" },
];

function getSummaryTone(status: SessionItemResultStatus) {
  if (status === "correct") {
    return "feedback-correct";
  }

  if (status === "incorrect") {
    return "feedback-incorrect";
  }

  return "rounded-[1.7rem] border border-accent/15 bg-card-soft px-4 py-3 text-sm font-bold text-foreground";
}

export default function ResultFeedback({
  status,
  title,
  eyebrow,
  badges,
  summary,
  correctAnswer,
  hint,
  detail,
  fingerprintLabel,
  fingerprintReason,
  explanation,
  errorMessage,
  onContinue,
  actionLabel,
  actionLoadingLabel,
  isContinuing = false,
  showCelebration = false,
  widthClassName = "max-w-4xl",
}: ResultFeedbackProps) {
  const shouldReduceMotion = useReducedMotion();
  const shouldCelebrate = showCelebration && status === "correct" && !shouldReduceMotion;
  const shouldPlaySound = status === "correct" || status === "incorrect";

  useEffect(() => {
    if (!shouldPlaySound) {
      return;
    }

    playFeedbackTone(status === "correct" ? "correct" : "wrong");
  }, [shouldPlaySound, status]);

  return (
    <>
      <AnimatePresence>
        {status === "correct" && !shouldReduceMotion ? (
          <motion.div
            key="feedback-flash"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.24, 0.1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.34, times: [0, 0.3, 0.75, 1] }}
            className="practice-feedback-flash"
          />
        ) : null}
      </AnimatePresence>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 sm:px-6">
        <motion.section
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={feedbackVariants}
          className={`pointer-events-auto w-full ${widthClassName}`}
        >
          <motion.div
            animate={status === "incorrect" && !shouldReduceMotion ? shakeAnimation : { x: 0 }}
          >
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="practice-feedback-sheet lesson-card relative overflow-hidden space-y-5"
            >
            {shouldCelebrate ? (
              <div aria-hidden="true" className="practice-feedback-confetti">
                {confettiPieces.map((piece, index) => (
                  <motion.span
                    key={`${piece.left}-${piece.top}-${index}`}
                    className="practice-feedback-confetti__piece"
                    style={
                      {
                        left: piece.left,
                        top: piece.top,
                        transform: `rotate(${piece.rotate}deg)`,
                        backgroundColor: piece.color,
                      } as CSSProperties
                    }
                    initial={{ opacity: 0, y: -12, scale: 0.7 }}
                    animate={{ opacity: [0, 1, 1, 0], y: [0, 26, 68, 86], x: [0, index % 2 === 0 ? -16 : 16, 0], scale: [0.7, 1, 0.92] }}
                    transition={{ duration: 0.7, delay: index * 0.02 }}
                  />
                ))}
              </div>
            ) : null}

            <div className="space-y-3">
              {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
              {eyebrow ? (
                <motion.p
                  variants={itemVariants}
                  className="text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground"
                >
                  {eyebrow}
                </motion.p>
              ) : null}
              <motion.h3
                variants={itemVariants}
                className="font-display text-3xl text-foreground sm:text-4xl"
              >
                {title}
              </motion.h3>
            </div>

            {summary ? <div className={getSummaryTone(status)}>{summary}</div> : null}

            {!summary && (correctAnswer || hint) ? (
              <div className={getSummaryTone(status)}>
                {correctAnswer ? <p>{correctAnswer}</p> : null}
                {hint ? <p className="mt-2 font-semibold">{hint}</p> : null}
              </div>
            ) : null}

            {detail ? (
              <motion.div
                variants={itemVariants}
                className="rounded-[1.7rem] bg-card-soft px-4 py-3 text-sm font-bold text-muted-foreground"
              >
                {detail}
              </motion.div>
            ) : null}

            {fingerprintLabel ? (
              <motion.div
                variants={itemVariants}
                className="rounded-[1.7rem] border border-accent/15 bg-card-soft px-4 py-3 text-sm font-bold text-foreground"
              >
                <p>{fingerprintLabel}</p>
                {fingerprintReason ? (
                  <p className="mt-1 text-muted-foreground">{fingerprintReason}</p>
                ) : null}
              </motion.div>
            ) : null}

            {explanation ? (
              <motion.div
                variants={itemVariants}
                className="rounded-[1.7rem] bg-card-soft px-4 py-4 text-sm font-bold text-muted-foreground"
              >
                {explanation}
              </motion.div>
            ) : null}

            {errorMessage ? <div className="feedback-incorrect">{errorMessage}</div> : null}

            {hint && summary ? (
              <motion.p variants={itemVariants} className="text-sm font-bold text-muted-foreground">
                {hint}
              </motion.p>
            ) : null}

              <CheckButton
                label={actionLabel}
                loadingLabel={actionLoadingLabel}
                isLoading={isContinuing}
                onClick={onContinue}
                fullWidth
                autoFocus
              />
            </motion.div>
          </motion.div>
        </motion.section>
      </div>
    </>
  );
}
