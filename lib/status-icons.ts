import type { LeaderboardLeague } from "@/lib/constants/leaderboard";
import type { LeaderboardZoneStatus } from "@/types/leaderboard";

export const STATUS_ICON_LICENSE = {
  pack: "Phosphor Icons Core",
  packUrl: "https://github.com/phosphor-icons/core",
  license: "MIT",
  licenseUrl: "https://github.com/phosphor-icons/core/blob/main/LICENSE",
} as const;

export const STATUS_ICON_PATHS = {
  league: "/assets/status-icons/league-crown.svg",
  zones: {
    promotion: "/assets/status-icons/zone-promotion.svg",
    safe: "/assets/status-icons/zone-safe.svg",
    demotion: "/assets/status-icons/zone-demotion.svg",
  },
  profile: {
    username: "/assets/status-icons/profile-username.svg",
    email: "/assets/status-icons/profile-email.svg",
    xp: "/assets/status-icons/profile-xp.svg",
    lessons: "/assets/status-icons/profile-lessons.svg",
  },
} as const;

export const STATUS_ICON_SOURCES = {
  league: "https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/crown-fill.svg",
  zones: {
    promotion:
      "https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/arrow-circle-up-fill.svg",
    safe: "https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/seal-check-fill.svg",
    demotion:
      "https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/arrow-circle-down-fill.svg",
  },
  profile: {
    username:
      "https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/user-circle-fill.svg",
    email:
      "https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/envelope-simple-fill.svg",
    xp: "https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/star-fill.svg",
    lessons:
      "https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/graduation-cap-fill.svg",
  },
} as const;

export const STATUS_ICON_USAGE = {
  leaderboard: {
    leagueBadge: STATUS_ICON_PATHS.league,
    zones: STATUS_ICON_PATHS.zones,
  },
  profile: STATUS_ICON_PATHS.profile,
} as const;

export type LeagueTone = {
  accent: string;
  badgeBackground: string;
  badgeBorder: string;
  badgeText: string;
};

export const LEAGUE_TONES: Record<LeaderboardLeague, LeagueTone> = {
  bronze: {
    accent: "#b77938",
    badgeBackground: "#fff1e7",
    badgeBorder: "#e2b990",
    badgeText: "#8a4d1d",
  },
  silver: {
    accent: "#7f8ba1",
    badgeBackground: "#eef2f7",
    badgeBorder: "#cfd6e2",
    badgeText: "#4f5d73",
  },
  gold: {
    accent: "#c99612",
    badgeBackground: "#fff6d9",
    badgeBorder: "#ead08a",
    badgeText: "#8a680d",
  },
  sapphire: {
    accent: "#2f6dd5",
    badgeBackground: "#eaf2ff",
    badgeBorder: "#bfd4ff",
    badgeText: "#1f4e9e",
  },
  ruby: {
    accent: "#d44d6c",
    badgeBackground: "#fff0f4",
    badgeBorder: "#f0bfd0",
    badgeText: "#9c2f49",
  },
  emerald: {
    accent: "#1ea56d",
    badgeBackground: "#eafbf3",
    badgeBorder: "#b8ead0",
    badgeText: "#15724c",
  },
  amethyst: {
    accent: "#8b5cf6",
    badgeBackground: "#f3edff",
    badgeBorder: "#d5c5ff",
    badgeText: "#6137bf",
  },
  pearl: {
    accent: "#8fa1ad",
    badgeBackground: "#fbfbfa",
    badgeBorder: "#d9dedd",
    badgeText: "#57656f",
  },
  obsidian: {
    accent: "#303747",
    badgeBackground: "#edf0f5",
    badgeBorder: "#c4cad6",
    badgeText: "#242b38",
  },
  diamond: {
    accent: "#17a3c7",
    badgeBackground: "#e8faff",
    badgeBorder: "#afe3f1",
    badgeText: "#0f7089",
  },
};

export type ZoneTone = {
  accent: string;
  background: string;
  border: string;
  text: string;
};

export const ZONE_TONES: Record<LeaderboardZoneStatus, ZoneTone> = {
  promotion: {
    accent: "#2f8f46",
    background: "#e8f7ec",
    border: "#b7dfc0",
    text: "#1f6932",
  },
  safe: {
    accent: "#2d6876",
    background: "#edf6f7",
    border: "#c8e0e4",
    text: "#254e58",
  },
  demotion: {
    accent: "#c64b5f",
    background: "#ffeff2",
    border: "#f0c3cb",
    text: "#963546",
  },
};
