"use client";

import Link from "next/link";
import { useAppLocale } from "@/hooks/useAppLocale";
import { useAuth } from "@/hooks/useAuth";
import { useHanlingoSnapshot } from "@/hooks/useHanlingoSnapshot";
import { getLocalizedText } from "@/lib/localized";
import {
  getCompletedNodeCount,
  getCurrentNode,
  getCurrentUnit,
  getPreviousUnit,
  isUnitCompleted,
  isUnitUnlocked,
  unitCatalog,
} from "@/lib/units";
import type { ProgressState } from "@/lib/progress-state";
import type { AppLocale } from "@/types/app-locale";
import type { UnitDefinition } from "@/types/unit";

function ui(locale: AppLocale, en: string, vi: string) {
  return getLocalizedText({ en, vi }, locale);
}

type LearnUnitCardProps = {
  locale: AppLocale;
  unit: UnitDefinition;
  progress: ProgressState;
};

function LearnUnitCard({ locale, unit, progress }: LearnUnitCardProps) {
  const completedNodeCount = getCompletedNodeCount(progress, unit);
  const unitCompleted = isUnitCompleted(progress, unit.id);
  const unitUnlocked = isUnitUnlocked(progress, unit.id);
  const currentNode = unitUnlocked ? getCurrentNode(unit, progress) : null;
  const previousUnit = getPreviousUnit(unit.id);
  const progressPercent =
    unit.nodes.length > 0 ? Math.round((completedNodeCount / unit.nodes.length) * 100) : 0;

  return (
    <article
      className={`rounded-[2rem] border bg-white p-5 shadow-[0_14px_34px_rgba(47,92,51,0.08)] transition ${
        unitUnlocked ? "hover:scale-[1.01] border-accent/10" : "border-accent/8 opacity-85"
      }`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pill bg-accent-warm/70 text-foreground">
              {ui(locale, "Unit", "Unit")} {unit.unitNumber}
            </span>
            <span
              className={`pill ${
                unitCompleted
                  ? "bg-success-soft text-accent-strong"
                  : unitUnlocked
                    ? "bg-card-strong text-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {unitCompleted
                ? ui(locale, "Completed", "Đã xong")
                : unitUnlocked
                  ? ui(locale, "In progress", "Đang học")
                  : ui(locale, "Locked", "Bị khóa")}
            </span>
          </div>

          <div className="space-y-2">
            <h2 className="font-display text-3xl text-foreground">
              {getLocalizedText(unit.title, locale)}
            </h2>
            <p className="max-w-2xl text-sm font-bold text-muted-foreground">
              {getLocalizedText(unit.subtitle, locale)}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm font-black text-foreground">
              <span>
                {ui(
                  locale,
                  `${completedNodeCount}/${unit.nodes.length} lessons`,
                  `${completedNodeCount}/${unit.nodes.length} bài`,
                )}
              </span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-3 rounded-full bg-muted">
              <div
                className={`progress-fill h-full rounded-full ${
                  unitUnlocked ? "bg-accent" : "bg-muted-foreground/35"
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 md:max-w-[240px]">
          <div className="rounded-[1.5rem] bg-card-soft p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
              {unitUnlocked
                ? ui(locale, "Next lesson", "Bài tiếp theo")
                : ui(locale, "Unlock rule", "Điều kiện mở khóa")}
            </p>
            <p className="mt-2 text-base font-extrabold text-foreground">
              {unitUnlocked
                ? currentNode
                  ? getLocalizedText(currentNode.title, locale)
                  : ui(locale, "Unit review available", "Có thể ôn lại unit")
                : previousUnit
                  ? ui(
                      locale,
                      `Finish Unit ${previousUnit.unitNumber} first.`,
                      `Hoàn thành Unit ${previousUnit.unitNumber} trước.`,
                    )
                  : ui(locale, "Start from the first unit.", "Bắt đầu từ unit đầu tiên.")}
            </p>
          </div>

          {unitUnlocked ? (
            <Link href={`/unit/${unit.id}`} className="primary-button w-full">
              {ui(locale, "Open unit", "Mở unit")}
            </Link>
          ) : (
            <div className="secondary-button w-full cursor-not-allowed border-accent/10 bg-muted text-muted-foreground hover:translate-y-0 hover:border-accent/10 hover:bg-muted">
              {ui(locale, "Locked for now", "Tạm thời bị khóa")}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export default function HomePage() {
  const { locale } = useAppLocale();
  const { user } = useAuth();
  const { progress, isLoading, error } = useHanlingoSnapshot("home-overview", []);
  const activeUnit = getCurrentUnit(progress);
  const continueNode = activeUnit ? getCurrentNode(activeUnit, progress) ?? activeUnit.nodes[0] : null;
  const completedNodeCount = activeUnit ? getCompletedNodeCount(progress, activeUnit) : 0;
  const activeProgressPercent =
    activeUnit && activeUnit.nodes.length > 0
      ? Math.round((completedNodeCount / activeUnit.nodes.length) * 100)
      : 0;
  const sortedUnits = activeUnit
    ? [
        activeUnit,
        ...unitCatalog
          .filter((unit) => unit.id !== activeUnit.id)
          .sort((left, right) => left.unitNumber - right.unitNumber),
      ]
    : [...unitCatalog];
  const unlockedUnitCount = unitCatalog.filter((unit) => isUnitUnlocked(progress, unit.id)).length;

  return (
    <main className="shell-page">
      <section className="panel overflow-hidden">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-4">
            <span className="pill bg-accent text-white">
              {ui(locale, "Learn", "Học")}
            </span>
            <div className="space-y-3">
              <h1 className="font-display text-4xl leading-tight text-foreground sm:text-6xl">
                {ui(
                  locale,
                  "Start the next Korean lesson before anything else.",
                  "Vào bài tiếng Hàn tiếp theo trước mọi thứ khác.",
                )}
              </h1>
              <p className="max-w-2xl text-lg font-bold text-muted-foreground">
                {ui(
                  locale,
                  `Signed in as @${user?.username ?? "learner"}. Learn opens first, practice comes after the lesson path.`,
                  `Đăng nhập với @${user?.username ?? "learner"}. Ưu tiên vào bài học trước, rồi mới sang luyện tập.`,
                )}
              </p>
            </div>
          </div>

          <div className="w-full max-w-[360px] rounded-[2rem] bg-[#18261d] p-5 text-white shadow-[0_24px_64px_rgba(20,35,27,0.24)]">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-white/60">
              {ui(locale, "Continue learning", "Học tiếp")}
            </p>

            <div className="mt-4 space-y-3">
              <p className="text-sm font-bold text-[#8ab29b]">
                {activeUnit
                  ? `${ui(locale, "Unit", "Unit")} ${activeUnit.unitNumber}`
                  : ui(locale, "No unit loaded", "Chưa có unit")}
              </p>
              <h2 className="font-display text-4xl leading-tight text-white">
                {continueNode
                  ? getLocalizedText(continueNode.title, locale)
                  : ui(locale, "Pick a unit to continue", "Chọn unit để học tiếp")}
              </h2>
              <p className="text-sm font-bold text-white/68">
                {activeUnit
                  ? getLocalizedText(activeUnit.title, locale)
                  : ui(locale, "Your current path will appear here.", "Lộ trình hiện tại của bạn sẽ hiện ở đây.")}
              </p>
            </div>

            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between gap-3 text-sm font-black text-white">
                <span>{ui(locale, "Progress", "Tiến độ")}</span>
                <span>{activeProgressPercent}%</span>
              </div>
              <div className="h-3 rounded-full bg-white/12">
                <div
                  className="progress-fill h-full rounded-full bg-[#8ce052]"
                  style={{ width: `${activeProgressPercent}%` }}
                />
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Link
                href={continueNode ? `/node/${continueNode.id}` : activeUnit ? `/unit/${activeUnit.id}` : "/"}
                className="primary-button w-full border-0 bg-[#8ce052] text-[#14231b] hover:bg-[#9bea66]"
              >
                {ui(locale, "Continue", "Tiếp tục")}
              </Link>
              <Link
                href={activeUnit ? `/unit/${activeUnit.id}` : "/"}
                className="inline-flex w-full items-center justify-center rounded-full border border-white/12 bg-white/8 px-6 py-3.5 text-base font-extrabold text-white transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/12"
              >
                {ui(locale, "Open unit", "Mở unit")}
              </Link>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-6 rounded-[1.8rem] bg-card-soft px-5 py-4 text-base font-bold text-muted-foreground">
            {ui(locale, "Loading your next lesson...", "Đang tải bài tiếp theo...")}
          </div>
        ) : null}

        {error ? <div className="mt-6 feedback-incorrect">{error}</div> : null}
      </section>

      <section className="panel">
        <div className="space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground">
                {ui(locale, "Units", "Các unit")}
              </p>
              <h2 className="mt-2 font-display text-3xl text-foreground">
                {ui(
                  locale,
                  "Follow the guided path one unit at a time.",
                  "Đi theo lộ trình dẫn hướng, mỗi lần một unit.",
                )}
              </h2>
            </div>
            <span className="pill bg-card-strong text-foreground">
              {ui(
                locale,
                `${unlockedUnitCount} unit${unlockedUnitCount === 1 ? "" : "s"} unlocked`,
                `${unlockedUnitCount} unit đang mở`,
              )}
            </span>
          </div>

          <div className="grid gap-4">
            {sortedUnits.map((unit) => (
              <LearnUnitCard
                key={unit.id}
                locale={locale}
                unit={unit}
                progress={progress}
              />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
