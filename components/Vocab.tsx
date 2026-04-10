"use client";

import { scheduleNextReview, type ReviewRating } from "@/lib/review";
import { getReviewForCard, saveReviewForCard } from "@/lib/storage";
import type { VocabEntry } from "@/types/lesson";
import { useState } from "react";

type VocabProps = {
  lessonId: string;
  cards: VocabEntry[];
  onComplete: () => void;
};

const ratingLabels: Record<ReviewRating, string> = {
  again: "Again",
  good: "Good",
  easy: "Easy",
};

export default function Vocab({ lessonId, cards, onComplete }: VocabProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [ratedCount, setRatedCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [lastRating, setLastRating] = useState<string | null>(null);

  const currentCard = cards[currentIndex];

  function handleRate(rating: ReviewRating) {
    if (!currentCard || !revealed) {
      return;
    }

    const nextReview = scheduleNextReview(
      getReviewForCard(lessonId, currentCard.word),
      rating,
    );

    saveReviewForCard(lessonId, currentCard.word, nextReview);

    const nextRatedCount = ratedCount + 1;
    setRatedCount(nextRatedCount);
    setLastRating(ratingLabels[rating]);

    if (nextRatedCount === cards.length) {
      setFinished(true);
      onComplete();
      return;
    }

    setCurrentIndex((previous) => previous + 1);
    setRevealed(false);
  }

  if (finished) {
    return (
      <section className="panel">
        <div className="xp-reward-card space-y-4">
          <span className="pill mx-auto bg-success-soft text-accent-strong">
            Flashcards cleared
          </span>
          <h3 className="font-display text-3xl text-foreground">
            Nice. Every vocab card is now scheduled.
          </h3>
          <p className="text-base font-bold text-muted-foreground">
            Your ratings were saved locally for the next review round.
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
              Vocab
            </p>
            <h3 className="font-display text-3xl text-foreground sm:text-4xl">
              Flip the card, then grade your recall.
            </h3>
          </div>
          <span className="pill bg-card-strong text-foreground">
            Card {currentIndex + 1} of {cards.length}
          </span>
        </div>

        <article className="lesson-card space-y-5">
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="flex min-h-[320px] w-full flex-col justify-between rounded-[2.2rem] bg-card-soft p-7 text-left shadow-[0_16px_34px_rgba(47,92,51,0.1)] transition hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between gap-4">
              <span className="pill bg-accent-warm/70 text-foreground">Flashcard</span>
              <span className="text-sm font-bold text-muted-foreground">
                {revealed ? "Meaning unlocked" : "Tap card to reveal"}
              </span>
            </div>

            <div className="space-y-4 text-center">
              <p className="korean-display">{currentCard.word}</p>
              <p className="text-lg font-bold text-muted-foreground">
                {revealed ? currentCard.meaning : "Think first. Then tap to check yourself."}
              </p>
            </div>

            <div className="text-center text-sm font-bold text-muted-foreground">
              {lastRating
                ? `Last card rated: ${lastRating}`
                : "Reveal first, then choose Again, Good, or Easy."}
            </div>
          </button>

          {revealed ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => handleRate("again")}
                className="secondary-button border-danger/20 text-danger hover:border-danger/40 hover:bg-danger-soft"
              >
                Again
              </button>
              <button
                type="button"
                onClick={() => handleRate("good")}
                className="secondary-button"
              >
                Good
              </button>
              <button
                type="button"
                onClick={() => handleRate("easy")}
                className="primary-button"
              >
                Easy
              </button>
            </div>
          ) : (
            <div className="rounded-[1.6rem] bg-card-strong px-4 py-3 text-center text-sm font-bold text-muted-foreground">
              One action now: tap the flashcard to reveal the meaning.
            </div>
          )}

          <p className="text-sm font-bold text-muted-foreground">
            Reviewed {ratedCount} of {cards.length} cards
          </p>
        </article>
      </div>
    </section>
  );
}

