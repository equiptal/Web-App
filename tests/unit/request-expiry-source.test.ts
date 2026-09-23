import { describe, it, expect } from "vitest";
import { requestExpiry, expiryState } from "@/lib/contract/request-expiry";
import { groupRequests, mapRequestListItem } from "@/lib/contract/requests";

/**
 * The CLOSES column, and why it was empty on every row.
 *
 * It read two fields in order: the renter's link deadline (`bidDeadline`), which the module's own
 * comment notes "most never" set, and a window built from `offerDuration` + `createdAt`. On staging
 * `offerDuration` is **absent from the list payload entirely** and null on every request, so the
 * fallback could never fire and the column rendered a dash on all 20 rows.
 *
 * `expiresAt` was sitting on every one of those rows, unread — a real date 15 to 26 days out.
 *
 * These tests pin the order and, more importantly, pin that the list payload alone is enough. The
 * regression to guard against is not "the dates are wrong"; it is the column going quiet again
 * because the one populated field stopped being read.
 */

/** A row shaped like the real `my-requests` payload — the fields this behaviour actually reads. */
const LIST_ROW = {
  id: "req-1",
  displayId: "REQ-001",
  status: "ACTIVE",
  type: "MARKETPLACE",
  createdAt: "2026-08-25T08:58:02.607Z",
  expiresAt: "2026-09-25T00:00:00.000Z",
  bidCount: 1,
  startDate: "2026-08-15",
  endDate: "2026-10-15",
  projectAddressLabel: "Riyadh — Al Wuroud District",
  equipmentItems: [],
};

/** Raw payload rows in, grouped rows out — the same path the hub takes. */
const group = (rows: (typeof LIST_ROW & { requestGroupId?: string })[]) =>
  groupRequests(rows.map((r) => mapRequestListItem(r)));

describe("which source answers", () => {
  it("prefers the renter's own link deadline", () => {
    const r = requestExpiry({
      bidDeadline: "2026-09-01T00:00:00.000Z",
      expiresAt: "2026-09-25T00:00:00.000Z",
      createdAt: LIST_ROW.createdAt,
      offerDuration: "72H",
    });
    expect(r.source).toBe("link");
    expect(r.deadline).toBe("2026-09-01T00:00:00.000Z");
  });

  it("falls to the request's own expiry when no link deadline was set", () => {
    // The case that describes essentially every real request.
    const r = requestExpiry({ bidDeadline: null, expiresAt: LIST_ROW.expiresAt, createdAt: LIST_ROW.createdAt });
    expect(r.source).toBe("request");
    expect(r.deadline).toBe(LIST_ROW.expiresAt);
  });

  it("still honours the creation window when there is no expiry at all", () => {
    const r = requestExpiry({ bidDeadline: null, expiresAt: null, createdAt: LIST_ROW.createdAt, offerDuration: "72H" });
    expect(r.source).toBe("window");
    expect(r.deadline).not.toBeNull();
  });

  it("answers nothing when no source has a date", () => {
    // A legitimate answer (AC-05) — render nothing rather than invent a date.
    expect(requestExpiry({ bidDeadline: null, expiresAt: null, createdAt: null, offerDuration: null }).source).toBe("none");
  });

  it("ignores an unparseable expiry rather than showing a broken date", () => {
    const r = requestExpiry({ expiresAt: "not-a-date", createdAt: LIST_ROW.createdAt, offerDuration: "24H" });
    expect(r.source).toBe("window");
  });
});

describe("the list payload alone is enough", () => {
  it("carries expiresAt through the mapper", () => {
    expect(mapRequestListItem(LIST_ROW).expiresAt).toBe(LIST_ROW.expiresAt);
  });

  it("gives a group its earliest item expiry", () => {
    // A group can only take bids for as long as its soonest-closing item can.
    const groups = group([
      { ...LIST_ROW, id: "a", requestGroupId: "g1", expiresAt: "2026-09-25T00:00:00.000Z" },
      { ...LIST_ROW, id: "b", requestGroupId: "g1", expiresAt: "2026-09-14T00:00:00.000Z" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].expiresAt).toBe("2026-09-14T00:00:00.000Z");
  });

  it("resolves a real staging row to a countdown with no further calls", () => {
    // The end-to-end shape of the bug: list row in, days-left out, nothing fetched.
    const [g] = group([LIST_ROW]);
    const state = expiryState(requestExpiry({ expiresAt: g.expiresAt, createdAt: g.createdAt }), Date.parse("2026-08-30T00:00:00.000Z"));
    expect(state.kind).toBe("left");
    expect(state.days).toBe(26);
    expect(state.source).toBe("request");
  });

  it("reads a past expiry as expired, not as a countdown", () => {
    const state = expiryState(
      requestExpiry({ expiresAt: "2026-08-01T00:00:00.000Z", createdAt: LIST_ROW.createdAt }),
      Date.parse("2026-08-30T00:00:00.000Z"),
    );
    expect(state.kind).toBe("expired");
  });
});
