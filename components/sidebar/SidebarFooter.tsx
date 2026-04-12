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
      "Mục tiêu hôm nay sẽ hiện rõ khi sidebar summary tải xong.",
    );
  }

  if (goalProgress.isComplete) {
    return ui(
      locale,
      "Daily target reached. Anything extra now is pure momentum.",
      "Mục tiêu hôm nay đã đạt. Phần thêm lúc này là đà tiến thuần túy.",
    );
  }

  if (!goalProgress.hasStarted) {
    return ui(
      locale,
      `A clean ${goalProgress.goalXp} XP day starts with one lesson.`,
      `Một ngày ${goalProgress.goalXp} XP bắt đầu bằng một bài.`,
    );
  }

  return ui(
    locale,
    `${goalProgress.remainingXp} XP left. One more lesson keeps the bar moving.`,
    `Còn ${goalProgress.remainingXp} XP nữa. Thêm một bài để đẩy thanh tiến độ.`,
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
          <p className="sidebar-panel__eyebrow">{ui(locale, "Daily goal", "Mục tiêu hôm nay")}</p>
          <p className="sidebar-footer-card__value">{progressValue}</p>
        </div>
        <span className="sidebar-footer-card__pill">{goalProgress.goalXp} XP</span>
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
