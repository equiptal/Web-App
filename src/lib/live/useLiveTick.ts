"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A counter that rises on a clock, for surfaces that must show what arrived while the renter was
 * reading (owner, 2026-09-17: *"i want all bids recieved in real time directly in cards and in
 * compare and in the bids list on home page"*).
 *
 * Put it in a fetching effect's dependency list and the effect re-runs on every tick. The value
 * itself means nothing; only that it changed.
 *
 * ── Why a tick and not a `setInterval` per caller ────────────────────────────────────────────────
 * Every surface that polls in this app has written the same three rules by hand, and each of them
 * got a different subset right: the bell polls while hidden, the chat dock re-fetches on focus, the
 * deal room does neither. The three rules are:
 *
 *  1. **Nothing ticks while the tab is hidden.** A dashboard left open in a background tab overnight
 *     is otherwise a request every 15 seconds for a screen nobody is looking at.
 *  2. **Coming back is itself a tick**, when the interval has already elapsed. That is the case the
 *     renter actually notices: he answers a supplier in another tab, comes back, and the bid is
 *     there because the return is what fetched it.
 *  3. **A return inside the interval ticks nothing.** `focus` fires on every click back into the
 *     window, and without the elapsed test a renter moving between two windows would fetch on each
 *     of them.
 */
export function useLiveTick(everyMs: number): number {
  const [tick, setTick] = useState(0);
  /** When the last tick was handed out, so a return can tell "the interval passed" from "he clicked
   *  back in". Seeded at mount, because the caller's first fetch is the mount's own. */
  const last = useRef(Date.now());
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const bump = () => {
      last.current = Date.now();
      setTick((n) => n + 1);
    };
    const stop = () => {
      if (timer.current !== null) window.clearInterval(timer.current);
      timer.current = null;
    };
    const start = () => {
      if (timer.current !== null) return; // already running — never re-arm, or a busy renter starves it
      timer.current = window.setInterval(bump, everyMs);
    };
    const onBack = () => {
      if (document.visibilityState === "hidden") {
        stop();
        return;
      }
      if (Date.now() - last.current >= everyMs) bump();
      start();
    };

    if (document.visibilityState !== "hidden") start();
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
    };
  }, [everyMs]);

  return tick;
}

/** The open request's own bids, on the workspace. Two calls a tick (the app's and the shared link's). */
export const BIDS_POLL_MS = 15_000;
/**
 * The dashboard's off-platform half, which is ONE CALL PER GROUP (capped at `LINK_FANOUT_MAX`).
 * Slower than the rest on purpose: at 15s a renter with twenty live requests would be making twenty
 * requests every fifteen seconds to keep a five-row card current.
 */
export const LINK_FANOUT_POLL_MS = 60_000;
