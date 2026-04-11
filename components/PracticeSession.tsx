"use client";

import { questionVariants } from "@/lib/practice-motion";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { type ComponentProps, type ReactNode } from "react";
import ResultFeedback from "./ResultFeedback";

export type PracticeSessionFeedback = ComponentProps<typeof ResultFeedback> & {
  id: string;
};

type PracticeSessionProps = {
  progress?: ReactNode;
  questionKey: string;
  question: ReactNode | null;
  feedback: PracticeSessionFeedback | null;
};

export default function PracticeSession({
  progress,
  questionKey,
  question,
  feedback,
}: PracticeSessionProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="relative space-y-6">
      {progress}

      <AnimatePresence mode="wait" initial={false}>
        {question ? (
          <motion.div
            key={questionKey}
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={questionVariants}
            className={feedback ? "pointer-events-none select-none" : ""}
          >
            <motion.div
              animate={
                feedback && !shouldReduceMotion
                  ? { scale: 0.985, y: -8, opacity: 0.88 }
                  : { scale: 1, y: 0, opacity: 1 }
              }
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              aria-hidden={Boolean(feedback)}
            >
              {question}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {feedback ? <ResultFeedback key={feedback.id} {...feedback} /> : null}
      </AnimatePresence>
    </div>
  );
}
