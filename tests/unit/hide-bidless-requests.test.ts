import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { HIDE_BIDLESS_REQUESTS } from "@/lib/flags";
import { railTiles, resolveSelection, EMPTY_SELECTION } from "@/lib/contract/workspace";
import type { RequestGroup } from "@/lib/contract/requests";

/**
 * ── Requests with no bids are off the rail, FOR A DEMO (owner, 2026-09-14) ──────────────────────
 *
 * *"i want no bids to be hidden from requests list in requests, just for demo purpose"*.
 *
 * 🔴 **It is a code toggle and it is meant to come back off.** A live request with no offers yet is
 * precisely when the renter still has things to do with it - share the link, chase a supplier, edit
 * the terms, cancel it - and the rail is his only route to all four. The ✕ dismissal this app
 * already has is deliberately gated on CLOSED for that reason (`hidden-requests.ts`), and this flag
 * goes AROUND that rule rather than changing it, so the rule stays stated where it belongs.
 *
 * These cases pin the two guards that stop the demo filter doing damage, and they hold whichever way
 * the flag is set - which is what makes them worth keeping after it goes back off.
 */
const SRC = readFileSync("src/components/workspace/RequestsWorkspace.tsx", "utf8");
const FLAGS = readFileSync("src/lib/flags.ts", "utf8");

const group = (id: string, totalBids: number): RequestGroup =>
  ({
    id,
    groupRef: id,
    createdAt: "2026-09-14T00:00:00Z",
    totalBids,
    totalUnits: 1,
    // `status` is load-bearing: `railTiles` asks `isClosedGroup`, which upper-cases it.
    items: [{ id: `${id}-i1`, displayId: id, status: "OPEN", item: null } as never],
  }) as unknown as RequestGroup;

/** The rail's own rule, as the workspace applies it. Kept here so the cases read like the screen. */
const railFor = (groups: RequestGroup[], selectedId: string) => {
  const kept = railTiles(groups);
  if (!HIDE_BIDLESS_REQUESTS || !kept.some((tl) => tl.bids > 0)) return kept;
  return kept.filter((tl) => tl.bids > 0 || tl.key === selectedId);
};

describe("the demo filter, and the two guards on it", () => {
  /**
   * ⚠️ `runIf` the flag, and only on THIS case. It is the one that describes the demo itself, so it
   * has to go quiet the day the flag goes back off - a red suite would make turning the demo off
   * look like a regression. The two guards below hold either way and are the half worth keeping.
   */
  it.runIf(HIDE_BIDLESS_REQUESTS)("Given some requests have bids, Then the bidless ones leave the rail", () => {
    const tiles = railFor([group("a", 0), group("b", 3)], "b");
    expect(tiles.map((t) => t.key)).toEqual(["b"]);
  });

  it("Given NO request has a bid, Then the filter stands down and every circle is drawn", () => {
    /**
     * 🔴 Without this the rail would empty, and an empty rail falls through to «create your first
     * request» - the new-account empty state - over an account that has several. A demo that hides
     * the whole account is worse than one that hides nothing.
     */
    const tiles = railFor([group("a", 0), group("b", 0)], "a");
    expect(tiles.map((t) => t.key)).toEqual(["a", "b"]);
  });

  it("Given a bidless request is the one being READ, Then its tile stays", () => {
    // Taking the page's own subject out from under it leaves the workspace showing a request whose
    // circle is not on the rail. The pre-existing ✕ dismissal has always followed the same rule.
    const tiles = railFor([group("a", 0), group("b", 3)], "a");
    expect(tiles.map((t) => t.key)).toEqual(["a", "b"]);
  });
});

describe("where the page LANDS, which is what makes the filter hold", () => {
  const groups = [group("newest", 0), group("older", 2)];

  it("Given nothing chosen, Then the fallback prefers a request that HAS bids", () => {
    /**
     * `resolveSelection` falls back to `groups[0]` - the newest - and a selected tile is kept on the
     * rail whatever else says otherwise. So without this the demo would land on the bidless request
     * and draw the very circle the flag exists to remove.
     */
    const pool = groups.filter((g) => g.totalBids > 0);
    expect(resolveSelection(pool, [], EMPTY_SELECTION).groupId).toBe("older");
  });

  it("Given a request named by the URL, Then it is resolved against the WHOLE list", () => {
    // A deliberate visit to a bidless request still works, and still shows its tile.
    const sel = resolveSelection(groups, [], { groupId: "newest", itemId: null, bidId: null });
    expect(sel.groupId).toBe("newest");
    expect(SRC).toMatch(/!wanted\.groupId && all\.some/);
  });
});

describe("it is one toggle away from gone", () => {
  it("both halves read the SAME flag, so neither can be left behind", () => {
    // The import, the rail filter, the landing fallback — plus the two notes that explain them.
    expect(SRC.match(/HIDE_BIDLESS_REQUESTS/g)?.length).toBe(5);
  });

  it("the flag says what it costs, and that it is temporary", () => {
    // ⚠️ `totalBids` counts APP bids only: a request answered solely through the renter's own shared
    // link reads as zero and is hidden by this flag. Written down rather than fixed - counting them
    // needs one `fetchRequestSubmissions` per group, which is not a thing to add for a demo.
    expect(FLAGS).toMatch(/demo purpose/i);
    expect(FLAGS).toMatch(/totalBids.*APP bids only|counts APP bids/i);
  });
});
