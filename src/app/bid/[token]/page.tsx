import { Suspense } from "react";
import { headers } from "next/headers";
import type { Metadata } from "next";
import BidFormClient from "./BidFormClient";
import { buildBidMetadata, extractBidToken, fetchBidForm, fetchBidPreview } from "@/lib/api/bidPreview";

/**
 * Server route for the public bid link. Exists so this URL can carry Open Graph tags — the form
 * itself is a client component (`BidFormClient`).
 *
 * Everything a recipient sees as a preview card in WhatsApp / Apple Mail / new Outlook / Slack /
 * iMessage comes from `generateMetadata` below, because those clients fetch this page with a bot that
 * never runs JavaScript. Gmail's compose window renders no card no matter what is here.
 */

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const langOf = (v: string | string[] | undefined): "en" | "ar" =>
  (Array.isArray(v) ? v[0] : v) === "ar" ? "ar" : "en";

/**
 * The host this page was actually requested on.
 *
 * `metadataBase` in the root layout is hardcoded to production, so any RELATIVE metadata URL resolves
 * to `web.moedatech.net` regardless of where the page is served. On staging that made `og:url` point
 * at prod — WhatsApp followed the canonical, prod answered with its generic site-wide card, and a
 * shared staging link unfurled as "Moedatech - WebApp" instead of the request. Reading the real host
 * here keeps the card tied to the page that produced it.
 *
 * `x-forwarded-*` first: Amplify terminates TLS upstream, so `host` alone can be the internal name
 * and the scheme can read as http.
 */
async function requestOrigin(): Promise<string | null> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ token: slug }, sp, origin] = await Promise.all([params, searchParams, requestOrigin()]);
  // Mirrors the form's own default (`?lang=ar` opts into Arabic, otherwise English), so the card and
  // the page a recipient lands on are in the same language.
  const lang = langOf(sp.lang);
  const token = extractBidToken(slug);
  // Both at once: an unfurl bot gives up fast, and these are two independent reads of the same link.
  const [preview, form] = await Promise.all([fetchBidPreview(token, lang), fetchBidForm(token)]);
  return buildBidMetadata({ preview, form, slug, lang, origin });
}

export default async function BidFormRoute({ params }: Props) {
  const { token: slug } = await params;
  // Suspense boundary: the form reads `useSearchParams`, which needs one when rendered from a server
  // component.
  return (
    <Suspense fallback={null}>
      <BidFormClient token={extractBidToken(slug)} />
    </Suspense>
  );
}
