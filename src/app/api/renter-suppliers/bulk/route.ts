import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter, rawBody } from "@/lib/api/agents-relay";

export const dynamic = "force-dynamic";

/**
 * POST /api/renter-suppliers/bulk — the spreadsheet import.
 *
 * SUP-T12. **Partial success is the normal outcome, not the exception.** A renter's own supplier
 * sheet has a blank row, a phone in a format nobody expected, and two lines for the same firm. The
 * answer is `created[]`, `merged[]`, `rejected[{row, reason}]` — one bad row must never lose
 * thirty-nine good ones, and the reason is per row so the renter can fix that row rather than guess
 * at the file.
 *
 * The response therefore passes through verbatim, including a 413 for a file past the cap: the count
 * in it is what the dialog tells the renter, and **nothing is ever truncated silently** — a renter
 * who believes he imported a file he did not will find out weeks later, from a supplier who never
 * got a request.
 */
export async function POST(req: Request) {
  const body = await rawBody(req);
  if (useRealApp) return relayAsRenter("/renter-suppliers/bulk", { method: "POST", body });
  return NextResponse.json({ code: "not_configured" }, { status: 503 });
}
