"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { fetchBids, fetchRequestDetail, fetchRequestSubmissions, startDealRoom } from "@/lib/api/client";
import { bucketBidTerms, type BidCard } from "@/lib/contract/bids";
import { computeBidQuote } from "@/lib/contract/comparison";
import { submissionToBidCard, type LinkBidSubmission } from "@/lib/contract/link-bids";
import { qualityFromSubmission, type BidQuality } from "@/lib/contract/bid-quality";
import { BidEquipmentModal } from "@/components/requests/BidEquipmentModal";
import { TermsPanel } from "@/components/requests/TermsPanel";
import { DealRoomBanner, SupplierDocs, EquipmentDocs } from "@/components/requests/BidCardExtras";
import { QuotationVerifyGate } from "@/components/requests/QuotationVerifyGate";
import { useSession } from "@/lib/session";
import { SharedLinkBidCard } from "@/components/requests/SharedLinkBidCard";
import { SharedBidSubmissionModal } from "@/components/requests/SharedBidSubmissionModal";
import { SharedBidNegotiateRoom } from "@/components/requests/SharedBidNegotiateRoom";
import { NEGOTIATE_ENABLED } from "@/lib/config/flags";
import { computeBidReadiness } from "@/lib/contract/bid-readiness";
import { BidReadinessBadge, BidEligibilityModal } from "@/components/requests/BidReadiness";
import { computeQuoteTotals, durationDaysBetween, formatSar, headlineAmount, legDisplay, rentalPeriodSubtitle } from "@/lib/pricing/rental";
import { shortRef, type RequestRecord } from "@/lib/contract/requests";
import { renderQuotationSection, wrapQuotationPage } from "@/lib/quotation/render";
import { buildBidQuotationDoc, quotationSupplierInitials, quotationSupplierKey } from "@/lib/quotation/bid-quotation";
import { quotationDownloadName } from "@/lib/compare/quotation-token";

/** Lifecycle pill (matches the prototype SPILL). */
const SPILL: Record<string, { cls: string; dot: boolean; en: string; ar: string }> = {
  PENDING: { cls: "sp-pending", dot: true, en: "New", ar: "جديد" },
  OPEN_FOR_NEGOTIATION: { cls: "sp-open", dot: false, en: "Negotiating", ar: "تحت التفاوض" },
  COUNTER_OFFERED: { cls: "sp-counter", dot: true, en: "Counter-offer", ar: "عرض مُقابل" },
  ACCEPTED: { cls: "sp-accepted", dot: false, en: "Accepted", ar: "مقبول" },
  EXPIRED: { cls: "sp-expired", dot: false, en: "Expired", ar: "منتهٍ" },
  WITHDRAWN: { cls: "sp-withdrawn", dot: false, en: "Withdrawn", ar: "مسحوب" },
};

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


export function RequestBids({
  requestId,
  startDate = null,
  durationDays = null,
}: {
  requestId: string;
  /** The request's period. Both feed the shared rental maths: without them a bid can only be shown at
   *  its raw rate (app parity), so they are threaded from the request rather than re-fetched here. */
  startDate?: string | null;
  durationDays?: number | null;
}) {
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

  /**
   * The renter's own identity for the quotation's Rentee block (app parity: CR / VAT / national address
   * / phone / email, each shown as a value or the green "Verified" pill). Read here rather than passed
   * in, so this surface stays a drop-in on any request page.
   */
  const [renterName, setRenterName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [renterId, setRenterId] = useState<{ phone: string | null; email: string | null; crNumber: string | null; vatNumber: string | null; nationalAddress: string | null }>({ phone: null, email: null, crNumber: null, vatNumber: null, nationalAddress: null });
  useEffect(() => {
    let active = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { user?: { firstName?: string; lastName?: string; companyName?: string | null; phone?: string | null; email?: string | null; crNumber?: string | null; vatNumber?: string | null; nationalAddress?: string | null } } | null) => {
        if (active && d?.user) {
          setRenterName([d.user.firstName, d.user.lastName].filter(Boolean).join(" "));
          setCompanyName(d.user.companyName ?? "");
          setRenterId({ phone: d.user.phone ?? null, email: d.user.email ?? null, crNumber: d.user.crNumber ?? null, vatNumber: d.user.vatNumber ?? null, nationalAddress: d.user.nationalAddress ?? null });
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // The request record behind these bids — its display code, rental window and transport assignment all
  // print on the quotation. Fetched ON DEMAND and cached: nothing in the bid LIST needs it, so a renter
  // who never downloads never pays for the call.
  const reqRef = useRef<RequestRecord | null>(null);
  async function loadRequestRecord(): Promise<RequestRecord | null> {
    if (reqRef.current) return reqRef.current;
    try {
      reqRef.current = await fetchRequestDetail(requestId);
    } catch {
      // Best-effort: the quotation still renders from what the bid itself carries.
    }
    return reqRef.current;
  }

  /**
   * Download the formal quotation for the selected bids.
   *
   * This used to be a second, completely separate inline HTML builder — no parties block, no terms
   * cards, no legal clauses, no quotation reference, and mobilisation/demobilisation added to the total
   * even when the parties had EXCLUDED those legs, with each leg priced at the rental unit count rather
   * than its own. It is gone: this now goes through `buildBidQuotationDoc`, the same document the
   * grouped bid view issues, so the same deal downloaded from either place is the same document.
   */
  async function downloadQuotation() {
    // Include off-platform (shared-link) submissions, not just on-platform bids.
    const chosen = merged.filter((b) => selected.has(b.id));
    if (!chosen.length) return;

    const req = await loadRequestRecord();
    const code = (typeof req?.displayId === "string" && req.displayId) || shortRef(requestId);
    const item = req?.equipmentItems?.[0] ?? null;
    // The request's window: the props the parent threads win, with the record as the fallback for a
    // surface that didn't pass them. A null duration is meaningful — it means open-ended, and the
    // builder prices it "as operated" rather than inventing a period.
    const reqStart = startDate ?? req?.startDate ?? null;
    const durDays = durationDays ?? durationDaysBetween(req?.startDate, req?.endDate);
    const itemName = [
      (ar ? item?.subtypeNameAr : item?.subtypeName) ?? (ar ? item?.categoryNameAr : item?.categoryName),
      ar ? item?.capacityNameAr : item?.capacityName,
    ].filter(Boolean).join(" · ");

    // One quotation per supplier, cut by the SAME key the grouped download uses.
    const bySupplier = new Map<string, BidCard[]>();
    for (const b of chosen) {
      const key = quotationSupplierKey(b);
      const list = bySupplier.get(key);
      if (list) list.push(b);
      else bySupplier.set(key, [b]);
    }
    const reqCode = code.replace(/[^A-Za-z0-9-]/g, "");

    const sections = [...bySupplier.values()]
      .map((supBids, si) =>
        renderQuotationSection(
          buildBidQuotationDoc({
            lang: ar ? "ar" : "en",
            quotationNumber: `Q-${reqCode}-${quotationSupplierInitials(supBids[0].supplierName)}${si + 1}`,
            reference: code,
            entries: supBids.map((b) => ({
              bid: b,
              // An off-platform submission names the line itself; an app bid takes the request's own
              // equipment name, falling back to the request code so the row is never blank.
              itemLabel: linkLabels.get(b.id) || itemName || code,
              requestCode: code,
              startDate: reqStart,
              endDate: req?.endDate ?? null,
              durationDays: durDays,
              rentalType: req?.rentalType ?? null,
              mobByRentee: item?.mobilizationByRentee ?? null,
              demobByRentee: item?.demobilizationByRentee ?? null,
            })),
            rentee: {
              companyName,
              personName: renterName,
              crNumber: renterId.crNumber,
              vatNumber: renterId.vatNumber,
              nationalAddress: renterId.nationalAddress,
              phone: renterId.phone,
              email: renterId.email,
              verified: tier === "verified",
            },
          }),
        ),
      )
      .join("");

    const dlName = quotationDownloadName(code, [code]);
    const html = wrapQuotationPage(sections, { lang: ar ? "ar" : "en", title: dlName });
    // Robust open: a popup-blocked `window.open` returns null and used to fail silently (a dead click).
    // Fall back to downloading the self-printing HTML file so the quotation is never a no-op.
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      return;
    }
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dlName.replace(/[^\w.-]+/g, "_")}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
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
              // Off-platform bids store no duration — they price over the REQUEST's window, the same pair
              // `computeBidQuote` gets for the on-platform cards below.
              startDate={startDate}
              durationDays={durationDays}
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
        // Canonical quote: rate ÷ billable days (weekly ÷6, monthly ÷26, Fridays off), VAT 15%.
        const q = computeBidQuote(b, { startDate, fallbackDays: durationDays });
        const units = q.units;
        const rate = b.price ?? 0;
        // App parity (`v3_bid_card`): weekly/monthly headline the supplier's RAW quoted rate so bids
        // compare like-for-like on what was quoted; daily headlines the prorated total for the period.
        const headline = headlineAmount(b.priceUnit, rate, q.perUnitRental);
        const periodSubtitle = rentalPeriodSubtitle(b.priceUnit); // "6 working days/week" etc.
        // EVERY breakdown row is PER UNIT (app §5). Multi-unit bids get a second "Overall total" row
        // below the grand total, and that one is NOT per-unit × units — the transport legs carry their
        // own counts.
        const t = computeQuoteTotals({
          perUnitRental: q.perUnitRental,
          rentalUnits: units,
          mob: { amount: b.mobPrice, units: b.mobUnits, excluded: b.mobExcluded },
          demob: { amount: b.demobPrice, units: b.demobUnits, excluded: b.demobExcluded },
        });
        const mobLeg = legDisplay({ amount: b.mobPrice, excluded: b.mobExcluded });
        const demobLeg = legDisplay({ amount: b.demobPrice, excluded: b.demobExcluded });
        // The rental row restates the headline when proration changed nothing and there's one unit —
        // so it's dropped. Multi-unit always keeps it, to sit distinctly above "Overall total".
        const showRentalRow = !(q.rentalExact && units === 1);
        const legText = (leg: ReturnType<typeof legDisplay>) =>
          leg.kind === "amount" ? formatSar(leg.amount)
          : leg.kind === "excluded" ? L("Excluded", "مستبعد")
          : leg.kind === "bundled" ? L("Bundled", "شامل")
          : L("Not quoted", "لم يُحدد");
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
                  {/* ── The certificate pills are GONE from this card (owner, 2026-08-19) ──────────
                      *"no need to mention aramco certified on the bid card, all these details are in
                      the equipment details."*

                      They were `requiredCerts` matched against `heldCertCodes` — a fact about the
                      SUPPLIER's file, printed on a card the renter reads as being about an offer of
                      machines. The certificate that decides anything is the one the MACHINE carries,
                      and that is stated where it is true: on the equipment list's fourth row and on
                      each machine's own detail panel, both read against the request.

                      Verified and the rating stay. They are facts about the counterparty, which is
                      what the rest of this row is. */}
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
              {(() => {
                // App parity: the Conflict · Pending review · Matched tally (bucketBidTerms — the SAME
                // source the grouped card + Terms modal use), deal-room-overlaid via b.terms states.
                const tc = bucketBidTerms(b.terms, b.negotiableTerms).counts;
                return (
                  <span style={{ display: "inline-flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    {([
                      { label: L("Conflict", "تعارض"), n: tc.conflict, c: "#d9362a" },
                      { label: L("Pending review", "قيد المراجعة"), n: tc.pending, c: "#d4780a" },
                      { label: L("Matched", "مطابق"), n: tc.matched, c: "#1daf58" },
                    ] as const).map((t) => (
                      <span key={t.label} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 800, color: t.n > 0 ? t.c : "#9AA7B8", whiteSpace: "nowrap" }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: t.n > 0 ? t.c : "#c3d2e0" }} />{t.label} {t.n}
                      </span>
                    ))}
                  </span>
                );
              })()}
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
                {/* Bid readiness — compact N/N + eye ON this row (opens the per-unit eligibility view).
                    stopPropagation so it doesn't also trigger the row's equipment-details tap. */}
                {(() => { const rd = computeBidReadiness(b); return rd ? (
                  <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex", marginTop: 6 }}>
                    <BidReadinessBadge r={rd} L={L} onClick={() => setEligBid(b)} />
                  </span>
                ) : null; })()}
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
                <span className="pl">
                  {units > 1 ? `${periodLabel(b.priceUnit)} · ${L("per unit", "لكل وحدة")}` : periodLabel(b.priceUnit)}
                  {/* The fixed-divisor assumption, stated whether or not this period is exact (app parity). */}
                  {periodSubtitle && (
                    <span className="psub">
                      {periodSubtitle === "weekly" ? L("6 working days/week", "6 أيام عمل/أسبوع") : L("26 working days/month", "26 يوم عمل/شهر")}
                    </span>
                  )}
                </span>
                <span className="pr">{formatSar(headline)} {L("SAR", "ر.س")}<span className="chev">expand_more</span></span>
              </div>
              {priceOpen && (
                <div className="price-body">
                  {showRentalRow && (
                    <div className="prow">
                      <span className="pl2">
                        {q.billableDays > 0
                          ? `${L("Rental", "الإيجار")} · ${q.billableDays} ${L("days", "يوم")}`
                          : L("Rental", "الإيجار")}
                      </span>
                      <span className="pv">{formatSar(t.perUnit.rental)}</span>
                    </div>
                  )}
                  <div className="prow"><span className="pl2">{L("Delivery to site", "النقل إلى الموقع")}{b.mobLeadTime && <span className="lead">{L("delivery within", "تسليم خلال")} {b.mobLeadTime}</span>}</span><span className="pv">{legText(mobLeg)}</span></div>
                  <div className="prow"><span className="pl2">{L("Return from site", "النقل من الموقع")}{b.demobLeadTime && <span className="lead">{L("return within", "إرجاع خلال")} {b.demobLeadTime}</span>}</span><span className="pv">{legText(demobLeg)}</span></div>
                  <div className="prow"><span className="pl2">{L("Subtotal before VAT", "المجموع قبل الضريبة")}</span><span className="pv">{formatSar(t.perUnit.subtotal)}</span></div>
                  <div className="prow"><span className="pl2">{L("VAT (15%)", "ضريبة القيمة المضافة (15٪)")}</span><span className="pv">{formatSar(t.perUnit.vat)}</span></div>
                  <div className="grandcard">
                    <span className="gl">{L("Grand total · incl. VAT", "الإجمالي · شامل الضريبة")}</span>
                    <span className="gv">{formatSar(t.perUnit.total)} {L("SAR", "ر.س")}</span>
                  </div>
                  {units > 1 && (
                    // All-units math — NOT per-unit × units, since the transport legs have their own counts.
                    <div className="grandcard overall">
                      <span className="gl">{L("Overall total", "الإجمالي الكلي")}<span className="lead">{L("Units", "الوحدات")}: {units}</span></span>
                      <span className="gv">{formatSar(t.overall.total)} {L("SAR", "ر.س")}</span>
                    </div>
                  )}
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
          <button className="qdl" onClick={() => (tier === "verified" ? void downloadQuotation() : setQuoteGate(true))}>
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
          onContinue={() => { setQuoteGate(false); void downloadQuotation(); }}
        />
      )}
    </div>
  );
}
