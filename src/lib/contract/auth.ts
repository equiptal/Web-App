/** Renter identity contract shared across the web (web-app/001). */

/** Account tier carried over from the mobile identity (STANDARDS § Identity). Web reflects, never sets. */
export type RenterTier = "guest" | "basic" | "verified";

/** The safe, client-exposable signed-in renter (no tokens). */
export interface RenterUser {
  id: number;
  phone: string;
  tier: RenterTier;
}

/** Defensively normalise the backend's `tier` string to a known RenterTier (defaults to `guest`). */
export function normalizeTier(tier: unknown): RenterTier {
  return tier === "verified" || tier === "basic" ? tier : "guest";
}
