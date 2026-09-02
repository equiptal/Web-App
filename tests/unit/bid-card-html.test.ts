import { describe, it, expect } from "vitest";
import { bidCardHtml, bidTokenFromUrl } from "@/lib/bidCardHtml";
import { COLORS, RADII } from "@/lib/ds-colors";

/**
 * The clipboard card. It exists because Gmail never builds a preview for a pasted URL — so the card
 * has to BE the thing on the clipboard. Its markup mirrors `renderBidLinkCard()` in
 * Moedatech-App's backend-admin; these assertions pin the values both must produce.
 */
const card = {
  title: "Forklift rental, 1 unit",
  description: "Riyadh · 30-day rental · Awaiting your response",
  imageUrl: "https://webstaging.moedatech.net/bid-card-band.png",
  url: "https://webstaging.moedatech.net/bid/eq-rental-5cc5efdc-86ab-459e-a73e-564257e2cbd2",
};

describe("bidTokenFromUrl", () => {
  it("pulls the group id out of a slugged share link", () => {
    expect(bidTokenFromUrl(card.url)).toBe("5cc5efdc-86ab-459e-a73e-564257e2cbd2");
  });

  it("returns null when there is no uuid to find", () => {
    expect(bidTokenFromUrl("https://webstaging.moedatech.net/requests")).toBeNull();
  });
});

describe("the navy band before the request exists", () => {
  it("Given no image yet, Then the band is DRAWN from the model, not stood in for", () => {
    /**
     * `/bid/<token>/og` renders the real one and needs a token, which does not exist until the
     * request does. The panel used to fall back to `/og-bid.png` — a navy rectangle with the logo
     * and nothing else — so the half of the card a supplier sees first was the one part of the
     * preview that was untrue.
     */
    const html = bidCardHtml(
      { ...card, imageUrl: "" },
      {
        ref: "CEX-020964",
        imageHeadline: "Excavator 20 ton · with operator ×2",
        cardTitle: "Excavator 20 ton · with operator ×2",
        items: [],
        where: "Riyadh · 4 months",
        terms: [],
        closing: null,
        accepting: true,
        cta: "Open the link to submit your bid →",
      },
    );

    // The same three things the `og` route draws, in the same order.
    expect(html).toContain("MOEDATECH");
    expect(html).toContain("Excavator 20 ton");
    expect(html).toContain("Open the link to submit your bid");
    /**
     * And NOT the reference (owner, 2026-09-03: *"remove it from the card too"*). It is our filing,
     * not his: the one number on the card a supplier cannot use, in the corner his eye reaches
     * before the equipment. He has the link, and the link knows which request it is.
     */
    expect(html).not.toContain("CEX-020964");
    // And no picture of nothing.
    expect(html).not.toContain("og-bid.png");
    expect(html).not.toContain("<img");
  });
});

describe("bidCardHtml", () => {
  const html = bidCardHtml(card, null);

  it("renders the prototype's card: band, title, description, source domain", () => {
    expect(html).toContain('height="160"');                  // the band, per the prototype
    // The card is pasted into a mail client, which has none of our stylesheet, so it carries literal
    // values from `ds-colors` rather than `var(--border)`.
    expect(html).toContain(`border:1px solid ${COLORS.background}`);
    expect(html).toContain(`border-radius:${RADII.md}`);
    expect(html).toContain("Forklift rental, 1 unit");
    expect(html).toContain("Riyadh · 30-day rental · Awaiting your response");
    expect(html).toContain("WEBSTAGING.MOEDATECH.NET");
  });

  it("uses only markup that survives a paste into Gmail and Outlook", () => {
    // Both strip <style> blocks and ignore flex/grid; object-fit does nothing in Outlook.
    expect(html).not.toMatch(/display:\s*(flex|grid)/);
    expect(html).not.toContain("<style");
    expect(html).not.toContain("class=");
    expect(html).not.toContain("object-fit");
  });

  it("wraps the whole card in one link, so apps taking the HTML still get the URL", () => {
    expect(html.startsWith(`<a href="${card.url}"`)).toBe(true);
    expect(html.trimEnd().endsWith("</a>")).toBe(true);
  });

  it("escapes request text rather than injecting it", () => {
    const nasty = bidCardHtml({ ...card, title: 'Forklift <script>alert(1)</script>' }, null);
    expect(nasty).not.toContain("<script>");
    expect(nasty).toContain("&lt;script&gt;");
  });

  it("flips direction for Arabic", () => {
    expect(bidCardHtml(card, null, "ar")).toContain('dir="rtl"');
  });
});
