/**
 * web-app/request-details-bids — deal-room wire types + mapper.
 * Source: app backend `GET /api/deal-rooms/{id}` (deal-room.service.getDealRoom). The renter is the
 * rentee party. Live chat runs over GetStream (channel = streamChannelId; token via stream-token).
 */
import { computeRentalTotal, divisorNote, rentalDivisor, VAT_RATE } from "@/lib/pricing/rental";
import { cityLabel, urgencyLabel, rentalTypeLabel, fulfillmentLabel, termValueLabel } from "@/lib/contract/labels";
// Type-only — the deal-room quotation BUILDER lives here (pure, testable in the node suite); the
// rendering itself stays in the shared template module.
import type { QuotationDoc, QuotationLineItem, QuotationCard } from "@/lib/quotation/render";

export type DealRoomStatus = "OPEN" | "NEGOTIATING" | "AWAITING_SUPPLIER_CONFIRMATION" | "CLOSED" | "ABANDONED" | string;

export interface DealParty {
  id: number | null;
  name: string;
  isVerified: boolean;
  /** Contact number. Server-gated: supplier.phone is always present; rentee.phone only once CLOSED. */
  phone: string | null;
}

export type TermState = "fixed" | "soft_accepted" | "disputed" | "pending" | "agreed" | string;

/**
 * WHERE a term's current value came from (app parity: `TermSource`).
 *
 * The three reference values a term carries — the renter's preference, the supplier's declaration and
 * the platform default — are all shown, but only ONE of them is the value in force. Without this the
 * renter reads three numbers and has to infer which one binds him; with it the row says so.
 *
 * Unknown strings fall back to `platform_default`, as the app's `TermSource.fromString` does: an
 * unrecognised provenance is the weakest claim, not a stronger one.
 */
export type TermSource = "rentee_fixed" | "supplier_declared" | "platform_default";

const TERM_SOURCES = new Set<string>(["rentee_fixed", "supplier_declared", "platform_default"]);
export const asTermSource = (v: unknown): TermSource =>
  typeof v === "string" && TERM_SOURCES.has(v) ? (v as TermSource) : "platform_default";

/**
 * One recorded move on a term (backend `history[]`).
 *
 * `action` is the backend's own verb — `counter`, `accept`, `propose_update` — and `by` the side that
 * made it. Neither is narrowed to a union: an action the web does not recognise is still shown, under
 * its raw name, rather than dropped. A move the renter cannot read beats a move he cannot see.
 */
export interface TermHistoryEntry {
  action: string;
  by: string;
  value: unknown;
  /** ISO-8601, as it arrived. Never parsed at map time — a bad date must not cost the whole term. */
  at: string;
}

/**
 * The last move on a term, or null when it has never moved.
 *
 * The app shows exactly this one line ("Countered: 30 days · Mar 4") rather than a full log: a term
 * that has gone back and forth three times is still decided on its LATEST position, and the whole
 * thread already lives in the conversation.
 *
 * Ordered by `at` rather than by array position — the backend appends in order today, and this does
 * not depend on it continuing to. Entries with an unparseable `at` sort oldest, so a malformed
 * timestamp cannot promote a stale move over a real one.
 */
export function lastTermMove(term: Pick<DealTerm, "history">): TermHistoryEntry | null {
  let best: TermHistoryEntry | null = null;
  let bestAt = -Infinity;
  for (const h of term.history) {
    const t = Date.parse(h.at);
    const at = Number.isNaN(t) ? -Infinity : t;
    if (best === null || at >= bestAt) { best = h; bestAt = at; }
  }
  return best;
}

/** One negotiable term in the deal room (mirrors the app's term list). */
export interface DealTerm {
  key: string;
  label: string;
  labelAr: string;
  state: TermState;
  value: unknown;
  renteePreference: unknown;
  supplierDeclared: unknown;
  /** The platform's default/fallback value for this term (app parity — shown as a third reference row). */
  platformDefault: unknown;
  /** Which of the three reference values is the one in force. See `TermSource`. */
  source: TermSource;
  /** Every recorded move on this term, oldest-first as the backend sends it. Empty when untouched. */
  history: TermHistoryEntry[];
  /** Mandatory terms must be resolved to close the deal (app shows a red "Mandatory" badge). */
  isMandatory: boolean;
  itemLabel: string | null;
  /** Inline choices for this term (from the resolved T3 platform default) — drives the pill picker
   *  when countering a non-binary / non-price term. */
  options: { value: string; labelEn: string; labelAr: string }[];
}

export interface DealRoomView {
  id: string;
  /**
   * **The BID this room settles** (owner, 2026-08-11: *"i want it like request card"*).
   *
   * `DealRoom.bidId` is `@unique` — one bid = one item = one room = one Stream channel — so the room
   * resolves exactly one bid, and every bid-scoped read the room needs is addressed by it. The one
   * that made this field necessary is `GET /marketplace/bids/{bidId}/fleet`: the request cards in
   * this conversation name a machine by `equipmentId` and nothing on the wire carries its NAME, so
   * without the fleet the deal room could only render the generic key/value form the ruling replaced.
   *
   * Null when the payload does not carry it. Never fabricated from the room id — a wrong bid id would
   * fetch ANOTHER supplier's fleet and put his machines' names on this conversation's cards, which is
   * worse in every direction than the fleet-less fallback.
   */
  bidId: string | null;
  status: DealRoomStatus;
  contractType: string | null;
  streamChannelId: string | null;
  renteeId: number | null;
  supplierId: number | null;
  supplier: DealParty;
  /** Current price (last proposed in the room, falling back to the original bid). */
  rate: number | null;
  mobPrice: number | null;
  demobPrice: number | null;
  /** Mobilization/demobilization RESPONSIBILITY (from the request item). When true the rentee arranges
   *  it (supplier charges nothing) — the quotation must still state it. */
  mobByRentee: boolean | null;
  demobByRentee: boolean | null;
  periods: number | null;
  priceUnit: string | null;
  /**
   * The PRICE-BASIS unit count — `agreedUnits ?? bid.unitsOffered.length ?? request.numberOfUnits`
   * (see the assignment, `priceUnits`), NOT the count the RFQ asked for. The rate is per-unit, so the
   * rental total multiplies by this, matching the bid cards, the quotations and the backend deal
   * quotation, all of which scale by what the SUPPLIER offered rather than what was requested.
   *
   * The requested count is `requestedUnits` on this same view. The two differ on every partial bid, so
   * the old "units the RFQ asked for" comment named the wrong one of the two fields (AC-191).
   * Deliberately NOT renamed — every consumer reads it as the price basis already.
   */
  numberOfUnits: number;
  // ── deal-room/negotiation — per-type units + leg exclusion (shared backend) ──
  /** Matched RENTAL count (drives coverage); `null` = single-supplier/single-unit "full request". */
  agreedUnits: number | null;
  /** Matched mob/demob unit counts (each ≤ rental); `null` = not yet negotiated. */
  mobUnits: number | null;
  demobUnits: number | null;
  /** Persisted leg exclusion (both-sided) — render the excluded state from these, NOT local UI state. */
  mobExcluded: boolean;
  demobExcluded: boolean;
  /** The requested rental count — the stepper cap for all three unit types (both roles). */
  requestedUnits: number;
  /** Request short code (REQ-NNNNN) for the room header label. */
  shortCode: string | null;
  /**
   * The request this room settles. Top-level on the payload and dropped by this mapper until now.
   *
   * Needed to reach the rest of a multi-item submission: a renter who posted three items and got bids
   * from one supplier has three rooms with that firm, and nothing here could name the other two.
   */
  requestId: string | null;
  /** The submission group, when the payload carries it. Null is "unknown", NOT "no group" — the field
   *  is absent on some responses, so a caller must look it up before concluding there are no siblings. */
  requestGroupId: string | null;
  /** Who made the last counter ("rentee" | "supplier" | null). The renter is the rentee. */
  lastCounterBy: string | null;
  /** Convenience: is it the renter's turn to act (accept/counter)? */
  myTurn: boolean;
  /** Negotiable terms (excluding the implicit PRICE term, which the rate card handles). */
  terms: DealTerm[];
  /** True when a non-PRICE term is still disputed — the backend blocks accept-all until resolved. */
  hasDisputedTerms: boolean;
  /** True when the supplier opened the room first (chatted before the renter entered) — drives the
   *  "Supplier started this conversation" banner. Pairs with status==="OPEN" before the renter enters. */
  supplierFirstEntry: boolean;
  /** Structured rental/equipment/operator details from the request item — surfaced on the quotation
   *  (the negotiated Agreed/Fixed terms are separate). All optional; the quotation skips empty rows. */
  details: DealItemDetails;
}

/** Request-item details for the quotation (mapped tolerantly from the raw deal-room payload's
 *  `request` + `equipmentItems[0]`; field names best-effort, empties dropped by the renderer). */
export interface DealItemDetails {
  equipmentLabel: string | null;
  equipmentLabelAr: string | null;
  /** Capacity/size (e.g. "30 ton") — shown next to the equipment name, mirroring the request/bid cards. */
  equipmentSize: string | null;
  equipmentSizeAr: string | null;
  location: string | null;
  rentalType: string | null;
  startDate: string | null;
  endDate: string | null;
  workingHoursPerDay: number | null;
  workingDaysPerWeek: number | null;
  fulfillment: string | null;
  urgency: string | null;
  subletting: boolean | null;
  localContent: boolean | null;
  overtimeRate: string | null;
  additionalNotes: string | null;
  extendable: boolean | null;
  operatorIncluded: boolean | null;
  operatorNationality: string | null;
  numberOfOperators: number | null;
  nightShift: boolean | null;
  equipmentCerts: string[];
  operatorCerts: string[];
}

const n = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && !Number.isNaN(x) ? x : null;
};
const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/**
 * One document the renter can view in the deal room. The backend (`GET /api/deal-rooms/{id}/documents`)
 * returns the OTHER party's documents only — for the renter (rentee), that's the supplier's company
 * docs (CR, municipal license, insurance) and equipment docs (TÜV/SPSP/istimara/… + photos).
 * `url` is a backend presigned link; `fileType` is "pdf" or "image".
 */
export interface DealRoomDocument {
  type: string;
  label: string;
  labelAr: string | null;
  url: string;
  fileType: "pdf" | "image" | string;
}

/** Two groups, matching the app's documents sheet. */
export interface DealRoomDocuments {
  companyDocuments: DealRoomDocument[];
  equipmentDocuments: DealRoomDocument[];
}

function mapDoc(raw: Record<string, unknown>): DealRoomDocument {
  return {
    type: s(raw.type) ?? "",
    label: s(raw.label) ?? s(raw.type) ?? "Document",
    labelAr: s(raw.labelAr),
    // The signed link is normally `url`; `toSignedStructured`-based payloads put it under `key`.
    url: s(raw.url) ?? s(raw.key) ?? "",
    fileType: s(raw.fileType) ?? "pdf",
  };
}

/**
 * The official quotation for a closed deal (app parity — `GET /api/deal-rooms/{id}/quotation`). The
 * backend generates the PDF from an admin-configured template and stores it in S3; `pdfUrl` is a
 * fresh presigned download link. `pdfStatus` is `PENDING` while the PDF is still being generated
 * (the app polls until it's ready), then ready.
 */
/** Terms the APP hides from EVERY deal-room term surface (`kHiddenDealRoomTermKeys`) — hidden here for
 *  parity so the web never renders rows / phantom conflicts the app suppresses. PRICE + mob/demob
 *  PRICING are priced line items (settled on the counter Price page); the rest are handled elsewhere or
 *  RETIRED on the deal-room surface (certs, operator nationality, payment method, offer duration, the
 *  legacy combined `fat`, mobilization lead time, fulfillment type, required attachments).
 *
 *  ⚠ Applied at PARSE on BOTH payloads, exactly as the app applies it. `Quotation.agreedTerms` was
 *  snapshotted at close and is never rewritten, so every deal closed BEFORE the retirement still carries
 *  `operator_nationality` and `safety_certifications` in its snapshot. Filtering only the live room left
 *  the web printing those two on the quotation while the app printed neither — one contract, two
 *  documents. */
export const HIDDEN_DEAL_ROOM_TERM_KEYS = new Set<string>([
  "PRICE", "mobilization_pricing", "demobilization_pricing",
  "fulfillment_type", "required_attachments", "mobilization_lead_time",
  "operator_nationality", "operator_certification", "safety_certifications",
  "fat", "payment_method", "offer_duration",
]);

/** Case-insensitive membership, matching the app's `kHiddenDealRoomTermKeys.contains(k.toLowerCase())`,
 *  so a payload that cases a key differently can't smuggle a retired term onto the paper. */
export const isHiddenDealRoomTermKey = (key: string): boolean =>
  HIDDEN_DEAL_ROOM_TERM_KEYS.has(key) || HIDDEN_DEAL_ROOM_TERM_KEYS.has(key.toLowerCase());

/** One agreed term snapshotted on the confirmed Quotation row (backend `agreedTerms` JSON). */
export interface QuotationTerm {
  key: string;
  label: string;
  labelAr: string;
  value: unknown;
}

export interface QuotationView {
  pdfUrl: string | null;
  pdfStatus: string | null;
  quotationNumber: string | null;
  // Agreed snapshot from the Quotation row — the server PDF is DISABLED, so the web renders the
  // quotation client-side from these (+ the DealRoomView) the way the app does (extractQuotationData).
  agreedRate: number | null;
  priceUnit: string | null;
  contractType: string | null;
  agreedTerms: QuotationTerm[];
  renteePhone: string | null;
  supplierPhone: string | null;
  renteeEmail: string | null;
  supplierEmail: string | null;
}

export function mapQuotation(raw: unknown): QuotationView {
  const q = (raw ?? {}) as Record<string, unknown>;
  const agreedTermsRaw = Array.isArray(q.agreedTerms) ? (q.agreedTerms as Record<string, unknown>[]) : [];
  return {
    pdfUrl: s(q.pdfUrl),
    pdfStatus: s(q.pdfStatus),
    // The backend Quotation model has no human quotation number — fall back to its id (uuid) so the
    // doc still carries a stable reference. (/web:link-backend deal-room: quotationNumber gap.)
    quotationNumber: s(q.quotationNumber) ?? s(q.number) ?? s(q.id),
    agreedRate: n(q.agreedRate),
    priceUnit: s(q.priceUnit),
    contractType: s(q.contractType),
    // Retired/hidden keys are stripped HERE, at parse, the way the app strips them
    // (`DealRoomModel.fromJson`). The snapshot is frozen at close, so a deal closed before the
    // retirement still carries them in its JSON — this filter is what stops one contract rendering two
    // different documents on the two surfaces.
    agreedTerms: agreedTermsRaw
      .map((t) => ({
        key: s(t.key) ?? "",
        label: s(t.label) ?? s(t.key) ?? "",
        labelAr: s(t.labelAr) ?? s(t.label) ?? "",
        value: t.value,
      }))
      .filter((t) => !isHiddenDealRoomTermKey(t.key)),
    renteePhone: s(q.renteePhone),
    supplierPhone: s(q.supplierPhone),
    renteeEmail: s(q.renteeEmail),
    supplierEmail: s(q.supplierEmail),
  };
}

/**
 * WHEN the rentee's quotation link shows, and WHICH document it is (app parity —
 * `quotation_button.dart`, pinned below the deal room's chat composer).
 *
 * Available at EVERY status except ABANDONED (an abandoned room has no deal to quote); no verification
 * and no tier gate. The two labels are the whole point of the distinction:
 *
 *   • CLOSED → `final`. The deal is signed.
 *   • before → `preview`. **An agreed price is not a closed deal** — the supplier still has to confirm.
 *     An unlabelled "quotation" mid-negotiation is how a rentee concludes the deal is done and stops
 *     chasing it, so the label has to carry that on its own.
 *
 * The web used to offer the quotation only once CLOSED, on both entry points.
 */
export type QuotationLinkKind = "preview" | "final";

export function quotationLinkKind(status: DealRoomStatus): QuotationLinkKind | null {
  if (status === "ABANDONED") return null;
  return status === "CLOSED" ? "final" : "preview";
}

export function mapDealRoomDocuments(raw: unknown): DealRoomDocuments {
  const r = (raw ?? {}) as Record<string, unknown>;
  const company = Array.isArray(r.companyDocuments) ? (r.companyDocuments as Record<string, unknown>[]) : [];
  const equipment = Array.isArray(r.equipmentDocuments) ? (r.equipmentDocuments as Record<string, unknown>[]) : [];
  return {
    companyDocuments: company.map(mapDoc).filter((d) => d.url),
    equipmentDocuments: equipment.map(mapDoc).filter((d) => d.url),
  };
}

// Proration now comes from the shared pricing module (monthly ÷26, weekly ÷6, Fridays excluded) so the
// deal room, the comparison and the quotation cannot drift apart. The local ÷7 table this replaced was
// one of three copies on the web, and the only one mobile never agreed with.

export interface DealTotals {
  rate: number; priceUnit: string; perDayRate: number;
  rentalUnits: number; mobUnitsN: number; demobUnitsN: number;
  mobPrice: number; demobPrice: number; mobExcluded: boolean; demobExcluded: boolean;
  periods: number; hasDuration: boolean; periodCount: number;
  /**
   * Days actually charged — the duration minus its Fridays. This, NOT `periods`, is the number every
   * surface must show beside the rate: `rentalTotal` is `(rate ÷ divisor) × billableDays × units`, so a
   * label built from the raw duration states an arithmetic the total does not follow. 0 when the rental
   * did not prorate (see `rentalRaw`).
   */
  billableDays: number;
  /** True when `rentalTotal` is the bare quoted rate — no duration, no start date, PER_JOB, or a
   *  collapsed window. Nothing prorated, so no day count is shown. */
  rentalRaw: boolean;
  /**
   * The rental for ONE machine — `rentalTotal ÷ rentalUnits`, but returned rather than divided back
   * out, because it is what the function computes first and the division is a place for a rounding
   * error to enter.
   *
   * Exposed for the price breakdown, which states its lines PER UNIT the way the bid card does
   * (owner, 2026-08-19), then totals them across the count. Every other figure the per-unit block
   * needs is `computeQuoteTotals`' from this one number, so the two surfaces reach the same rows
   * through the same function instead of each dividing the totals by hand.
   */
  perUnitRental: number;
  rentalTotal: number; mobTotal: number; demobTotal: number;
  subtotal: number; vat: number; grand: number;
}

/** SINGLE source of truth for deal-room money — used by BOTH the live price bar and the confirmed
 *  quotation so they can never drift (app parity: computeDealTotals). Prorated ÷26/÷7; PER_JOB and
 *  no-duration = one full period (rate × units); mob/demob use their OWN unit counts and honor leg
 *  exclusion; VAT 15%. `override` lets the quotation pass the agreed rate / price unit, or a single
 *  negotiation round pass its full snapshot (rate + prices + per-type units + exclusion). */
export function computeDealTotals(
  /** Only the price basis, not a whole room — so the equipment-verification surface's footer (spec 004
   *  §6.10, V12) can price a bid that has **no room yet** from the bid's own figures, using this one
   *  function rather than a second implementation that would eventually disagree with it. */
  room: Pick<
    DealRoomView,
    | "rate" | "priceUnit" | "periods" | "agreedUnits" | "numberOfUnits"
    | "mobUnits" | "demobUnits" | "mobPrice" | "demobPrice" | "mobExcluded" | "demobExcluded"
  > & {
    /** The Friday anchor. On a real `DealRoomView` it lives under `details`; callers that synthesize a
     *  basis (the map's price footer prices a bid with no room yet) pass it at the top level instead.
     *  Read BOTH — reading only the root silently returned undefined for every real room, which made
     *  the deal room stop prorating and quietly show the raw rate. */
    startDate?: string | null;
    details?: { startDate?: string | null } | null;
  },
  override?: {
    rate?: number | null; priceUnit?: string | null;
    mobPrice?: number | null; demobPrice?: number | null;
    rentalUnits?: number | null; mobUnits?: number | null; demobUnits?: number | null;
    mobExcluded?: boolean; demobExcluded?: boolean;
  },
): DealTotals {
  const pick = <T,>(o: T | null | undefined, fb: T): T => (o == null ? fb : o);
  const rate = override?.rate ?? room.rate ?? 0;
  const priceUnit = (override?.priceUnit ?? room.priceUnit ?? "PER_DAY").toUpperCase();
  const dpp = rentalDivisor(priceUnit) || 1;
  const hasDuration = room.periods != null && room.periods > 0;
  const periods = hasDuration ? (room.periods as number) : dpp; // duration in DAYS; no duration = one full period
  const rentalUnits = pick(override?.rentalUnits, room.agreedUnits ?? room.numberOfUnits ?? 1);
  // NOT capped at the rental count. The app's `effectiveMobUnits` is `mobExcluded ? 0 : (mobUnits ??
  // numberOfUnits)` with no clamp, so a room carrying 5 mob trips against 3 rented machines billed 5
  // there and 3 here. The negotiated leg count is charged as negotiated.
  const mobUnitsN = pick(override?.mobUnits, room.mobUnits ?? rentalUnits);
  const demobUnitsN = pick(override?.demobUnits, room.demobUnits ?? rentalUnits);
  const perDayRate = rate / dpp;
  // Shared Friday-excluded proration. With no start date it returns the raw rate rather than a
  // Friday-blind total, so the room never shows a number the app wouldn't.
  //
  // On a real `DealRoomView` the Friday anchor lives under `details`, NOT at the root — reading the
  // root ALONE silently evaluates to undefined, which turns proration off and shows the raw rate on
  // every room. The root is accepted first only for callers that pass the room flattened; the
  // `details` fallback is what actually fires in the app.
  const startDate = room.startDate ?? room.details?.startDate ?? null;
  // NO DURATION IS NOT A ONE-PERIOD WINDOW. The app's `rentalLineTotal` returns `rate × units` outright
  // for an open deal (`durationDays == null → open mode`), and this used to say the same in its comment
  // — but it synthesised `periods = divisor` and fed that to the shared module, which then struck the
  // Fridays out of a window nobody had booked. A 30,000/month open deal over 2 units read 53,077 where
  // the app read 60,000. The rate IS the period here; there is nothing to prorate over.
  const rental = hasDuration
    ? computeRentalTotal({ rate, priceUnit, startDate, durationDays: periods })
    : { total: rate, billable: 0, raw: true, exact: true };
  const perUnitRental = rental.total;
  const rentalTotal = perUnitRental * rentalUnits;
  const mobPrice = pick(override?.mobPrice, room.mobPrice ?? 0);
  const demobPrice = pick(override?.demobPrice, room.demobPrice ?? 0);
  const mobExcluded = override?.mobExcluded ?? room.mobExcluded === true;
  const demobExcluded = override?.demobExcluded ?? room.demobExcluded === true;
  const mobTotal = mobExcluded ? 0 : mobPrice * mobUnitsN;
  const demobTotal = demobExcluded ? 0 : demobPrice * demobUnitsN;
  const subtotal = rentalTotal + mobTotal + demobTotal;
  const vat = Math.round(subtotal * VAT_RATE);
  const grand = subtotal + vat;
  // Period count is derived from the BILLABLE days, not the calendar duration: a 61-day monthly job
  // charges ~53 days, which is 2.04 months of rent, not the 2.35 the calendar suggests. The old raw
  // figure disagreed with `rentalTotal` by exactly the Fridays.
  return { rate, priceUnit, perDayRate, rentalUnits, mobUnitsN, demobUnitsN, mobPrice, demobPrice, mobExcluded, demobExcluded, periods, hasDuration, periodCount: (rental.raw ? periods : rental.billable) / dpp, billableDays: rental.raw ? 0 : rental.billable, rentalRaw: rental.raw, perUnitRental, rentalTotal, mobTotal, demobTotal, subtotal, vat, grand };
}

export function mapDealRoom(raw: unknown): DealRoomView {
  const d = (raw ?? {}) as Record<string, unknown>;
  const sup = (d.supplier ?? {}) as Record<string, unknown>;
  const bid = (d.bid ?? {}) as Record<string, unknown>;
  const status = (s(d.status) as DealRoomStatus) ?? "NEGOTIATING";
  const lastCounterBy = s(d.lastCounterBy);
  // Rentee's turn (app parity, deal_card_vm.dart): the renter can act whenever the deal is live and the
  // last move wasn't theirs — that INCLUDES an OPEN room (the opening bid on the table, no counter yet),
  // not just NEGOTIATING. Terminal (CLOSED/ABANDONED) and AWAITING_SUPPLIER_CONFIRMATION are not actionable.
  const myTurn = (status === "OPEN" || status === "NEGOTIATING") && lastCounterBy !== "rentee";

  // Terms — surface the negotiable ones (drop PRICE; the rate card owns it). Keep the rest so the
  // renter can see matches and resolve any differing (disputed) term before accepting all.
  const rawTerms = Array.isArray(d.terms) ? (d.terms as Record<string, unknown>[]) : [];
  // Hide exactly the keys the app strips from the deal-room terms table (HIDDEN_DEAL_ROOM_TERM_KEYS):
  // priced line items (mob/demob pricing settle on the counter Price page) + keys handled elsewhere or
  // retired on the deal-room surface (certs, operator nationality, payment method, offer duration, the
  // legacy combined `fat`, mobilization lead time, fulfillment type, required attachments). This matches
  // the app 1:1 so the web never shows extra rows or a phantom `fat`/cert conflict.
  const terms: DealTerm[] = rawTerms
    .filter((t) => !isHiddenDealRoomTermKey(s(t.key) ?? ""))
    .map((t) => ({
      key: s(t.key) ?? "",
      label: s(t.label) ?? s(t.key) ?? "",
      labelAr: s(t.labelAr) ?? s(t.label) ?? "",
      state: (s(t.state) as TermState) ?? "pending",
      value: t.value,
      renteePreference: t.renteePreference,
      supplierDeclared: t.supplierDeclared,
      platformDefault: t.platformDefault ?? t.platform_default ?? t.defaultValue ?? null,
      source: asTermSource(t.source),
      // Entries missing an action or a timestamp are DROPPED, not defaulted: the hint reads
      // "<action>: <value> · <date>", and a row that cannot say what happened or when says nothing.
      // The value itself may legitimately be absent (an `accept` carries no new one).
      history: (Array.isArray(t.history) ? (t.history as Record<string, unknown>[]) : [])
        .filter((h) => s(h.action) && s(h.at))
        .map((h) => ({ action: s(h.action) ?? "", by: s(h.by) ?? "", value: h.value, at: s(h.at) ?? "" })),
      isMandatory: t.isMandatory === true || t.mandatory === true,
      itemLabel: s(t.itemLabel),
      options: (Array.isArray(t.options) ? (t.options as Record<string, unknown>[]) : []).map((o) => ({
        value: s(o.value) ?? "",
        labelEn: s(o.labelEn) ?? s(o.label) ?? s(o.value) ?? "",
        labelAr: s(o.labelAr) ?? s(o.labelEn) ?? s(o.value) ?? "",
      })),
    }));
  const hasDisputedTerms = terms.some((t) => t.state === "disputed");

  // Price-basis units (app parity: quotation.service extractQuotationData) — the deal total scales by
  // the SUPPLIER'S OFFERED count, NOT the requested count. Precedence: agreedUnits → bid.unitsOffered
  // length → request numberOfUnits → 1.
  const reqObj = (d.request ?? {}) as Record<string, unknown>;
  const firstReqItem = (Array.isArray(reqObj.equipmentItems) ? (reqObj.equipmentItems as Record<string, unknown>[])[0] : undefined) ?? {};
  const requestedUnits = n(firstReqItem.numberOfUnits) ?? 1;
  const offeredUnits = Array.isArray(bid.unitsOffered) && bid.unitsOffered.length > 0 ? bid.unitsOffered.length : null;
  const priceUnits = n(d.agreedUnits) ?? offeredUnits ?? requestedUnits;

  // Structured item details for the quotation — read from the item first, then the request. Field
  // names are best-effort (tolerant fallbacks); the quotation renderer skips whatever comes back empty.
  const pick = (...keys: string[]): unknown => {
    for (const k of keys) {
      if (firstReqItem[k] != null && firstReqItem[k] !== "") return firstReqItem[k];
      if (reqObj[k] != null && reqObj[k] !== "") return reqObj[k];
    }
    return null;
  };
  const bl = (v: unknown): boolean | null => (typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : null);
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);
  // getDealRoom sends the request item's taxonomy as IDs only (no subtype/capacity names, unlike the bid
  // list), so fall the equipment label back to the accepted bid's actual equipment (make + model). The
  // app resolves the IDs from its taxonomy cache; the web has none here, so this is the sync source.
  const bidEq = (bid.equipment ?? {}) as Record<string, unknown>;
  const bidEqLabel = [s(bidEq.manufacturer), s(bidEq.modelName)].filter(Boolean).join(" ") || null;
  const details: DealItemDetails = {
    // Equipment name = subtype (matches the request/bid cards); capacity = size. Fall back to the older
    // keys, then to the accepted bid's equipment (make + model) since getDealRoom omits taxonomy names.
    equipmentLabel: s(pick("subtypeName", "label", "equipmentName", "name", "subcategoryName", "categoryName")) ?? bidEqLabel,
    equipmentLabelAr: s(pick("subtypeNameAr")),
    equipmentSize: s(pick("capacityName", "size", "capacity")),
    equipmentSizeAr: s(pick("capacityNameAr")),
    // getDealRoom exposes the site as `projectAddressLabel`.
    location: s(pick("location", "city", "projectLocation", "siteLocation", "deliveryLocation", "projectAddressLabel", "projectAddress")),
    rentalType: s(pick("rentalType", "rentalBasis")),
    startDate: s(pick("startDate", "deliveryDate", "estimatedStartDate", "requiredDate")),
    endDate: s(pick("endDate", "returnDate")),
    workingHoursPerDay: n(pick("workingHoursPerDay", "workingHours")),
    workingDaysPerWeek: n(pick("workingDaysPerWeek", "workingDays")),
    fulfillment: s(pick("fulfillmentType", "fulfillment")),
    urgency: s(pick("urgency", "urgencyLevel")),
    subletting: bl(pick("subletting", "sublettingAllowed")),
    localContent: bl(pick("localContent", "localContentRequired", "requiresLocalContent")),
    overtimeRate: s(pick("overtimeRate")),
    additionalNotes: s(pick("additionalNotes", "notes", "additionalRequirements")),
    extendable: bl(pick("extendable", "rentalExtendable")),
    operatorIncluded: bl(pick("operatorIncluded", "operator", "withOperator")),
    operatorNationality: s(pick("operatorNationality")),
    numberOfOperators: n(pick("numberOfOperators", "operatorsCount", "operatorCount")),
    nightShift: bl(pick("nightShiftRequired", "nightShift")),
    equipmentCerts: arr(pick("safetyCertifications", "equipmentSafetyCertifications", "equipmentCerts")),
    operatorCerts: arr(pick("operatorSafetyCertifications", "operatorCerts", "operatorCertifications")),
  };

  return {
    id: String(d.id ?? ""),
    // `getDealRoom` includes the bid rather than selecting it, so the room's own `bidId` column comes
    // back alongside the nested `bid.id`. Both are read — the column first, because it is the FK the
    // `@unique` is on — so a projection that trims the nested object still yields the id.
    bidId: s(d.bidId) ?? s(bid.id) ?? null,
    status,
    contractType: s(d.contractType),
    streamChannelId: s(d.streamChannelId),
    renteeId: n(d.renteeId),
    supplierId: n(d.supplierId),
    supplier: {
      id: n(sup.id),
      name: s(sup.companyName) ?? s(sup.storeName) ?? ([s(sup.firstName), s(sup.lastName)].filter(Boolean).join(" ") || "Supplier"),
      isVerified: sup.isVerified === true,
      phone: s(sup.phone),
    },
    rate: n(d.lastProposedRate) ?? n(bid.priceAmount),
    mobPrice: n(d.lastProposedMobPrice) ?? n(bid.mobPrice),
    demobPrice: n(d.lastProposedDemobPrice) ?? n(bid.demobPrice),
    mobByRentee: bl(pick("mobilizationByRentee", "mobByRentee")),
    demobByRentee: bl(pick("demobilizationByRentee", "demobByRentee")),
    // The Bid model has no `duration` (confirmed via /web:link-backend) — the request's estimated
    // duration is the source of truth.
    periods: n((d.request as Record<string, unknown>)?.estimatedDurationDays),
    priceUnit: s(d.lastProposedPriceUnit) ?? s(bid.priceUnit),
    numberOfUnits: priceUnits,
    // deal-room/negotiation — per-type units + exclusion + header code (from the widened payload).
    agreedUnits: n(d.agreedUnits),
    mobUnits: n(d.mobUnits),
    demobUnits: n(d.demobUnits),
    mobExcluded: d.mobExcluded === true,
    demobExcluded: d.demobExcluded === true,
    requestedUnits,
    shortCode: s(reqObj.shortCode),
    requestId: s(d.requestId) ?? s(reqObj.id),
    requestGroupId: s(reqObj.requestGroupId) ?? s(d.requestGroupId),
    lastCounterBy,
    myTurn,
    terms,
    hasDisputedTerms,
    supplierFirstEntry: d.supplierFirstEntry === true,
    details,
  };
}

// ── The deal-room quotation document ────────────────────────────────────────────────────────────────

/** Cost-responsibility terms — they render in the price section (`priceExtras`), not as term rows. */
const COST_TERM_KEYS = new Set([
  "fuel", "maintenance", "overtime", "overtime_rate", "operator_food", "fat_food",
  "operator_transport_accommodation", "fat_accommodation_transport", "operator_transport",
]);

/** Four ACKNOWLEDGE terms are not facts of their own: the backend fills them straight from the request
 *  columns the "Rental & equipment details" card already prints — `working_hours` ← workingHoursPerDay,
 *  `working_days` ← workingDaysPerWeek, `local_content` ← localContent, and `crosshire` ← **subletting**
 *  (`deal-room.service.ts`: "`subletting` in schema ↔ `crosshire` in canonical term-key map").
 *  Printing them as term rows as well put each fact on the paper twice — and the subletting one twice
 *  under two different names: "Subletting" in one card and "Crosshire" in the other, from one field.
 *  The DETAILS card owns them. Its labels carry the unit ("Working hours/day"), it uses the rentee's own
 *  word for the field, and the rest of the request's facts are already there. The term cards drop them. */
const DETAILS_OWNED_TERM_KEYS = new Set(["working_hours", "working_days", "local_content", "crosshire"]);

const nfQ = (v: number) => Math.round(v).toLocaleString("en-US");

/**
 * The deal-room quotation document — built LIVE off the room, the way the app builds it.
 *
 * The app's quotation link (`quotation_button.dart` -> `bid_quotation_page.dart`) re-fetches and
 * re-renders on every open; no snapshot is in the path at all. The web's was a HYBRID: the rate, the
 * price unit, the contract type and the whole terms list came off the frozen `Quotation` row while
 * everything else came off the live room. That broke in two directions — the snapshot does not exist
 * before the deal closes (so no preview was possible at all), and it still carries terms that have since
 * been retired (so a pre-retirement deal printed rows the app doesn't). Everything the app reads live is
 * now read live:
 *
 *   agreedRate    -> `room.rate`            (lastProposedRate ?? bid.priceAmount — what the bar shows)
 *   priceUnit     -> `room.priceUnit`
 *   contractType  -> `room.contractType`
 *   agreedTerms   -> `room.terms`           (already parse-filtered; the states mirror the rule the
 *                                            backend snapshots by at close: agreed|soft_accepted|fixed)
 *   renteePhone   -> `/api/me`.phone        (passed in as `rentee`)
 *   renteeEmail   -> `/api/me`.email
 *   supplierPhone -> `room.supplier.phone`  (the deal-room payload always carries it)
 *
 * `q` is therefore OPTIONAL, and supplies only what has no live source anywhere: the formal quotation
 * number (the Quotation row's id, which exists only once the deal closes) and the supplier's e-mail.
 * Pass `null` for a preview — `GET /api/deal-rooms/{id}/quotation` 404s until the deal is closed.
 */
export function buildDealRoomQuotationDoc(
  room: DealRoomView,
  /** The confirmed Quotation row, when one exists. `null` for every pre-close preview. */
  q: QuotationView | null,
  /** The signed-in rentee, from `/api/me` — the live source for the buyer block. */
  rentee: { name: string; phone?: string | null; email?: string | null },
  ar: boolean,
  L: (en: string, arr: string) => string,
  opts?: { logoUrl?: string },
): QuotationDoc {
  const lang = ar ? "ar" : "en";
  const sar = L("SAR", "ر.س");
  const kind = quotationLinkKind(room.status) ?? "preview";

  // EXACT same math as the live price bar — no snapshot override, so the paper always carries the
  // number the renter is looking at in the room.
  const t = computeDealTotals(room);
  const rate = t.rate;
  const unit = t.priceUnit;
  const units = t.rentalUnits;
  const days = room.periods;
  const periodLabel = unit === "PER_WEEK" ? L("week", "أسبوع") : unit === "PER_MONTH" ? L("month", "شهر") : unit === "PER_JOB" ? L("job", "مهمة") : L("day", "يوم");
  const dateStr = new Date().toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  // The Quotation row's id is the only formal reference this document has, and it exists only once the
  // deal closes. A preview falls back to the request's short code — the reference the rentee already
  // knows the room by — rather than printing a blank.
  const qnum = (q?.quotationNumber ?? "").slice(0, 8).toUpperCase() || room.shortCode || "—";
  const contractType = room.contractType;

  const valFmt = (v: unknown): string => {
    if (v == null || v === "") return "—";
    if (Array.isArray(v)) return v.length ? v.map(String).join(", ") : "—";
    if (typeof v === "boolean") return v ? L("Yes", "نعم") : L("No", "لا");
    const x = String(v).toLowerCase();
    if (x === "supplier") return L("Supplier", "المؤجّر");
    if (x === "rentee" || x === "renter") return L("Rentee", "المستأجر");
    if (x === "true" || x === "included" || x === "yes") return L("Yes", "نعم");
    if (x === "false" || x === "excluded" || x === "not_included" || x === "no") return L("No", "لا");
    return String(v);
  };

  // Invoice line items (rental + delivery + return) — the SAME 6-column table as the bid-card quotation.
  const lineItems: QuotationLineItem[] = [];
  // Rental qty/price columns read exactly as the bid card does: the PRICE column always carries the
  // supplier's raw quoted rate over its own period, and the QTY column carries the BILLABLE days the
  // rate is prorated across — never the calendar duration, which charges the Fridays the total does
  // not. Nothing prorated (PER_JOB, open-ended, no start date) shows a plain period count instead.
  const rentalQty = unit === "PER_JOB" || t.rentalRaw
    ? `${units}`
    : `${t.billableDays} ${L("days", "يوم")}${units > 1 ? ` × ${units}` : ""}`;
  lineItems.push({
    num: 1, label: L("Rental", "الإيجار"), detail: room.supplier.name,
    unit: periodLabel,
    qty: rentalQty,
    price: `${nfQ(rate)} / ${periodLabel}`,
    // The fixed-divisor assumption behind a weekly/monthly rate, stated whether or not this particular
    // period comes out exact (app parity: `rentalPeriodSubtitle`) — it is what turns the rate into the
    // day count beside it.
    totalNote: divisorNote(unit, L),
    total: nfQ(t.rentalTotal),
  });
  // Mob/demob are ALWAYS shown; each honours its OWN unit count + exclusion (excluded -> "Not included",
  // matching the price bar, which contributes 0 for an excluded leg).
  const logiRow = (label: string, excluded: boolean, price: number, unitsN: number, lineTotal: number, byRentee: boolean): QuotationLineItem =>
    excluded
      ? { num: null, label, detail: L("Not included", "غير مشمول"), unit: "—", qty: "—", price: "—", total: L("Not included", "غير مشمول") }
      : price > 0
        ? { num: null, label, detail: room.supplier.name, unit: L("Trip", "رحلة"), qty: String(unitsN), price: nfQ(price), total: nfQ(lineTotal) }
        : { num: null, label, detail: byRentee ? L("Arranged by the rentee", "يُرتّبه المستأجر") : L("Included", "مشمول"), unit: "—", qty: "—", price: "—", total: byRentee ? L("By rentee", "على المستأجر") : L("Included", "مشمول") };
  lineItems.push(logiRow(L("Delivery to site", "النقل إلى الموقع"), t.mobExcluded, t.mobPrice, t.mobUnitsN, t.mobTotal, room.mobByRentee === true));
  lineItems.push(logiRow(L("Return from site", "الإرجاع من الموقع"), t.demobExcluded, t.demobPrice, t.demobUnitsN, t.demobTotal, room.demobByRentee === true));

  const cards: QuotationCard[] = [];
  // Structured rental/equipment details (from the request item) — rows with no value are skipped.
  // Operator/safety + cost responsibilities are NOT separate cards: they flow through the term cards +
  // the price extras below, matching the app.
  const dd = room.details;
  const yn = (b: boolean | null) => (b == null ? null : b ? L("Yes", "نعم") : L("No", "لا"));
  const fmtDate = (v: string | null) => { if (!v) return null; const dt = new Date(v); return isNaN(dt.getTime()) ? v : dt.toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "short", year: "numeric" }); };
  const addRow = (rowsArr: { label: string; value: string }[], label: string, v: unknown) => {
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) return;
    rowsArr.push({ label, value: Array.isArray(v) ? v.join(", ") : String(v) });
  };
  const detailRows: { label: string; value: string }[] = [];
  addRow(detailRows, L("Equipment", "المعدة"), ar ? dd.equipmentLabelAr ?? dd.equipmentLabel : dd.equipmentLabel);
  // The four rows below carry backend ENUMS, not prose. Printed raw, an Arabic quotation read
  // «الأولوية: FAR_FUTURE» — a code on the document the two parties hold each other to. See
  // `contract/labels.ts`; anything those maps don't know still prints as it arrived.
  addRow(detailRows, L("Location", "الموقع"), dd.location ? cityLabel(dd.location, L) : null);
  addRow(detailRows, L("Rental type", "نوع الإيجار"), dd.rentalType ? rentalTypeLabel(dd.rentalType, L) : null);
  addRow(detailRows, L("Contract type", "نوع العقد"), contractType);
  addRow(detailRows, L("Start date", "تاريخ البدء"), fmtDate(dd.startDate));
  addRow(detailRows, L("End date", "تاريخ الانتهاء"), fmtDate(dd.endDate));
  addRow(detailRows, L("Duration", "المدة"), days != null ? `${days} ${L("days", "يوم")}` : null);
  // These four rows are the ONLY print of their fact — the matching ACKNOWLEDGE terms
  // (working_hours / working_days / local_content / crosshire) are dropped from the term cards below.
  addRow(detailRows, L("Working hours/day", "ساعات العمل/يوم"), dd.workingHoursPerDay);
  addRow(detailRows, L("Working days/week", "أيام العمل/أسبوع"), dd.workingDaysPerWeek);
  addRow(detailRows, L("Fulfillment", "التنفيذ"), dd.fulfillment ? fulfillmentLabel(dd.fulfillment, L) : null);
  addRow(detailRows, L("Urgency", "الأولوية"), dd.urgency ? urgencyLabel(dd.urgency, L) : null);
  addRow(detailRows, L("Subletting", "التأجير من الباطن"), yn(dd.subletting));
  addRow(detailRows, L("Local content", "المحتوى المحلي"), yn(dd.localContent));
  addRow(detailRows, L("Rental extendable", "قابل للتمديد"), yn(dd.extendable));
  addRow(detailRows, L("Additional notes", "ملاحظات إضافية"), dd.additionalNotes);
  if (detailRows.length) cards.push({ title: L("Rental & equipment details", "تفاصيل الإيجار والمعدة"), rows: detailRows });

  /**
   * A term's value for print. The KEY decides the vocabulary — an SLA term's `FOUR_HR` and a
   * maintenance term's `SUPPLIER` are both bare strings and only the key says which is which.
   *
   * Falls through to `valFmt` for everything else, which is most of the catalogue: the free-text and
   * numeric terms, and the booleans that `valFmt` already reads as Yes/No.
   */
  const termFmt = (term: DealTerm): string => {
    const v = term.value ?? term.platformDefault;
    return termValueLabel(term.key, v, L) ?? valFmt(v);
  };

  // Price extras (app parity): overtime rate + cost-responsibility terms ("fuel -> supplier"). Read from
  // the LIVE room only — the second loop over the snapshot's copy went with the rest of the hybrid.
  const isCost = (k: string) => COST_TERM_KEYS.has(k);
  const priceExtras: { label: string; value: string }[] = [];
  if (dd.overtimeRate) priceExtras.push({ label: L("Overtime rate", "سعر العمل الإضافي"), value: /^\d+(\.\d+)?$/.test(dd.overtimeRate) ? `${dd.overtimeRate}x` : dd.overtimeRate });
  const seenCost = new Set<string>();
  for (const term of room.terms) {
    if (!isCost(term.key) || seenCost.has(term.key)) continue;
    seenCost.add(term.key);
    priceExtras.push({ label: ar ? term.labelAr : term.label, value: termFmt(term) });
  }

  // Term cards, LIVE. The states mirror the rule the backend snapshots by at close
  // (`agreed | fixed | soft_accepted`), so a closed deal prints the rows it always did — it just reads
  // them from the room instead of from the frozen copy.
  const termRows = (pred: (term: DealTerm) => boolean) =>
    room.terms
      .filter((term) => pred(term) && !isCost(term.key) && !DETAILS_OWNED_TERM_KEYS.has(term.key))
      .map((term) => ({ label: ar ? term.labelAr : term.label, value: termFmt(term) }));
  const agreedRows = termRows((term) => term.state === "agreed" || term.state === "soft_accepted");
  if (agreedRows.length) cards.push({ title: L("Agreed terms", "الشروط المتفق عليها"), rows: agreedRows });
  const fixedRows = termRows((term) => term.state === "fixed");
  if (fixedRows.length) cards.push({ title: L("Fixed terms", "الشروط الثابتة"), rows: fixedRows });

  return {
    lang,
    title: L("Equipment rental quotation", "عرض سعر تأجير معدات"),
    quotationNumber: qnum,
    dateStr,
    supplier: {
      label: L("Supplier", "المؤجِّر"),
      name: room.supplier.name,
      idRows: [
        { label: L("National Address", "العنوان الوطني"), verified: room.supplier.isVerified },
        { label: L("CR #", "س.ت"), verified: room.supplier.isVerified },
        { label: L("VAT #", "ض.ق.م"), verified: room.supplier.isVerified },
        // Live — the deal-room payload always carries the supplier's phone; the snapshot only backstops.
        { label: L("Phone", "الهاتف"), value: room.supplier.phone ?? q?.supplierPhone ?? null },
        // SNAPSHOT-ONLY: nothing on the live room payload carries the supplier's e-mail, so a preview
        // omits the row rather than inventing one.
        { label: L("Email", "البريد"), value: q?.supplierEmail ?? null },
      ],
      // Verified shows on the CR/VAT rows ("✓ Verified") — no standalone orphan party chip.
      chips: [],
    },
    rentee: {
      label: L("Rentee", "المُستأجِر"),
      name: rentee.name,
      idRows: [
        { label: L("Phone", "الهاتف"), value: rentee.phone ?? q?.renteePhone ?? null },
        { label: L("Email", "البريد"), value: rentee.email ?? q?.renteeEmail ?? null },
      ],
      chips: [],
    },
    logoUrl: opts?.logoUrl,
    meta: [], // no meta strip (app parity) — reference/contract/period live in the details card
    priceExtras,
    lineItems,
    currency: sar,
    totals: { subtotal: t.subtotal, vat: t.vat, total: t.grand },
    cards,
    showSigned: false,
    // Short disclaimer instead of the full legal clause list + signed block (app parity).
    legal: [
      // A preview says so ON the paper, in the app's own words (`dealViewQuotationDraftHint`). The link
      // label alone doesn't survive a print-out or a forward.
      ...(kind === "preview"
        ? [L("Draft — reflects the current offer, final once the supplier confirms.", "مسودة — تعكس العرض الحالي، وتُعتمد بعد تأكيد المورد.")]
        : []),
      L("This quotation is generated electronically via Moedatech, valid for 7 days from the issue date. Prices exclude anything not listed above; VAT at 15% applies per Saudi tax law.", "صدر هذا العرض إلكترونيًا عبر منصة معداتك، وهو ساري المفعول لمدة ٧ أيام من تاريخ الإصدار. الأسعار لا تشمل ما لم يُذكر أعلاه، وتُطبَّق ضريبة القيمة المضافة بنسبة ١٥٪ وفقًا للنظام السعودي."),
    ],
  };
}
