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
 * This is that same model in words. Now every channel carries the same facts in the same order, and
 * the rendering differs only where the medium forces it: a picture where a picture is drawn, markup
 * where markup survives, text where neither does.
 *
 * ── Text is not the poor relation ───────────────────────────────────────────────────────────────
 *
 * It is what SMS gets, what WhatsApp shows above its own card, what Gmail shows when someone pastes
 * the plain flavour, and what everyone sees while an unfurl is still loading — or when it fails. A
 * supplier who never sees the card must still know what is being asked and by when.
 */

import type { BidCardModel } from "@/lib/bidCardModel";

const COPY = {
  en: {
    invites: (renter: string) => `${renter} invites you to bid on an equipment request.`,
    invitesNoName: "You are invited to bid on an equipment request.",
    noAccount: "No account is needed — the link opens the form.",
    closed: "This request is no longer accepting bids.",
  },
  ar: {
    invites: (renter: string) => `يدعوك ${renter} لتقديم عرض على طلب معدات.`,
    invitesNoName: "أنت مدعوٌّ لتقديم عرض على طلب معدات.",
    noAccount: "لا حاجة لحساب — الرابط يفتح النموذج مباشرة.",
    closed: "لم يعد هذا الطلب يقبل العروض.",
  },
} as const;

/**
 * Render the card as a message.
 *
 * `note` is the renter's own line and goes first, above everything we wrote: it is the part a person
 * actually reads, and under the request details it would be read after the decision was made.
 *
 * Nothing is invented. A request with no terms prints no term lines; one with no deadline prints no
 * closing line. What the request does not carry does not appear, which is the same rule the image and
 * the HTML card follow.
 */
export function bidCardText(
  m: BidCardModel,
  url: string,
  { renterName, note, lang = "en" }: { renterName?: string | null; note?: string | null; lang?: "en" | "ar" } = {},
): string {
  const t = COPY[lang];
  const renter = renterName?.trim();
  const own = note?.trim();

  const lines: (string | null)[] = [
    own || null,
    own ? "" : null,

    // Who is asking, and for what. The reference leads the machine so an operator can file the reply
    // against it without opening the link.
    renter ? t.invites(renter) : t.invitesNoName,
    "",
    m.ref ? `${m.ref} — ${m.imageHeadline}` : m.imageHeadline,
    m.where || null,

    // Every machine, when there is more than one. The image can only name the first.
    ...(m.items.length ? ["", ...m.items.map((i) => `• ${i.label} ${i.value}`)] : []),

    // The terms, one per line rather than the card's row pairs: a chat bubble has width for a line
    // and no columns to align.
    ...(m.terms.length ? ["", ...m.terms.map((x) => `${x.label}: ${x.value}`)] : []),

    m.closing ? "" : null,
    m.closing,
    "",
    url,
    "",
    m.accepting ? t.noAccount : t.closed,
  ];

  return lines
    .filter((l) => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
