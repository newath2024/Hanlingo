"use client";

import { useEffect, useState } from "react";
import type { PracticeOverviewResponse } from "@/types/practice-overview";

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    throw new Error(json.error ?? "Request failed.");
  }

  return json;
}

export function usePracticeOverview() {
  const [data, setData] = useState<PracticeOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/practice/overview", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const json = await readJson<PracticeOverviewResponse>(response);

        if (!cancelled) {
          setData(json);
        }
      } catch (nextError) {
        if (!cancelled) {
          setData(null);
          setError(
            nextError instanceof Error ? nextError.message : "Unable to load practice overview.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    data,
    isLoading,
    error,
  };
}
