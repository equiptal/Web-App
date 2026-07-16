"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { fetchBids, fetchRequestSubmissions, startDealRoom } from "@/lib/api/client";
import type { BidCard } from "@/lib/contract/bids";
import { computeBidQuote } from "@/lib/contract/comparison";
import { submissionToBidCard, type LinkBidSubmission } from "@/lib/contract/link-bids";
import { qualityFromSubmission, type BidQuality } from "@/lib/contract/bid-quality";
import { BidEquipmentModal } from "@/components/requests/BidEquipmentModal";
import { CredentialPills } from "@/components/requests/CredentialPills";
import { TermsPanel } from "@/components/requests/TermsPanel";
import { TermClassBadges } from "@/components/requests/TermClassBadges";
import { DealRoomBanner, SupplierDocs, EquipmentDocs } from "@/components/requests/BidCardExtras";
import { QuotationVerifyGate } from "@/components/requests/QuotationVerifyGate";
import { useSession } from "@/lib/session";
import { SharedLinkBidCard } from "@/components/requests/SharedLinkBidCard";
import { SharedBidSubmissionModal } from "@/components/requests/SharedBidSubmissionModal";
import { SharedBidNegotiateRoom } from "@/components/requests/SharedBidNegotiateRoom";
import { NEGOTIATE_ENABLED } from "@/lib/config/flags";
import { computeBidReadiness } from "@/lib/contract/bid-readiness";
import { BidReadinessBadge, BidEligibilityModal } from "@/components/requests/BidReadiness";

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

/** Offer-state suffix for the deal-room CTA (uiState) — new / updated offer / whose move it is. */
function offerSuffix(uiState: string | null, L: (en: string, ar: string) => string): string | null {
  switch (uiState) {
    case "new": return L("New offer", "عرض جديد");
    case "fresh": return L("Updated offer", "عرض مُحدّث");
    case "your-turn": return L("Your turn", "دورك");
    default: return null; // waiting / null → no suffix
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
  const { tier } = useSession();
  const [quoteGate, setQuoteGate] = useState(false); // unverified → confirm before issuing the quotation
  // web-app/006 (expanded) — real off-platform submissions via the request's shared link.
  const [submissions, setSubmissions] = useState<LinkBidSubmission[]>([]);
  const [src, setSrc] = useState<"all" | "app" | "link">("all"); // source filter
  const [submissionBid, setSubmissionBid] = useState<BidCard | null>(null);
  const [negotiateBid, setNegotiateBid] = useState<BidCard | null>(null); // web-app/006 — deal-room-style negotiate view
  const [eligBid, setEligBid] = useState<BidCard | null>(null); // bid-readiness — eligibility view for a native bid's offered units

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
    // Include off-platform (shared-link) submissions, not just on-platform bids.
    const chosen = merged.filter((b) => selected.has(b.id));
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
      <div class="brand"><span class="logo">MOEDA<i>TECH</i></span><span class="meta">${esc(L("Quotation", "عرض السعر"))}<br>${esc(new Date().toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "long", year: "numeric" }))}</span></div>
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
    // Off-platform shared-link submissions (independent of the app bids; best-effort).
    setSubmissions([]);
    fetchRequestSubmissions(requestId)
      .then((r) => active && setSubmissions(r.submissions))
      .catch(() => {});
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
  // Merge on-platform app bids with off-platform shared-link submissions (mapped to a BidCard shape).
  // A submission covers the whole group; on a single request, show only THIS request's item (one card).
  const linkLabels = new Map<string, string | null>(); // card id → item label (for the card title)
  const linkQuality = new Map<string, BidQuality>(); // card id → bid-quality score (shown on the card)
  const linkCards = submissions.flatMap((s) => {
    const it = s.items.find((i) => i.requestId === requestId) ?? (s.items.length === 1 ? s.items[0] : null);
    if (!it) return [];
    const id = `link-${s.id}-${it.requestItemId}`;
    linkLabels.set(id, it.label ?? null);
    linkQuality.set(id, qualityFromSubmission(s));
    return [{ ...submissionToBidCard(s, it), id }];
  });
  const merged = [...bids, ...linkCards];
  // Off-platform = raw shared-link submissions OR app bids CONVERTED from one (web-app/006). Both are
  // labelled + counted as off-platform, even though a converted bid is a first-class app bid with a deal room.
  const isOff = (b: { viaSharedLink?: boolean; converted?: boolean }) => !!(b.viaSharedLink || b.converted);
  const linkCount = merged.filter(isOff).length;
  const appCount = merged.filter((b) => !isOff(b)).length;
  const allBids = merged.filter((b) => (src === "all" ? true : src === "link" ? isOff(b) : !isOff(b)));
  if (merged.length === 0) return <div className="rempty">{L("No bids yet — suppliers' offers will appear here.", "لا توجد عروض بعد — ستظهر عروض المؤجّرين هنا.")}</div>;

  return (
    <div>
      <button className="view-req" onClick={() => router.push(`/requests/${requestId}`)}>
        <span className="material-icons-outlined">description</span>
        {L("View full request details", "عرض تفاصيل الطلب كاملة")}
        <span className="material-icons-outlined go">chevron_right</span>
      </button>
      <div className="bids-bar">
        <span className="count">{allBids.length} {L("bids", "عروض")}</span>
        {linkCount > 0 && (
          <div className="bids-srcfilter" style={{ display: "flex", gap: 6, marginInlineStart: "auto" }}>
            {([
              ["all", L("All", "الكل"), appCount + linkCount],
              ["app", L("In-app", "داخل التطبيق"), appCount],
              ["link", L("Via shared link", "عبر الرابط"), linkCount],
            ] as const).map(([k, lbl, n]) => (
              <button key={k} type="button" onClick={() => setSrc(k)}
                className="srcchip"
                style={{ border: "1px solid", borderRadius: 999, padding: "3px 10px", fontSize: 11.5, fontWeight: 700,
                  ...(src === k ? { background: "#0f172a", color: "#fff", borderColor: "#0f172a" } : { background: "#fff", color: "#475569", borderColor: "#e2e8f0" }) }}>
                {lbl} <span style={{ opacity: 0.7 }}>{n}</span>
              </button>
            ))}
          </div>
        )}
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
              onNegotiate={NEGOTIATE_ENABLED ? () => setNegotiateBid(b) : undefined}
              itemLabel={linkLabels.get(b.id) ?? null}
              quality={linkQuality.get(b.id) ?? null}
            />
          );
        }
        const sp = SPILL[b.status] ?? SPILL.PENDING;
        const accepted = b.status === "ACCEPTED";
        const disabled = b.status === "EXPIRED" || b.status === "WITHDRAWN" || b.expired;
        // Canonical quote: rate ÷ period-days × duration (weekly ÷7, monthly ÷26), mob/demob × units, VAT 15%.
        const q = computeBidQuote(b);
        const units = q.units;
        const periods = q.periods;
        const rentalTotal = q.rentalSubtotal;
        const sub = q.subtotalPreVat;
        const vat = Math.round(q.vat);
        const grand = Math.round(q.total);
        const evt =
          b.status === "COUNTER_OFFERED" ? L("Countered", "قدّم عرضاً مقابلاً")
          : b.status === "ACCEPTED" ? L("Accepted", "مقبول")
          : disabled ? L("Validity ended", "انتهت الصلاحية")
          : b.submittedAt ? `${L("Submitted", "قُدّم")} · ${new Date(b.submittedAt).toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "short" })}` : L("Submitted", "قُدّم");
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
                  {b.converted ? (
                    // web-app/006: a converted bid is a real app bid, but keep its OFF-PLATFORM origin label.
                    <span className="src-chip" style={{ background: "var(--brand-soft, #fff4e5)", color: "var(--brand, #f79009)" }}><span className="material-icons-outlined">link</span>{L("via shared link", "عبر الرابط")}</span>
                  ) : (
                    <span className="src-chip src-app"><span className="material-icons-outlined">verified_user</span>{L("via Moedatech app", "عبر تطبيق معداتك")}</span>
                  )}
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
                  {(() => { const rd = computeBidReadiness(b); return rd ? <BidReadinessBadge r={rd} L={L} onClick={() => setEligBid(b)} /> : null; })()}
                </div>
                {/* Company documents on file (Level 1) — CR / VAT / National address + LC / SASO registration */}
                <SupplierDocs compliance={b.compliance} companyCerts={b.companyCertCodes ?? []} ar={ar} />
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
                {/* Equipment certs + proof-of-ownership docs on file (Level 2) */}
                <EquipmentDocs equipmentCerts={b.equipmentCertCodes ?? []} ownershipDocs={b.ownershipDocs} ar={ar} />
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

            {/* price-negotiable hint (app parity — unconditional on on-platform cards; opens the deal room) */}
            <button type="button" className="neg-hint" disabled={busyId === b.id} onClick={() => startNegotiation(b)}>
              <span className="material-icons-outlined">forum</span>
              {L("This price is negotiable — open the deal room to chat", "هذا السعر قابل للتفاوض — افتح غرفة الصفقة للتحدث")}
            </button>

            {/* price expandable */}
            <div className={`price-row${priceOpen ? " open" : ""}`}>
              <div className="price-collapsed" onClick={() => setOpenPrice(priceOpen ? null : b.id)}>
                <span className="pl">{L("Rate", "السعر")}</span>
                <span className="pr">{nf(b.price ?? 0)} {L("SAR", "ر.س")} / {periodLabel(b.priceUnit)}{units > 1 ? ` · ${L("per unit", "لكل وحدة")}` : ""}<span className="chev">expand_more</span></span>
              </div>
              {priceOpen && (
                <div className="price-body">
                  <div className="prow"><span className="pl2">{L("Rental", "الإيجار")} ({nf(b.price ?? 0)} × {Number.isInteger(periods) ? periods : periods.toFixed(2)}{units > 1 ? ` × ${units}` : ""})</span><span className="pv">{nf(rentalTotal)}</span></div>
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
              {b.validUntil && <span className="lc-chip"><span className="material-icons-outlined">schedule</span>{L("Valid until", "صالح حتى")} {new Date(b.validUntil).toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "short" })}</span>}
              {b.distanceKm != null && <span className="lc-chip"><span className="material-icons-outlined">place</span>{Math.round(b.distanceKm)} {L("km", "كم")}</span>}
            </div>

            {/* negotiate footer — exact app 6-state mapping (AC-21): the pill label + enabled state
                derive from the bid lifecycle. ACCEPTED → "View deal" (opens the room); only
                EXPIRED/WITHDRAWN are disabled. The CTA always routes into the deal room. */}
            <div className="neg-footer">
              <button className="neg-pill" disabled={disabled || busyId === b.id} onClick={() => startNegotiation(b)}>
                {pillLabel(b.status, L)}{offerSuffix(b.uiState, L) ? ` · ${offerSuffix(b.uiState, L)}` : ""}
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
          <button className="qdl" onClick={() => (tier === "verified" ? downloadQuotation() : setQuoteGate(true))}>
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

      {/* web-app/006 — read-only viewer of an off-platform shared-link submission (real answers) */}
      {submissionBid && (
        <SharedBidSubmissionModal
          bid={submissionBid}
          submission={submissions.find((s) => s.id === submissionBid.submissionKey) ?? null}
          focusItemId={submissionBid.requestItemId}
          ar={ar}
          L={L}
          onClose={() => setSubmissionBid(null)}
          onNegotiate={NEGOTIATE_ENABLED ? () => { const b = submissionBid; setSubmissionBid(null); setNegotiateBid(b); } : undefined}
        />
      )}

      {/* web-app/006 — deal-room-style negotiate relay for an off-platform shared-link bid */}
      {NEGOTIATE_ENABLED && negotiateBid && (
        <SharedBidNegotiateRoom
          bid={negotiateBid}
          submission={submissions.find((s) => s.id === negotiateBid.submissionKey) ?? null}
          itemLabel={linkLabels.get(negotiateBid.id) ?? null}
          ar={ar}
          L={L}
          onClose={() => setNegotiateBid(null)}
          onViewSubmission={() => { const b = negotiateBid; setNegotiateBid(null); setSubmissionBid(b); }}
        />
      )}

      {/* bid-readiness — read-only eligibility view for a native bid's offered units */}
      {eligBid && (() => { const rd = computeBidReadiness(eligBid); return rd ? <BidEligibilityModal r={rd} supplierName={eligBid.supplierName} ar={ar} L={L} onClose={() => setEligBid(null)} /> : null; })()}

      {/* Issue-quotation gate for an unverified renter (company name vs personal name). */}
      {quoteGate && (
        <QuotationVerifyGate
          ar={ar}
          L={L}
          onClose={() => setQuoteGate(false)}
          onVerify={() => { setQuoteGate(false); router.push("/verify"); }}
          onContinue={() => { setQuoteGate(false); downloadQuotation(); }}
        />
      )}
    </div>
  );
}
