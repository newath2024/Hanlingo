"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAppLocale } from "@/hooks/useAppLocale";
import { useHanlingoSnapshot } from "@/hooks/useHanlingoSnapshot";
import { usePracticeOverview } from "@/hooks/usePracticeOverview";
import { getLocalizedText } from "@/lib/localized";
import { getCurrentNode, getCurrentUnit } from "@/lib/units";
import type { AppLocale } from "@/types/app-locale";

function ui(locale: AppLocale, en: string, vi: string) {
  return getLocalizedText({ en, vi }, locale);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default function PracticeHub() {
  const { locale } = useAppLocale();
  const { progress } = useHanlingoSnapshot("practice-hub", []);
  const { data, isLoading, error } = usePracticeOverview();
  const activeUnit = getCurrentUnit(progress);
  const activeNode = activeUnit ? getCurrentNode(activeUnit, progress) : null;

  const suggestedDrills = useMemo(() => {
    const drills: Array<{
      id: string;
      eyebrow: string;
      title: string;
      summary: string;
      href: string;
      cta: string;
      tone: string;
    }> = [];

    if ((data?.dueMistakeCount ?? 0) > 0) {
      drills.push({
        id: "due-mistakes",
        eyebrow: ui(locale, "Top priority", "Uu tien cao nhat"),
        title: ui(
          locale,
          `${data?.dueMistakeCount ?? 0} due mistakes are ready.`,
          `${data?.dueMistakeCount ?? 0} loi sai den han da san sang.`,
        ),
        summary: ui(
          locale,
          "Clear the queue before those mistakes harden.",
          "Giai phong hang doi loi truoc khi chung cung co.",
        ),
        href: "/practice/mistakes",
        cta: ui(locale, "Practice mistakes", "Luyen loi sai"),
        tone: "bg-danger-soft",
      });
    }

    if (data?.weakLessons[0]) {
      drills.push({
        id: "weak-lesson",
        eyebrow: ui(locale, "Weak lesson", "Bai dang yeu"),
        title: data.weakLessons[0].label,
        summary: ui(
          locale,
          `${data.weakLessons[0].wrongCount} wrong answers and ${formatPercent(data.weakLessons[0].accuracy)} accuracy.`,
          `${data.weakLessons[0].wrongCount} loi sai va ${formatPercent(data.weakLessons[0].accuracy)} do chinh xac.`,
        ),
        href: `/practice/session?lessonId=${encodeURIComponent(data.weakLessons[0].scopeId)}`,
        cta: ui(locale, "Practice now", "Luyen ngay"),
        tone: "bg-card-strong",
      });
    }

    if (activeUnit) {
      drills.push({
        id: "focused-review",
        eyebrow: ui(locale, "Current unit", "Unit hien tai"),
        title: ui(
          locale,
          `Focused review for Unit ${activeUnit.unitNumber}.`,
          `On co trong tam cho Unit ${activeUnit.unitNumber}.`,
        ),
        summary: activeNode
          ? ui(
              locale,
              `Stay close to ${getLocalizedText(activeNode.title, locale)} while reinforcing weak spots.`,
              `Giu sat ${getLocalizedText(activeNode.title, locale)} trong luc gia co diem yeu.`,
            )
          : ui(
              locale,
              "Review the active unit without leaving your current path too far behind.",
              "On lai unit dang hoc ma khong lech qua xa khoi lo trinh hien tai.",
            ),
        href: `/practice/session?unitId=${encodeURIComponent(activeUnit.id)}`,
        cta: ui(locale, "Start focused review", "Bat dau on trong tam"),
        tone: "bg-accent-cool",
      });
    }

    drills.push({
      id: "balanced-practice",
      eyebrow: ui(locale, "Fallback", "Du phong"),
      title: ui(locale, "Run a balanced practice set.", "Lam mot bo luyen tap can bang."),
      summary: ui(
        locale,
        "Use this when you want forward motion plus a little cleanup.",
        "Dung muc nay khi ban muon vua di tiep vua don lai diem yeu.",
      ),
      href: "/practice/session",
      cta: ui(locale, "Start balanced set", "Bat dau bo can bang"),
      tone: "bg-white",
    });

    return drills;
  }, [activeNode, activeUnit, data, locale]);

  return (
    <main className="shell-page">
      <section className="panel overflow-hidden">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <span className="pill bg-accent text-white">
              {ui(locale, "Practice", "Luyen tap")}
            </span>
            <div className="space-y-3">
              <h1 className="font-display text-4xl leading-tight text-foreground sm:text-6xl">
                {ui(
                  locale,
                  "Practice what needs attention, not another dashboard.",
                  "Luyen dung phan can chu y, khong phai them mot dashboard nua.",
                )}
              </h1>
              <p className="max-w-2xl text-lg font-bold text-muted-foreground">
                {ui(
                  locale,
                  "Every button here should send you straight into a useful drill.",
                  "Moi nut o day deu phai dua ban vao mot drill co ich ngay lap tuc.",
                )}
              </p>
            </div>
          </div>

          <div className="w-full max-w-[360px] rounded-[2rem] bg-[#18261d] p-5 text-white shadow-[0_24px_64px_rgba(20,35,27,0.22)]">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-white/58">
              {ui(locale, "Immediate action", "Hanh dong ngay")}
            </p>
            <h2 className="mt-4 font-display text-4xl leading-tight text-white">
              {data?.dueMistakeCount
                ? ui(locale, "Clear your due mistakes first.", "Xoa loi sai den han truoc.")
                : ui(locale, "No due mistakes. Keep the streak moving.", "Khong co loi den han. Giu nhip hoc tiep.")}
            </h2>
            <p className="mt-3 text-sm font-bold text-white/68">
              {data?.dueMistakeCount
                ? ui(
                    locale,
                    `${data.dueMistakeCount} items are ready to return to your queue right now.`,
                    `${data.dueMistakeCount} muc dang san sang quay lai hang doi ngay luc nay.`,
                  )
                : ui(
                    locale,
                    "Go into a balanced or focused set and keep learning momentum up.",
                    "Vao bo can bang hoac bo trong tam de giu dong hoc lien tuc.",
                  )}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Link
                href={data?.dueMistakeCount ? "/practice/mistakes" : "/practice/session"}
                className="primary-button w-full border-0 bg-[#8ce052] text-[#14231b] hover:bg-[#9bea66]"
              >
                {data?.dueMistakeCount
                  ? ui(locale, "Practice mistakes", "Luyen loi sai")
                  : ui(locale, "Start balanced set", "Bat dau bo can bang")}
              </Link>
              {activeUnit ? (
                <Link
                  href={`/practice/session?unitId=${encodeURIComponent(activeUnit.id)}`}
                  className="inline-flex w-full items-center justify-center rounded-full border border-white/12 bg-white/8 px-6 py-3.5 text-base font-extrabold text-white transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/12"
                >
                  {ui(locale, "Focused review", "On trong tam")}
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-6 rounded-[1.8rem] bg-card-soft px-5 py-4 text-base font-bold text-muted-foreground">
            {ui(locale, "Loading recommended drills...", "Dang tai drill de xuat...")}
          </div>
        ) : null}

        {error ? <div className="mt-6 feedback-incorrect">{error}</div> : null}
      </section>

      <section className="panel">
        <div className="space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground">
                {ui(locale, "Suggested drills", "Drill de xuat")}
              </p>
              <h2 className="mt-2 font-display text-3xl text-foreground">
                {ui(locale, "Start with the most useful move right now.", "Bat dau bang nuoc di co ich nhat luc nay.")}
              </h2>
            </div>
            {data ? (
              <span className="pill bg-card-strong text-foreground">
                {ui(
                  locale,
                  `${data.totalWrong} total wrong / ${formatPercent(data.overallAccuracy)} accuracy`,
                  `${data.totalWrong} loi sai / ${formatPercent(data.overallAccuracy)} do chinh xac`,
                )}
              </span>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {suggestedDrills.map((drill) => (
              <article
                key={drill.id}
                className={`rounded-[1.9rem] border border-accent/10 ${drill.tone} p-5 shadow-[0_12px_28px_rgba(47,92,51,0.08)] transition hover:scale-[1.01]`}
              >
                <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
                  {drill.eyebrow}
                </p>
                <h3 className="mt-3 font-display text-3xl text-foreground">{drill.title}</h3>
                <p className="mt-2 text-sm font-bold text-muted-foreground">{drill.summary}</p>
                <Link href={drill.href} className="primary-button mt-5 w-full">
                  {drill.cta}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="space-y-5">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground">
              {ui(locale, "Weak topics", "Muc dang yeu")}
            </p>
            <h2 className="mt-2 font-display text-3xl text-foreground">
              {ui(locale, "Turn weak spots into concrete practice.", "Bien diem yeu thanh hanh dong luyen tap cu the.")}
            </h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_0.95fr]">
            <div className="space-y-4">
              {data?.weakLessons.length ? (
                data.weakLessons.map((entry) => (
                  <article
                    key={entry.scopeId}
                    className="rounded-[1.8rem] border border-accent/10 bg-white p-5 shadow-[0_12px_28px_rgba(47,92,51,0.07)]"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-2">
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
                          {ui(locale, "Weak lesson", "Bai dang yeu")}
                        </p>
                        <h3 className="font-display text-3xl text-foreground">{entry.label}</h3>
                        <p className="text-sm font-bold text-muted-foreground">
                          {ui(
                            locale,
                            `${entry.wrongCount} wrong / ${formatPercent(entry.accuracy)} accuracy`,
                            `${entry.wrongCount} loi sai / ${formatPercent(entry.accuracy)} do chinh xac`,
                          )}
                        </p>
                      </div>

                      <Link
                        href={`/practice/session?lessonId=${encodeURIComponent(entry.scopeId)}`}
                        className="primary-button w-full md:max-w-[220px]"
                      >
                        {ui(locale, "Practice now", "Luyen ngay")}
                      </Link>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-[1.8rem] bg-card-soft px-5 py-6 text-base font-bold text-muted-foreground">
                  {ui(
                    locale,
                    "Weak lesson recommendations will appear after a few more answered questions.",
                    "Goi y bai dang yeu se hien ra sau khi ban tra loi them mot it cau nua.",
                  )}
                </div>
              )}
            </div>

            <div className="rounded-[1.8rem] border border-accent/10 bg-card-soft p-5">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">
                {ui(locale, "Weak skills", "Ky nang dang yeu")}
              </p>

              {data?.weakSkills.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {data.weakSkills.map((entry) => (
                    <span key={`${entry.scopeType}-${entry.scopeId}`} className="pill bg-white text-foreground">
                      {entry.label}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm font-bold text-muted-foreground">
                  {ui(locale, "No clear weak skill yet.", "Chua co ky nang yeu ro rang.")}
                </p>
              )}

              <div className="mt-5 rounded-[1.5rem] bg-white px-4 py-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
                  {ui(locale, "Fallback move", "Nuoc di du phong")}
                </p>
                <p className="mt-2 text-base font-extrabold text-foreground">
                  {ui(
                    locale,
                    "No obvious weakness? Run a balanced set and keep the path warm.",
                    "Khong co diem yeu ro rang? Lam mot bo can bang de giu nong lo trinh.",
                  )}
                </p>
                <Link href="/practice/session" className="secondary-button mt-4 w-full">
                  {ui(locale, "Open balanced practice", "Mo luyen tap can bang")}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
