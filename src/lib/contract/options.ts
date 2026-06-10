/**
 * Closed option vocabularies for request fields. Each value is a stable key; human labels live in
 * the i18n dictionaries (src/lib/i18n) under `options.<group>.<value>`. ACs referenced inline.
 */

export type RentalBasis = "daily" | "weekly" | "monthly"; // AC-13
export const RENTAL_BASES: RentalBasis[] = ["daily", "weekly", "monthly"];

export type OvertimeRate = "without" | "1.5x" | "2x"; // AC-15
export const OVERTIME_RATES: OvertimeRate[] = ["without", "1.5x", "2x"];

/** AC-28: Any + 2020–2026 + Customize. `custom:<year>` carries a custom value. */
export const EQUIPMENT_YEARS = ["any", "2020", "2021", "2022", "2023", "2024", "2025", "2026"] as const;

export type SiteAccessRestriction =
  | "weight-limit"
  | "height-limit"
  | "security-permit"
  | "delivery-window"
  | "no-overnight-storage"
  | "special-transport-permit"; // AC-27
export const SITE_ACCESS_RESTRICTIONS: SiteAccessRestriction[] = [
  "weight-limit",
  "height-limit",
  "security-permit",
  "delivery-window",
  "no-overnight-storage",
  "special-transport-permit",
];

export type SafetyCertificate = "tuv" | "spsp" | "saso-technical"; // AC-50
export const SAFETY_CERTIFICATES: SafetyCertificate[] = ["tuv", "spsp", "saso-technical"];

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
export const FUEL_TYPES: FuelType[] = ["diesel", "petrol", "electric", "hybrid"];

export type PaymentTerm = "upfront" | "daily" | "net-30" | "net-60" | "end-of-job"; // AC-36
export const PAYMENT_TERMS: PaymentTerm[] = ["upfront", "daily", "net-30", "net-60", "end-of-job"];

export type PaymentMethod = "bank-transfer" | "cash"; // AC-36
export const PAYMENT_METHODS: PaymentMethod[] = ["bank-transfer", "cash"];

export type MaintenanceResponsibility = "supplier" | "renter"; // AC-37 default supplier
export const MAINTENANCE_RESPONSIBILITIES: MaintenanceResponsibility[] = ["supplier", "renter"];

export type MaintenanceSla = "4h" | "8h" | "24h" | "custom"; // AC-37 (only when supplier)
export const MAINTENANCE_SLAS: MaintenanceSla[] = ["4h", "8h", "24h", "custom"];

export type BidWindow = "24h" | "48h" | "72h" | "1-week"; // AC-40
export const BID_WINDOWS: BidWindow[] = ["24h", "48h", "72h", "1-week"];

/** AC-24: operator defaults to `no` for generators / compressors / light towers, `yes` otherwise. */
export const OPERATOR_DEFAULT_NO_SUBCATEGORIES = ["generators", "compressors", "light-towers"];
export function defaultOperatorNeeded(subcategoryId: string | null): OperatorNeeded {
  return subcategoryId && OPERATOR_DEFAULT_NO_SUBCATEGORIES.includes(subcategoryId) ? "no" : "yes";
}
