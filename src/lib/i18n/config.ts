/** Locale + direction configuration. */

export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/**
 * AC-46 (RTL) is `(tentative — PM-confirm)` and STANDARDS § RTL is unresolved (🟡 Q1 in plan.md).
 * The layout is built RTL-capable (logical CSS + a `dir` attribute), but the actual Arabic mirror
 * is gated here. Flip to `true` once STANDARDS confirms full RTL for the web. Arabic *strings*
 * (AC-45) are unaffected by this flag — they render regardless.
 */
export const RTL_ENABLED = false;

export type Dir = "ltr" | "rtl";

export function dirFor(locale: Locale): Dir {
  return RTL_ENABLED && locale === "ar" ? "rtl" : "ltr";
}

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
