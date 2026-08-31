import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse, appPublicCall, hasAppSession } from "@/lib/api/app-backend-authed";
import { localeFromRequest } from "@/lib/api/auth-server";
import { mapTaxonomy } from "@/lib/contract/stores";

/**
 * GET /api/stores/taxonomy — the equipment taxonomy tree for the browse filters (web-app/004,
 * AC-11/24). Proxies the shared backend `GET /equipment/taxonomy` (category → subcategory →
 * measurement). This is the APP backend's taxonomy — the IDs match the `/stores` filter params —
 * and is distinct from `/api/taxonomy` (the agents/Mansour service used by web-app/002 RFQ creation).
 *
 * Guests read the PUBLIC twin (`/public/equipment/taxonomy`, guest-browse T3), which serves the same
 * tree with the same ids. The category pills and the store grid's fallback artwork therefore work
 * signed out, which is what the public store directory was for.
 */
export async function GET(req: Request) {
  if (!(await hasAppSession())) {
    try {
      const raw = await appPublicCall("/public/equipment/taxonomy", localeFromRequest(req));
      return NextResponse.json({ taxonomy: mapTaxonomy(raw) });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  }

  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call("/equipment/taxonomy");
      return NextResponse.json({ taxonomy: mapTaxonomy(raw) });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
