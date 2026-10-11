/**
 * **Offers in the chat** (Moedatech-App release #548, alignment 1.2). A port of the app's
 * `deal_room/presentation/chat/offer_thread.dart`: the rules that turn a room's messages into offer
 * cards. Pure, so they are tested without a Stream connection.
 *
 * The app removed its pinned price bar: the supplier's bid opens every room as a card, each counter
 * is a card, and only the LATEST carries buttons. Nothing here decides a price. The buttons are the
 * room's existing Counter and Accept, opened through the same sheet the bid card opens.
 */

import { chatCardOfMessage, reconstructRounds, type DealRound } from "./deal-rounds";
import { dealSystemEventKind } from "./deal-system-event";

/** What an offer card shows in place of, or as, its buttons (the app's `OfferFooter`). */
export type OfferFooter =
  /** An older offer: «This offer was updated», no buttons. */
  | "superseded"
  /** The room is cancelled: nothing. */
  | "none"
  /** Closed: «Agreed on this price» and the quotation. */
  | "agreed"
  /** The renter accepted and waits for the supplier: the offer reads «Accepted». */
  | "waiting"
  /** The other side's latest offer: Counter + Accept. */
  | "counterAndAccept"
  /** The reader's OWN latest offer: one edit button and «Awaiting reply». Never Accept, even when
   *  every term matches (app, 2026-10-08: accepting your own offer read as wrong). */
  | "editOwn";

/**
 * Only the latest offer carries actions, and which ones follows the room's status — the renter's half
 * of the app's `offerFooterFor` over its `TurnCtaKind` (the supplier's «confirm» is not the web's).
 */
export function offerFooterFor({ isLatest, status, isMine }: { isLatest: boolean; status: string | null; isMine: boolean }): OfferFooter {
  if (!isLatest) return "superseded";
  switch (status) {
    case "CLOSED": return "agreed";
    case "ABANDONED": return "none";
    case "AWAITING_SUPPLIER_CONFIRMATION": return "waiting";
    default: return isMine ? "editOwn" : "counterAndAccept";
  }
}

/**
 * The rate the offer at `index` moved from: the most recent EARLIER offer at a different rate, so a
 * resend of the same number strikes nothing out. Null when there is none (the app's
 * `previousOfferRate`).
 */
export function previousOfferRate(rates: readonly (number | null)[], index: number): number | null {
  if (index <= 0 || index >= rates.length) return null;
  const rate = rates[index];
  if (rate == null) return null;
  for (let i = index - 1; i >= 0; i--) {
    const earlier = rates[i];
    if (earlier != null && Math.abs(earlier - rate) > 0.005) return earlier;
  }
  return null;
}

/** The fields this module reads off a Stream message. */
export interface ThreadMessage {
  id: string;
  text?: string;
  type?: string;
  user?: { id?: string };
  created_at?: string | Date;
  custom?: Record<string, unknown>;
}

/** One line of the conversation as drawn. */
export type ThreadEntry<M extends ThreadMessage> =
  /** «Deal room opened», the first line of every room (the app's synthetic `__room_opened__`). */
  | { kind: "opened"; key: string; at: string | Date | null }
  /** An offer card. `offerIndex` is its place among the offers, oldest first. */
  | { kind: "offer"; key: string; round: DealRound; opening: boolean; offerIndex: number; at: string | Date | null }
  /** «You accepted the offer», last while the room waits for the supplier's confirmation. */
  | { kind: "accepted"; key: string; at: string | Date | null }
  | { kind: "message"; key: string; message: M };

export const OPENING_OFFER_KEY = "__opening_offer__";
export const ACCEPTED_CARD_KEY = "__accepted_offer__";

/** A narration line, as the dock draws narration: Stream's own `system` type or a `system_bot` line. */
const isNarration = (m: ThreadMessage) => m.type === "system" || m.user?.id === "system_bot";

/**
 * The thread as drawn: «room opened», the supplier's OPENING offer from the bid, then the channel's
 * messages with every `rate_proposal` as an offer card, and the accepted card LAST while the room
 * awaits the supplier (app `withOpeningOffer` + `withAcceptedCard`). The newest «accepted all terms»
 * line is left out while that card shows: the card replaces it.
 *
 * `opening` null (no room yet, or a bid with no price) leaves the opening card out; no room at all
 * leaves the «opened» line out too, and the thread is the messages alone.
 */
export function offerThread<M extends ThreadMessage>(
  messages: readonly M[],
  opts: { roomOpen: boolean; opening: DealRound | null; awaiting: boolean },
): { entries: ThreadEntry<M>[]; offerRates: (number | null)[] } {
  const entries: ThreadEntry<M>[] = [];
  const offerRates: (number | null)[] = [];
  const firstAt = messages[0]?.created_at ?? null;
  if (opts.roomOpen) {
    entries.push({ kind: "opened", key: "__room_opened__", at: firstAt });
    if (opts.opening) {
      entries.push({ kind: "offer", key: OPENING_OFFER_KEY, round: opts.opening, opening: true, offerIndex: 0, at: firstAt });
      offerRates.push(opts.opening.rate);
    }
  }

  let lastAccepted: M | null = null;
  if (opts.awaiting) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (isNarration(m) && !chatCardOfMessage(m) && dealSystemEventKind(m.text) === "accepted") {
        lastAccepted = m;
        break;
      }
    }
  }

  for (const m of messages) {
    if (m === lastAccepted) continue;
    if (chatCardOfMessage(m)?.type === "rate_proposal") {
      const round = reconstructRounds([m])[0];
      if (round) {
        entries.push({ kind: "offer", key: m.id, round, opening: false, offerIndex: offerRates.length, at: m.created_at ?? null });
        offerRates.push(round.rate);
        continue;
      }
    }
    entries.push({ kind: "message", key: m.id, message: m });
  }

  if (opts.awaiting && entries.length > 0) {
    const at = lastAccepted?.created_at ?? messages[messages.length - 1]?.created_at ?? null;
    entries.push({ kind: "accepted", key: ACCEPTED_CARD_KEY, at });
  }
  return { entries, offerRates };
}
