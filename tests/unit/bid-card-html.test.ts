import { describe, it, expect } from "vitest";
import { bidCardHtml, bidTokenFromUrl } from "@/lib/bidCardHtml";
import { COLORS } from "@/lib/ds-colors";

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

describe("bidCardHtml", () => {
  const html = bidCardHtml(card);

  it("renders the prototype's card: band, title, description, source domain", () => {
    expect(html).toContain('height="160"');                  // the band, per the prototype
    // The card is pasted into a mail client, which has none of our stylesheet, so it carries literal
    // values from `ds-colors` rather than `var(--border)`.
    expect(html).toContain(`border:1px solid ${COLORS.background}`);
    expect(html).toContain("border-radius:10px");
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
    const nasty = bidCardHtml({ ...card, title: 'Forklift <script>alert(1)</script>' });
    expect(nasty).not.toContain("<script>");
    expect(nasty).toContain("&lt;script&gt;");
  });

  it("flips direction for Arabic", () => {
    expect(bidCardHtml(card, "ar")).toContain('dir="rtl"');
  });
});
