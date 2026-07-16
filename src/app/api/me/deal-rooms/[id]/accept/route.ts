import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * POST /api/me/deal-rooms/:id/accept — the renter accepts the current offer (web-app/request-details-
 * bids). This is the RENTEE's accept = `accept-all-terms` ONLY (promotes terms → agreed, flips the bid
 * to ACCEPTED, moves the deal to AWAITING_SUPPLIER_CONFIRMATION). The final `confirm` (→ CLOSED + job)
 * is the SUPPLIER's step, so we must NOT call it here — doing so 409s. Body: { contractType? }.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let contractType = "formal"; // app-parity default (was "platform")
  let agreedUnits: number | undefined;
  let termResolutions: { termKey: string; action: string; value?: unknown }[] | undefined;
  // deal-room/negotiation — matched mob/demob unit counts + leg exclusion, forwarded to accept-all-terms.
  let mobUnits: number | undefined;
  let demobUnits: number | undefined;
  let mobExcluded: boolean | undefined;
  let demobExcluded: boolean | undefined;
  try {
    const b = (await req.json()) as {
      contractType?: string; agreedUnits?: number; termResolutions?: typeof termResolutions;
      mobUnits?: number; demobUnits?: number; mobExcluded?: boolean; demobExcluded?: boolean;
    };
    if (b?.contractType) contractType = b.contractType;
    // Multi-supplier assembly (app parity): only assembled deals send agreedUnits — the web has none.
    if (typeof b?.agreedUnits === "number" && b.agreedUnits > 0) agreedUnits = b.agreedUnits;
    // Locally-collected term resolutions submitted with the accept (app parity: accept-all-terms batches them).
    if (Array.isArray(b?.termResolutions) && b.termResolutions.length) termResolutions = b.termResolutions;
    if (typeof b?.mobUnits === "number") mobUnits = b.mobUnits;
    if (typeof b?.demobUnits === "number") demobUnits = b.demobUnits;
    if (typeof b?.mobExcluded === "boolean") mobExcluded = b.mobExcluded;
    if (typeof b?.demobExcluded === "boolean") demobExcluded = b.demobExcluded;
  } catch {
    /* default */
  }
  const base = `/api/deal-rooms/${encodeURIComponent(id)}`;
  const body: Record<string, unknown> = { contractType };
  if (agreedUnits != null) body.agreedUnits = agreedUnits;
  if (termResolutions) body.termResolutions = termResolutions;
  if (mobUnits != null) body.mobUnits = mobUnits;
  if (demobUnits != null) body.demobUnits = demobUnits;
  if (mobExcluded != null) body.mobExcluded = mobExcluded;
  if (demobExcluded != null) body.demobExcluded = demobExcluded;
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`${base}/accept-all-terms`, { method: "POST", body: JSON.stringify(body) });
      return NextResponse.json(raw ?? { ok: true });
    } catch (err) {
      // Idempotency: accept-all-terms requires NEGOTIATING. If the rentee already accepted (a prior
      // attempt moved the deal to AWAITING_SUPPLIER_CONFIRMATION / CLOSED), report success, not error.
      try {
        const dr = await call<{ status?: string }>(base);
        if (dr?.status === "AWAITING_SUPPLIER_CONFIRMATION" || dr?.status === "CLOSED") {
          return NextResponse.json({ ok: true, status: dr.status });
        }
      } catch {
        /* fall through to the original error */
      }
      return appAuthErrorResponse(err);
    }
  });
}
