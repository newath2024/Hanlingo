"use client";

import { useAppLocale } from "@/hooks/useAppLocale";

export default function LocaleToggle() {
  const { locale, setLocale } = useAppLocale();

  return (
    <div className="fixed right-4 top-4 z-50 sm:right-6 sm:top-6">
      <div className="inline-flex rounded-full border border-accent/15 bg-white/95 p-1 shadow-[0_16px_30px_rgba(47,92,51,0.14)] backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setLocale("en")}
          className={`rounded-full px-4 py-2 text-sm font-extrabold transition ${
            locale === "en"
              ? "bg-accent text-white"
              : "text-muted-foreground hover:bg-card-strong"
          }`}
          aria-pressed={locale === "en"}
        >
          EN
        </button>
        <button
          type="button"
          onClick={() => setLocale("vi")}
          className={`rounded-full px-4 py-2 text-sm font-extrabold transition ${
            locale === "vi"
              ? "bg-accent text-white"
              : "text-muted-foreground hover:bg-card-strong"
          }`}
          aria-pressed={locale === "vi"}
        >
          VI
        </button>
      </div>
    </div>
  );
}
