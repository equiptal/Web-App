import type { Metadata } from "next";
import { serverEnv } from "@/lib/config/env";

/**
 * Link-preview (Open Graph) data for the public bid link `/bid/{slug}-{groupId}`.
 *
 * When a renter shares that URL — from the mobile app's share sheet, from the admin hub, or in an
 * email we send — the rich card the recipient sees is built by the *receiving* app (WhatsApp, Apple
 * Mail, new Outlook, Slack, iMessage) fetching this page and reading the `og:` tags out of its HTML.
 * Which means:
 *
 *   - the tags have to be in the SERVER-rendered `<head>`. Unfurl bots don't run JavaScript, so a
 *     client component can't produce them — hence `generateMetadata` in the route, and hence the form
 *     itself living in `BidFormClient.tsx`;
 *   - the copy has to come from the backend, not from strings duplicated here, so the card and the
 *     app-sent email version of the same card can't drift apart.
 *
 * Backend contract: `GET /public/bid-form/{token}/preview` on the **agents** backend — the same
 * service and the same host this page already fetches the form itself from (see
 * `app/api/bid-form/[token]/route.ts`), so the whole page depends on one API, not two. Public, no
 * auth, side-effect free — deliberately NOT `GET /public/bid-form/{token}`, which bumps the share
 * link's `opened_count` and would count every unfurl bot as a supplier opening the link.
 * See docs/api-docs/agents-backend-api.md in Moedatech-App.
 */

/** The link is `/bid/{slug}-{groupId}`; the token the backend resolves is the trailing UUID. */
const GROUP_ID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Pull the group id out of a `/bid/` path segment. Falls back to the segment itself (a bare id). */
export function extractBidToken(slug: string): string {
  return slug.match(GROUP_ID_RE)?.[0] ?? slug;
}

export interface BidPreview {
  token: string;
  url: string;
  status: "open" | "closed";
  imageUrl: string;
  siteName: string;
  title: string;
  description: string;
  en: { title: string; description: string };
  ar: { title: string; description: string };
}

/**
 * Unfurl bots give up fast, and `generateMetadata` blocks the page render — so a slow or unreachable
 * backend must cost the supplier a beat, not the whole page.
 */
const PREVIEW_TIMEOUT_MS = 2500;

function isPreview(v: unknown): v is BidPreview {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.title === "string" && typeof o.description === "string" && typeof o.url === "string";
}

/**
 * Fetch the card copy for a link. Returns null on anything unexpected — a missing env var, a 404, a
 * timeout — and the caller falls back to generic branded metadata. A preview is never worth failing
 * the page for.
 */
export async function fetchBidPreview(token: string, lang: "en" | "ar"): Promise<BidPreview | null> {
  if (!serverEnv.agentsApiUrl) return null;
  const base = serverEnv.agentsApiUrl.replace(/\/$/, "");
  try {
    const res = await fetch(
      `${base}/public/bid-form/${encodeURIComponent(token)}/preview?lang=${lang}`,
      // Matches the endpoint's own `Cache-Control: public, max-age=300`: a newly set deadline shows up
      // quickly, and a burst of shares doesn't hit the database once per recipient.
      { next: { revalidate: 300 }, signal: AbortSignal.timeout(PREVIEW_TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const json: unknown = await res.json().catch(() => null);
    const data = json && typeof json === "object" && "data" in json ? (json as { data: unknown }).data : json;
    return isPreview(data) ? data : null;
  } catch {
    // Timeout, DNS, upstream 5xx — all the same to the card.
    return null;
  }
}

/**
 * The card image, served from this app's own `public/` — an opaque 1200×630 navy card with the logo
 * knocked out to white. **One image for every surface**: `preview.imageUrl` from the backend resolves
 * to this same file, and the emailed card renders it too, so a supplier who meets this link in Gmail
 * and again in WhatsApp sees one design.
 *
 * Kept as a local constant only as the fallback for when the preview fetch fails — the branding
 * shouldn't disappear just because the backend was slow.
 */
const OG_CARD_IMAGE = "/og-bid.png";

/** Generic copy for when the preview is unavailable. Says nothing about the request — the safe default. */
const FALLBACK = {
  en: { title: "Bid request", description: "Submit a bid on an equipment request — no account needed." },
  ar: { title: "طلب عروض", description: "قدّم عرضك على طلب معدات — دون الحاجة إلى حساب." },
} as const;

/**
 * Turn the preview into route metadata. Kept pure (no fetch) so the wording is unit-testable.
 *
 * `slug` is the raw URL segment, not the extracted token, so the canonical/`og:url` is the link that
 * was actually shared — a bot that resolved `/bid/excavator-riyadh-<uuid>` must not be told the
 * canonical is a different URL, or some clients relabel the card.
 */
export function buildBidMetadata({
  preview,
  slug,
  lang,
}: {
  preview: BidPreview | null;
  slug: string;
  lang: "en" | "ar";
}): Metadata {
  const title = preview?.title || FALLBACK[lang].title;
  const description = preview?.description || FALLBACK[lang].description;
  // metadataBase (root layout) resolves the relative path against the deployed host, so this stays
  // correct on staging and prod without an env var here.
  const path = `/bid/${slug}${lang === "ar" ? "?lang=ar" : ""}`;
  // The backend points at this same asset; the constant is the fallback for a failed fetch, so the
  // branding survives a slow backend even when the copy doesn't.
  const image = preview?.imageUrl || OG_CARD_IMAGE;

  return {
    // The root layout's title template appends " — Moedatech", which is where the brand comes from.
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: preview?.siteName || "Moedatech",
      title,
      description,
      url: path,
      locale: lang === "ar" ? "ar_SA" : "en_US",
      images: [{ url: image, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
