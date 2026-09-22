/**
 * ONE quotation *document* for a bid, shared by every renter-side download.
 *
 * `render.ts` is the template — it turns a finished `QuotationDoc` into HTML. This module is the layer
 * above it: it turns BIDS into that `QuotationDoc`. It exists because the template alone was not enough
 * to stop the surfaces drifting. `GroupBids` mapped bids → `QuotationDoc` inline, so `RequestBids`
 * (which has one request, not a group) could not reach that mapping and grew a SECOND, completely
 * separate HTML builder: no parties block, no terms, no legal clauses, no quotation reference —
 * and, the defect that mattered, mobilisation/demobilisation printed as charges even after the parties
 * excluded them in the deal room, with the rental unit count used for both legs regardless of their own
 * negotiated counts. A renter downloading from the request view got a document listing money that was
 * not in the deal, and it disagreed with the same deal downloaded from the group view.
 *
 * The entry shape is deliberately per-BID rather than per-group: a caller passes one supplier's bids
 * (one, or several across a multi-item RFQ) plus the request context each was quoted against. One bid
 * is just the n=1 case, so a single-request surface needs no fork.
 *
 * Transport legs go through `computeQuoteTotals` in `@/lib/pricing/rental` — the same maths the bid card
 * and the deal room price against — so an excluded leg contributes nothing and a leg with its own
 * negotiated count uses it. For a bid that was never negotiated (`mobExcluded` false, `mobUnits` null)
 * that is arithmetically identical to the old `price × units`, which is why the grouped download's
 * output is unchanged for every bid that has not been through a deal room.
 *
 * The RENTAL goes through `computeRentalTotal` from the same module, for the same reason: this document
 * used to prorate over the raw calendar duration (charging the Fridays the bid card excludes) and to
 * print one unit's rent beside transport legs it had already multiplied by the unit count. Same bid,
 * three numbers. It now reads exactly as the bid card does — the supplier's raw quoted rate in the price
 * column, and the divisor stated beside the total.
 */

import { CERT_LABEL, type BidCard, type TermRow } from "@/lib/contract/bids";
import { isHiddenDealRoomTermKey } from "@/lib/contract/deal-room";
import { chatCardTermLabel } from "@/lib/contract/deal-rounds";
import { latinDigits, partyToken, termValueLabel } from "@/lib/contract/labels";
import { computeQuoteTotals, computeRentalTotal, divisorNote, rentalDivisor, VAT_RATE } from "@/lib/pricing/rental";
import { CLAUSE, ClauseList, extraTermClauses, resolveTerm, type TermSource } from "@/lib/quotation/clauses";
import {
  quotationLegal,
  type QLang,
  type QuotationClause,
  type QuotationDoc,
  type QuotationLineItem,
  type QuotationMoneyCell,
  type QuotationParty,
  type QuotationPartyRow,
} from "@/lib/quotation/render";

/** One bid plus the request line it was quoted against. */
export interface QuotationBidEntry {
  bid: BidCard;
  /**
   * The equipment label as the RENTER's current UI shows it. Passed in already localized rather than
   * derived from `lang`: the caller holds the taxonomy names, and the label must not change just
   * because the renter exported the other language of the same document.
   */
  itemLabel: string;
  /** The request line's citable code (`REQ-NNNNN`, else a short ref). */
  requestCode: string;
  /** The rental window this bid was quoted against. `durationDays` null = open-ended ("as operated"). */
  startDate?: string | null;
  endDate?: string | null;
  durationDays?: number | null;
  /** The request's rental basis (daily / weekly / …). */
  rentalType?: string | null;
  /** Who the REQUEST assigned each transport leg to — a leg that is the RENTER's is not the supplier's
   *  to price, so it prints as `–` rather than as an unpriced one. */
  mobByRentee?: boolean | null;
  demobByRentee?: boolean | null;
}

/** The renter's own identity block. */
export interface QuotationRentee {
  companyName?: string | null;
  personName?: string | null;
  crNumber?: string | null;
  vatNumber?: string | null;
  nationalAddress?: string | null;
  phone?: string | null;
  email?: string | null;
  /** Party-verified — gates the green tick beside the party's NAME (app parity). */
  verified?: boolean;
  /** The renter's own mark (`profile-status.companyLogoUrl`, presigned). Printed only beside a
   *  VERIFIED renter, the app's rule (`renter_record_cta.dart`): a mark on file under an unverified
   *  firm is not what the document shows, and the verify ask stands in its place. */
  logoUrl?: string | null;
  /** The screen-only asks on the renter's box — see `QuotationParty.asks`. */
  asks?: QuotationParty["asks"];
}

export interface BuildBidQuotationInput {
  lang: QLang;
  /** One supplier's bids. Order is preserved; the first entry supplies the section-level context. */
  entries: QuotationBidEntry[];
  /** The citable identifier stamped on the document. */
  quotationNumber: string;
  /** "Request #" — the RFQ group code when there is one; defaults to the entries' own request codes. */
  reference?: string | null;
  rentee: QuotationRentee;
  /** The job's site, short form (`Riyadh`). The app prints it in the reference strip and in the
   *  renter's box; absent, both simply omit the row rather than printing a blank. */
  workSite?: string | null;
  /** The platform's mark for the signature strip (an ABSOLUTE URL — the document renders in a blank
   *  window, where a relative path resolves to nothing). */
  sealUrl?: string | null;
  /**
   * The SUPPLIER's store mark, printed in its party box and in the navy footer (one logo, two slots,
   * exactly as the app does it).
   *
   * ~~🔴 BACKEND, owed: `BidCard` carries no supplier logo … so this arrives null today.~~ Corrected
   * 2026-09-23: the bid projection DOES carry the mark, as a bare storage key, which becomes an
   * unsigned 403 link (the broken box the owner saw). The received-bids list carries it SIGNED; pass
   * that here and it wins over the bid's own.
   */
  supplierLogoUrl?: string | null;
  /** Issue date. Injectable so the document is deterministic under test. */
  now?: Date;
}

/** The platform's support address. ONE spelling, shared by both documents' signature strips — a
 *  second literal is how the two come to disagree. */
export const SUPPORT_EMAIL = "support@moedatech.com";

/** 2-decimal money (app parity: quotation totals show halalas, e.g. 250.00 / 37.50). */
const m2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * The key that decides which bids share ONE document: one quotation per supplier.
 *
 * Deliberately `supplierId`, NOT the company-level `bidSupplierKey` the bid-list CHIPS group by. The
 * quotation is issued by, and signed off in the name of, the bidding member — folding two colleagues of
 * one firm into a single document would put bids nobody jointly quoted under one reference. Shared so
 * both entry points cut the documents the same way.
 */
export function quotationSupplierKey(bid: BidCard): string {
  return bid.supplierId ?? bid.supplierName ?? "—";
}

/** The 2–3 letter supplier initials that make a quotation number readable (`Q-REQ-00007-ACM1`). */
export function quotationSupplierInitials(name: string | null | undefined): string {
  return (name || "S").replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "S";
}

/**
 * Units the supplier OFFERED (app `_offeredUnitsForBid`: unitsOffered → requested → 1).
 *
 * Deliberately NOT the live deal-room count the bid CARD uses: the quotation prices the offer as it was
 * made. The transport legs still take their negotiated counts on top of this, because those are the
 * numbers the two parties actually settled on per leg.
 */
function offeredUnits(b: BidCard): number {
  return b.unitsOffered || b.numberOfUnits || 1;
}

/**
 * A transport cell.
 *
 * 🔴 Three answers, never two. EXCLUDED is checked first, so a leg the parties struck out — or one the
 * REQUEST put on the renter — prints as `–` rather than as money owed or as a price still coming. A
 * zero is `unpriced`: it arrives whenever a leg was never priced, and a `0` in a money column reads as
 * FREE, which is a claim the supplier never made.
 */
function legCell(price: number | null | undefined, excluded: boolean, byRentee: boolean): QuotationMoneyCell {
  if (excluded || byRentee) return { kind: "excluded" };
  return price != null && price > 0 ? { kind: "amount", text: m2(price) } : { kind: "unpriced" };
}

/**
 * Build the quotation document for one supplier's bids.
 *
 * Pure: no DOM, no clock (pass `now`), no locale beyond `lang`. Every surface that downloads a bid
 * quotation calls this, so a change to the document is a change everywhere at once.
 */
export function buildBidQuotationDoc(input: BuildBidQuotationInput): QuotationDoc {
  const isAr = input.lang === "ar";
  const L = (en: string, ar: string) => (isAr ? ar : en);
  const sar = L("SAR", "ر.س");
  const entries = input.entries;
  const head = entries[0];
  const sup = head.bid;
  const now = input.now ?? new Date();
  const dateLocale = isAr ? "ar-SA-u-ca-gregory" : "en-GB";
  /* ⚠️ `latinDigits`, on every date. `ar-SA` formats with ARABIC-INDIC digits, and this product prints
     Latin ones in both locales (owner, 2026-09-04: *"the numbers should be in eng even in arabic"*). */
  const dateStr = latinDigits(now.toLocaleDateString(dateLocale, { day: "numeric", month: "long", year: "numeric" }));
  const fmtRefDate = (d: string | null | undefined) =>
    d ? latinDigits(new Date(d).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" })) : "";

  // ── Parties ──────────────────────────────────────────────────────────────────────────────────────
  // App parity (`_PartyBox`): the company name is primary when the renter HAS a company (gated on
  // company presence, not on verification), the person becomes a labelled row under it, and the
  // verification tick sits beside the NAME rather than standing in for a missing registration number.
  const renteeCompany = (input.rentee.companyName ?? "").trim();
  const renteeName = (renteeCompany || input.rentee.personName || "").trim() || L("Moedatech renter", "مستأجر معداتك");
  const renteeVerified = input.rentee.verified === true;

  /** One field per line, and a field with no value is DROPPED rather than printed empty (app `_rows`). */
  const rows = (pairs: [string, string | null | undefined][]): QuotationPartyRow[] =>
    pairs.filter(([, v]) => (v ?? "").toString().trim().length > 0).map(([label, v]) => ({ label, value: String(v).trim() }));

  // Off-platform submissions carry real CR/VAT/address VALUES; on-platform bids carry only verification
  // FLAGS, so a supplier whose registration simply is not on this payload prints no row at all.
  const ld = sup.linkDocs ?? {};
  const supAddress = ld.national ?? sup.supplierNationalAddress;
  const supCr = ld.commercial ?? sup.supplierCrNumber;
  const supVat = ld.vat ?? sup.supplierVatNumber;
  const supPhone = ld.contact ?? sup.supplierPhone;
  const supEmail = sup.compliance.entityType === "company" ? sup.supplierEmail : null;
  // ONE logo, TWO slots — the party box and the navy footer, exactly as the app draws it. The bid's
  // own store mark wins; the caller's override is the way a surface that already holds one (the
  // deal room, a store page) can hand it in without a second read.
  //
  // 🔴 The CALLER's mark wins now (owner, 2026-09-23: the supplier's slot drew a broken image). The
  // bid projection carries a bare storage KEY, which `mediaUrl` turns into an UNSIGNED link to a
  // private bucket (403); the received-bids list carries the same mark SIGNED, and a caller holding
  // it hands it in here. The bid's own is the fallback, and a mark that still fails is removed by the
  // renderer's `onerror` rather than drawn broken.
  const supLogo = input.supplierLogoUrl ?? sup.supplierLogoUrl ?? null;
  const supplierRows = rows([
    [L("Address", "العنوان"), supAddress],
    [L("CR #", "س.ت"), supCr],
    [L("VAT #", "ض.ق.م"), supVat],
    [L("Phone", "الهاتف"), supPhone],
    [L("Email", "البريد"), supEmail],
  ]);
  const renteeRows = rows([
    ...(renteeCompany && input.rentee.personName ? ([[L("Rentee", "المُستأجِر"), input.rentee.personName]] as [string, string][]) : []),
    ...(input.workSite ? ([[L("Work site", "موقع العمل"), input.workSite]] as [string, string][]) : []),
    [L("Address", "العنوان"), input.rentee.nationalAddress],
    [L("CR #", "س.ت"), input.rentee.crNumber],
    [L("VAT #", "ض.ق.م"), input.rentee.vatNumber],
    [L("Phone", "الهاتف"), input.rentee.phone],
    [L("Email", "البريد"), input.rentee.email],
  ]);

  // ── Reference strip ──────────────────────────────────────────────────────────────────────────────
  const validRaw = entries.map((e) => e.bid.validUntil).filter(Boolean).sort()[0] ?? null;
  const reqIds = [...new Set(entries.map((e) => e.requestCode))];
  const reqLabel = reqIds.length === 1 ? reqIds[0] : `${reqIds[0]} +${reqIds.length - 1}`;

  // ── Line items ───────────────────────────────────────────────────────────────────────────────────
  // App rule (014): the bid is priced per billing period; the unit count is a COLUMN of its own and is
  // not multiplied into the per-unit rental figure. Open-ended → the rate, billed "as operated".
  const periodLabel = (u: string | null) => {
    switch ((u ?? "PER_DAY").toUpperCase()) {
      case "PER_WEEK": return L("week", "أسبوع");
      case "PER_MONTH": return L("month", "شهر");
      case "PER_JOB": return L("job", "مهمة");
      default: return L("day", "يوم");
    }
  };
  /** `المدة` is the ADJECTIVE on this table (`daily` / `يومي`), which is how the design draws it; the
   *  NOUN above still carries the open-ended rate and the amount-in-words suffix. */
  const periodAdjective = (u: string | null) => {
    switch ((u ?? "PER_DAY").toUpperCase()) {
      case "PER_WEEK": return L("Weekly", "أسبوعي");
      case "PER_MONTH": return L("Monthly", "شهري");
      case "PER_JOB": return L("Per job", "للمهمة");
      default: return L("Daily", "يومي");
    }
  };

  let sub = 0;
  let openRate: number | null = null; // representative per-unit·period rate for open-ended framing
  let openPlabel = "";
  let anyCommitted = false;
  const lineItems: QuotationLineItem[] = [];

  for (const e of entries) {
    const b = e.bid;
    const rate = b.price ?? 0;
    const units = offeredUnits(b);
    const dpp = rentalDivisor(b.priceUnit);
    const plabel = periodLabel(b.priceUnit);
    const durDays = e.durationDays ?? null;
    let lineSub: number;
    let totalNote: string | null = null;
    // The rental prorates through the SHARED module — ÷6 week, ÷26 month, Fridays excluded — and is
    // multiplied by the offered unit count, so this document totals the same deal the bid card beside
    // it and the deal room both total.
    const rental = computeRentalTotal({ rate, priceUnit: b.priceUnit, startDate: e.startDate ?? null, durationDays: durDays });
    if (durDays == null) {
      lineSub = rate; // open-ended: one-period PER-UNIT preview; billed "as operated" (app parity)
      totalNote = L("As operated", "حسب التشغيل");
      if (openRate == null) { openRate = rate; openPlabel = plabel; }
    } else if (dpp > 0) {
      anyCommitted = true;
      lineSub = rental.total * units;
      /* 🔴 The CHARGED DAYS, under the total. The eight-column table has no quantity column for them —
         `المدة` is the billing period as an adjective and `الوحدة` is the machine count — so without
         this note the one figure that explains the total (9 days charged, not the window's 10) would
         be nowhere on the paper. The divisor rides with it, whether or not the period comes out exact
         (app parity: `rentalPeriodSubtitle`). */
      totalNote = [
        rental.raw ? `1 ${plabel}` : `${rental.billable} ${L("days", "يوم")}`,
        divisorNote(b.priceUnit, L),
      ].filter(Boolean).join(" · ");
    } else {
      anyCommitted = true;
      // PER_JOB / unrecognized unit — `rate × durationDays × units`, straight off the shared module's
      // app-matching fallback. Not "flat": the app charges every calendar day of the window here.
      lineSub = rental.total * units;
      totalNote = `${durDays} ${L("days", "يوم")}`;
    }

    // THE transport legs. `computeQuoteTotals` is the shared leg maths: an excluded leg contributes
    // zero however much price is still stored against it, and a leg carries its OWN negotiated count
    // (defaulting to the rental count). Passing `perUnitRental: 0` asks it for the legs ONLY —
    // `lineSub` above already carries the rental across all units.
    const legTotals = computeQuoteTotals({
      perUnitRental: 0,
      rentalUnits: units,
      mob: { amount: b.mobPrice, units: b.mobUnits, excluded: b.mobExcluded },
      demob: { amount: b.demobPrice, units: b.demobUnits, excluded: b.demobExcluded },
    });
    const rowTotal = lineSub + legTotals.overall.mob + legTotals.overall.demob;
    sub += rowTotal;

    // `المعدة` is the machine's own name and `الوصف` is everything else: the column already names the
    // type, so repeating it in the description is the fault the app filtered out.
    const segs = e.itemLabel.split(" · ").map((x) => x.trim()).filter(Boolean);
    const size = segs.length > 1 ? segs.slice(1).join(" · ") : "";
    const eq = b.equipment;
    lineItems.push({
      equipment: segs[0] ?? e.itemLabel,
      description: [
        { label: L("Size", "الحجم"), value: size },
        { label: L("Year", "السنة"), value: eq?.year ? String(eq.year) : "" },
        { label: L("Model", "الموديل"), value: eq?.model ?? "" },
        { label: L("Manufacturer", "الشركة المصنعة"), value: eq?.make ?? "" },
      ],
      units: String(units),
      duration: periodAdjective(b.priceUnit),
      rental: rate > 0 ? { kind: "amount", text: m2(rate) } : { kind: "unpriced" },
      delivery: legCell(b.mobPrice, b.mobExcluded === true, e.mobByRentee === true),
      ret: legCell(b.demobPrice, b.demobExcluded === true, e.demobByRentee === true),
      total: durDays == null ? `${m2(rate)} / ${plabel}` : m2(rowTotal),
      totalNote,
    });
  }

  const vat = sub * VAT_RATE; // exact (not rounded) so the amount-in-words can show halalas — app parity
  const total = sub + vat;
  const allOpenEnded = !anyCommitted && openRate != null;

  // ── Terms ────────────────────────────────────────────────────────────────────────────────────────
  // The app's own ladder, through the shared `TermSource`: locked → counter → declared → request side.
  const src: TermSource = {
    locked: new Map((sup.lockedTerms ?? []).map((t) => [t.key, t.value])),
    counter: new Map((sup.counters ?? []).map((t) => [t.key, t.value])),
    declared: new Map(Object.entries(sup.t3Declarations ?? {})),
    requestSide: (key) => {
      const rt = sup.requestTerms;
      switch (key) {
        case "payment_terms": return rt.paymentTerms;
        case "breakdown_response_sla": return rt.breakdownResponseSla;
        case "maintenance_responsibility": return rt.maintenanceResponsibility;
        case "operator_nationality": return rt.operatorNationality;
        default: return null;
      }
    },
    hidden: isHiddenDealRoomTermKey,
    label: (key) => chatCardTermLabel(key, [], isAr),
    value: (key, v) => termValueLabel(key, v, L) ?? String(v),
  };

  const partyWord = (v: string | null) => {
    if (!v) return null;
    const u = partyToken(v).toLowerCase();
    if (u === "supplier") return L("the supplier", "المؤجر");
    if (u === "renter" || u === "rentee") return L("the renter", "المستأجر");
    return v;
  };

  const clauses = new ClauseList();

  // Scope, from the request itself.
  const scope = entries.map((e) => `${offeredUnits(e.bid)} × ${e.itemLabel}`).join(isAr ? "، " : ", ");
  const durDays = head.durationDays ?? null;
  if (scope) {
    clauses.add(
      CLAUSE.scopeTitle(L),
      CLAUSE.scope(L, scope, durDays != null && durDays > 0 ? `${durDays} ${L("days", "يومًا")}` : null),
    );
  }

  // Transport: which legs this price actually covers. Read off the SAME flags the table prints, so the
  // sentence and the `–` in the columns cannot disagree.
  const toSite = sup.mobExcluded !== true && head.mobByRentee !== true && (sup.mobPrice ?? 0) > 0;
  const fromSite = sup.demobExcluded !== true && head.demobByRentee !== true && (sup.demobPrice ?? 0) > 0;
  clauses.add(CLAUSE.transportTitle(L), CLAUSE.transport(L, toSite, fromSite));

  // Operator.
  //
  // 🔴 **THE NATIONALITY IS NOT PRINTED** (app parity, `kHiddenTermKeys`, 2026-09-21; owner, on the
  // app: *"remove operator nationality from all surfaces now, in request, bid, deal room"*). The
  // supplier still DECLARES it on the bid and the field is still stored — this is display only —
  // but the paper no longer states it, exactly as `live_quotation_document.dart` no longer does.
  // ⚠️ So a supplier who declared no certificate either gets the bare «operator included» sentence
  // rather than a specification he never gave, which is the fallback that was already here.
  const opIncluded = (sup.requestTerms.operatorIncluded ?? "").toUpperCase();
  if (opIncluded === "YES") {
    const cert = resolveTerm(src, "operator_certification");
    const detail = [cert].filter(Boolean).join(" · ");
    clauses.add(CLAUSE.operatorTitle(L), CLAUSE.operatorIncluded(L, detail || null), "operator_included");
  } else if (opIncluded === "NO") {
    clauses.add(CLAUSE.operatorTitle(L), CLAUSE.operatorNone(L), "operator_included");
  }

  // The safety certifications the RENTER asked for.
  const certCodes = sup.equipmentCertCodes?.length ? sup.equipmentCertCodes : sup.heldCertCodes;
  const certs = (certCodes ?? []).map((c) => (isAr ? CERT_LABEL[c]?.ar : CERT_LABEL[c]?.en)).filter(Boolean).join(isAr ? "، " : ", ");
  if (certs) clauses.add(CLAUSE.certsTitle(L), CLAUSE.certs(L, certs), "safety_certifications");

  // Attachments.
  const attachments = resolveTerm(src, "attachments");
  if (attachments) clauses.add(CLAUSE.attachmentsTitle(L), attachments, "attachments");

  // Contract terms.
  const payRaw = resolveTerm(src, "payment_terms");
  if (payRaw) clauses.add(CLAUSE.paymentTitle(L), CLAUSE.payment(L, src.value("payment_terms", payRaw)), "payment_terms");
  const sla = resolveTerm(src, "breakdown_response_sla");
  if (sla) clauses.add(CLAUSE.breakdownTitle(L), CLAUSE.breakdown(L, src.value("breakdown_response_sla", sla)), "breakdown_response_sla");
  const maint = partyWord(resolveTerm(src, "maintenance_responsibility"));
  if (maint) clauses.add(CLAUSE.maintenanceTitle(L), CLAUSE.maintenance(L, maint), "maintenance_responsibility");

  /**
   * Everything else the bid holds, so NO TERM IS MISSING (owner, 2026-09-18).
   *
   * ⚠️ An off-platform (shared-link) bid reaches none of the ladder above: it carries no T3
   * declarations and has no deal room, and its whole answer set lives on `terms.equipment` /
   * `terms.contract` as Yes/No confirmations of the renter's requirement. Those are folded in here,
   * which is the same promise by the only route that bid's data allows.
   */
  const extras: QuotationClause[] = sup.viaSharedLink ? [] : extraTermClauses(src, clauses.covered);
  if (sup.viaSharedLink) {
    const linkVal = (r: TermRow): string | null => {
      if (r.state === "grey") return null; // the renter never asked this term
      if (r.state === "conflict") return L("Not provided", "غير متوفّر"); // the supplier said No
      const d = (isAr ? r.detail?.ar : r.detail?.en) ?? "";
      const req = (isAr ? d.split(" · المؤجّر")[0].replace(/^المستأجر:\s*/, "") : d.split(" · Supplier")[0].replace(/^Renter:\s*/, "")).trim();
      return req && req !== "—" ? req : L("Confirmed", "مؤكّد");
    };
    const seen = new Set<string>();
    for (const e of entries) {
      for (const r of [...(e.bid.terms?.equipment ?? []), ...(e.bid.terms?.contract ?? [])]) {
        if (seen.has(r.key) || isHiddenDealRoomTermKey(r.key)) continue;
        const v = linkVal(r);
        if (!v) continue;
        seen.add(r.key);
        extras.push({ title: isAr ? r.labelAr : r.labelEn, body: v });
      }
    }
  }

  return {
    lang: input.lang,
    title: L("Quotation", "عرض سعر"),
    quotationNumber: input.quotationNumber,
    dateStr,
    // 🔴 The app's own five pairs, in its own order and its own wording (`_refPairs`). The REQUEST
    // number is NOT among them: it rides the signature strip, which is the one band on the sheet that
    // speaks for the platform rather than for the supplier.
    refs: [
      { label: "QUOTATION REF", value: input.quotationNumber },
      { label: L("Issue date", "تاريخ الإصدار"), value: dateStr },
      { label: L("Valid until", "صالح حتى"), value: fmtRefDate(validRaw) },
      { label: L("Work site", "موقع العمل"), value: input.workSite ?? "" },
      { label: L("Currency", "العملة"), value: sar },
    ],
    requestRef: input.reference ?? reqLabel,
    supportEmail: SUPPORT_EMAIL,
    supplier: {
      label: isAr ? "SUPPLIER / المورد" : "SUPPLIER",
      name: sup.supplierName,
      // The tick states a CHECKED company registration. An individual never gets one however much else
      // is on file — the document would be making a claim nobody made.
      verified: sup.verified === true && sup.compliance.entityType === "company",
      logoUrl: supLogo,
      rows: supplierRows,
    },
    rentee: {
      label: isAr ? "RENTER / المستأجر" : "RENTER",
      name: renteeName,
      verified: renteeVerified,
      logoUrl: renteeVerified ? input.rentee.logoUrl ?? null : null,
      asks: input.rentee.asks,
      rows: renteeRows,
    },
    lineItems,
    currency: sar,
    // Open-ended bids: reframe the grand row as the per-unit·period rate ("Total / unit · day") and note
    // the estimate, exactly like the app's live quotation. Committed durations show a real total.
    totals: allOpenEnded
      ? { subtotal: sub, vat, total, label: `${L("Total", "الإجمالي")} / ${L("unit", "وحدة")} · ${openPlabel}`, valueOverride: `${m2(openRate!)} ${sar}` }
      : { subtotal: sub, vat, total },
    sealUrl: input.sealUrl ?? null,
    clauses: [...clauses.out, ...extras],
    legal: quotationLegal(L),
    footer: {
      name: sup.supplierName,
      address: supAddress ?? null,
      crNumber: supCr ?? null,
      vatNumber: supVat ?? null,
      phone: supPhone ?? null,
      email: supEmail ?? null,
      logoUrl: supLogo,
    },
    amountWordsSuffix: allOpenEnded ? L("Estimate for one day · Final amount as operated", "تقدير ليوم واحد · المبلغ النهائي حسب التشغيل") : undefined,
    // ⚠️ The words follow the SUFFIX. An open-ended sheet is framed as an estimate for one period,
    // and the grand total folds in a mobilisation fee paid ONCE — spelling that out under that frame
    // states a per-period figure that is not one. The app resolves the same pair in `amountInWordsValue`.
    amountWordsValue: allOpenEnded ? openRate! * offeredUnits(head.bid) : undefined,
  };
}
