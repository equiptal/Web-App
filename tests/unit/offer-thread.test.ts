import { describe, expect, it } from "vitest";
import { offerFooterFor, offerThread, previousOfferRate, OPENING_OFFER_KEY, ACCEPTED_CARD_KEY } from "@/lib/contract/offer-thread";
import type { DealRound } from "@/lib/contract/deal-rounds";

/**
 * Offers in the chat (Moedatech-App release #548, alignment 1.2), the app's `offer_thread.dart`
 * rule for rule: the bid opens the room as a card, only the latest offer carries buttons, and the
 * accepted card sits last while the supplier has not confirmed.
 */

const opening: DealRound = {
  role: "supplier", rate: 1400, priceUnit: "PER_DAY", mobPrice: null, demobPrice: null,
  rentalUnits: 2, mobUnits: null, demobUnits: null, mobExcluded: false, demobExcluded: false, at: null,
};
const proposal = (id: string, role: "supplier" | "rentee", rate: number) => ({
  id, created_at: "2026-10-11T10:00:00Z", user: { id: "system_bot" }, type: "system",
  custom: { type: "rate_proposal", proposedRate: rate, priceUnit: "PER_DAY", proposedByRole: role },
});
const text = (id: string, t: string, user = "u-1", type = "regular") => ({ id, text: t, user: { id: user }, type, created_at: "2026-10-11T10:05:00Z" });

describe("which buttons the latest offer carries", () => {
  it("older offers are history, whatever the room's state", () => {
    expect(offerFooterFor({ isLatest: false, status: "NEGOTIATING", isMine: false })).toBe("superseded");
  });

  it("the other side's latest offer: Counter + Accept; your own: edit and wait, never Accept", () => {
    expect(offerFooterFor({ isLatest: true, status: "NEGOTIATING", isMine: false })).toBe("counterAndAccept");
    expect(offerFooterFor({ isLatest: true, status: "NEGOTIATING", isMine: true })).toBe("editOwn");
  });

  it("follows the room: awaiting reads accepted, closed is agreed, cancelled has nothing", () => {
    expect(offerFooterFor({ isLatest: true, status: "AWAITING_SUPPLIER_CONFIRMATION", isMine: false })).toBe("waiting");
    expect(offerFooterFor({ isLatest: true, status: "CLOSED", isMine: false })).toBe("agreed");
    expect(offerFooterFor({ isLatest: true, status: "ABANDONED", isMine: true })).toBe("none");
  });
});

describe("the struck-out previous rate", () => {
  it("is the most recent earlier offer at a DIFFERENT rate", () => {
    expect(previousOfferRate([1400, 1100, 1200], 2)).toBe(1100);
    expect(previousOfferRate([1400, 1200, 1200], 2)).toBe(1400);
    expect(previousOfferRate([1400], 0)).toBeNull();
  });
});

describe("the thread as drawn", () => {
  it("opens with «room opened» and the bid, then each proposal as an offer", () => {
    const { entries, offerRates } = offerThread(
      [proposal("p1", "rentee", 1100), text("t1", "We can do 1,200"), proposal("p2", "supplier", 1200)],
      { roomOpen: true, opening, awaiting: false },
    );
    expect(entries.map((e) => e.kind)).toEqual(["opened", "offer", "offer", "message", "offer"]);
    expect(entries[1].key).toBe(OPENING_OFFER_KEY);
    expect(offerRates).toEqual([1400, 1100, 1200]);
  });

  it("puts the accepted card LAST while awaiting, in place of the «accepted all terms» line", () => {
    const accepted = text("a1", "Yara has accepted all terms and is awaiting your confirmation.", "system_bot", "system");
    const { entries } = offerThread([proposal("p1", "supplier", 1200), accepted, text("t1", "Done, please confirm")], {
      roomOpen: true, opening, awaiting: true,
    });
    expect(entries.some((e) => e.kind === "message" && e.message.id === "a1")).toBe(false);
    expect(entries[entries.length - 1].key).toBe(ACCEPTED_CARD_KEY);
  });

  it("is the messages alone when no room is loaded", () => {
    const { entries } = offerThread([text("t1", "hi")], { roomOpen: false, opening, awaiting: false });
    expect(entries.map((e) => e.kind)).toEqual(["message"]);
  });
});
