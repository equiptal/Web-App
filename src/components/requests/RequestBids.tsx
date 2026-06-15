"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { fetchBids, startDealRoom, acceptBid } from "@/lib/api/client";
import type { BidCard } from "@/lib/contract/bids";
import { EquipmentDetailModal } from "@/components/stores/EquipmentDetailModal";

/** Lifecycle pill (matches the prototype SPILL). */
const SPILL: Record<string, { cls: string; dot: boolean; en: string; ar: string }> = {
  PENDING: { cls: "sp-pending", dot: true, en: "New", ar: "جديد" },
  OPEN_FOR_NEGOTIATION: { cls: "sp-open", dot: false, en: "Negotiating", ar: "تحت التفاوض" },
  COUNTER_OFFERED: { cls: "sp-counter", dot: true, en: "Counter-offer", ar: "عرض مُقابل" },
  ACCEPTED: { cls: "sp-accepted", dot: false, en: "Accepted", ar: "مقبول" },
  EXPIRED: { cls: "sp-expired", dot: false, en: "Expired", ar: "منتهٍ" },
  WITHDRAWN: { cls: "sp-withdrawn", dot: false, en: "Withdrawn", ar: "مسحوب" },
};
const nf = (n: number) => Math.round(n).toLocaleString("en-US");

/** Footer CTA label per bid lifecycle — exact app 6-state mapping (AC-21). */
function pillLabel(status: string, L: (en: string, ar: string) => string): string {
  switch (status) {
    case "OPEN_FOR_NEGOTIATION":
      return L("Open chat", "فتح المحادثة");
    case "COUNTER_OFFERED":
      return L("Review counter-offer", "مراجعة العرض المُقابل");
    case "ACCEPTED":
      return L("View deal", "عرض الصفقة");
    case "EXPIRED":
      return L("Expired", "منتهٍ");
    case "WITHDRAWN":
      return L("Withdrawn", "مسحوب");
    default:
      return L("Start negotiation on this bid", "بدء التفاوض على هذا العرض");
  }
}

function donutStyle(m: number, c: number, g: number) {
  const tot = m + c + g || 1;
  const mp = ((m / tot) * 100).toFixed(0);
  const cp = (((m + c) / tot) * 100).toFixed(0);
  return { background: `conic-gradient(var(--success) 0 ${mp}%, var(--warning) ${mp}% ${cp}%, var(--surface3) ${cp}% 100%)` };
}

export function RequestBids({ requestId }: { requestId: string }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);
  const router = useRouter();
  const [bids, setBids] = useState<BidCard[] | null>(null);
  const [error, setError] = useState(false);
  const [openPrice, setOpenPrice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewEquipId, setViewEquipId] = useState<string | null>(null);

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Quotation PDF (matches the app's bid_pdf_builder: supplier + equipment + pricing breakdown).
  // Rendered via the browser's print-to-PDF so Arabic/RTL render correctly without font embedding.
  function downloadQuotation() {
    const chosen = (bids ?? []).filter((b) => selected.has(b.id));
    if (!chosen.length) return;
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
    const sar = L("SAR", "ر.س");
    const sections = chosen
      .map((b) => {
        const periods = b.duration ?? 1;
        const rental = (b.price ?? 0) * periods;
        const sub = rental + (b.mobPrice ?? 0) + (b.demobPrice ?? 0);
        const vat = Math.round(sub * 0.15);
        const grand = sub + vat;
        const eq = b.equipment ? [b.equipment.make, b.equipment.model, b.equipment.year].filter(Boolean).join(" · ") : "—";
        const row = (l: string, v: string) => `<tr><td>${esc(l)}</td><td class="v">${esc(v)}</td></tr>`;
        return `<section class="q">
          <div class="qh"><b>${esc(b.supplierName)}</b>${b.verified ? `<span class="vf">✓ ${esc(L("Verified", "موثّق"))}</span>` : ""}</div>
          <div class="eq">${esc(L("Equipment", "المعدات"))}: ${esc(eq)}</div>
          <table>
            ${row(`${L("Rental", "الإيجار")} (${nf(b.price ?? 0)} × ${periods})`, `${nf(rental)} ${sar}`)}
            ${b.mobPrice ? row(L("Mobilization", "النقل"), `${nf(b.mobPrice)} ${sar}`) : ""}
            ${b.demobPrice ? row(L("Return", "الإرجاع"), `${nf(b.demobPrice)} ${sar}`) : ""}
            ${row(L("VAT 15%", "ضريبة ١٥٪"), `${nf(vat)} ${sar}`)}
            <tr class="tot"><td>${esc(L("Estimated total", "الإجمالي التقديري"))}</td><td class="v">${nf(grand)} ${sar}</td></tr>
          </table>
        </section>`;
      })
      .join("");
    const html = `<!doctype html><html dir="${ar ? "rtl" : "ltr"}" lang="${ar ? "ar" : "en"}"><head><meta charset="utf-8"><title>${L("Quotation", "عرض السعر")}</title>
      <style>
        *{box-sizing:border-box} body{font-family:${ar ? '"Tajawal",' : ""}-apple-system,"Segoe UI",Roboto,sans-serif;color:#1C3550;margin:32px}
        .brand{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #1C3550;padding-bottom:12px;margin-bottom:18px}
        .brand .logo{font-size:18px;font-weight:900;letter-spacing:-.3px} .brand .logo i{font-style:normal;color:#F79009}
        .brand .meta{font-size:11.5px;color:#6B8FA8;text-align:${ar ? "left" : "right"}}
        h1{font-size:22px;margin:0 0 4px} .sub{color:#6B8FA8;font-size:13px;margin:0 0 22px}
        .foot{margin-top:24px;border-top:1px solid #E4EDF5;padding-top:12px;font-size:11px;color:#9BB3C8}
        .q{border:1px solid #D4E0EC;border-radius:12px;padding:16px;margin-bottom:14px;page-break-inside:avoid}
        .qh{display:flex;align-items:center;gap:10px;font-size:16px;margin-bottom:6px}
        .qh .vf{font-size:12px;font-weight:800;color:#1DAF58;background:#E7F7EE;border-radius:99px;padding:2px 9px}
        .eq{font-size:13px;color:#2A4F72;font-weight:600;margin-bottom:10px}
        table{width:100%;border-collapse:collapse;font-size:13.5px}
        td{padding:7px 0;border-bottom:1px solid #E4EDF5} td.v{text-align:${ar ? "left" : "right"};font-weight:700}
        tr.tot td{border-top:2px solid #D4E0EC;border-bottom:0;font-weight:800;padding-top:10px} tr.tot td.v{color:#F79009}
      </style></head><body>
      <div class="brand"><span class="logo">MOEDA<i>TECH</i></span><span class="meta">${esc(L("Quotation", "عرض السعر"))}<br>${esc(new Date().toLocaleDateString(ar ? "ar-SA" : "en-GB", { day: "numeric", month: "long", year: "numeric" }))}</span></div>
      <h1>${L("Quotation", "عرض السعر")}</h1>
      <p class="sub">${esc(L("Bids on request", "عروض على الطلب"))} ${esc(requestId)} · ${chosen.length} ${L("bids", "عروض")}</p>
      ${sections}
      <div class="foot">${esc(L("Prices exclude any items not listed. VAT 15% included. Generated by Moedatech.", "الأسعار لا تشمل أي بنود غير مدرجة. تشمل ضريبة القيمة المضافة ١٥٪. صادر عن مودياتك."))}</div>
      <script>window.onload=function(){window.print()}</script>
    </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  }

  useEffect(() => {
    let active = true;
    setBids(null);
    setError(false);
    fetchBids(requestId)
      .then((d) => active && setBids(d.bids))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [requestId]);

  // Matches the app: "Start negotiation" accepts the bid → opens its deal room (the signal to the
  // supplier that the renter is serious). If a room already exists, just open it.
  async function startNegotiation(b: BidCard) {
    if (busyId) return;
    if (b.dealRoomId) {
      router.push(`/deal-room/${b.dealRoomId}`);
      return;
    }
    setBusyId(b.id);
    try {
      await acceptBid(b.id).catch(() => {}); // accept may already be done; ignore and open the room
      const { id } = await startDealRoom(b.id);
      if (id) router.push(`/deal-room/${id}`);
      else setBusyId(null);
    } catch {
      setBusyId(null);
    }
  }

  if (error) return <div className="rempty">{L("Couldn’t load the bids.", "تعذّر تحميل العروض.")}</div>;
  if (!bids) return <div className="rstate"><span className="material-icons-outlined" style={{ fontSize: 26 }}>progress_activity</span></div>;
  if (bids.length === 0) return <div className="rempty">{L("No bids yet — suppliers' offers will appear here.", "لا توجد عروض بعد — ستظهر عروض المؤجّرين هنا.")}</div>;

  return (
    <div>
      <button className="view-req" onClick={() => router.push(`/requests/${requestId}`)}>
        <span className="material-icons-outlined">description</span>
        {L("View full request details", "عرض تفاصيل الطلب كاملة")}
        <span className="material-icons-outlined go">chevron_right</span>
      </button>
      <div className="bids-bar">
        <span className="count">{bids.length} {L("bids", "عروض")}</span>
      </div>
      {bids.map((b) => {
        const sp = SPILL[b.status] ?? SPILL.PENDING;
        const accepted = b.status === "ACCEPTED";
        const disabled = b.status === "EXPIRED" || b.status === "WITHDRAWN" || b.expired;
        const periods = b.duration ?? 1;
        const rentalTotal = (b.price ?? 0) * periods;
        const sub = rentalTotal + (b.mobPrice ?? 0) + (b.demobPrice ?? 0);
        const vat = Math.round(sub * 0.15);
        const grand = sub + vat;
        const eqSub = b.equipment ? [b.equipment.make, b.equipment.model, b.equipment.year].filter(Boolean).join(" · ") : "—";
        const evt =
          b.status === "COUNTER_OFFERED" ? L("Countered", "قدّم عرضاً مقابلاً")
          : b.status === "ACCEPTED" ? L("Accepted", "مقبول")
          : disabled ? L("Validity ended", "انتهت الصلاحية")
          : b.submittedAt ? `${L("Submitted", "قُدّم")} · ${new Date(b.submittedAt).toLocaleDateString(ar ? "ar-SA" : "en-GB", { day: "numeric", month: "short" })}` : L("Submitted", "قُدّم");
        const priceOpen = openPrice === b.id;
        const isSel = selected.has(b.id);
        return (
          <div className={`bid${isSel ? " sel" : ""}`} key={b.id}>
            {/* header */}
            <div className="bid-head">
              <div className="bid-av">
                {b.supplierName.charAt(0).toUpperCase()}
                {b.verified && <span className="vchk"><span className="material-icons-outlined">check</span></span>}
              </div>
              <div className="bid-hh">
                <div className="r1">
                  <span className="sname">{b.supplierName}</span>
                  <span className={`spill ${sp.cls}`}>{sp.dot && <span className="d" />}{ar ? sp.ar : sp.en}</span>
                </div>
                <div className="bid-evt">{evt}</div>
                <div className="credrow">
                  {b.verified ? (
                    <span className="credpill cp-ok"><span className="material-icons-outlined">verified</span>{L("Verified", "موثّق")}</span>
                  ) : (
                    <span className="credpill cp-miss"><span className="material-icons-outlined">remove</span>{L("No certs", "بدون شهادات")}</span>
                  )}
                  {b.rating != null && <span className="credpill cp-ok"><span className="material-icons-outlined">star</span>{b.rating.toFixed(1)}</span>}
                </div>
              </div>
              <div className={`bid-check${isSel ? " on" : ""}`} onClick={() => toggleSelect(b.id)} title={L("Select for quotation", "حدّد لعرض السعر")}>
                <span className="material-icons-outlined">check</span>
              </div>
            </div>

            {/* terms row (donut buckets) */}
            <div className="terms-row row-sep">
              <span className="tlab">{L("Terms", "الشروط")}</span>
              <div className="buckets">
                <span className="bucket">
                  <span className="donut" style={donutStyle(b.matchCount, b.conflictCount, 0)}><span>{b.matchCount + b.conflictCount || 0}</span></span>
                  <span className="bl">{b.conflictCount > 0 ? `${b.conflictCount} ${L("differ", "مختلف")}` : L("All match", "كله مطابق")}</span>
                </span>
              </div>
            </div>

            {/* equipment row — tap to view full equipment details (app parity) */}
            <div
              className={`equip-row row-sep${b.equipment?.id ? " tappable" : ""}`}
              role={b.equipment?.id ? "button" : undefined}
              tabIndex={b.equipment?.id ? 0 : undefined}
              onClick={() => b.equipment?.id && setViewEquipId(b.equipment.id)}
              onKeyDown={(e) => b.equipment?.id && (e.key === "Enter" || e.key === " ") && setViewEquipId(b.equipment.id)}
              title={b.equipment?.id ? L("View equipment details", "عرض تفاصيل المعدات") : undefined}
            >
              <div className="el">
                <div className="elab">{L("Equipment", "المعدات")}{b.verified && <span className="material-icons-outlined vt">verified</span>}</div>
                <div className="esub">{eqSub}{b.distanceKm != null ? ` · ${Math.round(b.distanceKm)} ${L("km", "كم")}` : ""}</div>
              </div>
              {b.equipment?.id && (
                <span className="equip-view">
                  {L("View details", "عرض التفاصيل")}
                  <span className="material-icons-outlined go">chevron_right</span>
                </span>
              )}
            </div>

            {/* price expandable */}
            <div className={`price-row${priceOpen ? " open" : ""}`}>
              <div className="price-collapsed" onClick={() => setOpenPrice(priceOpen ? null : b.id)}>
                <span className="pl">{L("Total", "الإجمالي")}</span>
                <span className="pr">{nf(grand)} {L("SAR", "ر.س")}<span className="chev">expand_more</span></span>
              </div>
              {priceOpen && (
                <div className="price-body">
                  <div className="prow"><span className="pl2">{L("Rental", "الإيجار")} ({nf(b.price ?? 0)} × {periods})</span><span className="pv">{nf(rentalTotal)}</span></div>
                  {b.mobPrice ? <div className="prow"><span className="pl2">{L("Mobilization", "النقل")}</span><span className="pv">{nf(b.mobPrice)}</span></div> : null}
                  {b.demobPrice ? <div className="prow"><span className="pl2">{L("Return", "الإرجاع")}</span><span className="pv">{nf(b.demobPrice)}</span></div> : null}
                  <div className="prow"><span className="pl2">{L("VAT 15%", "ضريبة ١٥٪")}</span><span className="pv">{nf(vat)}</span></div>
                  <div className="grandcard"><span className="gl">{L("Estimated total", "الإجمالي التقديري")}</span><span className="gv">{nf(grand)} {L("SAR", "ر.س")}</span></div>
                </div>
              )}
            </div>

            {/* lifecycle chips */}
            <div className="lc-chips">
              {b.validUntil && <span className="lc-chip"><span className="material-icons-outlined">schedule</span>{L("Valid until", "صالح حتى")} {new Date(b.validUntil).toLocaleDateString(ar ? "ar-SA" : "en-GB", { day: "numeric", month: "short" })}</span>}
              {b.distanceKm != null && <span className="lc-chip"><span className="material-icons-outlined">place</span>{Math.round(b.distanceKm)} {L("km", "كم")}</span>}
            </div>

            {/* negotiate footer — exact app 6-state mapping (AC-21): the pill label + enabled state
                derive from the bid lifecycle. ACCEPTED → "View deal" (opens the room); only
                EXPIRED/WITHDRAWN are disabled. The CTA always routes into the deal room. */}
            <div className="neg-footer">
              <button className="neg-pill" disabled={disabled || busyId === b.id} onClick={() => startNegotiation(b)}>
                {pillLabel(b.status, L)}
                {!disabled && <span className="material-icons-outlined">arrow_forward</span>}
              </button>
              <p className="nf-hint">
                {accepted
                  ? L("Tap to open the deal room and continue with this supplier.", "اضغط لفتح غرفة الصفقة ومتابعة هذا المؤجر.")
                  : L("Tapping opens the deal room — a signal to the supplier that you are serious about this bid", "بالضغط تنتقل إلى غرفة التفاوض — إشارة للمؤجر بأنك جاد في هذا العرض")}
              </p>
            </div>
          </div>
        );
      })}

      {/* select bids → download quotation */}
      {selected.size > 0 && (
        <div className="qbar">
          <span className="qn">{selected.size} {L("selected", "محدّد")}</span>
          <span className="qclear" onClick={() => setSelected(new Set())}>{L("Clear", "مسح")}</span>
          <button className="qdl" onClick={downloadQuotation}>
            <span className="material-icons-outlined">download</span> {L("Download quotation", "تنزيل عرض السعر")}
          </button>
        </div>
      )}

      {viewEquipId && <EquipmentDetailModal equipmentId={viewEquipId} onClose={() => setViewEquipId(null)} />}
    </div>
  );
}
