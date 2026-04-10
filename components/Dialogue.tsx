"use client";

import type { DialogueLine } from "@/types/lesson";
import { useEffect, useRef, useState } from "react";

type DialogueProps = {
  lines: DialogueLine[];
  onComplete: () => void;
};

export default function Dialogue({ lines, onComplete }: DialogueProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const mockAudioTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentLine = lines[currentIndex];
  const isLastLine = currentIndex === lines.length - 1;
  const isRightBubble = currentIndex % 2 === 1;

  useEffect(() => {
    return () => {
      if (mockAudioTimeoutRef.current) {
        window.clearTimeout(mockAudioTimeoutRef.current);
      }

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function handlePlayAudio() {
    if (typeof window === "undefined") {
      return;
    }

    if ("speechSynthesis" in window && "SpeechSynthesisUtterance" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(currentLine.text);
      utterance.lang = "ko-KR";
      utterance.rate = 0.9;
      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);
      window.speechSynthesis.speak(utterance);
      return;
    }

    setIsPlaying(true);

    if (mockAudioTimeoutRef.current) {
      clearTimeout(mockAudioTimeoutRef.current);
    }

    mockAudioTimeoutRef.current = setTimeout(() => {
      setIsPlaying(false);
    }, 900);
  }

  function handlePrimaryAction() {
    if (!revealed) {
      setRevealed(true);
      return;
    }

    if (isLastLine) {
      onComplete();
      return;
    }

    setCurrentIndex((previous) => previous + 1);
    setRevealed(false);
    setIsPlaying(false);
  }

  return (
    <section className="panel">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Dialogue
            </p>
            <h3 className="font-display text-3xl text-foreground sm:text-4xl">
              Follow the conversation one line at a time.
            </h3>
          </div>
          <span className="pill bg-card-strong text-foreground">
            Line {currentIndex + 1} of {lines.length}
          </span>
        </div>

        <div className="lesson-card space-y-5 bg-card-soft">
          <div className="flex items-center justify-between gap-4">
            <span className="pill bg-white text-muted-foreground">
              {revealed ? "Translation revealed" : "Tap to reveal translation"}
            </span>
            <button
              type="button"
              onClick={handlePlayAudio}
              className="secondary-button px-4 py-2.5 text-sm"
            >
              {isPlaying ? "Playing..." : "Play audio"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!revealed) {
                setRevealed(true);
              }
            }}
            className={`chat-bubble w-full ${
              isRightBubble ? "chat-bubble-right" : "chat-bubble-left"
            }`}
          >
            <div className="space-y-4">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-accent-strong">
                {currentLine.speaker}
              </p>
              <p className="korean-display">{currentLine.text}</p>
              <div
                className={`rounded-[1.7rem] px-4 py-3 text-base font-bold transition ${
                  revealed
                    ? "bg-white/90 text-muted-foreground"
                    : "bg-white/65 text-muted-foreground/70"
                }`}
              >
                {revealed
                  ? currentLine.translation
                  : "Tap this bubble to reveal the translation."}
              </div>
            </div>
          </button>

          <div className="flex items-center justify-center gap-2">
            {lines.map((line, index) => (
              <span
                key={`${line.speaker}-${index}`}
                className={`h-2.5 rounded-full transition-all ${
                  index === currentIndex
                    ? "w-10 bg-accent"
                    : index < currentIndex
                      ? "w-6 bg-accent/40"
                      : "w-2.5 bg-accent/20"
                }`}
              />
            ))}
          </div>

          <button type="button" onClick={handlePrimaryAction} className="primary-button w-full">
            {!revealed
              ? "Reveal translation"
              : isLastLine
                ? "Finish dialogue"
                : "Next sentence"}
          </button>
        </div>
      </div>
    </section>
  );
}
