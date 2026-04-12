"use client";

import { useAppLocale } from "@/hooks/useAppLocale";
import { useSpeechRecognitionSupport } from "@/hooks/useHanlingoSnapshot";
import { getLocalizedText } from "@/lib/localized";
import { containerVariants, itemVariants } from "@/lib/practice-motion";
import {
  DEFAULT_KOREAN_SPEECH_LANG,
  configureKoreanSpeechRecognition,
  createSpeechChunks,
  evaluateSpeechChunks,
  extractExpectedSpeech,
  getChunkAccuracy,
  getSpeechRecognitionConstructor,
  matchesPromptSpeech,
  speakKoreanText,
  startKoreanSpeechRecognition,
  type RecognitionInstance,
  type SpeechChunk,
} from "@/lib/speech";
import { motion } from "framer-motion";
import type {
  ListenRepeatSessionItem,
  SessionItemResult,
  SpeakingSessionItem,
} from "@/types/session";
import { useEffect, useMemo, useRef, useState } from "react";
import CheckButton from "./CheckButton";

type SessionSpeakingQuestionProps = {
  item: SpeakingSessionItem | ListenRepeatSessionItem;
  onResolve: (result: SessionItemResult) => void;
};

function createInitialChunks(item: ListenRepeatSessionItem | SpeakingSessionItem) {
  if (item.type !== "listen_repeat") {
    return [] as SpeechChunk[];
  }

  return createSpeechChunks(item.expectedChunks.join(" "));
}

export default function SessionSpeakingQuestion({
  item,
  onResolve,
}: SessionSpeakingQuestionProps) {
  const { locale } = useAppLocale();
  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const speechSupported = useSpeechRecognitionSupport();
  const prompt = getLocalizedText(item.prompt, locale);
  const supportText = item.supportText ? getLocalizedText(item.supportText, locale) : "";
  const isListenRepeat = item.type === "listen_repeat";

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [attemptFinished, setAttemptFinished] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [chunkState, setChunkState] = useState<SpeechChunk[]>(createInitialChunks(item));
  const [isPlayingModel, setIsPlayingModel] = useState(false);

  const ui = (en: string, vi: string) => getLocalizedText({ en, vi }, locale);
  const blockedMicMessage = getLocalizedText(
    {
      en: "Microphone access is blocked. Allow mic permission in your browser, then try again.",
      vi: "Microphone đang bị chặn. Hãy cấp quyền mic trong trình duyệt rồi thử lại.",
    },
    locale,
  );
  const speechErrorLabel = getLocalizedText(
    {
      en: "Speech recognition error",
      vi: "Lỗi nhận dạng giọng nói",
    },
    locale,
  );

  function resetCaptureState() {
    setTranscript("");
    setAttemptFinished(false);
    setErrorMessage("");
    setChunkState(createInitialChunks(item));
  }

  useEffect(() => {
    const Recognition = getSpeechRecognitionConstructor();

    if (!Recognition) {
      return;
    }

    const recognition = new Recognition();
    configureKoreanSpeechRecognition(recognition);

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

  useEffect(() => {
    setChunkState(createInitialChunks(item));
  }, [item]);

  useEffect(() => {
    if (!isListenRepeat) {
      return;
    }

    setChunkState((previous) =>
      evaluateSpeechChunks(
        previous.length ? previous : createInitialChunks(item),
        transcript,
        attemptFinished,
      ),
    );
  }, [attemptFinished, isListenRepeat, item, transcript]);

  const expectedSpeech = useMemo(
    () => (isListenRepeat ? item.text : extractExpectedSpeech(item.expectedSpeech)),
    [isListenRepeat, item],
  );
  const matched = useMemo(() => {
    if (!isListenRepeat) {
      return matchesPromptSpeech(transcript, item.expectedSpeech);
    }

    const accuracy = getChunkAccuracy(chunkState);
    const requiredRatio =
      item.expectedChunks.length > 0
        ? item.passRule.min_correct_chunks / item.expectedChunks.length
        : 1;

    return accuracy >= requiredRatio;
  }, [chunkState, isListenRepeat, item, transcript]);

  function handlePlayModelAudio() {
    const playbackText = isListenRepeat ? item.ttsText : item.koreanText;

    if (!playbackText) {
      return;
    }

    speakKoreanText(playbackText, {
      rate: 0.88,
      onStart: () => setIsPlayingModel(true),
      onEnd: () => setIsPlayingModel(false),
      onError: () => setIsPlayingModel(false),
    });
  }

  function handleStartSpeaking() {
    if (!recognitionRef.current) {
      setListening(false);
      setAttemptFinished(false);
      setErrorMessage(ui("Speech recognition is unavailable here.", "Nhận dạng giọng nói không khả dụng ở đây."));
      return;
    }

    resetCaptureState();

    try {
      setListening(true);
      startKoreanSpeechRecognition(recognitionRef.current);
    } catch {
      setListening(false);
      setErrorMessage(ui("Speech recognition is already running.", "Nhận dạng giọng nói đang chạy sẵn."));
    }
  }

  function handleRetryCapture() {
    handleStartSpeaking();
  }

  function handleSubmitAttempt() {
    onResolve({
      status: matched ? "correct" : "incorrect",
      awardedXp: 0,
      shouldRetryLater: !matched,
      weakItemLabel: item.weakItemLabel,
      userAnswer: transcript,
      answerTokens: transcript.split(/\s+/).filter(Boolean),
      correctAnswer: item.correctAnswer,
      explanation: item.explanation,
      detail: transcript
        ? `${ui("Transcript", "Bản ghi")}: ${transcript}`
        : ui("No transcript was captured.", "Không có bản ghi nào được thu."),
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
      userAnswer: transcript,
      answerTokens: transcript.split(/\s+/).filter(Boolean),
      correctAnswer: item.correctAnswer,
      explanation: item.explanation,
      detail: speechSupported
        ? ui(
            "You skipped the mic check for this speaking prompt.",
            "Bạn đã bỏ qua bước kiểm tra mic cho câu nói này.",
          )
        : ui(
            "Speech recognition is unavailable, so this speaking prompt counts as practice only.",
            "Không có nhận dạng giọng nói, vì vậy câu nói này chỉ tính là luyện tập.",
          ),
    });
  }

  return (
    <motion.section
      className="panel"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div className="space-y-6" variants={containerVariants}>
        <motion.div className="space-y-2" variants={itemVariants}>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {item.isRetry
              ? isListenRepeat
                ? ui("Retry listen & repeat", "Nghe và lặp lại")
                : ui("Retry speaking", "Nói lại")
              : isListenRepeat
                ? ui("Listen & Repeat", "Nghe và lặp lại")
                : ui("Speaking", "Nói")}
          </p>
          <h3 className="font-display text-3xl text-foreground sm:text-4xl">
            {isListenRepeat
              ? ui(
                  "Play the model audio, then repeat the Korean chunks out loud.",
                  "Phát audio mẫu, rồi lặp lại các cụm tiếng Hàn thành tiếng.",
                )
              : ui(
                  "Say the Korean prompt out loud, then check the transcript.",
                  "Đọc câu tiếng Hàn thành tiếng, rồi kiểm tra bản ghi.",
                )}
          </h3>
        </motion.div>

        <motion.article className="lesson-card space-y-5 text-center" variants={itemVariants}>
          <span className="pill mx-auto bg-accent-cool text-accent-strong">
            {speechSupported
              ? ui("Speech recognition ready", "Sẵn sàng nhận dạng giọng nói")
              : ui("Practice-only fallback", "Chế độ luyện tập")}
          </span>

          <div className="space-y-2">
            <p className="text-base font-bold text-muted-foreground">{prompt}</p>
          </div>

          <p className="korean-display" lang={DEFAULT_KOREAN_SPEECH_LANG}>
            {isListenRepeat ? item.text : item.koreanText}
          </p>

          {supportText ? (
            <div className="rounded-[1.8rem] bg-card-soft p-5 text-left">
              <p className="text-sm font-bold text-muted-foreground">{supportText}</p>
            </div>
          ) : null}

          <div className="flex justify-center">
            <button type="button" onClick={handlePlayModelAudio} className="secondary-button">
              {isPlayingModel
                ? ui("Playing model...", "Đang phát mẫu...")
                : ui("Play model audio", "Phát audio mẫu")}
            </button>
          </div>

          {isListenRepeat ? (
            <div className="rounded-[1.8rem] bg-card-soft p-5 text-left">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {ui("Target chunks", "Cụm mục tiêu")}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {chunkState.map((chunk) => (
                  <span
                    key={`${item.id}-${chunk.displayText}`}
                    className={`pill ${
                      chunk.status === "correct"
                        ? "bg-success-soft text-accent-strong"
                        : chunk.status === "incorrect"
                          ? "bg-danger-soft text-danger"
                          : "bg-white text-muted-foreground"
                    }`}
                  >
                    {chunk.displayText}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-sm font-bold text-muted-foreground">
                {ui("Pass rule", "Điều kiện đạt")}: {item.passRule.min_correct_chunks}/
                {item.expectedChunks.length} {ui("chunks", "cụm")}
              </p>
            </div>
          ) : (
            <p className="text-base font-bold leading-7 text-muted-foreground">
              {ui("Target scaffold", "Khung câu đích")}: {expectedSpeech}
            </p>
          )}

          <div className="rounded-[1.8rem] bg-card-soft p-5 text-left">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {ui("Transcript", "Bản ghi")}
              </p>
              <span className="pill bg-white text-muted-foreground">
                {speechSupported
                  ? listening
                    ? ui("Listening", "Đang nghe")
                    : ui("Ready", "Sẵn sàng")
                  : ui("Mic unavailable", "Không có mic")}
              </span>
            </div>
            <p className="mt-2 text-base font-bold text-foreground">
              {transcript ||
                (speechSupported
                  ? ui(
                      "Your spoken transcript will appear here.",
                      "Bản ghi giọng nói của bạn sẽ hiện ở đây.",
                    )
                  : ui(
                      "You can still practice out loud and move on without the mic.",
                      "Bạn vẫn có thể đọc thành tiếng và đi tiếp mà không cần mic.",
                    ))}
            </p>
          </div>

          {attemptFinished ? (
            <div className={matched ? "feedback-correct" : "feedback-incorrect"}>
              {matched
                ? isListenRepeat
                  ? ui(
                      "Nice! You matched enough chunks from the target sentence.",
                      "Tốt! Bạn đã khớp đủ số cụm của câu mục tiêu.",
                    )
                  : ui(
                      "Nice! The transcript is close enough to the target scaffold.",
                      "Tốt! Bản ghi đã đủ gần với khung câu mục tiêu.",
                    )
                : isListenRepeat
                  ? ui(
                      "Not enough chunks matched yet. Submit it now to retry later in this run.",
                      "Số cụm khớp chưa đủ. Gửi bây giờ để gặp lại mục này về sau trong lượt học.",
                    )
                  : ui(
                      "Not quite yet. Submit it now to see the target again later in this run.",
                      "Chưa đạt. Gửi bây giờ để gặp lại mục này về sau trong lượt học.",
                    )}
            </div>
          ) : null}

          {errorMessage ? <div className="feedback-incorrect">{errorMessage}</div> : null}

          <div className="grid gap-3">
            {speechSupported ? (
              listening ? (
                <CheckButton
                  label={ui("Stop microphone", "Dừng microphone")}
                  onClick={() => recognitionRef.current?.stop()}
                  fullWidth
                />
              ) : attemptFinished ? (
                <CheckButton
                  label={
                    isListenRepeat
                      ? ui("Check repetition", "Kiểm tra lặp lại")
                      : ui("Check speaking", "Kiểm tra phần nói")
                  }
                  onClick={handleSubmitAttempt}
                  fullWidth
                />
              ) : (
                <CheckButton
                  label={ui("Start microphone", "Bắt đầu microphone")}
                  onClick={handleStartSpeaking}
                  fullWidth
                />
              )
            ) : (
              <CheckButton
                label={ui("Practice without mic", "Luyện tập không cần mic")}
                onClick={handleSkip}
                fullWidth
              />
            )}

            {speechSupported && attemptFinished ? (
              <button
                type="button"
                onClick={handleRetryCapture}
                className="secondary-button w-full"
              >
                {ui("Retry capture", "Thử ghi lại")}
              </button>
            ) : null}

            {!listening ? (
              <button type="button" onClick={handleSkip} className="secondary-button w-full">
                {ui("No mic right now, continue", "Không dùng mic lúc này, đi tiếp")}
              </button>
            ) : null}
          </div>
        </motion.article>
      </motion.div>
    </motion.section>
  );
}
