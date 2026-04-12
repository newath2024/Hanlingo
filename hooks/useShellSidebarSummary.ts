"use client";

import { useEffect, useMemo, useState } from "react";
import type { ShellSidebarSummaryResponse } from "@/types/shell-sidebar";

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    throw new Error(json.error ?? "Request failed.");
  }

  return json;
}

export function useShellSidebarSummary(refreshKey: string, enabled = true) {
  const [data, setData] = useState<ShellSidebarSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timeZone = useMemo(() => {
    if (typeof window === "undefined") {
      return "UTC";
    }

    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }, []);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ timeZone });
        const response = await fetch(`/api/shell/sidebar-summary?${params.toString()}`, {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const json = await readJson<ShellSidebarSummaryResponse>(response);

        if (!cancelled) {
          setData(json);
        }
      } catch (nextError) {
        if (!cancelled) {
          setData(null);
          setError(
            nextError instanceof Error ? nextError.message : "Unable to load sidebar summary.",
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
  }, [enabled, refreshKey, timeZone]);

  return {
    data,
    isLoading,
    error,
  };
}
