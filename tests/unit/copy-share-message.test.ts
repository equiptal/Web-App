import { describe, it, expect, vi, beforeEach } from "vitest";
import { copyShareMessage, shareMessageHtml } from "@/lib/copyShareMessage";
import type { BidCardModel } from "@/lib/bidCardModel";

/**
 * Copy carries the message, not the bare link.
 *
 * A renter who pastes into a chat we have no button for — Telegram, a CRM note, an SMS from his own
 * phone — must send the same thing the buttons send. Otherwise one request reads two ways, decided
 * by which control he happened to press, and Copy was the last door that drift came through.
 */

const model: BidCardModel = {
  ref: "EXC-170845",
  imageHeadline: "Tower light 9m · with operator 6 units",
  cardTitle: "Tower light 9m · with operator 6 units",
  items: [],
  where: "Riyadh · 1 month",
  terms: [{ label: "Mobilization", value: "Supplier" }],
  closing: "Bidding closes 21 Aug 2026",
  accepting: true,
  cta: "Submit your bid",
};

const URL_ = "https://web.moedatech.net/bid/abc";
const IMG = "https://web.moedatech.net/bid/abc/og";

describe("shareMessageHtml", () => {
  it("Given the default wording, Then his words wrap our card, and the link ends it", () => {
    const html = shareMessageHtml(model, URL_, IMG, { renterName: "Shibh Al Jazira" });

    expect(html.indexOf("Hello,")).toBeLessThan(html.indexOf("invites you to bid"));
    expect(html.indexOf("invites you to bid")).toBeLessThan(html.indexOf("Tower light 9m"));
    expect(html.indexOf("Tower light 9m")).toBeLessThan(html.indexOf("Thanks,"));
    expect(html.lastIndexOf(URL_)).toBeGreaterThan(html.indexOf("Thanks,"));
  });

  it("Given his own wording, Then it is what the paste carries", () => {
    const html = shareMessageHtml(model, URL_, IMG, {
      renterName: "Shibh Al Jazira",
      template: { title: "RFQ", above: "Dear partner,\n\nPlease quote by Sunday.", below: "Regards, {name}" },
    });

    expect(html).toContain("Dear partner,");
    expect(html).toContain("Please quote by Sunday.");
    expect(html).toContain("Regards, Shibh Al Jazira");
  });

  it("Given wording with markup in it, Then it is escaped rather than rendered", () => {
    // It is HIS text, pasted into somebody else's mail client. Nothing he types may become markup.
    const html = shareMessageHtml(model, URL_, IMG, {
      template: { title: "RFQ", above: "<b>Hi</b>\n\na & b", below: 'say "hello"' },
    });

    expect(html).toContain("&lt;b&gt;Hi&lt;/b&gt;");
    expect(html).toContain("a &amp; b");
    expect(html).not.toContain("<b>Hi</b>");
  });

  it("Given a multi-line sign-off, Then the break survives the paste", () => {
    const html = shareMessageHtml(model, URL_, IMG, { renterName: "Shibh Al Jazira" });
    expect(html).toContain("Thanks,<br>Shibh Al Jazira");
  });
});

describe("copyShareMessage", () => {
  const write = vi.fn(async () => {});
  const writeText = vi.fn(async () => {});

  beforeEach(() => {
    write.mockClear();
    writeText.mockClear();
    vi.stubGlobal("ClipboardItem", class {
      constructor(public parts: Record<string, Blob>) {}
    });
    vi.stubGlobal("navigator", { clipboard: { write, writeText } });
  });

  it("Given a modern clipboard, Then BOTH flavours are written in one item", () => {
    // The receiving app chooses: Gmail keeps the HTML, WhatsApp takes the words. Nothing here
    // decides for it.
    void copyShareMessage("plain words", "<p>markup</p>");
    expect(write).toHaveBeenCalled();
  });

  it("Given no ClipboardItem, Then the words are written rather than nothing", async () => {
    vi.stubGlobal("ClipboardItem", undefined);
    const rich = await copyShareMessage("plain words", "<p>markup</p>");

    expect(rich).toBe(false);
    expect(writeText).toHaveBeenCalledWith("plain words");
  });

  it("Given the rich write throws, Then it still falls back to the words", async () => {
    write.mockRejectedValueOnce(new Error("denied"));
    const rich = await copyShareMessage("plain words", "<p>markup</p>");

    expect(rich).toBe(false);
    expect(writeText).toHaveBeenCalledWith("plain words");
  });
});
