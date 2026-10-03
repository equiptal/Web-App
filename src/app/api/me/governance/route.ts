import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { agentsGet } from "@/lib/api/agents-relay";
import { extractRequestList, mapRequestListItem } from "@/lib/contract/requests";
import { mapBidList, bidSizeCounts } from "@/lib/contract/bids";
import { buildGovernance, type GovernanceInput, type RegistryEntry } from "@/lib/governance/build";

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
 * ── Two backends, and the bug that came of forgetting it ────────────────────────────────────────
 *
 * The requests and their bids live on **app-backend**, reached with `call`. The renter's projects
 * and his own supplier registry live on **agents-backend**, reached with {@link agentsGet}. This
 * route asked `call` for `/projects` and `/renter-suppliers` for a while. Both 404'd, both failures
 * were swallowed by the `.catch(() => null)` that is there for genuinely optional data, and the
 * board drew every row as "Unnamed project" and every firm as "not registered" — wrong answers
 * that are indistinguishable from a renter who has simply filled neither in.
 *
 * ── Cost ────────────────────────────────────────────────────────────────────────────────────────
 *
 * One call for the request list, then two per request, plus two flat. That is a fan-out, and it is
 * bounded here rather than left to grow: {@link MAX_REQUESTS} caps how many requests are folded,
 * newest first, and {@link POOL} caps how many are in flight. A renter with four hundred requests
 * gets the most recent window and a note saying so, not a route that times out behind a proxy.
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

/** The agents backend returns a bare array on some handlers and `{ items: [] }` on others. */
function asArray<T>(raw: unknown, key: string): T[] {
  if (Array.isArray(raw)) return raw as T[];
  const inner = raw && typeof raw === "object" ? (raw as Record<string, unknown>)[key] : null;
  return Array.isArray(inner) ? (inner as T[]) : [];
}

/** The registry row as the agents backend sends it. Everything but the name is optional. */
type RawSupplier = {
  id?: string;
  supplierId?: string | number | null;
  companyId?: string | null;
  crNumber?: string | null;
  name?: string | null;
  vendorRegistered?: boolean | null;
  onMoedatech?: boolean | null;
  kind?: string | null;
  groups?: string[] | null;
};

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

      /* ── The two agents-backend reads ──────────────────────────────────────────────────────────
         Flat, not per request, and fired together: neither depends on the other and each is one
         call for the whole board. */
      const [projectsRaw, suppliersRaw] = await Promise.all([
        agentsGet<unknown>("/projects"),
        agentsGet<unknown>("/renter-suppliers"),
      ]);

      const projectNames: Record<string, string | undefined> = {};
      /* `title`, not `name`. A `Project` has no `name` column at all, so reading one gave every
         row `undefined` and the board fell through to "Unnamed project" on sites that are named. */
      for (const p of asArray<{ id?: string; title?: string | null; name?: string | null }>(projectsRaw, "projects")) {
        if (p.id) projectNames[p.id] = p.title ?? p.name ?? undefined;
      }

      const registry: RegistryEntry[] = asArray<RawSupplier>(suppliersRaw, "suppliers").map((s) => ({
        supplierId: s.supplierId != null ? String(s.supplierId) : null,
        companyId: s.companyId ?? null,
        crNumber: s.crNumber ?? null,
        name: s.name ?? "",
        /* The registry's own boolean. Being on the list is not the same as being an approved
           vendor — a firm lands on it the moment it bids through a shared link, and the tick is
           the renter's separate decision about it. */
        vendorRegistered: s.vendorRegistered === true,
        onMoedatech: s.onMoedatech ?? s.kind === "platform",
        groups: Array.isArray(s.groups) ? s.groups : [],
      }));

      const payload = buildGovernance({
        requests,
        bidsByRequest,
        sharesByRequest,
        heldByRequest,
        projectNames,
        registry,
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
