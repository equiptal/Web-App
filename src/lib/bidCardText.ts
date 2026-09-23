/**
 * The bid card **as plain text** — the third rendering of the one model.
 *
 * ── One template, wherever the link goes (owner, 2026-09-01) ────────────────────────────────────
 *
 * The card was already one thing: `bidCardModel` feeds the generated image and the HTML card, so
 * they cannot disagree about a request. The WORDS were three different messages —
 *
 *   - direct WhatsApp / SMS / e-mail sent *"X invites you to submit a bid (RFQ): <url>"*
 *   - *Send to my suppliers* sent a laid-out note with a reference and the renter's own line
 *   - *Copy* put the bare URL on the clipboard as its plain flavour
 *
 * — so the same request read three ways depending on which button was pressed, and two of the three
 * said nothing about the machine, the site or the deadline.
 *
 * ── The words are now the renter's; the card is still ours ──────────────────────────────────────
 *
 * The message is composed by `shareTemplate.ts`: his greeting, his intro, our fixed card block, his
 * sign-off, then the link. This file stays because the clipboard's plain flavour and anything else
 * that wants the message with no template still want ONE function to call — it is that function,
 * and it delegates, so there is no second renderer to drift.
 *
 * ── Text is not the poor relation ───────────────────────────────────────────────────────────────
 *
 * It is what SMS gets, what WhatsApp shows above its own card, what Gmail shows when someone pastes
 * the plain flavour, and what everyone sees while an unfurl is still loading — or when it fails. A
 * supplier who never sees the card must still know what is being asked and by when.
 */

import type { BidCardModel } from "@/lib/bidCardModel";
import { renderShareMessage, type ShareTemplate } from "@/lib/shareTemplate";

export function bidCardText(
  m: BidCardModel,
  url: string,
  {
    renterName,
    note,
    lang = "en",
    template,
  }: {
    renterName?: string | null;
    note?: string | null;
    lang?: "en" | "ar";
    /** The renter's own wording. Omitted, the built-in default is used. */
    template?: ShareTemplate;
  } = {},
): string {
  return renderShareMessage(m, url, { renterName, note, lang, template });
}
