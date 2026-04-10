"use client";

import { useAppLocale } from "@/hooks/useAppLocale";
import { getLocalizedText } from "@/lib/localized";
import Link from "next/link";

export default function NotFoundPage() {
  const { locale } = useAppLocale();
  const ui = (en: string, vi: string) => getLocalizedText({ en, vi }, locale);

  return (
    <main className="page-shell">
      <section className="panel max-w-2xl text-center">
        <span className="pill mx-auto bg-accent-warm/70 text-foreground">404</span>
        <h1 className="mt-4 font-display text-4xl text-foreground">
          {ui("Path not found", "Khong tim thay duong dan")}
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          {ui(
            "This route does not map to a local unit or node yet.",
            "Duong dan nay chua tro toi unit hoac node nao trong may.",
          )}
        </p>
        <div className="mt-6 flex justify-center">
          <Link href="/" className="primary-button">
            {ui("Back to home", "Ve trang chu")}
          </Link>
        </div>
      </section>
    </main>
  );
}
