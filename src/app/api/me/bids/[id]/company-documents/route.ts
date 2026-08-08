import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { mapCompanyDocuments } from "@/lib/contract/company-documents";

/**
 * GET /api/me/bids/:id/company-documents — the BID supplier's company papers, presigned, for the
 * renter's company panel (V14 / RM3-AC-68). Proxies `GET /marketplace/bids/{bidId}/company-documents`
 * (`company-documents.service.getCompanyDocumentsForBid`), which derives the supplier FROM the bid and
 * re-checks that this renter can reach the bid's request with the same `canAccessRequest` predicate
 * the fleet read uses — no company id is ever accepted from a client, here or there.
 *
 * The sibling of `./fleet/route.ts`, and deliberately identical in shape: one serves the supplier's
 * machines, this one serves his firm's paperwork.
 *
 * The web never calls the app backend directly: `withAuthedBackend` is what carries the renter's
 * session, refreshes an expired id token once, and flips a sticky supplier `activeRole` back to rentee
 * — none of which a browser fetch can do. `appAuthErrorResponse` forwards the backend's bilingual
 * `{ code, detail, messageAr }` envelope rather than flattening a refusal into a blank panel: these
 * are a firm's CR and VAT certificate, so a 403 is a boundary the renter should see stated.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`/marketplace/bids/${encodeURIComponent(id)}/company-documents`);
      return NextResponse.json(mapCompanyDocuments(raw));
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
