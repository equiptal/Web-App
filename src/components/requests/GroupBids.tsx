"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { fetchBids, fetchRequestSubmissions, startDealRoom } from "@/lib/api/client";
import { BidTermsModal } from "@/components/requests/BidTermsModal";
import { SharedLinkBidCard } from "@/components/requests/SharedLinkBidCard";
import { SharedBidSubmissionModal } from "@/components/requests/SharedBidSubmissionModal";
import { QuotationVerifyGate } from "@/components/requests/QuotationVerifyGate";
import { useSession } from "@/lib/session";
import { bidSuppliers, bucketBidTerms, CERT_LABEL, type BidCard, type TermRow } from "@/lib/contract/bids";
import { submissionToBidCard, type LinkBidSubmission } from "@/lib/contract/link-bids";
import { computeBidQuote } from "@/lib/contract/comparison";
import type { RequestGroup } from "@/lib/contract/requests";
import { BidEquipmentModal } from "@/components/requests/BidEquipmentModal";
import { EquipImg } from "@/components/requests/EquipImg";
import { quotationDownloadName } from "@/lib/compare/quotation-token";
import { renderQuotationSection, wrapQuotationPage, quotationLegal, type QuotationDoc, type QuotationLineItem, type QuotationCard } from "@/lib/quotation/render";

/** A group bid = a request's bid tagged with which item (request) it belongs to. */
type GroupBid = BidCard & { requestId: string; itemLabel: string; itemLabelAr: string; categoryId: string | null; itemImage: string | null };

const SPILL: Record<string, { cls: string; dot: boolean; en: string; ar: string }> = {
  PENDING: { cls: "sp-pending", dot: true, en: "New", ar: "جديد" },
  OPEN_FOR_NEGOTIATION: { cls: "sp-open", dot: false, en: "Negotiating", ar: "تحت التفاوض" },
  COUNTER_OFFERED: { cls: "sp-counter", dot: true, en: "Counter-offer", ar: "عرض مُقابل" },
  ACCEPTED: { cls: "sp-accepted", dot: false, en: "Accepted", ar: "مقبول" },
  EXPIRED: { cls: "sp-expired", dot: false, en: "Expired", ar: "منتهٍ" },
  WITHDRAWN: { cls: "sp-withdrawn", dot: false, en: "Withdrawn", ar: "مسحوب" },
};
const nf = (n: number) => Math.round(n).toLocaleString("en-US");

function pillLabel(status: string, L: (en: string, ar: string) => string): string {
  switch (status) {
    case "OPEN_FOR_NEGOTIATION": return L("Open chat", "فتح المحادثة");
    case "COUNTER_OFFERED": return L("Review counter-offer", "مراجعة العرض المُقابل");
    case "ACCEPTED": return L("View deal", "عرض الصفقة");
    case "EXPIRED": return L("Expired", "منتهٍ");
    case "WITHDRAWN": return L("Withdrawn", "مسحوب");
    default: return L("Start negotiation on this bid", "بدء التفاوض على هذا العرض");
  }
}

/** Offer-state suffix for the deal-room CTA (uiState) — new / updated offer / whose move it is. */
function offerSuffix(uiState: string | null, L: (en: string, ar: string) => string): string | null {
  switch (uiState) {
    case "new": return L("New offer", "عرض جديد");
    case "fresh": return L("Updated offer", "عرض مُحدّث");
    case "your-turn": return L("Your turn", "دورك");
    default: return null;
  }
}

// The formal quotation template (styles, amount-in-words, section renderer) now lives in the shared
// `@/lib/quotation/render` module so this bid-card download and the deal-room confirmed quotation use
// ONE identical template.

/**
 * Grouped My Bids (web-app/multi-item-requests, Phase 2). Fetches bids for every request in the
 * group, merges them, and shows a supplier Level-2 filter + equipment-focused bid cards across the
 * whole submission, plus select-for-quotation. `getBidList` is per-request, so we fan the fetch out.
 */
export function GroupBids({ group, initialItemId }: { group: RequestGroup; initialItemId?: string | null }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);
  // Period label from the bid's billing unit — for the collapsed "rate / period" on the card.
  const periodOf = (u: string | null) => {
    switch ((u ?? "PER_DAY").toUpperCase()) {
      case "PER_WEEK": return L("week", "أسبوع");
      case "PER_MONTH": return L("month", "شهر");
      case "PER_JOB": return L("job", "مهمة");
      default: return L("day", "يوم");
    }
  };
  const router = useRouter();

  const [bids, setBids] = useState<GroupBid[] | null>(null);
  const [error, setError] = useState(false);
  const [supplierKey, setSupplierKey] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<string>(initialItemId ?? "all"); // scope bids to one request item
  const [itemMenuOpen, setItemMenuOpen] = useState(false);
  // Price breakdown open/collapsed PER CARD (a Set of bid ids), so expanding one bid's price doesn't
  // close another's — each card toggles independently. `perUnitIds` holds the per-card "Per unit" toggle.
  const [openPrices, setOpenPrices] = useState<Set<string>>(new Set());
  // Default to PER UNIT — track the cards switched to "all units" instead (empty = per-unit default).
  const [allUnitsIds, setAllUnitsIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false); // prototype: pick bids to compare/export
  const [equipBid, setEquipBid] = useState<GroupBid | null>(null);
  const [termsBid, setTermsBid] = useState<GroupBid | null>(null);
  const [langPick, setLangPick] = useState(false); // quotation language chooser (Arabic | English)
  // Bids captured the instant "Download quotations" is clicked. The language/verify modals aren't part
  // of the selection UI, so opening one trips the click-outside handler and CLEARS `selected` before the
  // download fires — which then fell back to exporting EVERY supplier. Snapshotting here keeps the PDF
  // scoped to exactly what was selected, regardless of that clearing.
  const [dlOnly, setDlOnly] = useState<GroupBid[] | null>(null);
  const [renterName, setRenterName] = useState("");
  const [companyName, setCompanyName] = useState("");
  // Renter company identity for the quotation Rentee block (app parity) — from /api/me.
  const [renterId, setRenterId] = useState<{ phone: string | null; email: string | null; crNumber: string | null; vatNumber: string | null; nationalAddress: string | null }>({ phone: null, email: null, crNumber: null, vatNumber: null, nationalAddress: null });
  const { tier } = useSession();
  const verified = tier === "verified";
  const [quoteGate, setQuoteGate] = useState(false); // unverified → confirm before issuing the quotation
  // web-app/006 demo (staging only) — relabel real bids as off-platform "via shared link".
  const [submissions, setSubmissions] = useState<LinkBidSubmission[]>([]); // real off-platform submissions (all group items)
  const [groupRef, setGroupRef] = useState<string | null>(null); // RFQ-NNNNN group short code (agents bid-submissions) — stamped on the quotation
  const [submissionBid, setSubmissionBid] = useState<GroupBid | null>(null);
  // Bid filter (source + refine), matching the bids-by-supplier prototype.
  const [filterOpen, setFilterOpen] = useState(false);
  const [fSource, setFSource] = useState<"all" | "link" | "platform" | "file">("all");
  const [fVerified, setFVerified] = useState(false);
  const [fKm, setFKm] = useState(false);

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

  useEffect(() => {
    let active = true;
    setBids(null);
    setError(false);
    setSupplierKey("all");
    setSelected(new Set());
    Promise.all(
      group.items.map((it) =>
        fetchBids(it.id)
          .then((d) =>
            d.bids.map((b): GroupBid => ({
              ...b,
              requestId: it.id,
              itemLabel: it.item?.name ?? it.displayId,
              itemLabelAr: it.item?.nameAr ?? it.displayId,
              categoryId: it.item?.categoryId ?? null,
              itemImage: it.item?.imageUrl ?? null,
            })),
          )
          .catch(() => [] as GroupBid[]),
      ),
    )
      .then((lists) => active && setBids(lists.flat()))
      .catch(() => active && setError(true));
    // Off-platform shared-link submissions are stored once per GROUP (a single bid covers all items),
    // so fetch them once by the group id — not per item (which would duplicate them). Best-effort.
    setSubmissions([]);
    fetchRequestSubmissions(group.id).then((r) => { if (active) { setSubmissions(r.submissions); setGroupRef(r.groupRef); } }).catch(() => {});
    return () => {
      active = false;
    };
  }, [group.id, group.items]);

  // Scope to the item the renter tapped "View Bids" on (or "all" when entering via "View all bids").
  useEffect(() => { setSelectedItem(initialItemId ?? "all"); }, [initialItemId, group.id]);

  // B4: while comparing, a click anywhere outside the selection UI (toolbar / cards / action bar, all
  // tagged data-select-ui) exits selection — replaces the old Cancel button.
  useEffect(() => {
    if (!selectMode) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (el && el.closest("[data-select-ui]")) return;
      setSelectMode(false);
      setSelected(new Set());
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [selectMode]);

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // An off-platform submission is stored once per GROUP but covers several items. Show ONE card per
  // item (parity with on-platform bids) — scoped to that item's terms + price + total, matched to its
  // request so we can show the real equipment icon/image. Memoized so goCompare can include them too.
  const subCards: GroupBid[] = useMemo(
    () =>
      submissions.flatMap((s) =>
        s.items.map((it): GroupBid => {
          const gi = group.items.find((g) => g.id === it.requestId);
          return {
            ...submissionToBidCard(s, it),
            id: `link-${s.id}-${it.requestItemId}`, // unique per item-card (no key/selection collisions)
            requestId: it.requestId ?? s.requestId,
            itemLabel: gi?.item?.name ?? it.label ?? L("Equipment", "المعدة"),
            itemLabelAr: gi?.item?.nameAr ?? it.label ?? "المعدة",
            categoryId: gi?.item?.categoryId ?? null,
            itemImage: gi?.item?.imageUrl ?? null,
          };
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [submissions, group.items, ar],
  );

  // web-app/007 — open the comparison workspace pre-selected to the chosen bids (and their item).
  function goCompare() {
    const chosen = [...(bids ?? []), ...subCards].filter((b) => selected.has(b.id));
    if (chosen.length < 1) return;
    const params = new URLSearchParams({ group: group.id });
    const itemId = chosen[0]?.requestId;
    if (itemId) params.set("item", itemId);
    params.set("bids", chosen.map((b) => b.id).join(","));
    router.push(`/compare?${params.toString()}`);
  }

  async function startNegotiation(b: GroupBid) {
    if (busyId) return;
    if (b.dealRoomId) {
      router.push(`/deal-room/${b.dealRoomId}`);
      return;
    }
    setBusyId(b.id);
    try {
      // App parity: opening the deal room is pre-acceptance — don't accept the bid here.
      const { id } = await startDealRoom(b.id);
      if (id) router.push(`/deal-room/${id}`);
      else setBusyId(null);
    } catch {
      setBusyId(null);
    }
  }

  function downloadQuotation(langIsAr: boolean, only?: GroupBid[]) {
    // Include off-platform (shared-link) bids alongside on-platform ones so a selected supplier
    // submission can be exported as a quotation just like an app bid. `only` lets a single card (e.g.
    // the submission viewer's Download) export just that bid through the SAME app-parity template.
    // Default to ALL bids in the group when nothing is explicitly selected. Clicking "Download
    // quotations" with no selection used to silently no-op (empty `chosen` → early return), which read
    // as a dead button. `only` still exports a single card (submission viewer).
    const all = [...(bids ?? []), ...subCards];
    const chosen = only ?? (selected.size ? all.filter((b) => selected.has(b.id)) : all);
    if (!chosen.length) return;
    const itemMap = new Map(group.items.map((it) => [it.id, it]));
    // Request codes this quotation covers — stamped in the filename so Compare scopes to them.
    const coveredCodes = [...new Set(chosen.map((b) => itemMap.get(b.requestId)?.displayId).filter(Boolean) as string[])];

    // One quotation per supplier: group the selected bids by supplier, then list ALL of that
    // supplier's chosen equipment as line items under a single quotation (with this request's terms).
    // Multiple suppliers → multiple quotation sections in the same file.
    const bySupplier = new Map<string, GroupBid[]>();
    for (const b of chosen) {
      const key = b.supplierId ?? b.supplierName ?? "—";
      const list = bySupplier.get(key);
      if (list) list.push(b);
      else bySupplier.set(key, [b]);
    }
    const reqCode = String(groupRef ?? group.items[0]?.displayId ?? group.id).replace(/[^A-Za-z0-9-]/g, "");

    // Render one supplier's quotation in a single language; bilingual output stacks both per supplier.
    const renderSection = (supBids: GroupBid[], si: number, isAr: boolean) => {
      const L = (en: string, arr: string) => (isAr ? arr : en);
      const sar = L("SAR", "ر.س");
      const dateStr = new Date().toLocaleDateString(isAr ? "ar-SA" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
      // Rentee identity (app parity) — company name primary when verified, else personal name; plus the
      // renter's real CR/VAT/national address/phone/email from /api/me (value-or-"Verified" pill).
      // App parity (_RenteeBlock _partyHeader): company name is primary when the renter HAS a company
      // (gated on company presence, not verified), with the person's name demoted to a subtitle.
      const renteeHasCompany = !!companyName.trim();
      const rentee = {
        name: (renteeHasCompany ? companyName.trim() : renterName) || L("Moedatech renter", "مستأجر معداتك"),
        person: renteeHasCompany ? (renterName || null) : null,
        city: group.city ?? group.locationLabel,
        crNumber: renterId.crNumber,
        vatNumber: renterId.vatNumber,
        nationalAddress: renterId.nationalAddress,
        phone: renterId.phone,
        email: renterId.email,
      };
      const sup = supBids[0];
      const supInit = (sup.supplierName || "S").replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "S";
      const qnum = `Q-${reqCode}-${supInit}${si + 1}`;
      const validRaw = supBids.map((b) => b.validUntil).filter(Boolean).sort()[0] ?? null;
      const valid = validRaw ? new Date(validRaw).toLocaleDateString(isAr ? "ar-SA" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
      const reqIds = [...new Set(supBids.map((b) => itemMap.get(b.requestId)?.displayId ?? b.requestId))];
      const reqLabel = reqIds.length === 1 ? reqIds[0] : `${reqIds[0]} +${reqIds.length - 1}`;
      const rentalBasis = itemMap.get(sup.requestId)?.rentalType ?? "";
      const reqItem = itemMap.get(sup.requestId);
      const fmtRefDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString(isAr ? "ar-SA" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
      const startStr = fmtRefDate(reqItem?.startDate);
      const endStr = fmtRefDate(reqItem?.endDate);
      // Supplier identity rows (app parity): off-platform submissions carry real CR/VAT/address VALUES;
      // on-platform bids carry only verification FLAGS → render the app's value-or-"Verified" pill.
      const ld = sup.linkDocs ?? {};
      // Party identity rows — value-or-"Verified"-pill (the shared renderer draws them). Labels + AR
      // match the mobile quotation_document (CR=س.ت, VAT=ض.ق.م, "National Address"). Supplier rows gate
      // the pill on PARTY-verified (a verified supplier missing a value still shows the pill).
      const supIdRows = [
        { label: L("National Address", "العنوان الوطني"), value: ld.national ?? sup.supplierNationalAddress, verified: sup.verified },
        { label: L("CR #", "س.ت"), value: ld.commercial ?? sup.supplierCrNumber, verified: sup.verified },
        { label: L("VAT #", "ض.ق.م"), value: ld.vat ?? sup.supplierVatNumber, verified: sup.verified },
        { label: L("Phone", "الهاتف"), value: ld.contact ?? sup.supplierPhone }, // on-platform phone or off-platform contact
        ...(sup.compliance.entityType === "company" ? [{ label: L("Email", "البريد"), value: sup.supplierEmail }] : []), // company only, per app
      ];
      const renteeIdRows = [
        { label: L("National Address", "العنوان الوطني"), value: rentee.nationalAddress, verified },
        { label: L("CR #", "س.ت"), value: rentee.crNumber, verified },
        { label: L("VAT #", "ض.ق.م"), value: rentee.vatNumber, verified },
        { label: L("Phone", "الهاتف"), value: rentee.phone },
        { label: L("Email", "البريد"), value: rentee.email },
      ];
      // App parity (UnverifiedIndividualIdentity): unverified individual suppliers get a subtitle.
      const supplierSub = sup.compliance.entityType === "individual" && !sup.verified
        ? L("Individual supplier · unverified", "مُورِّد فرد · غير موثَّق") : null;

      const eqLine = (b: GroupBid) => (b.equipment ? [b.equipment.make, b.equipment.model, b.equipment.year].filter(Boolean).join(" · ") : "—");
      const labelOf = (b: GroupBid) => (ar ? b.itemLabelAr : b.itemLabel) || (itemMap.get(b.requestId)?.displayId ?? b.requestId);
      // App rule (014 CR #141): the bid is priced per billing period; the unit count is NOT multiplied
      // into the price (it's shown for information only). Open-ended → ∞ qty + one-period "as operated".
      const daysPerPeriod = (u: string | null) => { switch ((u ?? "PER_DAY").toUpperCase()) { case "PER_WEEK": return 7; case "PER_MONTH": return 26; case "PER_JOB": return 0; default: return 1; } };
      const periodLabel = (u: string | null) => { switch ((u ?? "PER_DAY").toUpperCase()) { case "PER_WEEK": return L("week", "أسبوع"); case "PER_MONTH": return L("month", "شهر"); case "PER_JOB": return L("job", "مهمة"); default: return L("day", "يوم"); } };

      // Invoice line items — rate ÷ period-days × duration × units; mob/demob × units (open-ended → "as
      // operated"). The shared renderer draws the 6-column table (# · Item · Unit · Qty · Price · Total).
      const m2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // app parity: money shows halalas
      let sub = 0;
      let rowNum = 0;
      let openRate: number | null = null; // representative per-unit·period rate for open-ended framing
      let openPlabel = "";
      let anyCommitted = false;
      const lineItems: QuotationLineItem[] = [];
      for (const b of supBids) {
        const rate = b.price ?? 0;
        // Supplier's OFFERED units (app `_offeredUnitsForBid`: unitsOffered → requested → 1). The rental
        // line is PER-UNIT (not × units, app parity); units only scale the per-unit mob/demob transport.
        const units = b.unitsOffered || b.numberOfUnits || 1;
        const dpp = daysPerPeriod(b.priceUnit);
        const plabel = periodLabel(b.priceUnit);
        const durDays = itemMap.get(b.requestId)?.durationDays ?? null;
        rowNum += 1;
        let lineSub: number, qtyCell: string, priceCell: string, totalCell: string, totalNote: string | null = null;
        if (durDays == null) {
          lineSub = rate; // open-ended: one-period PER-UNIT preview; billed "as operated" (app parity)
          qtyCell = "∞";
          priceCell = `${m2(rate)} / ${plabel}`;
          totalCell = `${m2(rate)} / ${plabel}`;
          totalNote = L("As operated", "حسب التشغيل");
          if (openRate == null) { openRate = rate; openPlabel = plabel; }
        } else if (dpp > 0) {
          anyCommitted = true;
          const periods = durDays / dpp;
          const pStr = Number.isInteger(periods) ? String(periods) : periods.toFixed(2);
          lineSub = (rate / dpp) * durDays; // per-unit over the committed duration (units shown separately)
          qtyCell = `${pStr} ${plabel}`;
          priceCell = `${m2(rate)} / ${plabel}`;
          totalCell = m2(lineSub);
        } else {
          anyCommitted = true;
          lineSub = rate; // PER_JOB, per-unit
          qtyCell = "1";
          priceCell = m2(rate);
          totalCell = m2(lineSub);
        }
        const mobTotal = (b.mobPrice ?? 0) * units;
        const demobTotal = (b.demobPrice ?? 0) * units;
        sub += lineSub + mobTotal + demobTotal;
        lineItems.push({ num: rowNum, label: `${L("Rental", "الإيجار")} — ${labelOf(b)}`, detail: eqLine(b) === "—" ? null : eqLine(b), unit: plabel, qty: qtyCell, price: priceCell, total: totalCell, totalNote });
        // Always show the mobilization/demobilization legs (deal-room + app parity): a real price when the
        // supplier charges, else "By rentee" (the rentee arranges it) or "Included" — never silently dropped.
        const ri = itemMap.get(b.requestId);
        const logiRow = (label: string, price: number, total: number, byRentee: boolean): QuotationLineItem =>
          price > 0
            ? { num: null, label, detail: labelOf(b), unit: L("Trip", "رحلة"), qty: String(units), price: m2(price), total: m2(total) }
            : { num: null, label, detail: byRentee ? L("Arranged by the rentee", "يُرتّبه المستأجر") : L("Included", "مشمول"), unit: "—", qty: "—", price: "—", total: byRentee ? L("By rentee", "على المستأجر") : L("Included", "مشمول") };
        lineItems.push(logiRow(L("Delivery to site", "النقل إلى الموقع"), b.mobPrice ?? 0, mobTotal, ri?.mobByRentee === true));
        lineItems.push(logiRow(L("Return from site", "الإرجاع من الموقع"), b.demobPrice ?? 0, demobTotal, ri?.demobByRentee === true));
      }
      const vat = sub * 0.15; // exact (not rounded) so the amount-in-words can show halalas — app parity
      const total = sub + vat;
      const allOpenEnded = !anyCommitted && openRate != null;

      const offeredUnits = (b: GroupBid) => b.unitsOffered || b.numberOfUnits || 1;

      // ---- Equipment-terms + Contract-terms cards (the renter's RFQ terms, formatted bilingually) ----
      const tfmt = {
        sla: (v: string | null) => { if (!v) return null; const m: Record<string, [string, string]> = { FOUR_HR: ["4 hours", "٤ ساعات"], EIGHT_HR: ["8 hours", "٨ ساعات"], TWENTY_FOUR_HR: ["24 hours", "٢٤ ساعة"], FORTY_EIGHT_HR: ["48 hours", "٤٨ ساعة"], SEVENTY_TWO_HR: ["72 hours", "٧٢ ساعة"] }; const x = m[v.toUpperCase()]; return x ? L(x[0], x[1]) : v; },
        overtime: (v: string | null) => { if (v == null) return null; const u = v.toUpperCase(); if (u === "0" || u === "WITHOUT") return L("None", "بدون"); if (u === "1.5X") return "1.5×"; if (u === "2X") return "2×"; return v; },
        maint: (v: string | null) => { if (!v) return null; const u = v.toLowerCase(); if (u === "supplier") return L("Supplier", "المؤجّر"); if (u === "renter" || u === "rentee") return L("Renter", "المستأجر"); return v; },
        payTerms: (v: string | null) => { if (!v) return null; const k = v.toLowerCase().replace(/[_-]/g, ""); const m: Record<string, [string, string]> = { upfront: ["Upfront", "مقدمًا"], daily: ["Daily", "يومي"], net0: ["Net 0", "فوري"], net30: ["Net 30 days", "صافي ٣٠ يومًا"], net60: ["Net 60 days", "صافي ٦٠ يومًا"], net90: ["Net 90 days", "صافي ٩٠ يومًا"], endofjob: ["End of job", "نهاية المهمة"] }; const x = m[k]; return x ? L(x[0], x[1]) : v; },
        fuel: (v: string | null) => { if (!v) return null; const m: Record<string, [string, string]> = { DIESEL: ["Diesel", "ديزل"], PETROL: ["Petrol", "بنزين"], ELECTRIC: ["Electric", "كهربائي"] }; const x = m[v.toUpperCase()]; return x ? L(x[0], x[1]) : v; },
        operator: (inc: string | null, nat: string | null) => { if (inc == null) return null; if (inc.toUpperCase() !== "YES") return L("No operator", "بدون مشغّل"); return L("Includes operator", "يشمل مشغّلاً") + (nat ? ` · ${L("Nationality", "الجنسية")}: ${nat}` : ""); },
      };
      // App parity: the equipment-terms section prints the required/held safety certifications.
      const eqCertsText = (b: GroupBid) => {
        const cs = (b.heldCertCodes?.length ? b.heldCertCodes : b.equipmentCertCodes) ?? [];
        return cs.length ? cs.map((c) => (isAr ? CERT_LABEL[c]?.ar : CERT_LABEL[c]?.en)).filter(Boolean).join(" · ") : null;
      };
      // Listed equipment as an app-parity chip card (app's live_quotation_document _buildEquipmentIdentity
      // order): Type · Size · Brand · Model · Year · Fuel · Units. Type/Size are split out of the item
      // label; Brand/Model/Year from the offered equipment. (Category name isn't in the web bid payload —
      // only the id — so that one chip is omitted.)
      const listed = supBids.map((b) => {
        const eq = b.equipment;
        const segs = labelOf(b).split(" · ").map((x) => x.trim()).filter(Boolean);
        const size = segs.length > 1 ? segs.slice(1).join(" · ") : null;
        const fuel = tfmt.fuel(b.requestTerms.fuelType);
        const chips: { label: string; value: string }[] = [];
        chips.push({ label: L("Type", "النوع"), value: segs[0] ?? labelOf(b) });
        if (size) chips.push({ label: L("Size", "المقاس"), value: size });
        if (eq?.make) chips.push({ label: L("Brand", "العلامة"), value: eq.make });
        if (eq?.model) chips.push({ label: L("Model", "الطراز"), value: eq.model });
        if (eq?.year) chips.push({ label: L("Year", "السنة"), value: String(eq.year) });
        if (fuel) chips.push({ label: L("Fuel", "الوقود"), value: fuel });
        chips.push({ label: L("Units offered", "الوحدات المعروضة"), value: String(offeredUnits(b)) });
        return {
          label: labelOf(b),
          detail: eqLine(b),
          units: offeredUnits(b),
          verified: b.eqVerified,
          certs: b.heldCertCodes.map((c) => (isAr ? CERT_LABEL[c].ar : CERT_LABEL[c].en)),
          chips,
        };
      });

      const cards: QuotationCard[] = [];
      const projectRows = supBids.map((b) => ({
        label: itemMap.get(b.requestId)?.displayId ?? b.requestId,
        value: `${offeredUnits(b)} × ${labelOf(b)}`,
      }));
      projectRows.push({ label: L("Rental basis", "أساس الإيجار"), value: rentalBasis || "—" });
      projectRows.push({ label: L("Equipment lines", "بنود المعدات"), value: String(supBids.length) });
      projectRows.push({ label: L("Total units", "إجمالي الوحدات"), value: String(supBids.reduce((s2, b) => s2 + offeredUnits(b), 0)) });
      cards.push({ title: L("Project terms", "شروط المشروع"), rows: projectRows });

      // App parity: the quotation shows the SUPPLIER's declared terms (not the renter's often-blank
      // request), with a "· Agreed" tag when the term was locked in the deal room. normKey form:
      // payment_terms→paymentterms, breakdown_response_sla→breakdownresponsesla, etc.
      const agBadge = (b: GroupBid, nk: string) => ((b.agreedTermKeys ?? []).includes(nk) ? ` · ${L("Agreed", "متفق عليه")}` : "");
      const declaredNat = (b: GroupBid) => b.declaredTerms?.operatorNationality ?? b.requestTerms.operatorNationality;
      const eqCert = (b: GroupBid) => { const t = eqCertsText(b); return t ? t + agBadge(b, "safetycertifications") : null; };

      if (sup.viaSharedLink) {
        // Off-platform (shared-link form) bids carry the FULL set of submitted terms in
        // terms.equipment / terms.contract (each a Yes/No confirmation of the renter's requirement) —
        // their requestTerms/declaredTerms are blank. Render every term the renter asked so the
        // quotation captures the whole bid form, not just the four the platform path renders.
        const linkVal = (r: TermRow): string | null => {
          if (r.state === "grey") return null; // renter didn't ask this term → omit
          if (r.state === "conflict") return L("Not provided", "غير متوفّر"); // supplier said No
          // Confirmed: show the requested value the supplier committed to (parsed from the row's
          // "Renter: X · Supplier: Yes" detail), falling back to a plain "Confirmed".
          const d = (isAr ? r.detail?.ar : r.detail?.en) ?? "";
          const req = (isAr ? d.split(" · المؤجّر")[0].replace(/^المستأجر:\s*/, "") : d.split(" · Supplier")[0].replace(/^Renter:\s*/, "")).trim();
          return req && req !== "—" ? req : L("Confirmed", "مؤكّد");
        };
        const collect = (pick: (b: GroupBid) => TermRow[] | undefined) => {
          const seen = new Set<string>();
          const rows: { label: string; value: string }[] = [];
          for (const b of supBids) for (const r of pick(b) ?? []) {
            if (seen.has(r.key)) continue;
            const v = linkVal(r);
            if (v) { seen.add(r.key); rows.push({ label: isAr ? r.labelAr : r.labelEn, value: v }); }
          }
          return rows;
        };
        const eqRowsL = collect((b) => b.terms?.equipment);
        const ctRowsL = collect((b) => b.terms?.contract);
        if (eqRowsL.length) cards.push({ title: L("Equipment terms", "شروط المعدة"), rows: eqRowsL });
        if (ctRowsL.length) cards.push({ title: L("Contract terms", "شروط العقد"), rows: ctRowsL });
      } else {
        const eqRows: { label: string; value: string }[] = [];
        const addEq = (label: string, val: string | null) => { if (val) eqRows.push({ label, value: val }); };
        if (supBids.length === 1) {
          addEq(L("Operator", "المشغّل"), tfmt.operator(sup.requestTerms.operatorIncluded, declaredNat(sup)));
          addEq(L("Equipment safety certifications", "شهادات سلامة المعدة"), eqCert(sup));
          addEq(L("Fuel type", "نوع الوقود"), tfmt.fuel(sup.requestTerms.fuelType));
        } else {
          for (const b of supBids) {
            const parts = [tfmt.operator(b.requestTerms.operatorIncluded, declaredNat(b)), eqCert(b), tfmt.fuel(b.requestTerms.fuelType)].filter(Boolean).join(" · ");
            if (parts) eqRows.push({ label: labelOf(b), value: parts });
          }
        }
        if (eqRows.length) cards.push({ title: L("Equipment terms", "شروط المعدة"), rows: eqRows });

        const dt = sup.declaredTerms;
        const rt = sup.requestTerms;
        const ctRows: { label: string; value: string }[] = [];
        const addCt = (label: string, val: string | null) => { if (val) ctRows.push({ label, value: val }); };
        const pay = tfmt.payTerms(dt?.paymentTerms ?? rt.paymentTerms);
        addCt(L("Payment type", "نوع الدفع"), pay ? pay + agBadge(sup, "paymentterms") : null);
        const sla = tfmt.sla(dt?.breakdownResponseSla ?? rt.breakdownResponseSla);
        addCt(L("Breakdown response", "زمن الاستجابة للأعطال"), sla ? sla + agBadge(sup, "breakdownresponsesla") : null);
        const ot = tfmt.overtime(dt?.overtimeRate ?? rt.overtimeRate);
        addCt(L("Overtime", "العمل الإضافي"), ot ? ot + agBadge(sup, "overtimerate") : null);
        addCt(L("Maintenance", "الصيانة"), tfmt.maint(rt.maintenanceResponsibility));
        if (ctRows.length) cards.push({ title: L("Contract terms", "شروط العقد"), rows: ctRows });
      }

      const doc: QuotationDoc = {
        lang: isAr ? "ar" : "en",
        title: L("Equipment rental quotation", "عرض سعر تأجير معدات"),
        quotationNumber: qnum,
        dateStr,
        // Verified status now shows on the CR/VAT rows ("✓ Verified"), so no standalone party chip
        // (it rendered only under the supplier — never the rentee — and read as an orphan badge).
        supplier: { label: L("Supplier", "المؤجِّر"), name: sup.supplierName, sub: supplierSub, idRows: supIdRows, chips: [] },
        rentee: { label: L("Rentee", "المُستأجِر"), name: rentee.name, sub: rentee.person, idRows: renteeIdRows, chips: [] },
        meta: [
          { label: L("Request #", "رقم الطلب"), value: groupRef ?? reqLabel },
          { label: L("Issue date", "تاريخ الإصدار"), value: dateStr },
          { label: L("Valid until", "صالح حتى"), value: valid },
          { label: L("Rental start", "بدء الإيجار"), value: startStr },
          { label: L("Rental end", "نهاية الإيجار"), value: endStr },
          { label: L("Currency", "العملة"), value: L("SAR · Saudi Riyal", "SAR · ريال سعودي") },
        ],
        listed,
        lineItems,
        currency: sar,
        // Open-ended bids: reframe the grand row as the per-unit·period rate ("Total / unit · day") and
        // note the estimate, exactly like the app's live quotation. Committed durations show a real total.
        totals: allOpenEnded
          ? { subtotal: sub, vat, total, label: `${L("Total", "الإجمالي")} / ${L("unit", "وحدة")} · ${openPlabel}`, valueOverride: `${m2(openRate!)} ${sar}` }
          : { subtotal: sub, vat, total },
        cards,
        legal: quotationLegal(L),
        amountWordsSuffix: allOpenEnded ? L("Estimate for one day · Final amount as operated", "تقدير ليوم واحد · المبلغ النهائي حسب التشغيل") : undefined,
      };
      return renderQuotationSection(doc);
    };

    // Single language (the renter picks Arabic or English) — one page per supplier, no 2-in-1.
    const sections = [...bySupplier.values()]
      .map((supBids, si) => renderSection(supBids, si, langIsAr))
      .join("");

    // Human-readable name: group short code (RFQ-NNNNN) when present, else the single request id
    // (REQ-NNNNN); covered item codes are stamped for re-upload scoping.
    const dlPrimary = groupRef ?? coveredCodes[0] ?? group.items[0]?.displayId ?? "quotation";
    const dlName = quotationDownloadName(dlPrimary, coveredCodes);
    const html = wrapQuotationPage(sections, { lang: langIsAr ? "ar" : "en", title: dlName });
    // Robust open: a popup-blocked `window.open` returns null and used to silently fail (dead click).
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

  if (error) return <div className="rempty">{L("Couldn’t load the bids.", "تعذّر تحميل العروض.")}</div>;
  if (!bids) return <div className="rstate"><span className="material-icons-outlined" style={{ fontSize: 26 }}>progress_activity</span></div>;
  const allBids = [...bids, ...subCards];
  if (allBids.length === 0) return <div className="rempty">{L("No bids yet for this request.", "لا توجد عروض بعد لهذا الطلب.")}</div>;

  const suppliers = bidSuppliers(allBids);
  // Bid source: off-platform shared-link vs on-platform (no uploaded-file source on this surface yet).
  const sourceOf = (b: GroupBid): "link" | "platform" | "file" => (b.viaSharedLink ? "link" : "platform");
  const srcCount = (s: "all" | "link" | "platform" | "file") => (s === "all" ? allBids.length : allBids.filter((b) => sourceOf(b) === s).length);
  const base = supplierKey === "all" ? [...allBids].sort((a, b) => a.requestId.localeCompare(b.requestId)) : allBids.filter((b) => (b.supplierId ?? b.supplierName) === supplierKey);
  const shown = base.filter(
    (b) =>
      (selectedItem === "all" || b.requestId === selectedItem) &&
      (fSource === "all" || sourceOf(b) === fSource) &&
      (!fVerified || b.verified) &&
      (!fKm || (b.distanceKm != null && b.distanceKm <= 50)),
  );
  const fActive = (fSource !== "all" ? 1 : 0) + (fVerified ? 1 : 0) + (fKm ? 1 : 0);
  const selectedCount = allBids.filter((b) => selected.has(b.id)).length;
  // Item picker: one entry per request line + its bid count (off-platform included via allBids).
  const itemList = group.items.map((it) => ({
    id: it.id,
    name: (ar ? it.item?.nameAr : it.item?.name) || it.displayId,
    img: it.item?.imageUrl ?? null,
    categoryId: it.item?.categoryId ?? null,
    qty: it.item?.qty ?? 1,
    count: allBids.filter((b) => b.requestId === it.id).length,
  }));
  const selItem = itemList.find((i) => i.id === selectedItem) ?? null;
  const shownSuppliers = new Set(shown.map((b) => b.supplierId ?? b.supplierName)).size;
  // Card width scales with how many bids there are: 1–2 grow to fill the row (no empty side margin);
  // 3+ take a fixed width so the third card peeks at the edge, hinting the horizontal scroll.
  const cardFlex = shown.length <= 2 ? "1 1 0" : "0 0 calc(44% - 8px)";
  // Toolbar chip styles (prototype bids-by-supplier).
  const supChip = (on: boolean): CSSProperties => ({ display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap", flexShrink: 0, padding: "10px 14px", borderRadius: 22, cursor: "pointer", fontWeight: 800, fontSize: 13, fontFamily: "inherit", background: on ? "#1c3550" : "#fff", color: on ? "#fff" : "#1c3550", border: `1px solid ${on ? "#1c3550" : "#d4e0ec"}` });
  const chipCount = (on: boolean): CSSProperties => ({ fontSize: 11, fontWeight: 800, background: on ? "rgba(255,255,255,.18)" : "#eff4f9", color: on ? "#fff" : "#6b8fa8", padding: "1px 7px", borderRadius: 20 });
  const itemMenuRow = (on: boolean): CSSProperties => ({ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "start", padding: "9px 11px", borderRadius: 9, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 13, fontFamily: "inherit", background: on ? "#eff4f9" : "transparent", color: "#1c3550" });
  const menuCount: CSSProperties = { fontSize: 11, fontWeight: 800, color: "#6b8fa8", background: "#F0F4F9", padding: "1px 8px", borderRadius: 20 };

  return (
    <div>
      {/* toolbar — supplier tabs | item picker | filter icon (prototype bids-by-supplier) */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
        {/* supplier tabs */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          <button onClick={() => setSupplierKey("all")} style={supChip(supplierKey === "all")}>
            {L("All suppliers", "كل المؤجّرين")}<span style={chipCount(supplierKey === "all")}>{allBids.length}</span>
          </button>
          {suppliers.map((s) => {
            const on = supplierKey === s.key;
            return (
              <button key={s.key} onClick={() => setSupplierKey(s.key)} style={supChip(on)}>
                <span style={{ width: 18, height: 18, borderRadius: "50%", background: on ? "rgba(255,255,255,.2)" : "#1c3550", color: "#fff", fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{s.name.charAt(0).toUpperCase()}</span>
                {s.name}
                {s.verified && <span className="material-icons-outlined" style={{ fontSize: 14, color: on ? "#7CE5A6" : "#1daf58" }}>verified</span>}
                <span style={chipCount(on)}>{s.count}</span>
              </button>
            );
          })}
        </div>
        <div style={{ width: 1, height: 34, background: "#D7DEE8", flexShrink: 0 }} />
        {/* item picker */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={() => { setItemMenuOpen((o) => !o); setFilterOpen(false); }} title={L("Filter by item", "تصفية حسب البند")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 11, border: "1.5px solid #1c3550", background: "#1c3550", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, padding: 1 }}>
              {selItem
                ? <EquipImg src={selItem.img} categoryId={selItem.categoryId} name={selItem.name} box="" img="h-[26px] w-[26px] object-contain" iconSize={24} />
                : <span className="material-icons-outlined" style={{ fontSize: 20, color: "#1c3550" }}>apps</span>}
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, background: "rgba(255,255,255,.16)", color: "#FBBF6B", padding: "1px 7px", borderRadius: 20 }}>{selItem ? selItem.count : allBids.length}</span>
            <span className="material-icons-outlined" style={{ fontSize: 16, color: "#9DAFC6" }}>expand_more</span>
          </button>
          {itemMenuOpen && (
            <>
              <div onClick={() => setItemMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
              <div style={{ position: "absolute", zIndex: 30, top: "100%", insetInlineEnd: 0, marginTop: 6, background: "#fff", border: "1px solid #d4e0ec", borderRadius: 13, boxShadow: "0 16px 40px rgba(20,40,70,.20)", padding: 6, minWidth: 280, maxHeight: 360, overflowY: "auto" }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".06em", color: "#6b8fa8", padding: "6px 9px 7px" }}>{L("VIEWING ITEM", "البند المعروض")}</div>
                <button onClick={() => { setSelectedItem("all"); setItemMenuOpen(false); }} style={itemMenuRow(selectedItem === "all")}>
                  <span className="material-icons-outlined" style={{ fontSize: 18 }}>apps</span>
                  <span style={{ flex: 1 }}>{L("All items", "كل البنود")}</span>
                  <span style={menuCount}>{allBids.length}</span>
                </button>
                {itemList.map((m) => (
                  <button key={m.id} onClick={() => { setSelectedItem(m.id); setItemMenuOpen(false); }} style={itemMenuRow(selectedItem === m.id)}>
                    <EquipImg src={m.img} categoryId={m.categoryId} name={m.name} box="" img="h-4 w-4 object-contain" iconSize={18} />
                    <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</span>
                    {m.qty > 1 && <span style={{ fontSize: 10, fontWeight: 800, color: "#d4780a", background: "#fff3e0", padding: "1px 6px", borderRadius: 20 }}>×{m.qty}</span>}
                    <span style={menuCount}>{m.count}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {/* filter icon */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={() => { setFilterOpen((o) => !o); setItemMenuOpen(false); }} title={L("Filter bids", "تصفية العروض")} style={{ position: "relative", width: 42, height: 42, borderRadius: 11, border: `1.5px solid ${fActive ? "#f79009" : "#d4e0ec"}`, background: fActive ? "#fff4e5" : "#fff", color: fActive ? "#f79009" : "#1c3550", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span className="material-icons-outlined" style={{ fontSize: 20 }}>filter_list</span>
            {fActive > 0 && <span style={{ position: "absolute", top: -6, insetInlineEnd: -6, fontSize: 10, fontWeight: 900, background: "#f79009", color: "#fff", minWidth: 17, height: 17, borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>{fActive}</span>}
          </button>
          {filterOpen && (
            <>
              <div className="filter-backdrop" onClick={() => setFilterOpen(false)} />
              <div className="filter-pop" style={{ insetInlineStart: "auto", insetInlineEnd: 0 }}>
                <div className="fp-h">{L("Bid source", "مصدر العرض")}</div>
                {([
                  ["all", L("All sources", "كل المصادر"), null, ""],
                  ["link", L("Off your request link", "من رابط طلبك"), "link", "var(--action)"],
                  ["platform", L("On platform", "على المنصة"), "verified", "var(--success)"],
                ] as const).map(([key, label, icon, color]) => (
                  <div key={key} className={`fp-opt${fSource === key ? " on" : ""}`} onClick={() => setFSource(key)}>
                    <span className="radio" />
                    {icon && <span className="material-icons-outlined fp-ic" style={{ color }}>{icon}</span>}
                    {label}
                    <span className="fp-n">{srcCount(key)}</span>
                  </div>
                ))}
                <div className="fp-div" />
                <div className="fp-h">{L("Refine", "تنقية")}</div>
                <div className={`fp-opt fp-check${fVerified ? " on" : ""}`} onClick={() => setFVerified((v) => !v)}>
                  <span className="box"><span className="material-icons-outlined">check</span></span>
                  <span className="material-icons-outlined fp-ic" style={{ color: "var(--success)" }}>verified_user</span>{L("Verified suppliers only", "المؤجّرون الموثّقون فقط")}
                </div>
                <div className={`fp-opt fp-check${fKm ? " on" : ""}`} onClick={() => setFKm((v) => !v)}>
                  <span className="box"><span className="material-icons-outlined">check</span></span>
                  <span className="material-icons-outlined fp-ic" style={{ color: "var(--navy-mid)" }}>place</span>{L("Within 50 km of site", "ضمن ٥٠ كم من الموقع")}
                </div>
                <div className="fp-foot">
                  <button className="clr" onClick={() => { setFSource("all"); setFVerified(false); setFKm(false); }}>{L("Clear all", "مسح الكل")}</button>
                  <button className="done" onClick={() => setFilterOpen(false)}>{L("Done", "تم")}</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div data-select-ui style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "0 0 14px" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#2a4f72" }}>
          {selectMode
            ? L("Tap bids to compare or export · click away to cancel", "اضغط على العروض للمقارنة أو التصدير · انقر خارجًا للإلغاء")
            : `${shown.length} ${L("bids from", "عروض من")} ${shownSuppliers} ${L("suppliers", "مؤجّرين")}${selItem ? ` · ${selItem.name}` : ""}`}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {/* B4: clicking outside exits selection (see the mousedown effect) — no Cancel button. */}
          <button
            onClick={() => setSelectMode((m) => !m)}
            title={L("Pick bids to compare or export", "اختر عروضًا للمقارنة أو التصدير")}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 11, padding: "10px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", background: selectMode ? "#1c3550" : "#fff", color: selectMode ? "#fff" : "#1c3550", border: `1px solid ${selectMode ? "#1c3550" : "#d4e0ec"}` }}
          >
            <span className="material-icons-outlined" style={{ fontSize: 17 }}>compare_arrows</span>
            {selectMode ? L("Selecting", "جارٍ التحديد") : L("Compare / Export", "مقارنة / تصدير")}
          </button>
        </div>
      </div>

      <div className="bids-snap" data-select-ui>
      {shown.map((b) => {
        if (b.viaSharedLink) {
          return (
            <SharedLinkBidCard
              key={b.id}
              bid={b}
              ar={ar}
              L={L}
              isSel={selected.has(b.id)}
              selectMode={selectMode}
              cardFlex={cardFlex}
              onToggleSelect={() => toggleSelect(b.id)}
              onViewSubmission={() => setSubmissionBid(b)}
              itemLabel={ar ? b.itemLabelAr : b.itemLabel}
              itemImage={b.itemImage}
              categoryId={b.categoryId}
            />
          );
        }
        // A survey-reported winner (wonViaSurvey) that isn't ACCEPTED still reads as a decided "Awarded"
        // bid — app parity (the mobile card reflects both). ACCEPTED keeps its own "Accepted" pill.
        const wonSurvey = b.wonViaSurvey === true && b.status !== "ACCEPTED";
        const sp = wonSurvey ? { cls: "sp-accepted", dot: false, en: "Awarded", ar: "تمت الترسية" } : (SPILL[b.status] ?? SPILL.PENDING);
        const sc = wonSurvey ? { bg: "#e7f7ee", c: "#1daf58", dot: false } : ({
          PENDING: { bg: "#e6f2fb", c: "#1a7ec8", dot: true },
          OPEN_FOR_NEGOTIATION: { bg: "#fff3e0", c: "#d4780a", dot: true },
          COUNTER_OFFERED: { bg: "#fff3e0", c: "#d4780a", dot: true },
          ACCEPTED: { bg: "#e7f7ee", c: "#1daf58", dot: false },
          EXPIRED: { bg: "#eff4f9", c: "#6b8fa8", dot: false },
          WITHDRAWN: { bg: "#eff4f9", c: "#6b8fa8", dot: false },
        } as Record<string, { bg: string; c: string; dot: boolean }>)[b.status] ?? { bg: "#e6f2fb", c: "#1a7ec8", dot: true };
        const disabled = b.status === "EXPIRED" || b.status === "WITHDRAWN" || b.expired;
        const offered = b.unitsOffered || 1; // units this supplier is offering
        const needed = b.numberOfUnits || offered; // units the request asked for
        const cover = needed ? Math.min(100, Math.round((offered / needed) * 100)) : 0;
        const priceOpen = openPrices.has(b.id);
        const perUnit = !allUnitsIds.has(b.id); // default per-unit; a card is "all units" only if toggled
        const isSel = selected.has(b.id);
        // Card price — canonical quote: rate ÷ period-days × duration (weekly ÷7, monthly ÷26),
        // mob/demob × units, VAT 15%. "Per unit" toggle prices one unit; else all offered units.
        const u = priceOpen && perUnit ? 1 : offered;
        const cq = computeBidQuote(b, { units: u, fallbackDays: group.items.find((it) => it.id === b.requestId)?.durationDays ?? null });
        const rental = cq.rentalSubtotal;
        const deliv = cq.mobTotal;
        const ret = cq.demobTotal;
        const sub = cq.subtotalPreVat;
        const vat = Math.round(cq.vat);
        const grand = Math.round(cq.total);
        // Mobile parity (v3_bid_card): collapsed headline = the PER-UNIT rental total (rate × periods),
        // excluding units/mob/demob/VAT — so bids compare on the unit rate. All-in lives in the grand total.
        const perUnitRentalTotal = Math.round((b.price ?? 0) * cq.periods);
        const rentalTotalLabel = ((): string => {
          switch ((b.priceUnit ?? "PER_DAY").toUpperCase()) {
            case "PER_WEEK": return L("Weekly rental total", "إجمالي الإيجار الأسبوعي");
            case "PER_MONTH": return L("Monthly rental total", "إجمالي الإيجار الشهري");
            case "PER_JOB": return L("Job total", "إجمالي المهمة");
            default: return L("Daily rental total", "إجمالي الإيجار اليومي");
          }
        })();
        const isAccepted = (b.status ?? "").toUpperCase() === "ACCEPTED" || wonSurvey; // decided → accepted/awarded styling
        // B1: the card tally uses the SAME bucketing as the Terms modal (bucketBidTerms) so the card's
        // "Conflict N · Matched N" always equals what the modal lists when opened.
        const termCounts = bucketBidTerms(b.terms, b.negotiableTerms).counts;
        const termChips = [
          { label: L("Conflict", "تعارض"), n: termCounts.conflict, c: "#d9362a" },
          { label: L("Pending review", "بانتظار المراجعة"), n: termCounts.pending, c: "#d4780a" },
          { label: L("Matched", "مطابق"), n: termCounts.matched, c: "#1daf58" },
        ];
        const rowSep = { borderTop: "1px solid #EFF2F6" } as const;
        const iconBox = { width: 40, height: 40, borderRadius: 11, background: "#eff4f9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } as const;
        const blueLink = { background: "none", border: "none", color: "#1a7ec8", fontWeight: 800, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" } as const;
        // Top banner = the bid's SOURCE only (2 values, app parity): on-platform bids are always
        // "Via Moedatech app" in BLUE; off-platform shared-link bids carry the ORANGE banner on their
        // own card (SharedLinkBidCard). The negotiation STATUS lives in the right badge + the CTA suffix.
        const banner = { icon: "verified_user", text: L("Via Moedatech app", "عبر تطبيق معداتك"), bg: "#e6f2fb", c: "#1a7ec8", bd: "#cfe6f7" };
        return (
          <div
            key={b.id}
            onClick={selectMode ? () => toggleSelect(b.id) : undefined}
            style={{ flex: cardFlex, minWidth: 320, scrollSnapAlign: "start", alignSelf: "flex-start", display: "flex", flexDirection: "column", position: "relative", background: isSel ? "#fff8f0" : "#fff", border: `1px solid ${isSel ? "#f79009" : "#d4e0ec"}`, borderRadius: 18, overflow: "hidden", boxShadow: isSel ? "inset 0 0 0 2px #f79009" : "0 1px 2px rgba(20,40,70,.04)", cursor: selectMode ? "pointer" : "default" }}
          >
            <div style={{ height: 4, background: banner.c }} />
            {banner && (
              <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", background: banner.bg, borderBottom: `1px solid ${banner.bd}`, fontSize: 11.5, fontWeight: 800, color: banner.c }}>
                <span className="material-icons-outlined" style={{ fontSize: 16 }}>{banner.icon}</span>{banner.text}
              </div>
            )}
            {selectMode && (
              <div style={{ position: "absolute", top: 12, insetInlineEnd: 12, width: 26, height: 26, borderRadius: "50%", background: isSel ? "#f79009" : "#fff", border: `2px solid ${isSel ? "#f79009" : "#d4e0ec"}`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(20,40,70,.18)", zIndex: 5, pointerEvents: "none" }}>
                {isSel && <span className="material-icons-outlined" style={{ fontSize: 16 }}>check</span>}
              </div>
            )}

            {/* header */}
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "16px 16px 12px" }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: "#eff4f9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <EquipImg src={b.itemImage} categoryId={b.categoryId} name={ar ? b.itemLabelAr : b.itemLabel} box="" img="h-10 w-10 object-contain" iconSize={36} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
                  <span style={{ flex: "0 1 auto", minWidth: 0, fontSize: 13.5, fontWeight: 900, color: "#1c3550", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.25 }} title={ar ? b.itemLabelAr : b.itemLabel}>{ar ? b.itemLabelAr : b.itemLabel}</span>
                  <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: "#d4780a", background: "#fff3e0", padding: "1px 8px", borderRadius: 20 }}>×{offered}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6 }}>
                  <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#1c3550", color: "#fff", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{(b.supplierName || "S").charAt(0).toUpperCase()}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: "#1c3550" }}>{b.supplierName}</span>
                  {b.verified && <span className="material-icons-outlined" style={{ fontSize: 16, color: "#1daf58" }}>verified</span>}
                </div>
              </div>
              {!selectMode && (
                <span style={{ whiteSpace: "nowrap", fontSize: 11, fontWeight: 800, padding: "5px 11px", borderRadius: 20, background: sc.bg, color: sc.c, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {sc.dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.c }} />}{ar ? sp.ar : sp.en}
                </span>
              )}
            </div>

            {/* fulfillment band */}
            <div style={{ margin: "0 16px 14px", padding: "10px 14px", borderRadius: 12, background: "#fff4e5", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#1c3550", whiteSpace: "nowrap" }}>{L(`Covers ${offered} of ${needed} units`, `يغطّي ${offered} من ${needed} وحدات`)}</span>
              <div style={{ flex: 1, height: 8, borderRadius: 6, background: "rgba(247,144,9,.18)", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 6, background: "#f79009", width: `${cover}%` }} />
              </div>
              <span style={{ fontSize: 12, color: "#6b8fa8", fontWeight: 700, whiteSpace: "nowrap" }}>{[b.rating != null ? `★ ${b.rating.toFixed(1)}` : "", b.distanceKm != null ? `${Math.round(b.distanceKm)} km` : ""].filter(Boolean).join(" · ")}</span>
            </div>

            {/* Equipment row */}
            <div style={{ ...rowSep, display: "flex", alignItems: "center", gap: 12, padding: "13px 16px" }}>
              <div style={iconBox}>
                <EquipImg src={b.itemImage} categoryId={b.categoryId} name={ar ? b.itemLabelAr : b.itemLabel} box="" img="h-5 w-5 object-contain" iconSize={20} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#1c3550" }}>{L("Equipment", "المعدة")}</span>
              {/* No cert chips on the card — all equipment detail lives in the Details modal only. */}
              <div style={{ flex: 1 }} />
              {!selectMode && (
                <button onClick={() => setEquipBid(b)} style={blueLink}>{L("Details", "التفاصيل")} ›</button>
              )}
            </div>

            {/* Terms row */}
            <div style={{ ...rowSep, display: "flex", alignItems: "center", gap: 12, padding: "13px 16px" }}>
              <div style={iconBox}><span className="material-icons-outlined" style={{ fontSize: 20, color: "#6b8fa8" }}>description</span></div>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#1c3550" }}>{L("Terms", "الشروط")}</span>
              <div style={{ display: "flex", gap: 4, flexWrap: "nowrap", flex: 1, minWidth: 0, overflowX: "auto" }} className="no-sb">
                {termChips.map((t) => (
                  <span key={t.label} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 800, color: t.n > 0 ? t.c : "#9AA7B8", whiteSpace: "nowrap" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: t.n > 0 ? t.c : "#c3d2e0" }} />{t.label} {t.n}
                  </span>
                ))}
              </div>
              {!selectMode && <button onClick={() => setTermsBid(b)} style={blueLink}>{L("View", "عرض")} ›</button>}
            </div>


            {/* Price row — headline is the PER-UNIT rental total (mobile parity); rate shown in the caption */}
            <div style={{ ...rowSep, padding: "13px 16px", ...(isAccepted ? { background: "#e7f7ee" } : {}) }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ ...iconBox, background: "#fff4e5" }}><span className="material-icons-outlined" style={{ fontSize: 20, color: "#f79009" }}>payments</span></div>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#1c3550" }}>{rentalTotalLabel}</span>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#6b8fa8", marginTop: 1 }}>{nf(b.price ?? 0)}/{periodOf(b.priceUnit)} × {Number.isInteger(cq.periods) ? cq.periods : cq.periods.toFixed(2)} · {L("per unit", "للوحدة")}</div>
                </div>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 17, fontWeight: 900, color: "#f79009" }}>{nf(perUnitRentalTotal)} {L("SAR", "ر.س")}</span>
                {isAccepted && <span className="material-icons-outlined" style={{ fontSize: 18, color: "#1daf58" }} title={L("Accepted", "مقبول")}>check_circle</span>}
                {!selectMode && (
                  <button onClick={() => { setOpenPrices((s) => { const n = new Set(s); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; }); setAllUnitsIds((s) => { const n = new Set(s); n.delete(b.id); return n; }); }} style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid #d4e0ec", background: "#F7FAFC", color: "#6b8fa8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span className="material-icons-outlined" style={{ fontSize: 18 }}>{priceOpen ? "expand_less" : "expand_more"}</span>
                  </button>
                )}
              </div>
              {priceOpen && !selectMode && (
                <div style={{ marginTop: 12 }}>
                  {offered > 1 && (
                    <div style={{ display: "inline-flex", background: "#eff4f9", borderRadius: 10, padding: 3, marginBottom: 12 }}>
                      {([[false, L(`All ${offered} units`, `كل ${offered} وحدات`)], [true, L("Per unit", "لكل وحدة")]] as [boolean, string][]).map(([v, lab]) => (
                        <button key={String(v)} onClick={() => setAllUnitsIds((s) => { const n = new Set(s); if (v) n.delete(b.id); else n.add(b.id); return n; })} style={{ padding: "6px 13px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 12.5, fontFamily: "inherit", background: perUnit === v ? "#1c3550" : "transparent", color: perUnit === v ? "#fff" : "#6b8fa8" }}>{lab}</button>
                      ))}
                    </div>
                  )}
                  {([
                    [L(`Rental (${nf(b.price ?? 0)}/${periodOf(b.priceUnit)} × ${Number.isInteger(cq.periods) ? cq.periods : cq.periods.toFixed(2)}${u > 1 ? ` × ${u}` : ""})`, `الإيجار (${nf(b.price ?? 0)}/${periodOf(b.priceUnit)} × ${Number.isInteger(cq.periods) ? cq.periods : cq.periods.toFixed(2)}${u > 1 ? ` × ${u}` : ""})`), rental, null],
                    ...(deliv ? [[u > 1 ? L(`Delivery to site (${nf(Math.round(deliv / u))} × ${u} units)`, `النقل إلى الموقع (${nf(Math.round(deliv / u))} × ${u} وحدة)`) : L("Delivery to site", "النقل إلى الموقع"), deliv, b.mobLeadTime]] as [string, number, string | null][] : []),
                    ...(ret ? [[u > 1 ? L(`Return from site (${nf(Math.round(ret / u))} × ${u} units)`, `الإرجاع من الموقع (${nf(Math.round(ret / u))} × ${u} وحدة)`) : L("Return from site", "الإرجاع من الموقع"), ret, b.demobLeadTime]] as [string, number, string | null][] : []),
                    [L("Subtotal before VAT", "المجموع قبل الضريبة"), sub, null],
                    [L("VAT (15%)", "ضريبة القيمة المضافة (١٥٪)"), vat, null],
                  ] as [string, number, string | null][]).map(([lab, val, note], i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: "1px solid #F2F5F8" }}>
                      <span style={{ fontSize: 13.5, color: "#2a4f72", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>{lab}{note ? <span style={{ fontSize: 11, color: "#6b8fa8", background: "#eff4f9", padding: "1px 7px", borderRadius: 20, whiteSpace: "nowrap" }}>{note}</span> : null}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#1c3550", fontVariantNumeric: "tabular-nums" }}>{nf(val)}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, padding: "12px 14px", borderRadius: 10, background: "#FAFCFE", border: "1.5px solid #1c3550" }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#1c3550" }}>{L("Grand total", "الإجمالي الكلي")}</span>
                    <span style={{ fontSize: 18, fontWeight: 900, color: "#1c3550" }}>{nf(grand)} <span style={{ color: "#f79009" }}>{L("SAR", "ر.س")}</span></span>
                  </div>
                </div>
              )}
            </div>

            {/* supplier note */}
            {b.note && (
              <div style={{ ...rowSep, display: "flex", gap: 8, padding: "12px 16px", alignItems: "flex-start" }}>
                <span style={{ fontSize: 15 }}>💬</span>
                <span style={{ fontSize: 13, color: "#6b8fa8", fontWeight: 600, lineHeight: 1.5 }}>{b.note}</span>
              </div>
            )}

            {/* CTA */}
            {!selectMode && (
              <div style={{ marginTop: "auto", padding: "12px 16px 16px" }}>
                <button disabled={disabled || busyId === b.id} onClick={() => startNegotiation(b)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 9, padding: "14px", borderRadius: 14, border: "none", background: disabled ? "#9AA7B8" : "#1c3550", color: "#fff", fontWeight: 800, fontSize: 15, cursor: disabled ? "default" : "pointer", fontFamily: "inherit", opacity: busyId === b.id ? 0.7 : 1 }}>
                  <span className="material-icons-outlined" style={{ fontSize: 18 }}>{b.status === "ACCEPTED" ? "receipt_long" : "forum"}</span>{pillLabel(b.status, L)}{offerSuffix(b.uiState, L) ? ` · ${offerSuffix(b.uiState, L)}` : ""}
                </button>
              </div>
            )}
          </div>
        );
      })}
      </div>

      {selectMode && selectedCount > 0 && (
        <div className="qbar" data-select-ui>
          <span className="qn">{selectedCount} {L("selected", "محدّد")}</span>
          {selectedCount < shown.length && <span className="qclear" onClick={() => setSelected(new Set(shown.map((b) => b.id)))}>{L("Select all", "تحديد الكل")}</span>}
          <span className="qclear" onClick={() => setSelected(new Set())}>{L("Clear", "مسح")}</span>
          {/* web-app/007 — Compare the selected bids side by side (works with a single bid too). */}
          <button
            className="qdl"
            disabled={selectedCount < 1}
            style={{ background: "var(--navy)", opacity: selectedCount < 1 ? 0.5 : 1 }}
            title={L("Compare side by side", "قارن جنبًا إلى جنب")}
            onClick={goCompare}
          >
            <span className="material-icons-outlined">compare_arrows</span> {L("Compare", "قارن")}
          </button>
          <button
            className="qdl"
            onClick={() => {
              // Snapshot the selected bids NOW (before a modal can clear the selection) so the quotation
              // covers only these suppliers — not the whole group.
              setDlOnly([...(bids ?? []), ...subCards].filter((b) => selected.has(b.id)));
              if (verified) setLangPick(true);
              else setQuoteGate(true);
            }}
          >
            <span className="material-icons-outlined">download</span> {L("Download quotations", "تنزيل عروض الأسعار")}
          </button>
        </div>
      )}

      {/* Quotation language chooser — one PDF in the chosen language (no 2-in-1). */}
      {langPick && (
        <div className="tm-overlay" dir={ar ? "rtl" : "ltr"} onClick={() => setLangPick(false)}>
          <div className="tm-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="tm-head">
              <h3>{L("Quotation language", "لغة عرض السعر")}</h3>
              <button type="button" onClick={() => setLangPick(false)} aria-label={L("Close", "إغلاق")}>
                <span className="material-icons-outlined">close</span>
              </button>
            </div>
            <div className="tm-body">
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
                {L("Choose the language for the generated PDF.", "اختر لغة ملف عرض السعر.")}
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn primary" style={{ flex: 1 }} onClick={() => { setLangPick(false); downloadQuotation(false, dlOnly ?? undefined); }}>
                  English
                </button>
                <button className="btn primary" style={{ flex: 1 }} onClick={() => { setLangPick(false); downloadQuotation(true, dlOnly ?? undefined); }}>
                  العربية
                </button>
              </div>
            </div>
          </div>
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

      {/* Terms modal (prototype "Terms — <supplier>") — per-class term status + Negotiate terms */}
      {termsBid && (
        <BidTermsModal
          supplier={termsBid.supplierName}
          terms={termsBid.terms}
          negotiable={termsBid.negotiableTerms}
          ar={ar}
          L={L}
          busy={busyId === termsBid.id}
          onNegotiate={() => { const b = termsBid; setTermsBid(null); startNegotiation(b); }}
          onClose={() => setTermsBid(null)}
        />
      )}

      {/* Issue-quotation gate for an unverified renter (company name vs personal name). */}
      {quoteGate && (
        <QuotationVerifyGate
          ar={ar}
          L={L}
          onClose={() => setQuoteGate(false)}
          onVerify={() => { setQuoteGate(false); router.push("/verify"); }}
          onContinue={() => { setQuoteGate(false); setLangPick(true); }}
        />
      )}

      {/* web-app/006 — read-only viewer of an off-platform shared-link submission (real answers) */}
      {submissionBid && (
        <SharedBidSubmissionModal
          bid={submissionBid}
          submission={submissions.find((s) => s.id === submissionBid.submissionKey) ?? null}
          ar={ar}
          L={L}
          onClose={() => setSubmissionBid(null)}
          onDownloadQuotation={() => downloadQuotation(ar, [submissionBid])}
        />
      )}
    </div>
  );
}
