"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { useRouter } from "next/navigation";
import { useLocale, useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/ui";
import { EquipmentDetailModal } from "@/components/stores/EquipmentDetailModal";
import type { EquipmentCard, StoreDetail, TaxonomyNode } from "@/lib/contract/stores";
import { btn } from "@/lib/ds";
import { pin } from "@/lib/uiPins";

/**
 * Store detail surface — matches the prototype's `view-store` (navy gradient banner, trust tiles,
 * `.eq` equipment grid). AC-18 (info + verified badge only when verified + operators coming-soon),
 * AC-19 (CR/VAT/National Address labels + verified/pending status, no contents), AC-20 (equipment
 * fields, price/price-on-request, verification tick). Loading + error-with-retry (AC-23).
 */
export function StoreDetailSurface({ id, onTitle }: { id: string; onTitle?: (name: string) => void }) {
  const t = useT();
  const router = useRouter();
  const { status } = useSession();
  const anon = status === "anon";
  const [detail, setDetail] = useState<StoreDetail | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [selectedEq, setSelectedEq] = useState<string | null>(null);
  const [showDocs, setShowDocs] = useState(false);

  // Taxonomy icons (shared bucket) → map node id → iconUrl, for equipment with no photo. Authed-only
  // reference data — skip for guests (they see the public store detail; equipment falls back to its
  // own photo/placeholder, no taxonomy icon).
  useEffect(() => {
    if (anon) return;
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
  }, [anon]);

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
      <div className="rounded-lg border border-border bg-surface p-8 text-center text-body text-muted">
        <Icon name="error_outline" size={22} className="mx-auto mb-2 text-muted" />
        <p>{t.store.error}</p>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className={btn("secondary", "sm", { className: "mt-3" })}
        >
          {t.store.retry}
        </button>
      </div>
    );
  }
  if (!detail) return <div className="p-8 text-center text-body text-muted">{t.store.loading}</div>;

  const docStatus = detail.isVerified ? t.store.statusVerified : t.store.statusPending;

  return (
    <div {...pin("store-detail")}>
      {/* Banner (navy gradient) — AC-18 */}
      <div className="relative mb-4 overflow-hidden rounded-sm bg-gradient-to-br from-navy to-navy-deep px-6 py-5 text-white">
        <div className="relative z-10 mb-5 flex justify-between">
          <button onClick={() => router.back()} className="grid h-[38px] w-[38px] place-items-center rounded-full bg-white/[.12] text-white">
            <Icon name="arrow_back" size={20} className="rtl:scale-x-[-1]" />
          </button>
        </div>
        <div className="relative z-10 flex items-center gap-3.5">
          <div
            className="grid h-[54px] w-[54px] flex-none place-items-center overflow-hidden rounded-full border-2 border-white/30 bg-white/[.12] text-display font-extrabold"
            style={detail.logoUrl ? { backgroundImage: `url("${detail.logoUrl}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
          >
            {!detail.logoUrl && (detail.name.trim()[0]?.toUpperCase() ?? "?")}
          </div>
          <h2 className="m-0 flex flex-wrap items-center gap-2 text-display font-extrabold tracking-[-.3px]">
            {detail.name}
            {detail.isVerified && (
              <span className="inline-flex items-center gap-1 rounded-full border border-ok/40 bg-ok/[.18] px-2 py-1 text-label font-extrabold text-ok-soft">
                <Icon name="verified" size={13} /> {t.store.verified}
              </span>
            )}
          </h2>
        </div>
        <div className="relative z-10 mt-3.5 flex flex-wrap items-center gap-2 text-meta font-semibold text-white/80">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="construction" size={15} className="text-white/50" /> {detail.activeEquipmentCount} {t.store.equipment}
          </span>
          {detail.city && (
            <>
              <span className="text-white/30">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="location_on" size={15} className="text-white/50" /> {detail.city}
              </span>
            </>
          )}
          <span className="text-white/30">·</span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="visibility" size={15} className="text-white/50" /> {detail.viewCount.toLocaleString()} {t.store.views}
          </span>
        </div>
      </div>

      {detail.description && (
        <p className="mb-4 rounded-sm border border-border bg-surface px-5 py-4 text-body leading-relaxed text-navy-mid">{detail.description}</p>
      )}

      {/* Trust tiles (AC-19) + operators (AC-18) */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setShowDocs(true)}
          className={btn("secondary", "lg", { full: true, className: "flex text-start transition" })}
        >
          <span className="grid h-10 w-10 flex-none place-items-center rounded-sm bg-ok-soft text-ok">
            <Icon name="description" size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <b className="block text-body font-extrabold text-navy">{t.store.documents}</b>
            <span className="text-meta text-muted">
              {t.store.docCR} · {t.store.docVAT} · {t.store.docNationalAddress}
            </span>
          </div>
          <span className={`inline-flex flex-none items-center gap-0.5 rounded-full px-2 py-0.5 text-label font-semibold ${detail.isVerified ? "bg-ok-soft text-ok" : "bg-surface2 text-muted"}`}>
            <Icon name={detail.isVerified ? "check_circle" : "schedule"} size={13} /> {docStatus}
          </span>
        </button>
        <div className="flex items-center gap-3 rounded-sm border border-border bg-surface px-4 py-4 opacity-55">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-sm bg-info-soft text-info">
            <Icon name="engineering" size={22} />
          </span>
          <div>
            <b className="block text-body font-extrabold text-navy">{t.store.operators}</b>
            <span className="text-meta text-muted">{t.store.comingSoon}</span>
          </div>
        </div>
      </div>

      {/* Equipment (AC-20) */}
      <div className="mb-4 flex items-center gap-2.5">
        <h3 className="m-0 text-title font-extrabold tracking-[-.3px] text-navy">{t.store.equipment}</h3>
        <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-meta font-extrabold text-brand">{detail.activeEquipmentCount}</span>
      </div>
      {detail.equipment.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center text-body text-muted">{t.store.noEquipment}</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {detail.equipment.map((e) => (
            <EquipmentTile
              key={e.id}
              eq={e}
              iconUrl={(e.subcategoryId && icons[e.subcategoryId]) || (e.measurementId && icons[e.measurementId]) || null}
              onOpen={() => setSelectedEq(e.id)}
            />
          ))}
        </div>
      )}

      {selectedEq && (
        <EquipmentDetailModal equipmentId={selectedEq} storeId={id} storeName={detail.name} onClose={() => setSelectedEq(null)} />
      )}
      {showDocs && <StoreDocsModal isVerified={detail.isVerified} onClose={() => setShowDocs(false)} />}
    </div>
  );
}

/** Store documents sheet (AC-19) — three labels + verified/pending status, no contents (matches the app). */
function StoreDocsModal({ isVerified, onClose }: { isVerified: boolean; onClose: () => void }) {
  const t = useT();
  const rows = [t.store.docCR, t.store.docVAT, t.store.docNationalAddress];
  return (
    <Dialog open onClose={onClose} size="lg" padded={false}>
      <div>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-subhead font-extrabold text-navy">{t.store.documents}</span>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface2" aria-label={t.store.close}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-2.5 p-4">
          {rows.map((label) => (
            <div key={label} className="flex items-center gap-3 rounded-sm border border-border bg-surface px-3.5 py-3">
              <span className={`grid h-9 w-9 flex-none place-items-center rounded-sm ${isVerified ? "bg-ok-soft text-ok" : "bg-surface2 text-muted"}`}>
                <Icon name={isVerified ? "check_circle" : "hourglass_empty"} size={18} />
              </span>
              <div>
                <div className="text-body font-semibold text-navy">{label}</div>
                <div className={`text-meta font-semibold ${isVerified ? "text-ok" : "text-muted"}`}>
                  {isVerified ? t.store.statusVerified : t.store.statusPending}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

function EquipmentTile({ eq, iconUrl, onOpen }: { eq: EquipmentCard; iconUrl: string | null; onOpen: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const category = ar ? eq.categoryAr : eq.category;
  const subcategory = ar ? eq.subcategoryAr : eq.subcategory;
  const measurement = ar ? eq.measurementAr : eq.measurement;
  const title = category || subcategory || measurement || "—";
  const makeModel = [eq.make, eq.model].filter(Boolean).join(" ");
  const unit =
    eq.priceUnit === "PER_WEEK" ? t.store.perWeek : eq.priceUnit === "PER_MONTH" ? t.store.perMonth : eq.priceUnit === "PER_JOB" ? t.store.perJob : t.store.perDay;

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
      className="cursor-pointer overflow-hidden rounded-sm border border-border bg-surface transition"
    >
      <div
        className="relative grid h-[120px] place-items-center bg-gradient-to-br from-surface2 to-surface3"
        style={eq.photoUrl ? { backgroundImage: `url("${eq.photoUrl}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      >
        {!eq.photoUrl &&
          (iconUrl ? (
            <div className="h-full w-full bg-center bg-no-repeat" style={{ backgroundImage: `url("${iconUrl}")`, backgroundSize: "44px" }} />
          ) : (
            <Icon name="construction" size={40} className="text-muted" />
          ))}
        {eq.year != null && (
          <span className="absolute start-2.5 top-2.5 rounded-full bg-white/[.92] px-2.5 py-1 text-label font-extrabold text-navy">{eq.year}</span>
        )}
        {eq.fuel && (
          <span className="absolute end-2.5 top-2.5 rounded-full bg-white/[.92] px-2.5 py-1 text-label font-extrabold text-navy">{eq.fuel}</span>
        )}
      </div>
      <div className="px-3.5 pb-4 pt-3">
        <div className="flex items-center gap-1.5 text-body font-extrabold text-navy">
          <span className="truncate">{title}</span>
          {eq.isVerified && <Icon name="verified" size={14} className="flex-none text-ok" />}
        </div>
        {subcategory && subcategory !== title && (
          <div className="mt-1.5 flex items-center gap-1.5 text-meta font-semibold text-navy-mid">
            <Icon name="category" size={13} className="text-muted" /> {subcategory}
          </div>
        )}
        {measurement && measurement !== title && (
          <div className="mt-1.5 flex items-center gap-1.5 text-meta font-semibold text-navy-mid">
            <Icon name="straighten" size={13} className="text-muted" /> {measurement}
          </div>
        )}
        {makeModel && <div className="mt-1.5 text-label text-muted">{makeModel}</div>}
        {eq.price != null ? (
          <div className="mt-2.5 text-subhead font-extrabold tabular-nums text-brand">
            {eq.price.toLocaleString()} <span className="text-label font-semibold">SAR {unit}</span>
          </div>
        ) : (
          <div className="mt-2.5 text-body font-semibold italic text-muted">{t.store.priceOnRequest}</div>
        )}
      </div>
    </div>
  );
}
