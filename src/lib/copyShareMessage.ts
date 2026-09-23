/**
 * Copy the whole message, not the bare link.
 *
 * ── Why (owner, 2026-09-02) ─────────────────────────────────────────────────────────────────────
 *
 * *"i want the link itself to have a template so even if copied and pasted not direct share to a
 * specific channel will also show a template."*
 *
 * Copy used to put a URL on the clipboard and nothing else. So a renter who pasted it into a chat we
 * do not have a button for — Telegram, a CRM note, an SMS from his own phone — sent a naked link,
 * while the very same request sent through the E-mail button carried his greeting, the machines, the
 * site, the dates and the deadline. One request, two messages, decided by which control he happened
 * to press. That is the drift this whole feature exists to stop, and Copy was the last door it came
 * through.
 *
 * ── Two flavours, one write ─────────────────────────────────────────────────────────────────────
 *
 *   - **`text/html`** — his words with OUR card between them, as markup. Gmail, Outlook on the web
 *     and Word keep pasted HTML, so it arrives as a laid-out message with the card drawn.
 *   - **`text/plain`** — the same message in words. WhatsApp, Telegram and SMS take this one and
 *     unfurl the URL themselves.
 *
 * Both are written in ONE `ClipboardItem`, so the receiving app chooses; nothing here decides for it.
 *
 * ── It degrades, always ─────────────────────────────────────────────────────────────────────────
 *
 * `navigator.clipboard.write` needs a secure context and is missing in older browsers, and
 * `ClipboardItem` is missing in more of them. Every failure falls back to writing the plain text,
 * and that falls back to the link. A renter must never press Copy and get nothing.
 */

import type { BidCardModel } from "@/lib/bidCardModel";
import { bidCardHtml } from "@/lib/bidCardHtml";
// Literal values, not `var(--…)`: no mail client resolves a custom property, which is why the card
// itself reads the same table. See `ds-colors.ts`.
import { COLORS } from "@/lib/ds-colors";
import { cardBlock, shareMessageParts, type ShareTemplate } from "@/lib/shareTemplate";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** His own lines, as markup. Newlines become breaks; everything else is escaped, because it is his. */
const para = (text: string) =>
  text.trim()
    ? `<p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:${COLORS.navy};">${escapeHtml(text.trim()).split("\n").join("<br>")}</p>`
    : "";

/**
 * The message as HTML: his greeting, his intro, our card, his sign-off, then the link.
 *
 * The same order as the plain flavour and the same order as every channel, so a supplier who is
 * forwarded the pasted version and the sent version cannot tell them apart.
 */
export function shareMessageHtml(
  m: BidCardModel,
  url: string,
  imageUrl: string,
  { template, renterName, lang = "en" }: { template?: ShareTemplate; renterName?: string | null; lang?: "en" | "ar" } = {},
): string {
  const p = shareMessageParts(m, url, { template, renterName, lang });
  const card = bidCardHtml({ title: m.cardTitle, description: m.where ?? "", imageUrl, url }, m, lang);

  /**
   * ── The points go in the HTML too (owner, 2026-09-03: *"where is the reqest details in the
   * email?"*) ─────────────────────────────────────────────────────────────────────────────────
   *
   * The plain-text message had them and this did not, so the same request read two ways depending
   * on whether the renter's mailbox was connected. `omitHead` because the card directly above
   * already names the machine and the site; what is left is the terms, the deadline, and the line
   * that says no account is needed.
   */
  const detail = cardBlock(m, lang, { omitHead: true });

  return [
    `<div dir="${lang === "ar" ? "rtl" : "ltr"}" style="font-family:'Segoe UI',Roboto,Arial,sans-serif;">`,
    para(p.above),
    card,
    `<div style="height:12px;"></div>`,
    para(detail),
    para(p.below),
    // The link in words as well as in the card: a client that strips the card still leaves a way in.
    url ? `<p style="margin:0;font-size:13px;"><a href="${escapeHtml(url)}" style="color:${COLORS.info};">${escapeHtml(url)}</a></p>` : "",
    `</div>`,
  ]
    .filter(Boolean)
    .join("");
}

/**
 * Write both flavours, and never leave the renter with an empty clipboard.
 *
 * Returns true only when the rich write actually succeeded, so a caller can say *"copied"* either
 * way but knows which one happened.
 */
export async function copyShareMessage(text: string, html: string): Promise<boolean> {
  const plain = () => navigator.clipboard?.writeText(text);

  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      await plain();
      return false;
    }
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      }),
    ]);
    return true;
  } catch {
    await plain()?.catch(() => {});
    return false;
  }
}
