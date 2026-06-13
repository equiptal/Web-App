"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { BrowseSurface } from "@/components/stores/BrowseSurface";
import type { StoreCard as StoreCardData } from "@/lib/contract/stores";

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
        {/* Blended light: grid + soft glows (like the login page) */}
        <div className="pointer-events-none absolute inset-0" style={GRID_STYLE} />
        <span className="pointer-events-none absolute -top-[60px] end-[-40px] h-[260px] w-[260px] rounded-full bg-brand opacity-[0.20] blur-[80px]" />
        <span className="pointer-events-none absolute -bottom-[90px] end-[120px] h-[280px] w-[280px] rounded-full opacity-20 blur-[80px]" style={{ background: "#2563EB" }} />

        <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          {/* Left: pitch + buttons */}
          <div className="flex-1">
            <span className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-brand/20 px-3 py-1 text-[12px] font-semibold uppercase tracking-wide text-[#FB923C]">
              <Icon name="bolt" size={13} /> {t.home.eyebrow}
            </span>
            <h1 className="text-[26px] font-bold leading-tight text-white sm:text-[29px]">{t.home.bannerTitle}</h1>
            <p className="mt-2.5 max-w-[520px] text-[13.5px] leading-relaxed text-white/65">{t.home.bannerSubtitle}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button
                onClick={() => router.push("/create")}
                className="inline-flex items-center gap-2 rounded-[12px] bg-brand px-6 py-3 text-[14px] font-semibold text-brand-fg transition hover:brightness-[1.04]"
              >
                <Icon name="add" size={16} /> {t.home.createRequest}
              </button>
              <button
                onClick={() => router.push("/create")}
                className="inline-flex items-center gap-2 rounded-[12px] border border-white/20 bg-white/10 px-5 py-3 text-[14px] font-medium text-white transition hover:bg-white/[.16]"
              >
                <Icon name="upload_file" size={16} /> {t.home.uploadRfq}
              </button>
            </div>
          </div>

          {/* Right: stacked live stat cards */}
          <div className="grid w-full grid-cols-3 gap-3 lg:flex lg:w-[210px] lg:flex-col">
            <HeroStat value={stats.suppliers} plus={stats.capped} label={t.home.statSuppliers} />
            <HeroStat value={stats.equipment} plus={stats.capped} label={t.home.statEquipment} />
            <HeroStat value={stats.cities} label={t.home.statCities} />
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
