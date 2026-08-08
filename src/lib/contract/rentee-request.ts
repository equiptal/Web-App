/**
 * The renter's ask, as a payload — spec 004 §7.3, verbatim from the app backend's
 * `rentee-request.service.ts` (`createRenteeRequest`).
 *
 * **This file composes; it never sends.** The POST is
 * `POST /marketplace/deal-rooms/{dealRoomId}/requests`, which needs a deal room — and a room is
 * created by the SEND, never by opening a surface (004a §4.5). Keeping the payload pure means the
 * shortfall alert (V4) can be proven to emit the right card before the chat dock that carries it
 * exists (V11/V12), and that the retired kind is unreachable rather than merely unused.
 *
 * **NO React, NO DOM, NO i18n** — same rule as `bid-map.ts`, for the same reason.
 */

/** The three kinds the backend accepts (`RENTEE_REQUEST_KINDS`). */
export type RenteeRequestKind = "availability" | "document" | "alternative";

/**
 * `equipment` names one machine and REQUIRES an `equipmentId`; `company` carries none and requires the
 * id to be null. The backend validates the pair against itself, so the two halves are represented here
 * as one composed value rather than two free fields a caller could mismatch.
 */
export type RenteeRequestScope = "equipment" | "company";

/**
 * Kinds that once existed and no longer do. `add_to_offer` is **retired** and rejected with a 400
 * (`RETIRED_REQUEST_KINDS`), so no surface may emit it (RM3-AC-07). Mirrored here so a web-side test
 * can assert on it without a backend.
 */
export const RETIRED_REQUEST_KINDS: readonly string[] = ["add_to_offer"];

/** The body of `POST /marketplace/deal-rooms/{dealRoomId}/requests`. `ref` and `serial` are minted and
 *  stamped server-side and are deliberately absent — a client-supplied one could name a different
 *  machine than the id, or thread onto another conversation's question (§7.3). */
export interface RenteeRequestDraft {
  scope: RenteeRequestScope;
  equipmentId: string | null;
  kind: RenteeRequestKind;
  /** Document requests only — ONE card carries MANY types (§6.6), never one card per type. */
  docTypes?: string[];
}

/**
 * The shortfall alert's action (§6.3, RM3-AC-07): *"ask him to add them"*.
 *
 * **`alternative` with a null `equipmentId`.** There is no machine to name — a claimed unit is a count
 * the supplier quoted with nothing registered behind it, so the ask is for a machine, not about one.
 * The backend pairs a null id with `scope: "company"` and refuses the other combination, so that
 * pairing is fixed here rather than left to the caller.
 */
export function composeShortfallRequest(): RenteeRequestDraft {
  return { scope: "company", equipmentId: null, kind: "alternative" };
}

/**
 * The other three asks (§6.7, RM3-AC-17): «اطلب تأكيد التوفّر» from the card and the detail,
 * «اطلب معدّة أخرى» from inside a detail, and «اطلب مستنداً» as ONE batch card over the ticked rows.
 *
 * **The scope is derived from the id, never passed alongside it.** The backend validates the pair
 * against itself — `equipment` requires an `equipmentId`, `company` requires it to be null — so
 * representing them as two free fields is representing a state the server refuses. A named machine is
 * an `equipment` ask; no machine is a `company` one.
 *
 * Every ask carries the machine **as data**, not only in prose (AC-17). `ref` and `serial` stay absent:
 * both are minted and stamped server-side, and a client-supplied one could name a different machine
 * than the id.
 */
export function composeMachineRequest(
  kind: RenteeRequestKind,
  equipmentId: string | null,
  docTypes?: string[],
): RenteeRequestDraft {
  const id = (equipmentId ?? "").trim() || null;
  const draft: RenteeRequestDraft = { scope: id ? "equipment" : "company", equipmentId: id, kind };
  if (kind === "document") {
    // De-duped and emptied of blanks here rather than at the call site: the batch is assembled from
    // row labels, and two rows can name the same wire type.
    draft.docTypes = [...new Set((docTypes ?? []).map((s) => s.trim()).filter((s) => s !== ""))];
  }
  return draft;
}

/** True when a kind may still be sent. The retired list is checked FIRST on the backend, so a caller
 *  that filters here gets the same answer instead of a 400 it cannot explain. */
export function isSendableKind(kind: string): kind is RenteeRequestKind {
  if (RETIRED_REQUEST_KINDS.includes(kind)) return false;
  return kind === "availability" || kind === "document" || kind === "alternative";
}
