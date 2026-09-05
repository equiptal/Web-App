import { describe, expect, it } from "vitest";
import {
  HOME_BUBBLE_TYPES,
  isBubbleWorthy,
  notificationHref,
  type NotificationItem,
} from "@/lib/contract/notifications";

/**
 * **Every notification lands where it belongs** (owner, 2026-09-05: *"notifications are view-only and
 * not wired to anything; each bid must go directly to the exact request"*).
 *
 * Two failures are pinned here, because they are the two that made the bell useless:
 *
 *  1. A type that returns `null` is an inert row — the renter presses it and nothing happens.
 *  2. A link into a RETIRED route is worse than none: `middleware.ts` 308s `/requests/<id>` and
 *     `/compare` to `/requests` and drops the id and the query, so the renter lands on some other
 *     request and believes the product lost his.
 */
const row = (type: string, data?: Record<string, unknown>): NotificationItem => ({
  id: "n1",
  type,
  title: "t",
  body: "b",
  roleContext: "rentee",
  isRead: false,
  createdAt: "2026-09-05T00:00:00.000Z",
  data,
});

/** The routes the workspace replaced, and the org page that followed them (2026-08-25 / 2026-09-04). */
const RETIRED = [/^\/requests\/[^?]/, /^\/compare/, /^\/company/];

describe("a bid notification opens the exact request it is about", () => {
  const REQUEST_SCOPED = ["bid.received", "bid.updated", "bid.price_changed", "bid.expired", "bid.withdrawn"];

  for (const type of REQUEST_SCOPED) {
    it(`${type} → the workspace, carrying the request id`, () => {
      expect(notificationHref(row(type, { requestId: "req_7", bidId: "bid_2" }))).toBe("/requests?r=req_7");
    });
  }

  it("says nothing rather than guessing when the row carries no request", () => {
    // Landing on the workspace's default selection is what the owner reported as the bug; a dead row
    // is at least honest about having no target.
    expect(notificationHref(row("bid.received"))).toBeNull();
  });

  it("encodes the id — a request id is opaque and may not be URL-safe", () => {
    expect(notificationHref(row("bid.received", { requestId: "a/b c" }))).toBe("/requests?r=a%2Fb%20c");
  });
});

describe("no notification links into a route that was retired", () => {
  const EVERY_TYPE = [
    "bid.received", "bid.updated", "bid.price_changed", "bid.countered", "bid.expired", "bid.withdrawn",
    "bid.accepted", "request.broadcast", "request.direct", "request.details_changed", "request.fully_covered",
    "deal.created", "deal.message", "deal.term_updated", "deal.rate_proposed", "deal.rate_response",
    "deal.renegotiation_requested", "deal.abandoned", "deal.released", "deal.closed",
    "deal.awaiting_confirmation", "deal.acceptance_withdrawn", "deal.something_new",
    "company.join_requested", "company.dissolved", "verification.approved", "referral.used",
    "RFQ_CLOSED_FOMO", "post_deal_review_prompt", "equipment.rejected", "message.new",
  ];

  it("every href this map can produce survives the middleware untouched", () => {
    for (const type of EVERY_TYPE) {
      const href = notificationHref(row(type, { requestId: "r1", bidId: "b1", dealRoomId: "d1", jobId: "j1" }));
      if (href == null) continue;
      for (const dead of RETIRED) expect(href, `${type} → ${href}`).not.toMatch(dead);
    }
  });
});

describe("the negotiation rows open the sheet, and the conversation opens the chat", () => {
  it("bid.countered opens the three-styles sheet — the supplier answered a counter", () => {
    expect(notificationHref(row("bid.countered", { dealRoomId: "d9", requestId: "r1", bidId: "b1" })))
      .toBe("/deal-room/d9?act=counter");
  });

  it("falls back to the request when an older bid.countered carries no room", () => {
    expect(notificationHref(row("bid.countered", { requestId: "r1" }))).toBe("/requests?r=r1");
  });

  for (const type of ["deal.rate_proposed", "deal.rate_response", "deal.renegotiation_requested"]) {
    it(`${type} opens the sheet`, () => {
      expect(notificationHref(row(type, { dealRoomId: "d9" }))).toBe("/deal-room/d9?act=counter");
    });
  }

  it("a message opens the MAP's chat dock when the row names a bid (owner, 2026-08-26)", () => {
    // The deal room is no longer where a renter is sent to talk — the conversation lives in the
    // dock beside the supplier's yards.
    expect(notificationHref(row("deal.message", { dealRoomId: "d9", bidId: "b3" })))
      .toBe("/bids/b3/equipment?chat=1");
  });

  it("and falls back to the room when it names only the room", () => {
    expect(notificationHref(row("deal.message", { dealRoomId: "d9" }))).toBe("/deal-room/d9");
  });

  it("an unknown deal.* still lands somewhere — the family grows faster than this file", () => {
    expect(notificationHref(row("deal.brand_new", { dealRoomId: "d9" }))).toBe("/deal-room/d9");
    expect(notificationHref(row("deal.brand_new"))).toBe("/inbox");
  });
});

describe("the surfaces that moved are linked where they moved TO", () => {
  it("company.* opens the profile, which is where the org block lives now", () => {
    expect(notificationHref(row("company.join_requested"))).toBe("/profile");
    expect(notificationHref(row("company.dissolved"))).toBe("/profile");
  });

  it("verification.* still opens /verify, which is a real route", () => {
    expect(notificationHref(row("verification.approved"))).toBe("/verify");
  });
});

describe("the home bubble raises only what the owner picked (2026-09-05)", () => {
  it("is exactly the six", () => {
    expect([...HOME_BUBBLE_TYPES].sort()).toEqual([
      "bid.countered", "bid.price_changed", "bid.received", "bid.updated",
      "deal.rate_proposed", "deal.rate_response",
    ]);
  });

  it("passes those and refuses the quiet ones", () => {
    for (const type of HOME_BUBBLE_TYPES) expect(isBubbleWorthy(row(type))).toBe(true);
    for (const type of ["deal.message", "deal.term_updated", "company.join_requested", "referral.used", "bid.expired"]) {
      expect(isBubbleWorthy(row(type)), type).toBe(false);
    }
  });

  it("every type it raises has somewhere to go — a bubble that leads nowhere is worse than no bubble", () => {
    for (const type of HOME_BUBBLE_TYPES) {
      expect(notificationHref(row(type, { requestId: "r1", bidId: "b1", dealRoomId: "d1" })), type).not.toBeNull();
    }
  });
});
