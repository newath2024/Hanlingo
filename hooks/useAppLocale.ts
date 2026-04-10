"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_APP_LOCALE,
  loadAppLocale,
  saveAppLocale,
  subscribeToHanlingoStorage,
} from "@/lib/storage";

export function useAppLocale() {
  const locale = useSyncExternalStore(
    subscribeToHanlingoStorage,
    loadAppLocale,
    () => DEFAULT_APP_LOCALE,
  );

  return {
    locale,
    setLocale: saveAppLocale,
  };
}
