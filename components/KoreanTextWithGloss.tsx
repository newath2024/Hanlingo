"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { isGlossEnabled } from "@/lib/gloss";
import type { GlossQuestionType, GlossSegment } from "@/types/curriculum";

type KoreanTextWithGlossProps = {
  text: string;
  locale: "en" | "vi";
  segments?: GlossSegment[];
  sentenceMeaning?: string;
  supportsGloss?: boolean;
  questionType?: GlossQuestionType;
  showSentenceMeaning?: boolean;
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
  sentenceMeaning,
  supportsGloss,
  questionType,
  showSentenceMeaning = true,
  textClassName,
  wrapperClassName,
  lang = "ko",
}: KoreanTextWithGlossProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [sentenceOpen, setSentenceOpen] = useState(false);
  const [supportsHover, setSupportsHover] = useState(true);
  const usableSegments = useMemo(
    () =>
      (segments ?? []).filter(
        (segment) =>
          segment.textKo.trim() &&
          (segment.meaningEn.trim() || segment.meaningVi.trim()),
      ),
    [segments],
  );
  const sentenceMeaningLabel = useMemo(() => {
    if (sentenceMeaning?.trim()) {
      return sentenceMeaning.trim();
    }

    return usableSegments.map((segment) => getMeaning(segment, locale)).join(" ").trim();
  }, [locale, sentenceMeaning, usableSegments]);
  const glossAllowed = isGlossEnabled({ supportsGloss, questionType });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const syncSupportsHover = () => {
      setSupportsHover(mediaQuery.matches);

      if (!mediaQuery.matches) {
        setActiveIndex(null);
      }
    };

    syncSupportsHover();
    mediaQuery.addEventListener("change", syncSupportsHover);

    return () => {
      mediaQuery.removeEventListener("change", syncSupportsHover);
    };
  }, []);

  if (!glossAllowed || usableSegments.length === 0) {
    return (
      <p className={textClassName} lang={lang}>
        {text}
      </p>
    );
  }

  const parts: Array<
    | { kind: "text"; value: string }
    | { kind: "segment"; value: GlossSegment; index: number }
  > = [];
  let cursor = 0;

  usableSegments.forEach((segment, index) => {
    const matchIndex = text.indexOf(segment.textKo, cursor);

    if (matchIndex === -1) {
      return;
    }

    if (matchIndex > cursor) {
      parts.push({
        kind: "text",
        value: text.slice(cursor, matchIndex),
      });
    }

    parts.push({
      kind: "segment",
      value: segment,
      index,
    });
    cursor = matchIndex + segment.textKo.length;
  });

  if (cursor < text.length) {
    parts.push({
      kind: "text",
      value: text.slice(cursor),
    });
  }

  const renderedParts =
    parts.length > 0 ? parts : usableSegments.map((segment, index) => ({
      kind: "segment" as const,
      value: segment,
      index,
    }));

  return (
    <div
      className={`korean-gloss ${wrapperClassName ?? ""}`.trim()}
      onMouseEnter={supportsHover && showSentenceMeaning ? () => setSentenceOpen(true) : undefined}
      onMouseLeave={
        supportsHover
          ? () => {
              setSentenceOpen(false);
              setActiveIndex(null);
            }
          : undefined
      }
    >
      <div
        className={`${textClassName ?? ""} korean-gloss__sentence`.trim()}
        lang={lang}
        onClick={() => {
          if (!supportsHover && showSentenceMeaning) {
            setSentenceOpen((current) => !current);
            setActiveIndex(null);
          }
        }}
      >
        {renderedParts.map((part, partIndex) => {
          if (part.kind === "text") {
            return <span key={`text-${partIndex}`}>{part.value}</span>;
          }

          const isActive = activeIndex === part.index;

          return (
            <button
              key={`${part.value.textKo}-${part.index}`}
              type="button"
              className={`korean-gloss__token ${isActive ? "korean-gloss__token-active" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                setSentenceOpen(false);
                setActiveIndex((current) => (current === part.index ? null : part.index));
              }}
              onMouseEnter={() => {
                if (supportsHover) {
                  setSentenceOpen(false);
                  setActiveIndex(part.index);
                }
              }}
              onMouseLeave={() => {
                if (supportsHover) {
                  setActiveIndex(null);
                  if (showSentenceMeaning) {
                    setSentenceOpen(true);
                  }
                }
              }}
              aria-expanded={isActive}
            >
              {part.value.textKo}
              <AnimatePresence>
                {isActive ? (
                  <motion.span
                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                    className="korean-gloss__bubble"
                  >
                    {getMeaning(part.value, locale)}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {showSentenceMeaning && sentenceOpen && activeIndex === null && sentenceMeaningLabel ? (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="korean-gloss__bubble korean-gloss__bubble-sentence"
          >
            {sentenceMeaningLabel}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
