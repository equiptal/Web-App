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
 *   - `text/plain` → the bare URL. WhatsApp, Telegram, SMS take it, and unfurl it themselves.
 * The destination picks; the user never chooses.
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
import { bidCardModel, type BidCardModel } from "@/lib/bidCardModel";
import type { BidPreview } from "@/lib/api/bidPreview";
import { mapBidFormData, type BidFormData } from "@/lib/contract/link-bids";

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
export function bidCardHtml(card: BidCardPreview, model: BidCardModel | null, lang: "en" | "ar" = "en"): string {
  const dir = lang === "ar" ? "rtl" : "ltr";
  const align = lang === "ar" ? "right" : "left";
  const url = escapeHtml(card.url);

  const title = model?.cardTitle || card.title;
  const where = model?.where ?? card.description;
  const items = (model?.items ?? []).map((i) => row(i.label, i.value, align));
  const terms = (model?.terms ?? []).map((i) => row(i.label, i.value, align));

  return `<a href="${url}" style="text-decoration:none;color:inherit;display:block;max-width:440px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="440" dir="${dir}" style="width:440px;max-width:100%;border:1px solid ${COLORS.background};border-radius:${RADII.md};border-collapse:separate;overflow:hidden;background:${COLORS.surface};font-family:'Segoe UI',Roboto,Arial,sans-serif;">
    <tr><td style="padding:0;line-height:0;">
      <img src="${escapeHtml(card.imageUrl)}" alt="" width="440" height="160" style="display:block;width:440px;max-width:100%;height:160px;border:0;outline:none;text-decoration:none;background-color:${COLORS.navy};">
    </td></tr>
    <tr><td align="${align}" style="padding:14px 16px 16px;">
      <div style="font-size:14px;font-weight:700;color:${COLORS.foreground};line-height:1.35;">${escapeHtml(title)}</div>
      ${where ? `<div style="font-size:12px;color:${COLORS.mutedDark};font-weight:600;line-height:1.4;padding-top:6px;">${escapeHtml(where)}</div>` : ""}
      ${block(items)}
      ${block(terms)}
      ${model?.closing ? `<div style="font-size:11px;color:${COLORS.muted};padding-top:8px;">${escapeHtml(model.closing)}.</div>` : ""}
      <div style="border-top:1px solid ${COLORS.border};margin-top:11px;padding-top:10px;font-size:11.5px;color:${COLORS.mutedDark};line-height:1.5;">${JOIN_LINE[lang](JOIN_URL)}</div>
      <div style="font-size:10.5px;color:${COLORS.mutedLight};letter-spacing:0.4px;padding-top:10px;">${escapeHtml(hostOf(card.url))}</div>
    </td></tr>
  </table>
</a>`;
}

/**
 * Put the link on the clipboard as both the card and the plain URL.
 *
 * Falls back to writing just the URL when the rich path isn't available — an insecure context, an
 * older browser, a failed preview fetch, or a `ClipboardItem` the browser refuses. The user always
 * ends up with a working link; the card is the enhancement.
 *
 * Returns `true` when the card went on the clipboard, so the caller can say so.
 */
export async function copyBidLink(shareUrl: string, lang: "en" | "ar" = "en"): Promise<boolean> {
  const plain = () => navigator.clipboard?.writeText(shareUrl);

  const token = bidTokenFromUrl(shareUrl);
  // `ClipboardItem` is undefined in non-secure contexts and older Safari.
  if (!token || typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    await plain();
    return false;
  }

  try {
    const [previewRes, formRes] = await Promise.all([
      fetch(`/api/bid-form/${encodeURIComponent(token)}/preview`),
      // The request itself, for the machines and the terms. A failure here costs the detail, not the
      // card — the preview's two strings still make a valid one.
      fetch(`/api/bid-form/${encodeURIComponent(token)}`).catch(() => null),
    ]);
    if (!previewRes.ok) throw new Error(String(previewRes.status));
    const p = (await previewRes.json()) as Partial<BidPreview>;
    const copy = (lang === "ar" ? p.ar : p.en) ?? { title: p.title ?? "", description: p.description ?? "" };
    if (!copy.title) throw new Error("incomplete preview");

    let form: BidFormData | null = null;
    if (formRes?.ok) {
      const raw: unknown = await formRes.json().catch(() => null);
      const mapped = raw ? mapBidFormData(raw) : null;
      form = mapped?.items?.length ? mapped : null;
    }

    /**
     * The image, in order of how much it knows about THIS request: the backend's own rendering, then
     * ours. The generic file is deliberately not a fallback here — a card with a picture of nothing
     * pasted into an email is worse than the same card with our per-request one, which always renders.
     */
    const imageUrl = p.imageUrl || `${window.location.origin}/bid/${token}/og${lang === "ar" ? "?lang=ar" : ""}`;
    const model = bidCardModel((p as BidPreview) ?? null, copy, lang, form);
    const html = bidCardHtml({ ...copy, imageUrl, url: shareUrl }, model, lang);

    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([shareUrl], { type: "text/plain" }),
      }),
    ]);
    return true;
  } catch {
    // Never leave the user with nothing because the card failed.
    await plain().catch(() => {});
    return false;
  }
}
