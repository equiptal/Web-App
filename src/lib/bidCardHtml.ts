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
 * ── MIRROR ────────────────────────────────────────────────────────────────────────────────────────
 * The markup below mirrors `renderBidLinkCard()` in
 * `Moedatech-App/apps/backend-admin/src/services/email/bid-link-card.ts`, which renders the same card
 * into app-sent email. Separate repos, no shared package. The WORDING is not duplicated — it comes
 * from the backend via `/api/bid-form/{token}/preview`, so only the markup is repeated here. Both
 * come from the approved prototype (`email-link-preview.html`): 1px var(--background) border, 10px radius,
 * 440px wide, a 160px image band, then title / description / source domain.
 */

export interface BidCardPreview {
  title: string;
  description: string;
  /** 880×320, displayed at 440×160 — the prototype's band. */
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

/**
 * Table-based with inline styles, because that is what survives a paste into Gmail and Outlook —
 * both strip `<style>` blocks and ignore flex/grid. The image is a fixed 160px band rather than
 * `object-fit: cover`, which Outlook does not support; the asset is already that shape.
 */
export function bidCardHtml(card: BidCardPreview, lang: "en" | "ar" = "en"): string {
  const dir = lang === "ar" ? "rtl" : "ltr";
  const align = lang === "ar" ? "right" : "left";
  const url = escapeHtml(card.url);

  return `<a href="${url}" style="text-decoration:none;color:inherit;display:block;max-width:440px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="440" dir="${dir}" style="width:440px;max-width:100%;border:1px solid var(--background);border-radius:10px;border-collapse:separate;overflow:hidden;background:var(--surface);font-family:'Segoe UI',Roboto,Arial,sans-serif;">
    <tr><td style="padding:0;line-height:0;">
      <img src="${escapeHtml(card.imageUrl)}" alt="" width="440" height="160" style="display:block;width:440px;max-width:100%;height:160px;border:0;outline:none;text-decoration:none;background-color:var(--navy);">
    </td></tr>
    <tr><td align="${align}" style="padding:14px 16px 16px;">
      <div style="font-size:13.5px;font-weight:700;color:var(--navy);line-height:1.35;">${escapeHtml(card.title)}</div>
      <div style="font-size:11.5px;color:var(--muted-dark);line-height:1.4;padding-top:7px;">${escapeHtml(card.description)}</div>
      <div style="font-size:10.5px;color:var(--border);letter-spacing:0.4px;padding-top:7px;">${escapeHtml(hostOf(card.url))}</div>
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
    const res = await fetch(`/api/bid-form/${encodeURIComponent(token)}/preview`);
    if (!res.ok) throw new Error(String(res.status));
    const p = (await res.json()) as Partial<BidCardPreview> & { en?: BidCardPreview; ar?: BidCardPreview };
    const copy = lang === "ar" ? p.ar : p.en;
    const title = copy?.title ?? p.title;
    const description = copy?.description ?? p.description;
    if (!title || !description || !p.imageUrl) throw new Error("incomplete preview");

    const html = bidCardHtml({ title, description, imageUrl: p.imageUrl, url: shareUrl }, lang);
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
