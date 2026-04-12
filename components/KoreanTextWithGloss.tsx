"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { GlossSegment } from "@/types/curriculum";

type KoreanTextWithGlossProps = {
  text: string;
  locale: "en" | "vi";
  segments?: GlossSegment[];
  textClassName?: string;
  wrapperClassName?: string;
  lang?: string;
};

function getMeaning(segment: GlossSegment, locale: "en" | "vi") {
  return locale === "vi" ? segment.meaningVi : segment.meaningEn;
}

export default function KoreanTextWithGloss({
  text,
  locale,
  segments,
  textClassName,
  wrapperClassName,
  lang = "ko",
}: KoreanTextWithGlossProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const usableSegments = useMemo(
    () =>
      (segments ?? []).filter(
        (segment) =>
          segment.textKo.trim() &&
          (segment.meaningEn.trim() || segment.meaningVi.trim()),
      ),
    [segments],
  );

  if (usableSegments.length === 0) {
    return (
      <p className={textClassName} lang={lang}>
        {text}
      </p>
    );
  }

  return (
    <div className={`korean-gloss ${wrapperClassName ?? ""}`.trim()}>
      <div
        className={`${textClassName ?? ""} korean-gloss__sentence`.trim()}
        lang={lang}
        onMouseLeave={() => setActiveIndex(null)}
      >
        {usableSegments.map((segment, index) => {
          const isActive = activeIndex === index;

          return (
            <button
              key={`${segment.textKo}-${index}`}
              type="button"
              className={`korean-gloss__token ${isActive ? "korean-gloss__token-active" : ""}`}
              onClick={() => setActiveIndex((current) => (current === index ? null : index))}
              onMouseEnter={() => setActiveIndex(index)}
              aria-expanded={isActive}
            >
              {segment.textKo}
              <AnimatePresence>
                {isActive ? (
                  <motion.span
                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                    className="korean-gloss__bubble"
                  >
                    {getMeaning(segment, locale)}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </button>
          );
        })}
      </div>
    </div>
  );
}
