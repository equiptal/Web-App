"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * ── An open modal is a place the renter can come BACK to (owner, 2026-09-07) ─────────────────────
 *
 * *"The back button, whether the browser or the button we add, must take the user back to the step
 * he was in, not only the page screen. He was on home, opened a modal, clicked a row inside it that
 * took him somewhere else — Back must return him to home WITH the modal."*
 *
 * It could not, and the reason is the same one behind every other back complaint on this app: the
 * step lived in `useState` and nothing outside the component knew it existed. Leaving the page
 * recorded `/` on the trail, and `/` means the page with nothing open.
 *
 * ── The state IS the URL ─────────────────────────────────────────────────────────────────────────
 * So the overlay's identity moves into a search parameter, and opening it is a real history entry.
 * That single change buys three things at once:
 *
 *   · **Back** — the browser's own, and ours — lands on the entry that carries the parameter, and the
 *     page reopens the overlay from it. No trail bookkeeping, no component memory.
 *   · **Close** is `history.back()`, so closing and Back are the same motion rather than two states
 *     that can disagree about what "the previous step" was.
 *   · **A reload keeps it**, and a copied link opens on it — the two properties a modal held in
 *     component state can never have.
 *
 * ── Why `history`, not `router.push` ────────────────────────────────────────────────────────────
 * Next's router would re-render the route tree and refetch the page's server data to open a modal
 * over content that is already on screen. `pushState` changes the entry and nothing else; the
 * component reads the parameter and draws. `popstate` brings it back. The only thing to remember is
 * that Next's own `useSearchParams` does not see a bare `pushState`, which is why this reads
 * `location.search` directly and listens for the event itself.
 *
 * ⚠️ **Open pushes exactly one entry.** Re-opening the same overlay replaces rather than stacks, so
 * a renter who opens the same request twice does not have to press Back twice to leave the page.
 */
export function useUrlOverlay(key: string): {
  /** The value in the URL now — the id of whatever should be open, or `null` for nothing. */
  value: string | null;
  /** Open it: one history entry, so Back closes it and returns here. */
  open: (value: string) => void;
  /** Close it: walks BACK if this overlay is what put the entry there, so no entry is orphaned. */
  close: () => void;
} {
  const read = useCallback(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get(key);
  }, [key]);

  const [value, setValue] = useState<string | null>(null);

  // Mount and every history move: the URL is the source, so both are the same read.
  useEffect(() => {
    setValue(read());
    const onPop = () => setValue(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [read]);

  const open = useCallback(
    (next: string) => {
      const url = new URL(window.location.href);
      const already = url.searchParams.get(key);
      url.searchParams.set(key, next);
      // Already open on something → this is a lateral move inside the overlay, not a step into it.
      if (already) window.history.replaceState(window.history.state, "", url.toString());
      else window.history.pushState({ ...(window.history.state ?? {}), overlay: key }, "", url.toString());
      setValue(next);
    },
    [key],
  );

  const close = useCallback(() => {
    const state = window.history.state as { overlay?: string } | null;
    // Our own entry → go back, so closing is the same motion as Back and leaves no entry behind.
    if (state?.overlay === key) {
      window.history.back();
      return;
    }
    // Arrived with the parameter already in the URL (a shared link, a reload) → there is nothing to
    // walk back to, so strip it in place rather than sending him off the page.
    const url = new URL(window.location.href);
    url.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", url.toString());
    setValue(null);
  }, [key]);

  return { value, open, close };
}
