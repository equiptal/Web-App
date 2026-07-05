import type { RenterUser } from "@/lib/contract/auth";

/**
 * The procurement dashboard is a STAGING-ONLY demo surface. It is EXCLUDED FROM PRODUCTION here:
 * this function returns false, so no prod account can see it in the nav or reach `/dashboard` (both
 * are gated on this). The staging demo phone (966503695664) belongs to a real, different user on
 * production, so a phone gate is NOT safe here.
 *
 * ⚠️ This file INTENTIONALLY DIFFERS from `staging` (where it gates on the CCC demo phone). On every
 * staging→main promotion, KEEP THIS production version — do not let the staging phone-gate overwrite
 * it. (Same "exclude a demo surface from prod" pattern as the 006 share-for-bids prototypes.)
 */
export function canSeeProcurementDashboard(user: RenterUser | null | undefined): boolean {
  void user; // signature kept for callers; production excludes the dashboard for every account
  return false;
}
