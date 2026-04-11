"use client";

import { chipTransition, itemVariants } from "@/lib/practice-motion";
import { motion } from "framer-motion";

export type WordChipToken = {
  id: string;
  text: string;
  index: number;
};

type WordChipTone = "bank" | "answer" | "incorrect";

type WordChipProps = {
  token: WordChipToken;
  layoutId: string;
  tone?: WordChipTone;
  disabled?: boolean;
  onSelect: (token: WordChipToken) => void;
};

function getToneClassName(tone: WordChipTone) {
  if (tone === "incorrect") {
    return "border-danger bg-danger-soft text-danger shadow-[0_12px_26px_rgba(217,92,75,0.16)]";
  }

  if (tone === "answer") {
    return "chip-button-active shadow-[0_14px_28px_rgba(88,185,93,0.18)]";
  }

  return "";
}

export default function WordChip({
  token,
  layoutId,
  tone = "bank",
  disabled = false,
  onSelect,
}: WordChipProps) {
  return (
    <motion.button
      layout
      layoutId={layoutId}
      variants={itemVariants}
      transition={chipTransition}
      type="button"
      onClick={() => onSelect(token)}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.05, y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      className={`chip-button ${getToneClassName(tone)}`.trim()}
    >
      {token.text}
    </motion.button>
  );
}
