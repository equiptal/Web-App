/**
 * **The renter's other conversations with this supplier, about the same submission.**
 *
 * A port of the app's `sibling_item_tabs.dart`. A multi-item post fans out into one request PER ITEM,
 * all sharing a `requestGroupId`. A renter who posted an excavator, a loader and a crane and received
 * bids from one supplier therefore has THREE deal rooms with that one firm — and, the deal room being
 * a route, no way to move between them without backing out to the offers list.
 *
 * **NO React, NO DOM, NO i18n imports.** Labels come back as `{ en, ar }` and the caller picks one.
 *
 * The three rules, all the app's:
 *
 *  · **One tab per sibling this supplier BID ON.** A sibling he never bid on has no conversation to
 *    open, so it gets no tab — not a disabled one, not an empty thread.
 *  · **A roomless sibling still gets a tab.** Opening a conversation creates nothing; SENDING is what
 *    creates the room. Hiding the tab until a room exists would mean the renter can only reach the
 *    conversations he has already started, which is backwards.
 *  · **A group of one is not a group.** A single-item post wears a `requestGroupId` like any other;
 *    with nothing to switch between, the strip is absent rather than a strip of one.
 *
 * **Pure, because every wrong answer here looks like a working strip**: a tab for a request the renter
 * does not own, a tab pointing at the wrong room, the current room missing from its own strip. None
 * of those throw.
 */

export interface SiblingItemTab {
  requestId: string;
  bidId: string;
  /**
   * **Null on a sibling nobody has spoken in yet.** Opening such a tab starts the conversation without
   * creating anything; the first message creates the room.
   */
  dealRoomId: string | null;
  /** The tab the renter is standing in. Drawn selected, and inert. */
  isCurrent: boolean;
  label: { en: string; ar: string };
}

/**
 * The shape this rule needs off a sibling request — every field optional, because the two callers
 * reach it from two different payloads.
 *
 * No index signature: it would make every typed list item incompatible (an `unknown` value cannot
 * satisfy `string | null`), which is the opposite of the tolerance it looks like it buys.
 */
export interface SiblingRequestLike {
  id?: string | null;
  displayId?: string | null;
  shortCode?: string | null;
  equipmentItems?: unknown;
  /** The web my-requests list’s reduced item — `{ name, nameAr }`. See `siblingTabLabel`. */
  item?: unknown;
}

const txt = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * A sibling's own name, in both locales — its ITEM, not the request's.
 *
 * "Crawler excavator · 30 ton" is what distinguishes one tab from another; the request's short code
 * does not, because every sibling in a group was posted at the same moment about the same project.
 *
 * Falls back to the printed reference — `displayId`, then `shortCode` — and never to a bare id the
 * renter has never seen. A tab he cannot read is a tab he cannot choose.
 */
export function siblingTabLabel(request: SiblingRequestLike, requestId: string): { en: string; ar: string } {
  /*
   * TWO shapes, because the web reaches this from a different list than the app does.
   *
   * The app reads the raw request's `equipmentItems[0]`. The web's my-requests list has already
   * reduced the fanned-out item to `item: { name, nameAr }` — the same fact, named once by the
   * mapper. Reading both here beats shimming one into the other at the call site, where the shim
   * would be a second place that decides what a sibling is called.
   */
  const item = (request.item ?? null) as Record<string, unknown> | null;
  if (item) {
    const en = txt(item.name);
    const ar = txt(item.nameAr);
    if (en || ar) return { en: en || ar, ar: ar || en };
  }

  const items = Array.isArray(request.equipmentItems) ? (request.equipmentItems as Record<string, unknown>[]) : [];
  const first = items[0];
  if (first) {
    const join = (type: unknown, capacity: unknown) => [txt(type), txt(capacity)].filter(Boolean).join(" · ");
    const en = join(first.subtypeName ?? first.categoryName, first.capacityName);
    const ar = join(first.subtypeNameAr ?? first.categoryNameAr, first.capacityNameAr);
    // One locale missing is not a reason to fall back to a reference code — the other locale's name
    // still says which machine this is.
    if (en || ar) return { en: en || ar, ar: ar || en };
  }
  const ref = txt(request.displayId) || txt(request.shortCode) || requestId;
  return { en: ref, ar: ref };
}

/** This supplier's bid on one sibling, or null when he did not bid on it. */
export interface SupplierBidOnSibling {
  bidId: string;
  dealRoomId: string | null;
}

/**
 * Build the strip.
 *
 * `siblings` is the group's requests in the order the API returned them — which is the order the
 * renter posted the items, and so the order he expects to read them. `bidOn` answers per sibling id;
 * the caller owns the fetching so this stays pure.
 *
 * Returns an EMPTY array when there is nothing to switch between, so a caller can render
 * `tabs.length === 0 ? null : <Strip/>` without a second rule.
 */
export function buildSiblingTabs(input: {
  siblings: readonly SiblingRequestLike[];
  currentRequestId: string;
  bidOn: (requestId: string) => SupplierBidOnSibling | null;
}): SiblingItemTab[] {
  const tabs: SiblingItemTab[] = [];
  for (const raw of input.siblings) {
    const id = txt(raw?.id);
    if (!id) continue;
    const bid = input.bidOn(id);
    // No bid, no conversation, no tab.
    if (!bid) continue;
    tabs.push({
      requestId: id,
      bidId: bid.bidId,
      dealRoomId: bid.dealRoomId,
      isCurrent: id === input.currentRequestId,
      label: siblingTabLabel(raw, id),
    });
  }

  // ⚠ **A strip that cannot switch anywhere is not a strip.** One tab means the supplier bid on
  // exactly one item of the group; drawing it would spend a row telling the renter where he already is.
  if (tabs.length < 2) return [];

  // ⚠ **And a strip missing the room the renter is standing in is worse than none** — he would read it
  // as "this conversation is not part of that submission". It can happen honestly: a bid withdrawn
  // between the two reads, or a sibling list that paged short. Refuse the strip rather than draw a lie.
  if (!tabs.some((t) => t.isCurrent)) return [];

  return tabs;
}
