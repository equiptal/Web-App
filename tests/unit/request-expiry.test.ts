import { describe, it, expect } from "vitest";
import { requestExpiry, windowDeadline, expiryState } from "@/lib/contract/request-expiry";

const AT = (iso: string) => Date.parse(iso);

describe("where the deadline comes from", () => {
  it("uses the deadline the renter set on the share link, first", () => {
    const e = requestExpiry({
      bidDeadline: "2026-09-05T12:00:00.000Z",
      createdAt: "2026-08-20T12:00:00.000Z",
      offerDuration: "24H",
    });
    expect(e).toEqual({ deadline: "2026-09-05T12:00:00.000Z", source: "link" });
  });

  it("falls back to the bid window the request was created with", () => {
    const e = requestExpiry({ bidDeadline: null, createdAt: "2026-08-20T12:00:00.000Z", offerDuration: "72H" });
    expect(e.source).toBe("window");
    expect(e.deadline).toBe("2026-08-23T12:00:00.000Z");
  });

  it("honours a link deadline that reaches PAST the window — extending is a decision, not an error", () => {
    const e = requestExpiry({
      bidDeadline: "2026-09-30T12:00:00.000Z",
      createdAt: "2026-08-20T12:00:00.000Z",
      offerDuration: "24H",
    });
    expect(e.source).toBe("link");
  });

  it("says nothing when there is nothing to say — no link deadline, no window", () => {
    expect(requestExpiry({ createdAt: "2026-08-20T12:00:00.000Z" })).toEqual({ deadline: null, source: "none" });
    expect(requestExpiry({ offerDuration: "1W" })).toEqual({ deadline: null, source: "none" });
    expect(requestExpiry({})).toEqual({ deadline: null, source: "none" });
  });

  it("ignores an unparseable date rather than guessing one", () => {
    const e = requestExpiry({ bidDeadline: "not-a-date", createdAt: "2026-08-20T12:00:00.000Z", offerDuration: "48H" });
    expect(e.source).toBe("window");
  });

  it("knows every window the request can carry, in both spellings", () => {
    const c = "2026-08-20T00:00:00.000Z";
    expect(windowDeadline(c, "24H")).toBe("2026-08-21T00:00:00.000Z");
    expect(windowDeadline(c, "48h")).toBe("2026-08-22T00:00:00.000Z");
    expect(windowDeadline(c, "72H")).toBe("2026-08-23T00:00:00.000Z");
    expect(windowDeadline(c, "1W")).toBe("2026-08-27T00:00:00.000Z");
    expect(windowDeadline(c, "1-week")).toBe("2026-08-27T00:00:00.000Z");
    expect(windowDeadline(c, "10D")).toBeNull();
    expect(windowDeadline(null, "1W")).toBeNull();
  });
});

describe("how it reads right now", () => {
  const now = AT("2026-08-29T12:00:00.000Z");
  const link = (iso: string) => requestExpiry({ bidDeadline: iso });

  it("counts whole days left", () => {
    expect(expiryState(link("2026-09-01T12:00:00.000Z"), now)).toMatchObject({ kind: "left", days: 3 });
    expect(expiryState(link("2026-08-31T12:00:00.000Z"), now)).toMatchObject({ kind: "left", days: 2 });
    expect(expiryState(link("2026-08-30T12:00:00.000Z"), now)).toMatchObject({ kind: "left", days: 1 });
  });

  it("ROUNDS UP, so a part-day still reads as a day left", () => {
    // 11 hours is most of a working day. Rounding it to 0 would retire a request the renter can
    // still act on — the one error this must not make.
    expect(expiryState(link("2026-08-29T23:00:00.000Z"), now)).toMatchObject({ kind: "left", days: 1 });
    expect(expiryState(link("2026-08-30T11:00:00.000Z"), now)).toMatchObject({ kind: "left", days: 1 });
  });

  it("says today inside the last hour, and expired after it", () => {
    expect(expiryState(link("2026-08-29T12:30:00.000Z"), now).kind).toBe("today");
    expect(expiryState(link("2026-08-29T12:00:00.000Z"), now).kind).toBe("expired");
    expect(expiryState(link("2026-08-28T12:00:00.000Z"), now).kind).toBe("expired");
  });

  it("carries the source through, so a surface can say which date it is showing", () => {
    const w = requestExpiry({ createdAt: "2026-08-29T00:00:00.000Z", offerDuration: "72H" });
    expect(expiryState(w, now)).toMatchObject({ kind: "left", source: "window" });
    expect(expiryState({ deadline: null, source: "none" }, now)).toMatchObject({ kind: "none", source: "none" });
  });
});
