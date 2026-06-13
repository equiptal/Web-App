"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { BrowseSurface } from "@/components/stores/BrowseSurface";
import type { StoreCard as StoreCardData } from "@/lib/contract/stores";

/** Gradient that darkens to the corner — shared by the hero and the store-card banners. */
export const DARK_GRADIENT = "bg-gradient-to-br from-[#1e3a5f] to-[#0f1e2e]";

/** Count up from 0 to `target` (easeOut) — used for the hero's live website stats. */
function useCountUp(target: number, durationMs = 1100): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target <= 0) {
      setVal(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return val;
}

/**
 * Renter web home hub (web-app/004, AC-04/05/07/10/25). A gradient-to-dark hero: live website stats
 * (count-up) on the left, a create-request card (Create Request + Upload RFQ) on the right; then the
 * suggested-suppliers surface. Stats are derived from the live verified-supplier data.
 */
export function HomeHub() {
  const t = useT();
  const router = useRouter();
  const [stats, setStats] = useState<{ suppliers: number; equipment: number; cities: number; capped: boolean }>({
    suppliers: 0,
    equipment: 0,
    cities: 0,
    capped: false,
  });

  useEffect(() => {
    fetch("/api/stores?verified=true&limit=100", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { stores: StoreCardData[] }) => {
        const s = d.stores ?? [];
        setStats({
          suppliers: s.length,
          equipment: s.reduce((n, x) => n + (x.activeEquipmentCount || 0), 0),
          cities: new Set(s.map((x) => x.city).filter(Boolean)).size,
          capped: s.length >= 100,
        });
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-7">
      {/* Hero */}
      <div className={`relative overflow-hidden rounded-[20px] px-8 py-9 sm:px-10 ${DARK_GRADIENT}`}>
        <div className="pointer-events-none absolute -end-16 -top-16 h-[300px] w-[300px] rounded-full bg-brand/[.10]" />
        <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-stretch">
          {/* Left: pitch + live stats */}
          <div className="flex flex-1 flex-col">
            <span className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-brand/20 px-3 py-1 text-[12px] font-semibold uppercase tracking-wide text-[#FB923C]">
              <Icon name="bolt" size={13} /> {t.home.eyebrow}
            </span>
            <h1 className="text-[26px] font-bold leading-tight text-white sm:text-[29px]">{t.home.bannerTitle}</h1>
            <p className="mt-2.5 max-w-[520px] text-[13.5px] leading-relaxed text-white/65">{t.home.bannerSubtitle}</p>

            <div className="mt-auto grid grid-cols-3 gap-3 pt-7">
              <HeroStat value={stats.suppliers} plus={stats.capped} label={t.home.statSuppliers} />
              <HeroStat value={stats.equipment} plus={stats.capped} label={t.home.statEquipment} />
              <HeroStat value={stats.cities} label={t.home.statCities} />
            </div>
          </div>

          {/* Right: create-request card */}
          <div className="flex flex-none flex-col justify-center gap-2.5 rounded-[16px] border border-white/15 bg-white/[.07] p-5 lg:w-[250px]">
            <button
              onClick={() => router.push("/create")}
              className="flex items-center justify-center gap-2 rounded-[12px] bg-brand px-5 py-3 text-[14px] font-semibold text-brand-fg transition hover:brightness-[1.04]"
            >
              <Icon name="add" size={16} /> {t.home.createRequest}
            </button>
            <button
              onClick={() => router.push("/create")}
              className="flex items-center justify-center gap-2 rounded-[12px] border border-white/20 bg-white/10 px-5 py-3 text-[14px] font-medium text-white transition hover:bg-white/[.16]"
            >
              <Icon name="upload_file" size={16} /> {t.home.uploadRfq}
            </button>
          </div>
        </div>
      </div>

      {/* Suggested suppliers — filter bar always shown; View all only adds cards (AC-05/10/11/12/13) */}
      <BrowseSurface title={t.home.suppliersTitle} previewCount={8} />
    </div>
  );
}

function HeroStat({ value, label, plus }: { value: number; label: string; plus?: boolean }) {
  const shown = useCountUp(value);
  return (
    <div className="rounded-[14px] border border-white/[.12] bg-white/[.08] px-4 py-3.5 text-center">
      <div className="text-[24px] font-bold leading-none text-white">
        {shown.toLocaleString()}
        {plus && <span className="text-brand">+</span>}
      </div>
      <div className="mt-1.5 text-[10.5px] uppercase tracking-wide text-white/50">{label}</div>
    </div>
  );
}
