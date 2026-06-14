/** Locale + direction configuration. */

export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/**
 * AC-46 (RTL): Arabic mirrors the layout right-to-left. The app is built RTL-capable (logical CSS +
 * a `dir` attribute set on <html> by the i18n provider); this enables the mirror for Arabic. Arabic
 * *strings* (AC-45) render regardless of this flag.
 */
export const RTL_ENABLED = true;

export type Dir = "ltr" | "rtl";

export function dirFor(locale: Locale): Dir {
  return RTL_ENABLED && locale === "ar" ? "rtl" : "ltr";
}

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * AC-21: pick the default locale from the browser language (`en`/`ar`) when there is no stored
 * choice. Anything other than Arabic falls back to the default locale.
 */
export function detectLocale(navigatorLanguage: string | undefined): Locale {
  return (navigatorLanguage ?? "").toLowerCase().startsWith("ar") ? "ar" : DEFAULT_LOCALE;
}
