/**
 * Outcome Survey contract (renter web) — mirrors the app-backend `/api/surveys` shapes on staging.
 * The web consumes only the renter flows: RENTEE_OUTCOME ("who did you rent from?") and
 * RENTEE_NO_BIDS ("still need this?"). SUPPLIER_CONFIRM exists in the contract but is mobile-owned —
 * the web ignores it. Backend returns DATA only (no copy); all UI strings come from i18n (doc §8).
 */
export type OutcomeSurveyType = "RENTEE_OUTCOME" | "RENTEE_NO_BIDS" | "SUPPLIER_CONFIRM";

/** Actions the respond endpoint accepts; which are valid is gated per type by the backend. */
export type SurveyAction = "confirm" | "won_elsewhere" | "no_winner" | "skip" | "close" | "edit" | "deny";

/** A supplier who bid — a row in the Q1 "who did you rent from?" list (text-only, app parity). */
export interface Bidder {
  supplierId: number;
  supplierName: string;
  bidId: string;
  priceAmount: number;
  priceUnit: string;
  status: string;
  equipmentName: string;
}

/** One survey within a pending unit (a fan-out group may carry several). */
export interface PendingItem {
  surveyId: string;
  type: OutcomeSurveyType;
  requestId: string;
  rentalType: string | null;
  allowedActions: SurveyAction[];
  requestContext: { shortCode: string | null; equipmentSummary: string };
  /** RENTEE_OUTCOME only — the bidder options + their offered prices. */
  bidders?: Bidder[];
  /** SUPPLIER_CONFIRM only (mobile) — present for completeness, unused by the web. */
  reported?: { winnerSupplierId: number | null; reportedPrice: number | null; reportedQuantity: number | null };
}

/** The single highest-priority due unit (or null). The client drains one unit per call. */
export interface PendingUnit {
  groupId: string | null;
  type: OutcomeSurveyType;
  items: PendingItem[];
}

export interface PendingResponse {
  pending: PendingUnit | null;
}

/** Body of POST /api/me/surveys/{id}/respond. Fields are validated by type on the backend. */
export interface RespondBody {
  action: SurveyAction;
  winners?: { winnerSupplierId: number; price?: number; quantity?: number }[];
  price?: number;
  quantity?: number;
  selectedOption?: string;
  freeText?: string;
}

export interface RespondResult {
  status: string;
  /** True when the survey was already non-ACTIVE (idempotent no-op) — treat as success. */
  alreadyResolved?: boolean;
  /** RENTEE_NO_BIDS + edit → the requestId to deep-link the renter to their request detail. */
  deepLinkEditRequestId?: string;
}

/** Sentinels for the two non-bidder choices in Q1 (mirror the app's -1/-2). */
export const SOMEONE_ELSE = -1;
export const NO_ONE = -2;

/**
 * Map a raw price unit / rental type to the §8 unit suffix used in "How much did you pay {unit}?".
 * Tolerant of the various forms the backend may send (DAILY / daily / per_day / day …).
 */
export function unitLabel(raw: string | null | undefined, ar: boolean): string {
  const k = (raw ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (k.includes("job")) return ar ? "للمهمة" : "for the job";
  if (k.includes("day") || k.includes("daily")) return ar ? "يوميًا" : "per day";
  if (k.includes("week")) return ar ? "أسبوعيًا" : "per week";
  if (k.includes("month")) return ar ? "شهريًا" : "per month";
  if (k.includes("long")) return ar ? "للإيجار" : "for the rental";
  return "";
}

/** Whether a unit is one the renter web renders (mobile owns SUPPLIER_CONFIRM). */
export function isRenterSurvey(type: OutcomeSurveyType): boolean {
  return type === "RENTEE_OUTCOME" || type === "RENTEE_NO_BIDS";
}

/**
 * Build the respond body for one RENTEE_OUTCOME item from the renter's choice (a supplierId, or the
 * SOMEONE_ELSE / NO_ONE sentinel), the typed price, and an optional reason. Mirrors the mobile app's
 * submit mapping: bidder → confirm+winner, someone-else → won_elsewhere, no-one → no_winner.
 */
export function buildOutcomeResponse(sel: number, priceStr: string, reason: string): RespondBody {
  const note = reason.trim() || undefined;
  const n = Number(priceStr);
  const price = priceStr.trim() !== "" && Number.isFinite(n) ? n : undefined;
  if (sel === NO_ONE) return { action: "no_winner", freeText: note };
  if (sel === SOMEONE_ELSE) return { action: "won_elsewhere", price, freeText: note };
  return { action: "confirm", winners: [{ winnerSupplierId: sel, price }] };
}
