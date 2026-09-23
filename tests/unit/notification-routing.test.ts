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

  it("sends a room-only row to his offers — the room view is retired", () => {
    /* Owner, 2026-09-07: the old deal-room screen is gone from every route, and `/deal-room/[id]`
       with no act now FORWARDS to this same chat. Routing a notification through that forward would
       show a blank frame first, so a row carrying only a room id goes where his offers are. */
    expect(notificationHref(row("deal.message", { dealRoomId: "d9" }))).toBe("/requests");
  });

  it("an unknown deal.* still lands somewhere — the family grows faster than this file", () => {
    expect(notificationHref(row("deal.brand_new", { dealRoomId: "d9", bidId: "b3" }))).toBe("/bids/b3/equipment?chat=1");
    expect(notificationHref(row("deal.brand_new", { dealRoomId: "d9" }))).toBe("/requests");
    expect(notificationHref(row("deal.brand_new"))).toBe("/inbox");
  });

  it("the two rows ABOUT the settled document keep the route, with an act on it", () => {
    // The sheet lives at `/deal-room/[id]`, and an act is what opens it — that is the only reason
    // the route still exists.
    expect(notificationHref(row("deal.closed", { dealRoomId: "d9" }))).toBe("/deal-room/d9?act=accept");
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

/**
 * -- Audited against every type the backends emit (owner, 2026-09-12) ----------------------------
 *
 * *"Make sure all notifications are wired to their exact place."*
 */
describe("the rows that were falling through", () => {
  const n = (type: string, data: Record<string, unknown> = {}) =>
    ({ id: "n", type, title: "", body: "", roleContext: "rentee", isRead: false, createdAt: "", data }) as NotificationItem;

  it("Given HIS request closed, Then it opens that request", () => {
    /**
     * 🔴 `request.closed_owner` is `roleContext: 'rentee'` and the backend comments the id as
     * being there *"so the renter's tap opens THEIR request"*. It arrived carrying `requestId` and
     * this mapper returned null, so the row was inert.
     */
    expect(notificationHref(n("request.closed_owner", { requestId: "req-1" }))).toBe("/requests?r=req-1");
  });

  it("Given a request he bid on closed unfilled, Then it opens that request too", () => {
    // ⚠️ Supplier-side, kept for a dual-role account like the rest of that block.
    expect(notificationHref(n("request.closed_unfilled", { requestId: "req-2" }))).toBe("/requests?r=req-2");
  });

  it("Given his quotation was read, Then it opens the BID, not the request", () => {
    // ⚠️ A supplier can hold several bids on one request, so the bid is the one that was read.
    expect(notificationHref(n("bid.quotation_viewed", { bidId: "b-9", requestId: "req-3" }))).toBe(
      "/bids/b-9/equipment?chat=1",
    );
    expect(notificationHref(n("bid.quotation_downloaded", { bidId: "b-9" }))).toBe("/bids/b-9/equipment?chat=1");
  });

  it("Given a chat system-message type, Then it is NOT treated as a notification", () => {
    /**
     * 🔴 `bid_withdrawn`, `deal_closed` and `request_summary` are Stream CHAT metadata
     * (`postSystemMessage(..., { type })`) and never reach the bell; `referral_reward` is a COUPON
     * type. Wiring them would be four dead branches a later reader would trust. The underscore is
     * the tell: every real notification type in this product is dotted.
     */
    for (const t of ["bid_withdrawn", "deal_closed", "request_summary", "referral_reward"]) {
      expect(notificationHref(n(t, { requestId: "req-4", dealRoomId: "d-1" }))).toBeNull();
    }
  });

  it("Given the off-platform bid, Then it opens the request it was made on", () => {
    /**
     * 🔴 The row in the owner's screenshot. It is sent as `bid.received` with
     * `data: { requestId, submissionId }`, so the MAP was already right — the fault was that the
     * workspace ignored the arriving `?r=` when it was already mounted. Pinned here so the mapping
     * half can never regress underneath that fix.
     */
    expect(notificationHref(n("bid.received", { requestId: "req-5", submissionId: "s-1" }))).toBe(
      "/requests?r=req-5",
    );
  });
});
