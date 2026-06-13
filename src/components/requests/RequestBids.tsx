"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { fetchBids, acceptBid } from "@/lib/api/client";
import type { BidCard } from "@/lib/contract/bids";
import { Icon } from "@/components/ui";

/** Lifecycle pill palette (mirrors the prototype's spill states). */
const PILL: Record<string, { cls: string; en: string; ar: string }> = {
  PENDING: { cls: "bg-info-soft text-info", en: "New", ar: "جديد" },
  OPEN_FOR_NEGOTIATION: { cls: "bg-surface2 text-navy-mid", en: "Negotiating", ar: "تحت التفاوض" },
  COUNTER_OFFERED: { cls: "bg-warn-soft text-warn", en: "Counter-offer", ar: "عرض مُقابل" },
  ACCEPTED: { cls: "bg-ok-soft text-ok", en: "Accepted", ar: "مقبول" },
  EXPIRED: { cls: "bg-surface2 text-muted", en: "Expired", ar: "منتهٍ" },
  WITHDRAWN: { cls: "bg-surface2 text-muted", en: "Withdrawn", ar: "مسحوب" },
};
const CTA: Record<string, { en: string; ar: string; icon: string }> = {
  PENDING: { en: "Start negotiation", ar: "بدء التفاوض", icon: "forum" },
  OPEN_FOR_NEGOTIATION: { en: "Open chat", ar: "فتح المحادثة", icon: "chat" },
  COUNTER_OFFERED: { en: "Review counter-offer", ar: "مراجعة العرض المُقابل", icon: "forum" },
  ACCEPTED: { en: "View deal", ar: "عرض الصفقة", icon: "handshake" },
};

const money = (v: number | null, ar: boolean) => (v == null ? "—" : `${v.toLocaleString(ar ? "ar-SA" : "en-US")} ${ar ? "ر.س" : "SAR"}`);

export function RequestBids({ requestId }: { requestId: string }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);
  const router = useRouter();
  const [bids, setBids] = useState<BidCard[] | null>(null);
  const [error, setError] = useState(false);
  const [openPrice, setOpenPrice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setBids(null);
    setError(false);
    fetchBids(requestId)
      .then((d) => setBids(d.bids))
      .catch(() => setError(true));
  };
  useEffect(load, [requestId]);

  async function onAccept(b: BidCard) {
    if (busyId) return;
    setBusyId(b.id);
    try {
      await acceptBid(b.id);
      load();
    } catch {
      setBusyId(null);
    }
  }

  function goDeal(b: BidCard) {
    if (b.dealRoomId) router.push(`/deal-room/${b.dealRoomId}`);
    else router.push(`/deal-room/new?bid=${encodeURIComponent(b.id)}`);
  }

  if (error) return <div className="rounded-[14px] border border-border bg-surface p-8 text-center text-[14px] font-semibold text-navy">{L("Couldn’t load the bids.", "تعذّر تحميل العروض.")}</div>;
  if (!bids) return <div className="grid place-items-center py-12 text-muted"><Icon name="progress_activity" size={26} className="animate-spin" /></div>;
  if (bids.length === 0) return <div className="rounded-[14px] border border-dashed border-border bg-surface2/40 p-10 text-center text-[13.5px] text-muted">{L("No bids yet — suppliers' offers will appear here.", "لا توجد عروض بعد — ستظهر عروض المؤجّرين هنا.")}</div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="text-[13px] font-bold text-muted">{bids.length} {L("bids", "عروض")}</div>
      {bids.map((b) => {
        const pill = PILL[b.status] ?? PILL.PENDING;
        const cta = CTA[b.status];
        const disabled = b.status === "EXPIRED" || b.status === "WITHDRAWN";
        const sub = (b.price ?? 0) + (b.mobPrice ?? 0) + (b.demobPrice ?? 0);
        const vat = Math.round(sub * 0.15);
        const grand = sub + vat;
        const eqLine = b.equipment ? [b.equipment.make, b.equipment.model, b.equipment.year].filter(Boolean).join(" · ") : "—";
        return (
          <div key={b.id} className={`overflow-hidden rounded-[14px] border bg-surface ${b.status === "ACCEPTED" ? "border-ok" : "border-border"}`}>
            {/* header */}
            <div className="flex items-start gap-3 p-3.5">
              <span className="relative grid h-10 w-10 flex-none place-items-center rounded-full bg-[#E8DEC0] text-[15px] font-extrabold text-navy">
                {b.supplierName.charAt(0).toUpperCase()}
                {b.verified && (
                  <span className="absolute -bottom-0.5 -end-0.5 grid h-4 w-4 place-items-center rounded-full border-2 border-surface bg-ok">
                    <Icon name="check" size={9} className="text-white" />
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-extrabold text-navy">{b.supplierName}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${pill.cls}`}>{ar ? pill.ar : pill.en}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-[11.5px] font-semibold text-muted">
                  {b.rating != null && <span className="inline-flex items-center gap-0.5"><Icon name="star" size={13} className="text-warn" /> {b.rating.toFixed(1)}</span>}
                  {b.distanceKm != null && <span className="inline-flex items-center gap-0.5"><Icon name="place" size={13} /> {Math.round(b.distanceKm)} {L("km", "كم")}</span>}
                  {b.verified && <span className="inline-flex items-center gap-0.5 text-ok"><Icon name="verified" size={13} /> {L("Verified", "موثّق")}</span>}
                </div>
              </div>
            </div>

            {/* equipment */}
            <div className="flex items-center gap-3 border-t border-line px-3.5 py-2.5">
              <Icon name="construction" size={18} className="text-muted" />
              <div className="min-w-0 text-[12.5px] font-bold text-navy">{eqLine}</div>
              <span className="ms-auto inline-flex items-center gap-1.5 text-[11px] font-bold text-muted">
                <span className="text-ok">{b.matchCount} {L("match", "مطابق")}</span>
                {b.conflictCount > 0 && <span className="text-warn">· {b.conflictCount} {L("differ", "مختلف")}</span>}
              </span>
            </div>

            {/* price (expandable) */}
            <div className="border-t border-line">
              <button onClick={() => setOpenPrice((p) => (p === b.id ? null : b.id))} className="flex w-full items-center px-3.5 py-3">
                <span className="text-[13px] font-extrabold text-navy">{L("Total", "الإجمالي")}</span>
                <span className="ms-auto inline-flex items-center gap-1.5 font-mono text-[16px] font-bold text-brand">
                  {money(grand, ar)}
                  <Icon name="expand_more" size={18} className={`text-muted transition ${openPrice === b.id ? "rotate-180" : ""}`} />
                </span>
              </button>
              {openPrice === b.id && (
                <div className="px-3.5 pb-3.5 text-[13px]">
                  <Row label={`${L("Rental", "الإيجار")}${b.duration ? ` · ${b.duration}` : ""}`} value={money(b.price, ar)} />
                  {b.mobPrice ? <Row label={L("Mobilization", "النقل")} value={money(b.mobPrice, ar)} /> : null}
                  {b.demobPrice ? <Row label={L("Return", "الإرجاع")} value={money(b.demobPrice, ar)} /> : null}
                  <Row label={L("VAT 15%", "ضريبة ١٥٪")} value={money(vat, ar)} />
                  <div className="mt-2 flex items-center rounded-[10px] border border-brand/40 bg-brand-soft px-3 py-2.5">
                    <span className="text-[13px] font-extrabold text-navy">{L("Estimated total", "الإجمالي التقديري")}</span>
                    <span className="ms-auto font-mono text-[15px] font-extrabold text-brand">{money(grand, ar)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* footer */}
            <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface2/40 px-3.5 py-3">
              {b.validUntil && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-muted"><Icon name="schedule" size={13} /> {L("Valid until", "صالح حتى")} {new Date(b.validUntil).toLocaleDateString(ar ? "ar-SA" : "en-GB", { day: "numeric", month: "short" })}</span>}
              <div className="ms-auto flex gap-2">
                {b.status !== "ACCEPTED" && !disabled && (
                  <button onClick={() => onAccept(b)} disabled={busyId === b.id} className="inline-flex items-center gap-1.5 rounded-[10px] border border-ok/40 px-3.5 py-2 text-[12.5px] font-bold text-ok disabled:opacity-50">
                    <Icon name="check_circle" size={15} /> {busyId === b.id ? L("Accepting…", "جارٍ القبول…") : L("Accept", "قبول")}
                  </button>
                )}
                {cta && (
                  <button onClick={() => goDeal(b)} disabled={disabled} className="inline-flex items-center gap-1.5 rounded-[10px] bg-brand px-4 py-2 text-[12.5px] font-bold text-brand-fg disabled:opacity-50">
                    <Icon name={cta.icon} size={15} /> {ar ? cta.ar : cta.en}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-2 last:border-0">
      <span className="font-semibold text-navy-mid">{label}</span>
      <span className="font-mono font-bold text-navy">{value}</span>
    </div>
  );
}
