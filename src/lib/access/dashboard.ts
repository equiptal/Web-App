import type { RenterUser } from "@/lib/contract/auth";

/**
 * The procurement dashboard is a DEMO surface, limited to the CCC mock account (matched by phone).
 * Not a real per-account feature — gated here until it's productised. Comparison is digit-only so
 * formatting (+966 / spaces) never causes a mismatch.
 */
const CCC_DASHBOARD_PHONE = "966503695664";

const digits = (p: string | null | undefined): string => (p ?? "").replace(/\D/g, "");

export function canSeeProcurementDashboard(user: RenterUser | null | undefined): boolean {
  return digits(user?.phone) === CCC_DASHBOARD_PHONE;
}
