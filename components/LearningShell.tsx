"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LocaleToggle from "@/components/LocaleToggle";
import { useAppLocale } from "@/hooks/useAppLocale";
import { useAuth } from "@/hooks/useAuth";
import { getLocalizedText } from "@/lib/localized";
import { isShellPath } from "@/lib/auth-routes";

type LearningShellProps = {
  children: ReactNode;
};

type NavItem = {
  id: string;
  href: string;
  label: { en: string; vi: string };
  icon: (props: { className?: string }) => ReactNode;
};

function ui(locale: "en" | "vi", en: string, vi: string) {
  return getLocalizedText({ en, vi }, locale);
}

function HomeIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={className}>
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 10.5V20h11V10.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PracticeIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={className}>
      <path d="M12 21c4.4 0 8-3.6 8-8s-3.6-8-8-8-8 3.6-8 8 3.6 8 8 8Z" />
      <path d="M12 3V1.5" strokeLinecap="round" />
      <path d="m10.4 12.6 2.2 2.2 4-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AnalyticsIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={className}>
      <path d="M5 20V11" strokeLinecap="round" />
      <path d="M12 20V7" strokeLinecap="round" />
      <path d="M19 20V4" strokeLinecap="round" />
      <path d="M3 20h18" strokeLinecap="round" />
    </svg>
  );
}

function TrophyIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={className}>
      <path d="M8 4h8v3a4 4 0 0 1-8 0V4Z" strokeLinejoin="round" />
      <path d="M6 5H4a2 2 0 0 0 2 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 5h2a2 2 0 0 1-2 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 11v4" strokeLinecap="round" />
      <path d="M8.5 20h7" strokeLinecap="round" />
      <path d="M9.5 15.5h5" strokeLinecap="round" />
    </svg>
  );
}

function ProfileIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={className}>
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M5 20a7 7 0 0 1 14 0" strokeLinecap="round" />
    </svg>
  );
}

function isItemActive(pathname: string, itemId: string) {
  if (itemId === "learn") {
    return pathname === "/" || pathname.startsWith("/unit/");
  }

  if (itemId === "practice") {
    return pathname === "/practice" || pathname.startsWith("/practice/");
  }

  return pathname === `/${itemId}`;
}

export default function LearningShell({ children }: LearningShellProps) {
  const pathname = usePathname();
  const { locale } = useAppLocale();
  const { user, isLoading, logout } = useAuth();

  if (!isShellPath(pathname)) {
    return <>{children}</>;
  }

  const navItems: NavItem[] = [
    {
      id: "learn",
      href: "/",
      label: { en: "Learn", vi: "Hoc" },
      icon: HomeIcon,
    },
    {
      id: "practice",
      href: "/practice",
      label: { en: "Practice", vi: "Luyen tap" },
      icon: PracticeIcon,
    },
    {
      id: "analytics",
      href: "/analytics",
      label: { en: "Analytics", vi: "Phan tich" },
      icon: AnalyticsIcon,
    },
    {
      id: "leaderboard",
      href: "/leaderboard",
      label: { en: "Leaderboard", vi: "Bang xep hang" },
      icon: TrophyIcon,
    },
    {
      id: "profile",
      href: "/profile",
      label: { en: "Profile", vi: "Ho so" },
      icon: ProfileIcon,
    },
  ];

  return (
    <div className="min-h-screen bg-[#f4efdf]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
        <aside className="hidden w-[270px] shrink-0 flex-col bg-[#14231b] px-5 py-7 text-white lg:flex">
          <Link href="/" className="px-3">
            <span className="font-display text-4xl text-[#8ce052]">Hanlingo</span>
          </Link>

          <nav className="mt-8 flex flex-1 flex-col gap-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isItemActive(pathname, item.id);

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`shell-nav-item ${active ? "shell-nav-item-active" : ""}`}
                >
                  <Icon className="h-6 w-6 shrink-0" />
                  <span>{getLocalizedText(item.label, locale)}</span>
                </Link>
              );
            })}
          </nav>

          <div className="rounded-[1.7rem] border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/55">
              {ui(locale, "Keep going", "Tiep tuc")}
            </p>
            <p className="mt-2 text-sm font-bold text-white/82">
              {ui(
                locale,
                "Start the next lesson before checking stats.",
                "Vao bai tiep theo truoc khi xem thong ke.",
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
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isItemActive(pathname, item.id);

          return (
            <Link
              key={item.id}
              href={item.href}
              className={`shell-mobile-nav__item ${active ? "shell-mobile-nav__item-active" : ""}`}
            >
              <Icon className="h-5 w-5" />
              <span>{getLocalizedText(item.label, locale)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
