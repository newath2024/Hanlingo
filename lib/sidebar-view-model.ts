import type { UserProgressState } from "@/lib/progress-state";
import { getCompletedNodeCount, getCurrentNode, getCurrentUnit } from "@/lib/units";
import type { ShellSidebarSummaryResponse } from "@/types/shell-sidebar";
import type { NodeDefinition, UnitDefinition } from "@/types/unit";

export const SIDEBAR_DAILY_GOAL_XP = 50;

export type SidebarContinueTarget = {
  href: string;
  activeUnit: UnitDefinition | null;
  activeNode: NodeDefinition | null;
  progressPercent: number;
};

export type SidebarMomentumState =
  | "loading"
  | "start_today"
  | "protect_streak"
  | "build_goal"
  | "goal_complete";

export type SidebarGoalProgress = {
  todayXp: number | null;
  goalXp: number;
  progressPercent: number;
  remainingXp: number;
  isComplete: boolean;
  hasStarted: boolean;
};

export function getSidebarContinueTarget(
  progress: UserProgressState,
  developerOverride = false,
): SidebarContinueTarget {
  const activeUnit = getCurrentUnit(progress, developerOverride);
  const activeNode = activeUnit
    ? getCurrentNode(activeUnit, progress, developerOverride) ?? activeUnit.nodes[0]
    : null;
  const completedNodeCount = activeUnit ? getCompletedNodeCount(progress, activeUnit) : 0;
  const progressPercent =
    activeUnit && activeUnit.nodes.length > 0
      ? Math.round((completedNodeCount / activeUnit.nodes.length) * 100)
      : 0;
  const href = activeNode ? `/node/${activeNode.id}` : activeUnit ? `/unit/${activeUnit.id}` : "/";

  return {
    href,
    activeUnit,
    activeNode,
    progressPercent,
  };
}

export function getSidebarMomentumState(
  summary: ShellSidebarSummaryResponse | null,
  isLoading: boolean,
  goalXp = SIDEBAR_DAILY_GOAL_XP,
): SidebarMomentumState {
  if (isLoading || !summary) {
    return "loading";
  }

  if (summary.todayXp >= goalXp) {
    return "goal_complete";
  }

  if (summary.todayXp > 0) {
    return "build_goal";
  }

  if (summary.streakDays > 0) {
    return "protect_streak";
  }

  return "start_today";
}

export function getSidebarGoalProgress(
  todayXp: number | null | undefined,
  goalXp = SIDEBAR_DAILY_GOAL_XP,
): SidebarGoalProgress {
  if (typeof todayXp !== "number") {
    return {
      todayXp: null,
      goalXp,
      progressPercent: 0,
      remainingXp: goalXp,
      isComplete: false,
      hasStarted: false,
    };
  }

  const safeTodayXp = Math.max(0, todayXp);
  const remainingXp = Math.max(0, goalXp - safeTodayXp);

  return {
    todayXp: safeTodayXp,
    goalXp,
    progressPercent: Math.max(0, Math.min(100, Math.round((safeTodayXp / goalXp) * 100))),
    remainingXp,
    isComplete: safeTodayXp >= goalXp,
    hasStarted: safeTodayXp > 0,
  };
}
