/**
 * **Which single pill a bid card's status slot shows.**
 *
 * A port of the app's `bid_live_status.dart`, minus its supplier half. The signals it reads —
 * `liveStatus` and `requestChangedAt` — have been on the bid payload all along; the web's mapper
 * simply never read them, so the card had no way to say anything had happened.
 *
 * **NO React, NO DOM, NO i18n imports.** The wording is the caller's.
 *
 * The slot holds exactly one pill at a time. It is a status readout, not a notification list.
 */

/** What just happened on a bid. */
export type BidLiveStatusKind =
  /** Tier 1. Never arrives on `liveStatus`; derived from `requestChangedAt`. Always wins. */
  | "request-changed"
  | "quotation-viewed"
  | "quotation-downloaded"
  | "rentee-message"
  /**
   * The supplier answered one of the renter's ask cards.
   *
   * **The pill does not say WHICH ask** (app, owner 2026-08-16). It reads the same "New message" as
   * `rentee-message`, because a chip reading "Unit available" in the slot where "Negotiating" has
   * always lived gets read as a status label and skipped. The kind stays distinct so the CTA can
   * still name the answer, which is where a sentence fits.
   */
  | "ask-answered";

export interface BidLiveStatus {
  kind: BidLiveStatusKind;
  /** ISO-8601, as it arrived. */
  at: string;
  /** Which ask was answered, when the server could still resolve it. Optional by design. */
  askKind?: string | null;
  resolution?: string | null;
}

const KIND_FROM_WIRE: Record<string, BidLiveStatusKind> = {
  quotationViewed: "quotation-viewed",
  quotationDownloaded: "quotation-downloaded",
  renteeMessage: "rentee-message",
  askAnswered: "ask-answered",
};

/**
 * Parse the payload's `liveStatus` object, or null.
 *
 * An entry with no readable timestamp or an unrecognised kind is dropped rather than guessed at: the
 * pill's whole job is to say something specific happened, and a pill that cannot say what or when is
 * an alarm with no content.
 *
 * `askKind` and `resolution` both stay optional. An ask whose card has scrolled out of Stream's
 * readable window resolves with a null kind server-side, and the renter still deserves to be told
 * the supplier answered.
 */
export function mapBidLiveStatus(raw: unknown): BidLiveStatus | null {
  if (raw == null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const at = typeof r.at === "string" && !Number.isNaN(Date.parse(r.at)) ? r.at : null;
  if (!at) return null;
  const kind = KIND_FROM_WIRE[String(r.kind)];
  if (!kind) return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  return { kind, at, askKind: str(r.askKind), resolution: str(r.resolution) };
}

/**
 * The live status in force, with tier 1 layered over the server's answer.
 *
 * A request that changed under this bid outranks anything the supplier did, because it changes what
 * the bid is even an answer to.
 */
export function resolveBidLiveStatus(input: {
  requestChangedAt?: string | null;
  liveStatus?: BidLiveStatus | null;
}): BidLiveStatus | null {
  const changed = input.requestChangedAt;
  if (changed && !Number.isNaN(Date.parse(changed))) return { kind: "request-changed", at: changed };
  return input.liveStatus ?? null;
}

/** Which occupant the renter's one slot takes. */
export type RenteeBidChip =
  /** Where the bid IS — the lifecycle label. */
  | "state"
  /** What just HAPPENED on it. */
  | "news";

/**
 * A lifecycle the renter must read whatever else has happened. The pill takes the slot outright.
 *
 * Deliberately short. Letting a newer "the supplier answered" hide an expiry would be the slot lying
 * about what the card is for.
 */
const DECISIVE_STATUSES = new Set(["ACCEPTED", "EXPIRED"]);

/**
 * ONE chip on the renter's card (app, owner 2026-08-16: *"i wanna use one pill only"*).
 *
 * ~~Two chips at once~~ — the lifecycle in the header row and the news on a full-width row under it.
 * They were kept apart because they answer different questions: where the bid IS, versus what just
 * HAPPENED on it. Overruled: two chips on one card is two things to read before knowing what the
 * card wants, and the supplier's side of the same screen has managed with one slot since it shipped.
 *
 * The order, which is not simply "newest wins":
 *
 *  1. **The bid needs him, or it is over** — the lifecycle takes the slot outright.
 *  2. **Someone is paying attention** — the news. Only reachable while the bid is still live, which
 *     is exactly when nothing else is competing for the slot.
 *  3. **Otherwise the standing state** — never news, but never nothing either: an empty slot reads
 *     as a card still loading.
 *
 * There is no `none`. Unlike the supplier's slot, whose blank state means "nothing has happened",
 * this one always has the lifecycle to fall back on.
 */
export function resolveRenteeBidChip(input: {
  bidStatus: string | null | undefined;
  liveStatus: BidLiveStatus | null;
}): RenteeBidChip {
  if (DECISIVE_STATUSES.has((input.bidStatus ?? "").trim().toUpperCase())) return "state";
  return input.liveStatus == null ? "state" : "news";
}
