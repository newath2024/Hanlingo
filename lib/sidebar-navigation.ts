import type { ShellSidebarSummaryResponse } from "@/types/shell-sidebar";

type LocalizedCopy = {
  en: string;
  vi: string;
};

type SidebarBadge = {
  text: string;
  title: LocalizedCopy;
};

type SidebarTone = {
  iconColor: string;
  iconBackground: string;
  iconActiveColor: string;
  iconActiveBackground: string;
  badgeBackground: string;
  badgeBorder: string;
  badgeText: string;
};

type SidebarStatTone = {
  iconColor: string;
  iconBackground: string;
  valueColor: string;
};

export type SidebarNavItemId =
  | "learn"
  | "practice"
  | "analytics"
  | "leaderboard"
  | "profile";

export type SidebarNavItemConfig = {
  id: SidebarNavItemId;
  href: string;
  label: LocalizedCopy;
  mobileLabel: LocalizedCopy;
  iconPath: string;
  tone: SidebarTone;
  getBadge?: (summary: ShellSidebarSummaryResponse | null) => SidebarBadge | null;
};

export type SidebarNavSectionConfig = {
  id: "learning" | "progress" | "account";
  label: LocalizedCopy;
  items: SidebarNavItemConfig[];
};

export type SidebarStatConfig = {
  id: "streak" | "todayXp";
  label: LocalizedCopy;
  caption: LocalizedCopy;
  iconPath: string;
  tone: SidebarStatTone;
  getValue: (summary: ShellSidebarSummaryResponse | null) => string;
};

export const SIDEBAR_ICON_LICENSE = {
  pack: "Phosphor Icons Core",
  packUrl: "https://github.com/phosphor-icons/core",
  license: "MIT",
  licenseUrl: "https://github.com/phosphor-icons/core/blob/main/LICENSE",
} as const;

export const SIDEBAR_ICON_PATHS = {
  navigation: {
    learn: "/assets/sidebar-icons/learn-home.svg",
    practice: "/assets/sidebar-icons/practice-target.svg",
    analytics: "/assets/sidebar-icons/progress-analytics.svg",
    leaderboard: "/assets/sidebar-icons/progress-leaderboard.svg",
    profile: "/assets/sidebar-icons/account-profile.svg",
  },
  status: {
    streak: "/assets/sidebar-icons/status-streak.svg",
    todayXp: "/assets/sidebar-icons/status-today-xp.svg",
  },
} as const;

export const SIDEBAR_ICON_SOURCES = {
  navigation: {
    learn: "https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/house-fill.svg",
    practice:
      "https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/target-fill.svg",
    analytics:
      "https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/chart-bar-fill.svg",
    leaderboard:
      "https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/trophy-fill.svg",
    profile:
      "https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/user-circle-fill.svg",
  },
  status: {
    streak: "https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/fire-fill.svg",
    todayXp:
      "https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/star-fill.svg",
  },
} as const;

const SIDEBAR_TONES: Record<SidebarNavItemId, SidebarTone> = {
  learn: {
    iconColor: "#d9f5dd",
    iconBackground: "rgba(88, 185, 93, 0.24)",
    iconActiveColor: "#ffffff",
    iconActiveBackground: "#58b95d",
    badgeBackground: "rgba(88, 185, 93, 0.18)",
    badgeBorder: "rgba(140, 224, 82, 0.26)",
    badgeText: "#dff6e2",
  },
  practice: {
    iconColor: "#f5e1ab",
    iconBackground: "rgba(242, 212, 106, 0.24)",
    iconActiveColor: "#5b4310",
    iconActiveBackground: "#f2d46a",
    badgeBackground: "rgba(242, 212, 106, 0.18)",
    badgeBorder: "rgba(242, 212, 106, 0.32)",
    badgeText: "#fff3d2",
  },
  analytics: {
    iconColor: "#cdebf2",
    iconBackground: "rgba(83, 147, 160, 0.24)",
    iconActiveColor: "#ffffff",
    iconActiveBackground: "#2d6876",
    badgeBackground: "rgba(83, 147, 160, 0.16)",
    badgeBorder: "rgba(142, 201, 212, 0.3)",
    badgeText: "#ddf2f5",
  },
  leaderboard: {
    iconColor: "#f7e0a2",
    iconBackground: "rgba(242, 212, 106, 0.25)",
    iconActiveColor: "#5f4510",
    iconActiveBackground: "#f1cf69",
    badgeBackground: "rgba(242, 212, 106, 0.18)",
    badgeBorder: "rgba(242, 212, 106, 0.32)",
    badgeText: "#fff5db",
  },
  profile: {
    iconColor: "#e7fcef",
    iconBackground: "rgba(207, 244, 218, 0.26)",
    iconActiveColor: "#1d3a20",
    iconActiveBackground: "#ebf9ef",
    badgeBackground: "rgba(223, 246, 226, 0.15)",
    badgeBorder: "rgba(223, 246, 226, 0.28)",
    badgeText: "#e8f8ea",
  },
};

function formatCountBadge(value: number) {
  return value > 99 ? "99+" : `${value}`;
}

export const SIDEBAR_STATUS_CARDS: SidebarStatConfig[] = [
  {
    id: "streak",
    label: { en: "Streak", vi: "Chuỗi ngày" },
    caption: { en: "days in a row", vi: "ngày liên tiếp" },
    iconPath: SIDEBAR_ICON_PATHS.status.streak,
    tone: {
      iconColor: "#9a6013",
      iconBackground: "#fff0cb",
      valueColor: "#ffffff",
    },
    getValue: (summary) => (summary ? `${summary.streakDays}` : "--"),
  },
  {
    id: "todayXp",
    label: { en: "Today XP", vi: "XP hôm nay" },
    caption: { en: "earned today", vi: "kiếm hôm nay" },
    iconPath: SIDEBAR_ICON_PATHS.status.todayXp,
    tone: {
      iconColor: "#2f8f46",
      iconBackground: "#ebf8dc",
      valueColor: "#8ce052",
    },
    getValue: (summary) => (summary ? `${summary.todayXp}` : "--"),
  },
];

export const SIDEBAR_NAV_SECTIONS: SidebarNavSectionConfig[] = [
  {
    id: "learning",
    label: { en: "Learning", vi: "Học tập" },
    items: [
      {
        id: "learn",
        href: "/",
        label: { en: "Learn", vi: "Học" },
        mobileLabel: { en: "Learn", vi: "Học" },
        iconPath: SIDEBAR_ICON_PATHS.navigation.learn,
        tone: SIDEBAR_TONES.learn,
      },
      {
        id: "practice",
        href: "/practice",
        label: { en: "Practice", vi: "Luyện tập" },
        mobileLabel: { en: "Practice", vi: "Luyện" },
        iconPath: SIDEBAR_ICON_PATHS.navigation.practice,
        tone: SIDEBAR_TONES.practice,
        getBadge: (summary) => {
          if (!summary || summary.practice.dueMistakeCount <= 0) {
            return null;
          }

          return {
            text: formatCountBadge(summary.practice.dueMistakeCount),
            title: { en: "Mistakes to review", vi: "Lỗi cần ôn" },
          };
        },
      },
    ],
  },
  {
    id: "progress",
    label: { en: "Progress", vi: "Tiến độ" },
    items: [
      {
        id: "analytics",
        href: "/analytics",
        label: { en: "Analytics", vi: "Phân tích" },
        mobileLabel: { en: "Stats", vi: "Chỉ số" },
        iconPath: SIDEBAR_ICON_PATHS.navigation.analytics,
        tone: SIDEBAR_TONES.analytics,
      },
      {
        id: "leaderboard",
        href: "/leaderboard",
        label: { en: "Leaderboard", vi: "Bảng xếp hạng" },
        mobileLabel: { en: "Rank", vi: "BXH" },
        iconPath: SIDEBAR_ICON_PATHS.navigation.leaderboard,
        tone: SIDEBAR_TONES.leaderboard,
        getBadge: (summary) => {
          if (!summary || typeof summary.leaderboard.rank !== "number") {
            return null;
          }

          return {
            text: `#${summary.leaderboard.rank}`,
            title: { en: "Current rank", vi: "Hạng hiện tại" },
          };
        },
      },
    ],
  },
  {
    id: "account",
    label: { en: "Account", vi: "Tài khoản" },
    items: [
      {
        id: "profile",
        href: "/profile",
        label: { en: "Profile", vi: "Hồ sơ" },
        mobileLabel: { en: "Profile", vi: "Hồ sơ" },
        iconPath: SIDEBAR_ICON_PATHS.navigation.profile,
        tone: SIDEBAR_TONES.profile,
      },
    ],
  },
];

export const SIDEBAR_NAV_ITEMS = SIDEBAR_NAV_SECTIONS.flatMap((section) => section.items);

export function isSidebarItemActive(pathname: string, itemId: SidebarNavItemId) {
  if (itemId === "learn") {
    return pathname === "/" || pathname.startsWith("/unit/");
  }

  if (itemId === "practice") {
    return pathname === "/practice" || pathname.startsWith("/practice/");
  }

  return pathname === `/${itemId}`;
}
