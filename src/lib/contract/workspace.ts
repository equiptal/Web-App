/**
 * The requests workspace — the pure parts (docs/implementation-plans/requests-workspace/plan.md).
 *
 * One page holds three nested choices: which request, which item within it, and which supplier's bid.
 * Each one narrows the next, and a change higher up has to leave the ones below it valid — pick a
 * different request and the item you were looking at no longer exists. That resolution is arithmetic
 * over lists, so it lives here where it can be tested without a browser.
 *
 * **NO React, NO DOM, NO i18n.**
 */

import { bucketBidTerms, type BidCard, type TermRow } from "./bids";
import type { RequestGroup, RequestListItem } from "./requests";

/** Where a bid came from. The filter above the tabs switches between these. */
export type BidSource = "app" | "offline";

/** The source filter's three positions. */
export type SourceFilter = "all" | BidSource;

/** A bid as the workspace holds it: the card plus where it arrived from. */
export interface WorkspaceBid {
  card: BidCard;
  source: BidSource;
}

/** One circle in the top rail. */
export interface RailTile {
  /** The group's id — what a selection stores. */
  key: string;
  /** `RFQ-NNNNN` for a multi-item submission, `REQ-NNNNN` for a lone request. */
  label: string;
  /** Total units asked for across the group. Rendered only when it is more than one. */
  units: number;
  imageUrl: string | null;
  /** Greyed and captioned in the rail; still selectable, because its bids are still worth reading. */
  closed: boolean;
}

/** The three choices the page is currently showing. */
export interface WorkspaceSelection {
  groupId: string | null;
  /** The `RequestListItem.id` — one fanned-out request, which is what bids hang off. */
  itemId: string | null;
  bidId: string | null;
}

export const EMPTY_SELECTION: WorkspaceSelection = { groupId: null, itemId: null, bidId: null };

/**
 * A request whose bidding is over. `EXPIRED` and `FORCE_EXPIRED` are included deliberately: to the
 * renter reading the rail they are the same fact — nothing more will arrive here.
 */
const CLOSED_STATUSES = new Set(["CLOSED", "HUB_CLOSED", "EXPIRED", "FORCE_EXPIRED"]);

export function isClosedRequest(status: string): boolean {
  return CLOSED_STATUSES.has(status.toUpperCase());
}

/** A group is closed only when every request in it is — one live item keeps the project live. */
export function isClosedGroup(group: RequestGroup): boolean {
  return group.items.length > 0 && group.items.every((i) => isClosedRequest(i.status));
}

/** The rail, in the order `groupRequests` produced (newest first). */
export function railTiles(groups: RequestGroup[]): RailTile[] {
  return groups.map((g) => ({
    key: g.id,
    // The RFQ code is the group's own name; a lone request has none and answers to its REQ id.
    label: g.groupRef ?? g.items[0]?.displayId ?? g.id,
    units: g.totalUnits,
    imageUrl: g.items.find((i) => i.item?.imageUrl)?.item?.imageUrl ?? null,
    closed: isClosedGroup(g),
  }));
}

/**
 * Resolve a selection against the data actually loaded, and repair it where it points at something
 * that is not there. Called on every render, so the page never has to remember to fix itself:
 *
 * - no group chosen, or one that has since gone → the first group;
 * - an item that does not belong to the resolved group → that group's first item;
 * - a bid that is not among the item's bids → the first bid, or nothing when none have arrived.
 *
 * Passing `bids` for a different item is the normal case mid-load; it resolves to no bid, which is
 * exactly right — the bids for the newly chosen item have not been fetched yet.
 */
export function resolveSelection(
  groups: RequestGroup[],
  bids: WorkspaceBid[],
  wanted: WorkspaceSelection,
): WorkspaceSelection {
  const group = groups.find((g) => g.id === wanted.groupId) ?? groups[0] ?? null;
  if (!group) return EMPTY_SELECTION;

  const item = group.items.find((i) => i.id === wanted.itemId) ?? group.items[0] ?? null;
  if (!item) return { groupId: group.id, itemId: null, bidId: null };

  const bid = bids.find((b) => b.card.id === wanted.bidId) ?? bids[0] ?? null;
  return { groupId: group.id, itemId: item.id, bidId: bid?.card.id ?? null };
}

/** The item a resolved selection points at. */
export function selectedItem(groups: RequestGroup[], sel: WorkspaceSelection): RequestListItem | null {
  const group = groups.find((g) => g.id === sel.groupId);
  return group?.items.find((i) => i.id === sel.itemId) ?? null;
}

/** The group a resolved selection points at. */
export function selectedGroup(groups: RequestGroup[], sel: WorkspaceSelection): RequestGroup | null {
  return groups.find((g) => g.id === sel.groupId) ?? null;
}

/** The bids the source filter admits, in the order they were loaded. */
export function filterBySource(bids: WorkspaceBid[], filter: SourceFilter): WorkspaceBid[] {
  return filter === "all" ? bids : bids.filter((b) => b.source === filter);
}

/** The dial beside `Terms` on a bid card: how much of the terms this supplier answered. */
export interface TermsDial {
  /** Answered the way the request asked, or since agreed. */
  met: number;
  /** Answered, but against what was asked. */
  against: number;
  /** Not answered — the renter is still waiting on it. */
  unanswered: number;
  total: number;
}

/**
 * Read the dial off a bid's terms.
 *
 * The two sources are counted differently, and deliberately — this mirrors what the shipped cards
 * already do rather than inventing a third rule. An **app** bid is measured against the six
 * negotiable terms the app itself tracks, where an unanswered one is a real gap the renter can chase.
 * An **off-platform** bid has no negotiation, so it is measured against every required term the
 * supplier actually answered on the form — which is why nothing there lands in `unanswered`.
 *
 * This is a measure of how completely the supplier answered, and never of how good the offer is;
 * bid quality is `QualityRing`, a different thing on a different scale.
 */
export function termsDial(bid: BidCard, source: BidSource): TermsDial {
  const { counts } = bucketBidTerms(bid.terms, bid.negotiableTerms, source === "offline" ? { all: true } : undefined);
  const met = counts.matched;
  const against = counts.conflict;
  const unanswered = counts.pending;
  return { met, against, unanswered, total: met + against + unanswered };
}

/** What the drawer's Edit and Cancel controls may do with this request. */
export interface RequestActions {
  /** Edit is shown. It stays visible after a bid lands rather than vanishing. */
  canEdit: boolean;
  /** Shown, but spent — disabled, and it must say why. */
  editCapUsed: boolean;
  /** Editing costs the one allowed post-bid edit, so it is confirmed first. */
  editNeedsConfirm: boolean;
  canCancel: boolean;
}

/**
 * Mirror of the mobile app's rule (`request_detail_page.dart:165-174`, `638-674`), which the web
 * contradicted: web hid Edit the moment a bid arrived, the app has allowed one post-bid edit since
 * 2026-08-05 and it is live on `main`.
 *
 * - Open or active → Edit is shown. It never disappears, so the renter is told why rather than left
 *   hunting for a button that used to be there.
 * - No bids → edit freely, as often as you like.
 * - Bids, first edit → confirm, because it is the only one.
 * - Bids, edit spent → disabled, with the reason.
 *
 * The cap is the server's to enforce (`request.service.ts:830` updates conditionally on
 * `bidCount > 0 && renteeEditUsed === false`); this only decides what the renter is shown, so that
 * the refusal arrives before the form rather than after it.
 */
export function requestActions(req: Pick<RequestListItem, "status" | "bidCount" | "renteeEditUsed">): RequestActions {
  const live = req.status === "OPEN" || req.status === "ACTIVE";
  const hasBids = req.bidCount > 0;
  return {
    canEdit: live,
    editCapUsed: live && hasBids && req.renteeEditUsed,
    editNeedsConfirm: live && hasBids && !req.renteeEditUsed,
    canCancel: live,
  };
}

/**
 * The bid ids holding the lowest figure in a column. Ties all win — two suppliers charging the same
 * to deliver are equally the cheapest, and picking one of them by list order would invent a
 * difference the quotes do not contain. A bid with nothing stated cannot win.
 */
export function cheapest(bids: WorkspaceBid[], value: (b: WorkspaceBid) => number | null): Set<string> {
  const stated = bids.filter((b) => {
    const v = value(b);
    return v != null && Number.isFinite(v);
  });
  if (stated.length < 2) return new Set(); // nothing to be cheaper *than*
  const low = Math.min(...stated.map((b) => value(b) as number));
  return new Set(stated.filter((b) => value(b) === low).map((b) => b.card.id));
}

/** The first term row matching any of these keys, looked for wherever the card keeps its terms. */
export function findTerm(bid: BidCard, keys: string[]): TermRow | null {
  const wanted = new Set(keys);
  const pools = [bid.negotiableTerms ?? [], bid.terms.contract, bid.terms.equipment, bid.terms.supplier];
  for (const pool of pools) {
    const hit = pool.find((r) => wanted.has(r.key));
    if (hit) return hit;
  }
  return null;
}

/** How many bids each filter position would show — the counts beside the filter. */
export function sourceCounts(bids: WorkspaceBid[]): Record<SourceFilter, number> {
  return {
    all: bids.length,
    app: bids.filter((b) => b.source === "app").length,
    offline: bids.filter((b) => b.source === "offline").length,
  };
}
