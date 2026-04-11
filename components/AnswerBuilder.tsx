"use client";

import {
  chipTransition,
  containerVariants,
  itemVariants,
} from "@/lib/practice-motion";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import WordChip, { type WordChipToken } from "./WordChip";

type AnswerBuilderProps = {
  groupId: string;
  tokens: WordChipToken[];
  selectedTokenIds: string[];
  incorrectIndexes?: number[];
  disabled?: boolean;
  onToggleToken: (token: WordChipToken) => void;
  answerLabel: string;
  bankLabel: string;
  emptyState: string;
};

function buildTokenMap(tokens: WordChipToken[]) {
  return new Map(tokens.map((token) => [token.id, token]));
}

export default function AnswerBuilder({
  groupId,
  tokens,
  selectedTokenIds,
  incorrectIndexes = [],
  disabled = false,
  onToggleToken,
  answerLabel,
  bankLabel,
  emptyState,
}: AnswerBuilderProps) {
  const tokenMap = buildTokenMap(tokens);
  const incorrectIndexSet = new Set(incorrectIndexes);
  const selectedTokens = selectedTokenIds
    .map((tokenId) => tokenMap.get(tokenId))
    .filter((token): token is WordChipToken => Boolean(token));
  const selectedTokenIdSet = new Set(selectedTokenIds);
  const bankTokens = tokens.filter((token) => !selectedTokenIdSet.has(token.id));
  const hasSelection = selectedTokens.length > 0;
  const hasMistake = incorrectIndexes.length > 0;

  return (
    <LayoutGroup id={`answer-builder-${groupId}`}>
      <div className="space-y-4">
        <motion.div
          layout
          transition={chipTransition}
          className={`sentence-well ${
            hasMistake
              ? "sentence-well-incorrect"
              : hasSelection
                ? "sentence-well-active"
                : ""
          }`}
        >
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
            {answerLabel}
          </p>

          <motion.div
            layout
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="mt-4 flex min-h-14 flex-wrap gap-3"
          >
            <AnimatePresence initial={false}>
              {selectedTokens.length > 0 ? (
                selectedTokens.map((token, index) => (
                  <WordChip
                    key={token.id}
                    token={token}
                    layoutId={`${groupId}-${token.id}`}
                    disabled={disabled}
                    tone={incorrectIndexSet.has(index) ? "incorrect" : "answer"}
                    onSelect={onToggleToken}
                  />
                ))
              ) : (
                <motion.p
                  key="empty-answer"
                  variants={itemVariants}
                  className="text-base font-bold text-muted-foreground"
                >
                  {emptyState}
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>

        <div className="space-y-3">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
            {bankLabel}
          </p>
          <motion.div
            layout
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-wrap gap-3"
          >
            <AnimatePresence initial={false}>
              {bankTokens.map((token) => (
                <motion.div
                  key={token.id}
                  layout
                  variants={itemVariants}
                  transition={chipTransition}
                >
                  <WordChip
                    token={token}
                    layoutId={`${groupId}-${token.id}`}
                    disabled={disabled}
                    onSelect={onToggleToken}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </LayoutGroup>
  );
}
