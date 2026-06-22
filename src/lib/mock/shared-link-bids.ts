/**
 * web-app/006 — STAGING DEMO MOCK: off-platform bids "submitted via your shared link".
 *
 * This fabricates the end-to-end flow for the share-for-bids prototype before the backend produces
 * real off-platform submissions: a supplier (no account) opens the renter's shared link, fills the
 * supplier bid form (public/supplier-bid-v2.html), and their quote shows up here as a "via shared
 * link" bid card — no deal room, just a read-only view of what they submitted.
 *
 * GATING — this must NEVER affect production:
 *   - only on a staging host (hostname contains "staging" / localhost), and
 *   - only for the test renter (user 896, Mahmoud), OR when ?mocklink=1 is in the URL (easy demo toggle).
 * On prod (moedatech.net) the host check fails, so nothing is ever injected.
 */
"use client";

import { useEffect, useState } from "react";
import type { BidCard } from "@/lib/contract/bids";

/** Renter id the demo is wired for (the test account on staging). */
const MOCK_USER_IDS = new Set(["896"]);

/** Shared-link tracker stat for the request detail strip (illustrative). */
export interface SharedLinkStats {
  opened: number;
  submitted: number;
}
export const SHARED_LINK_STATS: SharedLinkStats = { opened: 14, submitted: 3 };

/**
 * Per-project shared-link stats (deterministic mock): "submitted" scales with that project's bid
 * count, "opened" is a larger derived number. Stable for a given key, but different across projects.
 */
export function sharedLinkStatsFor(key: string, bidCount = 0): SharedLinkStats {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const submitted = bidCount > 0 ? Math.max(1, Math.min(bidCount, 1 + (h % 4))) : 1 + (h % 3);
  const opened = submitted * (3 + (h % 4)) + (h % 7) + 2; // always > submitted
  return { opened, submitted };
}

function hostIsStaging(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  return /staging|localhost|127\.0\.0\.1/.test(h);
}

/** True when the shared-link demo mock should be shown for this user (staging-only). */
export function sharedLinkMockEnabled(userId: string | null): boolean {
  if (!hostIsStaging()) return false;
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mocklink") === "1") return true;
  return !!userId && MOCK_USER_IDS.has(userId);
}

/**
 * Resolve once whether the mock is on: checks the staging host, then `/api/me` for the user id.
 * Returns false on prod without a network call (the host gate short-circuits).
 */
export function useSharedLinkMock(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!hostIsStaging()) return;
    // ?mocklink=1 forces it on without needing the test account.
    if (new URLSearchParams(window.location.search).get("mocklink") === "1") {
      setEnabled(true);
      return;
    }
    let active = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { user?: { id?: number | string } } | null) => {
        const id = d?.user?.id != null ? String(d.user.id) : null;
        if (active) setEnabled(sharedLinkMockEnabled(id));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return enabled;
}

/** All-in quoted total a bid card shows: rate × periods × units + mob/demob, +15% VAT. */
function grandTotal(b: BidCard): number {
  const periods = b.duration ?? 1;
  const units = b.numberOfUnits || 1;
  const sub = (b.price ?? 0) * periods * units + (b.mobPrice ?? 0) + (b.demobPrice ?? 0);
  return Math.round(sub * 1.15);
}

/** Whole days since submission, for the "submitted N days ago" label (≥1). */
function daysAgo(iso: string | null): number {
  if (!iso) return 2;
  const ms = Date.now() - new Date(iso).getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.max(1, Math.round(ms / 86_400_000)) : 2;
}

/**
 * Relabel up to `max` REAL bids as off-platform "via shared link" submissions. They keep all their
 * real data (supplier, equipment, terms, price) — we only flip the flag, compute a flat quoted
 * total, and pick which sample form the read-only viewer opens. Because they stay real bids, they
 * also flow through the comparison workspace unchanged. Returns a new list; others are untouched.
 */
export function tagSharedLinkBids<T extends BidCard>(bids: T[], max = 2): T[] {
  let tagged = 0;
  return bids.map((b) => {
    if (tagged >= max || b.viaSharedLink) return b;
    tagged += 1;
    return {
      ...b,
      viaSharedLink: true,
      quotedTotal: grandTotal(b),
      submissionKey: tagged === 1 ? "alnajm" : "gulf",
      agoDays: daysAgo(b.submittedAt),
    };
  });
}
