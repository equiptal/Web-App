"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT, useLocale } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { BrowseSurface } from "@/components/stores/BrowseSurface";
import { fetchActivity, type ActivityCounts } from "@/lib/api/client";

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
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const [activity, setActivity] = useState<ActivityCounts | null>(null);

  useEffect(() => {
    let active = true;
    fetchActivity()
      .then((a) => active && setActivity(a))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const newBids = activity?.newBids ?? 0;

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

      {/* New-bids banner — mirrors the app's HomeNewBidsCard; shown only when unread bids exist. */}
      {newBids > 0 && (
        <button
          type="button"
          onClick={() => router.push("/requests?tab=bids")}
          className="flex items-center gap-3 rounded-[14px] border border-[#f59e0b]/30 bg-[#f59e0b]/[0.06] p-3.5 text-start transition hover:bg-[#f59e0b]/[0.10]"
        >
          <span className="relative grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-[#f59e0b]/[0.14]">
            <Icon name="gavel" size={20} className="text-[#d97706]" />
            <span className="absolute -end-1.5 -top-1.5 grid min-w-[18px] place-items-center rounded-full bg-[#d97706] px-1 text-[10px] font-bold leading-[18px] text-white">{newBids}</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold text-navy">
              {ar ? `${newBids} ${newBids === 1 ? "عرض جديد" : "عروض جديدة"} على طلباتك` : `${newBids} new ${newBids === 1 ? "bid" : "bids"} on your requests`}
            </span>
            <span className="block text-[13px] font-semibold text-[#d97706]">{ar ? "عرض العروض" : "View bids"}</span>
          </span>
          <Icon name="chevron_right" size={20} className="flex-none text-[#d97706] rtl:scale-x-[-1]" />
        </button>
      )}

      {/* Activity cards — wired to the renter's requests/bids/deals screens. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ActivityCard accent="brand" icon="assignment" title={t.home.yourRequests} sub={t.home.reqSub} href="/requests" count={activity?.openRequests} />
        <ActivityCard accent="info" icon="gavel" title={t.home.priceBids} sub={t.home.bidsSub} href="/requests?tab=bids" count={newBids} />
        <ActivityCard accent="ok" icon="handshake" title={t.home.completedDeals} sub={t.home.dealsSub} href="/requests?tab=deals" count={activity?.completedDeals} />
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
  href,
  count,
}: {
  accent: "brand" | "info" | "ok";
  icon: string;
  title: string;
  sub: string;
  href?: string;
  count?: number;
}) {
  const router = useRouter();
  const c = ACCENT[accent];
  return (
    <button
      type="button"
      onClick={() => href && router.push(href)}
      className="group relative flex cursor-pointer flex-col gap-3.5 overflow-hidden rounded-[16px] border border-border bg-surface p-5 text-start transition hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(0,0,0,.09)]"
    >
      <div className="flex items-start justify-between">
        <span className={`relative grid h-11 w-11 place-items-center rounded-[12px] ${c.iconBg}`}>
          <Icon name={icon} size={22} className={c.iconText} />
          {count != null && count > 0 && (
            <span className={`absolute -end-1.5 -top-1.5 grid min-w-[19px] place-items-center rounded-full px-1 text-[10px] font-bold leading-[19px] text-white ${c.bar}`}>{count}</span>
          )}
        </span>
        <Icon name="chevron_right" size={20} className="text-muted/60 rtl:scale-x-[-1]" />
      </div>
      <div>
        <div className="text-[15px] font-bold text-navy">{title}</div>
        <div className="mt-0.5 text-[12px] text-muted">{sub}</div>
      </div>
      <div className={`absolute inset-x-0 bottom-0 h-[3px] opacity-0 transition group-hover:opacity-100 ${c.bar}`} />
    </button>
  );
}
