/**
 * The join invitation as rich text, for the clipboard.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────────────────────────
 *
 * The invitation goes out **from the renter's own account** (owner, 2026-09-01), which means
 * `mailto:` — and a `mailto:` body is plain text. So the two store badges the prototype puts on this
 * message (`dlgJoinInvite`) cannot survive the one channel most renters will use.
 *
 * The clipboard can carry them. Gmail, Outlook web, Word and Notion all keep HTML pasted into them,
 * so *Copy* writes TWO flavours at once — the card below as `text/html`, the plain sentence as
 * `text/plain` — and the destination picks. A renter pasting into WhatsApp still gets the sentence.
 *
 * This is the same trick `bidCardHtml.ts` uses for the bid link, and for the same reason: what we
 * cannot send, we can hand over.
 *
 * ── The badges are TEXT, not images ─────────────────────────────────────────────────────────────
 *
 * Every mail client blocks remote images by default, and a badge that renders as a broken-image box
 * is worse than no badge. Styled table cells with real links always draw, always click through, and
 * survive a forward.
 */

import { APP_STORE_URL, JOIN_URL, PLAY_STORE_URL } from "@/lib/config/store-links";
import { COLORS, RADII } from "@/lib/ds-colors";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const COPY = {
  en: {
    lead: (renter: string) =>
      `${renter} already works with you and uses Moedatech to run its equipment rentals. Join and their requests reach you in the app, with your own store, your fleet and your documents in one place.`,
    leadNoName:
      "The renter you work with uses Moedatech to run its equipment rentals. Join and their requests reach you in the app, with your own store, your fleet and your documents in one place.",
    appStoreSmall: "Download on the",
    appStore: "App Store",
    playSmall: "Get it on",
    play: "Google Play",
    free: "Signing up is free.",
    hello: (who: string) => `Hello ${who},`,
  },
  ar: {
    lead: (renter: string) =>
      `${renter} يتعامل معك بالفعل ويستخدم مُعِدّاتك لإدارة تأجير المعدات. انضم لتصلك طلباته داخل التطبيق، مع متجرك وأسطولك ومستنداتك في مكان واحد.`,
    leadNoName:
      "المستأجر الذي تتعامل معه يستخدم مُعِدّاتك لإدارة تأجير المعدات. انضم لتصلك طلباته داخل التطبيق، مع متجرك وأسطولك ومستنداتك في مكان واحد.",
    appStoreSmall: "حمّله من",
    appStore: "App Store",
    playSmall: "احصل عليه من",
    play: "Google Play",
    free: "التسجيل مجاني.",
    hello: (who: string) => `مرحبًا ${who}،`,
  },
} as const;

/** One store badge: a bordered cell with the small line above the store's name. */
function badge(href: string, small: string, name: string): string {
  return `<td style="padding:0 8px 0 0;">
        <a href="${href}" style="display:inline-block;text-decoration:none;border:1px solid ${COLORS.navy};border-radius:${RADII.md};padding:7px 14px;background:${COLORS.navy};">
          <span style="display:block;font-size:9.5px;line-height:1.2;color:rgba(255,255,255,0.72);">${escapeHtml(small)}</span>
          <span style="display:block;font-size:13px;line-height:1.25;font-weight:700;color:${COLORS.surface};">${escapeHtml(name)}</span>
        </a>
      </td>`;
}

/**
 * Table-based with inline styles — what survives a paste into Gmail and Outlook, both of which strip
 * `<style>` blocks and ignore flex and grid.
 */
export function inviteCardHtml({
  renterName,
  supplierName,
  lang = "en",
}: {
  renterName?: string | null;
  /** Who it is addressed to — the contact if the renter kept one, else the firm. */
  supplierName: string;
  lang?: "en" | "ar";
}): string {
  const t = COPY[lang];
  const dir = lang === "ar" ? "rtl" : "ltr";
  const align = lang === "ar" ? "right" : "left";
  const renter = renterName?.trim();

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="480" dir="${dir}" style="width:480px;max-width:100%;border:1px solid ${COLORS.background};border-radius:${RADII.md};border-collapse:separate;background:${COLORS.surface};font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <tr><td align="${align}" style="padding:16px 18px;">
    <div style="font-size:13.5px;color:${COLORS.foreground};line-height:1.5;">${escapeHtml(t.hello(supplierName))}</div>
    <div style="font-size:13.5px;color:${COLORS.foreground};line-height:1.55;padding-top:8px;">${escapeHtml(renter ? t.lead(renter) : t.leadNoName)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:14px;">
      <tr>
        ${badge(APP_STORE_URL, t.appStoreSmall, t.appStore)}
        ${badge(PLAY_STORE_URL, t.playSmall, t.play)}
      </tr>
    </table>
    <div style="font-size:12px;color:${COLORS.mutedDark};padding-top:12px;">${escapeHtml(t.free)}</div>
    <div style="font-size:11.5px;padding-top:6px;"><a href="${JOIN_URL}" style="color:${COLORS.brandDeep};font-weight:700;text-decoration:none;">${escapeHtml(JOIN_URL.replace(/^https?:\/\//, ""))}</a></div>
  </td></tr>
</table>`;
}

/**
 * Put the invitation on the clipboard as both the card and the plain sentence.
 *
 * Falls back to the sentence alone wherever the rich path is unavailable — an insecure context, an
 * older Safari, a browser that refuses `ClipboardItem`. The renter always ends up with something he
 * can paste; the card is the enhancement.
 *
 * Returns `true` when the card went on the clipboard, so the caller can say which one it wrote.
 */
export async function copyInvite(
  message: string,
  card: { renterName?: string | null; supplierName: string; lang?: "en" | "ar" },
): Promise<boolean> {
  const plain = () => navigator.clipboard?.writeText(message);

  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    await plain();
    return false;
  }
  try {
    const html = inviteCardHtml(card);
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([message], { type: "text/plain" }),
      }),
    ]);
    return true;
  } catch {
    await plain().catch(() => {});
    return false;
  }
}
