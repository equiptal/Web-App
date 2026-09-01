import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { extractBidToken, buildBidMetadata, type BidPreview } from "@/lib/api/bidPreview";

/**
 * Link-preview (Open Graph) metadata for `/bid/{slug}-{groupId}`.
 *
 * The card only exists in the server-rendered `<head>`, so nothing in the browser can catch a
 * regression here — a broken tag just silently stops unfurling. Hence these.
 */

const STAGING = "https://webstaging.moedatech.net";

const EN = {
  title: "Bid request: Excavator ×3, Crane ×1",
  description: "Riyadh · Daily rental · 12 Sep – 12 Oct · Bids close 12 Sep",
};
const AR = {
  title: "طلب عروض: حفار ×3، رافعة ×1",
  description: "Riyadh · إيجار يومي · 12 سبتمبر – 12 أكتوبر · يُغلق 12 سبتمبر",
};

const preview: BidPreview = {
  token: "11111111-2222-3333-4444-555555555555",
  url: `${STAGING}/bid/11111111-2222-3333-4444-555555555555`,
  status: "open",
  // One asset for every surface: the backend resolves this to the same file this app serves, and the
  // emailed card renders it too.
  imageUrl: `${STAGING}/og-bid.png`,
  siteName: "Moedatech",
  ...EN,
  en: EN,
  ar: AR,
};

describe("extractBidToken", () => {
  it("pulls the group id out of a slugged link", () => {
    expect(extractBidToken("excavator-riyadh-11111111-2222-3333-4444-555555555555")).toBe(
      "11111111-2222-3333-4444-555555555555",
    );
  });

  it("passes a bare id through", () => {
    expect(extractBidToken("11111111-2222-3333-4444-555555555555")).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("passes an unrecognised segment through rather than dropping it", () => {
    // The backend also accepts a single request id, so this must not be swallowed.
    expect(extractBidToken("some-legacy-token")).toBe("some-legacy-token");
  });
});

describe("buildBidMetadata", () => {
  it("Given a preview, When building metadata, Then og:* carry the backend's copy", () => {
    const m = buildBidMetadata({ preview, slug: "excavator-riyadh-11111111-2222-3333-4444-555555555555", lang: "en" , origin: STAGING });

    expect(m.title).toBe(EN.title);
    expect(m.openGraph?.title).toBe(EN.title);
    expect(m.openGraph?.description).toBe(EN.description);
    /**
     * OUR card, even though the preview named one.
     *
     * ⚠️ `preview.imageUrl` is not a rendering of the request. `previewImageUrl()` in the agents
     * backend is a CONSTANT — `${WEB_APP_URL}/og-bid.png`, the same 19 KB file for every request ever
     * shared (verified against the live endpoint, 2026-09-01). It is always set, so preferring it
     * meant our own per-request card was never reached and every link carried a picture of nothing.
     */
    expect((m.openGraph as { images?: { url: string }[] }).images?.[0].url).toBe(
      `${STAGING}/bid/excavator-riyadh-11111111-2222-3333-4444-555555555555/og`,
    );
    // The shared URL, not the extracted token — clients relabel the card if the canonical disagrees.
    expect(m.openGraph?.url).toBe(`${STAGING}/bid/excavator-riyadh-11111111-2222-3333-4444-555555555555`);
    expect(m.alternates?.canonical).toBe(`${STAGING}/bid/excavator-riyadh-11111111-2222-3333-4444-555555555555`);
  });

  it("Given ?lang=ar, When building metadata, Then the locale and the canonical keep the language", () => {
    const m = buildBidMetadata({ preview: { ...preview, title: preview.ar.title, description: preview.ar.description }, slug: "abc-11111111-2222-3333-4444-555555555555", lang: "ar", origin: STAGING });

    expect(m.title).toBe(AR.title);
    expect((m.openGraph as { locale?: string }).locale).toBe("ar_SA");
    expect(m.alternates?.canonical).toBe(`${STAGING}/bid/abc-11111111-2222-3333-4444-555555555555?lang=ar`);
  });

  it("Given no preview, When building metadata, Then it falls back to generic copy that leaks nothing", () => {
    const m = buildBidMetadata({ preview: null, slug: "11111111-2222-3333-4444-555555555555", lang: "en" , origin: STAGING });

    expect(m.title).toBe("Bid request");
    expect(m.description).toBe("Submit a bid on an equipment request — no account needed.");
    /**
     * ~~The generic file.~~ Even with no preview, THIS app's `og` route is the better picture: it
     * draws the same card and re-fetches the preview itself, so a backend that answered late still
     * produces a real card. It is absolute from the request host, so it can never point at prod from
     * a staging page — which is what this test was written for.
     */
    expect((m.openGraph as { images?: { url: string }[] }).images?.[0].url).toBe(
      `${STAGING}/bid/11111111-2222-3333-4444-555555555555/og`,
    );
  });

  it("Given the backend's generic file, When building metadata, Then our own card is used instead", () => {
    /**
     * SUP-T02, found against the owner's own production token. The generic file is what the backend
     * always sends, so this is the ordinary case rather than an edge one — and the same assertion
     * holds whether `imageUrl` is the constant or empty.
     */
    const m = buildBidMetadata({
      preview: { ...preview, imageUrl: `${STAGING}/og-bid.png` },
      slug: "excavator-riyadh-11111111-2222-3333-4444-555555555555",
      lang: "en",
      origin: STAGING,
    });
    expect((m.openGraph as { images?: { url: string }[] }).images?.[0].url).toBe(
      `${STAGING}/bid/excavator-riyadh-11111111-2222-3333-4444-555555555555/og`,
    );
  });

  it("Given Arabic, When falling back to our own card, Then the card is asked for in Arabic too", () => {
    const m = buildBidMetadata({ preview: null, slug: "abc-11111111-2222-3333-4444-555555555555", lang: "ar", origin: STAGING });
    expect((m.openGraph as { images?: { url: string }[] }).images?.[0].url).toBe(
      `${STAGING}/bid/abc-11111111-2222-3333-4444-555555555555/og?lang=ar`,
    );
  });

  it("Given a staging host, When building metadata, Then no URL points at production", () => {
    /**
     * The bug this exists for. `metadataBase` in the root layout is hardcoded to
     * `https://web.moedatech.net`, so any RELATIVE metadata URL resolved to production regardless of
     * which host served the page. A staging link therefore advertised a prod canonical; WhatsApp
     * followed it, prod answered 200 with its generic site-wide card, and the shared link unfurled as
     * "Moedatech - WebApp" rather than the request. Every URL here must carry the request's own host.
     */
    const m = buildBidMetadata({ preview, slug: "eq-rental-11111111-2222-3333-4444-555555555555", lang: "en", origin: STAGING });

    const urls = [
      m.alternates?.canonical,
      m.openGraph?.url,
      (m.openGraph as { images?: { url: string }[] }).images?.[0].url,
    ].map(String);

    for (const u of urls) {
      expect(u.startsWith("https://")).toBe(true);        // absolute, so metadataBase never applies
      expect(u).not.toContain("web.moedatech.net/bid");   // never the prod canonical
      expect(u.includes("webstaging.moedatech.net")).toBe(true);
    }
  });

  it("Given no host header, When building metadata, Then it degrades to relative rather than throwing", () => {
    const m = buildBidMetadata({ preview, slug: "x-11111111-2222-3333-4444-555555555555", lang: "en", origin: null });
    expect(m.alternates?.canonical).toBe("/bid/x-11111111-2222-3333-4444-555555555555");
  });

  it("Given no preview in Arabic, When building metadata, Then the fallback is Arabic too", () => {
    const m = buildBidMetadata({ preview: null, slug: "x", lang: "ar" , origin: STAGING });

    expect(m.title).toBe("طلب عروض");
    expect(m.description).toContain("دون الحاجة إلى حساب");
  });
});

describe("public/og-bid.png", () => {
  /**
   * Two backends in a different repo hardcode `<webAppUrl>/og-bid.png` — the main backend returns it
   * as `imageUrl`, and backend-admin renders it into the emailed card. Delete or rename this file and
   * both cards silently lose their image: nothing fails to build, no other test notices. This is that
   * notice.
   */
  const file = readFileSync(new URL("../../public/og-bid.png", import.meta.url));

  it("exists and is the 1200×630 the og spec expects", () => {
    // PNG IHDR: width and height are big-endian uint32 at byte 16 and 20.
    expect(file.readUInt32BE(16)).toBe(1200);
    expect(file.readUInt32BE(20)).toBe(630);
  });
});
