import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { mapTaxonomy } from "@/lib/contract/stores";

/**
 * GET /api/stores/taxonomy — the equipment taxonomy tree for the browse filters (web-app/004,
 * AC-11/24). Proxies the shared backend `GET /equipment/taxonomy` (category → subcategory →
 * measurement). This is the APP backend's taxonomy — the IDs match the `/stores` filter params —
 * and is distinct from `/api/taxonomy` (the agents/Mansour service used by web-app/002 RFQ creation).
 * Authed-only: guests don't get the taxonomy filter (the browse UI hides it when signed out).
 */
export async function GET(req: Request) {
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call("/equipment/taxonomy");
      return NextResponse.json({ taxonomy: mapTaxonomy(raw) });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
