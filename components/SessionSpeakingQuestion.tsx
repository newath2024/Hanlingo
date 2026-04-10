"use client";

import { useAppLocale } from "@/hooks/useAppLocale";
import { useSpeechRecognitionSupport } from "@/hooks/useHanlingoSnapshot";
import { getLocalizedText } from "@/lib/localized";
import {
  extractExpectedSpeech,
  getSpeechRecognitionConstructor,
  matchesPromptSpeech,
  type RecognitionInstance,
} from "@/lib/speech";
import type { SessionItemResult, SpeakingSessionItem } from "@/types/session";
import { useEffect, useRef, useState } from "react";

type SessionSpeakingQuestionProps = {
  item: SpeakingSessionItem;
  onResolve: (result: SessionItemResult) => void;
};

export default function SessionSpeakingQuestion({
  item,
  onResolve,
}: SessionSpeakingQuestionProps) {
  const { locale } = useAppLocale();
  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const speechSupported = useSpeechRecognitionSupport();
  const prompt = getLocalizedText(item.prompt, locale);
  const supportText = item.supportText ? getLocalizedText(item.supportText, locale) : "";

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [attemptFinished, setAttemptFinished] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const ui = (en: string, vi: string) => getLocalizedText({ en, vi }, locale);
  const blockedMicMessage = getLocalizedText(
    {
      en: "Microphone access is blocked. Allow mic permission in your browser, then try again.",
      vi: "Microphone dang bi chan. Hay cap quyen mic trong trinh duyet roi thu lai.",
    },
    locale,
  );
  const speechErrorLabel = getLocalizedText(
    {
      en: "Speech recognition error",
      vi: "Loi nhan dang giong noi",
    },
    locale,
  );

  useEffect(() => {
    const Recognition = getSpeechRecognitionConstructor();

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
          ? blockedMicMessage
          : `${speechErrorLabel}: ${event.error}`,
      );
    };

    recognition.onend = () => {
      setListening(false);
      setAttemptFinished(true);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, [blockedMicMessage, speechErrorLabel]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const expectedSpeech = extractExpectedSpeech(item.expectedSpeech);
  const matched = matchesPromptSpeech(transcript, item.expectedSpeech);

  function handleStartSpeaking() {
    if (!recognitionRef.current) {
      return;
    }

    setErrorMessage("");
    setTranscript("");
    setAttemptFinished(false);

    try {
      setListening(true);
      recognitionRef.current.start();
    } catch {
      setListening(false);
      setErrorMessage(ui("Speech recognition is already running.", "Nhan dang giong noi dang chay san."));
    }
  }

  function handleRetryCapture() {
    recognitionRef.current?.stop();
    setListening(false);
    setTranscript("");
    setAttemptFinished(false);
    setErrorMessage("");
  }

  function handleSubmitAttempt() {
    onResolve({
      status: matched ? "correct" : "incorrect",
      awardedXp: 0,
      shouldRetryLater: !matched,
      weakItemLabel: item.weakItemLabel,
      correctAnswer: item.correctAnswer,
      explanation: item.explanation,
      detail: transcript
        ? `${ui("Transcript", "Ban ghi")}: ${transcript}`
        : ui("No transcript was captured.", "Khong co ban ghi nao duoc thu."),
    });
  }

  function handleSkip() {
    recognitionRef.current?.stop();
    setListening(false);

    onResolve({
      status: speechSupported ? "skipped" : "practiced",
      awardedXp: 0,
      shouldRetryLater: false,
      weakItemLabel: item.weakItemLabel,
      correctAnswer: item.correctAnswer,
      explanation: item.explanation,
      detail: speechSupported
        ? ui(
            "You skipped the mic check for this speaking prompt.",
            "Ban da bo qua buoc kiem tra mic cho cau noi nay.",
          )
        : ui(
            "Speech recognition is unavailable, so this speaking prompt counts as practice only.",
            "Khong co nhan dang giong noi, vi vay cau noi nay chi tinh la luyen tap.",
          ),
    });
  }

  return (
    <section className="panel">
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {item.isRetry ? ui("Retry speaking", "Noi lai") : ui("Speaking", "Noi")}
          </p>
          <h3 className="font-display text-3xl text-foreground sm:text-4xl">
            {ui(
              "Say the Korean prompt out loud, then check the transcript.",
              "Doc cau tieng Han thanh tieng, roi kiem tra ban ghi.",
            )}
          </h3>
        </div>

        <article className="lesson-card space-y-5 text-center">
          <span className="pill mx-auto bg-accent-cool text-accent-strong">
            {speechSupported
              ? ui("Speech recognition ready", "San sang nhan dang giong noi")
              : ui("Practice-only fallback", "Che do luyen tap")}
          </span>

          <div className="space-y-2">
            <p className="text-base font-bold text-muted-foreground">{prompt}</p>
          </div>

          <p className="korean-display">{item.koreanText}</p>

          {supportText ? (
            <div className="rounded-[1.8rem] bg-card-soft p-5 text-left">
              <p className="text-sm font-bold text-muted-foreground">{supportText}</p>
            </div>
          ) : null}

          <p className="text-base font-bold leading-7 text-muted-foreground">
            {ui("Target scaffold", "Khung cau dich")}: {expectedSpeech}
          </p>

          <div className="rounded-[1.8rem] bg-card-soft p-5 text-left">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {ui("Transcript", "Ban ghi")}
              </p>
              <span className="pill bg-white text-muted-foreground">
                {speechSupported
                  ? listening
                    ? ui("Listening", "Dang nghe")
                    : ui("Ready", "San sang")
                  : ui("Mic unavailable", "Khong co mic")}
              </span>
            </div>
            <p className="mt-2 text-base font-bold text-foreground">
              {transcript ||
                (speechSupported
                  ? ui(
                      "Your spoken transcript will appear here.",
                      "Ban ghi giong noi cua ban se hien o day.",
                    )
                  : ui(
                      "You can still practice out loud and move on without the mic.",
                      "Ban van co the doc thanh tieng va di tiep ma khong can mic.",
                    ))}
            </p>
          </div>

          {attemptFinished ? (
            <div className={matched ? "feedback-correct" : "feedback-incorrect"}>
              {matched
                ? ui(
                    "Nice! The transcript is close enough to the target scaffold.",
                    "Tot! Ban ghi da du gan voi khung cau muc tieu.",
                  )
                : ui(
                    "Not quite yet. Submit it now to see the target again later in this run.",
                    "Chua dat. Gui bay gio de gap lai muc nay ve sau trong luot hoc.",
                  )}
            </div>
          ) : null}

          {errorMessage ? <div className="feedback-incorrect">{errorMessage}</div> : null}

          <div className="grid gap-3">
            {speechSupported ? (
              listening ? (
                <button
                  type="button"
                  onClick={() => recognitionRef.current?.stop()}
                  className="primary-button w-full"
                >
                  {ui("Stop microphone", "Dung microphone")}
                </button>
              ) : attemptFinished ? (
                <button
                  type="button"
                  onClick={handleSubmitAttempt}
                  className="primary-button w-full"
                >
                  {ui("Check speaking", "Kiem tra phan noi")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartSpeaking}
                  className="primary-button w-full"
                >
                  {ui("Start microphone", "Bat dau microphone")}
                </button>
              )
            ) : (
              <button type="button" onClick={handleSkip} className="primary-button w-full">
                {ui("Practice without mic", "Luyen tap khong can mic")}
              </button>
            )}

            {speechSupported && attemptFinished ? (
              <button
                type="button"
                onClick={handleRetryCapture}
                className="secondary-button w-full"
              >
                {ui("Retry capture", "Thu ghi lai")}
              </button>
            ) : null}

            {!listening ? (
              <button type="button" onClick={handleSkip} className="secondary-button w-full">
                {ui("No mic right now, continue", "Khong dung mic luc nay, di tiep")}
              </button>
            ) : null}
          </div>
        </article>
      </div>
    </section>
  );
}
