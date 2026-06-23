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

/** True when the shared-link demo mock should be shown: ON for everyone on staging (or ?mocklink=1),
 *  OFF on production. (No per-user gate — the demo should be visible to whoever is testing staging.) */
export function sharedLinkMockEnabled(): boolean {
  if (hostIsStaging()) return true;
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mocklink") === "1";
}

/** Resolve once whether the demo mock is on (staging host or ?mocklink=1). No network call. */
export function useSharedLinkMock(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => { setEnabled(sharedLinkMockEnabled()); }, []);
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
  // The off-platform bid is Ahmad Al-Humaidi (the shared-link supplier in this demo); fall back to
  // the bid with no location (NULL coords), then to the last column.
  let target = bids.findIndex((b) => /الحميدي|أحمد|احمد|humaidi|ahmad/i.test(b.supplierName || ""));
  if (target < 0) target = bids.findIndex((b) => b.distanceKm == null && !b.viaSharedLink);
  if (target < 0) target = bids.length - 1;
  return bids.map((b, i) => {
    if (i !== target) {
      // In-app verified supplier: company verification docs (CR/VAT/national) on file.
      return { ...b, verified: true, compliance: { ...b.compliance, activityLicense: true, taxNumber: true, nationalAddress: true } };
    }
    // Off-platform shared-link bid: unverified — no company docs (→ red), no certs, no location.
    return {
      ...b,
      viaSharedLink: true,
      verified: false,
      compliance: { ...b.compliance, activityLicense: false, taxNumber: false, nationalAddress: false, saso: false, localContent: false },
      heldCertCodes: [], // off-platform: no equipment certs
      ownershipDocs: [], // off-platform: no proof-of-ownership docs
      distanceKm: null, // off-platform: no location → km dashed
      quotedTotal: grandTotal(b),
      submissionKey: "alnajm",
      agoDays: daysAgo(b.submittedAt),
    };
  });
}
