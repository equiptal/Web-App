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

export type SafetyCertificate = "tuv" | "spsp" | "saso-technical" | "other"; // AC-50 (+ web-app/002 free-text "other")
export const SAFETY_CERTIFICATES: SafetyCertificate[] = ["tuv", "spsp", "saso-technical", "other"];
/** Operator per-item certificate options — the fixed safety certs WITHOUT the free-text "other". */
export const OPERATOR_CERTIFICATES: SafetyCertificate[] = ["tuv", "spsp", "saso-technical"];

export type OtherCertificate = "local-content" | "saso-registration"; // AC-50
export const OTHER_CERTIFICATES: OtherCertificate[] = ["local-content", "saso-registration"];

/** me / supplier — delivery, return, fuel responsibility (AC-25/26). */
export type Party = "me" | "supplier";
export const PARTIES: Party[] = ["me", "supplier"];

export type OperatorNeeded = "yes" | "no"; // AC-24

/** Operator certificate options mirror the Safety certificate set (AC-24, defaulted from AC-50). */
export type OperatorCertificate = SafetyCertificate;

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
