"use client";

/**
 * **V11 · the send path** — spec 004 §6.7, RM3-AC-17 / AC-18.
 *
 * The four requests of §6.7 are raised from four different places — the equipment card and the
 * detail, the bottom of the list and inside each detail, every document row on the machine and on the
 * company, and the shortfall alert. They are **one ask with four entry points**, so they get one
 * sender: composed by `composeRenteeRequest`, posted to
 * `POST /api/me/deal-rooms/{dealRoomId}/requests`.
 *
 * ── The send is what CREATES the deal room ───────────────────────────────────────────────────────
 * The endpoint needs a room, and most bids have none. So the sequence is create-or-fetch, **then**
 * post — and that order is the whole point: **opening, selecting or reading must never create one**
 * (004a §4.5), because a `DealRoom` row freezes the supplier's offered count and he can no longer
 * correct a miscounted offer. A renter who merely looked would have caused that.
 *
 * ── Why the payload is composed, not assembled at the call site ──────────────────────────────────
 * `scope` and `equipmentId` are validated against each other server-side, `docTypes` is refused on a
 * non-document kind and required on a document one, and `add_to_offer` is retired and rejected with a
 * 400. Composing in one place makes every one of those unreachable rather than merely unused.
 */

import { useCallback, useRef, useState } from "react";
import { ApiError, sendRenteeRequest } from "@/lib/api/client";
import { ensureDealRoom } from "@/lib/chat/ensure-deal-room";
import type { BidCard } from "@/lib/contract/bids";
import { askIdentity, composeRenteeRequest, type RenteeAsk } from "@/lib/contract/rentee-request";

/**
 * The backend's half of "one ask, one card" — `DEAL_ROOM_REQUEST_ALREADY_PENDING`, a 409 carrying the
 * `ref` already outstanding (owner's rule, 2026-08-10). The BFF forwards the backend's own code
 * untranslated, so this is the one string that identifies it.
 */
const ALREADY_PENDING_CODE = "E13012";

/** Why a send did not land. `invalid` is a card the backend would refuse — a retired kind, a document
 *  ask naming no type, an equipment ask naming no machine — and it never reaches the network.
 *  `already_pending` is the rule, not a fault: the renter has asked this exact question and the lessor
 *  has not answered. */
export type RenteeRequestSendError = "invalid" | "failed" | "already_pending";

export interface RenteeRequestSender {
  /** Compose → create-or-fetch the room → post. Resolves true when the card is in the conversation. */
  send: (ask: RenteeAsk) => Promise<boolean>;
  busy: boolean;
  error: RenteeRequestSendError | null;
  /** The backend-minted reference of the last card sent — the `RQ-7F3A` both sides can quote. */
  lastRef: string | null;
  /**
   * The identity of the last ask the backend refused as already outstanding, or null.
   *
   * The client is the primary guard and this 409 is the backstop, so reaching it means the client
   * did not know — a stale tab, a dock that was never opened, a double-tap that beat the first
   * response home. Reporting the identity is what lets the surface learn the thing it was missing
   * and disable the control, instead of leaving a live button that will refuse again.
   */
  alreadyPendingAsk: string | null;
  /** Increments on every successful send. The chat dock takes it as its **post-send** refresh
   *  trigger, which is one of the four moments the arrival notice may appear (004a §2.1). */
  nonce: number;
  /** The room, once one exists — created by the first send if the bid had none. */
  dealRoomId: string | null;
}

export function useRenteeRequestSender(bid: Pick<BidCard, "id" | "dealRoomId"> | null): RenteeRequestSender {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RenteeRequestSendError | null>(null);
  const [lastRef, setLastRef] = useState<string | null>(null);
  const [alreadyPendingAsk, setAlreadyPendingAsk] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [created, setCreated] = useState<string | null>(null);
  // Guards a double-click from creating a room, failing, and creating a second one on the retry.
  const inFlight = useRef(false);

  const dealRoomId = created ?? bid?.dealRoomId ?? null;

  const send = useCallback(
    async (ask: RenteeAsk): Promise<boolean> => {
      if (!bid || inFlight.current) return false;
      const draft = composeRenteeRequest(ask);
      // Refused here rather than at the backend: a 400 the renter cannot act on is worse than a
      // control that never claimed it could send.
      if (!draft) {
        setError("invalid");
        return false;
      }
      inFlight.current = true;
      setBusy(true);
      setError(null);
      try {
        const roomId = await ensureDealRoom(bid.id, created ?? bid.dealRoomId ?? null);
        setCreated(roomId);
        const result = await sendRenteeRequest(roomId, draft);
        setLastRef(result.ref || null);
        setNonce((n) => n + 1);
        return true;
      } catch (err) {
        // ── one ask, one card, from the other side ──────────────────────────────────────────────
        // The backend refuses a repeat of an unanswered ask with 409 E13012. It is not a failure and
        // must not read as one: «لم يصل الطلب» would tell the renter to try again, which is exactly
        // what the rule exists to stop. It is reported as the rule, and the identity is published so
        // the control that produced it can disable itself the way it would have had the conversation
        // been read.
        if (err instanceof ApiError && err.backendCode === ALREADY_PENDING_CODE) {
          setError("already_pending");
          setAlreadyPendingAsk(askIdentity(draft));
          return false;
        }
        setError("failed");
        return false;
      } finally {
        setBusy(false);
        inFlight.current = false;
      }
    },
    [bid, created],
  );

  return { send, busy, error, lastRef, alreadyPendingAsk, nonce, dealRoomId };
}
