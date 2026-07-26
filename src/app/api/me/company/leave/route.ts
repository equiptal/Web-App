import { companyAction } from "@/lib/api/company-server";

/**
 * POST /api/me/company/leave — no body; the actor is the session.
 *
 * The renter leaves. Everything they created or brought in STAYS with the firm (the exit rule), and
 * they lose access to the shared requests, bids and equipment.
 *
 * The last active owner is refused with `CO1006` — they have to promote someone first. A SOLE member
 * "leaving" is a different operation and hits `/api/me/company/dissolve` instead.
 */
export async function POST() {
  return companyAction("/agents/companies/leave", "POST /api/me/company/leave");
}
