"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import MaskedStatusIcon from "@/components/MaskedStatusIcon";
import LocaleToggle from "@/components/LocaleToggle";
import { useAppLocale } from "@/hooks/useAppLocale";
import { useAuth } from "@/hooks/useAuth";
import { useShellSidebarSummary } from "@/hooks/useShellSidebarSummary";
import { getLocalizedText } from "@/lib/localized";
import { isShellPath } from "@/lib/auth-routes";
import {
  isSidebarItemActive,
  SIDEBAR_NAV_ITEMS,
  SIDEBAR_NAV_SECTIONS,
  SIDEBAR_STATUS_CARDS,
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

function getBadgeStyle(item: SidebarNavItemConfig) {
  return {
    backgroundColor: item.tone.badgeBackground,
    borderColor: item.tone.badgeBorder,
    color: item.tone.badgeText,
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
        <aside
          className="hidden w-[292px] shrink-0 flex-col overflow-y-auto bg-[#14231b] px-5 py-6 text-white lg:flex"
          style={{
            background:
              "radial-gradient(circle at top, rgba(140, 224, 82, 0.14), transparent 34%), radial-gradient(circle at bottom, rgba(242, 212, 106, 0.16), transparent 28%), linear-gradient(180deg, #18261d 0%, #14231b 100%)",
          }}
        >
          <Link href="/" className="px-3">
            <span className="font-display text-4xl text-[#8ce052]">Hanlingo</span>
          </Link>

          <section
            aria-busy={isSidebarSummaryLoading}
            className="mt-7 rounded-[2rem] border border-white/10 bg-white/6 p-4 shadow-[0_18px_40px_rgba(8,16,12,0.22)]"
          >
            <p className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-white/48">
              {ui(locale, "Daily momentum", "Nhip hoc hom nay")}
            </p>
            <p className="mt-2 text-sm font-bold text-white/74">
              {ui(
                locale,
                "Check the streak and today's XP before jumping back in.",
                "Xem streak va XP hom nay truoc khi quay lai bai.",
              )}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {SIDEBAR_STATUS_CARDS.map((card) => (
                <div
                  key={card.id}
                  className="rounded-[1.45rem] border border-white/10 bg-[#102016]/72 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-full"
                      style={{
                        backgroundColor: card.tone.iconBackground,
                        color: card.tone.iconColor,
                      }}
                    >
                      <MaskedStatusIcon path={card.iconPath} size={18} color="currentColor" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[0.68rem] font-black uppercase tracking-[0.18em] text-white/45">
                        {getLocalizedText(card.label, locale)}
                      </p>
                      <p className="truncate text-[0.72rem] font-bold text-white/58">
                        {getLocalizedText(card.caption, locale)}
                      </p>
                    </div>
                  </div>
                  <p
                    className="mt-3 font-display text-4xl leading-none"
                    style={{ color: card.tone.valueColor }}
                  >
                    {card.getValue(sidebarSummary)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <nav className="mt-7 flex flex-1 flex-col gap-6">
            {SIDEBAR_NAV_SECTIONS.map((section) => (
              <div key={section.id} className="space-y-3">
                <p className="px-3 text-[0.68rem] font-black uppercase tracking-[0.24em] text-white/38">
                  {getLocalizedText(section.label, locale)}
                </p>

                <div className="space-y-2">
                  {section.items.map((item) => {
                    const active = isSidebarItemActive(pathname, item.id);
                    const badge = item.getBadge?.(sidebarSummary) ?? null;

                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`shell-nav-item ${active ? "shell-nav-item-active" : ""}`}
                      >
                        <span className="shell-nav-item__active-bar" />
                        <span
                          className="shell-nav-item__icon-shell"
                          style={getNavIconShellStyle(item, active)}
                        >
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
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="rounded-[1.9rem] border border-white/10 bg-white/6 p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/55">
              {ui(locale, "Next push", "Nhip tiep theo")}
            </p>
            <p className="mt-2 text-sm font-bold text-white/82">
              {ui(
                locale,
                "Clear the next lesson, then come back for the mistakes badge.",
                "Qua bai tiep theo, roi quay lai de giam badge loi can on.",
              )}
            </p>
          </div>
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
