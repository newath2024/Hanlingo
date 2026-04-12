"use client";

import Link from "next/link";
import MaskedStatusIcon from "@/components/MaskedStatusIcon";
import { useUserProgress } from "@/hooks/useUserProgress";
import { getLocalizedText } from "@/lib/localized";
import { SIDEBAR_ICON_PATHS } from "@/lib/sidebar-navigation";
import {
  getSidebarContinueTarget,
  getSidebarGoalProgress,
  getSidebarMomentumState,
  SIDEBAR_DAILY_GOAL_XP,
} from "@/lib/sidebar-view-model";
import type { AppLocale } from "@/types/app-locale";
import type { ShellSidebarSummaryResponse } from "@/types/shell-sidebar";

function ui(locale: AppLocale, en: string, vi: string) {
  return getLocalizedText({ en, vi }, locale);
}

function getMomentumHeadline(
  locale: AppLocale,
  momentumState: ReturnType<typeof getSidebarMomentumState>,
) {
  switch (momentumState) {
    case "loading":
      return ui(locale, "Checking today's pace.", "Dang xem nhip hoc hom nay.");
    case "protect_streak":
      return ui(locale, "Protect your streak.", "Giu streak hom nay.");
    case "build_goal":
      return ui(locale, "Keep today's run moving.", "Giu nhip hoc hom nay.");
    case "goal_complete":
      return ui(locale, "Today's goal is done.", "Goal hom nay da xong.");
    case "start_today":
    default:
      return ui(locale, "Start today's run.", "Bat dau nhip hoc hom nay.");
  }
}

function getMomentumCopy(
  locale: AppLocale,
  momentumState: ReturnType<typeof getSidebarMomentumState>,
  remainingXp: number,
) {
  switch (momentumState) {
    case "loading":
      return ui(
        locale,
        "Your next lesson, streak, and XP will settle in here in a moment.",
        "Bai tiep theo, streak, va XP se hien ro tai day trong giay lat.",
      );
    case "protect_streak":
      return ui(
        locale,
        "One lesson keeps the streak alive and starts today's XP.",
        "Chi can mot bai de giu streak va mo XP hom nay.",
      );
    case "build_goal":
      return ui(
        locale,
        `${remainingXp} XP left to finish today's 30 XP goal.`,
        `Con ${remainingXp} XP nua de chot goal 30 XP hom nay.`,
      );
    case "goal_complete":
      return ui(
        locale,
        "You've banked today's target. A little extra now makes tomorrow easier.",
        "Ban da chot target hom nay. Them mot chut nua se nhe hon cho ngay mai.",
      );
    case "start_today":
    default:
      return ui(
        locale,
        "Start with one lesson and turn the board green early.",
        "Bat dau bang mot bai de mo nhip xanh cho hom nay.",
      );
  }
}

function getDestinationLabel(
  locale: AppLocale,
  destination: ReturnType<typeof getSidebarContinueTarget>,
  destinationReady: boolean,
) {
  if (!destinationReady) {
    return ui(locale, "Finding your next lesson...", "Dang tim bai tiep theo...");
  }

  if (destination.activeNode && destination.activeUnit) {
    return ui(
      locale,
      `Unit ${destination.activeUnit.unitNumber} / ${getLocalizedText(destination.activeNode.title, locale)}`,
      `Unit ${destination.activeUnit.unitNumber} / ${getLocalizedText(destination.activeNode.title, locale)}`,
    );
  }

  if (destination.activeUnit) {
    return ui(
      locale,
      `Unit ${destination.activeUnit.unitNumber} / ${getLocalizedText(destination.activeUnit.title, locale)}`,
      `Unit ${destination.activeUnit.unitNumber} / ${getLocalizedText(destination.activeUnit.title, locale)}`,
    );
  }

  return ui(
    locale,
    "Open the guided path and pick up where you left off.",
    "Mo lo trinh dan huong va hoc tiep.",
  );
}

function getCtaLabel(
  locale: AppLocale,
  destination: ReturnType<typeof getSidebarContinueTarget>,
  destinationReady: boolean,
) {
  if (!destinationReady) {
    return ui(locale, "Open learn", "Mo hoc");
  }

  if (destination.activeNode) {
    return ui(locale, "Continue lesson", "Tiep tuc bai");
  }

  if (destination.activeUnit) {
    return ui(locale, "Open unit", "Mo unit");
  }

  return ui(locale, "Start learning", "Bat dau hoc");
}

function getDestinationMeta(
  locale: AppLocale,
  destination: ReturnType<typeof getSidebarContinueTarget>,
  destinationReady: boolean,
) {
  if (!destinationReady || !destination.activeUnit) {
    return null;
  }

  return ui(
    locale,
    `${destination.progressPercent}% through the current unit`,
    `${destination.progressPercent}% qua unit hien tai`,
  );
}

type SidebarMomentumCardProps = {
  locale: AppLocale;
  summary: ShellSidebarSummaryResponse | null;
  isLoading: boolean;
};

export default function SidebarMomentumCard({
  locale,
  summary,
  isLoading,
}: SidebarMomentumCardProps) {
  const { progress, isLoading: isProgressLoading } = useUserProgress();
  const destination = getSidebarContinueTarget(progress);
  const goalProgress = getSidebarGoalProgress(summary?.todayXp, SIDEBAR_DAILY_GOAL_XP);
  const momentumState = getSidebarMomentumState(summary, isLoading, SIDEBAR_DAILY_GOAL_XP);
  const destinationReady = !isProgressLoading;
  const destinationMeta = getDestinationMeta(locale, destination, destinationReady);
  const streakValue = summary ? `${summary.streakDays}` : "--";
  const todayXpValue = summary ? `${summary.todayXp}` : "--";

  return (
    <section
      aria-busy={isLoading || isProgressLoading}
      className="sidebar-momentum-card"
    >
      <div className="sidebar-momentum-card__glow" aria-hidden />
      <div className="sidebar-momentum-card__header">
        <div className="min-w-0">
          <p className="sidebar-panel__eyebrow">
            {ui(locale, "Daily momentum", "Nhip hoc hom nay")}
          </p>
          <h2 className="sidebar-momentum-card__headline">
            {getMomentumHeadline(locale, momentumState)}
          </h2>
        </div>
        <Link href={destinationReady ? destination.href : "/"} className="sidebar-momentum-card__cta">
          {getCtaLabel(locale, destination, destinationReady)}
        </Link>
      </div>

      <p className="sidebar-momentum-card__copy">
        {getMomentumCopy(locale, momentumState, goalProgress.remainingXp)}
      </p>

      <div className="sidebar-momentum-card__next">
        <p className="sidebar-momentum-card__next-label">
          {ui(locale, "Up next", "Sap toi")}
        </p>
        <p className="sidebar-momentum-card__next-title">
          {getDestinationLabel(locale, destination, destinationReady)}
        </p>
        {destinationMeta ? <p className="sidebar-momentum-card__next-meta">{destinationMeta}</p> : null}
      </div>

      <div className="sidebar-momentum-card__stats">
        <div className="sidebar-momentum-stat">
          <span className="sidebar-momentum-stat__icon sidebar-momentum-stat__icon--warm">
            <MaskedStatusIcon path={SIDEBAR_ICON_PATHS.status.streak} size={18} color="currentColor" />
          </span>
          <div className="min-w-0">
            <p className="sidebar-momentum-stat__label">{ui(locale, "Streak", "Streak")}</p>
            <p className="sidebar-momentum-stat__meta">{ui(locale, "days", "ngay")}</p>
          </div>
          <p className="sidebar-momentum-stat__value">{streakValue}</p>
        </div>

        <div className="sidebar-momentum-stat">
          <span className="sidebar-momentum-stat__icon sidebar-momentum-stat__icon--green">
            <MaskedStatusIcon path={SIDEBAR_ICON_PATHS.status.todayXp} size={18} color="currentColor" />
          </span>
          <div className="min-w-0">
            <p className="sidebar-momentum-stat__label">{ui(locale, "Today XP", "XP hom nay")}</p>
            <p className="sidebar-momentum-stat__meta">{ui(locale, "earned", "da kiem")}</p>
          </div>
          <p className="sidebar-momentum-stat__value sidebar-momentum-stat__value--accent">
            {todayXpValue}
          </p>
        </div>
      </div>
    </section>
  );
}
