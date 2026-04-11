"use client";

import { useEffect, useMemo, useState } from "react";
import type { AnalyticsOverviewResponse } from "@/types/analytics";

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    throw new Error(json.error ?? "Request failed.");
  }

  return json;
}

export function useAnalyticsOverview() {
  const [data, setData] = useState<AnalyticsOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timeZone = useMemo(() => {
    if (typeof window === "undefined") {
      return "UTC";
    }

    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ timeZone });
        const response = await fetch(`/api/analytics/overview?${params.toString()}`, {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const json = await readJson<AnalyticsOverviewResponse>(response);

        if (!cancelled) {
          setData(json);
        }
      } catch (nextError) {
        if (!cancelled) {
          setData(null);
          setError(
            nextError instanceof Error ? nextError.message : "Unable to load analytics overview.",
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
  }, [timeZone]);

  return {
    data,
    isLoading,
    error,
  };
}
