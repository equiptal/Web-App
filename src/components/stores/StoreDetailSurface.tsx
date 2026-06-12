"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import type { EquipmentCard, StoreDetail, TaxonomyNode } from "@/lib/contract/stores";

/**
 * Store detail surface (web-app/004, AC-18/19/20/23/24). Banner (logo, name, verified badge only
 * when verified), meta (equipment count, city, view count), description, trust-document labels with
 * a verified/pending status derived from the supplier's verified state (no contents — AC-19), an
 * operators coming-soon tile, and the equipment listing. Loading + error-with-retry.
 */
export function StoreDetailSurface({ id, onTitle }: { id: string; onTitle?: (name: string) => void }) {
  const t = useT();
  const router = useRouter();
  const [detail, setDetail] = useState<StoreDetail | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [icons, setIcons] = useState<Record<string, string>>({});

  // Taxonomy icons (shared bucket) → map node id → iconUrl, for equipment with no photo (AC-20 best effort).
  useEffect(() => {
    fetch("/api/stores/taxonomy", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { taxonomy: TaxonomyNode[] }) => {
        const map: Record<string, string> = {};
        const walk = (n: TaxonomyNode) => {
          if (n.iconUrl) map[n.id] = n.iconUrl;
          n.children.forEach(walk);
        };
        (d.taxonomy ?? []).forEach(walk);
        setIcons(map);
      })
      .catch(() => setIcons({}));
  }, []);

  useEffect(() => {
    setError(false);
    setDetail(null);
    const ctrl = new AbortController();
    fetch(`/api/stores/${encodeURIComponent(id)}`, { cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: StoreDetail) => {
        setDetail(d);
        onTitle?.(d.name);
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setError(true);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reloadKey]);

  if (error) {
    return (
      <div className="rounded-[12px] border border-border bg-surface p-8 text-center text-[13px] text-muted">
        <Icon name="error_outline" size={22} className="mx-auto mb-2 text-muted" />
        <p>{t.store.error}</p>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="mt-3 rounded-md border border-border px-3 py-1.5 text-[13px] font-bold text-navy-mid hover:border-brand"
        >
          {t.store.retry}
        </button>
      </div>
    );
  }
  if (!detail) return <div className="p-8 text-center text-[13px] text-muted">{t.store.loading}</div>;

  const docStatus = detail.isVerified ? t.store.statusVerified : t.store.statusPending;
  const docTone = detail.isVerified ? "text-ok" : "text-muted";

  return (
    <div className="flex flex-col gap-5">
      {/* Banner (AC-18) */}
      <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
        <div
          className="h-28 bg-surface2"
          style={detail.bannerUrl ? { backgroundImage: `url(${detail.bannerUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        />
        <div className="flex items-start gap-3 p-4">
          <div
            className="-mt-10 grid h-16 w-16 flex-none place-items-center overflow-hidden rounded-[12px] border-4 border-surface bg-surface2 text-[24px] font-extrabold text-navy-mid"
            style={detail.logoUrl ? { backgroundImage: `url(${detail.logoUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
          >
            {!detail.logoUrl && (detail.name.trim()[0]?.toUpperCase() ?? "?")}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[18px] font-extrabold text-navy">{detail.name}</h2>
              {detail.isVerified && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-bold text-ok">
                  <Icon name="verified" size={13} /> {t.store.verified}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
              <span className="inline-flex items-center gap-1">
                <Icon name="construction" size={14} /> {detail.activeEquipmentCount} {t.store.equipment}
              </span>
              {detail.city && (
                <span className="inline-flex items-center gap-1">
                  <Icon name="location_on" size={14} /> {detail.city}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Icon name="visibility" size={14} /> {detail.viewCount.toLocaleString()} {t.store.views}
              </span>
            </div>
          </div>
          <button
            onClick={() => router.push("/browse")}
            className="flex-none rounded-md border border-border bg-surface px-2 py-1 text-[12px] font-semibold text-muted hover:text-navy"
          >
            <Icon name="arrow_back" size={16} /> {t.store.back}
          </button>
        </div>
      </div>

      {detail.description && <p className="rounded-[12px] border border-border bg-surface p-4 text-[13.5px] text-navy-mid">{detail.description}</p>}

      {/* Trust documents (AC-19) + operators (AC-18) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-[12px] border border-border bg-surface p-4">
          <div className="mb-2 flex items-center gap-2 text-[13.5px] font-bold text-navy">
            <Icon name="description" size={18} className="text-ok" /> {t.store.documents}
          </div>
          <ul className="flex flex-col gap-1.5 text-[13px]">
            {[t.store.docCR, t.store.docVAT, t.store.docNationalAddress].map((label) => (
              <li key={label} className="flex items-center justify-between">
                <span className="text-navy-mid">{label}</span>
                <span className={`inline-flex items-center gap-0.5 text-[12px] font-bold ${docTone}`}>
                  <Icon name={detail.isVerified ? "check_circle" : "schedule"} size={14} /> {docStatus}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-[12px] border border-border bg-surface p-4 opacity-80">
          <div className="mb-1 flex items-center gap-2 text-[13.5px] font-bold text-navy">
            <Icon name="engineering" size={18} className="text-info" /> {t.store.operators}
          </div>
          <p className="text-[12.5px] text-muted">{t.store.comingSoon}</p>
        </div>
      </div>

      {/* Equipment listing (AC-20) */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-[15px] font-extrabold text-navy">{t.store.equipment}</h3>
          <span className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] font-bold text-muted">{detail.activeEquipmentCount}</span>
        </div>
        {detail.equipment.length === 0 ? (
          <div className="rounded-[12px] border border-border bg-surface p-8 text-center text-[13px] text-muted">{t.store.noEquipment}</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {detail.equipment.map((e) => (
              <EquipmentTile key={e.id} eq={e} iconUrl={(e.subcategoryId && icons[e.subcategoryId]) || (e.measurementId && icons[e.measurementId]) || null} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EquipmentTile({ eq, iconUrl }: { eq: EquipmentCard; iconUrl: string | null }) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const category = ar ? eq.categoryAr : eq.category;
  const subcategory = ar ? eq.subcategoryAr : eq.subcategory;
  const measurement = ar ? eq.measurementAr : eq.measurement;
  const title = subcategory || category || measurement || "—";
  const makeModel = [eq.make, eq.model].filter(Boolean).join(" ");
  const specs = [category && subcategory ? category : null, measurement, eq.year ? String(eq.year) : null, eq.fuel].filter(Boolean);
  const unit =
    eq.priceUnit === "PER_WEEK" ? t.store.perWeek : eq.priceUnit === "PER_MONTH" ? t.store.perMonth : eq.priceUnit === "PER_JOB" ? t.store.perJob : t.store.perDay;

  return (
    <div className="overflow-hidden rounded-[12px] border border-border bg-surface">
      <div
        className="h-28 bg-surface2"
        style={eq.photoUrl ? { backgroundImage: `url(${eq.photoUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      >
        {!eq.photoUrl &&
          (iconUrl ? (
            <div
              className="h-full bg-surface2"
              style={{ backgroundImage: `url(${iconUrl})`, backgroundSize: "40px", backgroundRepeat: "no-repeat", backgroundPosition: "center" }}
            />
          ) : (
            <div className="grid h-full place-items-center text-muted">
              <Icon name="construction" size={28} />
            </div>
          ))}
      </div>
      <div className="p-3">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[14px] font-bold text-navy">{title}</span>
          {eq.isVerified && <Icon name="verified" size={14} className="flex-none text-ok" />}
        </div>
        {makeModel && <p className="truncate text-[12.5px] text-navy-mid">{makeModel}</p>}
        {specs.length > 0 && <p className="mt-0.5 truncate text-[11.5px] text-muted">{specs.join(" · ")}</p>}
        <div className="mt-2 text-[13px] font-extrabold text-navy">
          {eq.price != null ? (
            <>
              {eq.price.toLocaleString()} SAR <span className="text-[11px] font-semibold text-muted">{unit}</span>
            </>
          ) : (
            <span className="text-brand">{t.store.priceOnRequest}</span>
          )}
        </div>
      </div>
    </div>
  );
}
