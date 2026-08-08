import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isOffPlatformBid,
  isOffPlatformBidId,
  mayOpenEquipmentSurface,
} from "@/lib/contract/bid-equipment-access";
import { submissionToBidCard } from "@/lib/contract/link-bids";
import type { LinkBidSubmission } from "@/lib/contract/link-bids";

const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const ROUTE_PAGE = "src/app/bids/[bidId]/equipment/page.tsx";
const BID_DETAIL_ROUTE = "src/app/api/me/bids/[id]/route.ts";
const FLEET_ROUTE = "src/app/api/me/bids/[id]/fleet/route.ts";

/* ── RM3-AC-25 · an off-platform bid never opens this surface (§6.11) ─────────────────────────── */

describe("isOffPlatformBidId — the tell that survives a page load (RM3-AC-25)", () => {
  it("reads a `link-` id as off-platform: it is a LinkBidSubmission id, not a Bid id", () => {
    expect(isOffPlatformBidId("link-sub_9")).toBe(true);
  });

  it("leaves a platform bid id alone", () => {
    expect(isOffPlatformBidId("bid_9")).toBe(false);
    expect(isOffPlatformBidId("123")).toBe(false);
  });

  it("does not match a platform id that merely CONTAINS 'link-' — the prefix is the contract", () => {
    expect(isOffPlatformBidId("bid-link-9")).toBe(false);
  });

  it("leaves an `upload:` quote alone — it is never listed among the renter's bids, and the copy here names a shared link it did not come through", () => {
    expect(isOffPlatformBidId("upload:quote.pdf")).toBe(false);
  });
});

describe("isOffPlatformBid — id OR flag, so the route can refuse before it fetches", () => {
  it("refuses on the id alone, which is all the route has before the fetch", () => {
    expect(isOffPlatformBid({ id: "link-sub_1" })).toBe(true);
  });

  it("refuses on the flag alone — a future mapper that sets it needs no second rule", () => {
    expect(isOffPlatformBid({ id: "bid_1", viaSharedLink: true })).toBe(true);
  });

  it("admits a plain platform bid", () => {
    expect(isOffPlatformBid({ id: "bid_1" })).toBe(false);
    expect(isOffPlatformBid({ id: "bid_1", viaSharedLink: false })).toBe(false);
  });

  it("admits a CONVERTED bid — a real app bid with real registered machines; only its labelling stays off-platform (AC-203)", () => {
    expect(mayOpenEquipmentSurface({ id: "bid_7" })).toBe(true);
  });
});

describe("the predicate agrees with the mapper that actually mints off-platform bids", () => {
  const submission = {
    id: "sub_42",
    companyName: "Gulf Heavy",
    items: [],
  } as unknown as LinkBidSubmission;

  it("every card `submissionToBidCard` produces is refused — by BOTH signals, independently", () => {
    const card = submissionToBidCard(submission);
    expect(card.viaSharedLink).toBe(true);
    expect(isOffPlatformBidId(card.id)).toBe(true); // the id alone would have been enough
    expect(mayOpenEquipmentSurface(card)).toBe(false);
  });
});

/* ── the route enforces it, and does so BEFORE the fetch ──────────────────────────────────────── */

describe("the route refuses an off-platform bid without claiming it does not exist (RM3-AC-25)", () => {
  const page = src(ROUTE_PAGE);

  it("checks the id in the gate, above the component that owns the fetch", () => {
    const guard = page.indexOf("isOffPlatformBidId(bidId)");
    const fetcher = page.indexOf("function BidEquipment(");
    expect(guard).toBeGreaterThan(-1);
    expect(fetcher).toBeGreaterThan(-1);
    // The guard sits in `BidEquipmentGate`, which is declared before `BidEquipment` — so the
    // fetch-owning component never mounts for an off-platform id and no request is issued.
    expect(guard).toBeLessThan(fetcher);
  });

  it("states the off-platform outcome rather than the load failure — the failure copy would claim the offer may have been withdrawn", () => {
    expect(page).toContain("offPlatformNotHere");
    expect(page).toContain("<OffPlatformState />");
  });

  it("keeps the post-fetch check on the same predicate, so the two enforcement points cannot drift", () => {
    expect(page).toContain("isOffPlatformBid(bid)");
    // The old inline condition is gone; `viaSharedLink` is judged by the predicate only.
    expect(page).not.toContain("bid.viaSharedLink");
  });

  it("renders no half-surface for a refused bid: the workspace is not reachable from either guard", () => {
    // `BidMapWorkspace` is mounted exactly once, inside the fetch-owning component.
    expect(page.match(/<BidMapWorkspace/g) ?? []).toHaveLength(1);
  });
});

describe("no entry point offers the link for an off-platform bid (RM3-AC-25, half one)", () => {
  it("GroupBids — the only linking caller — gates the href on the predicate", () => {
    const groupBids = src("src/components/requests/GroupBids.tsx");
    expect(groupBids).toContain("mayOpenEquipmentSurface(b)");
    const link = groupBids.indexOf("}/equipment`");
    const guard = groupBids.indexOf("mayOpenEquipmentSurface(b)");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(link); // the guard wraps the link, it does not follow it
  });

  it("SharedLinkBidCard — what an off-platform bid actually renders — links here at all", () => {
    expect(src("src/components/requests/SharedLinkBidCard.tsx")).not.toContain("/equipment");
  });
});

/* ── RM3-AC-01 · the route resolves exactly ONE bid ───────────────────────────────────────────── */

describe("the route resolves exactly one bidId (RM3-AC-01)", () => {
  const page = src(ROUTE_PAGE);

  it("fetches the one bid by id and nothing that returns a collection of others", () => {
    expect(page).toContain("fetchBidDetail(bidId)");
    for (const collection of ["fetchBids", "fetchAllMyRequests", "fetchReceivedBids", "fetchRequestSubmissions"]) {
      expect(page).not.toContain(collection);
    }
  });

  it("hands the workspace one bid, never a list — no sibling offer is reachable from here", () => {
    expect(page).toContain("bid={bid}");
    expect(page).not.toMatch(/bids=\{/);
  });
});

/* ── V1 / 004a §4.5 · opening the surface creates no deal room ────────────────────────────────── */

describe("opening this surface is write-free — a DealRoom row would freeze the offered count", () => {
  const page = src(ROUTE_PAGE);

  it("the route page calls no room-creating client function", () => {
    for (const write of ["startDealRoom", "ensureDealRoom", "postJson", "acceptBid"]) {
      expect(page).not.toContain(write);
    }
  });

  it("both reads the surface performs on open are GET-only handlers", () => {
    for (const route of [BID_DETAIL_ROUTE, FLEET_ROUTE]) {
      const handler = src(route);
      expect(handler).toContain("export async function GET");
      // No other HTTP verb is exported, so neither path can be made to write.
      expect(handler).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    }
  });

  it("neither handler issues a non-GET call to the app backend", () => {
    for (const route of [BID_DETAIL_ROUTE, FLEET_ROUTE]) {
      // `call(path)` with no init is a GET; a write would have to pass a method.
      expect(src(route)).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)["']/);
    }
  });
});
