"use client";

import type { ReactNode } from "react";
import Link from "next/link";
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
      className={`grid h-7 w-7 place-items-center rounded-full text-label font-semibold ${
        done ? "bg-ok text-white" : active ? "bg-navy text-white" : "bg-surface2 text-muted"
      }`}
    >
      {done ? <Icon name="check" size={15} /> : n}
    </span>
  );

  return (
    <div dir={locale === "ar" ? "rtl" : "ltr"} className="min-h-screen bg-surface2">
      <div className="flex h-[60px] items-center justify-between border-b border-border bg-surface px-6">
        {/* Logo links home — the onboarding/verify screens have no sidebar, so this (and the explicit
            "Back to home" button) are the only in-app way out. Without them a submitted renter is
            stuck on the pending screen with only the browser back button. */}
        <Link href="/" className="flex items-center rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/40" aria-label={t.shell.home}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/moedatech-logo.png" alt="Moedatech" className="h-7 w-auto" />
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-sm border border-border px-3 py-1.5 text-meta font-semibold text-navy-mid transition hover:bg-surface2"
          >
            <Icon name="home" size={16} /> {t.onboarding.backToHome}
          </Link>
          <span className="inline-flex overflow-hidden rounded-sm border border-border">
            {(["en", "ar"] as Locale[]).map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className={`px-2.5 py-1 text-label font-semibold ${locale === l ? "bg-navy text-white" : "bg-surface text-muted"}`}
              >
                {l === "en" ? "EN" : "ع"}
              </button>
            ))}
          </span>
        </div>
      </div>

      <div className={`mx-auto px-5 py-8 ${step === 2 ? "max-w-3xl" : "max-w-lg"}`}>
        {/* Stepline only on the verify step — on account creation the "Verify company (later)"
            preview read as overwhelming, so the account form stands on its own. */}
        {step === 2 && (
          <div className="flex items-center gap-2 text-body font-semibold text-navy-mid">
            <Dot n={1} done active={false} />
            {t.onboarding.step1}
            <span className="mx-1 h-px flex-1 bg-border" />
            <Dot n={2} active />
            <span>{t.onboarding.step2}</span>
          </div>
        )}

        <div className="mt-5 overflow-hidden rounded-lg border border-border bg-surface">{children}</div>
      </div>
    </div>
  );
}
