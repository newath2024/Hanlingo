"use client";

import { useAppLocale } from "@/hooks/useAppLocale";
import { useHanlingoSnapshot } from "@/hooks/useHanlingoSnapshot";
import { getLocalizedText } from "@/lib/localized";
import {
  getCompletedNodeCount,
  getCurrentNode,
  getNodeRun,
  getNodeState,
  getUnitWords,
  isUnitCompleted,
} from "@/lib/units";
import type { AppLocale } from "@/types/app-locale";
import type { UnitDefinition } from "@/types/unit";
import Link from "next/link";

type UnitScreenProps = {
  unit: UnitDefinition;
};

function ui(locale: AppLocale, en: string, vi: string) {
  return getLocalizedText({ en, vi }, locale);
}

function getNodeStateTone(state: ReturnType<typeof getNodeState>, weak: boolean) {
  if (state === "completed" && weak) {
    return "border-danger/20 bg-danger-soft";
  }

  if (state === "completed") {
    return "border-accent/15 bg-success-soft/60";
  }

  if (state === "current") {
    return "border-accent/20 bg-card-strong";
  }

  return "border-accent/10 bg-white/70 opacity-75";
}

function getLessonRoleLabel(
  role: UnitDefinition["nodes"][number]["lessonRole"],
  locale: AppLocale,
) {
  if (role === "intro") {
    return ui(locale, "Textbook", "Giao trinh");
  }

  if (role === "grammar") {
    return ui(locale, "Grammar", "Ngu phap");
  }

  if (role === "dialogue") {
    return ui(locale, "Dialogue", "Hoi thoai");
  }

  if (role === "workbook_practice") {
    return "Workbook";
  }

  return ui(locale, "Review", "On tap");
}

export default function UnitScreen({ unit }: UnitScreenProps) {
  const { locale } = useAppLocale();
  const { progress, dueReviews, isLoading, error } = useHanlingoSnapshot(
    unit.id,
    getUnitWords(unit),
  );
  const completedNodeCount = getCompletedNodeCount(progress, unit);
  const currentNode = getCurrentNode(unit, progress);
  const unitCompleted = isUnitCompleted(progress, unit.id);
  const overallProgress = (completedNodeCount / unit.nodes.length) * 100;
  const workbookPracticeLessons = unit.nodes.filter(
    (node) => node.lessonRole === "workbook_practice",
  ).length;
  const workbookCoverageCount = new Set(
    unit.nodes.flatMap((node) => node.sourceExerciseIds),
  ).size;
  const title = getLocalizedText(unit.title, locale);
  const subtitle = getLocalizedText(unit.subtitle, locale);

  return (
    <main className="page-shell">
      <section className="panel max-w-4xl overflow-hidden">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-4">
            <span className="pill bg-accent-warm/70 text-foreground">
              {ui(locale, "Hanlingo Unit Path", "Lo trinh unit Hanlingo")}
            </span>
            <div className="space-y-3">
              <h1 className="font-display text-4xl leading-tight text-foreground sm:text-6xl">
                {ui(locale, "Unit", "Unit")} {unit.unitNumber}: {title}
              </h1>
              <p className="max-w-2xl text-lg text-muted-foreground">{subtitle}</p>
            </div>
          </div>

          <div className="grid min-w-[220px] grid-cols-2 gap-3 self-stretch sm:max-w-[300px]">
            <div className="rounded-[1.6rem] bg-card-strong p-4">
              <p className="text-sm font-bold text-muted-foreground">
                {ui(locale, "Total XP", "Tong XP")}
              </p>
              <p className="mt-2 font-display text-4xl text-accent-strong">
                {progress.xp}
              </p>
            </div>
            <div className="rounded-[1.6rem] bg-white p-4">
              <p className="text-sm font-bold text-muted-foreground">
                {ui(locale, "Due Reviews", "On tap den han")}
              </p>
              <p className="mt-2 font-display text-4xl text-foreground">{dueReviews}</p>
            </div>
            <div className="col-span-2 rounded-[1.6rem] bg-white p-4">
              <p className="text-sm font-bold text-muted-foreground">
                {ui(locale, "Current Lesson", "Bai hoc hien tai")}
              </p>
              <p className="mt-2 text-lg font-extrabold text-foreground">
                {currentNode
                  ? getLocalizedText(currentNode.title, locale)
                  : ui(locale, "Unit complete", "Hoan thanh unit")}
              </p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-6 rounded-[1.8rem] bg-card-soft px-5 py-4 text-base font-bold text-muted-foreground">
            {ui(locale, "Loading account progress...", "Dang tai tien do tai khoan...")}
          </div>
        ) : null}

        {error ? <div className="mt-6 feedback-incorrect">{error}</div> : null}
      </section>

      <section className="panel max-w-4xl">
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {ui(locale, "Overall Unit Progress", "Tien do toan unit")}
                </p>
                <h2 className="mt-2 font-display text-3xl text-foreground">
                  {ui(
                    locale,
                    `${completedNodeCount} / ${unit.nodes.length} lessons complete`,
                    `${completedNodeCount} / ${unit.nodes.length} bai da xong`,
                  )}
                </h2>
              </div>
              <span
                className={`pill ${
                  unitCompleted
                    ? "bg-success-soft text-accent-strong"
                    : "bg-white text-muted-foreground"
                }`}
              >
                {unitCompleted
                  ? ui(locale, "Unit completed", "Da hoan thanh unit")
                  : ui(locale, "In progress", "Dang hoc")}
              </span>
            </div>

            <div className="relative h-4 rounded-full bg-muted">
              <div
                className="progress-fill h-full rounded-full bg-accent"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>

          <div className="grid gap-3 rounded-[1.8rem] bg-card-strong/80 p-4 sm:grid-cols-3">
            <div>
              <p className="text-sm font-bold text-muted-foreground">
                {ui(locale, "Total lessons", "Tong bai hoc")}
              </p>
              <p className="mt-1 text-lg font-extrabold">
                {ui(
                  locale,
                  `${unit.nodes.length} dynamic nodes`,
                  `${unit.nodes.length} node dong`,
                )}
              </p>
            </div>
            <div>
              <p className="text-sm font-bold text-muted-foreground">
                {ui(locale, "Workbook lessons", "Bai workbook")}
              </p>
              <p className="mt-1 text-lg font-extrabold">
                {ui(
                  locale,
                  `${workbookPracticeLessons} focused practice nodes`,
                  `${workbookPracticeLessons} node luyen tap tap trung`,
                )}
              </p>
            </div>
            <div>
              <p className="text-sm font-bold text-muted-foreground">
                {ui(locale, "Workbook coverage", "Do phu workbook")}
              </p>
              <p className="mt-1 text-lg font-extrabold">
                {ui(
                  locale,
                  `${workbookCoverageCount} source exercises mapped`,
                  `${workbookCoverageCount} bai tap nguon da map`,
                )}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {unit.nodes.map((node) => {
              const state = getNodeState(progress, unit, node.id);
              const nodeRun = getNodeRun(progress, node.id);
              const nodeProgress = nodeRun
                ? (nodeRun.bestScore / node.sessionLength) * 100
                : 0;

              return (
                <article
                  key={node.id}
                  className={`rounded-[2rem] border p-5 shadow-[0_14px_30px_rgba(47,92,51,0.08)] ${getNodeStateTone(
                    state,
                    Boolean(nodeRun?.weak),
                  )}`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="pill bg-white text-foreground">
                          {ui(locale, "Lesson", "Bai")} {node.order}
                        </span>
                        <span className="pill bg-accent-warm/70 text-foreground">
                          {getLessonRoleLabel(node.lessonRole, locale)}
                        </span>
                        <span
                          className={`pill ${
                            state === "completed"
                              ? nodeRun?.weak
                                ? "bg-danger-soft text-danger"
                                : "bg-success-soft text-accent-strong"
                              : state === "current"
                                ? "bg-accent-cool text-accent-strong"
                                : "bg-white text-muted-foreground"
                          }`}
                        >
                          {state === "completed"
                            ? nodeRun?.weak
                              ? ui(locale, "Completed - weak", "Da xong - yeu")
                              : ui(locale, "Completed", "Da xong")
                            : state === "current"
                              ? ui(locale, "Current", "Hien tai")
                              : ui(locale, "Locked", "Khoa")}
                        </span>
                      </div>

                      <div>
                        <h3 className="font-display text-3xl text-foreground">
                          {getLocalizedText(node.title, locale)}
                        </h3>
                        <p className="mt-2 text-sm font-bold text-muted-foreground">
                          {ui(
                            locale,
                            `${node.sessionLength} authored tasks`,
                            `${node.sessionLength} tac vu duoc bien soan`,
                          )}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {ui(
                            locale,
                            `Covers ${node.sourceExerciseIds.length} source exercise${node.sourceExerciseIds.length === 1 ? "" : "s"}`,
                            `Phu ${node.sourceExerciseIds.length} bai tap nguon`,
                          )}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {node.focusConcepts.map((concept) => (
                          <span
                            key={`${node.id}-${concept}`}
                            className="pill bg-white text-muted-foreground"
                          >
                            {concept}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex w-full flex-col gap-3 sm:max-w-[240px]">
                      <div className="rounded-[1.6rem] bg-white/90 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-bold text-muted-foreground">
                            {ui(locale, "Lesson progress", "Tien do bai hoc")}
                          </p>
                          <p className="text-sm font-extrabold text-foreground">
                            {nodeRun ? `${nodeRun.bestScore}/${node.sessionLength}` : "0/0"}
                          </p>
                        </div>
                        <div className="mt-3 h-3 rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${
                              nodeRun?.weak ? "bg-danger" : "bg-accent"
                            }`}
                            style={{ width: `${nodeProgress}%` }}
                          />
                        </div>
                        <p className="mt-3 text-sm font-bold text-muted-foreground">
                          {nodeRun
                            ? ui(
                                locale,
                                `Best run: ${Math.round(nodeProgress)}%`,
                                `Luot tot nhat: ${Math.round(nodeProgress)}%`,
                              )
                            : ui(
                                locale,
                                "No completed runs yet",
                                "Chua co luot nao hoan tat",
                              )}
                        </p>
                      </div>

                      {state === "locked" ? (
                        <button type="button" disabled className="secondary-button w-full">
                          {ui(locale, "Locked", "Khoa")}
                        </button>
                      ) : (
                        <Link href={`/node/${node.id}`} className="primary-button w-full">
                          {state === "completed"
                            ? ui(locale, "Replay lesson", "Hoc lai bai")
                            : ui(locale, "Start lesson", "Bat dau bai hoc")}
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
