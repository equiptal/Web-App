import { NextResponse } from "next/server";
import { companyAction } from "@/lib/api/company-server";

/**
 * POST /api/me/company/join — `{ inviteCode }`.
 *
 * Creates a PENDING membership and notifies the firm's owners. The renter shares nothing and sees
 * nothing company-scoped until an owner approves them, so this is safe to expose behind a code field
 * — but it IS the point of no return for their existing records (approval backfills them to the
 * company, permanently), which is why the UI confirms first via `validate-code`.
 *
 * Already in a company → `CO1003`; bad code → `CO1002`.
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
  return companyAction("/agents/companies/join", "POST /api/me/company/join", { inviteCode });
}
