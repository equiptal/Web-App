"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { fetchActivity } from "@/lib/api/client";
import type { RenterProfile } from "@/lib/contract/onboarding";

/**
 * mobile/016 — should we offer the renter the Trial-vs-Real choice ("Start Your Request")?
 *
 * True when the renter has **nothing live to look at**, i.e. either:
 *   - `hasUsedFirstRequestSlot === false` — they have never completed a first request (the app's own
 *     signal, and the one `POST .../trial-rendered` flips), **or**
 *   - `openRequests === 0` — they currently have no active request, so a trial run costs them nothing.
 *
 * The second arm is why this diverges from the app, which gates on the slot flag alone: on web the
 * choice is offered again whenever the renter's plate is empty, not only once per account.
 *
 * Returns `null` while unknown (still loading, signed out, guest, or a failed read). Callers must treat
 * `null` as "don't offer" — app parity: an unknown profile never surfaces the pop-up.
 *
 * Guests are excluded because a trial needs a real account to own the request; they meet the account
 * gate inside the flow instead.
 *
 * @param openRequests Pass the count if the caller already has it (home hub) to avoid a second fetch;
 *                     omit (`undefined`) to have the hook read it itself.
 */
export function useStartRequestGate(openRequests?: number | null): boolean | null {
  const { status, tier } = useSession();
  const [slotOpen, setSlotOpen] = useState<boolean | null>(null);
  const [ownCount, setOwnCount] = useState<number | null>(null);
  const needsOwnCount = openRequests === undefined;

  useEffect(() => {
    if (status !== "authed" || tier === "guest") {
      setSlotOpen(null);
      return;
    }
    let active = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { user?: RenterProfile }) => {
        if (active) setSlotOpen(d.user?.hasUsedFirstRequestSlot === false);
      })
      .catch(() => {
        if (active) setSlotOpen(null);
      });
    return () => {
      active = false;
    };
  }, [status, tier]);

  useEffect(() => {
    if (!needsOwnCount || status !== "authed" || tier === "guest") return;
    let active = true;
    fetchActivity()
      .then((a) => active && setOwnCount(a.openRequests ?? null))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [needsOwnCount, status, tier]);

  if (status !== "authed" || tier === "guest") return null;
  const live = needsOwnCount ? ownCount : openRequests;
  // Tri-state on purpose. Either signal turning true is enough to offer the choice — no need to wait
  // for the other. We only answer `false` once we KNOW the renter has completed a first request AND
  // has live requests; anything still in flight stays `null` (unknown) so a slow read can't be
  // mistaken for "they've got requests, skip the choice".
  if (slotOpen === true || live === 0) return true;
  if (slotOpen === false && typeof live === "number" && live > 0) return false;
  return null;
}
