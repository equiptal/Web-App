"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { BrowseSurface } from "@/components/stores/BrowseSurface";

/** Gradient that darkens to the corner — shared by the hero and the store-card banners. */
export const DARK_GRADIENT = "bg-gradient-to-br from-[#1e3a5f] to-[#0f1e2e]";

/** Subtle grid overlay with a radial mask — the "blended light" look from the login page. */
const GRID_STYLE: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px)",
  backgroundSize: "46px 46px",
  maskImage: "radial-gradient(circle at 75% 40%,#000 34%,transparent 82%)",
  WebkitMaskImage: "radial-gradient(circle at 75% 40%,#000 34%,transparent 82%)",
};

/**
 * Renter web home hub (web-app/004, AC-04/05/07/10/25). A gradient-to-dark hero (pitch left, Create-
 * request + Upload-RFQ buttons right), a row of activity cards (Your Requests / Price Bids /
 * Completed Deals — no web data/pages yet, coming-soon), then the suggested-suppliers surface.
 */
export function HomeHub() {
  const t = useT();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-7">
      {/* Hero */}
      <div className={`relative overflow-hidden rounded-[20px] px-8 py-9 sm:px-10 ${DARK_GRADIENT}`}>
        <div className="pointer-events-none absolute inset-0" style={GRID_STYLE} />
        <span className="pointer-events-none absolute -top-[60px] end-[-40px] h-[260px] w-[260px] rounded-full bg-brand opacity-[0.20] blur-[80px]" />
        <span className="pointer-events-none absolute -bottom-[90px] end-[120px] h-[280px] w-[280px] rounded-full opacity-20 blur-[80px]" style={{ background: "#2563EB" }} />

        <div className="relative z-10 flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1">
            <span className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-brand/20 px-3 py-1 text-[12px] font-semibold uppercase tracking-wide text-[#FB923C]">
              <Icon name="bolt" size={13} /> {t.home.eyebrow}
            </span>
            <h1 className="text-[26px] font-bold leading-tight text-white sm:text-[29px]">{t.home.bannerTitle}</h1>
            <p className="mt-2.5 max-w-[520px] text-[13.5px] leading-relaxed text-white/65">{t.home.bannerSubtitle}</p>
          </div>

          {/* Single entry into the RFQ input flow (web-app/002). */}
          <div className="flex flex-none flex-col gap-3 sm:flex-row lg:flex-col lg:items-stretch">
            <button
              onClick={() => router.push("/create")}
              className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-brand px-6 py-3 text-[14px] font-semibold text-brand-fg transition hover:brightness-[1.04]"
            >
              <Icon name="add" size={16} /> {t.home.createRequest}
            </button>
          </div>
        </div>
      </div>

      {/* Activity cards — no web data/pages yet (future epics) → coming-soon */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ActivityCard accent="brand" icon="assignment" title={t.home.yourRequests} sub={t.home.reqSub} />
        <ActivityCard accent="info" icon="gavel" title={t.home.priceBids} sub={t.home.bidsSub} />
        <ActivityCard accent="ok" icon="handshake" title={t.home.completedDeals} sub={t.home.dealsSub} />
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
}: {
  accent: "brand" | "info" | "ok";
  icon: string;
  title: string;
  sub: string;
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
      <div className={`absolute inset-x-0 bottom-0 h-[3px] opacity-0 transition group-hover:opacity-100 ${c.bar}`} />
    </div>
  );
}
