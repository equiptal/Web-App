"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { en, type Dictionary } from "./en";
import { ar } from "./ar";
import { DEFAULT_LOCALE, detectLocale, dirFor, isLocale, type Dir, type Locale } from "./config";

const DICTS: Record<Locale, Dictionary> = { en, ar };
const STORAGE_KEY = "moedatech.locale";

interface LocaleContextValue {
  locale: Locale;
  dir: Dir;
  setLocale: (l: Locale) => void;
  t: Dictionary;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  /**
   * Which language this visit is in, decided once on mount, in order:
   *
   *   1. **`?lang=`** — the URL asked for it out loud. This is where a locale-prefixed link lands:
   *      the edge turns `/ar/requests` into `/requests?lang=ar` (see `localePrefix` in
   *      `middleware.ts`, owner 2026-09-08), and the public bid form has always read this parameter.
   *      It is treated as a CHOICE, so it is persisted like one — a renter who followed an Arabic
   *      link stays in Arabic on his next page.
   *   2. a choice he made before, out of `localStorage`
   *   3. the browser's own language (AC-21)
   *
   * ⚠️ The parameter is stripped from the URL afterwards. Left in place it would ride into every
   * link he copies, and it would out-rank the language switcher on the next reload — pressing
   * «عربي» on a page still carrying `?lang=en` and having it revert is the bug that shape causes.
   */
  useEffect(() => {
    if (typeof window !== "undefined") {
      const asked = new URLSearchParams(window.location.search).get("lang");
      if (asked && isLocale(asked)) {
        setLocaleState(asked);
        try {
          window.localStorage.setItem(STORAGE_KEY, asked);
        } catch {
          /* ignore */
        }
        const url = new URL(window.location.href);
        url.searchParams.delete("lang");
        window.history.replaceState(window.history.state, "", url.toString());
        return;
      }
    }
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (stored && isLocale(stored)) {
      setLocaleState(stored);
      return;
    }
    if (typeof navigator !== "undefined") setLocaleState(detectLocale(navigator.language));
  }, []);

  // Keep <html lang/dir> in sync.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dirFor(locale);
  }, [locale]);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  };

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, dir: dirFor(locale), setLocale, t: DICTS[locale] }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

function useLocaleContext(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useT/useLocale must be used within <LocaleProvider>");
  return ctx;
}

/** Returns the active dictionary (typed). Access strings directly: `t.intake.tabRfq`. */
export function useT(): Dictionary {
  return useLocaleContext().t;
}

/** Locale + direction controls. */
export function useLocale() {
  const { locale, dir, setLocale } = useLocaleContext();
  return { locale, dir, setLocale };
}

/** Interpolate `{name}` placeholders in a template string. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

export type { Dictionary, Locale, Dir };
