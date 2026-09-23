import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse, appPublicCall, hasAppSession } from "@/lib/api/app-backend-authed";
import { localeFromRequest } from "@/lib/api/auth-server";
import { extractStoreList, mapStoreCard, mapTaxonomy, sortByStoreCount, type StoreCard, type TaxonomyNode } from "@/lib/contract/stores";

/**
 * GET /api/stores/taxonomy — the equipment taxonomy tree for the browse filters (web-app/004,
 * AC-11/24). Proxies the shared backend `GET /equipment/taxonomy` (category → subcategory →
 * measurement). This is the APP backend's taxonomy — the IDs match the `/stores` filter params —
 * and is distinct from `/api/taxonomy` (the agents/Mansour service used by web-app/002 RFQ creation).
 *
 * Guests read the PUBLIC twin (`/public/equipment/taxonomy`, guest-browse T3), which serves the same
 * tree with the same ids. The category pills and the store grid's fallback artwork therefore work
 * signed out, which is what the public store directory was for.
 *
 * `?sort=stores` puts the categories with the most stores first (the Browse pills, owner 2026-09-23).
 * OPT-IN because it reads the whole store directory to count, and the other callers only look icons
 * up by id. Best-effort: if the directory read fails, the tree comes back in the backend's order.
 */
const PAGE = 100;
const MAX_PAGES = 10;

async function allStores(get: (path: string) => Promise<unknown>): Promise<StoreCard[]> {
  const out: StoreCard[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = extractStoreList(await get(`?limit=${PAGE}&page=${page}`)).map(mapStoreCard);
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

async function sorted(taxonomy: TaxonomyNode[], get: (path: string) => Promise<unknown>): Promise<TaxonomyNode[]> {
  try {
    return sortByStoreCount(taxonomy, await allStores(get));
  } catch {
    return taxonomy;
  }
}

export async function GET(req: Request) {
  const bySize = new URL(req.url).searchParams.get("sort") === "stores";

  if (!(await hasAppSession())) {
    try {
      const locale = localeFromRequest(req);
      const raw = await appPublicCall("/public/equipment/taxonomy", locale);
      const taxonomy = mapTaxonomy(raw);
      return NextResponse.json({
        taxonomy: bySize ? await sorted(taxonomy, (q) => appPublicCall(`/public/stores${q}`, locale)) : taxonomy,
      });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  }

  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call("/equipment/taxonomy");
      const taxonomy = mapTaxonomy(raw);
      return NextResponse.json({ taxonomy: bySize ? await sorted(taxonomy, (q) => call(`/stores${q}`)) : taxonomy });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
