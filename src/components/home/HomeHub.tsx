"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT, useLocale } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { BrowseSurface } from "@/components/stores/BrowseSurface";
import { fetchActivity, type ActivityCounts } from "@/lib/api/client";
import { StartYourRequestModal, type StartRequestChoice } from "@/components/home/StartYourRequestModal";
import { useStartRequestGate } from "@/lib/access/start-request-gate";
import { btn } from "@/lib/ds";

/**
 * mobile/016 — once-per-tab guard for the AUTOMATIC first-request pop-up, mirroring the app's
 * `TrialColdStartGuard`: it self-raises on the renter's first landing on home, and a client-side
 * re-render or an in-tab return to home doesn't re-raise it. Dismissing leaves the server-side slot
 * open, so it returns on the next visit (fresh tab / reload) — app parity (AC-20). Tapping
 * **Create request** is a separate, explicit trigger and is NOT subject to this guard.
 */
const POPUP_SHOWN_KEY = "start-request-popup-shown";

/** Gradient that darkens to the corner — shared by the hero and the store-card banners. */
export const DARK_GRADIENT = "bg-gradient-to-br from-navy to-navy-deep";

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
  const [startPopup, setStartPopup] = useState(false);
  // Reuses the activity count this screen already loads, so the gate costs one extra /api/me read.
  const offerStartChoice = useStartRequestGate(activity?.openRequests ?? null);

  useEffect(() => {
    let active = true;
    fetchActivity()
      .then((a) => active && setActivity(a))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // mobile/016 (AC-01/22/23) — self-raise the pop-up once per tab on landing, mirroring the app's
  // cold-start trigger. The explicit "Create request" path below doesn't depend on this.
  useEffect(() => {
    if (offerStartChoice !== true) return;
    try {
      if (window.sessionStorage.getItem(POPUP_SHOWN_KEY) === "1") return;
      window.sessionStorage.setItem(POPUP_SHOWN_KEY, "1");
    } catch {
      /* storage blocked → still show it, just without the once-per-tab guard */
    }
    setStartPopup(true);
  }, [offerStartChoice]);

  // "Create request": when the renter has nothing live, ask Trial-or-Real FIRST instead of dropping
  // straight into the form. Otherwise (they already have active requests) go straight to /create as
  // before. `offerStartChoice` is null while unknown → never blocks the button.
  const onCreateRequest = () => {
    if (offerStartChoice === true) {
      setStartPopup(true);
      return;
    }
    router.push("/create");
  };

  // Both choices go through the normal RFQ flow ("Write your RFQ"); `mode` only tells the flow whether
  // the eventual submit is a trial. Dismissing does nothing — the slot stays open (AC-20).
  const onChooseStart = (choice: StartRequestChoice) => {
    setStartPopup(false);
    router.push(`/create?mode=${choice}`);
  };

  const newBids = activity?.newBids ?? 0;

  return (
    <div className="flex flex-col gap-7">
      {/* Hero */}
      <div className={`relative overflow-hidden rounded-sm px-8 py-9 sm:px-10 ${DARK_GRADIENT}`}>
        <div className="pointer-events-none absolute inset-0" style={GRID_STYLE} />
        <span className="pointer-events-none absolute -top-[60px] end-[-40px] h-[260px] w-[260px] rounded-full bg-brand opacity-[0.20] blur-[80px]" />
        <span className="pointer-events-none absolute -bottom-[90px] end-[120px] h-[280px] w-[280px] rounded-full opacity-20 blur-[80px]" style={{ background: "var(--info)" }} />

        <div className="relative z-10 flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1">
            <span className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-brand/20 px-3 py-1 text-meta font-semibold uppercase tracking-wide text-brand-light">
              <Icon name="bolt" size={13} /> {t.home.eyebrow}
            </span>
            <h1 className="text-display font-extrabold leading-tight text-white sm:text-hero">{t.home.bannerTitle}</h1>
            <p className="mt-2.5 max-w-[520px] text-body leading-relaxed text-white/65">{t.home.bannerSubtitle}</p>
          </div>

          {/* Single entry into the RFQ input flow (web-app/002). */}
          <div className="flex flex-none flex-col gap-3 sm:flex-row lg:flex-col lg:items-stretch">
            <button
              onClick={onCreateRequest}
              className={btn("primary", "lg", { className: "transition" })}
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
          onClick={() => router.push("/requests")}
          className={btn("secondary", "md", { className: "flex text-start transition" })}
        >
          <span className="relative grid h-9 w-9 flex-none place-items-center rounded-sm bg-brand-light/[0.14]">
            <Icon name="gavel" size={20} className="text-brand-light" />
            <span className="absolute -end-1.5 -top-1.5 grid min-w-[18px] place-items-center rounded-full bg-brand-light px-1 text-label font-semibold leading-[18px] text-white">{newBids}</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-body font-semibold text-navy">
              {ar ? `${newBids} ${newBids === 1 ? "عرض جديد" : "عروض جديدة"} على طلباتك` : `${newBids} new ${newBids === 1 ? "bid" : "bids"} on your requests`}
            </span>
            <span className="block text-body font-semibold text-brand-light">{ar ? "عرض العروض" : "View bids"}</span>
          </span>
          <Icon name="chevron_right" size={20} className="flex-none text-brand-light rtl:scale-x-[-1]" />
        </button>
      )}

      {/* Activity cards. The bids and deals tabs are gone: the workspace shows a request and its
          bids together, so "bids" is not a separate destination, and completed deals live in the
          Inbox with their rooms (docs/requests-workspace-disabled.md). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ActivityCard accent="brand" icon="assignment" title={t.home.yourRequests} sub={t.home.reqSub} href="/requests" count={activity?.openRequests} />
        <ActivityCard accent="info" icon="gavel" title={t.home.priceBids} sub={t.home.bidsSub} href="/requests" count={newBids} />
        <ActivityCard accent="ok" icon="handshake" title={t.home.completedDeals} sub={t.home.dealsSub} href="/inbox" count={activity?.completedDeals} />
      </div>

      {/* Suggested suppliers — filter bar always shown; View all only adds cards (AC-05/10/11/12/13) */}
      <BrowseSurface title={t.home.suppliersTitle} previewCount={8} />

      {/* mobile/016 — first-request choice: Trial or Real, both into /create. */}
      <StartYourRequestModal open={startPopup} onClose={() => setStartPopup(false)} onChoose={onChooseStart} />
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
      className="group relative flex cursor-pointer flex-col gap-3.5 overflow-hidden rounded-sm border border-border bg-surface p-5 text-start transition"
    >
      <div className="flex items-start justify-between">
        <span className={`relative grid h-11 w-11 place-items-center rounded-sm ${c.iconBg}`}>
          <Icon name={icon} size={22} className={c.iconText} />
          {count != null && count > 0 && (
            <span className={`absolute -end-1.5 -top-1.5 grid min-w-[19px] place-items-center rounded-full px-1 text-label font-semibold leading-[19px] text-white ${c.bar}`}>{count}</span>
          )}
        </span>
        <Icon name="chevron_right" size={20} className="text-muted/60 rtl:scale-x-[-1]" />
      </div>
      <div>
        <div className="text-subhead font-extrabold text-navy">{title}</div>
        <div className="mt-0.5 text-meta text-muted">{sub}</div>
      </div>
      <div className={`absolute inset-x-0 bottom-0 h-[3px] opacity-0 transition group- ${c.bar}`} />
    </button>
  );
}
