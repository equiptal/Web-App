import type { RenterUser } from "@/lib/contract/auth";

/**
 * The procurement dashboard is a DEMO surface, limited to the CCC mock account (matched by phone).
 * Not a real per-account feature — gated here until it's productised. Comparison is digit-only so
 * formatting (+966 / spaces) never causes a mismatch.
 *
 * ⚠️ THIS FILE INTENTIONALLY DIFFERS BETWEEN BRANCHES — in BOTH directions:
 *   - `staging` (this version): phone-gated, so the CCC demo account can show the dashboard.
 *   - `main` (production): `return false` for every account, because the demo phone belongs to a
 *     real, different user on production — so a phone gate is NOT safe there.
 *
 * Neither version may overwrite the other. On a `staging → main` promotion, keep production's
 * always-false version. On a `main → staging` pull (promoting prod back down, or syncing a hotfix),
 * keep THIS phone-gated version — a plain `git pull origin main` silently replaces it and the demo
 * goes dark on staging with nothing to warn you, because the paired test is overwritten too and the
 * suite stays green. That is exactly how it broke on 2026-07-29.
 *
 * If this keeps costing us, the durable fix is one env var read by a single shared version of this
 * file (set on staging, unset on prod) so there is nothing to hand-merge. Same "exclude a demo
 * surface from prod" pattern as the 006 share-for-bids prototypes.
 */
const CCC_DASHBOARD_PHONE = "966503695664";

const digits = (p: string | null | undefined): string => (p ?? "").replace(/\D/g, "");

export function canSeeProcurementDashboard(user: RenterUser | null | undefined): boolean {
  return digits(user?.phone) === CCC_DASHBOARD_PHONE;
}
