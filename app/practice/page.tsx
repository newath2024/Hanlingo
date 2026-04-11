import { redirect } from "next/navigation";
import PracticeHub from "@/components/PracticeHub";

type PracticePageProps = {
  searchParams: Promise<{
    unitId?: string | string[];
    lessonId?: string | string[];
    seed?: string | string[];
    debug?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PracticePage({ searchParams }: PracticePageProps) {
  const params = await searchParams;
  const unitId = firstValue(params.unitId)?.trim();
  const lessonId = firstValue(params.lessonId)?.trim();
  const seed = firstValue(params.seed)?.trim();
  const debug = firstValue(params.debug)?.trim();

  if (unitId || lessonId) {
    const nextParams = new URLSearchParams();

    if (unitId) {
      nextParams.set("unitId", unitId);
    }

    if (lessonId) {
      nextParams.set("lessonId", lessonId);
    }

    if (seed) {
      nextParams.set("seed", seed);
    }

    if (debug) {
      nextParams.set("debug", debug);
    }

    redirect(`/practice/session${nextParams.toString() ? `?${nextParams.toString()}` : ""}`);
  }

  return <PracticeHub />;
}
