import type { Metadata } from "next";
import { Baloo_2, Noto_Sans_KR, Nunito } from "next/font/google";
import type { ReactNode } from "react";
import LocaleToggle from "@/components/LocaleToggle";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "600", "700", "800"],
});

const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin", "vietnamese"],
  weight: ["600", "700"],
});

const notoSansKr = Noto_Sans_KR({
  variable: "--font-korean",
  preload: false,
  weight: ["400", "500", "700", "800"],
});

export const metadata: Metadata = {
  title: "Hanlingo",
  description: "A minimal Duolingo-style Korean learning MVP built with Next.js.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${baloo.variable} ${notoSansKr.variable} h-full`}
    >
      <body className="min-h-full">
        <LocaleToggle />
        {children}
      </body>
    </html>
  );
}
