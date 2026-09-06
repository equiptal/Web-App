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

describe("the card is the shape an unfurl builds", () => {
  it("Given a model, Then image, title, description, host — and no term table", () => {
    /**
     * Owner, 2026-09-03: *"this is how the template must look like, this is what we decided which is
     * different from the current preview. why??"*
     *
     * Because this drew something no client builds: a two-column list of «Mobilization / Renter»
     * pairs, plus a per-item block under it. WhatsApp, Telegram, Slack and Outlook all render the
     * SAME four things from Open Graph — image, one bold title, a description paragraph, the host
     * — because there are no tags for anything else.
     */
    const html = bidCardHtml(card, {
      ref: null,
      imageHeadline: "Excavator 20 ton · with operator 2 units",
      cardTitle: "Excavator 20 ton · with operator 2 units",
      items: [],
      where: "Riyadh · 4 months & extendable",
      terms: [
        { label: "Mobilization", value: "Renter" },
        { label: "Fuel", value: "Supplier" },
      ],
      closing: "Bidding closes 21 Aug 2026",
      accepting: true,
      cta: "Open the link to submit your bid →",
    });

    // Picture, name, where. No host line: the card IS the link, and every app that unfurls draws
    // its own domain beneath it (owner, 2026-09-03).
    expect(html).toContain("<img");
    expect(html).toContain("Excavator 20 ton");
    expect(html).toContain("Riyadh");
    expect(html).not.toContain("WEBSTAGING.MOEDATECH.NET");

    /**
     * ⚠️ The TERMS are not on the card at all any more (owner, 2026-09-03: *"i want them as points
     * ... part of the text message of this link preview"*). Nine facts in one grey paragraph is a
     * thing nobody reads; they are lines in the message below the card now. See `cardBlock`.
     */
    expect(html).not.toContain("Mobilization: Renter");
    expect(html).not.toContain("<td width=\"122\"");
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
        imageHeadline: "Excavator 20 ton · with operator 2 units",
        cardTitle: "Excavator 20 ton · with operator 2 units",
        items: [],
        where: "Riyadh · 4 months",
        terms: [],
        closing: null,
        accepting: true,
        cta: "Open the link to submit your bid →",
      },
    );

    // The same three things the `og` route draws, in the same order.
    /**
     * ⚠️ **The MARK, not the word** (owner, 2026-09-05: *"make sure moedatech show the moedatech
     * logo not the text"*). `MOEDATECH` in letter-spaced caps was a stand-in that outlived its
     * excuse: `/bid/<token>/og` has drawn the logo all along, so the preview showed a different
     * brand from the thing it previews. Same `logoDataUri`, so they cannot drift.
     */
    expect(html).toContain('alt="Moedatech"');
    /**
     * ⚠️ **`max-width` as well as `width`, and it is load-bearing.** The share panel renders this
     * markup inside a container carrying `[&_img]:!w-full`, written so the CARD picture scales to
     * the column. The logo is an `img` too, so `!important` beat its inline width and the mark
     * filled the card edge to edge (owner, 2026-09-06, with a screenshot of it). `max-width` is a
     * different property, so it constrains the computed width without fighting `!important`.
     */
    /**
     * ⚠️ The band's numbers are the RENDERED card's, scaled by 440/1200: 84 x 32 mark, 29px
     * headline, 23/27 padding. They were eyeballed before and the two drew the same facts at
     * visibly different sizes. `max-width` is still the load-bearing half — the panel wraps this
     * markup in `[&_img]:!w-full`, and `!important` beats an inline `width`.
     */
    expect(html).toContain("max-width:84px");
    expect(html).not.toContain(">MOEDATECH<");
    expect(html).toContain("Excavator 20 ton");
    expect(html).toContain("Open the link to submit your bid");
    /**
     * And NOT the reference (owner, 2026-09-03: *"remove it from the card too"*). It is our filing,
     * not his: the one number on the card a supplier cannot use, in the corner his eye reaches
     * before the equipment. He has the link, and the link knows which request it is.
     */
    expect(html).not.toContain("CEX-020964");
    // And no picture of NOTHING: the generic navy rectangle is never stood in for a real card.
    expect(html).not.toContain("og-bid.png");
    /**
     * ⚠️ The band does carry ONE image now, the wordmark, inline as a data URI (owner,
     * 2026-09-05). What must stay absent is a remote picture: the band exists precisely because
     * there is no rendered card yet.
     */
    expect(html).not.toContain('src="http');
  });
});

describe("bidCardHtml", () => {
  const html = bidCardHtml(card, null);

  it("renders the prototype's card: band, title, description", () => {
    /* ⚠️ 440 × 231 = 1200 × 630 to scale. It was 440 × 160 — a 2.75:1 box for a 1.9:1 picture — so
       every card squashed the mark and the headline (owner, 2026-09-03). */
    expect(html).toContain('height="231"');
    // The card is pasted into a mail client, which has none of our stylesheet, so it carries literal
    // values from `ds-colors` rather than `var(--border)`.
    expect(html).toContain(`border:1px solid ${COLORS.background}`);
    expect(html).toContain(`border-radius:${RADII.md}`);
    expect(html).toContain("Forklift rental, 1 unit");
    expect(html).toContain("Riyadh · 30-day rental · Awaiting your response");
    // The source domain went with the host line — see the case above.
    // The source domain went with the host line — the card IS the link (owner, 2026-09-03).
    expect(html).not.toContain("WEBSTAGING.MOEDATECH.NET");
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
