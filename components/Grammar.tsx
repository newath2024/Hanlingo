"use client";

import type { GrammarPoint } from "@/types/lesson";
import { useState } from "react";

type GrammarProps = {
  points: GrammarPoint[];
  onComplete: () => void;
};

export default function Grammar({ points, onComplete }: GrammarProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentPoint = points[currentIndex];
  const isLastPoint = currentIndex === points.length - 1;

  function handleContinue() {
    if (isLastPoint) {
      onComplete();
      return;
    }

    setCurrentIndex((previous) => previous + 1);
  }

  return (
    <section className="panel">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Grammar
            </p>
            <h3 className="font-display text-3xl text-foreground sm:text-4xl">
              Lock in one pattern before you move on.
            </h3>
          </div>
          <span className="pill bg-card-strong text-foreground">
            Rule {currentIndex + 1} of {points.length}
          </span>
        </div>

        <article className="lesson-card space-y-6">
          <div className="space-y-3">
            <span className="pill bg-accent-warm/80 text-foreground">Pattern</span>
            <h4 className="korean-display">{currentPoint.pattern}</h4>
            <p className="text-lg leading-8 text-muted-foreground">
              {currentPoint.explanation}
            </p>
          </div>

          <div className="rounded-[1.8rem] bg-card-strong p-5">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Examples
            </p>
            <ul className="mt-4 space-y-3">
              {currentPoint.examples.map((example) => (
                <li key={example} className="rounded-[1.4rem] bg-white px-4 py-3 text-xl font-bold text-foreground">
                  {example}
                </li>
              ))}
            </ul>
          </div>

          <button type="button" onClick={handleContinue} className="primary-button w-full">
            {isLastPoint ? "I got it" : "Next rule"}
          </button>
        </article>
      </div>
    </section>
  );
}

