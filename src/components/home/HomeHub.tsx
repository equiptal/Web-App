"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { BrowseSurface } from "@/components/stores/BrowseSurface";

/**
 * Renter web home hub (web-app/004, AC-04/05/07/10/25). A navy create-request banner, then the
 * suggested-suppliers surface — the filter bar is always shown, and View all only changes how many
 * cards appear (no separate route). The tier-aware nudge lives in the sidebar tier card. No bid/deal
 * counts or Requests/Jobs surfaces (AC-25).
 */
export function HomeHub() {
  const t = useT();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      {/* Create-request banner (navy) — AC-04/07. Single Create-request entry. */}
      <div className="relative flex flex-col items-center gap-[18px] overflow-hidden rounded-[14px] bg-gradient-to-br from-navy to-[#0a1b30] px-[26px] py-[22px] text-white sm:flex-row">
        <span className="grid h-14 w-14 flex-none place-items-center rounded-full border border-brand/40 bg-brand/[.18] text-[#FCD9A0]">
          <Icon name="post_add" size={28} />
        </span>
        <div className="flex-1">
          <h2 className="text-[20px] font-extrabold tracking-[-.4px]">{t.home.bannerTitle}</h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-white/70">{t.home.bannerSubtitle}</p>
        </div>
        <button
          onClick={() => router.push("/create")}
          className="inline-flex flex-none items-center gap-1.5 rounded-[10px] bg-brand px-5 py-2.5 text-[13.5px] font-bold text-brand-fg transition hover:brightness-[1.04]"
        >
          {t.home.createRequest} <Icon name="arrow_forward" size={16} className="rtl:scale-x-[-1]" />
        </button>
      </div>

      {/* Activity cards (prototype dash). No web data/pages yet (future epics) → shown coming-soon. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <DashCard icon="inbox" tone="brand" label={t.home.yourRequests} />
        <DashCard icon="gavel" tone="info" label={t.home.priceBids} />
        <DashCard icon="handshake" tone="ok" label={t.home.completedDeals} />
      </div>

      {/* Suggested suppliers — filter bar always shown; View all only adds cards (AC-05/10/11/12/13) */}
      <BrowseSurface title={t.home.suppliersTitle} previewCount={8} />
    </div>
  );
}

function DashCard({ icon, tone, label }: { icon: string; tone: "brand" | "info" | "ok"; label: string }) {
  const t = useT();
  const toneCls = tone === "brand" ? "bg-brand-soft text-brand" : tone === "info" ? "bg-info-soft text-info" : "bg-ok-soft text-ok";
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-border bg-surface px-4 py-3.5">
      <span className={`grid h-10 w-10 flex-none place-items-center rounded-[10px] ${toneCls}`}>
        <Icon name={icon} size={20} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[13.5px] font-bold text-navy">{label}</div>
        <div className="text-[12px] font-semibold text-muted">{t.home.soon}</div>
      </div>
    </div>
  );
}
