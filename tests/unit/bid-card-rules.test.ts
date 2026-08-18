import { describe, expect, it } from "vitest";
import { bidCounterDelta, ctaShowsCounterDelta } from "@/lib/contract/bid-counter-delta";
import { unitCountNotes, distinctMachinesOffered } from "@/lib/contract/unit-count-notes";
import { mapBidLiveStatus, resolveBidLiveStatus, resolveRenteeBidChip } from "@/lib/contract/bid-live-status";

/**
 * **Three rentee bid-card rules the app has had and the web never did.**
 *
 * All three were found by diffing the app's `marketplace/domain/` modules against the web's contract
 * folder — the check that would have caught the offer-first sort four days earlier. Each is a port,
 * so what is asserted here is the app's behaviour, including every case it deliberately refuses to
 * report.
 */

describe("bidCounterDelta", () => {
  const base = { originalPrice: 80_210, currentPrice: 76_440, lastCounterBy: "rentee", viewerRole: "rentee", status: "OPEN_FOR_NEGOTIATION" };

  it("reports the move, and whose it was from the reader's side", () => {
    const mine = bidCounterDelta(base);
    expect(mine).toMatchObject({ from: 80_210, to: 76_440, side: "mine", isDown: true });
    const theirs = bidCounterDelta({ ...base, lastCounterBy: "supplier" });
    expect(theirs?.side).toBe("theirs");
  });

  it("reports an upward move too, with isDown false", () => {
    // A cheaper price is not automatically good news and a dearer one is not automatically bad —
    // `isDown` is for whoever tints it, never for the wording.
    expect(bidCounterDelta({ ...base, currentPrice: 84_000 })).toMatchObject({ side: "mine", isDown: false });
  });

  it("reports nothing when the two prices are equal", () => {
    // The backend defaults `currentPrice` to `priceAmount`, so an unmoved bid arrives as a pair of
    // identical numbers rather than as a null.
    expect(bidCounterDelta({ ...base, currentPrice: 80_210 })).toBeNull();
  });

  it("reports nothing when nobody is named as the mover", () => {
    // Labelling the supplier's number as the renter's own is worse than showing no chip at all.
    for (const by of [null, undefined, "", "  ", "system", "bot"]) {
      expect(bidCounterDelta({ ...base, lastCounterBy: by })).toBeNull();
    }
  });

  it("reports nothing on a dead or settled offer", () => {
    // A struck-out price under "Expired" invites a negotiation that cannot happen; under "Accepted"
    // it reopens a question the parties closed.
    for (const status of ["EXPIRED", "WITHDRAWN", "SUPERSEDED", "ACCEPTED", "expired", " accepted "]) {
      expect(bidCounterDelta({ ...base, status }), status).toBeNull();
    }
  });

  it("reports nothing for a zero, negative or missing rate on either end", () => {
    // Not a counter anybody made — a parse failure or an empty column, which would draw "80,210 → 0".
    expect(bidCounterDelta({ ...base, currentPrice: 0 })).toBeNull();
    expect(bidCounterDelta({ ...base, currentPrice: -5 })).toBeNull();
    expect(bidCounterDelta({ ...base, currentPrice: null })).toBeNull();
    expect(bidCounterDelta({ ...base, originalPrice: 0 })).toBeNull();
    expect(bidCounterDelta({ ...base, originalPrice: null })).toBeNull();
  });

  it("gives the CTA to the delta over an open ask", () => {
    // Owner, 2026-08-16: money first, question second. A price on the table is the one thing that
    // expires and that costs real money to answer late.
    const delta = bidCounterDelta(base);
    expect(ctaShowsCounterDelta({ hasOpenAsk: true, delta })).toBe(true);
    expect(ctaShowsCounterDelta({ hasOpenAsk: true, delta: null })).toBe(false);
  });
});

describe("unitCountNotes", () => {
  it("owes nothing when the counts agree", () => {
    expect(unitCountNotes({ priced: 3, offered: 3, machinesNamed: 3 }).isEmpty).toBe(true);
  });

  it("names a partial acceptance — fewer priced than offered", () => {
    const n = unitCountNotes({ priced: 2, offered: 3, machinesNamed: 3 });
    expect(n.relation).toBe("below");
    expect(n.hasPricedNote).toBe(true);
    expect(n.hasClaimedNote).toBe(false);
  });

  it("names a counter that stepped the count UP past the offer", () => {
    // Legal for both parties: the stepper caps at the REQUESTED count, not at the offer.
    expect(unitCountNotes({ priced: 4, offered: 3, machinesNamed: 3 }).relation).toBe("above");
  });

  it("measures the shortfall against PRICED, not against offered", () => {
    // What the renter is paying for is what he is owed machines for. A counter that steps 2 machines
    // up to 4 owes two machines, not zero.
    expect(unitCountNotes({ priced: 4, offered: 2, machinesNamed: 2 }).claimedUnits).toBe(2);
    expect(unitCountNotes({ priced: 3, offered: 3, machinesNamed: 1 }).claimedUnits).toBe(2);
  });

  it("claims NO shortfall when the machine count is unknown", () => {
    // `machinesNamed === 0` means "not known", not "no machines". Reporting `priced` units short
    // there would put a shortfall on every legacy bid in the list.
    expect(unitCountNotes({ priced: 3, offered: 3 }).claimedUnits).toBe(0);
    expect(unitCountNotes({ priced: 3, offered: 3, machinesNamed: null }).isEmpty).toBe(true);
    expect(unitCountNotes({ priced: 3, offered: 3, machinesNamed: -2 }).claimedUnits).toBe(0);
  });

  it("counts DISTINCT machines, never the padded entry list", () => {
    // `[A, B, A]` is three units backed by two machines. Length is the offer; this is the fleet
    // behind it, and the gap between them is the whole point of the note.
    expect(distinctMachinesOffered([{ equipmentId: "A" }, { equipmentId: "B" }, { equipmentId: "A" }])).toBe(2);
    expect(distinctMachinesOffered([{ equipmentId: "" }, { equipmentId: null }])).toBe(0);
    expect(distinctMachinesOffered(null)).toBe(0);
  });
});

describe("bid live status", () => {
  const at = "2026-08-18T09:00:00.000Z";

  it("reads the four kinds the server sends", () => {
    expect(mapBidLiveStatus({ kind: "quotationViewed", at })?.kind).toBe("quotation-viewed");
    expect(mapBidLiveStatus({ kind: "quotationDownloaded", at })?.kind).toBe("quotation-downloaded");
    expect(mapBidLiveStatus({ kind: "renteeMessage", at })?.kind).toBe("rentee-message");
    expect(mapBidLiveStatus({ kind: "askAnswered", at })?.kind).toBe("ask-answered");
  });

  it("drops an entry that cannot say WHAT happened or WHEN", () => {
    // The pill's whole job is to say something specific happened. One that cannot is an alarm with
    // no content.
    expect(mapBidLiveStatus({ kind: "somethingNew", at })).toBeNull();
    expect(mapBidLiveStatus({ kind: "renteeMessage", at: "not-a-date" })).toBeNull();
    expect(mapBidLiveStatus({ kind: "renteeMessage" })).toBeNull();
    expect(mapBidLiveStatus(null)).toBeNull();
    expect(mapBidLiveStatus("renteeMessage")).toBeNull();
  });

  it("keeps an answered ask whose kind the server could not resolve", () => {
    // An ask whose card scrolled out of Stream's readable window resolves with a null kind, and the
    // renter still deserves to be told the supplier answered.
    const s = mapBidLiveStatus({ kind: "askAnswered", at });
    expect(s?.kind).toBe("ask-answered");
    expect(s?.askKind).toBeNull();
  });

  it("lets a changed request outrank anything the supplier did", () => {
    const live = mapBidLiveStatus({ kind: "renteeMessage", at });
    const out = resolveBidLiveStatus({ requestChangedAt: "2026-08-01T00:00:00.000Z", liveStatus: live });
    // Older, and it still wins: it changes what the bid is even an answer to.
    expect(out?.kind).toBe("request-changed");
    expect(resolveBidLiveStatus({ requestChangedAt: null, liveStatus: live })?.kind).toBe("rentee-message");
    expect(resolveBidLiveStatus({ requestChangedAt: "rubbish", liveStatus: live })?.kind).toBe("rentee-message");
  });

  it("gives the renter's one slot to the lifecycle when the bid is decided or over", () => {
    const live = mapBidLiveStatus({ kind: "renteeMessage", at });
    expect(resolveRenteeBidChip({ bidStatus: "ACCEPTED", liveStatus: live })).toBe("state");
    expect(resolveRenteeBidChip({ bidStatus: "EXPIRED", liveStatus: live })).toBe("state");
    expect(resolveRenteeBidChip({ bidStatus: "OPEN_FOR_NEGOTIATION", liveStatus: live })).toBe("news");
  });

  it("never leaves the renter's slot empty", () => {
    // Unlike the supplier's, whose blank state means "nothing has happened", this one always has the
    // lifecycle to fall back on — an empty slot reads as a card still loading.
    expect(resolveRenteeBidChip({ bidStatus: "PENDING", liveStatus: null })).toBe("state");
    expect(resolveRenteeBidChip({ bidStatus: null, liveStatus: null })).toBe("state");
  });
});
