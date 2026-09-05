/**
 * The bid-link card as rich text, for the clipboard.
 *
 * Why this exists: **Gmail never builds a link preview.** It doesn't fetch a pasted URL — by design,
 * so a site can't learn you're composing a message about it. No Open Graph tag changes that. But a
 * Gmail message body is just HTML, and its composer keeps HTML you paste into it. So if the clipboard
 * carries the card itself rather than the URL, Gmail renders it like any other pasted content.
 *
 * `copyBidLink` therefore writes TWO clipboard flavours at once:
 *   - `text/html`  → this card. Gmail, Outlook web, Word, Notion take it.
 *   - `text/plain` → **the same card in words** (`bidCardText`). WhatsApp, Telegram and SMS take it,
 *     and unfurl the URL inside it themselves.
 * The destination picks; the user never chooses.
 *
 * ⚠️ The plain flavour was the BARE URL, and that was the last place the one template leaked: a
 * renter who copied and pasted into WhatsApp sent a naked link, while the same press into Gmail sent
 * a full card (owner, 2026-09-01). Same facts either way now.
 *
 * ── THE CARD SAYS MORE THAN THE IMAGE ────────────────────────────────────────────────────────────
 * The generated image carries the logo, the reference, the machine and one line asking for the bid —
 * and nothing else (owner, 2026-09-01). Here there is markup, so here is where the detail goes: every
 * machine, the site and the dates, the terms, the deadline. Same model behind both, so they cannot
 * disagree about the request; different amounts of room, so they do not carry the same load.
 *
 * ── MIRROR ────────────────────────────────────────────────────────────────────────────────────────
 * The markup below mirrors `renderBidLinkCard()` in
 * `Moedatech-App/apps/backend-admin/src/services/email/bid-link-card.ts`, which renders the same card
 * into app-sent email. Separate repos, no shared package. Both come from the approved prototype
 * (`prototypes/bid-link-card-v1.html`): 1px --background border, 10px radius, 440px wide, a 160px
 * image band, then the title, the detail rows, the app line and the source domain.
 */

import { COLORS, RADII } from "@/lib/ds-colors";
import { logoDataUri } from "@/lib/bidOgAssets";
import type { BidCardModel } from "@/lib/bidCardModel";

export interface BidCardPreview {
  title: string;
  description: string;
  /** 1200×630, displayed at 440×160 — the prototype's band. */
  imageUrl: string;
  url: string;
}

/** The link is `/bid/{slug}-{groupId}`; the token the backend resolves is the trailing UUID. */
const GROUP_ID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function bidTokenFromUrl(shareUrl: string): string | null {
  return shareUrl.match(GROUP_ID_RE)?.[0] ?? null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/*
 * — `hostOf` lived here —
 *
 * It upper-cased the link's domain for the band's source line. Both are gone (owner, 2026-09-05):
 * the card is inside an `<a>`, so it IS the link, and every unfurling client draws its own domain
 * line anyway.
 */

/*
 * — `JOIN_LINE` lived here —
 *
 * "New to Moedatech? Bid from the app and see every request from this renter — get the app."
 * Removed 2026-09-03: the card is a REQUEST, and a supplier reading it is deciding whether to price
 * a job. An advertisement at the foot of it spends his attention on something he did not ask about,
 * in the one place we have it.
 */

/*
 * — `row` and `block` lived here —
 *
 * They drew the term table: a two-column list of «Mobilization / Renter» pairs under the title.
 * Removed 2026-09-03 because no client builds one. An unfurl has four slots — image, title,
 * description, host — and everything a table said now rides in the description, which is the same
 * string `og:description` carries.
 */
/**
 * The navy band, drawn as MARKUP rather than fetched as a picture.
 *
 * `/bid/[token]/og` renders the real one, and it needs a token — which does not exist until the
 * request does. The share panel therefore showed a generic band with nothing on it but the logo, so
 * the most visible half of the card was the one part of the preview that was not true.
 *
 * This is the same four elements in the same order as that route: the mark, the reference, the
 * equipment, the call to bid, and the host underneath. Not a replica of the pixels — a statement of
 * the same facts, which is what a preview owes.
 */
function navyBand(model: BidCardModel, align: string): string {
  const headline = escapeHtml(model.imageHeadline);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background:${COLORS.navy};">
      <tr><td align="${align}" style="padding:16px 18px 16px;">
        ${
          /* ⚠️ **The MARK, not the word** (owner, 2026-09-05: *"make sure moedatech show the
             moedatech logo not the text"*). `MOEDATECH` in letter-spaced caps was a stand-in that
             outlived its excuse: the real card at `/bid/<token>/og` has drawn the logo all along, so
             the preview was showing a different brand from the thing it previews.

             The same `logoDataUri` that route uses, white on navy. A data URI rather than a path,
             because this markup is also what a paste carries into a mail client, and a client
             fetching `/moedatech-logo.svg` from wherever it happens to be would fetch nothing.

             ⚠️ 72px on a 440px card is 16%, matching the proportion the rendered card at
             `/bid/<token>/og` draws (228 of 1200, 19%) rather than shouting over the equipment
             name below it. It is a mark, not a masthead: the supplier is here to read the machine.

             ⚠️ The ground is `COLORS.navy`, which IS `--navy` from `globals.css` — a test pins
             the two files together. Satori cannot read a CSS variable, so the hex travels through
             `ds-colors.ts` rather than the card inventing a navy of its own. */ ""
        }
        <img src="${logoDataUri(COLORS.surface)}" alt="Moedatech" width="72" height="27" style="display:block;width:72px;max-width:72px;height:auto;border:0;outline:none;">
        <div style="font-size:${headline.length > 46 ? 16 : 20}px;font-weight:700;color:${COLORS.surface};line-height:1.2;padding-top:16px;">${headline}</div>
        <div style="font-size:12px;font-weight:700;color:${model.accepting ? COLORS.brand : COLORS.dangerHover};padding-top:10px;">${escapeHtml(model.cta)}</div>
        ${
          /* ⚠️ ~~The host, small and grey under the call to bid.~~ Removed (owner, 2026-09-05).
             It was a trust signal when the card was the whole message, and it is noise now: the
             whole block is inside an `<a>`, so the card IS the link, and `WEB-PRODUCTION-DE3C8.
             UP.RAILWAY.APP` under a request reads as machinery rather than as reassurance. The same
             line was removed from the white half on 2026-09-03; this copy was missed. */ ""
        }
      </td></tr>
    </table>`;
}

export function bidCardHtml(card: BidCardPreview, model: BidCardModel | null, lang: "en" | "ar" = "en"): string {
  const dir = lang === "ar" ? "rtl" : "ltr";
  const align = lang === "ar" ? "right" : "left";
  const url = escapeHtml(card.url);

  /**
   * The headline lives in the picture. When there IS no picture and we draw the band as markup, the
   * band already carries it — repeating it as the title directly underneath is the machine's name
   * twice in twenty vertical pixels, which is what a real unfurl never does.
   */
  const bandIsMarkup = !card.imageUrl && !!model;
  const title = bandIsMarkup ? "" : model?.cardTitle || card.title;

  /**
   * ── The card names the request; the MESSAGE carries the detail (owner, 2026-09-03) ───────────
   *
   * *"i want them as points not like this will never be read by user, i want them part of the text
   * message of this link preview like below the image."*
   *
   * `bidCardDescription` put nine facts in one grey paragraph that wrapped to four lines — site,
   * dates, deadline, four responsibilities, year, certificate, all separated by middots. Nobody
   * reads that. It is what `og:description` has to be, because Open Graph has one description slot
   * and no others; but our own card is not obliged to imitate a limitation.
   *
   * So the card keeps what an unfurl can genuinely show — picture, name, host — and every term
   * becomes a line in the message underneath, where it can be scanned.
   */
  const description = model ? model.where : card.description;

  return `<a href="${url}" style="text-decoration:none;color:inherit;display:block;max-width:440px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="440" dir="${dir}" style="width:440px;max-width:100%;border:1px solid ${COLORS.background};border-radius:${RADII.md};border-collapse:separate;overflow:hidden;background:${COLORS.surface};font-family:'Segoe UI',Roboto,Arial,sans-serif;">
    <tr><td style="padding:0;line-height:0;">
      ${
        /* The real rendering when there is one; the same facts in markup when there is not yet a
           request to render. An `<img>` pointing at the generic file drew a band with nothing on it,
           which is the half of the card a supplier sees first. */
        card.imageUrl
          ? /* ⚠️ 440 × 231, which is 1200 × 630 to scale. It was drawn at 440 × 160 — a 2.75:1 box
               for a 1.9:1 picture — so every card squashed the mark and the headline vertically
               (owner, 2026-09-03: *"the image text has wierd dimentions"*). Both attributes AND the
               style carry it, because Outlook reads the attributes and ignores the style. */
            `<img src="${escapeHtml(card.imageUrl)}" alt="" width="440" height="231" style="display:block;width:440px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;background-color:${COLORS.navy};">`
          : model
            ? navyBand(model, align)
            : ""
      }
    </td></tr>
    <tr><td align="${align}" style="padding:14px 16px 16px;">
      ${
        /* ⚠️ The picture already names the machine and asks for the bid, so a title here is the same
           words again twenty pixels lower. What an unfurl needs under the image is the ONE thing the
           image cannot be trusted to carry: where the link goes. The detail lives in the message
           below the card, as lines a supplier can scan (owner, 2026-09-03). */
        ""
      }
      ${title ? `<div style="font-size:13px;font-weight:700;color:${COLORS.foreground};line-height:1.35;">${escapeHtml(title)}</div>` : ""}
      ${description ? `<div style="font-size:12px;color:${COLORS.mutedDark};line-height:1.5;padding-top:4px;">${escapeHtml(description)}</div>` : ""}
      ${
        /* ── No host line (owner, 2026-09-03: *"remove this web.prod url view in the card just
             opening it wil open the link"*) ───────────────────────────────────────────────────
           It was there as a trust signal, and it earned its place when the card was the whole
           message. It is noise now: the card IS the link — the whole block is inside an `<a>` — and
           a raw railway.app hostname under a request reads as machinery rather than as
           reassurance. WhatsApp, Telegram and Slack draw their own domain line under an unfurl
           regardless, so nothing is lost where it was doing work. */
        ""
      }
    </td></tr>
  </table>
</a>`;
}

/*
 * ── `copyBidLink` lived here ────────────────────────────────────────────────────────────────────
 *
 * It wrote the card to the clipboard in two flavours, and it rendered the DEFAULT wording: no
 * greeting the renter had written, no company name. `copyShareMessage` does the same two-flavour
 * write from the renter's own template, so keeping this one meant one dialog could put two
 * different messages on the clipboard depending on which Copy was pressed. Removed rather than
 * wrapped: a second clipboard writer is a second message waiting to happen.
 */
