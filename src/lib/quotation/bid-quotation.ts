/**
 * ONE quotation *document* for a bid, shared by every renter-side download.
 *
 * `render.ts` is the template — it turns a finished `QuotationDoc` into HTML. This module is the layer
 * above it: it turns BIDS into that `QuotationDoc`. It exists because the template alone was not enough
 * to stop the surfaces drifting. `GroupBids` mapped bids → `QuotationDoc` inline, so `RequestBids`
 * (which has one request, not a group) could not reach that mapping and grew a SECOND, completely
 * separate HTML builder: no parties block, no terms cards, no legal clauses, no quotation reference —
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
 * column, the BILLABLE days in the quantity column, the divisor stated beside the total.
 */

import { CERT_LABEL, type BidCard, type TermRow } from "@/lib/contract/bids";
import { computeQuoteTotals, computeRentalTotal, divisorNote, rentalDivisor, VAT_RATE } from "@/lib/pricing/rental";
import {
  quotationLegal,
  type QLang,
  type QuotationCard,
  type QuotationDoc,
  type QuotationLineItem,
  type QuotationListedLine,
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
  /** The request line's citable code (`REQ-NNNNN`, else a short ref) — used in the Project-terms card. */
  requestCode: string;
  /** The rental window this bid was quoted against. `durationDays` null = open-ended ("as operated"). */
  startDate?: string | null;
  endDate?: string | null;
  durationDays?: number | null;
  /** The request's rental basis (daily / weekly / …), shown in the Project-terms card. */
  rentalType?: string | null;
  /** Who the REQUEST assigned each transport leg to — drives the "By rentee" reading of an unpriced leg. */
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
  /** Party-verified — gates the "✓ Verified" pill on a row with no value (app parity). */
  verified?: boolean;
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
  /** Issue date. Injectable so the document is deterministic under test. */
  now?: Date;
}

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
  const dateStr = now.toLocaleDateString(dateLocale, { day: "numeric", month: "long", year: "numeric" });
  const fmtRefDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" }) : "—";

  // ── Parties ──────────────────────────────────────────────────────────────────────────────────────
  // App parity (`_RenteeBlock` / `_partyHeader`): the company name is primary when the renter HAS a
  // company (gated on company presence, not on verification), with the person demoted to a subtitle.
  const renteeCompany = (input.rentee.companyName ?? "").trim();
  const renteeName = (renteeCompany || input.rentee.personName || "").trim() || L("Moedatech renter", "مستأجر معداتك");
  const renteePerson = renteeCompany ? input.rentee.personName || null : null;
  const renteeVerified = input.rentee.verified === true;

  // Off-platform submissions carry real CR/VAT/address VALUES; on-platform bids carry only verification
  // FLAGS → the shared renderer draws the app's value-or-"Verified"-pill row from exactly this shape.
  const ld = sup.linkDocs ?? {};
  const supIdRows = [
    { label: L("National Address", "العنوان الوطني"), value: ld.national ?? sup.supplierNationalAddress, verified: sup.verified },
    { label: L("CR #", "س.ت"), value: ld.commercial ?? sup.supplierCrNumber, verified: sup.verified },
    { label: L("VAT #", "ض.ق.م"), value: ld.vat ?? sup.supplierVatNumber, verified: sup.verified },
    { label: L("Phone", "الهاتف"), value: ld.contact ?? sup.supplierPhone }, // on-platform phone or off-platform contact
    ...(sup.compliance.entityType === "company" ? [{ label: L("Email", "البريد"), value: sup.supplierEmail }] : []), // company only, per app
  ];
  const renteeIdRows = [
    { label: L("National Address", "العنوان الوطني"), value: input.rentee.nationalAddress, verified: renteeVerified },
    { label: L("CR #", "س.ت"), value: input.rentee.crNumber, verified: renteeVerified },
    { label: L("VAT #", "ض.ق.م"), value: input.rentee.vatNumber, verified: renteeVerified },
    { label: L("Phone", "الهاتف"), value: input.rentee.phone },
    { label: L("Email", "البريد"), value: input.rentee.email },
  ];
  // App parity (UnverifiedIndividualIdentity): unverified individual suppliers get a subtitle.
  const supplierSub =
    sup.compliance.entityType === "individual" && !sup.verified
      ? L("Individual supplier · unverified", "مُورِّد فرد · غير موثَّق")
      : null;

  // ── Meta strip ───────────────────────────────────────────────────────────────────────────────────
  const validRaw = entries.map((e) => e.bid.validUntil).filter(Boolean).sort()[0] ?? null;
  const valid = fmtRefDate(validRaw);
  const reqIds = [...new Set(entries.map((e) => e.requestCode))];
  const reqLabel = reqIds.length === 1 ? reqIds[0] : `${reqIds[0]} +${reqIds.length - 1}`;

  // ── Line items ───────────────────────────────────────────────────────────────────────────────────
  const eqLine = (b: BidCard) => (b.equipment ? [b.equipment.make, b.equipment.model, b.equipment.year].filter(Boolean).join(" · ") : "—");
  // App rule (014 CR #141): the bid is priced per billing period; the unit count is NOT multiplied into
  // the rental (it is shown for information only). Open-ended → ∞ qty + one-period "as operated".
  const periodLabel = (u: string | null) => {
    switch ((u ?? "PER_DAY").toUpperCase()) {
      case "PER_WEEK": return L("week", "أسبوع");
      case "PER_MONTH": return L("month", "شهر");
      case "PER_JOB": return L("job", "مهمة");
      default: return L("day", "يوم");
    }
  };

  let sub = 0;
  let rowNum = 0;
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
    rowNum += 1;
    let lineSub: number, qtyCell: string, priceCell: string, totalCell: string, totalNote: string | null = null;
    // The rental now prorates through the SHARED module — ÷6 week, ÷26 month, Fridays excluded — and is
    // multiplied by the offered unit count, so this document totals the same deal the bid card beside it
    // and the deal room both total. It used to compute `(rate ÷ divisor) × calendarDays` for ONE unit:
    // it charged the Fridays, and it left every extra machine's rent out of a grand total whose
    // transport legs were already counted × units.
    const rental = computeRentalTotal({ rate, priceUnit: b.priceUnit, startDate: e.startDate ?? null, durationDays: durDays });
    if (durDays == null) {
      lineSub = rate; // open-ended: one-period PER-UNIT preview; billed "as operated" (app parity)
      qtyCell = "∞";
      priceCell = `${m2(rate)} / ${plabel}`;
      totalCell = `${m2(rate)} / ${plabel}`;
      totalNote = L("As operated", "حسب التشغيل");
      if (openRate == null) { openRate = rate; openPlabel = plabel; }
    } else if (dpp > 0) {
      anyCommitted = true;
      lineSub = rental.total * units;
      // Quantity is the BILLABLE days the rate is charged across, as the bid card's rental row states
      // it — not the calendar period count, which counted the Fridays out of the total.
      qtyCell = rental.raw
        ? `1 ${plabel}${units > 1 ? ` × ${units}` : ""}`
        : `${rental.billable} ${L("days", "يوم")}${units > 1 ? ` × ${units}` : ""}`;
      priceCell = `${m2(rate)} / ${plabel}`;
      // The divisor that turns the quoted rate into those days — printed whether or not this period
      // comes out exact (app parity: `rentalPeriodSubtitle`).
      totalNote = divisorNote(b.priceUnit, L);
      totalCell = m2(lineSub);
    } else {
      anyCommitted = true;
      lineSub = rate * units; // PER_JOB — a flat price, but every unit offered is rented
      qtyCell = String(units);
      priceCell = m2(rate);
      totalCell = m2(lineSub);
    }

    // THE transport legs. `computeQuoteTotals` is the shared leg maths: an excluded leg contributes
    // zero however much price is still stored against it, and a leg carries its OWN negotiated count
    // (defaulting to, and capped by, the rental count). Passing `perUnitRental: 0` asks it for the legs
    // ONLY — `lineSub` above already carries the rental across all units, and passing it here would
    // count it twice.
    const legTotals = computeQuoteTotals({
      perUnitRental: 0,
      rentalUnits: units,
      mob: { amount: b.mobPrice, units: b.mobUnits, excluded: b.mobExcluded },
      demob: { amount: b.demobPrice, units: b.demobUnits, excluded: b.demobExcluded },
    });
    const legQty = (excluded: boolean | undefined, own: number | null | undefined) =>
      excluded ? 0 : Math.min(own ?? units, units);
    const mobTotal = legTotals.overall.mob;
    const demobTotal = legTotals.overall.demob;
    sub += lineSub + mobTotal + demobTotal;

    lineItems.push({
      num: rowNum,
      label: `${L("Rental", "الإيجار")} — ${e.itemLabel}`,
      detail: eqLine(b) === "—" ? null : eqLine(b),
      unit: plabel,
      qty: qtyCell,
      price: priceCell,
      total: totalCell,
      totalNote,
    });

    // Every leg keeps a row (deal-room + app parity) — a real price when the supplier charges, else the
    // reason there is no charge. Never silently dropped, and never silently charged: EXCLUDED is checked
    // first, so a leg the parties struck out prints as struck out rather than as money owed.
    const logiRow = (
      label: string,
      leg: { price: number; total: number; qty: number; excluded: boolean; byRentee: boolean },
    ): QuotationLineItem => {
      if (leg.excluded) {
        return {
          num: null,
          label,
          detail: L("Excluded from the deal", "مستبعد من الصفقة"),
          unit: "—",
          qty: "—",
          price: "—",
          total: L("Excluded", "مستبعد"),
        };
      }
      return leg.price > 0
        ? { num: null, label, detail: e.itemLabel, unit: L("Trip", "رحلة"), qty: String(leg.qty), price: m2(leg.price), total: m2(leg.total) }
        : {
            num: null,
            label,
            detail: leg.byRentee ? L("Arranged by the rentee", "يُرتّبه المستأجر") : L("Included", "مشمول"),
            unit: "—",
            qty: "—",
            price: "—",
            total: leg.byRentee ? L("By rentee", "على المستأجر") : L("Included", "مشمول"),
          };
    };
    lineItems.push(
      logiRow(L("Delivery to site", "النقل إلى الموقع"), {
        price: b.mobPrice ?? 0,
        total: mobTotal,
        qty: legQty(b.mobExcluded, b.mobUnits),
        excluded: b.mobExcluded === true,
        byRentee: e.mobByRentee === true,
      }),
    );
    lineItems.push(
      logiRow(L("Return from site", "الإرجاع من الموقع"), {
        price: b.demobPrice ?? 0,
        total: demobTotal,
        qty: legQty(b.demobExcluded, b.demobUnits),
        excluded: b.demobExcluded === true,
        byRentee: e.demobByRentee === true,
      }),
    );
  }

  const vat = sub * VAT_RATE; // exact (not rounded) so the amount-in-words can show halalas — app parity
  const total = sub + vat;
  const allOpenEnded = !anyCommitted && openRate != null;

  // ── Terms cards ──────────────────────────────────────────────────────────────────────────────────
  const tfmt = {
    sla: (v: string | null) => { if (!v) return null; const m: Record<string, [string, string]> = { FOUR_HR: ["4 hours", "٤ ساعات"], EIGHT_HR: ["8 hours", "٨ ساعات"], TWENTY_FOUR_HR: ["24 hours", "٢٤ ساعة"], FORTY_EIGHT_HR: ["48 hours", "٤٨ ساعة"], SEVENTY_TWO_HR: ["72 hours", "٧٢ ساعة"] }; const x = m[v.toUpperCase()]; return x ? L(x[0], x[1]) : v; },
    overtime: (v: string | null) => { if (v == null) return null; const u = v.toUpperCase(); if (u === "0" || u === "WITHOUT") return L("None", "بدون"); if (u === "1.5X") return "1.5×"; if (u === "2X") return "2×"; return v; },
    maint: (v: string | null) => { if (!v) return null; const u = v.toLowerCase(); if (u === "supplier") return L("Supplier", "المؤجّر"); if (u === "renter" || u === "rentee") return L("Renter", "المستأجر"); return v; },
    payTerms: (v: string | null) => { if (!v) return null; const k = v.toLowerCase().replace(/[_-]/g, ""); const m: Record<string, [string, string]> = { upfront: ["Upfront", "مقدمًا"], daily: ["Daily", "يومي"], net0: ["Net 0", "فوري"], net30: ["Net 30 days", "صافي ٣٠ يومًا"], net60: ["Net 60 days", "صافي ٦٠ يومًا"], net90: ["Net 90 days", "صافي ٩٠ يومًا"], endofjob: ["End of job", "نهاية المهمة"] }; const x = m[k]; return x ? L(x[0], x[1]) : v; },
    fuel: (v: string | null) => { if (!v) return null; const m: Record<string, [string, string]> = { DIESEL: ["Diesel", "ديزل"], PETROL: ["Petrol", "بنزين"], ELECTRIC: ["Electric", "كهربائي"] }; const x = m[v.toUpperCase()]; return x ? L(x[0], x[1]) : v; },
    operator: (inc: string | null, nat: string | null) => { if (inc == null) return null; if (inc.toUpperCase() !== "YES") return L("No operator", "بدون مشغّل"); return L("Includes operator", "يشمل مشغّلاً") + (nat ? ` · ${L("Nationality", "الجنسية")}: ${nat}` : ""); },
  };
  // App parity: the equipment-terms section prints the required/held safety certifications.
  const eqCertsText = (b: BidCard) => {
    const cs = (b.heldCertCodes?.length ? b.heldCertCodes : b.equipmentCertCodes) ?? [];
    return cs.length ? cs.map((c) => (isAr ? CERT_LABEL[c]?.ar : CERT_LABEL[c]?.en)).filter(Boolean).join(" · ") : null;
  };

  // Listed equipment as an app-parity chip card (app's live_quotation_document _buildEquipmentIdentity
  // order): Type · Size · Brand · Model · Year · Fuel · Units. Type/Size are split out of the item
  // label; Brand/Model/Year from the offered equipment. (Category name isn't in the web bid payload —
  // only the id — so that one chip is omitted.)
  const listed: QuotationListedLine[] = entries.map((e) => {
    const b = e.bid;
    const eq = b.equipment;
    const segs = e.itemLabel.split(" · ").map((x) => x.trim()).filter(Boolean);
    const size = segs.length > 1 ? segs.slice(1).join(" · ") : null;
    const fuel = tfmt.fuel(b.requestTerms.fuelType);
    const chips: { label: string; value: string }[] = [];
    chips.push({ label: L("Type", "النوع"), value: segs[0] ?? e.itemLabel });
    if (size) chips.push({ label: L("Size", "المقاس"), value: size });
    if (eq?.make) chips.push({ label: L("Brand", "العلامة"), value: eq.make });
    if (eq?.model) chips.push({ label: L("Model", "الطراز"), value: eq.model });
    if (eq?.year) chips.push({ label: L("Year", "السنة"), value: String(eq.year) });
    if (fuel) chips.push({ label: L("Fuel", "الوقود"), value: fuel });
    chips.push({ label: L("Units offered", "الوحدات المعروضة"), value: String(offeredUnits(b)) });
    return {
      label: e.itemLabel,
      detail: eqLine(b),
      units: offeredUnits(b),
      verified: b.eqVerified,
      certs: b.heldCertCodes.map((c) => (isAr ? CERT_LABEL[c].ar : CERT_LABEL[c].en)),
      chips,
    };
  });

  const cards: QuotationCard[] = [];
  const projectRows = entries.map((e) => ({ label: e.requestCode, value: `${offeredUnits(e.bid)} × ${e.itemLabel}` }));
  projectRows.push({ label: L("Rental basis", "أساس الإيجار"), value: head.rentalType || "—" });
  projectRows.push({ label: L("Equipment lines", "بنود المعدات"), value: String(entries.length) });
  projectRows.push({ label: L("Total units", "إجمالي الوحدات"), value: String(entries.reduce((s2, e) => s2 + offeredUnits(e.bid), 0)) });
  cards.push({ title: L("Project terms", "شروط المشروع"), rows: projectRows });

  // App parity: the quotation shows the SUPPLIER's declared terms (not the renter's often-blank
  // request), with a "· Agreed" tag when the term was locked in the deal room. normKey form:
  // payment_terms→paymentterms, breakdown_response_sla→breakdownresponsesla, etc.
  const agBadge = (b: BidCard, nk: string) => ((b.agreedTermKeys ?? []).includes(nk) ? ` · ${L("Agreed", "متفق عليه")}` : "");
  const declaredNat = (b: BidCard) => b.declaredTerms?.operatorNationality ?? b.requestTerms.operatorNationality;
  const eqCert = (b: BidCard) => { const t = eqCertsText(b); return t ? t + agBadge(b, "safetycertifications") : null; };

  if (sup.viaSharedLink) {
    // Off-platform (shared-link form) bids carry the FULL set of submitted terms in terms.equipment /
    // terms.contract (each a Yes/No confirmation of the renter's requirement) — their
    // requestTerms/declaredTerms are blank. Render every term the renter asked, so the quotation
    // captures the whole bid form and not just the four the platform path renders.
    const linkVal = (r: TermRow): string | null => {
      if (r.state === "grey") return null; // renter didn't ask this term → omit
      if (r.state === "conflict") return L("Not provided", "غير متوفّر"); // supplier said No
      // Confirmed: show the requested value the supplier committed to (parsed from the row's
      // "Renter: X · Supplier: Yes" detail), falling back to a plain "Confirmed".
      const d = (isAr ? r.detail?.ar : r.detail?.en) ?? "";
      const req = (isAr ? d.split(" · المؤجّر")[0].replace(/^المستأجر:\s*/, "") : d.split(" · Supplier")[0].replace(/^Renter:\s*/, "")).trim();
      return req && req !== "—" ? req : L("Confirmed", "مؤكّد");
    };
    const collect = (pick: (b: BidCard) => TermRow[] | undefined) => {
      const seen = new Set<string>();
      const rows: { label: string; value: string }[] = [];
      for (const e of entries) for (const r of pick(e.bid) ?? []) {
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
    if (entries.length === 1) {
      addEq(L("Operator", "المشغّل"), tfmt.operator(sup.requestTerms.operatorIncluded, declaredNat(sup)));
      addEq(L("Equipment safety certifications", "شهادات سلامة المعدة"), eqCert(sup));
      addEq(L("Fuel type", "نوع الوقود"), tfmt.fuel(sup.requestTerms.fuelType));
    } else {
      for (const e of entries) {
        const parts = [tfmt.operator(e.bid.requestTerms.operatorIncluded, declaredNat(e.bid)), eqCert(e.bid), tfmt.fuel(e.bid.requestTerms.fuelType)].filter(Boolean).join(" · ");
        if (parts) eqRows.push({ label: e.itemLabel, value: parts });
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

  return {
    lang: input.lang,
    title: L("Equipment rental quotation", "عرض سعر تأجير معدات"),
    quotationNumber: input.quotationNumber,
    dateStr,
    // Verified status shows on the CR/VAT rows ("✓ Verified"), so no standalone party chip (it rendered
    // only under the supplier — never the rentee — and read as an orphan badge).
    supplier: { label: L("Supplier", "المؤجِّر"), name: sup.supplierName, sub: supplierSub, idRows: supIdRows, chips: [] },
    rentee: { label: L("Rentee", "المُستأجِر"), name: renteeName, sub: renteePerson, idRows: renteeIdRows, chips: [] },
    meta: [
      { label: L("Request #", "رقم الطلب"), value: input.reference ?? reqLabel },
      { label: L("Issue date", "تاريخ الإصدار"), value: dateStr },
      { label: L("Valid until", "صالح حتى"), value: valid },
      { label: L("Rental start", "بدء الإيجار"), value: fmtRefDate(head.startDate) },
      { label: L("Rental end", "نهاية الإيجار"), value: fmtRefDate(head.endDate) },
      { label: L("Currency", "العملة"), value: L("SAR · Saudi Riyal", "SAR · ريال سعودي") },
    ],
    listed,
    lineItems,
    currency: sar,
    // Open-ended bids: reframe the grand row as the per-unit·period rate ("Total / unit · day") and note
    // the estimate, exactly like the app's live quotation. Committed durations show a real total.
    totals: allOpenEnded
      ? { subtotal: sub, vat, total, label: `${L("Total", "الإجمالي")} / ${L("unit", "وحدة")} · ${openPlabel}`, valueOverride: `${m2(openRate!)} ${sar}` }
      : { subtotal: sub, vat, total },
    cards,
    legal: quotationLegal(L),
    amountWordsSuffix: allOpenEnded ? L("Estimate for one day · Final amount as operated", "تقدير ليوم واحد · المبلغ النهائي حسب التشغيل") : undefined,
  };
}
