import { redirect } from "next/navigation";

type ErrorPracticePageProps = {
  searchParams: Promise<{
    seed?: string | string[];
    debug?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ErrorPracticePage({ searchParams }: ErrorPracticePageProps) {
  const params = await searchParams;
  const nextParams = new URLSearchParams();
  const seed = firstValue(params.seed)?.trim();
  const debug = firstValue(params.debug)?.trim();

  if (seed) {
    nextParams.set("seed", seed);
  }

  if (debug) {
    nextParams.set("debug", debug);
  }

  redirect(`/practice/mistakes${nextParams.toString() ? `?${nextParams.toString()}` : ""}`);
}
