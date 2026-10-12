/**
 * **Suppliers mode: every bid, read one supplier at a time** (owner, 2026-10-11, multi-item
 * decisions 4 and 5, `docs/multi-item-decisions.md`). Pure, so the grouping is tested without a page.
 *
 * The app's rule (`supplier_bids_view.dart`): you always read ONE supplier, newest bidder first, no
 * «All». His bids that answer the same submission sit together in one light-blue panel; a request
 * with only one of his bids is a plain card.
 */

import { bidSupplierKey } from "./bids";
import type { InboxBid } from "./inbox";
import type { RequestGroup, RequestListItem } from "./requests";

/** One supplier, as the suppliers row draws him. */
export interface SupplierEntry {
  /** `company → member → name`, how every surface counts a counterparty. */
  key: string;
  name: string;
  logoUrl: string | null;
  /** What `/inbox?supplier=` filters by: his firm, else the member. */
  linkId: string | null;
  bids: InboxBid[];
  /** Distinct requests (machines) he bid on. */
  requestCount: number;
  newestAt: number;
}

const at = (iso: string | null) => {
  const n = iso ? new Date(iso).getTime() : NaN;
  return Number.isNaN(n) ? 0 : n;
};

/** The suppliers who bid on the renter's requests, newest bidder first. */
export function supplierEntries(received: readonly InboxBid[]): SupplierEntry[] {
  const map = new Map<string, SupplierEntry>();
  for (const b of received) {
    const key = bidSupplierKey(b);
    let e = map.get(key);
    if (!e) {
      e = {
        key,
        name: b.supplierName,
        logoUrl: b.supplierLogoUrl,
        linkId: b.supplierCompanyId ?? b.supplierId,
        bids: [],
        requestCount: 0,
        newestAt: 0,
      };
      map.set(key, e);
    }
    e.bids.push(b);
    e.logoUrl = e.logoUrl ?? b.supplierLogoUrl;
    e.newestAt = Math.max(e.newestAt, at(b.createdAt));
  }
  for (const e of map.values()) e.requestCount = new Set(e.bids.map((b) => b.request.id)).size;
  return [...map.values()].sort((a, b) => b.newestAt - a.newestAt);
}

/** His bids on ONE submission, in the order the renter asked for its machines. */
export interface SupplierRun {
  /** The submission, when the renter's request list holds it. */
  group: RequestGroup | null;
  key: string;
  /** Bid id → the machine (request item) it answers, in the request's own order. */
  bids: { bidId: string; item: RequestListItem | null }[];
}

/**
 * His bids, in runs per submission: submissions by his newest bid first, machines inside a run in
 * the request's order. A bid whose request is not in the list (an older page, a hidden request) is
 * its own run, so it is never dropped.
 */
export function supplierRuns(entry: SupplierEntry, groups: readonly RequestGroup[]): SupplierRun[] {
  const groupOfItem = new Map<string, RequestGroup>();
  for (const g of groups) for (const it of g.items) groupOfItem.set(it.id, g);
  const runs = new Map<string, { run: SupplierRun; newest: number }>();
  for (const b of entry.bids) {
    const g = groupOfItem.get(b.request.id) ?? null;
    const key = g?.id ?? `req:${b.request.id}`;
    let r = runs.get(key);
    if (!r) {
      r = { run: { group: g, key, bids: [] }, newest: 0 };
      runs.set(key, r);
    }
    r.run.bids.push({ bidId: b.bidId, item: g?.items.find((i) => i.id === b.request.id) ?? null });
    r.newest = Math.max(r.newest, at(b.createdAt));
  }
  return [...runs.values()]
    .sort((a, b) => b.newest - a.newest)
    .map(({ run }) => {
      const order = run.group?.items.map((i) => i.id) ?? [];
      const pos = (id: string | undefined) => (id ? order.indexOf(id) : -1);
      run.bids.sort((a, b) => pos(a.item?.id) - pos(b.item?.id));
      return run;
    });
}
