import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  cardBlock,
  defaultTemplate,
  fillEquipment,
  isDefaultTemplate,
  loadTemplate,
  renderShareMessage,
  saveTemplates,
  defaultTemplateSet,
  loadTemplates,
  channelKey,
  shareMessageParts,
  EQUIPMENT_TOKEN,
} from "@/lib/shareTemplate";
import type { BidCardModel } from "@/lib/bidCardModel";

/**
 * The message a renter sends, after the boxes were merged (owner, 2026-09-05).
 *
 * *"make the template title editable, make a section after the card also editable, no need to
 * seperate the edit per hello or per you are invited etc, keep them one text box above the card and
 * one below."*
 *
 * So three fields where there were three: `title`, `above`, `below`. The names are not a rename —
 * the shape changed, and a renter's saved wording predates it.
 */

const model = (over: Partial<BidCardModel> = {}): BidCardModel => ({
  ref: "EXC-170845",
  imageHeadline: "Tower light 9m · with operator 6 units",
  cardTitle: "Tower light 9m · with operator 6 units",
  items: [],
  where: "Riyadh · 1 month",
  terms: [{ label: "Mobilization", value: "Supplier" }],
  closing: "Bidding closes 21 Aug 2026",
  accepting: true,
  cta: "Submit your bid",
  ...over,
});

const store: Record<string, string> = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    },
  });
});

describe("the subject line is his", () => {
  it("Given the default title, Then it carries the equipment token", () => {
    // It was built from `t.subject` on every render, so he could read it and never change it.
    expect(defaultTemplate("en").title).toContain(EQUIPMENT_TOKEN);
  });

  it("Given a request, Then the token becomes the machine", () => {
    const p = shareMessageParts(model(), "https://x/bid/1", { lang: "en" });
    expect(p.title).toBe("RFQ for Tower light 9m · with operator 6 units");
  });

  it("Given his own title, Then it is used and the token still fills", () => {
    /**
     * ⚠️ The token is why the title can be his AND still name the right machine. Stored raw, filled
     * per request: his phrasing stays put across forty requests while the equipment changes every
     * time. Freezing the machine into the saved string would put last month's excavator on this
     * month's subject line.
     */
    const p = shareMessageParts(model(), "https://x/bid/1", {
      lang: "en",
      template: { title: `Quote needed: ${EQUIPMENT_TOKEN}`, above: "Hi", below: "Thanks" },
    });
    expect(p.title).toBe("Quote needed: Tower light 9m · with operator 6 units");
  });

  it("Given no machine, Then the token goes and his words stand", () => {
    expect(fillEquipment("RFQ for {equipment}", null)).toBe("RFQ for");
  });

  it("Given the subject, Then it is NOT in the body", () => {
    // It is the envelope, not the letter. Repeated in the body it reads as the message starting twice.
    const out = renderShareMessage(model(), "https://x/bid/1", { lang: "en" });
    expect(out.startsWith("RFQ for")).toBe(false);
  });
});

describe("one box above, one below", () => {
  it("Given the default, Then the greeting and the invitation are ONE value", () => {
    const t = defaultTemplate("en");
    expect(t.above).toContain("Hello,");
    expect(t.above).toContain("invites you to bid");
    expect(t.below).toContain("Thanks,");
  });

  it("Given the message, Then it reads above, card, below, link — in that order", () => {
    const out = renderShareMessage(model(), "https://x/bid/1", { renterName: "Shibh Al Jazira", lang: "en" });
    const at = (s: string) => out.indexOf(s);

    expect(at("Hello,")).toBeLessThan(at("Tower light 9m"));
    expect(at("Tower light 9m")).toBeLessThan(at("Thanks,"));
    expect(out.trimEnd().endsWith("https://x/bid/1")).toBe(true);
  });

  it("Given no company name, Then the untouched default still reads properly", () => {
    /**
     * ⚠️ A sentence is not a slot. "{name} invites you to bid" with the token stripped is
     * " invites you to bid", so the default has a second form that reads without it. His OWN
     * wording is never rewritten — whatever he typed is sent, token removed.
     */
    const p = shareMessageParts(model(), "https://x/bid/1", { lang: "en" });
    expect(p.above).toBe("Hello,\n\nYou are invited to bid on my equipment request.");
    expect(p.below).toBe("Thanks,");
  });
});

describe("a template saved before the merge", () => {
  it("Given the OLD three fields, Then his wording survives rather than resetting", () => {
    /**
     * 🔴 Renters have `{greeting, intro, signoff}` in this browser from before the boxes merged.
     * Ignoring it would silently reset wording somebody wrote once and expected to keep, which is
     * the only reason this is stored at all. Greeting and intro rejoin with the blank line that
     * always sat between them on screen.
     */
    store["moeda.shareTemplate.en"] = JSON.stringify({
      greeting: "Dear partner,",
      intro: "Please quote by Sunday.",
      signoff: "Regards, {name}",
    });

    const t = loadTemplate("en");
    expect(t.above).toBe("Dear partner,\n\nPlease quote by Sunday.");
    expect(t.below).toBe("Regards, {name}");
    // Nothing was saved for the subject back then, so it starts as ours.
    expect(t.title).toBe(defaultTemplate("en").title);
  });

  it("Given a half-written old value, Then the missing half falls back to the default", () => {
    store["moeda.shareTemplate.en"] = JSON.stringify({ greeting: "Hi there," });
    expect(loadTemplate("en").above).toBe("Hi there,");
    expect(loadTemplate("en").below).toBe(defaultTemplate("en").below);
  });

  it("Given the NEWEST shape, Then it is read as it is", () => {
    const set = { ...defaultTemplateSet("en"), email: { title: "T", above: "A", below: "B" } };
    saveTemplates(set, "en");
    expect(loadTemplate("en", "email")).toEqual({ title: "T", above: "A", below: "B" });
    expect(isDefaultTemplate(loadTemplate("en", "email"), "en")).toBe(false);
    // And the other two are untouched by an edit to the first.
    expect(isDefaultTemplate(loadTemplate("en", "whatsapp"), "en")).toBe(true);
  });

  it("Given nothing saved, Then the default, and it counts as untouched", () => {
    expect(isDefaultTemplate(loadTemplate("en"), "en")).toBe(true);
  });
});

describe("the line about not needing an account", () => {
  it("Given an OPEN request, Then nothing is said about accounts at all", () => {
    /**
     * ⚠️ ~~"No account is needed. The link opens the form."~~ Removed (owner, 2026-09-05). It
     * answered a question nobody had asked, sat where a supplier reads the terms he is about to
     * price, and ended every message on a note about US rather than about the job.
     */
    const out = cardBlock(model(), "en");
    expect(out).not.toContain("No account");
    expect(out).not.toContain("opens the form");
    // And it does not leave a gap where it was.
    expect(out).not.toMatch(/\n\n\n/);
    expect(out.trimEnd().endsWith("Bidding closes 21 Aug 2026")).toBe(true);
  });

  it("Given a CLOSED request, Then it still says so", () => {
    /**
     * ⚠️ This line stayed, and it is a different kind of thing: not reassurance, but the one fact
     * that changes what a supplier does with the link. A request that no longer takes bids and does
     * not say so wastes his afternoon.
     */
    expect(cardBlock(model({ accepting: false }), "en")).toContain("no longer accepting bids");
  });
});


describe("one wording per channel", () => {
  it("Given a template saved before the channels split, Then ALL THREE inherit it", () => {
    /**
     * 🔴 At the time he wrote it there was one template and it went out on every channel, so that
     * is what he meant. Applying it to e-mail alone would silently hand WhatsApp our default in
     * place of words he had written.
     */
    store["moeda.shareTemplate.en"] = JSON.stringify({ title: "T", above: "Mine", below: "Bye" });

    const set = loadTemplates("en");
    expect(set.email.above).toBe("Mine");
    expect(set.whatsapp.above).toBe("Mine");
    expect(set.other.above).toBe("Mine");
  });

  it("Given the OLDEST shape, Then it migrates through both steps at once", () => {
    // `{greeting,intro,signoff}` predates the merge AND the split. Both have to apply.
    store["moeda.shareTemplate.en"] = JSON.stringify({ greeting: "Hi,", intro: "Please quote.", signoff: "Bye" });

    const set = loadTemplates("en");
    expect(set.email.above).toBe("Hi,\n\nPlease quote.");
    expect(set.whatsapp.below).toBe("Bye");
  });

  it("Given one channel edited, Then the others keep theirs", () => {
    saveTemplates({ ...defaultTemplateSet("en"), whatsapp: { title: "T", above: "Short one", below: "B" } }, "en");

    expect(loadTemplate("en", "whatsapp").above).toBe("Short one");
    expect(loadTemplate("en", "email").above).toContain("bid on my equipment request");
  });

  it("Given Moedatech only, Then the E-MAIL wording is what the preview reads", () => {
    /**
     * ⚠️ Posting to Moedatech sends no message, so it has no wording of its own. The column still
     * has to draw something, and the e-mail one is the longest of the three and the one he is most
     * likely to be about to use. A blank preview on the state a renter reaches by doing nothing
     * would read as broken.
     */
    expect(channelKey("none")).toBe("email");
    expect(channelKey(null)).toBe("email");
    expect(channelKey("whatsapp")).toBe("whatsapp");
    expect(channelKey("other")).toBe("other");
  });
});
