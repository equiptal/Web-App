import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter, rawBody } from "@/lib/api/agents-relay";

export const dynamic = "force-dynamic";

/**
 * GET  /api/renter-suppliers — the renter's own supplier list, with its roll-up.
 * POST /api/renter-suppliers — add one supplier the renter typed in.
 *
 * SUP-T12. A row is a **link between a company and a supplier**, so every call is scoped by the
 * caller's company at the far end — `relayAsRenter` forwards the session-verified `userId`, which is
 * the whole owner check from our side. No session is a 401, never a proxied call without one.
 *
 * ── The empty list is an ANSWER, not a failure ───────────────────────────────────────────────────
 *
 * Before the registry is deployed this returns `[]`, and the screen reads *"you have no suppliers"* —
 * which is true, and better than an error page for a feature whose backend has simply not landed yet.
 * `listRenterSuppliers` in `client.ts` swallows failures to the same end. **This is a development
 * condition, not a product mode:** every write below answers 503 rather than pretending to succeed,
 * because a renter who is told his supplier was added and finds it gone has been lied to.
 *
 * ── Why the upstream status passes through ───────────────────────────────────────────────────────
 *
 * **409 carries meaning here.** A phone or CR that already exists comes back `ALREADY_LINKED` with
 * the id of the row that holds it, and the web says *"already in your list"* and opens that row.
 * Flattening it into a 502 would turn one of the most ordinary moments in this feature — adding
 * someone twice — into *"it broke"*, and the renter would type it a third time.
 */
export async function GET() {
  if (useRealApp) return relayAsRenter("/renter-suppliers");
  return NextResponse.json([]);
}

export async function POST(req: Request) {
  const body = await rawBody(req);
  if (useRealApp) return relayAsRenter("/renter-suppliers", { method: "POST", body });
  return NextResponse.json({ code: "not_configured" }, { status: 503 });
}
