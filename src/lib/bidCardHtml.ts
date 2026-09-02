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

import { JOIN_URL } from "@/lib/config/store-links";
import { COLORS, RADII } from "@/lib/ds-colors";
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

/** Host for the card's source-domain line — the trust signal (element 4 in the prototype). */
function hostOf(url: string): string {
  return url.replace(/^https?:\/\//, "").split("/")[0].toUpperCase();
}

const JOIN_LINE = {
  en: (host: string) =>
    `New to Moedatech? Bid from the app and see every request from this renter — <a href="${host}" style="color:${COLORS.brandDeep};font-weight:800;text-decoration:none;">get the app</a>.`,
  ar: (host: string) =>
    `جديد على مُعِدّاتك؟ قدّم عروضك من التطبيق وتابع كل طلبات هذا المستأجر — <a href="${host}" style="color:${COLORS.brandDeep};font-weight:800;text-decoration:none;">حمّل التطبيق</a>.`,
} as const;

/** One `label · value` line. A row the request cannot answer never reaches here. */
function row(label: string, value: string, align: string): string {
  return `<tr>
        <td width="122" style="padding:2px 0;font-size:11.5px;color:${COLORS.muted};font-weight:600;vertical-align:top;text-align:${align};">${escapeHtml(label)}</td>
        <td style="padding:2px 0;font-size:11.5px;color:${COLORS.navy};font-weight:700;text-align:${align};">${escapeHtml(value)}</td>
      </tr>`;
}

/** A bordered group of rows, or nothing at all when the group is empty. */
function block(rows: string[]): string {
  if (!rows.length) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-top:1px solid ${COLORS.border};margin-top:9px;padding-top:8px;border-collapse:collapse;">
      ${rows.join("\n      ")}
    </table>`;
}

/**
 * Table-based with inline styles, because that is what survives a paste into Gmail and Outlook —
 * both strip `<style>` blocks and ignore flex/grid. The image is a fixed 160px band rather than
 * `object-fit: cover`, which Outlook does not support; the asset is already that shape.
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
function navyBand(model: BidCardModel, host: string, align: string): string {
  const headline = escapeHtml(model.imageHeadline);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background:${COLORS.navy};">
      <tr><td align="${align}" style="padding:16px 18px 14px;">
        <div style="font-size:13px;font-weight:800;letter-spacing:1px;color:${COLORS.surface};">MOEDATECH</div>
        <div style="font-size:${headline.length > 46 ? 16 : 20}px;font-weight:700;color:${COLORS.surface};line-height:1.2;padding-top:16px;">${headline}</div>
        <div style="font-size:12px;font-weight:700;color:${model.accepting ? COLORS.brand : COLORS.dangerHover};padding-top:10px;">${escapeHtml(model.cta)}</div>
        <div style="font-size:9.5px;letter-spacing:1.5px;color:rgba(255,255,255,0.48);padding-top:14px;">${escapeHtml(host.toUpperCase())}</div>
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
   * twice in twenty vertical pixels, which is what a real unfurl never does (the image is a picture,
   * the title is text, and a reader reads them as one thing).
   */
  const bandIsMarkup = !card.imageUrl && !!model;
  const title = bandIsMarkup ? "" : model?.cardTitle || card.title;
  const where = model?.where ?? card.description;
  /**
   * The request's own answers first — the site and the dates are above this, and these are the
   * terms every machine on the request agrees on.
   */
  const terms = (model?.terms ?? []).map((i) => row(i.label, i.value, align));

  /**
   * Then each machine, and beneath it only what IT carries.
   *
   * A term the whole request agrees on has already been stated once above; repeating it under every
   * machine is how a five-item card becomes a wall a supplier scrolls past. What is left under a
   * machine is, by construction, the thing that makes it different from the others.
   */
  const itemRows = (model?.items ?? [])
    .map(
      (i) =>
        `<div style="padding-top:9px;">
      <div style="font-size:12.5px;font-weight:700;color:${COLORS.foreground};line-height:1.4;">${escapeHtml([i.label, i.units].filter(Boolean).join(" "))}</div>
      ${i.terms.length ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">${i.terms.map((x) => row(x.label, x.value, align)).join("")}</table>` : ""}
    </div>`,
    )
    .join("");

  return `<a href="${url}" style="text-decoration:none;color:inherit;display:block;max-width:440px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="440" dir="${dir}" style="width:440px;max-width:100%;border:1px solid ${COLORS.background};border-radius:${RADII.md};border-collapse:separate;overflow:hidden;background:${COLORS.surface};font-family:'Segoe UI',Roboto,Arial,sans-serif;">
    <tr><td style="padding:0;line-height:0;">
      ${
        /* The real rendering when there is one; the same facts in markup when there is not yet a
           request to render. An `<img>` pointing at the generic file drew a band with nothing on it,
           which is the half of the card a supplier sees first. */
        card.imageUrl
          ? `<img src="${escapeHtml(card.imageUrl)}" alt="" width="440" height="160" style="display:block;width:440px;max-width:100%;height:160px;border:0;outline:none;text-decoration:none;background-color:${COLORS.navy};">`
          : model
            ? navyBand(model, hostOf(card.url), align)
            : ""
      }
    </td></tr>
    <tr><td align="${align}" style="padding:14px 16px 16px;">
      ${title ? `<div style="font-size:14px;font-weight:700;color:${COLORS.foreground};line-height:1.35;">${escapeHtml(title)}</div>` : ""}
      ${where ? `<div style="font-size:12px;color:${COLORS.mutedDark};font-weight:600;line-height:1.4;padding-top:6px;">${escapeHtml(where)}</div>` : ""}
      ${block(terms)}
      ${itemRows ? `<div style="border-top:1px solid ${COLORS.border};margin-top:9px;padding-top:2px;">${itemRows}</div>` : ""}
      ${model?.closing ? `<div style="font-size:11px;color:${COLORS.muted};padding-top:8px;">${escapeHtml(model.closing)}.</div>` : ""}
      <div style="border-top:1px solid ${COLORS.border};margin-top:11px;padding-top:10px;font-size:11.5px;color:${COLORS.mutedDark};line-height:1.5;">${JOIN_LINE[lang](JOIN_URL)}</div>
      <div style="font-size:10.5px;color:${COLORS.mutedLight};letter-spacing:0.4px;padding-top:10px;">${escapeHtml(hostOf(card.url))}</div>
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
