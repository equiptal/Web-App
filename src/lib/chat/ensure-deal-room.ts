import { startDealRoom } from "@/lib/api/client";

/**
 * 004a §4.5 — **create-or-fetch, and only ever from a SEND.**
 *
 * The room-creating acts are exactly three: negotiate/accept, sending a request card, and sending the
 * first chat message. Selecting a bid, a machine, a document, or opening a chat tab must never create
 * one, because a `DealRoom` row freezes the supplier's offered count (`BID_OFFER_LOCKED`) — after
 * which he cannot correct a miscounted offer, and the renter has caused it by browsing.
 *
 * `POST /api/me/deal-rooms` is idempotent on the backend (it returns the existing room for a bid), so
 * a known id short-circuits purely to save the round-trip, not for correctness.
 */
export async function ensureDealRoom(bidId: string, known: string | null): Promise<string> {
  if (known) return known;
  const created = await startDealRoom(bidId);
  if (!created.id) throw new Error("deal room: no id returned");
  return created.id;
}
