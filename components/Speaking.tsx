"use client";

import { useSpeechRecognitionSupport } from "@/hooks/useHanlingoSnapshot";
import type { SpeakingPrompt } from "@/types/lesson";
import { useEffect, useRef, useState } from "react";

type RecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type RecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type RecognitionConstructor = new () => RecognitionInstance;

type SpeakingProps = {
  prompts: SpeakingPrompt[];
  onComplete: (practicedCount: number) => void;
};

export default function Speaking({ prompts, onComplete }: SpeakingProps) {
  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const speechSupported = useSpeechRecognitionSupport();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [finished, setFinished] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const speechWindow = window as Window & {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };

    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "ko-KR";

    recognition.onresult = (event) => {
      let nextTranscript = "";

      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        nextTranscript += result[0]?.transcript ?? "";
      }

      setTranscript(nextTranscript.trim());
    };

    recognition.onerror = (event) => {
      setListening(false);
      setErrorMessage(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access is blocked. Allow mic permission in your browser, then try again."
          : `Speech recognition error: ${event.error}`,
      );
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, [speechSupported]);

  function handleStartSpeaking() {
    if (!recognitionRef.current) {
      return;
    }

    setErrorMessage("");
    setTranscript("");

    try {
      setListening(true);
      recognitionRef.current.start();
    } catch {
      setListening(false);
      setErrorMessage("Speech recognition is already running.");
    }
  }

  function handleMarkPracticed() {
    const nextCount = currentIndex + 1;

    if (currentIndex === prompts.length - 1) {
      setFinished(true);
      setListening(false);
      recognitionRef.current?.stop();
      onComplete(nextCount);
      return;
    }

    setCurrentIndex((previous) => previous + 1);
    setListening(false);
    recognitionRef.current?.stop();
    setTranscript("");
    setErrorMessage("");
  }

  if (finished) {
    return (
      <section className="panel">
        <div className="xp-reward-card space-y-4">
          <span className="pill mx-auto bg-success-soft text-accent-strong">
            Speaking complete
          </span>
          <h3 className="font-display text-3xl text-foreground">
            You practiced every speaking prompt.
          </h3>
          <p className="text-base font-bold text-muted-foreground">
            Manual practice still counts even when browser speech tools are missing.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Speaking
            </p>
            <h3 className="font-display text-3xl text-foreground sm:text-4xl">
              Practice the prompt, then confirm and move on.
            </h3>
          </div>
          <span className="pill bg-card-strong text-foreground">
            Prompt {currentIndex + 1} of {prompts.length}
          </span>
        </div>

        <article className="lesson-card space-y-5 text-center">
          <span className="pill mx-auto bg-accent-cool text-accent-strong">
            {speechSupported ? "Speech recognition ready" : "Manual practice mode"}
          </span>
          <p className="korean-display">{prompts[currentIndex].prompt}</p>
          <p className="text-base font-bold leading-7 text-muted-foreground">
            {speechSupported
              ? "Use Start speaking if you want a quick transcript, then finish the prompt."
              : "Read the line aloud on your own, then tap the main button below."}
          </p>

          {speechSupported && !listening ? (
            <div className="rounded-[1.6rem] bg-accent-cool px-4 py-3 text-left text-sm font-bold text-accent-strong">
              Tap the microphone button below and allow browser mic access if you want live speech capture.
            </div>
          ) : null}

          {speechSupported ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleStartSpeaking}
                disabled={listening}
                className="secondary-button w-full"
              >
                {listening ? "Microphone is listening..." : "Start microphone"}
              </button>

              <div className="rounded-[1.8rem] bg-card-soft p-5 text-left">
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  Transcript
                </p>
                <p className="mt-2 text-base font-bold text-foreground">
                  {transcript || "Your spoken transcript will appear here."}
                </p>
              </div>
            </div>
          ) : null}

          {errorMessage ? <div className="feedback-incorrect">{errorMessage}</div> : null}

          <button type="button" onClick={handleMarkPracticed} className="primary-button w-full">
            {currentIndex === prompts.length - 1
              ? "Finish speaking step"
              : "I finished prompt"}
          </button>
        </article>
      </div>
    </section>
  );
}
