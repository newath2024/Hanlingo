"use client";

import type { AppLocale } from "@/types/app-locale";
import {
  createDefaultUserProgressState,
  isUserProgressEmpty,
  sanitizeProgressState,
  sanitizeReviewMap,
  sanitizeSentenceExposureMap,
  type ReviewMap,
  type SentenceExposureMap,
  type UserProgressState,
} from "@/lib/progress-state";

export const PROGRESS_STORAGE_KEY = "hanlingo-progress";
export const REVIEW_STORAGE_KEY = "hanlingo-reviews";
export const APP_LOCALE_STORAGE_KEY = "hanlingo-locale";
export const SENTENCE_EXPOSURE_STORAGE_KEY = "hanlingo-sentence-exposures";
export const DEFAULT_APP_LOCALE: AppLocale = "en";
const STORAGE_EVENT_NAME = "hanlingo-storage-change";

function isBrowser() {
  return typeof window !== "undefined";
}

function readStorage<T>(key: string, fallback: T): T {
  if (!isBrowser()) {
    return fallback;
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? (JSON.parse(rawValue) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(STORAGE_EVENT_NAME));
}

function removeStorage(key: string) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(key);
  window.dispatchEvent(new Event(STORAGE_EVENT_NAME));
}

function normalizeAppLocale(value: unknown): AppLocale {
  return value === "vi" ? "vi" : DEFAULT_APP_LOCALE;
}

export function subscribeToHanlingoStorage(callback: () => void) {
  if (!isBrowser()) {
    return () => undefined;
  }

  const listener = () => {
    callback();
  };

  window.addEventListener("storage", listener);
  window.addEventListener(STORAGE_EVENT_NAME, listener);

  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(STORAGE_EVENT_NAME, listener);
  };
}

export function loadAppLocale() {
  return normalizeAppLocale(readStorage<AppLocale>(APP_LOCALE_STORAGE_KEY, DEFAULT_APP_LOCALE));
}

export function saveAppLocale(locale: AppLocale) {
  writeStorage(APP_LOCALE_STORAGE_KEY, normalizeAppLocale(locale));
}

export function loadLegacyProgressBundle(): UserProgressState {
  const progress = sanitizeProgressState(readStorage(PROGRESS_STORAGE_KEY, {}));
  const reviews = sanitizeReviewMap(readStorage(REVIEW_STORAGE_KEY, {}));
  const sentenceExposures = sanitizeSentenceExposureMap(
    readStorage(SENTENCE_EXPOSURE_STORAGE_KEY, {}),
  );

  return {
    ...createDefaultUserProgressState(),
    ...progress,
    reviews,
    sentenceExposures,
  };
}

export function hasLegacyProgressBundle() {
  return !isUserProgressEmpty(loadLegacyProgressBundle());
}

export function clearLegacyProgressBundle() {
  removeStorage(PROGRESS_STORAGE_KEY);
  removeStorage(REVIEW_STORAGE_KEY);
  removeStorage(SENTENCE_EXPOSURE_STORAGE_KEY);
}

export type { ReviewMap, SentenceExposureMap, UserProgressState };
