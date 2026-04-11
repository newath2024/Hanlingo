"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  HeatmapScopeType,
  UserErrorHeatmapResponse,
} from "@/types/error-heatmap";

type HeatmapQuery = {
  scope?: HeatmapScopeType;
  unitId?: string;
  lessonId?: string;
  limit?: number;
};

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    throw new Error(json.error ?? "Request failed.");
  }

  return json;
}

export function useUserErrorHeatmap(query: HeatmapQuery = {}) {
  const [data, setData] = useState<UserErrorHeatmapResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queryString = useMemo(() => {
    const params = new URLSearchParams();

    if (query.scope) {
      params.set("scope", query.scope);
    }

    if (query.unitId) {
      params.set("unitId", query.unitId);
    }

    if (query.lessonId) {
      params.set("lessonId", query.lessonId);
    }

    if (typeof query.limit === "number") {
      params.set("limit", String(query.limit));
    }

    const serialized = params.toString();
    return serialized ? `?${serialized}` : "";
  }, [query.lessonId, query.limit, query.scope, query.unitId]);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/review/heatmap${queryString}`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      const json = await readJson<UserErrorHeatmapResponse>(response);
      setData(json);
    } catch (nextError) {
      setData(null);
      setError(nextError instanceof Error ? nextError.message : "Unable to load error heatmap.");
    } finally {
      setIsLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    data,
    isLoading,
    error,
    reload,
  };
}
