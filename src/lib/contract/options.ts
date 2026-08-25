/**
 * Closed option vocabularies for request fields. Each value is a stable key; human labels live in
 * the i18n dictionaries (src/lib/i18n) under `options.<group>.<value>`. ACs referenced inline.
 */

export type RentalBasis = "daily" | "weekly" | "monthly"; // AC-13
export const RENTAL_BASES: RentalBasis[] = ["daily", "weekly", "monthly"];

export type OvertimeRate = "without" | "1.5x" | "2x"; // AC-15
export const OVERTIME_RATES: OvertimeRate[] = ["without", "1.5x", "2x"];

/** Min manufacture year — matches the mobile request form: 2015+ / 2018+ / 2020+ / 2022+ + Any. */
export const EQUIPMENT_YEARS = ["2015+", "2018+", "2020+", "2022+", "any"] as const;

// 2026-07 cert rule: equipment certs offered are TÜV + Aramco (SPSP/SASO dropped from selection but
// legacy values still RENDER for old data, so they stay in the union). Aramco is equipment-only.
export type SafetyCertificate = "tuv" | "aramco" | "spsp" | "saso-technical" | "other"; // AC-50 (+ web-app/002 free-text "other")
export const SAFETY_CERTIFICATES: SafetyCertificate[] = ["tuv", "aramco", "other"];
/**
 * Operator per-item certificate options — Aramco is NOT an operator cert (equipment-only, app parity).
 *
 * `saso-technical` was offered here and is no longer: **no parse can produce it.** The normalization
 * agent's operator dimension accepts only `SPSP` and `TÜV` (`rfq-prompt.ts`: *"operator_license_levels
 * — an ARRAY — ONLY "SPSP" / "TÜV""*), so offering SASO as a live choice let a renter demand a
 * certificate the platform never recognises on that side — and an unrecognised cert becomes a
 * document every bidder is asked for. It stays in the {@link SafetyCertificate} union so existing
 * data still RENDERS; it is simply not selectable any more.
 *
 * Note that SASO does exist elsewhere: `saso-registration` is a request-level "Other" certificate
 * (see {@link OTHER_CERTIFICATES}), which is a different thing from an operator's licence.
 */
export const OPERATOR_CERTIFICATES: SafetyCertificate[] = ["tuv", "spsp", "other"];

/**
 * Normalize a stored/legacy equipment-cert value to a canonical code. App parity:
 * `normalizeEquipmentCertCode` (localized_labels.dart) — requests created before the current taxonomy
 * stored display labels ("TUV", "SPSP", "SASO Technical"), so map those plus any casing/spacing variant
 * onto the canonical code. An unrecognized value passes through lower-cased so nothing is dropped
 * silently; {@link splitSafetyCerts} then routes it to the free-text "Other" box.
 */
export function normalizeSafetyCert(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  switch (key) {
    case "tuv":
    case "tuv_certificate":
    case "tuv_inspection":
      return "tuv";
    case "aramco":
    case "aramco_certified":
    case "aramco_certificate":
      return "aramco";
    case "spsp":
    case "spsp_certificate":
    case "spsp_inspection":
      return "spsp";
    case "saso":
    case "saso_technical":
    case "saso_technical_inspection":
      return "saso-technical";
    case "saso_registration":
      return "saso-registration";
    default:
      return key;
  }
}

/**
 * Split a stored cert list into the chips the UI offers and the single free-text "Other" value.
 * App parity: the hydration in `equipment_step.dart` — canonical offered codes become chips, and the
 * FIRST value that isn't offered (a legacy `spsp` / `saso-technical`, or genuinely custom text) becomes
 * the "Other" text so it stays visible and editable instead of riding along invisibly.
 */
export function splitSafetyCerts(values: readonly string[] | null | undefined): {
  chips: SafetyCertificate[];
  otherText: string;
} {
  const chips: SafetyCertificate[] = [];
  let otherText = "";
  for (const raw of values ?? []) {
    if (!raw?.trim()) continue;
    const code = normalizeSafetyCert(raw);
    if ((SAFETY_CERTIFICATES as readonly string[]).includes(code)) {
      // Includes a literal "other" chip already in UI form — its text lives in the field, not the list.
      if (!chips.includes(code as SafetyCertificate)) chips.push(code as SafetyCertificate);
    } else if (!otherText) {
      otherText = raw.trim();
    }
  }
  if (otherText && !chips.includes("other")) chips.push("other");
  return { chips, otherText };
}

export type OtherCertificate = "local-content" | "saso-registration"; // AC-50
// `saso-registration` is intentionally NOT offered: request-level requiredCerts was removed in the
// terms-field cleanup (terms-journey doc), so the backend drops it. Only local-content (its own boolean
// column) is a live request term. The type keeps the value for back-compat with existing adapters.
export const OTHER_CERTIFICATES: OtherCertificate[] = ["local-content"];

/** me / supplier — delivery, return, fuel responsibility (AC-25/26). */
export type Party = "me" | "supplier";
export const PARTIES: Party[] = ["me", "supplier"];

export type OperatorNeeded = "yes" | "no"; // AC-24

/** Operator certificate options mirror the Safety certificate set (AC-24, defaulted from AC-50). */
export type OperatorCertificate = SafetyCertificate;

/**
 * NO certificate defaults — neither operator nor equipment. Both halves of the 2026-07 cert rule have
 * now been withdrawn, in the app first (`da23c045`, main) and mirrored here.
 *
 *  • operator cert — used to seed SPSP on every operator-on line (`kDefaultOperatorCertCode`,
 *    localized_labels.dart), so essentially every request left the wizard demanding an operator SPSP
 *    the renter never asked for.
 *  • equipment cert — used to seed Aramco for lifting equipment and TÜV for everything else
 *    (`_withCertRule` / `_withGlobalEquipmentDefaults`, create_request_bloc.dart), so every line landed
 *    pre-checked with a cert chosen by category rather than by the renter.
 *
 * Neither requirement is cosmetic: a seeded cert becomes a Level-3 term (`bids.ts`) and a *document*
 * demanded of every supplier who bids (`bid-readiness.ts`). A guess made on the renter's behalf
 * narrows their own bidder pool.
 *
 * Both certs are now set ONLY by the renter — either per line in step 2, or once in step 1's
 * "settings for all items", which every line inherits (see `SET_CERTIFICATES`, rfq-store.tsx) — or by
 * the agent when the RFQ text actually names one (`toOperatorCert`/`toSafetyCerts`, agent-adapters.ts).
 * Picking nothing leaves the request with no cert requirement at all, which is the correct default: the
 * renter asked for none.
 */

export type Accommodation = "me" | "supplier"; // AC-24

export type FuelType = "diesel" | "petrol" | "electric" | "hybrid"; // AC-26 default diesel
// The UI offers only diesel/electric. `petrol` and `hybrid` stay in the type (and in the agent/app
// mappings) for safety — so a value parsed by the agent or present in existing data still resolves —
// but neither is offered as a selectable option.
export const FUEL_TYPES: FuelType[] = ["diesel", "electric"];

export type PaymentTerm = "upfront" | "daily" | "net-30" | "net-60" | "end-of-job"; // AC-36
export const PAYMENT_TERMS: PaymentTerm[] = ["upfront", "daily", "net-30", "net-60", "end-of-job"];

export type PaymentMethod = "bank-transfer" | "cash"; // AC-36
export const PAYMENT_METHODS: PaymentMethod[] = ["bank-transfer", "cash"];

export type MaintenanceResponsibility = "supplier" | "renter"; // AC-37 default supplier
export const MAINTENANCE_RESPONSIBILITIES: MaintenanceResponsibility[] = ["supplier", "renter"];

export type MaintenanceSla = "4h" | "8h" | "24h" | "48h" | "72h"; // AC-37 (only when supplier) — full app enum
// Web offers only 24h/48h/72h as selectable buttons (4h/8h dropped per product). The type keeps the
// full set so an agent-inferred 4h/8h value still type-checks and maps to the backend.
export const MAINTENANCE_SLAS: MaintenanceSla[] = ["24h", "48h", "72h"];

export type BidWindow = "24h" | "48h" | "72h" | "1-week"; // AC-40
export const BID_WINDOWS: BidWindow[] = ["24h", "48h", "72h", "1-week"];

/** AC-24: operator defaults to `no` for generators / compressors / light towers, `yes` otherwise. */
export const OPERATOR_DEFAULT_NO_SUBCATEGORIES = ["generators", "compressors", "light-towers"];
export function defaultOperatorNeeded(subcategoryId: string | null): OperatorNeeded {
  return subcategoryId && OPERATOR_DEFAULT_NO_SUBCATEGORIES.includes(subcategoryId) ? "no" : "yes";
}
