"use client";

import type { ReactNode } from "react";
import { useLocale, useT } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { Icon } from "@/components/ui";

/**
 * Shared chrome for the onboarding + verification screens (web-app/003), matching the prototype:
 * topbar (Moedatech mark + langtog), a two-step stepline, and a centered card. RTL for Arabic,
 * scoped to these routes (AC-22). `step` 1 = account creation, 2 = verify company.
 */
export function OnboardingShell({ step, children }: { step: 1 | 2; children: ReactNode }) {
  const { locale, setLocale } = useLocale();
  const t = useT();

  const Dot = ({ n, done, active }: { n: number; done?: boolean; active?: boolean }) => (
    <span
      className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
        done ? "bg-ok text-white" : active ? "bg-navy text-white" : "bg-surface2 text-muted"
      }`}
    >
      {done ? <Icon name="check" size={15} /> : n}
    </span>
  );

  return (
    <div dir={locale === "ar" ? "rtl" : "ltr"} className="min-h-screen bg-surface2">
      <div className="flex h-[60px] items-center justify-between border-b border-border bg-surface px-6">
        <div className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/moedatech-logo.png" alt="Moedatech" className="h-7 w-auto" />
        </div>
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

      <div className={`mx-auto px-5 py-8 ${step === 2 ? "max-w-3xl" : "max-w-lg"}`}>
        {/* Stepline only on the verify step — on account creation the "Verify company (later)"
            preview read as overwhelming, so the account form stands on its own. */}
        {step === 2 && (
          <div className="flex items-center gap-2 text-[13px] font-semibold text-navy-mid">
            <Dot n={1} done active={false} />
            {t.onboarding.step1}
            <span className="mx-1 h-px flex-1 bg-border" />
            <Dot n={2} active />
            <span>{t.onboarding.step2}</span>
          </div>
        )}

        <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">{children}</div>
      </div>
    </div>
  );
}
