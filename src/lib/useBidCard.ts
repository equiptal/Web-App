"use client";

/**
 * The bid card's model, fetched once, for every surface that shares a link.
 *
 * ── Why a hook and not three fetches ────────────────────────────────────────────────────────────
 *
 * Three places send this link — the share sheet's channel row, *Send to my suppliers*, and the
 * clipboard. Each used to compose its own message, which is how the same request came to read three
 * different ways. They now render one model, so the model has to be got in one place or the drift
 * comes back through the back door.
 *
 * ── It never blocks the share ───────────────────────────────────────────────────────────────────
 *
 * `null` while it loads and `null` if it fails, and every caller falls back to the generic one-liner.
 * A renter who wants to send a link must never be held up by a preview: the link works either way,
 * and the receiving app draws the card from the page regardless of what this returns.
 */

import { useEffect, useState } from "react";
import { bidCardModel, type BidCardModel } from "@/lib/bidCardModel";
import { bidTokenFromUrl } from "@/lib/bidCardHtml";
import type { BidPreview } from "@/lib/api/bidPreview";
import { mapBidFormData, type BidFormData } from "@/lib/contract/link-bids";

export interface BidCardSource {
  model: BidCardModel;
  /** The backend's own image when it sent one; the caller falls back to our `og` route. */
  imageUrl: string | null;
}

/**
 * `draft` is the request the renter is still writing, for the surfaces that preview a card BEFORE
 * the link exists (see `draftBidForm`). It is used only while there is no token: the moment the
 * request is posted the real payload wins, so the preview and the sent message cannot diverge.
 */
export function useBidCard(
  shareUrl: string,
  lang: "en" | "ar" = "en",
  draft: BidFormData | null = null,
): BidCardSource | null {
  const [card, setCard] = useState<BidCardSource | null>(null);

  useEffect(() => {
    const token = shareUrl ? bidTokenFromUrl(shareUrl) : null;
    if (!token) {
      setCard(
        draft
          ? { model: bidCardModel(null, { title: "", description: "" }, lang, draft), imageUrl: null }
          : null,
      );
      return;
    }
    let live = true;

    (async () => {
      try {
        const [previewRes, formRes] = await Promise.all([
          /**
           * ⚠️ **`lang` is not optional, and leaving it off shipped an ARABIC picture on an ENGLISH
           * message** (found against live staging, 2026-09-03: an English e-mail whose card image
           * read «حفار 20 طن · مع مشغّل ×2»).
           *
           * The two defaults are OPPOSITE. This endpoint defaults to `ar` — `?lang=en` opts out —
           * while `/bid/<token>/og`, the image it hands back a URL for, defaults to `en`. So the
           * parameter is the only thing keeping the picture and the words in one language, and
           * omitting it does not fall back to a neutral choice: it picks the wrong one.
           */
          fetch(`/api/bid-form/${encodeURIComponent(token)}/preview?lang=${lang}`),
          // The request itself, for the machines and the terms. A failure here costs the detail, not
          // the card — the preview's two strings still make a valid one.
          fetch(`/api/bid-form/${encodeURIComponent(token)}`).catch(() => null),
        ]);
        if (!previewRes.ok) throw new Error(String(previewRes.status));

        const p = (await previewRes.json()) as Partial<BidPreview>;
        const copy = (lang === "ar" ? p.ar : p.en) ?? {
          title: p.title ?? "",
          description: p.description ?? "",
        };
        if (!copy.title) throw new Error("incomplete preview");

        let form: BidFormData | null = null;
        if (formRes?.ok) {
          const raw: unknown = await formRes.json().catch(() => null);
          const mapped = raw ? mapBidFormData(raw) : null;
          form = mapped?.items?.length ? mapped : null;
        }

        if (live) setCard({ model: bidCardModel((p as BidPreview) ?? null, copy, lang, form), imageUrl: p.imageUrl || null });
      } catch {
        if (live) setCard(null);
      }
    })();

    return () => {
      live = false;
    };
  }, [shareUrl, lang, draft]);

  return card;
}
