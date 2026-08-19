import { describe, it, expect } from "vitest";
import {
  RENTEE_REQUEST_CARD_TYPE,
  RENTEE_REQUEST_REPLY_CARD_TYPE,
  RETIRED_REQUEST_KINDS,
  askIdentity,
  composeAlternativeRequest,
  composeAvailabilityRequest,
  composeDocumentRequest,
  composeShortfallRequest,
  isAskOutstanding,
  isSendableKind,
  outstandingAskIdentities,
  type RenteeRequestCardPayload,
  type RenteeRequestReplyPayload,
  type RenteeRequestResolution,
} from "@/lib/contract/rentee-request";

/**
 * The shortfall alert's ask (spec 004 §6.3, RM3-AC-07 / TC-03).
 *
 * The payload is asserted rather than the button, because the button is the only part that can be
 * rebuilt: what must not drift is the card the surface emits — an `alternative` with no machine named,
 * and never the retired kind the backend answers with a 400.
 */
describe("composeShortfallRequest — an `alternative` with a null equipmentId (RM3-AC-07)", () => {
  it("names no machine, because a claimed unit is a count with nothing behind it", () => {
    expect(composeShortfallRequest().equipmentId).toBeNull();
  });

  it("is kind `alternative` — the renter is asking for a machine, not about one", () => {
    expect(composeShortfallRequest().kind).toBe("alternative");
  });

  it("pairs the null id with scope `company`, which is the only pairing the backend accepts", () => {
    // `scope: 'equipment'` REQUIRES an id and `scope: 'company'` REQUIRES its absence — the two halves
    // are validated against each other, so they are composed together rather than left to a caller.
    expect(composeShortfallRequest()).toEqual({ scope: "company", equipmentId: null, kind: "alternative" });
  });

  it("carries no docTypes — those are only valid for a document request", () => {
    expect(composeShortfallRequest()).not.toHaveProperty("docTypes");
  });

  it("never emits `add_to_offer`, which is retired and rejected server-side", () => {
    expect(RETIRED_REQUEST_KINDS).toContain("add_to_offer");
    expect(isSendableKind("add_to_offer")).toBe(false);
    expect(RETIRED_REQUEST_KINDS).not.toContain(composeShortfallRequest().kind);
  });

  it("still accepts the three live kinds, so the filter is a retirement and not a ban", () => {
    expect(["availability", "document", "alternative"].every(isSendableKind)).toBe(true);
    expect(isSendableKind("anything_else")).toBe(false);
  });
});

/* ═══════════════════════════════ one ask, one card ═══════════════════════════════════════════════
   Owner's rule, 2026-08-10. Verified on staging before the guard existed: the identical availability
   ask returned 201 three times in a row and posted three cards into the lessor's conversation.

   The rule is enforced in BOTH halves by the owner's choice, so what these tests pin is not only
   "the client blocks a repeat" but that it blocks EXACTLY what the backend blocks — the client is
   the primary guard and the 409 is the backstop, and a client that keyed the question differently
   would either disable a control the backend would have accepted or leave a live-looking control
   that always 409s.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

/** A posted ask, as the dock reads it back off the channel. */
const posted = (
  ref: string,
  over: Partial<Omit<RenteeRequestCardPayload, "type" | "ref">> = {},
): { ask: RenteeRequestCardPayload } => ({
  ask: {
    type: RENTEE_REQUEST_CARD_TYPE,
    ref,
    scope: "equipment",
    equipmentId: "eq-1",
    serial: null,
    kind: "availability",
    docTypes: null,
    ...over,
  },
});

/** The lessor's answer to one of them. */
const answer = (
  inReplyTo: string,
  resolution: RenteeRequestResolution = "provided",
  /** Only a `partial` ever names any (owner ruling, 2026-08-11, §8). */
  deliveredTypes: string[] | null = null,
): { reply: RenteeRequestReplyPayload } => ({
  reply: { type: RENTEE_REQUEST_REPLY_CARD_TYPE, inReplyTo, equipmentId: null, resolution, deliveredTypes },
});

/** `composeX` returns null for an ask the backend would refuse; every draft below is a valid one, so
 *  the null arm is a test-authoring mistake rather than a case under test. */
const draft = <T,>(d: T | null): T => {
  expect(d).not.toBeNull();
  return d as T;
};

describe("askIdentity — what makes two asks the same question", () => {
  it("keys on kind · scope · machine · the SET of types, in the backend's own format", () => {
    // The literal is the contract between the two halves — `rentee-request.service.askIdentity`
    // builds `${kind}|${scope}|${equipmentId ?? ''}|${sorted.join('+')}`. Pinned as a string rather
    // than only compared against itself, because a client that keyed the same question differently
    // fails silently: the control stays live and the renter meets a 409 he cannot act on.
    expect(askIdentity({ kind: "document", scope: "equipment", equipmentId: "eq-1", docTypes: ["tuv", "istimara"] }))
      .toBe("document|equipment|eq-1|istimara+tuv");
    expect(askIdentity({ kind: "alternative", scope: "company", equipmentId: null })).toBe("alternative|company||");
  });

  it("is ORDER-INDEPENDENT over the document types", () => {
    // Ticking {istimara, tuv} and {tuv, istimara} is one question asked twice. A renter who ticks the
    // same two rows in the other order must not slip past the guard.
    const a = askIdentity({ kind: "document", scope: "equipment", equipmentId: "eq-1", docTypes: ["istimara", "tuv"] });
    const b = askIdentity({ kind: "document", scope: "equipment", equipmentId: "eq-1", docTypes: ["tuv", "istimara"] });
    expect(a).toBe(b);
  });

  it("separates on every field it keys, so nothing collapses two different questions into one", () => {
    const base = { kind: "availability", scope: "equipment", equipmentId: "eq-1", docTypes: null };
    const id = askIdentity(base);
    expect(askIdentity({ ...base, kind: "alternative" })).not.toBe(id);
    expect(askIdentity({ ...base, scope: "company" })).not.toBe(id);
    expect(askIdentity({ ...base, equipmentId: "eq-2" })).not.toBe(id);
    expect(askIdentity({ ...base, docTypes: ["istimara"] })).not.toBe(id);
  });
});

describe("outstandingAskIdentities — the asks the lessor has not answered", () => {
  it("counts an unanswered ask as outstanding, so its control is blocked", () => {
    const outstanding = outstandingAskIdentities([posted("RQ-1")]);
    expect(isAskOutstanding(draft(composeAvailabilityRequest("eq-1")), outstanding)).toBe(true);
  });

  it("stops counting it the moment a reply carries its ref", () => {
    const outstanding = outstandingAskIdentities([posted("RQ-1"), answer("RQ-1")]);
    expect(outstanding.size).toBe(0);
    expect(isAskOutstanding(draft(composeAvailabilityRequest("eq-1")), outstanding)).toBe(false);
  });

  it("treats a refusal as an answer — a 'no' closes the question the renter asked", () => {
    // `waiting` never becomes `refused` when a card is rendered (AC-20), but that is about what the
    // CARD claims. Here the only question is whether the lessor has spoken, and «رفض» is speech: the
    // renter is free to ask again. The backend agrees — it looks for a reply's `ref`, not its verdict.
    for (const resolution of ["declined", "unavailable"] as const) {
      const outstanding = outstandingAskIdentities([posted("RQ-1"), answer("RQ-1", resolution)]);
      expect(isAskOutstanding(draft(composeAvailabilityRequest("eq-1")), outstanding), resolution).toBe(false);
    }
  });

  it("honours a reply that appears BEFORE its ask in the array", () => {
    // A partially-loaded page, a re-ordered Stream read or a paginated history can hand these up in
    // any order. Answering in one pass and threading by `ref` is what makes that safe — a single
    // forward scan that only cancelled asks it had already seen would resurrect this one.
    const outstanding = outstandingAskIdentities([answer("RQ-1"), posted("RQ-1")]);
    expect(outstanding.size).toBe(0);
    expect(isAskOutstanding(draft(composeAvailabilityRequest("eq-1")), outstanding)).toBe(false);
  });

  it("blocks nothing on an empty conversation", () => {
    // The state every deal room starts in, and the state a failed channel read leaves behind. Neither
    // may disable a legitimate first ask.
    const outstanding = outstandingAskIdentities([]);
    expect(outstanding.size).toBe(0);
    expect(isAskOutstanding(draft(composeAvailabilityRequest("eq-1")), outstanding)).toBe(false);
    expect(isAskOutstanding(composeShortfallRequest(), outstanding)).toBe(false);
  });

  it("ignores messages that are neither an ask nor a reply", () => {
    // The dock walks the whole conversation; ordinary chat and the negotiation cards come through it
    // too, and a rate card must not be able to block a request control.
    expect(outstandingAskIdentities([{}, {}, posted("RQ-1")]).size).toBe(1);
  });
});

describe("a DIFFERENT question still goes through — the rule is no repeats, not one ask per room", () => {
  it("lets the same ask through about a different machine", () => {
    const outstanding = outstandingAskIdentities([posted("RQ-1", { equipmentId: "eq-1" })]);
    expect(isAskOutstanding(draft(composeAvailabilityRequest("eq-2")), outstanding)).toBe(false);
  });

  it("lets a different KIND through about the same machine", () => {
    // Having asked whether the machine is available does not bar asking for a different one.
    const outstanding = outstandingAskIdentities([posted("RQ-1", { kind: "availability" })]);
    expect(isAskOutstanding(draft(composeAlternativeRequest("eq-1")), outstanding)).toBe(false);
  });

  it("lets a different SET of document types through", () => {
    // Having asked for the istimara does not bar asking for the TÜV as well.
    const outstanding = outstandingAskIdentities([
      posted("RQ-1", { kind: "document", docTypes: ["istimara"] }),
    ]);
    expect(isAskOutstanding(draft(composeDocumentRequest("eq-1", ["istimara", "tuv"])), outstanding)).toBe(false);
  });

  it("blocks the SAME set of document types ticked in the other order", () => {
    // Both sides travel through `canonicalDocType`, so `TUV` on the surface and `tuv_cert` on the
    // card are one paper — the guard would be trivially escapable otherwise, by re-ticking the rows
    // bottom-up or by a surface that spells a type its own way.
    const outstanding = outstandingAskIdentities([
      posted("RQ-1", { kind: "document", docTypes: ["istimara", "tuv_cert"] }),
    ]);
    expect(isAskOutstanding(draft(composeDocumentRequest("eq-1", ["TUV", "Istimara"])), outstanding)).toBe(true);
  });
});

describe("the shortfall ask — company scope, no machine named", () => {
  const shortfall = () =>
    posted("RQ-9", { scope: "company", equipmentId: null, kind: "alternative" });

  it("blocks «اطلب إضافتها» while the lessor has not answered it", () => {
    expect(isAskOutstanding(composeShortfallRequest(), outstandingAskIdentities([shortfall()]))).toBe(true);
  });

  it("releases it once he has", () => {
    expect(isAskOutstanding(composeShortfallRequest(), outstandingAskIdentities([shortfall(), answer("RQ-9")]))).toBe(false);
  });

  it("is NOT blocked by an `alternative` about a machine, and does not block one", () => {
    // The two share a kind and differ in scope: «اطلب معدّة أخرى» from a detail names the machine it
    // wants replaced, the shortfall names none because there is no machine to name. Folding them
    // together would silence one control from the other.
    const machineAsk = outstandingAskIdentities([posted("RQ-1", { kind: "alternative", equipmentId: "eq-1" })]);
    expect(isAskOutstanding(composeShortfallRequest(), machineAsk)).toBe(false);
    expect(isAskOutstanding(draft(composeAlternativeRequest("eq-1")), outstandingAskIdentities([shortfall()]))).toBe(false);
  });
});
