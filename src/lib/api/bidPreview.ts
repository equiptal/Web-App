import type { Metadata } from "next";
import { bidCardDescription, bidCardModel } from "@/lib/bidCardModel";
import { serverEnv } from "@/lib/config/env";
import { mapBidFormData, type BidFormData } from "@/lib/contract/link-bids";

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
  /** `EXC-170845` / `RFQ-00077`. Read straight, rather than parsed back out of the title. */
  reference?: string | null;
  /** The request the mobile app can be deep-linked to — `reqs[0]` for a multi-item group. */
  requestId?: string | null;
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
 * Fetch the request behind a link, for the card.
 *
 * `GET /public/bid-form/{token}` — public, no auth, and the same endpoint the bid form itself reads.
 * It carries what the preview strings never did: the items with their sizes and counts, the project
 * terms, the per-item required terms, the delivery and return party, the deadline.
 *
 * ⚠️ It **bumps `request_share_links.opened_count`**, so an unfurl bot counts as a supplier opening
 * the link. Accepted deliberately (owner, 2026-09-01) — nothing reads that number today. If it ever
 * becomes something a renter is shown, these fields move onto the read-only `/preview` endpoint and
 * this function is the only thing that changes.
 *
 * Same rule as the preview: null on anything unexpected, and the card degrades rather than failing.
 */
export async function fetchBidForm(token: string): Promise<BidFormData | null> {
  if (!serverEnv.agentsApiUrl) return null;
  const base = serverEnv.agentsApiUrl.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/public/bid-form/${encodeURIComponent(token)}`, {
      // Five minutes, like the preview: a newly set deadline reaches the card at the speed the text
      // does, and a blast of shares does not hit the database once per recipient.
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(PREVIEW_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json: unknown = await res.json().catch(() => null);
    const data = json && typeof json === "object" && "data" in json ? (json as { data: unknown }).data : json;
    const mapped = data ? mapBidFormData(data) : null;
    return mapped?.items?.length ? mapped : null;
  } catch {
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
  form,
  slug,
  lang,
  origin,
}: {
  preview: BidPreview | null;
  /** The request itself, when it was readable — the source for everything but the reference. */
  form?: BidFormData | null;
  slug: string;
  lang: "en" | "ar";
  /**
   * Scheme + host this page was actually requested on, e.g. `https://webstaging.moedatech.net`.
   *
   * REQUIRED for a correct card on any host that isn't production. `metadataBase` in the root layout
   * is hardcoded to `https://web.moedatech.net`, so Next resolves every RELATIVE metadata URL against
   * production — including `og:url`. A staging page therefore told WhatsApp its canonical was the prod
   * URL; WhatsApp followed it, prod answered 200 with the generic site-wide card (it has none of this
   * per-request work deployed), and the shared link unfurled as "Moedatech - WebApp" instead of the
   * request. A wrong image degrades a card; a wrong canonical replaces it.
   *
   * Null only when the host header is missing, which shouldn't happen in a real request — the URLs
   * then fall back to relative, i.e. the old behaviour.
   */
  origin: string | null;
}): Metadata {
  const copy = (lang === "ar" ? preview?.ar : preview?.en) ?? {
    title: preview?.title || FALLBACK[lang].title,
    description: preview?.description || FALLBACK[lang].description,
  };
  const title = copy.title;
  /**
   * The line under the title, and on WhatsApp, Slack and Apple Mail the ONLY prose the card gets.
   *
   * Built from the fields when they are there, so it carries the city, the dates, the terms and the
   * deadline — and, on a closed request, says so BESIDE the request rather than instead of it. The
   * backend's own string replaces the whole description with "no longer accepting bids", so a link
   * forwarded a week later names the equipment and loses where and when it was: SUP-BE-21.
   */
  const description = (form ? bidCardDescription(bidCardModel(preview, copy, lang, form)) : "") || copy.description;
  const path = `/bid/${slug}${lang === "ar" ? "?lang=ar" : ""}`;
  // Absolute, from the host actually serving this page — never resolved through metadataBase.
  const canonical = origin ? `${origin}${path}` : path;
  /**
   * The card image, in order of how much it knows about THIS request.
   *
   * 1. **This app's `og` route** — drawn per request: the reference, the equipment, the call to bid.
   * 2. `preview.imageUrl` — for a caller with no origin to build an absolute URL from.
   * 3. `OG_CARD_IMAGE` — a generic picture that says nothing about the request.
   *
   * ⚠️ **`preview.imageUrl` used to win, and that was the whole of SUP-T02** (found against the
   * owner's own production token, 2026-09-01). It is not a rendering of the request: `previewImageUrl()`
   * in the agents backend is `() => `${WEB_APP_URL}/og-bid.png``, a CONSTANT — the same 19 KB file for
   * every request ever shared. So it was always set, `generated` was never reached, and every link
   * unfurled with a picture of nothing while `/bid/{slug}/og` sat there returning a real card.
   *
   * Preferring ours is not a tie-break, it is the point: a static file cannot know the equipment. The
   * backend's stays below it because a card with the brand on it beats no card at all, and a relative
   * `og:image` is ignored by every unfurler.
   */
  const generated = origin ? `${origin}/bid/${slug}/og${lang === "ar" ? "?lang=ar" : ""}` : null;
  const image = generated || preview?.imageUrl || OG_CARD_IMAGE;

  return {
    // The root layout's title template appends " — Moedatech", which is where the brand comes from.
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      siteName: preview?.siteName || "Moedatech",
      title,
      description,
      url: canonical,
      locale: lang === "ar" ? "ar_SA" : "en_US",
      images: [{ url: image, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
