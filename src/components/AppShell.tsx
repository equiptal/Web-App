"use client";

import type { ReactNode } from "react";
import { useLocale } from "@/lib/i18n";
import { useSession, type RenterTier } from "@/lib/session";
import { Icon } from "@/components/ui";
import type { Locale } from "@/lib/i18n/config";

const TIERS: RenterTier[] = ["guest", "basic", "verified"];

export function AppShell({ children }: { children: ReactNode }) {
  const { locale, setLocale } = useLocale();
  const { tier, setTier } = useSession();

  return (
    <div className="min-h-screen">
      {/* Demo controls (meta, not product) — exercises the guest block. */}
      <div className="flex items-center gap-3 bg-[#0e1a26] px-5 py-1.5 text-[11.5px] text-[#9fb6cc]">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#6b8299]">Demo controls</span>
        <span>tier</span>
        <div className="inline-flex rounded-md bg-white/10 p-0.5">
          {TIERS.map((tn) => (
            <button
              key={tn}
              onClick={() => setTier(tn)}
              className={`rounded px-2.5 py-1 font-semibold capitalize ${tier === tn ? "bg-white text-navy" : "text-[#9fb6cc]"}`}
            >
              {tn}
            </button>
          ))}
        </div>
      </div>

      {/* App bar */}
      <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between border-b border-border bg-surface px-7">
        <div className="flex items-center gap-3 text-[17px] font-extrabold tracking-tight">
          <span className="grid h-[34px] w-[34px] place-items-center rounded-[9px] bg-navy">
            <Icon name="precision_manufacturing" className="text-white" size={19} />
          </span>
          <span>
            MOEDA<span className="text-brand">TECH</span>
          </span>
        </div>

        <div className="flex items-center gap-2 text-[13px] font-semibold text-navy-mid">
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
          <span className="rounded-md border border-border bg-surface2 px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">{tier}</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-7 py-7 pb-24">{children}</main>
    </div>
  );
}
