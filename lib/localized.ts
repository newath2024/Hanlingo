import type { AppLocale } from "@/types/app-locale";
import type { LocalizedText } from "@/types/curriculum";

export type LocalizedValue = LocalizedText | string | null | undefined;

export function getLocalizedText(
  text?: LocalizedText | null,
  locale: AppLocale = "en",
) {
  if (!text) {
    return "";
  }

  const preferred = text[locale].trim();

  if (preferred) {
    return preferred;
  }

  const fallbackLocale = locale === "en" ? "vi" : "en";
  return text[fallbackLocale].trim();
}

export function getLocalizedValue(
  value: LocalizedValue,
  locale: AppLocale = "en",
) {
  if (!value) {
    return "";
  }

  return typeof value === "string" ? value : getLocalizedText(value, locale);
}
