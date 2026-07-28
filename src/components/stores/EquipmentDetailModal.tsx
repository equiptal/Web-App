"use client";

import { useEffect, useState } from "react";
import { useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import type { EquipmentDetail } from "@/lib/contract/stores";

/**
 * Equipment detail modal — mirrors the app's public equipment sheet (photo carousel, taxonomy
 * header, make/model, verified badge, specs grid, document/photo status, and a Request CTA). Opened
 * when a renter taps an equipment card on a store detail. Documents are shown as status only (no
 * contents — AC-19); the Request CTA routes to the RFQ flow (web-app/002, AC-07).
 *
 * `storeId`/`storeName` come from the store detail that opened the modal: the id lets the BFF resolve
 * the listing from the PUBLIC store-equipment projection for signed-out visitors (the backend has no
 * public equipment-detail route), and the name fills the header, which that projection omits.
 */
export function EquipmentDetailModal({
  equipmentId,
  storeId,
  storeName,
  onClose,
}: {
  equipmentId: string;
  storeId?: string;
  storeName?: string;
  onClose: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [eq, setEq] = useState<EquipmentDetail | null>(null);
  const [error, setError] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
    fetch(`/api/equipment/${encodeURIComponent(equipmentId)}${qs}`, { cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: EquipmentDetail) => setEq(d))
      .catch((e) => {
        if (e?.name !== "AbortError") setError(true);
      });
    return () => ctrl.abort();
  }, [equipmentId, storeId]);

  const category = eq ? (ar ? eq.categoryAr : eq.category) : null;
  const subcategory = eq ? (ar ? eq.subcategoryAr : eq.subcategory) : null;
  const measurement = eq ? (ar ? eq.measurementAr : eq.measurement) : null;
  const unitKey = (eq?.priceUnit ?? "").toUpperCase();
  const unit = unitKey === "PER_WEEK" ? t.store.perWeek : unitKey === "PER_MONTH" ? t.store.perMonth : unitKey === "PER_JOB" ? t.store.perJob : t.store.perDay;
  const photos = eq?.photos ?? [];

  return (
    <div className="fixed inset-0 z-50 grid place-items-end overflow-y-auto bg-black/50 p-0 sm:place-items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[18px] bg-surface sm:rounded-[16px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header / close */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-[14px] font-extrabold text-navy">{eq?.storeName ?? storeName ?? ""}</span>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface2" aria-label={t.store.close}>
            <Icon name="close" size={18} />
          </button>
        </div>

        {error ? (
          <div className="p-8 text-center text-[13px] text-muted">{t.store.error}</div>
        ) : !eq ? (
          <div className="p-8 text-center text-[13px] text-muted">{t.store.loading}</div>
        ) : (
          <div className="overflow-y-auto">
            {/* Photo carousel */}
            <div className="relative grid h-[240px] place-items-center bg-gradient-to-br from-surface2 to-surface3">
              {photos.length > 0 ? (
                <div className="h-full w-full bg-center bg-no-repeat" style={{ backgroundImage: `url("${photos[idx]}")`, backgroundSize: "cover" }} />
              ) : (
                <Icon name="construction" size={56} className="text-muted" />
              )}
              {photos.length > 1 && (
                <>
                  <button
                    onClick={() => setIdx((i) => (i - 1 + photos.length) % photos.length)}
                    className="absolute start-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white"
                  >
                    <Icon name="chevron_left" size={20} className="rtl:scale-x-[-1]" />
                  </button>
                  <button
                    onClick={() => setIdx((i) => (i + 1) % photos.length)}
                    className="absolute end-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white"
                  >
                    <Icon name="chevron_right" size={20} className="rtl:scale-x-[-1]" />
                  </button>
                  <span className="absolute end-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-bold text-white">
                    {idx + 1}/{photos.length}
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-col gap-4 p-5">
              {/* Taxonomy header */}
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[18px] font-extrabold text-navy">{category || subcategory || measurement || "—"}</h2>
                  {eq.isVerified && <Icon name="verified" size={16} className="text-ok" />}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {subcategory && <span className="rounded-full bg-navy px-2.5 py-1 text-[11px] font-bold text-white">{subcategory}</span>}
                  {measurement && <span className="rounded-full bg-navy px-2.5 py-1 text-[11px] font-bold text-white">{measurement}</span>}
                </div>
                {(eq.manufacturer || eq.modelName) && (
                  <p className="mt-2 text-[13px] text-muted">{[eq.manufacturer, eq.modelName].filter(Boolean).join(" ")}</p>
                )}
              </div>

              {/* Specs grid */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <Spec label={t.store.specManufacturer} value={eq.manufacturer} />
                <Spec label={t.store.specModel} value={eq.modelName} />
                <Spec label={t.store.specYear} value={eq.year != null ? String(eq.year) : null} />
                <Spec label={t.store.specFuel} value={eq.fuel ? eq.fuel.toUpperCase() : null} />
                <Spec label={t.store.specHours} value={eq.operatingHours != null ? eq.operatingHours.toLocaleString() : null} />
                <Spec label={t.store.specLocation} value={[eq.yardName, eq.yardCity].filter(Boolean).join(" · ") || null} />
                <Spec
                  label={t.store.specPrice}
                  value={eq.price != null ? `${eq.price.toLocaleString()} SAR ${unit}` : t.store.priceOnRequest}
                  highlight
                />
              </div>

              {/* Documents / photos status (no contents — AC-19) */}
              {(eq.docTypes.length > 0 || photos.length > 0) && (
                <div className="rounded-[12px] border border-border bg-surface2/40 p-3.5">
                  <div className="flex items-center gap-2 text-[12.5px] font-bold text-navy">
                    <Icon name="photo_camera" size={16} className="text-muted" /> {t.store.photos}
                    <span className="rounded-full bg-surface3 px-2 py-0.5 text-[11px] font-bold text-muted">{photos.length}</span>
                  </div>
                  {eq.docTypes.length > 0 && (
                    <div className="mt-2.5 flex items-center gap-2 text-[12.5px] font-bold text-navy">
                      <Icon name="description" size={16} className="text-muted" /> {t.store.docsShort}
                      <span className="flex flex-wrap gap-1.5">
                        {eq.docTypes.map((d) => (
                          <span key={d} className="inline-flex items-center gap-0.5 rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-bold text-ok">
                            <Icon name="check" size={12} /> {d.toUpperCase()}
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function Spec({ label, value, highlight }: { label: string; value: string | null; highlight?: boolean }) {
  if (!value) return null;
  return (
    <div className="rounded-[10px] border border-border bg-surface px-3 py-2">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-0.5 text-[13px] font-bold ${highlight ? "text-brand" : "text-navy"}`}>{value}</div>
    </div>
  );
}
