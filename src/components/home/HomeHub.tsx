"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { BrowseSurface } from "@/components/stores/BrowseSurface";

/**
 * Renter web home hub (web-app/004, AC-04/05/07/10/25). A gradient hero (eyebrow, heading, Create-
 * request entry, and the activity stat cards) over the suggested-suppliers surface. The activity
 * cards (Your Requests / Price Bids / Completed Deals) have no web data/pages yet → shown coming-
 * soon. The tier-aware nudge lives in the sidebar tier card.
 */
export function HomeHub() {
  const t = useT();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-[20px] bg-gradient-to-br from-navy to-[#1e3a5f] px-8 py-10 sm:px-12">
        <div className="pointer-events-none absolute -end-16 -top-16 h-[300px] w-[300px] rounded-full bg-brand/[.12]" />
        <div className="pointer-events-none absolute -bottom-20 end-28 h-[200px] w-[200px] rounded-full bg-white/[.04]" />

        <div className="relative z-10 flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
          <div className="flex-1">
            <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-brand/20 px-3 py-1 text-[12px] font-semibold uppercase tracking-wide text-[#FB923C]">
              <Icon name="bolt" size={13} /> {t.home.eyebrow}
            </span>
            <h1 className="text-[28px] font-bold leading-tight text-white sm:text-[30px]">{t.home.bannerTitle}</h1>
            <p className="mt-3 max-w-[480px] text-[14px] leading-relaxed text-white/65">{t.home.bannerSubtitle}</p>
            <div className="mt-7">
              <button
                onClick={() => router.push("/create")}
                className="inline-flex items-center gap-2 rounded-[12px] bg-brand px-6 py-3 text-[14px] font-semibold text-brand-fg transition hover:brightness-[1.04]"
              >
                <Icon name="add" size={16} /> {t.home.createRequest}
              </button>
            </div>
          </div>

          {/* Activity stat cards (no web data yet → coming-soon) */}
          <div className="flex w-full flex-row gap-3 lg:w-auto lg:flex-col">
            <StatCard label={t.home.yourRequests} />
            <StatCard label={t.home.priceBids} />
            <StatCard label={t.home.completedDeals} />
          </div>
        </div>
      </div>

      {/* Suggested suppliers — filter bar always shown; View all only adds cards (AC-05/10/11/12/13) */}
      <BrowseSurface title={t.home.suppliersTitle} previewCount={8} />
    </div>
  );
}

function StatCard({ label }: { label: string }) {
  const t = useT();
  return (
    <div className="flex-1 rounded-[14px] border border-white/[.12] bg-white/[.08] px-5 py-4 text-center lg:min-w-[150px]">
      <div className="text-[13px] font-bold text-white">{label}</div>
      <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-wide text-white/45">{t.home.soon}</div>
    </div>
  );
}
