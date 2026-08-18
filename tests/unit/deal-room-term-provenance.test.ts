import { describe, it, expect } from "vitest";
import { mapDealRoom, lastTermMove, asTermSource, type DealTerm } from "@/lib/contract/deal-room";

/**
 * **Where a term's value came from, and what was last done to it.**
 *
 * A term arrives carrying three reference values — the renter's preference, the supplier's
 * declaration and the platform default — and only one of them is in force. `source` names it. The
 * `history[]` beside it records the moves; the room shows only the LAST one, because a term argued
 * three times is still decided on its latest position.
 *
 * Both were on the wire and dropped at the map. What is guarded here is the dropping-back-in: the
 * fallbacks (an unknown provenance is the weakest claim, not a stronger one), and the ordering
 * (which move counts as "last" when the array is out of order or a timestamp is junk).
 */

const term = (over: Partial<Record<string, unknown>> = {}) => ({
  key: "working_hours", label: "Working hours", labelAr: "ساعات العمل", state: "pending", ...over,
});
const roomWith = (terms: unknown[]) => mapDealRoom({ id: "dr_1", status: "NEGOTIATING", terms });
const only = (terms: unknown[]): DealTerm => roomWith(terms).terms[0];

describe("asTermSource", () => {
  it("keeps the three the backend declares", () => {
    expect(asTermSource("rentee_fixed")).toBe("rentee_fixed");
    expect(asTermSource("supplier_declared")).toBe("supplier_declared");
    expect(asTermSource("platform_default")).toBe("platform_default");
  });

  it("falls back to the platform default for anything else — an unrecognised provenance is the weakest claim", () => {
    // Reading an unknown string as `rentee_fixed` would tell the renter a value came from his own
    // request when nothing said so, which is the one wrong answer of the three.
    expect(asTermSource("something_new")).toBe("platform_default");
    expect(asTermSource(undefined)).toBe("platform_default");
    expect(asTermSource(null)).toBe("platform_default");
    expect(asTermSource(7)).toBe("platform_default");
  });
});

describe("mapDealRoom — term history", () => {
  it("carries the moves through, with the value left as it arrived", () => {
    const t = only([term({
      source: "supplier_declared",
      history: [{ action: "counter", by: "rentee", value: 10, at: "2026-03-04T09:00:00.000Z" }],
    })]);
    expect(t.source).toBe("supplier_declared");
    expect(t.history).toEqual([{ action: "counter", by: "rentee", value: 10, at: "2026-03-04T09:00:00.000Z" }]);
  });

  it("drops an entry with no action or no timestamp — the hint reads '<action>: <value> · <date>'", () => {
    const t = only([term({
      history: [
        { by: "rentee", value: 10, at: "2026-03-04T09:00:00.000Z" }, // no action
        { action: "counter", by: "rentee", value: 10 },              // no timestamp
        { action: "accept", by: "supplier", at: "2026-03-05T09:00:00.000Z" },
      ],
    })]);
    expect(t.history.map((h) => h.action)).toEqual(["accept"]);
  });

  it("keeps a move that carries NO value — an acceptance proposes nothing new", () => {
    const t = only([term({ history: [{ action: "accept", by: "supplier", at: "2026-03-05T09:00:00.000Z" }] })]);
    expect(t.history).toHaveLength(1);
    expect(t.history[0].value).toBeUndefined();
  });

  it("leaves history empty when the payload carries none, or carries junk", () => {
    expect(only([term()]).history).toEqual([]);
    expect(only([term({ history: "nope" })]).history).toEqual([]);
  });
});

describe("lastTermMove", () => {
  const at = (iso: string, action = "counter") => ({ action, by: "rentee", value: iso, at: iso });

  it("returns null for a term that has never moved", () => {
    expect(lastTermMove({ history: [] })).toBeNull();
  });

  it("picks the latest by TIMESTAMP, not by array position", () => {
    const out = lastTermMove({ history: [at("2026-03-09T00:00:00Z"), at("2026-03-04T00:00:00Z")] });
    expect(out?.at).toBe("2026-03-09T00:00:00Z");
  });

  it("sorts an unparseable timestamp oldest, so junk cannot promote a stale move", () => {
    const out = lastTermMove({ history: [at("not-a-date"), at("2026-03-04T00:00:00Z")] });
    expect(out?.at).toBe("2026-03-04T00:00:00Z");
  });

  it("returns the last-listed of two moves sharing one timestamp", () => {
    const a = { action: "counter", by: "rentee", value: 1, at: "2026-03-04T00:00:00Z" };
    const b = { action: "accept", by: "supplier", value: 2, at: "2026-03-04T00:00:00Z" };
    expect(lastTermMove({ history: [a, b] })).toBe(b);
  });

  it("still returns something when EVERY timestamp is junk", () => {
    const out = lastTermMove({ history: [at("x"), at("y")] });
    expect(out).not.toBeNull();
  });
});
