"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { en, type Dictionary } from "./en";
import { ar } from "./ar";
import { DEFAULT_LOCALE, dirFor, isLocale, type Dir, type Locale } from "./config";

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

  // Restore a persisted choice on mount.
  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (stored && isLocale(stored)) setLocaleState(stored);
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
