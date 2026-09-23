/**
 * Requests the renter has taken off his own rail (owner, 2026-08-27).
 *
 * A closed or expired request stays in the account — this hides its circle, and nothing else. It is
 * a view preference, so it lives on the device rather than on the record: another renter in the same
 * company still sees the request, and so does this one on his phone. Nothing is deleted and nothing
 * is told to the backend.
 *
 * **Only a closed group can be hidden.** The rail enforces that at the point of dismissal, and it
 * matters: a live request that vanished from the rail would be a request the renter cannot get back
 * to, and this store has no undo.
 *
 * Follows `agent-quota.ts` — same shape, same failure posture. Storage that throws (a private window,
 * a browser refusing site data) degrades to "nothing is hidden", which is the safe direction.
 */

const KEY = "mt-hidden-requests";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** The group ids this device has hidden. */
export function hiddenRequests(): string[] {
  return read();
}

/** Hide one group's circle. Returns the full set afterwards, so a caller can set state from it. */
export function hideRequest(groupId: string): string[] {
  const next = [...new Set([...read(), groupId])];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — the tile still goes for this session, from the caller's own state */
  }
  return next;
}

/** Put one back. Nothing in the UI calls this yet; it exists so hiding is not a one-way door. */
export function unhideRequest(groupId: string): string[] {
  const next = read().filter((id) => id !== groupId);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* as above */
  }
  return next;
}
