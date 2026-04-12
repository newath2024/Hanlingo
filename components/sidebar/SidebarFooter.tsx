import { getLocalizedText } from "@/lib/localized";
import {
  getSidebarGoalProgress,
  SIDEBAR_DAILY_GOAL_XP,
} from "@/lib/sidebar-view-model";
import type { AppLocale } from "@/types/app-locale";
import type { ShellSidebarSummaryResponse } from "@/types/shell-sidebar";

function ui(locale: AppLocale, en: string, vi: string) {
  return getLocalizedText({ en, vi }, locale);
}

function getFooterCopy(
  locale: AppLocale,
  goalProgress: ReturnType<typeof getSidebarGoalProgress>,
  isLoading: boolean,
) {
  if (isLoading || goalProgress.todayXp === null) {
    return ui(
      locale,
      "Today's goal will settle in as soon as your sidebar summary loads.",
      "Goal hom nay se hien ro khi sidebar summary tai xong.",
    );
  }

  if (goalProgress.isComplete) {
    return ui(
      locale,
      "Daily target reached. Anything extra now is pure momentum.",
      "Target hom nay da dat. Them nua luc nay la momentum thuong.",
    );
  }

  if (!goalProgress.hasStarted) {
    return ui(
      locale,
      "A clean 30 XP day starts with one lesson.",
      "Mot ngay 30 XP bat dau bang mot bai.",
    );
  }

  return ui(
    locale,
    `${goalProgress.remainingXp} XP left. One more lesson keeps the bar moving.`,
    `Con ${goalProgress.remainingXp} XP nua. Them mot bai de day thanh tien do.`,
  );
}

type SidebarFooterProps = {
  locale: AppLocale;
  summary: ShellSidebarSummaryResponse | null;
  isLoading: boolean;
};

export default function SidebarFooter({
  locale,
  summary,
  isLoading,
}: SidebarFooterProps) {
  const goalProgress = getSidebarGoalProgress(summary?.todayXp, SIDEBAR_DAILY_GOAL_XP);
  const progressValue =
    goalProgress.todayXp === null ? "--" : `${goalProgress.todayXp}/${goalProgress.goalXp} XP`;

  return (
    <section className="sidebar-footer-card">
      <div className="sidebar-footer-card__header">
        <div className="min-w-0">
          <p className="sidebar-panel__eyebrow">{ui(locale, "Daily goal", "Goal hom nay")}</p>
          <p className="sidebar-footer-card__value">{progressValue}</p>
        </div>
        <span className="sidebar-footer-card__pill">30 XP</span>
      </div>

      <div className="sidebar-footer-card__meter">
        <span
          className="sidebar-footer-card__meter-fill"
          style={{ width: `${goalProgress.progressPercent}%` }}
        />
      </div>

      <p className="sidebar-footer-card__copy">
        {getFooterCopy(locale, goalProgress, isLoading)}
      </p>
    </section>
  );
}
