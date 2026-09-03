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
    { label: "Mobilization", value: "Supplier" },
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
    /**
     * The machine, and NOT the reference (owner, 2026-09-03: *"remove any request code from the
     * templates"*). It is our filing, not his: a supplier reading `CEX-020902:` before the equipment
     * is handed an internal code as the first thing he sees. The card still carries it, to one side.
     */
    expect(out).toContain("Tower light 9m · with operator ×6");
    expect(out).not.toContain("EXC-170845");
    expect(out).toContain("Riyadh · 1 month · 18 Aug → 17 Sep 2026");
    expect(out).toContain("Mobilization: Supplier");
    expect(out).toContain("Fuel: Renter · diesel");
    expect(out).toContain("Bidding closes 21 Aug 2026");
    expect(out).toContain(URL_);
    expect(out).toContain("No account is needed");
  });

  it("Given the renter's own line, Then it is above the card, under the line that says who is asking", () => {
    /**
     * It is the part a person actually reads; under the request details it would be read after the
     * decision was made. It sits below the standing intro rather than above the greeting, because
     * the intro says WHO is asking and this says what is special about today — in that order.
     */
    const out = bidCardText(model(), URL_, { renterName: "Shibh Al Jazira", note: "Need these on site Monday." });

    expect(out.indexOf("Shibh Al Jazira invites you")).toBeLessThan(out.indexOf("Need these on site Monday."));
    expect(out.indexOf("Need these on site Monday.")).toBeLessThan(out.indexOf("Tower light 9m"));
  });

  it("Given any request, Then the LINK is the last thing in the message", () => {
    /**
     * ⚠️ Not a style choice. WhatsApp finds a URL to unfurl in a `wa.me` prefill only when it ends
     * the message; put a sentence after it and no card appears — which is exactly the report:
     * *"when i click share the template from the web the template is not shown but when i send it
     * then copy paste through whatsapp it is shown"* (owner, 2026-09-02).
     */
    const out = bidCardText(model(), URL_, { renterName: "Shibh Al Jazira" });
    expect(out.endsWith(URL_)).toBe(true);
  });

  it("Given the renter's own wording, Then it is sent instead of ours", () => {
    const out = bidCardText(model(), URL_, {
      renterName: "Shibh Al Jazira",
      template: { greeting: "Dear partner,", intro: "Please quote the below by Sunday.", signoff: "Regards, {name}" },
    });

    expect(out.startsWith("Dear partner,")).toBe(true);
    expect(out).toContain("Please quote the below by Sunday.");
    expect(out).toContain("Regards, Shibh Al Jazira");
    // The card between them is still ours, unchanged.
    expect(out).toContain("Tower light 9m · with operator ×6");
  });

  it("Given several machines, Then every one is listed — the image can only name the first", () => {
    const out = bidCardText(
      model({
        items: [
          { label: "Tower light 9m", units: "×6", terms: [] },
          { label: "Generator 250 kVA", units: "×2", terms: [{ label: "Fuel", value: "Supplier" }] },
        ],
      }),
      URL_,
    );
    expect(out).toContain("• Tower light 9m ×6");
    expect(out).toContain("• Generator 250 kVA ×2");
    // And the term only the generator carries sits under it, indented, not in the shared block.
    expect(out).toContain("   Fuel: Supplier");
  });

  it("Given a request with no terms and no deadline, Then those lines simply do not exist", () => {
    // The same rule the image and the HTML card follow: what the request does not carry is not drawn.
    const out = bidCardText(model({ terms: [], closing: null }), URL_);
    expect(out).not.toContain("Mobilization");
    expect(out).not.toContain("closes");
    // And no run of blank lines where they would have been.
    expect(out).not.toMatch(/\n\n\n/);
  });

  it("Given a closed request, Then it says so instead of inviting a bid", () => {
    const out = bidCardText(model({ accepting: false, closing: "Closed 21 Aug 2026" }), URL_);
    expect(out).toContain("no longer accepting bids");
    expect(out).not.toContain("No account is needed");
  });

  it("Given no renter name, Then the default reads properly rather than losing a word", () => {
    /**
     * "{name} invites you to bid" with the token stripped is " invites you to bid" — not a shorter
     * sentence, a broken one. The untouched default has a form that works without a name; a renter's
     * OWN wording is never rewritten, only stripped of the token.
     */
    const out = bidCardText(model(), URL_);
    expect(out).toContain("You are invited to bid");
    expect(out).not.toContain("{name}");
    // And no sentence that begins where the missing name would have been.
    expect(out.split("\n").some((l) => l.trimStart().startsWith("invites"))).toBe(false);
  });
});
