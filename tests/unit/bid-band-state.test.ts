import { describe, it, expect } from "vitest";
import { resolveRenteeBandState, renteeBandIsDead, renteeBandShowsDelta } from "@/lib/contract/bid-band-state";

/**
 * The renter bid card's band — a port of the app's `bid_band_state.dart` (`c9af28a3`, 2026-09-21).
 *
 * ⚠️ **The ORDERING is the part that can be wrong**, which is why it is a pure function and why
 * these are behavioural cases rather than a source read. Every one below is the app's own rule.
 */

const band = (o: Parameters<typeof resolveRenteeBandState>[0]) => resolveRenteeBandState(o);
const live = { bidStatus: "OPEN_FOR_NEGOTIATION", hasDealRoom: true } as const;

describe("the order the states are tried in", () => {
  /* 1. Terminal — an offer that is over says so and nothing else. It outranks a counter on the
        table, an unread message, everything. */
  it("puts terminal above every other fact", () => {
    expect(band({ ...live, bidStatus: "WITHDRAWN", deltaSide: "theirs", liveStatusKind: "rentee-message" })).toBe("withdrawn");
    expect(band({ ...live, bidStatus: "EXPIRED", deltaSide: "theirs", liveStatusKind: "rentee-message" })).toBe("expired");
  });

  /* 2. Accepted — where the deal GOT TO outranks anything said along the way. */
  it("puts accepted above the conversation, and splits it on the ROOM's status", () => {
    const acc = { bidStatus: "ACCEPTED", hasDealRoom: true, liveStatusKind: "rentee-message" } as const;
    expect(band({ ...acc, dealRoomStatus: "AWAITING_SUPPLIER_CONFIRMATION" })).toBe("awaitingConfirmation");
    expect(band({ ...acc, dealRoomStatus: "CLOSED" })).toBe("dealClosed");
    /* 🔴 An older accepted row carries NO room status. The plain word stands rather than a guess at
       which of the two above it is — and that is exactly the field the web was dropping at the
       parse, so every accepted bid read «Accepted» and none of them could say more. */
    expect(band({ ...acc, dealRoomStatus: null })).toBe("accepted");
    expect(band({ ...acc })).toBe("accepted");
  });

  /* 3. The supplier's counter — MONEY BEFORE READING, the app's shipped rule. */
  it("puts the supplier's number above anything he wrote", () => {
    expect(band({ ...live, deltaSide: "theirs", liveStatusKind: "rentee-message" })).toBe("newCounterOffer");
  });

  /* ⚠️ His OWN counter is not news — it is the same fact as "waiting on the supplier", and reads
     better that way. */
  it("reports the renter's own counter as waiting, not as news", () => {
    expect(band({ ...live, deltaSide: "mine" })).toBe("awaitingSupplier");
  });

  /* 4. What the supplier did or said. */
  it("names what the supplier did, each in its own words", () => {
    expect(band({ ...live, liveStatusKind: "ask-answered" })).toBe("supplierAnswered");
    expect(band({ ...live, liveStatusKind: "rentee-message" })).toBe("newMessage");
    expect(band({ ...live, liveStatusKind: "bid-changed" })).toBe("offerUpdated");
  });

  /* ⚠️ The ENGAGEMENT kinds say nothing about whose turn it is, so they fall through to the turn
     rather than occupying the band. A renter does not act on «quote viewed». */
  it("lets the engagement kinds fall through to whose turn it is", () => {
    for (const k of ["quotation-viewed", "quotation-downloaded", "request-changed"] as const) {
      expect(band({ ...live, liveStatusKind: k })).toBe("counterThisOffer");
      expect(band({ bidStatus: "PENDING", hasDealRoom: false, liveStatusKind: k })).toBe("counterThisPrice");
    }
  });

  /* 5. Whose turn it is. */
  it("falls back to the turn, and the two counter wordings are told apart by the ROOM", () => {
    expect(band({ bidStatus: "PENDING", hasDealRoom: false })).toBe("counterThisPrice");
    expect(band({ ...live })).toBe("counterThisOffer");
    /* A renter action with no price move — he locked or countered a TERM — still leaves the ball
       with the supplier, so it must not read as his turn. */
    expect(band({ ...live, lastCounterBy: "rentee" })).toBe("awaitingSupplier");
    expect(band({ ...live, lastCounterBy: " RENTEE " })).toBe("awaitingSupplier");
    expect(band({ ...live, lastCounterBy: "supplier" })).toBe("counterThisOffer");
  });
});

describe("the tone and the figures", () => {
  /* 🔴 **Only a TERMINAL bid is drawn down** (the app's own reversal): a quiet outline for
     «waiting» was meant to say "not your move", but the caption says that in words, and a pale bar
     beside a coloured one reads as disabled. Everything live is orange and pressable. */
  it("is dead for the two terminal states and live for every other", () => {
    expect(renteeBandIsDead("withdrawn")).toBe(true);
    expect(renteeBandIsDead("expired")).toBe(true);
    for (const s of ["counterThisPrice", "counterThisOffer", "awaitingSupplier", "newCounterOffer",
      "newMessage", "supplierAnswered", "offerUpdated", "awaitingConfirmation", "dealClosed",
      "accepted"] as const) {
      expect(renteeBandIsDead(s), s).toBe(false);
    }
  });

  /* 🔴 **The figures ride the WAITING caption too**, not only the incoming counter. Without this a
     renter who countered would see his own number NOWHERE on the card: the price row holds the
     supplier's original rate until the bid is accepted, and the caption alone says only that he is
     waiting. */
  it("shows the delta on both sides of an open round, and on nothing else", () => {
    expect(renteeBandShowsDelta("newCounterOffer")).toBe(true);
    expect(renteeBandShowsDelta("awaitingSupplier")).toBe(true);
    for (const s of ["counterThisPrice", "counterThisOffer", "newMessage", "supplierAnswered",
      "offerUpdated", "awaitingConfirmation", "dealClosed", "accepted", "withdrawn", "expired"] as const) {
      expect(renteeBandShowsDelta(s), s).toBe(false);
    }
  });
});

describe("the two live-status kinds the web was dropping", () => {
  /* 🔴 The backend has emitted `bidChanged` and `bidWithdrawn` all along (`bid-live-status.ts:89-91`,
     from `bid.price_changed` / `bid.updated` / `bid.withdrawn`). The web's `KIND_FROM_WIRE` did not
     name them, so the unrecognised-kind rule DROPPED every one and the card said nothing. */
  it("reads an offer that moved, and one that was pulled", () => {
    expect(band({ ...live, liveStatusKind: "bid-changed" })).toBe("offerUpdated");
    /* Belt and braces: the status is WITHDRAWN on any row carrying this, so the terminal check has
       already returned — but a payload that disagrees still reads as withdrawn rather than as news. */
    expect(band({ ...live, liveStatusKind: "bid-withdrawn" })).toBe("withdrawn");
  });
});
