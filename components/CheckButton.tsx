"use client";

import { buttonPressTransition } from "@/lib/practice-motion";
import { motion } from "framer-motion";

type CheckButtonProps = {
  label: string;
  loadingLabel?: string;
  isLoading?: boolean;
  disabled?: boolean;
  onClick: () => void;
  fullWidth?: boolean;
  autoFocus?: boolean;
  className?: string;
};

export default function CheckButton({
  label,
  loadingLabel,
  isLoading = false,
  disabled = false,
  onClick,
  fullWidth = false,
  autoFocus = false,
  className = "",
}: CheckButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      autoFocus={autoFocus}
      whileHover={isDisabled ? undefined : { scale: 1.03, y: -1 }}
      whileTap={isDisabled ? undefined : { scale: 0.96 }}
      transition={buttonPressTransition}
      className={`primary-button relative overflow-hidden ${fullWidth ? "w-full" : ""} ${
        isLoading ? "shadow-[0_18px_36px_rgba(63,148,70,0.34)]" : ""
      } ${className}`.trim()}
    >
      <span
        className={`inline-flex items-center gap-3 transition-opacity ${
          isLoading ? "opacity-90" : "opacity-100"
        }`}
      >
        {isLoading ? <span aria-hidden="true" className="button-spinner" /> : null}
        <span>{isLoading ? loadingLabel ?? label : label}</span>
      </span>
    </motion.button>
  );
}
