"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { fetchBids, startDealRoom } from "@/lib/api/client";
import type { BidCard } from "@/lib/contract/bids";
import { BidEquipmentModal } from "@/components/requests/BidEquipmentModal";
import { CredentialPills } from "@/components/requests/CredentialPills";
import { TermsPanel } from "@/components/requests/TermsPanel";
import { TermClassBadges } from "@/components/requests/TermClassBadges";
import { DealRoomBanner, SupplierDocs } from "@/components/requests/BidCardExtras";
import { SharedLinkBidCard } from "@/components/requests/SharedLinkBidCard";
import { SharedBidSubmissionModal } from "@/components/requests/SharedBidSubmissionModal";
import { useSharedLinkMock, tagSharedLinkBids } from "@/lib/mock/shared-link-bids";

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


export function RequestBids({ requestId }: { requestId: string }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);
  // Period label from the bid's billing unit — drives the collapsed "rate / period" display.
  const periodLabel = (u: string | null) => {
    switch ((u ?? "PER_DAY").toUpperCase()) {
      case "PER_WEEK": return L("week", "أسبوع");
      case "PER_MONTH": return L("month", "شهر");
      case "PER_JOB": return L("job", "مهمة");
      default: return L("day", "يوم");
    }
  };
  const router = useRouter();
  const [bids, setBids] = useState<BidCard[] | null>(null);
  const [error, setError] = useState(false);
  const [openPrice, setOpenPrice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [equipBid, setEquipBid] = useState<BidCard | null>(null);
  const [openTermsId, setOpenTermsId] = useState<string | null>(null);
  // web-app/006 demo (staging only) — relabel real bids as off-platform "via shared link".
  const mockEnabled = useSharedLinkMock();
  const [submissionBid, setSubmissionBid] = useState<BidCard | null>(null);

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
        const units = b.numberOfUnits || 1; // bid price is per-unit → × units (app parity)
        const rental = (b.price ?? 0) * periods * units;
        const sub = rental + (b.mobPrice ?? 0) + (b.demobPrice ?? 0);
        const vat = Math.round(sub * 0.15);
        const grand = sub + vat;
        const eq = b.equipment ? [b.equipment.make, b.equipment.model, b.equipment.year].filter(Boolean).join(" · ") : "—";
        const unitsTxt = units > 1 ? ` × ${units}` : "";
        const row = (l: string, v: string) => `<tr><td>${esc(l)}</td><td class="v">${esc(v)}</td></tr>`;
        return `<section class="q">
          <div class="qh"><b>${esc(b.supplierName)}</b>${b.verified ? `<span class="vf">✓ ${esc(L("Verified", "موثّق"))}</span>` : ""}</div>
          <div class="eq">${esc(L("Equipment", "المعدات"))}: ${esc(eq)}</div>
          <table>
            ${row(`${L("Rental", "الإيجار")} (${nf(b.price ?? 0)} × ${periods}${unitsTxt})`, `${nf(rental)} ${sar}`)}
            ${b.mobPrice ? row(L("Mobilization", "النقل"), `${nf(b.mobPrice)} ${sar}`) : ""}
            ${b.demobPrice ? row(L("Return", "الإرجاع"), `${nf(b.demobPrice)} ${sar}`) : ""}
            ${row(L("Subtotal before VAT", "المجموع قبل الضريبة"), `${nf(sub)} ${sar}`)}
            ${row(L("VAT (15%)", "ضريبة القيمة المضافة (١٥٪)"), `${nf(vat)} ${sar}`)}
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
      <div class="foot">${esc(L("Prices exclude any items not listed. VAT 15% included. Generated by Moedatech.", "الأسعار لا تشمل أي بنود غير مدرجة. تشمل ضريبة القيمة المضافة ١٥٪. صادر عن معداتك."))}</div>
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
    // The bids payload is already enriched server-side with the live deal-room state (currentPrice +
    // locked/unread terms + progress — same fields the mobile bid card reads), so no per-bid fetch.
    fetchBids(requestId)
      .then((d) => active && setBids(d.bids))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [requestId]);

  // App parity: the deal room is a PRE-acceptance negotiation surface, so "Start negotiation" just
  // opens (or lazily creates) the room — it does NOT accept the bid. Final accept is gated inside
  // the deal room once every term is agreed. If a room already exists, open it.
  async function startNegotiation(b: BidCard) {
    if (busyId) return;
    if (b.dealRoomId) {
      router.push(`/deal-room/${b.dealRoomId}`);
      return;
    }
    setBusyId(b.id);
    try {
      const { id } = await startDealRoom(b.id);
      if (id) router.push(`/deal-room/${id}`);
      else setBusyId(null);
    } catch {
      setBusyId(null);
    }
  }

  if (error) return <div className="rempty">{L("Couldn’t load the bids.", "تعذّر تحميل العروض.")}</div>;
  if (!bids) return <div className="rstate"><span className="material-icons-outlined" style={{ fontSize: 26 }}>progress_activity</span></div>;
  // Staging demo: relabel the first couple of real bids as off-platform shared-link submissions.
  const allBids = mockEnabled ? tagSharedLinkBids(bids) : bids;
  if (allBids.length === 0) return <div className="rempty">{L("No bids yet — suppliers' offers will appear here.", "لا توجد عروض بعد — ستظهر عروض المؤجّرين هنا.")}</div>;

  return (
    <div>
      <button className="view-req" onClick={() => router.push(`/requests/${requestId}`)}>
        <span className="material-icons-outlined">description</span>
        {L("View full request details", "عرض تفاصيل الطلب كاملة")}
        <span className="material-icons-outlined go">chevron_right</span>
      </button>
      <div className="bids-bar">
        <span className="count">{allBids.length} {L("bids", "عروض")}</span>
      </div>
      {allBids.map((b) => {
        if (b.viaSharedLink) {
          return (
            <SharedLinkBidCard
              key={b.id}
              bid={b}
              ar={ar}
              L={L}
              isSel={selected.has(b.id)}
              onToggleSelect={() => toggleSelect(b.id)}
              onViewSubmission={() => setSubmissionBid(b)}
            />
          );
        }
        const sp = SPILL[b.status] ?? SPILL.PENDING;
        const accepted = b.status === "ACCEPTED";
        const disabled = b.status === "EXPIRED" || b.status === "WITHDRAWN" || b.expired;
        const periods = b.duration ?? 1;
        const units = b.numberOfUnits || 1; // bid price is per-unit → × units (app parity)
        const rentalTotal = (b.price ?? 0) * periods * units;
        const sub = rentalTotal + (b.mobPrice ?? 0) + (b.demobPrice ?? 0);
        const vat = Math.round(sub * 0.15);
        const grand = sub + vat;
        const evt =
          b.status === "COUNTER_OFFERED" ? L("Countered", "قدّم عرضاً مقابلاً")
          : b.status === "ACCEPTED" ? L("Accepted", "مقبول")
          : disabled ? L("Validity ended", "انتهت الصلاحية")
          : b.submittedAt ? `${L("Submitted", "قُدّم")} · ${new Date(b.submittedAt).toLocaleDateString(ar ? "ar-SA" : "en-GB", { day: "numeric", month: "short" })}` : L("Submitted", "قُدّم");
        const priceOpen = openPrice === b.id;
        const isSel = selected.has(b.id);
        return (
          <div className={`bid${isSel ? " sel" : ""}`} key={b.id}>
            {/* deal-room status banner (app parity) — whose move it is + agreed-terms meter */}
            <DealRoomBanner bid={b} ar={ar} />
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
                    <span className="credpill cp-miss"><span className="material-icons-outlined">remove</span>{L("Not verified", "غير موثّق")}</span>
                  )}
                  {b.rating != null && <span className="credpill cp-ok"><span className="material-icons-outlined">star</span>{b.rating.toFixed(1)}</span>}
                  <CredentialPills required={b.requiredCerts} held={b.heldCertCodes} ar={ar} />
                </div>
                {/* supplier credentials on file — identity docs (CR / VAT / National address) + held certs */}
                <SupplierDocs compliance={b.compliance} heldCerts={b.heldCertCodes} requiredCerts={b.requiredCerts} ar={ar} />
              </div>
              <div className={`bid-check${isSel ? " on" : ""}`} onClick={() => toggleSelect(b.id)} title={L("Select for quotation", "حدّد لعرض السعر")}>
                <span className="material-icons-outlined">check</span>
              </div>
            </div>

            {/* Terms — per-class status chips (Equipment / Project / Supplier); tap expands an inline
                dropdown (not a popup) with the per-term status inside each class. New-counter badge
                surfaces unseen deal-room changes. */}
            <button
              type="button"
              className={`terms-row row-sep tappable${openTermsId === b.id ? " open" : ""}`}
              aria-expanded={openTermsId === b.id}
              onClick={() => setOpenTermsId(openTermsId === b.id ? null : b.id)}
            >
              <span className="tlab">{L("Terms", "الشروط")}</span>
              <TermClassBadges terms={b.terms} ar={ar} />
              {b.unreadTerms.length > 0 && <span className="dr-turn">{b.unreadTerms.length} {L("new", "جديد")}</span>}
              <span className="material-icons-outlined chev">expand_more</span>
            </button>
            {openTermsId === b.id && <TermsPanel terms={b.terms} ar={ar} L={L} />}

            {/* equipment row — tap to view full equipment details (app parity) */}
            <div
              className={`equip-row row-sep${b.equipment?.id ? " tappable" : ""}`}
              role={b.equipment?.id ? "button" : undefined}
              tabIndex={b.equipment?.id ? 0 : undefined}
              onClick={() => b.equipment?.id && setEquipBid(b)}
              onKeyDown={(e) => b.equipment?.id && (e.key === "Enter" || e.key === " ") && setEquipBid(b)}
              title={b.equipment?.id ? L("Tap for details", "اضغط للتفاصيل") : undefined}
            >
              <div className="el">
                <div className="elab">{L("Equipment", "المعدة")}{b.eqVerified && <span className="material-icons-outlined vt">verified</span>}{units > 1 && <span className="qty-badge">× {units}</span>}</div>
                <div className="esub">{b.distanceKm != null ? `${Math.round(b.distanceKm)} ${L("km from the project", "كم من المشروع")}` : L("Distance not shared", "المسافة غير محددة")}</div>
              </div>
              {b.equipment?.id && (
                <span className="equip-view">
                  {L("Tap for details", "اضغط للتفاصيل")}
                  <span className="material-icons-outlined go">chevron_right</span>
                </span>
              )}
            </div>

            {/* supplier note (app parity — BidModel.note) */}
            {b.note && (
              <div className="bid-note row-sep">
                <span className="material-icons-outlined">sticky_note_2</span>
                <span className="bn-text">{b.note}</span>
              </div>
            )}

            {/* price expandable */}
            <div className={`price-row${priceOpen ? " open" : ""}`}>
              <div className="price-collapsed" onClick={() => setOpenPrice(priceOpen ? null : b.id)}>
                <span className="pl">{L("Rate", "السعر")}</span>
                <span className="pr">{nf(b.price ?? 0)} {L("SAR", "ر.س")} / {periodLabel(b.priceUnit)}{units > 1 ? ` · ${L("per unit", "لكل وحدة")}` : ""}<span className="chev">expand_more</span></span>
              </div>
              {priceOpen && (
                <div className="price-body">
                  <div className="prow"><span className="pl2">{L("Rental", "الإيجار")} ({nf(b.price ?? 0)} × {periods}{units > 1 ? ` × ${units}` : ""})</span><span className="pv">{nf(rentalTotal)}</span></div>
                  {b.mobPrice ? <div className="prow"><span className="pl2">{L("Delivery to site", "النقل إلى الموقع")}{b.mobLeadTime && <span className="lead">{L("delivery within", "تسليم خلال")} {b.mobLeadTime}</span>}</span><span className="pv">{nf(b.mobPrice)}</span></div> : null}
                  {b.demobPrice ? <div className="prow"><span className="pl2">{L("Return from site", "النقل من الموقع")}{b.demobLeadTime && <span className="lead">{L("return within", "إرجاع خلال")} {b.demobLeadTime}</span>}</span><span className="pv">{nf(b.demobPrice)}</span></div> : null}
                  <div className="prow"><span className="pl2">{L("Subtotal before VAT", "المجموع قبل الضريبة")}</span><span className="pv">{nf(sub)}</span></div>
                  <div className="prow"><span className="pl2">{L("VAT (15%)", "ضريبة القيمة المضافة (١٥٪)")}</span><span className="pv">{nf(vat)}</span></div>
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

      {equipBid && (
        <BidEquipmentModal
          bid={equipBid}
          busy={busyId === equipBid.id}
          onRequestDetails={() => startNegotiation(equipBid)}
          onClose={() => setEquipBid(null)}
        />
      )}

      {/* web-app/006 demo — read-only viewer of an off-platform shared-link submission */}
      {submissionBid && (
        <SharedBidSubmissionModal
          bid={submissionBid}
          ar={ar}
          L={L}
          onClose={() => setSubmissionBid(null)}
          onAddToCompare={() => setSelected((prev) => new Set(prev).add(submissionBid.id))}
        />
      )}
    </div>
  );
}
