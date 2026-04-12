"use client";

import Link from "next/link";
import { getLocalizedText } from "@/lib/localized";
import { isNodeCompleted, isNodeUnlocked } from "@/lib/units";
import type { ProgressState } from "@/lib/progress-state";
import type { AppLocale } from "@/types/app-locale";
import type { NodeDefinition, UnitDefinition } from "@/types/unit";

type UnitLessonPathProps = {
  unit: UnitDefinition;
  progress: ProgressState;
  locale: AppLocale;
  currentNodeId: string | null;
};

type PathNodeState = "locked" | "available" | "current" | "completed";

function ui(locale: AppLocale, en: string, vi: string) {
  return getLocalizedText({ en, vi }, locale);
}

function getPathNodeState(
  progress: ProgressState,
  unit: UnitDefinition,
  node: NodeDefinition,
  currentNodeId: string | null,
): PathNodeState {
  if (isNodeCompleted(progress, node.id)) {
    return "completed";
  }

  if (!isNodeUnlocked(progress, unit, node.id)) {
    return "locked";
  }

  return currentNodeId === node.id ? "current" : "available";
}

function getLessonRoleLabel(
  role: UnitDefinition["nodes"][number]["lessonRole"],
  locale: AppLocale,
) {
  if (role === "intro") {
    return ui(locale, "Textbook", "Giáo trình");
  }

  if (role === "grammar") {
    return ui(locale, "Grammar", "Ngữ pháp");
  }

  if (role === "dialogue") {
    return ui(locale, "Dialogue", "Hội thoại");
  }

  if (role === "workbook_practice") {
    return "Workbook";
  }

  return ui(locale, "Review", "Ôn tập");
}

function NodeStatusGlyph({ state }: { state: PathNodeState }) {
  if (state === "completed") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" className="h-7 w-7">
        <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (state === "locked") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-7 w-7">
        <rect x="5" y="10" width="14" height="10" rx="3" />
        <path d="M8.5 10V7.8a3.5 3.5 0 1 1 7 0V10" strokeLinecap="round" />
      </svg>
    );
  }

  return state === "current" ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7">
      <path d="M8 6.8c0-1.1 1.2-1.8 2.1-1.1l7.2 5.2c0.8 0.6 0.8 1.8 0 2.4l-7.2 5.2c-0.9 0.7-2.1 0-2.1-1.1V6.8Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <circle cx="12" cy="12" r="4.2" />
    </svg>
  );
}

function getNodeTone(state: PathNodeState) {
  if (state === "completed") {
    return {
      circle:
        "border-accent-strong bg-accent text-white shadow-[0_16px_34px_rgba(63,148,70,0.26)]",
      card: "border-accent/10 bg-success-soft/80",
      text: "text-accent-strong",
      chip: "bg-success-soft text-accent-strong",
    };
  }

  if (state === "current") {
    return {
      circle:
        "path-node-current border-[#8ce052] bg-accent text-white shadow-[0_18px_40px_rgba(63,148,70,0.28)]",
      card: "border-accent/15 bg-card-strong",
      text: "text-foreground",
      chip: "bg-accent text-white",
    };
  }

  if (state === "available") {
    return {
      circle:
        "border-accent-warm bg-card-strong text-foreground shadow-[0_16px_30px_rgba(242,212,106,0.2)]",
      card: "border-accent/10 bg-white",
      text: "text-foreground",
      chip: "bg-card-strong text-foreground",
    };
  }

  return {
    circle: "border-accent/10 bg-muted text-muted-foreground",
    card: "border-accent/10 bg-white/80 opacity-80",
    text: "text-muted-foreground",
    chip: "bg-muted text-muted-foreground",
  };
}

export default function UnitLessonPath({
  unit,
  progress,
  locale,
  currentNodeId,
}: UnitLessonPathProps) {
  const sectionsWithNodes = unit.sections.reduce<
    Array<{
      section: UnitDefinition["sections"][number];
      nodes: NodeDefinition[];
      startIndex: number;
    }>
  >((accumulator, section) => {
    const sectionNodes = section.lessonIds
      .map((lessonId) => unit.nodes.find((node) => node.lessonId === lessonId) ?? null)
      .filter((node): node is NodeDefinition => node !== null);
    const previous = accumulator[accumulator.length - 1];
    const startIndex = previous ? previous.startIndex + previous.nodes.length : 0;

    accumulator.push({
      section,
      nodes: sectionNodes,
      startIndex,
    });

    return accumulator;
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl">
      {sectionsWithNodes.map(({ section, nodes: sectionNodes, startIndex }, sectionIndex) => {
        return (
          <section key={section.sectionId} className={sectionIndex === 0 ? "" : "mt-6"}>
            <div className="mb-5 flex flex-col items-center text-center">
              <div className="h-10 w-px bg-accent/20" />
              <div className="rounded-[1.8rem] border border-accent/12 bg-white px-6 py-4 shadow-[0_12px_28px_rgba(47,92,51,0.08)]">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <span className="pill bg-accent text-white">
                    {ui(locale, "Section", "Section")} {section.order}
                  </span>
                  <span className="pill bg-card-strong text-foreground">
                    {ui(locale, `${sectionNodes.length} lessons`, `${sectionNodes.length} bài học`)}
                  </span>
                </div>
                <h3 className="mt-3 font-display text-3xl text-foreground">
                  {getLocalizedText(section.title, locale)}
                </h3>
                <p className="mt-2 max-w-xl text-sm font-bold text-muted-foreground">
                  {getLocalizedText(section.summary, locale)}
                </p>
              </div>
              <div className="h-10 w-px bg-accent/20" />
            </div>

            <div className="space-y-0">
              {sectionNodes.map((node, nodeIndex) => {
                const state = getPathNodeState(progress, unit, node, currentNodeId);
                const tone = getNodeTone(state);
                const alignsLeft = (startIndex + nodeIndex) % 2 === 0;
                const hasConnector = nodeIndex < sectionNodes.length - 1;

                const circle = (
                  <div
                    className={`path-node-shell group relative flex w-[10.75rem] flex-col items-center gap-3 transition hover:scale-[1.03] ${
                      alignsLeft ? "items-start" : "items-end"
                    }`}
                  >
                    {state === "current" ? (
                      <span className="rounded-full bg-[#18261d] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-white shadow-[0_10px_24px_rgba(20,35,27,0.18)]">
                        {ui(locale, "Start lesson", "Vào bài")}
                      </span>
                    ) : null}

                    {state === "locked" ? (
                      <div
                        className={`path-node-circle ${tone.circle}`}
                        aria-label={ui(locale, "Locked lesson", "Bài đã khóa")}
                      >
                        <NodeStatusGlyph state={state} />
                      </div>
                    ) : (
                      <Link
                        href={`/node/${node.id}`}
                        className={`path-node-circle ${tone.circle}`}
                        aria-current={state === "current" ? "step" : undefined}
                        aria-label={ui(
                          locale,
                          `${state === "current" ? "Current" : state === "completed" ? "Completed" : "Available"} lesson: ${getLocalizedText(node.title, locale)}`,
                          `${state === "current" ? "Bài hiện tại" : state === "completed" ? "Bài đã xong" : "Bài có thể học"}: ${getLocalizedText(node.title, locale)}`,
                        )}
                      >
                        <NodeStatusGlyph state={state} />
                      </Link>
                    )}

                    <div className={`w-full rounded-[1.5rem] border px-4 py-3 shadow-[0_10px_22px_rgba(47,92,51,0.06)] ${tone.card}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`pill ${tone.chip}`}>
                          {ui(locale, "Lesson", "Bài")} {node.order}
                        </span>
                        <span className="pill bg-white text-muted-foreground">
                          {getLessonRoleLabel(node.lessonRole, locale)}
                        </span>
                      </div>
                      <p className={`mt-3 text-base font-extrabold leading-tight ${tone.text}`}>
                        {getLocalizedText(node.title, locale)}
                      </p>
                    </div>
                  </div>
                );

                return (
                  <div key={node.id} className="relative min-h-[12rem]">
                    {hasConnector ? (
                      <svg
                        viewBox="0 0 320 116"
                        className="pointer-events-none absolute left-1/2 top-[4.6rem] h-[8rem] w-[78%] -translate-x-1/2"
                        preserveAspectRatio="none"
                      >
                        <path
                          d={
                            alignsLeft
                              ? "M 82 0 C 82 46, 238 46, 238 116"
                              : "M 238 0 C 238 46, 82 46, 82 116"
                          }
                          fill="none"
                          stroke="rgba(88, 185, 93, 0.24)"
                          strokeWidth="8"
                          strokeLinecap="round"
                        />
                      </svg>
                    ) : null}

                    <div
                      className={`relative z-10 flex ${
                        alignsLeft ? "justify-start" : "justify-end"
                      } px-2 sm:px-8`}
                    >
                      {circle}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
