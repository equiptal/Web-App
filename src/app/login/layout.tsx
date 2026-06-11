"use client";

import type { ReactNode } from "react";
import { useLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { AuthBrand } from "@/components/auth/AuthBrand";

/**
 * Sign-in layout (web-app/001). Owns the auth-screen direction (AC-22: `dir="rtl"` for Arabic,
 * scoped to /login so the 002 shell's global RTL gating is untouched) and the language toggle. The
 * selected locale lives in the shared LocaleProvider, so it persists across the phone → code steps
 * (AC-23). Two-column brand + card layout matching the prototype.
 */
export default function LoginLayout({ children }: { children: ReactNode }) {
  const { locale, setLocale } = useLocale();
  return (
    <div dir={locale === "ar" ? "rtl" : "ltr"} className="relative flex min-h-screen flex-col bg-surface2">
      <div className="absolute end-4 top-4">
        <span className="inline-flex overflow-hidden rounded-md border border-border">
          {(["en", "ar"] as Locale[]).map((l) => (
            <button
              key={l}
              onClick={() => setLocale(l)}
              className={`px-2.5 py-1 text-xs font-bold ${locale === l ? "bg-navy text-white" : "bg-surface text-muted"}`}
            >
              {l === "en" ? "EN" : "ع"}
            </button>
          ))}
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center p-5">
        <div className="grid w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-surface shadow-sm md:grid-cols-2">
          <AuthBrand />
          <div className="p-7">{children}</div>
        </div>
      </div>
    </div>
  );
}
