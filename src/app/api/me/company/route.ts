import { NextResponse } from "next/server";
import { agentsGet } from "@/lib/api/agents-backend";
import { requireActor, companyErrorResponse } from "@/lib/api/company-server";
import type { MyCompanyPayload } from "@/lib/contract/company";

/**
 * GET /api/me/company — the signed-in renter's company (docs/plans/company-shared-visibility.md).
 *
 * Proxies `GET /agents/companies/me?userId=`, which returns the identical payload to the app's
 * `GET /companies/me`: `{ company, membership, members }`, all null/empty when the renter has no
 * company. That empty state is a 200, not a 404 — it's the "offer the join form" state.
 *
 * The invite code inside `company` is populated by the BACKEND only for an active owner of a verified
 * company, so this route never has to decide who may see it.
 */
export async function GET() {
  const actor = await requireActor();
  if ("response" in actor) return actor.response;
  try {
    const data = await agentsGet<MyCompanyPayload>(`/agents/companies/me?userId=${actor.userId}`);
    return NextResponse.json(data ?? { company: null, membership: null, members: [] });
  } catch (err) {
    return companyErrorResponse(err, "GET /api/me/company");
  }
}
