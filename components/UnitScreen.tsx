"use client";

import Link from "next/link";
import UnitLessonPath from "@/components/UnitLessonPath";
import { useAppLocale } from "@/hooks/useAppLocale";
import { useHanlingoSnapshot } from "@/hooks/useHanlingoSnapshot";
import { getLocalizedText } from "@/lib/localized";
import {
  getCompletedNodeCount,
  getCurrentNode,
  getCurrentUnit,
  getPreviousUnit,
  getUnitWords,
  isUnitUnlocked,
} from "@/lib/units";
import type { AppLocale } from "@/types/app-locale";
import type { UnitDefinition } from "@/types/unit";

type UnitScreenProps = {
  unit: UnitDefinition;
};

function ui(locale: AppLocale, en: string, vi: string) {
  return getLocalizedText({ en, vi }, locale);
}

export default function UnitScreen({ unit }: UnitScreenProps) {
  const { locale } = useAppLocale();
  const { progress, isLoading, error } = useHanlingoSnapshot(unit.id, getUnitWords(unit));
  const unitUnlocked = isUnitUnlocked(progress, unit.id);
  const currentUnit = getCurrentUnit(progress);
  const previousUnit = getPreviousUnit(unit.id);
  const currentNode = unitUnlocked ? getCurrentNode(unit, progress) ?? unit.nodes[0] ?? null : null;
  const completedNodeCount = getCompletedNodeCount(progress, unit);
  const progressPercent =
    unit.nodes.length > 0 ? Math.round((completedNodeCount / unit.nodes.length) * 100) : 0;

  if (!unitUnlocked) {
    return (
      <main className="shell-page">
        <section className="panel overflow-hidden">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="pill bg-accent text-white">
                {ui(locale, "Unit", "Unit")} {unit.unitNumber}
              </span>
              <span className="pill bg-muted text-muted-foreground">
                {ui(locale, "Locked", "Bi khoa")}
              </span>
            </div>

            <div className="space-y-3">
              <h1 className="font-display text-4xl leading-tight text-foreground sm:text-6xl">
                {getLocalizedText(unit.title, locale)}
              </h1>
              <p className="max-w-2xl text-lg font-bold text-muted-foreground">
                {getLocalizedText(unit.subtitle, locale)}
              </p>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="lesson-card space-y-6 text-center">
            <span className="pill mx-auto bg-card-strong text-foreground">
              {ui(locale, "Sequential unlock", "Mo khoa tuan tu")}
            </span>
            <h2 className="font-display text-4xl text-foreground sm:text-5xl">
              {ui(
                locale,
                "This unit opens only after the previous one is complete.",
                "Unit nay chi mo sau khi ban hoan thanh unit truoc.",
              )}
            </h2>
            <p className="text-base font-bold text-muted-foreground">
              {previousUnit
                ? ui(
                    locale,
                    `Finish Unit ${previousUnit.unitNumber} first, then come back here.`,
                    `Hay hoan thanh Unit ${previousUnit.unitNumber} truoc, roi quay lai day.`,
                  )
                : ui(
                    locale,
                    "Start from the first unit and move forward in order.",
                    "Hay bat dau tu unit dau tien va di tiep theo dung thu tu.",
                  )}
            </p>

            {currentUnit ? (
              <div className="rounded-[1.8rem] bg-card-soft px-5 py-4 text-left">
                <p className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
                  {ui(locale, "Current unlocked unit", "Unit dang mo")}
                </p>
                <p className="mt-2 text-2xl font-extrabold text-foreground">
                  {ui(locale, "Unit", "Unit")} {currentUnit.unitNumber}:{" "}
                  {getLocalizedText(currentUnit.title, locale)}
                </p>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href={currentUnit ? `/unit/${currentUnit.id}` : "/"}
                className="primary-button w-full"
              >
                {ui(locale, "Go to current unit", "Toi unit hien tai")}
              </Link>
              <Link href="/" className="secondary-button w-full">
                {ui(locale, "Back to learn", "Ve trang hoc")}
              </Link>
            </div>

            {error ? <div className="feedback-incorrect">{error}</div> : null}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="shell-page">
      <section className="panel overflow-hidden">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="pill bg-accent text-white">
                {ui(locale, "Unit", "Unit")} {unit.unitNumber}
              </span>
              <span className="pill bg-card-strong text-foreground">
                {unit.sections.length} {ui(locale, "sections", "section")}
              </span>
            </div>

            <div className="space-y-3">
              <h1 className="font-display text-4xl leading-tight text-foreground sm:text-6xl">
                {getLocalizedText(unit.title, locale)}
              </h1>
              <p className="max-w-2xl text-lg font-bold text-muted-foreground">
                {getLocalizedText(unit.subtitle, locale)}
              </p>
            </div>

            <div className="max-w-xl space-y-2">
              <div className="flex items-center justify-between gap-3 text-sm font-black text-foreground">
                <span>
                  {ui(
                    locale,
                    `${completedNodeCount}/${unit.nodes.length} lessons complete`,
                    `${completedNodeCount}/${unit.nodes.length} bai da xong`,
                  )}
                </span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-3 rounded-full bg-muted">
                <div
                  className="progress-fill h-full rounded-full bg-accent"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="w-full max-w-[360px] rounded-[2rem] bg-[#18261d] p-5 text-white shadow-[0_24px_64px_rgba(20,35,27,0.22)]">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-white/58">
              {ui(locale, "Next lesson", "Bai tiep theo")}
            </p>
            <h2 className="mt-4 font-display text-4xl leading-tight text-white">
              {currentNode
                ? getLocalizedText(currentNode.title, locale)
                : ui(locale, "This unit is ready to review.", "Unit nay san sang de on lai.")}
            </h2>
            <p className="mt-3 text-sm font-bold text-white/68">
              {ui(
                locale,
                "Open the highlighted node and keep momentum through the path.",
                "Mo node dang duoc to sang va giu nhip di tiep tren duong hoc.",
              )}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Link
                href={currentNode ? `/node/${currentNode.id}` : `/unit/${unit.id}`}
                className="primary-button w-full border-0 bg-[#8ce052] text-[#14231b] hover:bg-[#9bea66]"
              >
                {ui(locale, "Continue", "Tiep tuc")}
              </Link>
              <Link
                href="/practice"
                className="inline-flex w-full items-center justify-center rounded-full border border-white/12 bg-white/8 px-6 py-3.5 text-base font-extrabold text-white transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/12"
              >
                {ui(locale, "Practice later", "Luyen tap sau")}
              </Link>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-6 rounded-[1.8rem] bg-card-soft px-5 py-4 text-base font-bold text-muted-foreground">
            {ui(locale, "Loading your unit path...", "Dang tai lo trinh unit...")}
          </div>
        ) : null}

        {error ? <div className="mt-6 feedback-incorrect">{error}</div> : null}
      </section>

      <section className="panel">
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground">
                {ui(locale, "Lesson path", "Duong bai hoc")}
              </p>
              <h2 className="mt-2 font-display text-3xl text-foreground">
                {ui(locale, "Follow the next node, one lesson at a time.", "Di theo node tiep theo, tung bai mot.")}
              </h2>
            </div>
            <span className="pill bg-card-strong text-foreground">
              {ui(locale, "Current node is pulsing", "Node hien tai dang phat sang")}
            </span>
          </div>

          <UnitLessonPath
            unit={unit}
            progress={progress}
            locale={locale}
            currentNodeId={currentNode?.id ?? null}
          />
        </div>
      </section>
    </main>
  );
}
