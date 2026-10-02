import type { RenterUser } from "@/lib/contract/auth";

/**
 * The procurement dashboard and the governance board are STAGING-ONLY demo surfaces.
 *
 * ⚠️ THIS FILE INTENTIONALLY DIFFERS FROM `main`. On production the same two functions return
 * `false` for every account, because the demo phones belong to real, different people there and a
 * phone gate would hand a stranger someone else's procurement history. On every staging→main
 * promotion, KEEP THE PRODUCTION VERSION — do not let this staging phone-gate overwrite it.
 * (Same "exclude a demo surface from prod" pattern as the 006 share-for-bids prototypes.)
 *
 * 🔴 It has already been overwritten once. Before 2026-10-03 this staging copy WAS the production
 * copy: it returned false for everyone, so `/dashboard` was unreachable on staging too and the
 * comment above it described a gate that was no longer in the file. If you are reading this
 * because the dashboard "disappeared" from staging, that is what happened again.
 */

/** Last nine digits, so 0559…, +966559… and 966559… all compare equal. */
const tail = (phone: string | null | undefined) => (phone ?? "").replace(/\D/g, "").slice(-9);

/** The CCC mock account the procurement prototype was built around. */
const PROCUREMENT_DEMO = "503695664";

/**
 * The account the governance board is demonstrated on. Its staging data was mirrored from
 * production on 2026-10-03, so this surface shows real supplier names, registrations and quoted
 * prices. That is a deliberate decision by the owner, and it is the reason this gate is one phone
 * number rather than a role or a feature flag.
 */
const GOVERNANCE_DEMO = "594433949";

export function canSeeProcurementDashboard(user: RenterUser | null | undefined): boolean {
  return !!user && tail(user.phone) === PROCUREMENT_DEMO;
}

/** The governance and compliance board. Same surface, same rules, a different demo account. */
export function canSeeGovernanceDashboard(user: RenterUser | null | undefined): boolean {
  if (!user) return false;
  const t = tail(user.phone);
  return t === GOVERNANCE_DEMO || t === PROCUREMENT_DEMO;
}

/** Either board — what the nav item and the page gate read, so neither can drift from the other. */
export function canSeeAnyDashboard(user: RenterUser | null | undefined): boolean {
  return canSeeProcurementDashboard(user) || canSeeGovernanceDashboard(user);
}
