"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import type { BidCard, CertCode } from "@/lib/contract/bids";
import type { EquipmentDetail } from "@/lib/contract/stores";

/** Cert thumbnails shown in the strip (013 AC-07): SASO, Local content, TÜV+SPSP — grouped. */
type CertSlot = { key: string; en: string; ar: string };

function certSlots(held: CertCode[]): CertSlot[] {
  const set = new Set(held);
  const out: CertSlot[] = [];
  if (set.has("SASO")) out.push({ key: "SASO", en: "SASO certificate", ar: "شهادة SASO" });
  if (set.has("LC")) out.push({ key: "LC", en: "Local content", ar: "محتوى محلي" });
  if (set.has("TUV") || set.has("SPSP")) out.push({ key: "TUVSPSP", en: "TÜV + SPSP", ar: "TÜV + SPSP" });
  return out;
}

type Hero = { kind: "photo"; i: number } | { kind: "cert"; slot: CertSlot };

/**
 * Bid-card equipment modal (013 AC-07/08/09/10). Distinct from the store equipment sheet: it layers
 * the bid's held-cert thumbnails onto the photo strip, shows Distance + Measurement side-by-side with
 * the km value dominant, and the primary CTA opens the deal room for this supplier × request pair.
 */
export function BidEquipmentModal({
  bid,
  busy,
  onRequestDetails,
  onClose,
}: {
  bid: BidCard;
  busy: boolean;
  onRequestDetails: () => void;
  onClose: () => void;
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);
  const equipmentId = bid.equipment?.id ?? null;

  const [eq, setEq] = useState<EquipmentDetail | null>(null);
  const [error, setError] = useState(false);
  const [hero, setHero] = useState<Hero>({ kind: "photo", i: 0 });

  useEffect(() => {
    if (!equipmentId) return;
    const ctrl = new AbortController();
    fetch(`/api/equipment/${encodeURIComponent(equipmentId)}`, { cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: EquipmentDetail) => setEq(d))
      .catch((e) => {
        if (e?.name !== "AbortError") setError(true);
      });
    return () => ctrl.abort();
  }, [equipmentId]);

  const photos = eq?.photos ?? [];
  const slots = useMemo(() => certSlots(bid.heldCertCodes), [bid.heldCertCodes]);
  const title = eq ? (ar ? eq.category : eq.category) || (ar ? eq.subcategory : eq.subcategory) || "—" : "—";
  const measurement = eq ? (ar ? eq.measurementAr : eq.measurement) : null;
  const subtitle = eq ? [eq.manufacturer, eq.modelName, eq.year != null ? String(eq.year) : null].filter(Boolean).join(" · ") : "";
  const km = bid.distanceKm != null ? Math.round(bid.distanceKm) : null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-end overflow-y-auto bg-black/50 p-0 sm:place-items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[18px] bg-surface sm:rounded-[16px]"
        onClick={(e) => e.stopPropagation()}
        dir={ar ? "rtl" : "ltr"}
      >
        {/* Header / close */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-[14px] font-extrabold text-navy">{bid.supplierName}</span>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface2" aria-label={L("Close", "إغلاق")}>
            <Icon name="close" size={18} />
          </button>
        </div>

        {error ? (
          <div className="p-8 text-center text-[13px] text-muted">{L("Couldn’t load the equipment.", "تعذّر تحميل المعدة.")}</div>
        ) : (
          <div className="overflow-y-auto">
            {/* Hero — photo OR cert deal-room placeholder (AC-08) */}
            <div className="relative grid h-[240px] place-items-center bg-gradient-to-br from-surface2 to-surface3">
              {hero.kind === "cert" ? (
                <div className="mx-6 flex max-w-sm flex-col items-center gap-3 rounded-[14px] border border-dashed border-border bg-surface/80 px-6 py-7 text-center">
                  <Icon name="lock" size={34} className="text-muted" />
                  <div className="text-[14px] font-extrabold text-navy">{ar ? hero.slot.ar : hero.slot.en}</div>
                  <div className="text-[12.5px] leading-relaxed text-muted">
                    {L("You can view the full document in the deal room.", "يمكنك مشاهدة الوثيقة الكاملة في غرفة الصفقة")}
                  </div>
                </div>
              ) : photos.length > 0 ? (
                <div className="h-full w-full bg-center bg-no-repeat" style={{ backgroundImage: `url("${photos[hero.i]}")`, backgroundSize: "cover" }} />
              ) : (
                <Icon name="construction" size={56} className="text-muted" />
              )}
            </div>

            {/* Thumbnail strip — photos first, then held-cert thumbnails (AC-07) */}
            {(photos.length > 0 || slots.length > 0) && (
              <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-3">
                {photos.map((p, i) => (
                  <button
                    key={`p${i}`}
                    onClick={() => setHero({ kind: "photo", i })}
                    className={`h-14 w-14 flex-shrink-0 rounded-[10px] bg-center bg-cover ring-2 ${hero.kind === "photo" && hero.i === i ? "ring-brand" : "ring-transparent"}`}
                    style={{ backgroundImage: `url("${p}")` }}
                    aria-label={`${L("Photo", "صورة")} ${i + 1}`}
                  />
                ))}
                {slots.map((slot) => {
                  const active = hero.kind === "cert" && hero.slot.key === slot.key;
                  return (
                    <button
                      key={slot.key}
                      onClick={() => setHero({ kind: "cert", slot })}
                      className={`relative grid h-14 w-14 flex-shrink-0 place-items-center rounded-[10px] border border-border bg-surface2 ring-2 ${active ? "ring-brand" : "ring-transparent"}`}
                      title={ar ? slot.ar : slot.en}
                    >
                      <Icon name="verified_user" size={22} className="text-navy" />
                      <span className="absolute -end-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-ok text-white">
                        <Icon name="check" size={11} />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex flex-col gap-4 p-5">
              {/* Title block */}
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[18px] font-extrabold text-navy">{title}</h2>
                  {bid.eqVerified && <Icon name="verified" size={16} className="text-ok" />}
                </div>
                {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
              </div>

              {/* Distance + Measurement side-by-side (AC-09) — km dominant */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-[12px] border border-border bg-surface2/40 px-4 py-3">
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{L("Distance", "المسافة")}</div>
                  {km != null ? (
                    <div className="mt-0.5 flex items-baseline gap-1">
                      <span className="text-[24px] font-extrabold leading-none text-navy">{km}</span>
                      <span className="text-[12px] font-bold text-muted">{L("km from project", "كم من المشروع")}</span>
                    </div>
                  ) : (
                    <div className="mt-1 text-[15px] font-bold text-muted">—</div>
                  )}
                </div>
                <div className="rounded-[12px] border border-border bg-surface2/40 px-4 py-3">
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{L("Measurement", "القياس")}</div>
                  <div className="mt-1 text-[15px] font-bold text-navy">{measurement || "—"}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer CTA — opens the deal room (AC-10) */}
        <div className="border-t border-border p-4">
          <button
            onClick={onRequestDetails}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-navy py-3 text-[14px] font-extrabold text-white disabled:opacity-60"
          >
            {busy ? (
              <Icon name="progress_activity" size={18} className="animate-spin" />
            ) : (
              <Icon name="forum" size={18} />
            )}
            {L("Request more details", "اطلب مزيد من التفاصيل")}
          </button>
        </div>
      </div>
    </div>
  );
}
