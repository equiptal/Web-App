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

export function useBidCard(shareUrl: string, lang: "en" | "ar" = "en"): BidCardSource | null {
  const [card, setCard] = useState<BidCardSource | null>(null);

  useEffect(() => {
    const token = shareUrl ? bidTokenFromUrl(shareUrl) : null;
    if (!token) {
      setCard(null);
      return;
    }
    let live = true;

    (async () => {
      try {
        const [previewRes, formRes] = await Promise.all([
          fetch(`/api/bid-form/${encodeURIComponent(token)}/preview`),
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
  }, [shareUrl, lang]);

  return card;
}
