"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { StoreCard } from "@/components/stores/StoreCard";
import { BrowseSurface } from "@/components/stores/BrowseSurface";
import type { StoreCard as StoreCardData } from "@/lib/contract/stores";

/**
 * Renter web home hub (web-app/004, AC-04/05/07/10/25). A navy create-request banner, then a
 * verified-suppliers preview; View all expands the full browse (filters + all stores) inline on the
 * home — no separate route. The tier-aware nudge lives in the sidebar tier card. No bid/deal counts
 * or Requests/Jobs surfaces (AC-25).
 */
export function HomeHub() {
  const t = useT();
  const router = useRouter();

  const [showAll, setShowAll] = useState(false);
  const [stores, setStores] = useState<StoreCardData[] | null>(null);
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    setStores(null);
    fetch("/api/stores?verified=true&limit=8", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then((d: { stores: StoreCardData[] }) => setStores(d.stores ?? []))
      .catch(() => setError(true));
  };
  useEffect(load, []);

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

      {/* Verified suppliers — preview, or the full browse inline when View all is on (AC-05/10) */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[18px] font-extrabold tracking-[-.3px] text-navy">{t.home.suppliersTitle}</h3>
          <button
            onClick={() => setShowAll((v) => !v)}
            className="inline-flex items-center gap-0.5 text-[12.5px] font-bold text-info hover:underline"
          >
            {showAll ? t.home.showLess : t.home.viewAll}
            <Icon name={showAll ? "expand_less" : "chevron_right"} size={16} className={showAll ? "" : "rtl:scale-x-[-1]"} />
          </button>
        </div>

        {showAll ? (
          <BrowseSurface />
        ) : error ? (
          <div className="rounded-[14px] border border-border bg-surface p-6 text-center text-[13px] text-muted">
            <p>{t.browse.error}</p>
            <button onClick={load} className="mt-2 rounded-md border border-border px-3 py-1.5 text-[13px] font-bold text-navy-mid hover:border-brand">
              {t.browse.retry}
            </button>
          </div>
        ) : stores === null ? (
          <div className="p-6 text-center text-[13px] text-muted">{t.browse.loading}</div>
        ) : stores.length === 0 ? (
          <div className="rounded-[14px] border border-border bg-surface p-6 text-center text-[13px] text-muted">{t.browse.empty}</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {stores.map((s) => (
              <StoreCard key={s.id} store={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
