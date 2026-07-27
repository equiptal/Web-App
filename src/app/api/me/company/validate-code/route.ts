import { NextResponse } from "next/server";
import { companyAction } from "@/lib/api/company-server";

/**
 * POST /api/me/company/validate-code — `{ inviteCode }`.
 *
 * Names the firm behind a code so the join confirmation can say WHOSE company the renter is about to
 * hand their records to. Joining is a one-way transfer, so the UI must never fire it straight from
 * the code field — this call is what makes the consent step possible.
 *
 * An invalid / dissolved / unverified code comes back as `CO1002` (one undifferentiated code, so the
 * endpoint can't be used to probe which companies exist).
 */
export async function POST(req: Request) {
  let inviteCode = "";
  try {
    const body = (await req.json()) as { inviteCode?: unknown };
    if (typeof body.inviteCode === "string") inviteCode = body.inviteCode.trim();
  } catch {
    /* empty body → falls into the length check below */
  }
  if (inviteCode.length < 4) {
    return NextResponse.json({ code: "CO1002" }, { status: 400 });
  }
  return companyAction("/agents/companies/validate-code", "POST /api/me/company/validate-code", { inviteCode });
}
