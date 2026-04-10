"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AuthContext } from "@/components/providers/AuthProvider";
import {
  clearLegacyProgressBundle,
  hasLegacyProgressBundle,
  loadLegacyProgressBundle,
} from "@/lib/storage";
import {
  createDefaultUserProgressState,
  getReviewForCard,
  isUserProgressEmpty,
  sanitizeUserProgressState,
  type UserProgressState,
} from "@/lib/progress-state";
import { scheduleNextReview, type ReviewRating } from "@/lib/review";

type SessionCompleteInput = {
  lessonId: string;
  nodeId: string;
  unitId: string;
  score: number;
  totalQuestions: number;
  awardedXp: number;
  completeUnit: boolean;
  errorPatternMisses: Record<string, number>;
  sentenceExposureDeltas: Record<string, number>;
};

type UserProgressContextValue = {
  progress: UserProgressState;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  importLocalProgress: () => Promise<boolean>;
  saveReview: (input: {
    lessonId: string;
    word: string;
    rating: ReviewRating;
  }) => Promise<void>;
  completeSession: (
    input: SessionCompleteInput,
  ) => Promise<{ nodeCompletedNow: boolean; unitCompletedNow: boolean }>;
};

export const UserProgressContext = createContext<UserProgressContextValue | null>(null);

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    throw new Error(json.error ?? "Request failed.");
  }

  return json;
}

export default function UserProgressProvider({ children }: { children: ReactNode }) {
  const auth = useContext(AuthContext);
  const [progress, setProgress] = useState<UserProgressState>(createDefaultUserProgressState);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const importAttemptedRef = useRef(false);

  if (!auth) {
    throw new Error("UserProgressProvider requires AuthProvider.");
  }

  const reload = useCallback(async () => {
    if (auth.isLoading) {
      setIsLoading(true);
      return;
    }

    if (!auth.user) {
      setProgress(createDefaultUserProgressState());
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/progress/me", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      const json = await readJson<{ progress: UserProgressState }>(response);
      setProgress(sanitizeUserProgressState(json.progress));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load progress.");
      setProgress(createDefaultUserProgressState());
    } finally {
      setIsLoading(false);
    }
  }, [auth.isLoading, auth.user]);

  const importLocalProgress = useCallback(async () => {
    if (!auth.user) {
      return false;
    }

    const legacyBundle = loadLegacyProgressBundle();

    if (isUserProgressEmpty(legacyBundle)) {
      return false;
    }

    const response = await fetch("/api/progress/import-local", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        progress: {
          xp: legacyBundle.xp,
          completedLessons: legacyBundle.completedLessons,
          claimedStepRewards: legacyBundle.claimedStepRewards,
          completedNodes: legacyBundle.completedNodes,
          completedUnits: legacyBundle.completedUnits,
          nodeRuns: legacyBundle.nodeRuns,
          errorPatternMisses: legacyBundle.errorPatternMisses,
        },
        reviews: legacyBundle.reviews,
        sentenceExposures: legacyBundle.sentenceExposures,
      }),
    });
    const json = await readJson<{ imported: boolean; progress: UserProgressState }>(response);

    setProgress(sanitizeUserProgressState(json.progress));

    if (json.imported) {
      clearLegacyProgressBundle();
    }

    return json.imported;
  }, [auth.user]);

  useEffect(() => {
    importAttemptedRef.current = false;
    if (auth.isLoading) {
      setIsLoading(true);
      return;
    }

    void reload();
  }, [auth.isLoading, auth.user?.id, reload]);

  useEffect(() => {
    if (auth.isLoading || !auth.user || isLoading || importAttemptedRef.current) {
      return;
    }

    if (
      progress.importedFromLocalAt ||
      !isUserProgressEmpty(progress) ||
      !hasLegacyProgressBundle()
    ) {
      importAttemptedRef.current = true;
      return;
    }

    importAttemptedRef.current = true;

    void importLocalProgress().catch(() => {
      importAttemptedRef.current = false;
    });
  }, [auth.isLoading, auth.user, importLocalProgress, isLoading, progress]);

  const saveReview = useCallback(async (input: {
    lessonId: string;
    word: string;
    rating: ReviewRating;
  }) => {
    const optimisticReview = scheduleNextReview(
      getReviewForCard(progress.reviews, input.lessonId, input.word),
      input.rating,
    );
    const previousProgress = progress;

    setProgress((current) =>
      sanitizeUserProgressState({
        ...current,
        reviews: {
          ...current.reviews,
          [`${input.lessonId}:${input.word}`]: optimisticReview,
        },
      }),
    );
    setError(null);

    try {
      const response = await fetch("/api/progress/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify(input),
      });
      const json = await readJson<{ progress: UserProgressState }>(response);
      setProgress(sanitizeUserProgressState(json.progress));
    } catch (nextError) {
      setProgress(previousProgress);
      setError(nextError instanceof Error ? nextError.message : "Unable to save review.");
      throw nextError;
    }
  }, [progress]);

  const completeSession = useCallback(async (input: SessionCompleteInput) => {
    setError(null);

    const response = await fetch("/api/progress/session-complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify(input),
    });
    const json = await readJson<{
      progress: UserProgressState;
      nodeCompletedNow: boolean;
      unitCompletedNow: boolean;
    }>(response);

    setProgress(sanitizeUserProgressState(json.progress));

    return {
      nodeCompletedNow: json.nodeCompletedNow,
      unitCompletedNow: json.unitCompletedNow,
    };
  }, []);

  const value = useMemo(
    () => ({
      progress,
      isLoading,
      error,
      reload,
      importLocalProgress,
      saveReview,
      completeSession,
    }),
    [completeSession, error, importLocalProgress, isLoading, progress, reload, saveReview],
  );

  return <UserProgressContext.Provider value={value}>{children}</UserProgressContext.Provider>;
}
