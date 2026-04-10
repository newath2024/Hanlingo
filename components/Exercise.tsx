"use client";

import type { ExerciseItem } from "@/types/lesson";
import { useState } from "react";

type ExerciseProps = {
  exercises: ExerciseItem[];
  onComplete: (score: number) => void;
};

function normalizeAnswer(value: string) {
  return value.trim().toLowerCase();
}

function getExplanationText(exercise: ExerciseItem) {
  if (exercise.type === "multiple_choice") {
    return `"${exercise.answer}" is the choice that matches this prompt best.`;
  }

  return `This blank is completed with "${exercise.answer}" in the target phrase.`;
}

export default function Exercise({ exercises, onComplete }: ExerciseProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const currentExercise = exercises[currentIndex];

  function handleCheck() {
    if (submitted) {
      return;
    }

    const userAnswer =
      currentExercise.type === "multiple_choice" ? selectedOption : inputValue;

    if (!userAnswer.trim()) {
      return;
    }

    setWasCorrect(
      normalizeAnswer(userAnswer) === normalizeAnswer(currentExercise.answer),
    );
    setSubmitted(true);
  }

  function handleNextQuestion() {
    if (wasCorrect === null) {
      return;
    }

    const nextScore = score + (wasCorrect ? 1 : 0);
    setScore(nextScore);

    if (currentIndex === exercises.length - 1) {
      setFinished(true);
      onComplete(nextScore);
      return;
    }

    setCurrentIndex((previous) => previous + 1);
    setSelectedOption("");
    setInputValue("");
    setSubmitted(false);
    setWasCorrect(null);
  }

  if (finished) {
    return (
      <section className="panel">
        <div className="xp-reward-card space-y-4">
          <span className="pill mx-auto bg-success-soft text-accent-strong">
            Exercises complete
          </span>
          <h3 className="font-display text-3xl text-foreground">
            You scored {score} / {exercises.length}
          </h3>
          <p className="text-base font-bold text-muted-foreground">
            Strong finish. Your answers are locked for this run.
          </p>
        </div>
      </section>
    );
  }

  const canCheck =
    currentExercise.type === "multiple_choice"
      ? Boolean(selectedOption)
      : Boolean(inputValue.trim());

  return (
    <section className="panel">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Exercises
            </p>
            <h3 className="font-display text-3xl text-foreground sm:text-4xl">
              Pick one answer, check it, then move on.
            </h3>
          </div>
          <span className="pill bg-card-strong text-foreground">
            Question {currentIndex + 1} of {exercises.length}
          </span>
        </div>

        <article className="lesson-card space-y-5">
          <div className="rounded-[2rem] bg-card-soft p-6 shadow-[0_14px_30px_rgba(47,92,51,0.08)]">
            <p className="text-3xl font-extrabold leading-tight text-foreground">
              {currentExercise.question}
            </p>

            {currentExercise.type === "multiple_choice" ? (
              <div className="mt-5 grid gap-3">
                {currentExercise.options.map((option) => {
                  const isSelected = selectedOption === option;
                  const isCorrectAnswer = currentExercise.answer === option;
                  const isIncorrectSelection =
                    submitted && isSelected && !isCorrectAnswer;

                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={submitted}
                      onClick={() => setSelectedOption(option)}
                      className={`choice-button ${
                        isSelected ? "border-accent bg-card-strong" : ""
                      } ${
                        submitted && isCorrectAnswer
                          ? "border-accent bg-success-soft text-accent-strong"
                          : ""
                      } ${
                        isIncorrectSelection ? "border-danger bg-danger-soft text-danger" : ""
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-5">
                <input
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  disabled={submitted}
                  placeholder="Type your answer"
                  className={`w-full rounded-[1.8rem] border bg-white px-5 py-4 text-xl font-bold text-foreground outline-none transition ${
                    submitted && wasCorrect === false
                      ? "border-danger bg-danger-soft/40"
                      : submitted && wasCorrect === true
                        ? "border-accent bg-success-soft/50"
                        : "border-accent/15"
                  }`}
                />
              </div>
            )}
          </div>

          {submitted && wasCorrect !== null ? (
            wasCorrect ? (
              <div className="feedback-correct space-y-2">
                <p>Correct. Nice work.</p>
                <p className="font-semibold text-accent-strong/90">
                  {getExplanationText(currentExercise)}
                </p>
              </div>
            ) : (
              <div className="feedback-incorrect space-y-2">
                <p>Wrong this time. Correct answer: {currentExercise.answer}</p>
                <p className="font-semibold text-danger/90">
                  {getExplanationText(currentExercise)}
                </p>
              </div>
            )
          ) : null}

          {!submitted ? (
            <button
              type="button"
              onClick={handleCheck}
              disabled={!canCheck}
              className="primary-button w-full"
            >
              Check answer
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNextQuestion}
              className="primary-button w-full"
            >
              {currentIndex === exercises.length - 1 ? "Finish exercises" : "Continue"}
            </button>
          )}
        </article>
      </div>
    </section>
  );
}

