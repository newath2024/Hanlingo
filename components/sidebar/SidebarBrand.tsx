import Link from "next/link";
import { getLocalizedText } from "@/lib/localized";
import type { AppLocale } from "@/types/app-locale";

function ui(locale: AppLocale, en: string, vi: string) {
  return getLocalizedText({ en, vi }, locale);
}

type SidebarBrandProps = {
  locale: AppLocale;
};

export default function SidebarBrand({ locale }: SidebarBrandProps) {
  return (
    <section className="sidebar-brand-zone">
      <div className="sidebar-brand-glow" aria-hidden />
      <Link href="/" className="sidebar-brand-card">
        <span className="sidebar-brand__eyebrow">
          {ui(locale, "Korean learning path", "Lộ trình tiếng Hàn")}
        </span>
        <span className="sidebar-brand__wordmark">Hanlingo</span>
        <p className="sidebar-brand__support">
          {ui(
            locale,
            "Focused Korean study with game energy.",
            "Học tiếng Hàn gọn, có nhịp, có hướng.",
          )}
        </p>
      </Link>
    </section>
  );
}
