/**
 * One model behind every surface that draws a bid link: the generated OG image, the clipboard card,
 * and the app-sent email that mirrors it.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────────
 * `bidCardDetails` splits the preview's two strings back into fields, because two strings was all the
 * backend returned. Those strings carry a city and a rental basis and nothing else — no items, no
 * mobilisation, no fuel, no dates — which is why the card never showed a term: they were never in the
 * string to begin with (found in production, 2026-09-01).
 *
 * The values exist. `GET /public/bid-form/{token}` carries every one of them, publicly and without
 * auth. It cannot be the source for a card, because it **bumps `request_share_links.opened_count`**
 * on every call (`getBidForm.ts:56`) and an unfurl bot is not a supplier opening a link. So the fields
 * are being added to the preview endpoint instead, which is read-only and already cached — SUP-BE-21.
 *
 * This module reads them when they are there and falls back to the string split when they are not, so
 * the card improves the day the backend deploys and never regresses before it.
 */

import type { BidPreview, BidPreviewCard } from "@/lib/api/bidPreview";
import { bidCardDetails } from "@/lib/bidCardDetails";

export interface BidCardTerm {
  label: string;
  value: string;
}

export interface BidCardModel {
  /** `EXC-170845` / `RFQ-00077`, or null on a request that predates the short-code sequence. */
  ref: string | null;
  /** The image's headline: the first machine, then `+n more`. Never more than one line's worth. */
  imageHeadline: string;
  /** The card's headline: every machine, because a card has room for a list and an image does not. */
  cardTitle: string;
  /** Each machine on its own row — empty when the structured fields aren't there yet. */
  items: BidCardTerm[];
  /** `Riyadh · 1 month · 18 Aug → 17 Sep 2026`, dropping whatever the request doesn't carry. */
  where: string | null;
  /** Mobilisation, demobilisation, food, accommodation & transport, fuel. Only what is set. */
  terms: BidCardTerm[];
  /** `Bidding closes 21 Aug 2026` while open, `Closed 21 Aug 2026 — no longer accepting bids` after. */
  closing: string | null;
  accepting: boolean;
  /** The one line the image asks for: bid, or don't bother. */
  cta: string;
}

const COPY = {
  en: {
    cta: "Open the link to submit your bid →",
    ctaClosed: "No longer accepting bids",
    closes: (on: string) => `Bidding closes ${on}`,
    closed: (on: string) => `Closed ${on} — no longer accepting bids`,
    closedNoDate: "No longer accepting bids",
    machines: (n: number) => `${n} machines`,
    more: (n: number) => ` +${n} more`,
  },
  ar: {
    cta: "افتح الرابط لتقديم عرضك ←",
    ctaClosed: "لم يعد يقبل العروض",
    closes: (on: string) => `يُغلق الاستقبال ${on}`,
    closed: (on: string) => `أُغلق ${on} — لم يعد يقبل العروض`,
    closedNoDate: "لم يعد يقبل العروض",
    machines: (n: number) => `${n} معدات`,
    more: (n: number) => ` +${n} أخرى`,
  },
} as const;

/** `Tower light 9m · with operator ×6` — size and operator only when the request carries them. */
function itemLabel(it: BidPreviewCard["items"][number], lang: "en" | "ar"): string {
  const withOperator = lang === "ar" ? "مع مشغّل" : "with operator";
  const parts = [it.label, it.size].filter(Boolean);
  const head = parts.join(" ");
  return it.operator ? `${head} · ${withOperator}` : head;
}

/**
 * Build the model from a preview.
 *
 * Never throws: a preview with no structured card degrades to the string split, and no preview at all
 * degrades to the caller's fallback copy. An unfurl bot has no user to apologise to, so every path
 * here has to end in a card.
 */
export function bidCardModel(
  preview: BidPreview | null,
  copy: { title: string; description: string },
  lang: "en" | "ar" = "en",
): BidCardModel {
  const t = COPY[lang];
  const accepting = preview ? preview.status !== "closed" : true;
  const card = preview?.card ?? null;

  if (!card || !card.items.length) {
    // The string path. `d.status` is the backend's own closing line, already localised — and on a
    // closed request it is the whole of what that endpoint says, which is the fault SUP-BE-21 fixes.
    const d = bidCardDetails(copy, lang, accepting);
    return {
      ref: preview?.reference ?? d.ref,
      imageHeadline: d.headline,
      cardTitle: d.headline,
      items: [],
      where: d.rows.map((r) => r.value).join(" · ") || null,
      terms: [],
      closing: d.status || null,
      accepting,
      cta: accepting ? t.cta : t.ctaClosed,
    };
  }

  const items = card.items;
  const first = itemLabel(items[0], lang);
  const count = (n: number) => (n > 1 ? ` ×${n}` : "");
  const rest = items.length - 1;

  // The image names the first machine and counts the rest. Three headlines do not fit at 70px, and
  // shrinking them to fit makes the one a supplier is scanning for as small as the two he is not.
  const imageHeadline = `${first}${count(items[0].units)}${rest > 0 ? t.more(rest) : ""}`;
  // The card has room for a list, so its title says the scale and the city and the list does the rest.
  const cardTitle =
    rest > 0
      ? [t.machines(items.length), card.city].filter(Boolean).join(" · ")
      : `${first}${count(items[0].units)}`;

  const closesOn = card.closesOn;
  const closing = accepting
    ? closesOn
      ? t.closes(closesOn)
      : null
    : closesOn
      ? t.closed(closesOn)
      : t.closedNoDate;

  return {
    ref: preview?.reference ?? null,
    imageHeadline,
    cardTitle,
    // A single-machine request already says the machine in the title; repeating it as a row below is
    // the same words twice in 14 vertical pixels.
    items: rest > 0 ? items.map((it) => ({ label: itemLabel(it, lang), value: `×${it.units}` })) : [],
    where: [rest > 0 ? null : card.city, card.duration, card.dateRange].filter(Boolean).join(" · ") || null,
    terms: card.terms.map((x) => ({ label: x.label, value: x.value })),
    closing,
    accepting,
    cta: accepting ? t.cta : t.ctaClosed,
  };
}

/**
 * The description an unfurling client shows under the title.
 *
 * WhatsApp, Slack and Apple Mail draw the image, the title and this — and no markup at all. So when
 * the image stops trying to be a document, this line is where the detail goes: it reflows, it is
 * selectable, and it survives a recipient who has images turned off.
 */
export function bidCardDescription(m: BidCardModel): string {
  return [m.where, m.terms.map((x) => `${x.label}: ${x.value}`).join(" · ") || null, m.closing]
    .filter(Boolean)
    .join(" · ");
}
