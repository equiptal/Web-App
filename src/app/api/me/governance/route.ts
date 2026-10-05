import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { agentsGet } from "@/lib/api/agents-relay";
import { extractRequestList, mapRequestListItem } from "@/lib/contract/requests";
import { mapBidList, bidSizeCounts } from "@/lib/contract/bids";
import { submissionToBidCard, type LinkBidSubmission } from "@/lib/contract/link-bids";
import { linkTermVerdict, linkTermsWereStated } from "@/lib/governance/link-conflicts";
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
/**
 * In-flight fan-out. The backend is shared with the mobile app; this is a dashboard, not a crawl.
 *
 * Raised from 6 to 14 on 2026-10-03. At 6, an account with 57 requests made 114 round trips
 * nineteen deep, and the board showed nothing at all until the last of them answered. These are
 * reads the renter is entitled to make and would make one at a time by clicking through his own
 * requests; the only thing being spent is concurrency.
 */
const POOL = 14;

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
  rollup?: { bidsApp?: number; bidsLink?: number; awards?: number; rooms?: number; lastBidAt?: string | null } | null;
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

        /* ── The off-platform half of the field ────────────────────────────────────────────
           ⚠️ Shared-link submissions are NOT in `/marketplace/requests/:id/bids`. They live on
           their own agents endpoint, and this route never called it — so for as long as the
           board has existed it has drawn only the app bids and reported "0 bids from
           off-platform suppliers" on accounts that had them. Owner, 2026-10-03: *"how no bids
           from the link? these are easy data from bids and from bid submission offplatfrom"*.

           It also carries `openedCount`, which is the link's own reach, so asking for it makes
           the separate `/shares` call unnecessary on most requests. */
        const subRaw = await agentsGet<{
          submissions?: LinkBidSubmission[];
          openedCount?: number;
        }>(`/requests/${encodeURIComponent(r.id)}/bid-submissions`).catch(() => null);
        const submissions = Array.isArray(subRaw?.submissions) ? subRaw.submissions : [];
        if (submissions.length) {
          /* One card per submission, from the same mapper the comparison and My Bids use, so an
             off-platform offer is counted, priced and compared exactly as they count it. */
          bidsByRequest[r.id] = [
            ...(bidsByRequest[r.id] ?? []),
            ...submissions.map((sub) => {
              const item = sub.items?.[0] ?? null;
              const verdict = linkTermVerdict(item);
              const stated = linkTermsWereStated(item);
              return ({
              ...submissionToBidCard(sub),
              /* ⚠️ The mapper returns `conflictCount: 0` for EVERY submission. That is right for
                 the comparison and My Bids, which list the confirmations one row each, and wrong
                 here: this is the one surface that counts rather than lists, so a hard zero
                 recorded every off-platform bid as having met every term and flattered both the
                 compliance figure and the cheapest-compliant count. Derived from the supplier's
                 own Yes/No answers instead — see `link-conflicts.ts`. */
              conflictCount: verdict.missed.length,
              matchCount: verdict.met.length,
              /* Named, not just counted, so the row's drill-down can say WHICH terms failed. The
                 fold reads `terms` for exactly that. */
              terms: {
                equipment: [],
                contract: [
                  ...verdict.met.map((labelEn) => ({ key: labelEn, labelEn, labelAr: "", state: "matched" as const })),
                  ...verdict.missed.map((labelEn) => ({ key: labelEn, labelEn, labelAr: "", state: "conflict" as const })),
                ],
                supplier: [],
              },
              /* ⚠️ A request that stated no terms leaves the bid UNJUDGED, which is not the same
                 as compliant. Recording it as having met everything is the bug this is fixing one
                 level down, so it is marked and the board can say "no terms were stated". */
              note: stated ? null : "No terms were stated on this request, so this bid was never judged against any",
              /* ⚠️ The shared mapper does not carry these across, because the surfaces it was
                 written for (the comparison matrix, My Bids) do not show them. The SUBMISSION
                 carries all three — an off-platform supplier types his CR, VAT and national
                 address into the bid form — and this board's whole question is whether the firm
                 you paid is identifiable. Without the overlay every link supplier reads "no CR
                 on file", which is a wrong answer that looks exactly like a real finding.
                 Overlaid here rather than in the mapper: it is shared with two other surfaces
                 and this is the only one that asks. */
              supplierCrNumber: sub.crNumber ?? null,
              supplierVatNumber: sub.vatNumber ?? null,
              supplierNationalAddress: sub.nationalAddress ?? null,
              supplierCity: sub.city ?? null,
              supplierEmail: sub.contactEmail ?? null,
            });
            }),
          ];
        }

        /* Only a shared request has recipients, and the submissions call has already told us
           whether this is one. Asking on every request would be one wasted round trip per row,
           and a 404 here is an answer ("never shared"), not a failure. */
        const shared = submissions.length > 0 || (subRaw?.openedCount ?? 0) > 0;
        if (shared) {
          const sharesRaw = await call(`/requests/${encodeURIComponent(r.id)}/shares`).catch(() => null);
          const shares = Array.isArray((sharesRaw as { shares?: unknown[] } | null)?.shares) ? (sharesRaw as { shares: Array<{ openedAt?: string | null }> }).shares : null;
          sharesByRequest[r.id] = {
            /* How many it was SENT to is only known from the share rows. `openedCount` is the
               link's own counter and is the better "opened" of the two: a link forwarded on by
               the first recipient is opened by someone who was never sent it. */
            sent: shares?.length ?? submissions.length,
            opened: subRaw?.openedCount ?? shares?.filter((x) => x.openedAt).length ?? 0,
          };
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
         row `undefined` and the board fell through to "Unnamed project" on sites that are named.
         ⚠️ And most are NOT named: measured on staging, 28 projects carry 3 titles between them,
         while all 28 carry a `locationLabel`. A column that prints nothing for 25 of 28 sites is
         a broken column, so an untitled project falls back to WHERE it is, which is what the
         renter recognises it by anyway. */
      for (const p of asArray<{ id?: string; title?: string | null; name?: string | null; locationLabel?: string | null }>(projectsRaw, "projects")) {
        if (!p.id) continue;
        const named = (p.title ?? p.name ?? "").trim();
        projectNames[p.id] = named || (p.locationLabel ?? "").trim() || undefined;
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
        /* The registry counts EVERY bid this firm has ever sent, not only the ones inside the
           newest-sixty window the board folds. Two different questions, both worth answering. */
        rollup: s.rollup
          ? {
              bidsApp: s.rollup.bidsApp ?? 0,
              bidsLink: s.rollup.bidsLink ?? 0,
              awards: s.rollup.awards ?? 0,
              rooms: s.rollup.rooms ?? 0,
              lastBidAt: s.rollup.lastBidAt ?? null,
            }
          : null,
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
