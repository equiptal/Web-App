"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { BrowseSurface } from "@/components/stores/BrowseSurface";

/**
 * Renter web home hub (web-app/004, AC-04/05/07/10/25). A gradient hero (eyebrow, heading, Create-
 * request entry), a row of activity cards (Your Requests / Price Bids / Completed Deals — no web
 * data/pages yet, shown coming-soon), then the suggested-suppliers surface. The tier-aware nudge
 * lives in the sidebar tier card.
 */
export function HomeHub() {
  const t = useT();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-7">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-[20px] bg-gradient-to-br from-navy to-[#1e3a5f] px-8 py-10 sm:px-12">
        <div className="pointer-events-none absolute -end-16 -top-16 h-[300px] w-[300px] rounded-full bg-brand/[.12]" />
        <div className="pointer-events-none absolute -bottom-20 end-28 h-[200px] w-[200px] rounded-full bg-white/[.04]" />
        <div className="relative z-10 max-w-[600px]">
          <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-brand/20 px-3 py-1 text-[12px] font-semibold uppercase tracking-wide text-[#FB923C]">
            <Icon name="bolt" size={13} /> {t.home.eyebrow}
          </span>
          <h1 className="text-[28px] font-bold leading-tight text-white sm:text-[30px]">{t.home.bannerTitle}</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-white/65">{t.home.bannerSubtitle}</p>
          <div className="mt-7">
            <button
              onClick={() => router.push("/create")}
              className="inline-flex items-center gap-2 rounded-[12px] bg-brand px-6 py-3 text-[14px] font-semibold text-brand-fg transition hover:brightness-[1.04]"
            >
              <Icon name="add" size={16} /> {t.home.createRequest}
            </button>
          </div>
        </div>
      </div>

      {/* Activity cards — no web data/pages yet (future epics) → coming-soon */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ActivityCard accent="brand" icon="assignment" title={t.home.yourRequests} sub={t.home.reqSub} statLabel={t.home.reqStat} />
        <ActivityCard accent="info" icon="gavel" title={t.home.priceBids} sub={t.home.bidsSub} statLabel={t.home.bidsStat} />
        <ActivityCard accent="ok" icon="handshake" title={t.home.completedDeals} sub={t.home.dealsSub} statLabel={t.home.dealsStat} />
      </div>

      {/* Suggested suppliers — filter bar always shown; View all only adds cards (AC-05/10/11/12/13) */}
      <BrowseSurface title={t.home.suppliersTitle} previewCount={8} />
    </div>
  );
}

const ACCENT: Record<string, { iconBg: string; iconText: string; bar: string }> = {
  brand: { iconBg: "bg-brand-soft", iconText: "text-brand", bar: "bg-brand" },
  info: { iconBg: "bg-info-soft", iconText: "text-info", bar: "bg-info" },
  ok: { iconBg: "bg-ok-soft", iconText: "text-ok", bar: "bg-ok" },
};

function ActivityCard({
  accent,
  icon,
  title,
  sub,
  statLabel,
}: {
  accent: "brand" | "info" | "ok";
  icon: string;
  title: string;
  sub: string;
  statLabel: string;
}) {
  const t = useT();
  const c = ACCENT[accent];
  return (
    <div className="group relative flex cursor-default flex-col gap-3.5 overflow-hidden rounded-[16px] border border-border bg-surface p-5 transition hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(0,0,0,.09)]">
      <div className="flex items-start justify-between">
        <span className={`grid h-11 w-11 place-items-center rounded-[12px] ${c.iconBg}`}>
          <Icon name={icon} size={22} className={c.iconText} />
        </span>
        <span className="rounded-full bg-surface2 px-2.5 py-[3px] text-[11px] font-semibold text-muted">{t.home.soon}</span>
      </div>
      <div>
        <div className="text-[15px] font-bold text-navy">{title}</div>
        <div className="mt-0.5 text-[12px] text-muted">{sub}</div>
      </div>
      <div className="flex items-center justify-between border-t border-surface2 pt-2.5">
        <div>
          <div className="text-[13px] font-medium tracking-wide text-border">— —</div>
          <div className="mt-0.5 text-[11px] uppercase tracking-wide text-muted">{statLabel}</div>
        </div>
        <span className="grid h-8 w-8 place-items-center rounded-full border border-border bg-surface2 text-muted">
          <Icon name="chevron_right" size={14} className="rtl:scale-x-[-1]" />
        </span>
      </div>
      <div className={`absolute inset-x-0 bottom-0 h-[3px] opacity-0 transition group-hover:opacity-100 ${c.bar}`} />
    </div>
  );
}
