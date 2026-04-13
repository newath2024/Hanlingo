"use client";

import Link from "next/link";
import UnitLessonPath from "@/components/UnitLessonPath";
import { useAppLocale } from "@/hooks/useAppLocale";
import { useDeveloperAccess } from "@/hooks/useDeveloperAccess";
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
  const developerOverride = useDeveloperAccess();
  const { progress, isLoading, error } = useHanlingoSnapshot(unit.id, getUnitWords(unit));
  const unitUnlocked = isUnitUnlocked(progress, unit.id, developerOverride);
  const currentUnit = getCurrentUnit(progress, developerOverride);
  const previousUnit = getPreviousUnit(unit.id);
  const currentNode = unitUnlocked
    ? getCurrentNode(unit, progress, developerOverride) ?? unit.nodes[0] ?? null
    : null;
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
                {ui(locale, "Locked", "Bị khóa")}
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
              {ui(locale, "Sequential unlock", "Mở khóa tuần tự")}
            </span>
            <h2 className="font-display text-4xl text-foreground sm:text-5xl">
              {ui(
                locale,
                "This unit opens only after the previous one is complete.",
                "Unit này chỉ mở sau khi bạn hoàn thành unit trước.",
              )}
            </h2>
            <p className="text-base font-bold text-muted-foreground">
              {previousUnit
                ? ui(
                    locale,
                    `Finish Unit ${previousUnit.unitNumber} first, then come back here.`,
                    `Hãy hoàn thành Unit ${previousUnit.unitNumber} trước, rồi quay lại đây.`,
                  )
                : ui(
                    locale,
                    "Start from the first unit and move forward in order.",
                    "Hãy bắt đầu từ unit đầu tiên và đi tiếp theo đúng thứ tự.",
                  )}
            </p>

            {currentUnit ? (
              <div className="rounded-[1.8rem] bg-card-soft px-5 py-4 text-left">
                <p className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
                  {ui(locale, "Current unlocked unit", "Unit đang mở")}
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
                {ui(locale, "Go to current unit", "Tới unit hiện tại")}
              </Link>
              <Link href="/" className="secondary-button w-full">
                {ui(locale, "Back to learn", "Về trang học")}
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
                    `${completedNodeCount}/${unit.nodes.length} bài đã xong`,
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
              {ui(locale, "Next lesson", "Bài tiếp theo")}
            </p>
            <h2 className="mt-4 font-display text-4xl leading-tight text-white">
              {currentNode
                ? getLocalizedText(currentNode.title, locale)
                : ui(locale, "This unit is ready to review.", "Unit này sẵn sàng để ôn lại.")}
            </h2>
            <p className="mt-3 text-sm font-bold text-white/68">
              {ui(
                locale,
                "Open the highlighted node and keep momentum through the path.",
                "Mở node đang được tô sáng và giữ nhịp đi tiếp trên đường học.",
              )}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Link
                href={currentNode ? `/node/${currentNode.id}` : `/unit/${unit.id}`}
                className="primary-button w-full border-0 bg-[#8ce052] text-[#14231b] hover:bg-[#9bea66]"
              >
                {ui(locale, "Continue", "Tiếp tục")}
              </Link>
              <Link
                href="/practice"
                className="inline-flex w-full items-center justify-center rounded-full border border-white/12 bg-white/8 px-6 py-3.5 text-base font-extrabold text-white transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/12"
              >
                {ui(locale, "Practice later", "Luyện tập sau")}
              </Link>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-6 rounded-[1.8rem] bg-card-soft px-5 py-4 text-base font-bold text-muted-foreground">
            {ui(locale, "Loading your unit path...", "Đang tải lộ trình unit...")}
          </div>
        ) : null}

        {error ? <div className="mt-6 feedback-incorrect">{error}</div> : null}
      </section>

      <section className="panel">
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground">
                {ui(locale, "Lesson path", "Đường bài học")}
              </p>
              <h2 className="mt-2 font-display text-3xl text-foreground">
                {ui(locale, "Follow the next node, one lesson at a time.", "Đi theo node tiếp theo, từng bài một.")}
              </h2>
            </div>
            <span className="pill bg-card-strong text-foreground">
              {ui(locale, "Current node is pulsing", "Node hiện tại đang phát sáng")}
            </span>
          </div>

          <UnitLessonPath
            unit={unit}
            progress={progress}
            locale={locale}
            currentNodeId={currentNode?.id ?? null}
            developerOverride={developerOverride}
          />
        </div>
      </section>
    </main>
  );
}
