import { Suspense } from "react";
import type { Metadata } from "next";
import BidFormClient from "./BidFormClient";
import { buildBidMetadata, extractBidToken, fetchBidPreview } from "@/lib/api/bidPreview";

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

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ token: slug }, sp] = await Promise.all([params, searchParams]);
  // Mirrors the form's own default (`?lang=ar` opts into Arabic, otherwise English), so the card and
  // the page a recipient lands on are in the same language.
  const lang = langOf(sp.lang);
  const preview = await fetchBidPreview(extractBidToken(slug), lang);
  return buildBidMetadata({ preview, slug, lang });
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
