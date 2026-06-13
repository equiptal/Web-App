"use client";

import type { ReactNode } from "react";
import { useLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { AuthBrand } from "@/components/auth/AuthBrand";

/**
 * Sign-in layout (web-app/001), reproducing the prototype's split layout (`.auth`): brand panel +
 * form panel, full height. Owns the auth-screen direction (AC-22: `dir="rtl"` for Arabic, scoped to
 * /login) and the fixed language toggle. Locale lives in the shared LocaleProvider → persists across
 * the phone → code steps (AC-23).
 */
export default function LoginLayout({ children }: { children: ReactNode }) {
  const { locale, setLocale } = useLocale();
  return (
    <div dir={locale === "ar" ? "rtl" : "ltr"} className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
      <div className="fixed end-6 top-[18px] z-[300] inline-flex overflow-hidden rounded-[7px] border border-border bg-surface shadow-[0_2px_10px_rgba(28,53,80,0.06)]">
        {(["en", "ar"] as Locale[]).map((l) => (
          <button
            key={l}
            onClick={() => setLocale(l)}
            className={`px-[13px] py-[7px] text-[12px] font-bold ${locale === l ? "bg-navy text-white" : "bg-surface text-muted"}`}
          >
            {l === "en" ? "EN" : "ع"}
          </button>
        ))}
      </div>

      <AuthBrand />

      <div className="flex items-center justify-center bg-surface p-12">{children}</div>
    </div>
  );
}
