import { getLocalizedText } from "@/lib/localized";
import {
  isSidebarItemActive,
  type SidebarNavSectionConfig,
} from "@/lib/sidebar-navigation";
import type { AppLocale } from "@/types/app-locale";
import type { ShellSidebarSummaryResponse } from "@/types/shell-sidebar";
import SidebarNavItem from "@/components/sidebar/SidebarNavItem";

type SidebarNavSectionProps = {
  locale: AppLocale;
  pathname: string;
  section: SidebarNavSectionConfig;
  summary: ShellSidebarSummaryResponse | null;
};

export default function SidebarNavSection({
  locale,
  pathname,
  section,
  summary,
}: SidebarNavSectionProps) {
  return (
    <div className="sidebar-nav-section">
      <p className="sidebar-nav-section__label">{getLocalizedText(section.label, locale)}</p>
      <div className="sidebar-nav-section__tray">
        {section.items.map((item) => (
          <SidebarNavItem
            key={item.id}
            item={item}
            active={isSidebarItemActive(pathname, item.id)}
            locale={locale}
            summary={summary}
          />
        ))}
      </div>
    </div>
  );
}
