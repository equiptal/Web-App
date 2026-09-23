/**
 * The draft a renter leaves behind when a DIRECT request sends him back to the store (app parity,
 * Epic 008 AC-02 / AC-04).
 *
 * ── Why a stash and not just a re-seed ──────────────────────────────────────────────────────────
 *
 * In a direct request the equipment is not the renter's to retype: it came off a listing, and one
 * supplier's store is the only place another one can come from. So «change this machine» and «add
 * another machine» are both a trip to `/stores/{storeId}` and back, exactly as the app does them
 * (`equipment_step.dart`: *"in direct mode the only-tab × redirects to the supplier's store and the
 * new selection becomes the single tab on return"*).
 *
 * The trip costs a page load, and `/create` deliberately refuses to rehydrate a stored draft when
 * the URL names a supplier — the 2026-09-10 fix, which exists because the stored INTAKE phase was
 * overwriting the machine the renter had just pressed. So the site, the dates and every answer he
 * had already given would be gone on the way back. This carries them, and nothing else does.
 *
 * The app stashes to `SharedPreferences` with an INTENT; this is the same idea in `sessionStorage`,
 * which is the right lifetime for it: one tab, one errand, gone when the tab closes.
 */

import type { RfqState } from "@/lib/store/rfq-store";

/**
 * What the renter went to the store FOR.
 *
 * `single` — he pressed the ✕ on his only equipment: the machine he picks replaces it.
 * `append` — he pressed the +: the machine he picks joins the ones already on the request.
 */
export type DirectStashIntent = "single" | "append";

export interface DirectStash {
  intent: DirectStashIntent;
  /** The supplier whose store he was sent to. A stash is only ever read back for the same one. */
  supplierId: string;
  /**
   * Everything he had answered — the site, the schedule, the other equipment, the terms, and the
   * `touchedFields` that say which of those are HIS. The same slice the reload persist writes, so
   * the two ways back into a draft restore the same things.
   */
  snapshot: Partial<RfqState>;
  /** Epoch ms, so a stash left over from an abandoned errand cannot surface days later. */
  savedAt: number;
}

const KEY = "mt_direct_stash";
/**
 * Long enough for a renter to browse a store and think about it, short enough that a tab he left
 * open overnight does not merge yesterday's answers into tomorrow's request.
 */
const TTL_MS = 30 * 60 * 1000;

/** Hold the draft while he goes to pick a machine. Silent on a storage that refuses us. */
export function saveDirectStash(stash: Omit<DirectStash, "savedAt">): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...stash, savedAt: Date.now() }));
  } catch {
    /* storage unavailable — the errand still works, it just arrives with a bare draft */
  }
}

/**
 * Take the stash back, if it belongs to THIS supplier and is still fresh.
 *
 * Reading it clears it, whatever the answer: a stash is one errand, and leaving a spent one behind
 * is how a second, unrelated direct request would inherit the first one's answers.
 */
export function consumeDirectStash(supplierId: string | null): DirectStash | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(KEY);
    if (raw) sessionStorage.removeItem(KEY);
  } catch {
    return null;
  }
  if (!raw || !supplierId) return null;
  try {
    const stash = JSON.parse(raw) as DirectStash;
    // A different supplier means he did not come back from the errand — he started somewhere else.
    if (stash.supplierId !== supplierId) return null;
    if (!stash.snapshot?.draft || (stash.intent !== "single" && stash.intent !== "append")) return null;
    if (!(typeof stash.savedAt === "number") || Date.now() - stash.savedAt > TTL_MS) return null;
    return stash;
  } catch {
    return null;
  }
}

/** Drop a stash without reading it — the errand was abandoned in this tab. */
export function clearDirectStash(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
