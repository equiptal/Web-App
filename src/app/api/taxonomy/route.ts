import { NextResponse } from "next/server";
import { TAXONOMY } from "@/lib/taxonomy/fixture";
import { useRealApp } from "@/lib/config/env";
import { TAXONOMY_INCLUDE_HIDDEN } from "@/lib/flags";
import { agentsGet } from "@/lib/api/agents-backend";
import { nodesToTree } from "@/lib/api/app-adapters";
import type { TaxonomyNode, TaxonomyResponse } from "@/lib/contract/app";

// Always fetch the live catalogue — a node/size added in the marketplace must appear in the
// dropdowns without a redeploy. (agentsGet already sends cache:"no-store"; this pins the route
// itself dynamic so Next never serves a statically-cached catalogue.)
export const dynamic = "force-dynamic";

/**
 * GET /api/taxonomy — the equipment catalogue.
 * Real (AGENTS_API_URL + token set): proxies GET /agents/taxonomy and shapes the flat node list
 * into the UI tree. Otherwise serves the stand-in fixture. Falls back to the fixture on error so the
 * app keeps working on a misconfigured/unreachable staging.
 */
export async function GET() {
  if (useRealApp) {
    try {
      /* `includeHidden` is the endpoint's own flag and it already returns `visibility` on every
         node; without it the catalogue excludes HIDDEN, which is why a renter searching TYPE for a
         hidden machine gets «—» (owner, 2026-09-13). 🔴 Held at false until the backend's B2 — the
         create REFUSES a hidden subtype today, so offering one here buys a 422 at the end of the
         card. See `TAXONOMY_INCLUDE_HIDDEN`. */
      const query = TAXONOMY_INCLUDE_HIDDEN ? "?tenant=default&includeHidden=true" : "?tenant=default";
      const data = await agentsGet<TaxonomyResponse | TaxonomyNode[]>(`/agents/taxonomy${query}`);
      const nodes = Array.isArray(data) ? data : data.nodes;
      return NextResponse.json(nodesToTree(nodes), { status: 200 });
    } catch (err) {
      console.error("[taxonomy] real fetch failed, using fixture:", err);
    }
  }
  return NextResponse.json(TAXONOMY, { status: 200 });
}
