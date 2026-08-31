/**
 * GET /bid/{slug}/og — the link-preview image, drawn per request.
 *
 * ── WHY A GENERATED IMAGE ─────────────────────────────────────────────────────────────────────────
 * WhatsApp, Telegram, Slack, iMessage and Apple Mail all draw the preview card themselves. We hand
 * them Open Graph tags and they render what they like from a title, one line of description, and an
 * image. There is no markup we can send, so no amount of card design reaches those surfaces — the
 * emailed card's detail table can't exist there.
 *
 * The one exception is the image. It's ours, and it doesn't have to be the same picture every time.
 * So the request's details — reference, equipment, location, rental basis, deadline — are drawn INTO
 * the image, and every unfurling client shows them without knowing it is showing anything but a photo.
 *
 * A route handler rather than the `opengraph-image` file convention because the card is bilingual and
 * the convention's export receives no query string; here `?lang=ar` is readable like any other request.
 *
 * ── WHAT IT COSTS ─────────────────────────────────────────────────────────────────────────────────
 * Unfurl bots give up fast, so the preview fetch is bounded by `fetchBidPreview`'s own timeout and a
 * failure falls through to the branded card rather than an error — a bot that gets a 500 shows no card
 * at all, which is worse than a generic one.
 */

import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { extractBidToken, fetchBidForm, fetchBidPreview } from "@/lib/api/bidPreview";
import { bidCardModel } from "@/lib/bidCardModel";
import { logoDataUri, OG_COLORS } from "@/lib/bidOgAssets";

export const runtime = "nodejs";

/** The Open Graph standard, and what every client this targets expects to be handed. */
const WIDTH = 1200;
const HEIGHT = 630;

/**
 * Arabic needs a real font file: the renderer's built-in face is Latin-only, so Arabic text would come
 * out as empty boxes. Google serves a TrueType file to clients that don't advertise woff2 support —
 * which is what we want, since the renderer can't read woff2.
 *
 * Fetched once per Lambda and kept, so only a cold start pays for it. A failure returns null and the
 * card falls back to the English strings, which is the one degradation that still reads correctly.
 */
let arabicFontPromise: Promise<ArrayBuffer | null> | null = null;

function loadArabicFont(): Promise<ArrayBuffer | null> {
  arabicFontPromise ??= (async () => {
    try {
      const cssRes = await fetch("https://fonts.googleapis.com/css2?family=Tajawal:wght@700&display=swap", {
        // Deliberately NOT a modern browser UA — that gets woff2 back, which the renderer can't parse.
        headers: { "User-Agent": "Mozilla/4.0" },
        signal: AbortSignal.timeout(2000),
      });
      if (!cssRes.ok) return null;
      const url = (await cssRes.text()).match(/src:\s*url\((https:[^)]+)\)/)?.[1];
      if (!url) return null;
      const fontRes = await fetch(url, { signal: AbortSignal.timeout(2000) });
      return fontRes.ok ? await fontRes.arrayBuffer() : null;
    } catch {
      return null;
    }
  })();
  return arabicFontPromise;
}

/** Generic copy for when the preview is unavailable — says nothing about the request. */
const FALLBACK = {
  en: { title: "Bid request", description: "Submit a bid on an equipment request." },
  ar: { title: "طلب عروض", description: "قدّم عرضك على طلب معدات." },
} as const;

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token: slug } = await ctx.params;
  const lang = req.nextUrl.searchParams.get("lang") === "ar" ? "ar" : "en";

  const token = extractBidToken(slug);
  const [preview, form] = await Promise.all([fetchBidPreview(token, lang), fetchBidForm(token)]);
  const arabicFont = lang === "ar" ? await loadArabicFont() : null;
  // Arabic with no font would render as boxes — worse than English copy. Fall back rather than break.
  const effective = lang === "ar" && !arabicFont ? "en" : lang;

  const copy =
    (effective === "ar" ? preview?.ar : preview?.en) ??
    (preview ? { title: preview.title, description: preview.description } : FALLBACK[effective]);

  const d = bidCardModel(preview, copy, effective, form);
  const rtl = effective === "ar";
  const host = (preview?.url || "").replace(/^https?:\/\//, "").split("/")[0] || "web.moedatech.net";

  /**
   * The renderer honours `direction: rtl` for text (Arabic shapes and orders correctly inside a line)
   * but NOT for flex layout — an Arabic card came out with the logo, the detail columns and the status
   * all still hugging the left edge. So the mirroring is explicit: rows reverse, text aligns to the end.
   */
  const row = rtl ? ("row-reverse" as const) : ("row" as const);
  const alignEnd = rtl ? ("flex-end" as const) : ("flex-start" as const);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: OG_COLORS.navy,
          padding: "62px 74px",
          fontFamily: rtl ? "Tajawal" : "sans-serif",
          direction: rtl ? "rtl" : "ltr",
        }}
      >
        {/* Masthead: the mark, and the reference a supplier can quote back at an operator. */}
        <div style={{ display: "flex", flexDirection: row, alignItems: "center", justifyContent: "space-between" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoDataUri(OG_COLORS.white)} width={228} height={86} alt="" />
          {d.ref ? (
            <div style={{ display: "flex", fontSize: 34, letterSpacing: 2.5, color: "rgba(255,255,255,0.6)" }}>
              {d.ref}
            </div>
          ) : null}
        </div>

        {/**
         * The equipment, and one line asking for the bid. Nothing else (owner, 2026-09-01).
         *
         * Which MOVES the detail rather than deleting it: on WhatsApp, Apple Mail and Slack the
         * recipient sees the image, the title and the description and no markup at all — so an image
         * that says only what is being rented leaves `og:description` free to carry the city, the
         * dates and the terms. Text reflows, text is selectable, and text survives a recipient who
         * has images turned off. The picture stops trying to be a document.
         */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: alignEnd, gap: 34 }}>
          <div
            style={{
              display: "flex",
              // A multi-item name is simply longer. Same style, smaller type — never a second layout.
              fontSize: d.imageHeadline.length > 46 ? 56 : 78,
              fontWeight: 700,
              color: OG_COLORS.white,
              lineHeight: 1.1,
              letterSpacing: -1.5,
            }}
          >
            {d.imageHeadline}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 37,
              fontWeight: 700,
              letterSpacing: 0.2,
              // A closed request is told at a glance and in a colour that is not the one that invites.
              color: d.accepting ? OG_COLORS.amber : OG_COLORS.closed,
            }}
          >
            {d.cta}
          </div>
        </div>

        {/* The source domain — the card's trust signal (element 4 in the prototype). */}
        <div
          style={{
            display: "flex",
            flexDirection: row,
            justifyContent: rtl ? "flex-start" : "flex-end",
          }}
        >
          <div style={{ display: "flex", fontSize: 24, letterSpacing: 2.5, color: "rgba(255,255,255,0.48)" }}>
            {host.toUpperCase()}
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: arabicFont ? [{ name: "Tajawal", data: arabicFont, weight: 700, style: "normal" }] : undefined,
      headers: {
        // Unfurl bots re-fetch per recipient. Matches the preview endpoint's own five minutes, so a
        // newly set deadline reaches the card at the same speed the text does.
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    },
  );
}
