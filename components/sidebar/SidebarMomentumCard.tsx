"use client";

import Link from "next/link";
import MaskedStatusIcon from "@/components/MaskedStatusIcon";
import { useDeveloperAccess } from "@/hooks/useDeveloperAccess";
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
      return ui(locale, "Checking today's pace.", "Đang xem nhịp học hôm nay.");
    case "protect_streak":
      return ui(locale, "Protect your streak.", "Giữ streak hôm nay.");
    case "build_goal":
      return ui(locale, "Keep today's run moving.", "Giữ nhịp học hôm nay.");
    case "goal_complete":
      return ui(locale, "Today's goal is done.", "Mục tiêu hôm nay đã xong.");
    case "start_today":
    default:
      return ui(locale, "Start today's run.", "Bắt đầu nhịp học hôm nay.");
  }
}

function getMomentumCopy(
  locale: AppLocale,
  momentumState: ReturnType<typeof getSidebarMomentumState>,
  remainingXp: number,
  goalXp: number,
) {
  switch (momentumState) {
    case "loading":
      return ui(
        locale,
        "Your next lesson, streak, and XP will settle in here in a moment.",
        "Bài tiếp theo, streak và XP sẽ hiện rõ tại đây trong giây lát.",
      );
    case "protect_streak":
      return ui(
        locale,
        "One lesson keeps the streak alive and starts today's XP.",
        "Chỉ cần một bài để giữ streak và mở XP hôm nay.",
      );
    case "build_goal":
      return ui(
        locale,
        `${remainingXp} XP left to finish today's ${goalXp} XP goal.`,
        `Còn ${remainingXp} XP nữa để chạm mục tiêu ${goalXp} XP hôm nay.`,
      );
    case "goal_complete":
      return ui(
        locale,
        "You've banked today's target. A little extra now makes tomorrow easier.",
        "Bạn đã chạm mục tiêu hôm nay. Làm thêm một chút nữa sẽ nhẹ hơn cho ngày mai.",
      );
    case "start_today":
    default:
      return ui(
        locale,
        "Start with one lesson and turn the board green early.",
        "Bắt đầu bằng một bài để mở nhịp xanh cho hôm nay.",
      );
  }
}

function getDestinationLabel(
  locale: AppLocale,
  destination: ReturnType<typeof getSidebarContinueTarget>,
  destinationReady: boolean,
) {
  if (!destinationReady) {
    return ui(locale, "Finding your next lesson...", "Đang tìm bài tiếp theo...");
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
    "Mở lộ trình dẫn hướng và học tiếp.",
  );
}

function getCtaLabel(
  locale: AppLocale,
  destination: ReturnType<typeof getSidebarContinueTarget>,
  destinationReady: boolean,
) {
  if (!destinationReady) {
    return ui(locale, "Open learn", "Mở học");
  }

  if (destination.activeNode) {
    return ui(locale, "Continue lesson", "Tiếp tục bài");
  }

  if (destination.activeUnit) {
    return ui(locale, "Open unit", "Mở unit");
  }

  return ui(locale, "Start learning", "Bắt đầu học");
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
    `${destination.progressPercent}% qua unit hiện tại`,
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
  const developerOverride = useDeveloperAccess();
  const destination = getSidebarContinueTarget(progress, developerOverride);
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
            {ui(locale, "Daily momentum", "Nhịp học hôm nay")}
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
        {getMomentumCopy(locale, momentumState, goalProgress.remainingXp, goalProgress.goalXp)}
      </p>

      <div className="sidebar-momentum-card__next">
        <p className="sidebar-momentum-card__next-label">
          {ui(locale, "Up next", "Sắp tới")}
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
            <p className="sidebar-momentum-stat__meta">{ui(locale, "days", "ngày")}</p>
          </div>
          <p className="sidebar-momentum-stat__value">{streakValue}</p>
        </div>

        <div className="sidebar-momentum-stat">
          <span className="sidebar-momentum-stat__icon sidebar-momentum-stat__icon--green">
            <MaskedStatusIcon path={SIDEBAR_ICON_PATHS.status.todayXp} size={18} color="currentColor" />
          </span>
          <div className="min-w-0">
            <p className="sidebar-momentum-stat__label">{ui(locale, "Today XP", "XP hôm nay")}</p>
            <p className="sidebar-momentum-stat__meta">{ui(locale, "earned", "đã kiếm")}</p>
          </div>
          <p className="sidebar-momentum-stat__value sidebar-momentum-stat__value--accent">
            {todayXpValue}
          </p>
        </div>
      </div>
    </section>
  );
}
