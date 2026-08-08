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
 * It also owns the **other** half of the loop: reading a posted card back and deciding, on every
 * render, whether it has been answered (V11, RM3-AC-18). Nothing about a request's state is stored —
 * there is no table and no status column (§7.3) — so the verdict is re-derived from the machine each
 * time, and this is the one place that derivation lives.
 *
 * **NO React, NO DOM, NO i18n** — same rule as `bid-map.ts`, for the same reason.
 */

/** The three kinds the backend accepts (`RENTEE_REQUEST_KINDS`). */
export type RenteeRequestKind = "availability" | "document" | "alternative";

/**
 * `equipment` names one machine and REQUIRES an `equipmentId`; `company` carries none and requires the
 * id to be null. The backend validates the pair against itself, so the two halves are represented here
 * as one composed value rather than two free fields a caller could mismatch.
 *
 * **`company` now survives for exactly one ask — the shortfall's `alternative`** (product owner,
 * 2026-08-08). See {@link RenteeRequestDraft}.
 */
export type RenteeRequestScope = "equipment" | "company";

/**
 * Kinds that once existed and no longer do. `add_to_offer` is **retired** and rejected with a 400
 * (`RETIRED_REQUEST_KINDS`), so no surface may emit it (RM3-AC-07). Mirrored here so a web-side test
 * can assert on it without a backend.
 */
export const RETIRED_REQUEST_KINDS: readonly string[] = ["add_to_offer"];

/**
 * The body of `POST /marketplace/deal-rooms/{dealRoomId}/requests`. `ref` and `serial` are minted and
 * stamped server-side and are deliberately absent — a client-supplied one could name a different
 * machine than the id, or thread onto another conversation's question (§7.3).
 *
 * ── **A document request NAMES A MACHINE** (product owner, 2026-08-08) ─────────────────────────────
 *
 * A union rather than four independent fields, because the one combination this reversal withdraws —
 * `kind: "document"` with a null `equipmentId` — must be a **type error**, not a runtime guard. A
 * guard is a thing a future caller routes around; an unrepresentable state is not.
 *
 * The company panel briefly composed exactly that combination: the renter could ask the firm for its
 * CR. That is withdrawn. A company paper is now **read, never requested** — the panel still lists,
 * opens and downloads all five (AC-69), and only the *ask* is gone.
 *
 * **`scope: "company"` therefore survives for `alternative` and nothing else.** The shortfall ask
 * («اطلب إضافتها») names no machine because there is no machine to name — a claimed unit is a count
 * with nothing registered behind it, so the ask is *for* a machine rather than *about* one. It is core
 * to §6.3 and is deliberately left representable.
 */
export type RenteeRequestDraft =
  | {
      scope: "equipment";
      equipmentId: string;
      kind: "document";
      /** ONE card carries MANY types (§6.6), never one card per type. Never empty. */
      docTypes: string[];
    }
  | {
      scope: "equipment";
      equipmentId: string;
      kind: "availability" | "alternative";
      /** `docTypes` on a non-document kind is refused outright by the backend. */
      docTypes?: never;
    }
  /** The shortfall ask, and ONLY the shortfall ask. */
  | { scope: "company"; equipmentId: null; kind: "alternative"; docTypes?: never };

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
 * The two asks that are *about* a machine (§6.7, RM3-AC-17): «اطلب تأكيد التوفّر» from the card and
 * the detail, and «اطلب معدّة أخرى» from inside a detail.
 *
 * **The scope is derived from the id, never passed alongside it.** The backend validates the pair
 * against itself — `equipment` requires an `equipmentId`, `company` requires it to be null — so
 * representing them as two free fields is representing a state the server refuses.
 *
 * `document` is **not** a kind this function accepts, and that is the point: a document ask names a
 * machine, so it has its own composer whose id parameter is non-nullable. Null here for an
 * `availability` ask that names nothing — the backend refuses it, and a caller disables its control
 * from the same value it would have sent.
 *
 * Every ask carries the machine **as data**, not only in prose (AC-17). `ref` and `serial` stay absent:
 * both are minted and stamped server-side, and a client-supplied one could name a different machine
 * than the id.
 */
export function composeMachineRequest(
  kind: "availability" | "alternative",
  equipmentId: string | null,
): RenteeRequestDraft | null {
  return composeRenteeRequest({ kind, equipmentId });
}

/**
 * «اطلب مستنداً» as ONE batch card over the ticked rows (§6.6).
 *
 * **`equipmentId` is `string`, not `string | null`** — that signature IS the rule the product owner set
 * on 2026-08-08: a document request names a machine. There is no company arm to fall back to, so a
 * caller with no machine in hand cannot compile rather than composing an ask nobody can answer.
 */
export function composeDocumentRequest(equipmentId: string, docTypes: string[]): RenteeRequestDraft | null {
  return composeRenteeRequest({ kind: "document", equipmentId, docTypes });
}

/** True when a kind may still be sent. The retired list is checked FIRST on the backend, so a caller
 *  that filters here gets the same answer instead of a 400 it cannot explain. */
export function isSendableKind(kind: string): kind is RenteeRequestKind {
  if (RETIRED_REQUEST_KINDS.includes(kind)) return false;
  return kind === "availability" || kind === "document" || kind === "alternative";
}

/* ─────────────────────────── V11 · composing the four asks ─────────────────────────── */

/**
 * An ask as a SURFACE describes it, before it is a payload.
 *
 * Structurally satisfied by `PanelRequestDraft` (the machine detail and the equipment document tab
 * hand one up), and by the shortfall alert's own composition — so the asks of §6.7 share one composer
 * and the backend's scope/id/docTypes coherence rules are enforced in exactly one place. Kept
 * structural rather than importing the panel's type: a contract module must not depend on a component
 * directory.
 *
 * **There is no `scope` field, and there must not be one.** Scope follows from whether a machine is
 * named: an id means `equipment`, no id means the shortfall's `company`. A surface that could pass
 * `scope: "company"` beside a `document` kind is exactly the composer path the 2026-08-08 reversal
 * withdrew.
 */
export interface RenteeAsk {
  kind: string;
  equipmentId?: string | null;
  docTypes?: string[];
}

/**
 * Surface vocabulary → the platform's document keys.
 *
 * **Verified against the catalogue on 2026-08-08**, and it does not match. `assertKnownDocTypes`
 * validates every named type against `EquipmentDocumentType.documentKey`, whose seeded values are
 * `photo_front` · `photo_serial` · `photo_meter` · `photo_extra` · `safety_cert` · `operator_license` ·
 * `vat_cert` · `custom_card` · `ownership_letter` · `istimara` · `cr` · `national_address` · … The
 * document surfaces name a row by the slot the renter sees (`front`, `serial`) or by a readable
 * fallback invented for a row with nothing on it yet (`equipment_safety_certificate`), and **a row
 * with nothing on it is exactly the row a renter asks about** — so without this table the most common
 * document request would be a 400 he could do nothing with.
 *
 * Deliberately narrow. Only names whose target is unambiguous are mapped; anything else is passed
 * through untouched and refused by the backend if it is unknown, because an alias that names the
 * wrong paper would have the supplier upload the wrong paper.
 *
 * **`local_content` and `saso` need no alias and never did** — both are already lower-snake, so they
 * survive normalisation verbatim. They are also no longer *askable*: since 2026-08-08 a document
 * request names a machine, and both are company papers the panel merely displays. They stay in this
 * note because a listing can still carry a `saso`-stemmed type of its own — see the warning below.
 *
 * ⚠️ **No alias is added for any SASO spelling, and that is the point.** `saso` (the firm's
 * registration), `saso_registration` and `saso_inspection` (a machine's papers) and the bare `saso` a
 * listing can carry for its safety cert are FOUR different things sharing a stem. Folding any of them
 * together would have the supplier upload the wrong paper — so each is left exactly as written, and
 * only the machine's own `documentKeys` ever answer an ask.
 */
const DOC_TYPE_ALIASES: Record<string, string> = {
  // The four photo slots §6.6 shows, as the wire stores them.
  front: "photo_front",
  photo_front: "photo_front",
  serial: "photo_serial",
  plate: "photo_serial",
  meter: "photo_meter",
  operating_hours: "photo_meter",
  side: "photo_extra",
  equipment: "photo_extra",
  // The readable fallbacks a not-yet-uploaded document row carries.
  equipment_safety_certificate: "safety_cert",
  operator_safety_certificate: "operator_license",
  proof_of_ownership: "ownership_letter",
  // Names that differ from the catalogue by one word.
  vat: "vat_cert",
  customs_card: "custom_card",
  customs: "custom_card",
  tuv: "tuv_cert",
  spsp: "spsp_cert",
};

/** One surface name → the key the backend will accept.
 *
 *  An unaliased name still comes back **normalised** (lower-snake), not verbatim: every catalogue key
 *  is lower-snake, and `documentAskSatisfied` compares the machine's own types through this same
 *  function — so `Istimara` on a listing and `istimara` in an ask must resolve to one string or a
 *  satisfied request would read unanswered forever. */
export function canonicalDocType(docType: string): string {
  const key = docType.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return DOC_TYPE_ALIASES[key] ?? key;
}

/**
 * An ask → the body of the POST, or **null** when the ask cannot be sent.
 *
 * Null rather than a throw, and null rather than a best-effort payload, because every null case here
 * is a 400 the renter could not act on: a retired kind, a document ask naming no type, an equipment
 * ask naming no machine. A caller disables its control from the same value it would have sent.
 */
export function composeRenteeRequest(ask: RenteeAsk): RenteeRequestDraft | null {
  if (!isSendableKind(ask.kind)) return null;
  const kind = ask.kind;
  // Blanks collapse to "no machine named": a surface handing up `"   "` means the same thing as one
  // handing up null, and the backend would refuse both.
  const equipmentId = (ask.equipmentId ?? "").trim() || null;

  if (kind === "document") {
    // **A document ask names a machine** (product owner, 2026-08-08). The company arm is withdrawn:
    // a company paper is read from the panel, never requested. Refused here as well as being
    // unrepresentable in `RenteeRequestDraft`, because this function's input is untyped prose from a
    // surface — the BFF route parses a JSON body through it.
    if (!equipmentId) return null;
    const docTypes = [
      ...new Set((ask.docTypes ?? []).map(canonicalDocType).filter((t) => t !== "")),
    ];
    // "A document ask naming NOTHING is a question about nothing" — the service's own words. The
    // renter's status line could never resolve it, so the ask would hang open forever.
    if (docTypes.length === 0) return null;
    return { scope: "equipment", equipmentId, kind, docTypes };
  }

  // The one surviving company-scope ask: the shortfall's «اطلب إضافتها», which asks FOR a machine and
  // so has none to name (§6.3, RM3-AC-07).
  if (!equipmentId) return kind === "alternative" ? { scope: "company", equipmentId: null, kind } : null;

  // `docTypes` on a non-document kind is refused outright, so it is dropped rather than carried.
  return { scope: "equipment", equipmentId, kind };
}

/** The availability ask — «اطلب تأكيد التوفّر», raised from the card (V5) and the detail (V7). */
export function composeAvailabilityRequest(equipmentId: string): RenteeRequestDraft | null {
  return composeRenteeRequest({ kind: "availability", equipmentId });
}

/** «اطلب معدّة أخرى» about ONE machine — raised inside a detail. The shortfall's own version names no
 *  machine and has its own composer above. */
export function composeAlternativeRequest(equipmentId: string | null): RenteeRequestDraft | null {
  return composeRenteeRequest({ kind: "alternative", equipmentId });
}

/* ─────────────────────────── V11 · the card, and reading it back ─────────────────────────── */

export const RENTEE_REQUEST_CARD_TYPE = "rentee_request";
export const RENTEE_REQUEST_REPLY_CARD_TYPE = "rentee_request_reply";

/** The supplier's answer. A refusal changes no state anywhere, so without this a "no" is invisible
 *  (004a §3.2). */
export type RenteeRequestResolution = "provided" | "declined" | "unavailable";

/** The `custom` a posted ask carries, verbatim from `RenteeRequestCard` on the backend. */
export interface RenteeRequestCardPayload {
  type: typeof RENTEE_REQUEST_CARD_TYPE;
  ref: string;
  scope: RenteeRequestScope;
  equipmentId: string | null;
  /** DISPLAY ONLY — stamped server-side from the resolved listing, never resolved off. */
  serial: string | null;
  kind: RenteeRequestKind;
  docTypes: string[] | null;
}

/** The `custom` a supplier's answer carries. */
export interface RenteeRequestReplyPayload {
  type: typeof RENTEE_REQUEST_REPLY_CARD_TYPE;
  /** The `ref` of the ask being answered. */
  inReplyTo: string;
  equipmentId: string | null;
  resolution: RenteeRequestResolution;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** A `custom` object → an ask, or null. Never throws and never returns a partial card — the same rule
 *  `parseChatCard` holds itself to, for the same reason (a throw inside a list render blanks the
 *  whole conversation). */
export function parseRenteeRequestCard(custom: unknown): RenteeRequestCardPayload | null {
  if (!custom || typeof custom !== "object" || Array.isArray(custom)) return null;
  const c = custom as Record<string, unknown>;
  if (c.type !== RENTEE_REQUEST_CARD_TYPE) return null;
  const ref = str(c.ref);
  const kind = str(c.kind);
  // A card with no `ref` cannot be answered — `inReplyTo` has nothing to thread onto — and a card with
  // an unknown kind has no derivation. Either way it is not a card we can render as one.
  if (!ref || !kind || !isSendableKind(kind)) return null;
  const scope: RenteeRequestScope = c.scope === "company" ? "company" : "equipment";
  const docTypes = Array.isArray(c.docTypes)
    ? c.docTypes.map((t) => String(t)).filter((t) => t.trim() !== "")
    : null;
  return {
    type: RENTEE_REQUEST_CARD_TYPE,
    ref,
    scope,
    equipmentId: str(c.equipmentId),
    serial: str(c.serial),
    kind,
    docTypes: docTypes && docTypes.length > 0 ? docTypes : null,
  };
}

/** A `custom` object → a supplier's answer, or null. */
export function parseRenteeRequestReply(custom: unknown): RenteeRequestReplyPayload | null {
  if (!custom || typeof custom !== "object" || Array.isArray(custom)) return null;
  const c = custom as Record<string, unknown>;
  if (c.type !== RENTEE_REQUEST_REPLY_CARD_TYPE) return null;
  const inReplyTo = str(c.inReplyTo);
  const resolution = str(c.resolution);
  if (!inReplyTo) return null;
  if (resolution !== "provided" && resolution !== "declined" && resolution !== "unavailable") return null;
  return { type: RENTEE_REQUEST_REPLY_CARD_TYPE, inReplyTo, equipmentId: str(c.equipmentId), resolution };
}

/**
 * The machine, as a request's state is derived from it.
 *
 * Structurally satisfied by `FleetMachine` — deliberately, so the derivation reads the SAME row the
 * map and the panel read. Two fields and nothing else: `locationSource` answers availability, and
 * `documentKeys` answers documents. `yardConfirmed` is not here and never will be (it is
 * `yardId != null` supplier-side, so reading it would answer "yes" for every readiness-written unit).
 */
export interface RequestTargetMachine {
  locationSource?: string | null;
  documentKeys: { type: string }[];
  /** The four photo slots live on their own list, not among the papers — so a document request that
   *  named a photo could never resolve against `documentKeys` alone. Optional, because a caller that
   *  never asks for a photo never needs to pass it. */
  photoKeys?: { slot: string }[];
}

/*
 * ── `RequestTargetCompany` is GONE, and the reason belongs here ──────────────────────────────────
 *
 * It described the FIRM as a company-scope document request's state was derived from it: the
 * catalogue papers on `supplier_profiles.*_doc_key`, plus the `held_cert_docs.LC` / `.SASO` dual-read
 * with its legacy columns. It existed because a company paper belongs to the firm and there is no
 * machine to read it off.
 *
 * The product owner withdrew the company-scope document request on 2026-08-08. With no such request
 * there is nothing to derive, so the type, `companyDocAskSatisfied` and the `company` arm of
 * `renteeRequestState` are deleted rather than left as an unreachable branch. Company papers are still
 * listed, opened and downloaded by the panel (V15 / AC-69) — that read is `company-documents.ts`'s and
 * is untouched. Only the ask is gone.
 */

/**
 * What a card reads as, right now.
 *
 * - `answered` — the machine satisfies the ask, or the supplier said he provided it
 * - `refused` — he declined
 * - `unavailable` — he answered that it is not available
 * - `waiting` — nothing yet. **Never "refused"**: an unanswered ask is unanswered (AC-20's rule,
 *   applied to the card rather than the chip)
 * - `unknown` — the machine this ask names is not in the fleet response, so nothing can be said
 */
export type RenteeRequestState = "answered" | "refused" | "unavailable" | "waiting" | "unknown";

/**
 * Every requested type present on the machine's file.
 *
 * A document ask is answered as a **whole**: one card carries many types (§6.6), and a card that read
 * answered on the first upload would tell the renter three papers arrived when one did.
 *
 * **Both sides are canonicalised through the same table**, because the machine's `documentKeys[].type`
 * and the platform's `EquipmentDocumentType.documentKey` are two different vocabularies for the same
 * paper — a listing holds `tuv`, the catalogue calls it `tuv_cert`. Comparing them raw would leave
 * every request that used the catalogue's name permanently unanswered, which is the worst reading of
 * all: it says the supplier has not acted when he has.
 */
export function documentAskSatisfied(machine: RequestTargetMachine, docTypes: string[]): boolean {
  const held = new Set(machine.documentKeys.map((d) => canonicalDocType(d.type)));
  for (const p of machine.photoKeys ?? []) {
    const slot = photoDocKey(p.slot);
    if (slot) held.add(slot);
  }
  const wanted = docTypes.map(canonicalDocType).filter((t) => t !== "");
  if (wanted.length === 0) return false;
  return wanted.every((t) => held.has(t));
}

/** A raw `photoKeys[].slot` → the catalogue's photo key, or null when it is none of the four.
 *  Folded on synonyms rather than enumerated: the wire stores `serial` / `equipment` /
 *  `operating_hours`, and a differently-spelled projection of the same shot must still count. */
function photoDocKey(slot: string): string | null {
  const t = slot.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (/front/.test(t)) return "photo_front";
  if (/serial|plate|vin|chassis/.test(t)) return "photo_serial";
  if (/operating_hours|hours|meter|odo|clock/.test(t)) return "photo_meter";
  if (/equipment|side|left|right|rear|back/.test(t)) return "photo_extra";
  return null;
}

/**
 * **Derived on every render, from the machine — nothing read off the message** (RM3-AC-18).
 *
 * | kind | how it is answered |
 * |---|---|
 * | `availability` | that unit's `locationSource` becomes `unit_yard` — the supplier named the yard it leaves from |
 * | `document` | every requested type appears in that MACHINE's `documentKeys` — there is no other kind of document ask (2026-08-08) |
 * | `alternative` | **not derivable.** Swapping a machine leaves nothing observable that says "a different one instead", which is the whole reason the reply card exists (004a §3.2) |
 *
 * **Derived state wins where both exist** (§7.13.4 / RM3-AC-58): the reply is a *record* of what was
 * said, the machine is the *verdict*. So a card whose machine already satisfies the ask reads
 * answered even when no reply was ever posted — the common case, because the supplier usually acts
 * from the fleet page rather than from the card.
 *
 * The reply is still consulted for the two things the machine cannot say: a refusal, and an
 * `alternative`'s outcome.
 *
 * **There is no company arm.** A card naming no machine is the shortfall's `alternative` — or, on a
 * card posted in the hours before 2026-08-08, a withdrawn company document ask. Neither is derivable,
 * so both fall back to the reply.
 */
export function renteeRequestState(
  card: Pick<RenteeRequestCardPayload, "kind" | "equipmentId" | "docTypes">,
  machine: RequestTargetMachine | null,
  reply: Pick<RenteeRequestReplyPayload, "resolution"> | null,
): RenteeRequestState {
  const fromReply = (): RenteeRequestState => {
    if (!reply) return "waiting";
    if (reply.resolution === "provided") return "answered";
    return reply.resolution === "declined" ? "refused" : "unavailable";
  };

  // A reply claiming `provided` that the machine does not corroborate is DOWNGRADED to waiting on a
  // derivable kind — the reply stays visible in the thread as the record of what was said, but it
  // never overrides the file (RM3-AC-58). A refusal is not downgraded: nothing in the file can state
  // one, so it is the reply's alone to carry.
  const derivable = (satisfied: boolean): RenteeRequestState => {
    if (satisfied) return "answered";
    const said = fromReply();
    return said === "answered" ? "waiting" : said;
  };

  // `alternative` has no observable answer at all — at either scope. The reply is the only thing that
  // can speak for it.
  if (card.kind === "alternative") return fromReply();

  // No machine named. Since 2026-08-08 nothing composable lands here except the shortfall's
  // `alternative` (already returned above); a document card with a null id can only be one of the
  // withdrawn company asks posted before the reversal, and there is nothing to derive it from.
  if (!card.equipmentId) return fromReply();

  // The machine is not in the fleet response — sold, unlisted, or simply not fetched yet. Saying
  // "waiting" would claim the supplier owes an answer we cannot check for.
  if (!machine) return reply ? fromReply() : "unknown";

  if (card.kind === "availability") return derivable(machine.locationSource === "unit_yard");
  const docTypes = card.docTypes ?? [];
  return derivable(docTypes.length > 0 && documentAskSatisfied(machine, docTypes));
}
