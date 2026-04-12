"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import MaskedStatusIcon from "@/components/MaskedStatusIcon";
import LocaleToggle from "@/components/LocaleToggle";
import SidebarBrand from "@/components/sidebar/SidebarBrand";
import SidebarFooter from "@/components/sidebar/SidebarFooter";
import SidebarMomentumCard from "@/components/sidebar/SidebarMomentumCard";
import SidebarNavSection from "@/components/sidebar/SidebarNavSection";
import { useAppLocale } from "@/hooks/useAppLocale";
import { useAuth } from "@/hooks/useAuth";
import { useShellSidebarSummary } from "@/hooks/useShellSidebarSummary";
import { getLocalizedText } from "@/lib/localized";
import { isShellPath } from "@/lib/auth-routes";
import {
  isSidebarItemActive,
  SIDEBAR_NAV_ITEMS,
  SIDEBAR_NAV_SECTIONS,
  type SidebarNavItemConfig,
} from "@/lib/sidebar-navigation";

type LearningShellProps = {
  children: ReactNode;
};

function ui(locale: "en" | "vi", en: string, vi: string) {
  return getLocalizedText({ en, vi }, locale);
}

function getNavIconShellStyle(item: SidebarNavItemConfig, active: boolean) {
  return {
    backgroundColor: active ? item.tone.iconActiveBackground : item.tone.iconBackground,
    color: active ? item.tone.iconActiveColor : item.tone.iconColor,
  } satisfies CSSProperties;
}

export default function LearningShell({ children }: LearningShellProps) {
  const pathname = usePathname();
  const { locale } = useAppLocale();
  const { user, isLoading, logout } = useAuth();
  const shouldRenderShell = isShellPath(pathname);
  const { data: sidebarSummary, isLoading: isSidebarSummaryLoading } =
    useShellSidebarSummary(pathname, shouldRenderShell);

  if (!shouldRenderShell) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[#f4efdf]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
        <aside className="sidebar-desktop-shell">
          <SidebarBrand locale={locale} />
          <SidebarMomentumCard
            locale={locale}
            summary={sidebarSummary}
            isLoading={isSidebarSummaryLoading}
          />

          <nav className="mt-7 flex flex-1 flex-col gap-6">
            {SIDEBAR_NAV_SECTIONS.map((section) => (
              <SidebarNavSection
                key={section.id}
                locale={locale}
                pathname={pathname}
                section={section}
                summary={sidebarSummary}
              />
            ))}
          </nav>

          <SidebarFooter locale={locale} summary={sidebarSummary} isLoading={isSidebarSummaryLoading} />
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-accent/10 bg-[#f4efdf]/92 px-4 py-4 backdrop-blur-md sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
                  {ui(locale, "Guided path", "Lo trinh dan huong")}
                </p>
                <p className="truncate text-sm font-bold text-foreground">
                  {ui(locale, "Open the next lesson, then practice what slips.", "Mo bai tiep theo, sau do luyen phan bi truot.")}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-3 rounded-full border border-accent/10 bg-white/90 px-3 py-2 shadow-[0_12px_28px_rgba(47,92,51,0.1)]">
                <LocaleToggle />
                {!isLoading && user ? (
                  <>
                    <div className="hidden min-w-[120px] text-right sm:block">
                      <p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-muted-foreground">
                        {ui(locale, "Signed in", "Dang nhap")}
                      </p>
                      <p className="text-sm font-extrabold text-foreground">@{user.username}</p>
                    </div>
                    <button type="button" onClick={() => void logout()} className="secondary-button py-2">
                      {ui(locale, "Logout", "Dang xuat")}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </header>

          <div className="flex-1 pb-24 lg:pb-8">
            {children}
          </div>
        </div>
      </div>

      <nav className="shell-mobile-nav lg:hidden">
        {SIDEBAR_NAV_ITEMS.map((item) => {
          const active = isSidebarItemActive(pathname, item.id);

          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`shell-mobile-nav__item ${active ? "shell-mobile-nav__item-active" : ""}`}
            >
              <span
                className="shell-mobile-nav__icon-shell"
                style={getNavIconShellStyle(item, active)}
              >
                <MaskedStatusIcon path={item.iconPath} size={18} color="currentColor" />
              </span>
              <span>{getLocalizedText(item.mobileLabel, locale)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
