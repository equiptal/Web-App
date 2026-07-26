import { companyAction } from "@/lib/api/company-server";

/**
 * POST /api/me/company/cancel-join — no body; the actor is the session.
 *
 * Withdraw your own PENDING join request. Without this, entering a valid-but-wrong invite code is a
 * dead end: the pending row counts as a membership, so every further join attempt is refused with
 * `CO1003` until an owner happens to reject you.
 *
 * Pending rows only — an active member gets `CO1009` and must use `/leave`, which carries the
 * last-owner guard and the deal-room channel sync. Nothing was ever shared with a pending joiner, so
 * there is no backfill to unwind.
 */
export async function POST() {
  return companyAction("/agents/companies/cancel-join", "POST /api/me/company/cancel-join");
}
