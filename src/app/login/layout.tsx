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
      <div className="fixed end-6 top-[18px] z-[300] inline-flex overflow-hidden rounded-sm border border-border bg-surface">
        {(["en", "ar"] as Locale[]).map((l) => (
          <button
            key={l}
            onClick={() => setLocale(l)}
            className={`px-3 py-2 text-meta font-semibold ${locale === l ? "bg-navy text-white" : "bg-surface text-muted"}`}
          >
            {l === "en" ? "EN" : "ع"}
          </button>
        ))}
      </div>

      <AuthBrand />

      {/* Form panel. Desktop (lg+): white surface beside the navy brand panel.
          Mobile (< lg, where the brand panel is hidden): navy backdrop with the form in a white card. */}
      <div className="relative flex items-center justify-center p-6 lg:bg-surface lg:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 lg:hidden"
          style={{ background: "linear-gradient(165deg,var(--navy),var(--navy-deep))" }}
        />
        <div className="relative z-[1] w-full max-w-[380px]">
          {/* Mobile-only white brand mark above the card (desktop shows it in the navy panel). */}
          <div className="mb-6 flex items-center lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/moedatech-logo.png" alt="Moedatech" className="h-8 w-auto [filter:brightness(0)_invert(1)]" />
          </div>
          {/* White card on mobile; plain (transparent, no padding) on desktop. */}
          <div className="rounded-lg bg-surface p-6 lg:rounded-none lg:bg-transparent lg:p-0">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
