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
import { extractBidToken, fetchBidPreview } from "@/lib/api/bidPreview";
import { bidCardDetails } from "@/lib/bidCardDetails";
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

  const preview = await fetchBidPreview(extractBidToken(slug), lang);
  const arabicFont = lang === "ar" ? await loadArabicFont() : null;
  // Arabic with no font would render as boxes — worse than English copy. Fall back rather than break.
  const effective = lang === "ar" && !arabicFont ? "en" : lang;

  const copy =
    (effective === "ar" ? preview?.ar : preview?.en) ??
    (preview ? { title: preview.title, description: preview.description } : FALLBACK[effective]);

  const d = bidCardDetails(copy, effective, preview?.status !== "closed");
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
          padding: "58px 68px",
          fontFamily: rtl ? "Tajawal" : "sans-serif",
          direction: rtl ? "rtl" : "ltr",
        }}
      >
        {/* Masthead: the mark, and the reference a supplier can quote back at an operator. */}
        <div style={{ display: "flex", flexDirection: row, alignItems: "center", justifyContent: "space-between" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoDataUri(OG_COLORS.white)} width={228} height={86} alt="" />
          {d.ref ? (
            <div
              style={{
                display: "flex",
                fontSize: 30,
                fontWeight: 700,
                letterSpacing: 1.5,
                color: OG_COLORS.white,
                background: "rgba(255,255,255,0.10)",
                border: "1px solid rgba(255,255,255,0.22)",
                borderRadius: 999,
                padding: "12px 28px",
              }}
            >
              {d.ref}
            </div>
          ) : null}
        </div>

        {/* The headline, then the details as columns — the prototype's rows, at a size that survives
            being downscaled into a chat bubble. */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: alignEnd }}>
          <div
            style={{
              display: "flex",
              fontSize: d.headline.length > 46 ? 58 : 70,
              fontWeight: 700,
              color: OG_COLORS.white,
              lineHeight: 1.15,
            }}
          >
            {d.headline}
          </div>

          {d.rows.length > 0 ? (
            <div style={{ display: "flex", flexDirection: row, gap: 72, marginTop: 44 }}>
              {d.rows.map((r) => (
                <div key={r.label} style={{ display: "flex", flexDirection: "column", alignItems: alignEnd }}>
                  <div
                    style={{
                      display: "flex",
                      fontSize: 24,
                      letterSpacing: rtl ? 0 : 2,
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.52)",
                    }}
                  >
                    {r.label}
                  </div>
                  <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: OG_COLORS.white, marginTop: 10 }}>
                    {r.value}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* The closing line — a deadline, an invitation, or the closed notice — and the source domain,
            which is the card's trust signal (element 4 in the prototype). */}
        <div style={{ display: "flex", flexDirection: row, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: row, alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                width: 14,
                height: 14,
                borderRadius: 999,
                background: d.accepting ? OG_COLORS.amber : "rgba(255,255,255,0.34)",
                // Logical margins are not supported by the renderer — the dot rendered flush against
                // the text. Physical, and mirrored by hand.
                ...(rtl ? { marginLeft: 16 } : { marginRight: 16 }),
              }}
            />
            <div
              style={{
                display: "flex",
                fontSize: 32,
                fontWeight: 700,
                color: d.accepting ? OG_COLORS.white : "rgba(255,255,255,0.62)",
              }}
            >
              {d.status}
            </div>
          </div>
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
