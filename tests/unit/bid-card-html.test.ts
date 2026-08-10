import { describe, it, expect } from "vitest";
import { bidCardHtml, bidCardImageUrl, bidTokenFromUrl } from "@/lib/bidCardHtml";

/**
 * The clipboard card. It exists because Gmail never builds a preview for a pasted URL — so the card
 * has to BE the thing on the clipboard. Its markup mirrors `renderBidLinkCard()` in
 * Moedatech-App's backend-admin; these assertions pin the values both must produce.
 */
const SHARE_URL = "https://webstaging.moedatech.net/bid/eq-rental-5cc5efdc-86ab-459e-a73e-564257e2cbd2";

const card = {
  title: "Forklift rental, 1 unit",
  description: "Riyadh · 30-day rental · Awaiting your response",
  imageUrl: `${SHARE_URL}/og`,
  url: SHARE_URL,
};

describe("bidTokenFromUrl", () => {
  it("pulls the group id out of a slugged share link", () => {
    expect(bidTokenFromUrl(card.url)).toBe("5cc5efdc-86ab-459e-a73e-564257e2cbd2");
  });

  it("returns null when there is no uuid to find", () => {
    expect(bidTokenFromUrl("https://webstaging.moedatech.net/requests")).toBeNull();
  });
});

describe("bidCardImageUrl", () => {
  /**
   * The copied card and the unfurled card have to be the SAME picture — that is what makes the design
   * one design rather than two that resemble each other. Both point at `/bid/{slug}/og`.
   */
  it("points the band at the per-request card drawn for this link", () => {
    expect(bidCardImageUrl(SHARE_URL)).toBe(`${SHARE_URL}/og`);
  });

  it("carries the language, so an Arabic card is copied in Arabic", () => {
    expect(bidCardImageUrl(SHARE_URL, "ar")).toBe(`${SHARE_URL}/og?lang=ar`);
  });

  it("drops any existing query and hash rather than forwarding them to the renderer", () => {
    expect(bidCardImageUrl(`${SHARE_URL}?lang=ar&utm=x#frag`)).toBe(`${SHARE_URL}/og`);
  });

  it("returns null for a URL that isn't a share link, so the caller keeps the static asset", () => {
    expect(bidCardImageUrl("https://webstaging.moedatech.net/requests")).toBeNull();
    expect(bidCardImageUrl("not a url")).toBeNull();
  });
});

describe("bidCardHtml", () => {
  const html = bidCardHtml(card);

  it("renders the prototype's card: band, title, description, source domain", () => {
    expect(html).toContain('height="231"');                  // 1200×630 at 440 wide — the drawn card
    expect(html).toContain("border:1px solid #E1E4E8");
    expect(html).toContain("border-radius:10px");
    expect(html).toContain("Forklift rental, 1 unit");
    expect(html).toContain("Riyadh · 30-day rental · Awaiting your response");
    expect(html).toContain("WEBSTAGING.MOEDATECH.NET");
  });

  it("pins the width in pixels, because Gmail strips max-width", () => {
    // A card sized with width="100%" stretched to the full width of the compose window.
    expect(html).toContain('width="440"');
    expect(html).toContain("width:440px");
    expect(html).not.toContain('width="100%"');
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
