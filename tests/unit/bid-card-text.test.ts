import { describe, it, expect } from "vitest";
import { bidCardText } from "@/lib/bidCardText";
import type { BidCardModel } from "@/lib/bidCardModel";

/**
 * One template, wherever the link goes.
 *
 * The card was already one thing — the image and the HTML card render the same model. The WORDS were
 * three: a one-liner on WhatsApp and SMS, a laid-out note to suppliers, and a bare URL on the
 * clipboard. Which one a supplier got depended on which button the renter pressed, and two of the
 * three said nothing about the machine, the site or the deadline.
 */

const model = (over: Partial<BidCardModel> = {}): BidCardModel => ({
  ref: "EXC-170845",
  imageHeadline: "Tower light 9m · with operator ×6",
  cardTitle: "Tower light 9m · with operator ×6",
  items: [],
  where: "Riyadh · 1 month · 18 Aug → 17 Sep 2026",
  terms: [
    { label: "Mobilisation", value: "Supplier" },
    { label: "Fuel", value: "Renter · diesel" },
  ],
  closing: "Bidding closes 21 Aug 2026",
  accepting: true,
  cta: "Open the link to submit your bid →",
  ...over,
});

const URL_ = "https://web.moedatech.net/bid/tower-light-9m-5cc5efdc-86ab-459e-a73e-564257e2cbd2";

describe("bidCardText", () => {
  it("Given a request, Then it carries every fact the card carries, and the link", () => {
    const out = bidCardText(model(), URL_, { renterName: "Shibh Al Jazira" });

    expect(out).toContain("Shibh Al Jazira invites you to bid");
    // A colon, not an em dash: no em dash in copy a renter reads.
    expect(out).toContain("EXC-170845: Tower light 9m · with operator ×6");
    expect(out).toContain("Riyadh · 1 month · 18 Aug → 17 Sep 2026");
    expect(out).toContain("Mobilisation: Supplier");
    expect(out).toContain("Fuel: Renter · diesel");
    expect(out).toContain("Bidding closes 21 Aug 2026");
    expect(out).toContain(URL_);
    expect(out).toContain("No account is needed");
  });

  it("Given the renter's own line, Then it goes first — above anything we wrote", () => {
    // It is the part a person actually reads; under the request details it would be read after the
    // decision was made.
    const out = bidCardText(model(), URL_, { renterName: "Shibh Al Jazira", note: "Need these on site Monday." });
    expect(out.startsWith("Need these on site Monday.")).toBe(true);
  });

  it("Given several machines, Then every one is listed — the image can only name the first", () => {
    const out = bidCardText(
      model({
        items: [
          { label: "Tower light 9m", value: "×6" },
          { label: "Generator 250 kVA", value: "×2" },
        ],
      }),
      URL_,
    );
    expect(out).toContain("• Tower light 9m ×6");
    expect(out).toContain("• Generator 250 kVA ×2");
  });

  it("Given a request with no terms and no deadline, Then those lines simply do not exist", () => {
    // The same rule the image and the HTML card follow: what the request does not carry is not drawn.
    const out = bidCardText(model({ terms: [], closing: null }), URL_);
    expect(out).not.toContain("Mobilisation");
    expect(out).not.toContain("closes");
    // And no run of blank lines where they would have been.
    expect(out).not.toMatch(/\n\n\n/);
  });

  it("Given a closed request, Then it says so instead of inviting a bid", () => {
    const out = bidCardText(model({ accepting: false, closing: "Closed 21 Aug 2026" }), URL_);
    expect(out).toContain("no longer accepting bids");
    expect(out).not.toContain("No account is needed");
  });

  it("Given no renter name, Then it still opens with an invitation rather than a blank line", () => {
    const out = bidCardText(model(), URL_);
    expect(out.startsWith("You are invited to bid")).toBe(true);
  });
});
