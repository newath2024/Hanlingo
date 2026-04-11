"use client";

export const easeOut = [0.22, 1, 0.36, 1] as const;
export const easeInOut = [0.4, 0, 0.2, 1] as const;

export const motionDurations = {
  fast: 0.22,
  medium: 0.28,
  feedback: 0.32,
} as const;

export const containerVariants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      duration: motionDurations.fast,
      ease: easeOut,
      staggerChildren: 0.055,
      delayChildren: 0.03,
    },
  },
} as const;

export const itemVariants = {
  hidden: {
    opacity: 0,
    y: 10,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.24,
      ease: easeOut,
    },
  },
} as const;

export const questionVariants = {
  hidden: {
    opacity: 0,
    y: 16,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: motionDurations.medium,
      ease: easeOut,
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: {
      duration: motionDurations.fast,
      ease: easeInOut,
    },
  },
} as const;

export const feedbackVariants = {
  hidden: {
    opacity: 0,
    y: 28,
    scale: 0.9,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: motionDurations.feedback,
      ease: easeOut,
    },
  },
  exit: {
    opacity: 0,
    y: 16,
    scale: 0.96,
    transition: {
      duration: motionDurations.fast,
      ease: easeInOut,
    },
  },
} as const;

export const chipTransition = {
  type: "spring",
  stiffness: 560,
  damping: 34,
  mass: 0.9,
} as const;

export const shakeAnimation = {
  x: [0, -10, 10, -8, 8, -4, 4, 0],
  transition: {
    duration: 0.26,
    ease: easeInOut,
  },
};

export const buttonPressTransition = {
  duration: motionDurations.fast,
  ease: easeOut,
} as const;
