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
 * Demo alignment (staging): tag exactly ONE bid as the off-platform "via shared link" submission and
 * shape the set to the agreed data — the shared-link bid carries NO location (km dashed) and NO certs;
 * every supplier shows its company verification docs (CR/VAT/national) as held, since a verified
 * company submitted them. Real price/equipment/terms are untouched. Returns a new list.
 */
export function tagSharedLinkBids<T extends BidCard>(bids: T[]): T[] {
  // The shared-link bid is the one with no location (NULL coords → null distance); else the last.
  let target = bids.findIndex((b) => b.distanceKm == null && !b.viaSharedLink);
  if (target < 0) target = bids.findIndex((b) => b.viaSharedLink);
  if (target < 0) target = bids.length - 1;
  return bids.map((b, i) => {
    // Company verification docs on file for all (backend isn't projecting the doc keys yet).
    const compliance = { ...b.compliance, activityLicense: true, taxNumber: true, nationalAddress: true };
    if (i !== target) return { ...b, compliance };
    return {
      ...b,
      compliance,
      viaSharedLink: true,
      quotedTotal: grandTotal(b),
      submissionKey: "alnajm",
      agoDays: daysAgo(b.submittedAt),
      distanceKm: null, // off-platform: no location → km dashed
      heldCertCodes: [], // off-platform: no equipment certs
    };
  });
}
