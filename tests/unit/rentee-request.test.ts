import { describe, it, expect } from "vitest";
import {
  RETIRED_REQUEST_KINDS,
  composeShortfallRequest,
  isSendableKind,
} from "@/lib/contract/rentee-request";

/**
 * The shortfall alert's ask (spec 004 §6.3, RM3-AC-07 / TC-03).
 *
 * The payload is asserted rather than the button, because the button is the only part that can be
 * rebuilt: what must not drift is the card the surface emits — an `alternative` with no machine named,
 * and never the retired kind the backend answers with a 400.
 */
describe("composeShortfallRequest — an `alternative` with a null equipmentId (RM3-AC-07)", () => {
  it("names no machine, because a claimed unit is a count with nothing behind it", () => {
    expect(composeShortfallRequest().equipmentId).toBeNull();
  });

  it("is kind `alternative` — the renter is asking for a machine, not about one", () => {
    expect(composeShortfallRequest().kind).toBe("alternative");
  });

  it("pairs the null id with scope `company`, which is the only pairing the backend accepts", () => {
    // `scope: 'equipment'` REQUIRES an id and `scope: 'company'` REQUIRES its absence — the two halves
    // are validated against each other, so they are composed together rather than left to a caller.
    expect(composeShortfallRequest()).toEqual({ scope: "company", equipmentId: null, kind: "alternative" });
  });

  it("carries no docTypes — those are only valid for a document request", () => {
    expect(composeShortfallRequest()).not.toHaveProperty("docTypes");
  });

  it("never emits `add_to_offer`, which is retired and rejected server-side", () => {
    expect(RETIRED_REQUEST_KINDS).toContain("add_to_offer");
    expect(isSendableKind("add_to_offer")).toBe(false);
    expect(RETIRED_REQUEST_KINDS).not.toContain(composeShortfallRequest().kind);
  });

  it("still accepts the three live kinds, so the filter is a retirement and not a ban", () => {
    expect(["availability", "document", "alternative"].every(isSendableKind)).toBe(true);
    expect(isSendableKind("anything_else")).toBe(false);
  });
});
