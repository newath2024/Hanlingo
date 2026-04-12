import type { CSSProperties } from "react";
import Link from "next/link";
import MaskedStatusIcon from "@/components/MaskedStatusIcon";
import { getLocalizedText } from "@/lib/localized";
import type { SidebarNavItemConfig } from "@/lib/sidebar-navigation";
import type { AppLocale } from "@/types/app-locale";
import type { ShellSidebarSummaryResponse } from "@/types/shell-sidebar";

function getNavIconShellStyle(item: SidebarNavItemConfig, active: boolean) {
  return {
    backgroundColor: active ? item.tone.iconActiveBackground : item.tone.iconBackground,
    color: active ? item.tone.iconActiveColor : item.tone.iconColor,
  } satisfies CSSProperties;
}

function getBadgeStyle(item: SidebarNavItemConfig) {
  return {
    backgroundColor: item.tone.badgeBackground,
    borderColor: item.tone.badgeBorder,
    color: item.tone.badgeText,
  } satisfies CSSProperties;
}

type SidebarNavItemProps = {
  item: SidebarNavItemConfig;
  active: boolean;
  locale: AppLocale;
  summary: ShellSidebarSummaryResponse | null;
};

export default function SidebarNavItem({
  item,
  active,
  locale,
  summary,
}: SidebarNavItemProps) {
  const badge = item.getBadge?.(summary) ?? null;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`shell-nav-item ${active ? "shell-nav-item-active" : ""}`}
    >
      <span className="shell-nav-item__active-bar" />
      <span className="shell-nav-item__icon-shell" style={getNavIconShellStyle(item, active)}>
        <MaskedStatusIcon path={item.iconPath} size={20} color="currentColor" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{getLocalizedText(item.label, locale)}</span>
      </span>
      {badge ? (
        <span
          className="shell-nav-badge"
          style={getBadgeStyle(item)}
          title={getLocalizedText(badge.title, locale)}
        >
          {badge.text}
        </span>
      ) : null}
    </Link>
  );
}
