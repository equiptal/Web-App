import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { extractRequestList, mapRequestListItem } from "@/lib/contract/requests";
import { mapBidList, bidSizeCounts } from "@/lib/contract/bids";
import { buildGovernance, type GovernanceInput, type MarketBand } from "@/lib/governance/build";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/governance — everything the governance board draws, for the signed-in renter.
 *
 * ── Why one route and not six ───────────────────────────────────────────────────────────────────
 *
 * The board is a single fold over the renter's whole period: a figure at the top and a row in the
 * award table are the same arithmetic at two grains, and the four figures reconcile to the table
 * underneath them only because one function computed both. Splitting the fetch across six routes
 * would put that reconciliation in the browser, over payloads that arrived at different moments,
 * and the first stale one would show a total that does not match its own rows.
 *
 * ── Cost ────────────────────────────────────────────────────────────────────────────────────────
 *
 * One call for the request list, then two per request. That is a fan-out, and it is bounded here
 * rather than left to grow: {@link MAX_REQUESTS} caps how many requests are folded, newest first,
 * and {@link POOL} caps how many are in flight. A renter with four hundred requests gets the most
 * recent window and a note saying so, not a route that takes a minute and times out behind a proxy.
 *
 * Read-only. It writes nothing, and every call it makes is one the renter could make himself.
 */

/** Newest-first window. Big enough to be a period, small enough to stay inside a request timeout. */
const MAX_REQUESTS = 60;
/** In-flight fan-out. The backend is shared with the mobile app; this is a dashboard, not a crawl. */
const POOL = 6;

async function pooled<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i]);
    }),
  );
  return out;
}

export async function GET(req: Request) {
  return withAuthedBackend(req, async (call) => {
    try {
      const listRaw = await call(`/marketplace/my-requests?limit=${MAX_REQUESTS}`);
      const requests = extractRequestList(listRaw).map(mapRequestListItem);

      const bidsByRequest: GovernanceInput["bidsByRequest"] = {};
      const heldByRequest: GovernanceInput["heldByRequest"] = {};
      const sharesByRequest: GovernanceInput["sharesByRequest"] = {};

      await pooled(requests, POOL, async (r) => {
        /* `exact_or_larger` on purpose. The default drops every bid offering a machine bigger than
           the one asked for, so a governance page using the default would report a field of three
           on a request that drew five, and call the award uncontested when it was not. The ones
           held back are counted separately and shown as held, never silently merged into the
           field. */
        const bidsRaw = await call(`/marketplace/requests/${encodeURIComponent(r.id)}/bids?sizeMatch=exact_or_larger`).catch(() => null);
        if (bidsRaw) {
          bidsByRequest[r.id] = mapBidList(bidsRaw);
          /* `larger` is already the held-back count: the envelope counts both sides BEFORE the
             size filter runs, so it is the same number whichever way the filter is set. Deriving
             it by subtracting from the returned bids gives zero in the one state where the
             sentence matters, which is the mistake the contract warns about by name. */
          heldByRequest[r.id] = bidSizeCounts(bidsRaw).larger;
        }

        /* Only a shared request has recipients. Asking on every request would be one wasted call
           per row, and a 404 here is an answer ("never shared"), not a failure. */
        const sharesRaw = await call(`/requests/${encodeURIComponent(r.id)}/shares`).catch(() => null);
        const shares = Array.isArray((sharesRaw as { shares?: unknown[] } | null)?.shares) ? (sharesRaw as { shares: Array<{ openedAt?: string | null }> }).shares : null;
        if (shares?.length) {
          sharesByRequest[r.id] = { sent: shares.length, opened: shares.filter((s) => s.openedAt).length };
        }
      });

      /* The market band per machine type, from the live listings. Absent for a subtype nobody
         lists, and the board prints no comparison rather than comparing against an empty set. */
      const marketBySubtype: Record<string, MarketBand | undefined> = {};
      const subtypes = [...new Set(requests.map((r) => r.item?.categoryId).filter((x): x is string => !!x))];
      await pooled(subtypes, POOL, async (id) => {
        const raw = await call(`/stores?subcategoryId=${encodeURIComponent(id)}&limit=100`).catch(() => null);
        const rows = (raw as { stores?: Array<{ price?: number | null }> } | null)?.stores ?? [];
        const prices = rows.map((s) => s.price).filter((p): p is number => typeof p === "number" && p > 0).sort((a, b) => a - b);
        if (prices.length >= 3) {
          marketBySubtype[id] = { med: prices[Math.floor(prices.length / 2)], n: prices.length, lo: prices[0], hi: prices[prices.length - 1] };
        }
      });

      const projectNames: Record<string, string | undefined> = {};
      const projectsRaw = await call(`/projects`).catch(() => null);
      for (const p of (projectsRaw as { projects?: Array<{ id: string; name?: string }> } | null)?.projects ?? []) {
        projectNames[p.id] = p.name;
      }

      const suppliersRaw = await call(`/renter-suppliers`).catch(() => null);
      const registeredSupplierIds = new Set<string>(
        ((suppliersRaw as { suppliers?: Array<{ companyId?: string | null }> } | null)?.suppliers ?? [])
          .map((s) => s.companyId)
          .filter((x): x is string => !!x),
      );

      const payload = buildGovernance({
        requests,
        bidsByRequest,
        sharesByRequest,
        heldByRequest,
        marketBySubtype,
        projectNames,
        registeredSupplierIds,
      });

      return NextResponse.json({
        ...payload,
        /* Named so the page can say it is showing a window, rather than implying it has them all. */
        window: { max: MAX_REQUESTS, considered: requests.length, capped: requests.length >= MAX_REQUESTS },
      });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
