"use client";

import { useAppLocale } from "@/hooks/useAppLocale";
import { useAuth } from "@/hooks/useAuth";
import { useHanlingoSnapshot } from "@/hooks/useHanlingoSnapshot";
import { getLocalizedText } from "@/lib/localized";
import {
  getCompletedNodeCount,
  getCurrentNode,
  getUnitWords,
  isUnitCompleted,
  unitCatalog,
} from "@/lib/units";
import type { AppLocale } from "@/types/app-locale";
import type { UnitDefinition } from "@/types/unit";
import Link from "next/link";

function ui(locale: AppLocale, en: string, vi: string) {
  return getLocalizedText({ en, vi }, locale);
}

type UnitCardProps = {
  locale: AppLocale;
  unit: UnitDefinition;
};

function UnitCard({ locale, unit }: UnitCardProps) {
  const { progress, dueReviews } = useHanlingoSnapshot(unit.id, getUnitWords(unit));
  const currentNode = getCurrentNode(unit, progress);
  const unitCompleted = isUnitCompleted(progress, unit.id);
  const completedNodeCount = getCompletedNodeCount(progress, unit);
  const workbookPracticeLessons = unit.nodes.filter(
    (node) => node.lessonRole === "workbook_practice",
  ).length;
  const workbookCoverageCount = new Set(
    unit.nodes.flatMap((node) => node.sourceExerciseIds),
  ).size;
  const title = getLocalizedText(unit.title, locale);
  const subtitle = getLocalizedText(unit.subtitle, locale);

  return (
    <article className="rounded-[2rem] border border-accent/10 bg-white p-5 shadow-[0_14px_30px_rgba(47,92,51,0.08)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pill bg-accent-warm/70 text-foreground">
              {ui(locale, "Unit", "Unit")} {unit.unitNumber}
            </span>
            <span
              className={`pill ${
                unitCompleted
                  ? "bg-success-soft text-accent-strong"
                  : "bg-card-strong text-muted-foreground"
              }`}
            >
              {unitCompleted
                ? ui(locale, "Completed", "Da hoan thanh")
                : ui(locale, "In progress", "Dang hoc")}
            </span>
          </div>

          <div>
            <h2 className="font-display text-3xl text-foreground">{title}</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="pill bg-card-strong text-foreground">
              {ui(
                locale,
                `${completedNodeCount}/${unit.nodes.length} lessons complete`,
                `${completedNodeCount}/${unit.nodes.length} bai da xong`,
              )}
            </span>
            <span className="pill bg-card-strong text-foreground">
              {ui(
                locale,
                `${workbookPracticeLessons} workbook nodes`,
                `${workbookPracticeLessons} node workbook`,
              )}
            </span>
            <span className="pill bg-card-strong text-foreground">
              {ui(
                locale,
                `${workbookCoverageCount} source exercises`,
                `${workbookCoverageCount} bai tap nguon`,
              )}
            </span>
            <span className="pill bg-card-strong text-foreground">
              {ui(
                locale,
                `${dueReviews} due review${dueReviews === 1 ? "" : "s"}`,
                `${dueReviews} the on tap den han`,
              )}
            </span>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 sm:max-w-[260px]">
          <div className="rounded-[1.6rem] bg-card-strong p-4">
            <p className="text-sm font-bold text-muted-foreground">
              {ui(locale, "Next lesson", "Bai tiep theo")}
            </p>
            <p className="mt-2 text-lg font-extrabold text-foreground">
              {currentNode
                ? getLocalizedText(currentNode.title, locale)
                : ui(locale, "Unit complete", "Da xong unit")}
            </p>
          </div>

          <Link href={`/unit/${unit.id}`} className="primary-button w-full">
            {unitCompleted
              ? ui(locale, "Review unit", "On lai unit")
              : ui(locale, "Open unit", "Mo unit")}
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function HomePage() {
  const { locale } = useAppLocale();
  const { user } = useAuth();
  const { progress, isLoading, error } = useHanlingoSnapshot("home-overview", []);
  const activeUnit =
    unitCatalog.find((unit) => !isUnitCompleted(progress, unit.id)) ?? unitCatalog[0] ?? null;
  const nextNode = activeUnit ? getCurrentNode(activeUnit, progress) : null;

  if (!unitCatalog.length) {
    return null;
  }

  return (
    <main className="page-shell">
      <section className="panel max-w-5xl overflow-hidden">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-4">
            <span className="pill bg-accent-warm/70 text-foreground">
              {ui(locale, "Hanlingo Unit Path", "Lo trinh unit Hanlingo")}
            </span>
            <div className="space-y-3">
              <h1 className="font-display text-4xl leading-tight text-foreground sm:text-6xl">
                {ui(
                  locale,
                  "Move across Korean units, one focused node at a time.",
                  "Di qua cac unit tieng Han, moi node mot muc tieu ro rang.",
                )}
              </h1>
              <p className="max-w-2xl text-lg text-muted-foreground">
                {ui(
                  locale,
                  `Signed in as @${user?.username ?? "learner"}. Your dashboard now reads live progress from your account, not this device only.`,
                  `Dang dang nhap voi @${user?.username ?? "learner"}. Dashboard nay doc tien do truc tiep tu tai khoan cua ban, khong chi tren thiet bi nay.`,
                )}
              </p>
            </div>
          </div>

          <div className="grid min-w-[220px] grid-cols-2 gap-3 self-stretch sm:max-w-[320px]">
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
                {ui(locale, "Units", "So unit")}
              </p>
              <p className="mt-2 font-display text-4xl text-foreground">
                {unitCatalog.length}
              </p>
            </div>
            <div className="col-span-2 rounded-[1.6rem] bg-white p-4">
              <p className="text-sm font-bold text-muted-foreground">
                {ui(locale, "Next lesson", "Bai tiep theo")}
              </p>
              <p className="mt-2 text-lg font-extrabold text-foreground">
                {activeUnit && nextNode
                  ? `${ui(locale, "Unit", "Unit")} ${activeUnit.unitNumber}: ${getLocalizedText(nextNode.title, locale)}`
                  : ui(locale, "All current units complete", "Da xong cac unit hien co")}
              </p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-6 rounded-[1.8rem] bg-card-soft px-5 py-4 text-base font-bold text-muted-foreground">
            {ui(locale, "Loading your dashboard...", "Dang tai dashboard cua ban...")}
          </div>
        ) : null}

        {error ? <div className="mt-6 feedback-incorrect">{error}</div> : null}
      </section>

      <section className="panel max-w-5xl">
        <div className="space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">
                {ui(locale, "Available Units", "Cac unit hien co")}
              </p>
              <h2 className="mt-2 font-display text-3xl text-foreground">
                {ui(locale, "Choose where to continue", "Chon unit de hoc tiep")}
              </h2>
            </div>
            {activeUnit ? (
              <Link href={`/unit/${activeUnit.id}`} className="secondary-button">
                {ui(
                  locale,
                  `Jump to Unit ${activeUnit.unitNumber}`,
                  `Vao Unit ${activeUnit.unitNumber}`,
                )}
              </Link>
            ) : null}
          </div>

          <div className="grid gap-4">
            {unitCatalog.map((unit) => (
              <UnitCard key={unit.id} locale={locale} unit={unit} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
