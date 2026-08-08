import { describe, it, expect } from "vitest";
import {
  RETIRED_REQUEST_KINDS,
  composeAlternativeRequest,
  composeAvailabilityRequest,
  canonicalDocType,
  composeDocumentRequest,
  composeRenteeRequest,
  composeShortfallRequest,
  documentAskSatisfied,
  parseRenteeRequestCard,
  parseRenteeRequestReply,
  renteeRequestState,
  type RenteeRequestCardPayload,
  type RequestTargetMachine,
} from "@/lib/contract/rentee-request";

/**
 * **V11 — the four requests, and reading them back** (spec 004 §6.7, RM3-AC-17 / AC-18 / TC-09).
 *
 * `tests/unit/rentee-request.test.ts` covers the shortfall composer alone, which is all that existed
 * when V4 landed. This suite covers the rest of the loop: the composer the other three entry points
 * share, the two card payloads, and — the part that matters — the state each card is re-derived into
 * on every render.
 *
 * The derivation is what is asserted, never a rendered card: there is no table and no status column
 * behind a request (§7.3), so a card that read its state off the message would freeze the moment the
 * supplier acted. Every test below therefore changes the MACHINE and expects the card to move.
 */

/* ─────────────────────────── the composer, all four asks ─────────────────────────── */

describe("composeRenteeRequest — one composer, four entry points (RM3-AC-17)", () => {
  it("names the machine as DATA, not only in prose", () => {
    expect(composeAvailabilityRequest("eq-1")).toEqual({ scope: "equipment", equipmentId: "eq-1", kind: "availability" });
  });

  it("pairs an equipment scope with an id, and a company scope with none", () => {
    expect(composeAlternativeRequest("eq-9")?.scope).toBe("equipment");
    expect(composeAlternativeRequest(null)).toEqual({ scope: "company", equipmentId: null, kind: "alternative" });
  });

  it("refuses an availability ask that names no machine — the backend would 400 it", () => {
    expect(composeRenteeRequest({ kind: "availability", equipmentId: null })).toBeNull();
  });

  it("carries MANY document types on ONE card, deduped — never one card per row (§6.6)", () => {
    const draft = composeRenteeRequest({
      kind: "document",
      equipmentId: "eq-1",
      docTypes: ["istimara", " Istimara ", "tuv", ""],
    });
    expect(draft?.docTypes).toEqual(["istimara", "tuv_cert"]);
  });

  it("refuses a document ask naming nothing — a question about nothing can never resolve", () => {
    expect(composeRenteeRequest({ kind: "document", equipmentId: "eq-1", docTypes: [] })).toBeNull();
  });

  it("drops docTypes from a non-document ask, which the backend refuses outright", () => {
    expect(composeRenteeRequest({ kind: "availability", equipmentId: "eq-1", docTypes: ["tuv"] }))
      .not.toHaveProperty("docTypes");
  });

  /* The test that stood here asserted the opposite of today's rule: it nulled the id on a
   * company-scoped document ask, because company papers belong to the firm. The product owner
   * withdrew that ask on 2026-08-08 — a document request names a machine — so it is deleted rather
   * than inverted, and the rule it contradicts is proved positively at the bottom of this file. */

  it("cannot emit the retired kind from any entry point (RM3-AC-07)", () => {
    for (const kind of RETIRED_REQUEST_KINDS) {
      expect(composeRenteeRequest({ kind, equipmentId: "eq-1" })).toBeNull();
    }
  });

  /**
   * Verified against the seeded catalogue: `assertKnownDocTypes` checks every named type against
   * `EquipmentDocumentType.documentKey`, whose values are `photo_front` / `safety_cert` /
   * `vat_cert` / … — NOT the slot names and readable fallbacks the document surfaces carry for a row
   * with nothing on it yet. And a row with nothing on it is exactly the row a renter asks about, so
   * without the alias the most common document request is a 400 he can do nothing with.
   */
  it("translates surface vocabulary into the platform's document keys", () => {
    const draft = composeRenteeRequest({
      kind: "document",
      equipmentId: "eq-1",
      docTypes: ["front", "equipment_safety_certificate", "operator_safety_certificate", "vat"],
    });
    expect(draft?.docTypes).toEqual(["photo_front", "safety_cert", "operator_license", "vat_cert"]);
  });

  it("leaves an ambiguous name alone rather than guessing which paper it means", () => {
    // Both `local_content` and `saso` are catalogue keys now (company segment, added 2026-08-08), and
    // BOTH still pass through untouched — that is the point. `saso` names four different papers across
    // the tree (the firm's registration, `saso_registration`, `saso_inspection`, and the bare `saso` a
    // listing carries for its safety cert); an alias that folded any onto another would have the
    // supplier upload the wrong paper. Scope decides which resolver reads the key, never a rename.
    expect(canonicalDocType("local_content")).toBe("local_content");
    expect(canonicalDocType("istimara")).toBe("istimara");
    // Every SASO spelling survives verbatim. A machine's `documentKeys` can carry several of them and
    // only a machine's list ever answers an ask now, so an alias folding one onto another would have
    // the supplier upload the wrong paper.
    for (const t of ["saso", "saso_registration", "saso_inspection", "saso_technical_inspection"]) {
      expect(canonicalDocType(t)).toBe(t);
    }
  });

  it("collapses the two names for one photo onto one key, so the card asks once", () => {
    const draft = composeRenteeRequest({ kind: "document", equipmentId: "eq-1", docTypes: ["serial", "plate"] });
    expect(draft?.docTypes).toEqual(["photo_serial"]);
  });
});

/* ─────────────────────────── the two payloads ─────────────────────────── */

const ask = (over: Partial<RenteeRequestCardPayload> = {}): RenteeRequestCardPayload => ({
  type: "rentee_request",
  ref: "RQ-7F3A",
  scope: "equipment",
  equipmentId: "eq-1",
  serial: "SER-1",
  kind: "availability",
  docTypes: null,
  ...over,
});

const machine = (over: Partial<RequestTargetMachine> = {}): RequestTargetMachine => ({
  locationSource: "listing_yard",
  documentKeys: [],
  ...over,
});

describe("parseRenteeRequestCard / parseRenteeRequestReply — whole, or nothing", () => {
  it("parses the card the backend posts, verbatim", () => {
    const parsed = parseRenteeRequestCard({
      type: "rentee_request",
      ref: "RQ-01",
      scope: "equipment",
      equipmentId: "eq-1",
      serial: "S",
      kind: "document",
      docTypes: ["tuv"],
    });
    expect(parsed?.kind).toBe("document");
    expect(parsed?.docTypes).toEqual(["tuv"]);
  });

  it("returns null for a card with no ref — nothing could ever be threaded onto it", () => {
    expect(parseRenteeRequestCard({ type: "rentee_request", kind: "availability", equipmentId: "eq-1" })).toBeNull();
  });

  it("returns null for the retired kind, so such a card renders as text and never as an ask", () => {
    expect(parseRenteeRequestCard({ type: "rentee_request", ref: "RQ-01", kind: "add_to_offer" })).toBeNull();
  });

  it("returns null for a reply carrying an unknown resolution", () => {
    expect(parseRenteeRequestReply({ type: "rentee_request_reply", inReplyTo: "RQ-01", resolution: "maybe" })).toBeNull();
    expect(
      parseRenteeRequestReply({ type: "rentee_request_reply", inReplyTo: "RQ-01", resolution: "declined" })?.resolution,
    ).toBe("declined");
  });

  it("never throws on rubbish — a throw inside a list render blanks the conversation", () => {
    for (const junk of [null, undefined, 0, "x", [], { type: "other" }]) {
      expect(parseRenteeRequestCard(junk)).toBeNull();
      expect(parseRenteeRequestReply(junk)).toBeNull();
    }
  });
});

/* ─────────────────────────── the verdict, re-derived every render ─────────────────────────── */

describe("renteeRequestState — the machine is the verdict (RM3-AC-18)", () => {
  it("availability: answered ONLY when that unit's locationSource is unit_yard", () => {
    expect(renteeRequestState(ask(), machine({ locationSource: "unit_yard" }), null)).toBe("answered");
    for (const level of ["listing_yard", "bid_yard", "bid_pin", "unidentified", "none", null]) {
      expect(renteeRequestState(ask(), machine({ locationSource: level }), null)).toBe("waiting");
    }
  });

  it("the SAME card flips as the machine changes — nothing is read off the message", () => {
    const card = ask();
    expect(renteeRequestState(card, machine(), null)).toBe("waiting");
    expect(renteeRequestState(card, machine({ locationSource: "unit_yard" }), null)).toBe("answered");
  });

  it("document: answered only when EVERY requested type is on the file", () => {
    const card = ask({ kind: "document", docTypes: ["istimara", "tuv"] });
    expect(renteeRequestState(card, machine({ documentKeys: [{ type: "istimara" }] }), null)).toBe("waiting");
    expect(renteeRequestState(card, machine({ documentKeys: [{ type: "Istimara" }, { type: "TUV" }] }), null))
      .toBe("answered");
  });

  it("type matching folds case and separators, because the wire is not consistent about either", () => {
    expect(documentAskSatisfied(machine({ documentKeys: [{ type: "Customs Card" }] }), ["customs_card"])).toBe(true);
    expect(documentAskSatisfied(machine({ documentKeys: [] }), [])).toBe(false);
  });

  it("matches across the TWO vocabularies — the listing says `tuv`, the catalogue says `tuv_cert`", () => {
    // Comparing them raw would leave every catalogue-named request permanently unanswered, which
    // reads as "the lessor has not acted" when he has.
    expect(documentAskSatisfied(machine({ documentKeys: [{ type: "tuv" }] }), ["tuv_cert"])).toBe(true);
  });

  it("resolves a photo ask against photoKeys — photos are not among the papers", () => {
    const withPhoto = machine({ photoKeys: [{ slot: "serial" }] });
    expect(documentAskSatisfied(withPhoto, ["photo_serial"])).toBe(true);
    expect(documentAskSatisfied(machine(), ["photo_serial"])).toBe(false);
  });

  it("alternative is NOT derivable — it reads from the echoed resolution alone (004a §3.2)", () => {
    const card = ask({ kind: "alternative" });
    // Even a machine that has since been confirmed says nothing about "a different one instead".
    expect(renteeRequestState(card, machine({ locationSource: "unit_yard" }), null)).toBe("waiting");
    expect(renteeRequestState(card, machine(), { resolution: "provided" })).toBe("answered");
    expect(renteeRequestState(card, machine(), { resolution: "declined" })).toBe("refused");
    expect(renteeRequestState(card, machine(), { resolution: "unavailable" })).toBe("unavailable");
  });

  it("the shortfall ask (null equipmentId) can only ever be answered by a reply", () => {
    const card = ask({ kind: "alternative", scope: "company", equipmentId: null });
    expect(renteeRequestState(card, null, null)).toBe("waiting");
    expect(renteeRequestState(card, null, { resolution: "declined" })).toBe("refused");
  });

  it("DERIVED STATE WINS: a provided reply the file does not corroborate reads waiting (RM3-AC-58)", () => {
    expect(renteeRequestState(ask(), machine({ locationSource: "listing_yard" }), { resolution: "provided" }))
      .toBe("waiting");
  });

  it("but a refusal is the reply's alone — no state anywhere can express one (RM3-AC-55)", () => {
    expect(renteeRequestState(ask(), machine(), { resolution: "declined" })).toBe("refused");
  });

  it("an answered machine outranks a refusal: the paper is on the file either way", () => {
    expect(renteeRequestState(ask(), machine({ locationSource: "unit_yard" }), { resolution: "declined" }))
      .toBe("answered");
  });

  it("an unanswered ask NEVER reads as refused", () => {
    expect(renteeRequestState(ask(), machine(), null)).not.toBe("refused");
  });

  it("a machine missing from the fleet reads unknown — we claim neither an answer nor a debt", () => {
    expect(renteeRequestState(ask(), null, null)).toBe("unknown");
  });
});


/* ────────── a document request NAMES A MACHINE (product owner, 2026-08-08) ────────── */

/**
 * **The company-scope document ask is withdrawn**, and this suite is what replaces the one that
 * asserted it. The renter can still ask about a machine's papers; he can no longer ask for the firm's,
 * because a company paper is **read** from the panel — listed, opened, downloaded (V15 / AC-69) — and
 * that read is untouched.
 *
 * The rule is enforced by the TYPE, not by a guard: `RenteeRequestDraft`'s `document` arm requires
 * `scope: "equipment"` and a non-nullable `equipmentId`, so `kind: "document"` with a null id cannot be
 * written down. `composeDocumentRequest` takes `equipmentId: string` for the same reason. The runtime
 * assertions below cover the one caller that hands in untyped prose — the BFF route, which parses a
 * JSON body straight into `composeRenteeRequest`.
 */
describe("a document ask cannot be composed without a machine (2026-08-08)", () => {
  it("refuses a document ask naming no machine, however the id arrives", () => {
    for (const equipmentId of [null, undefined, "", "   "]) {
      expect(composeRenteeRequest({ kind: "document", equipmentId, docTypes: ["cr"] })).toBeNull();
    }
  });

  it("refuses it even when the types named are the firm's own papers", () => {
    // The exact ask the company panel used to raise. It is not re-scoped, not downgraded — it is null.
    expect(composeRenteeRequest({ kind: "document", equipmentId: null, docTypes: ["cr", "vat"] })).toBeNull();
    expect(composeRenteeRequest({ kind: "document", equipmentId: null, docTypes: ["local_content"] })).toBeNull();
    expect(composeRenteeRequest({ kind: "document", equipmentId: null, docTypes: ["saso"] })).toBeNull();
  });

  it("there is no `scope` input to assert one with — it is derived from the id alone", () => {
    // A caller cannot smuggle a company scope past the derivation: the field does not exist on
    // `RenteeAsk`, so an extra property is dropped rather than honoured.
    const smuggled = { kind: "document", scope: "company", equipmentId: null, docTypes: ["cr"] };
    expect(composeRenteeRequest(smuggled)).toBeNull();
  });

  it("every document ask that IS composed carries the machine and the equipment scope", () => {
    const draft = composeDocumentRequest("eq-1", ["cr"]);
    expect(draft).toEqual({ scope: "equipment", equipmentId: "eq-1", kind: "document", docTypes: ["cr"] });
  });

  it("the shortfall's company-scope `alternative` is UNTOUCHED — it asks FOR a machine, not about one", () => {
    expect(composeShortfallRequest()).toEqual({ scope: "company", equipmentId: null, kind: "alternative" });
    expect(composeAlternativeRequest(null)).toEqual({ scope: "company", equipmentId: null, kind: "alternative" });
  });

  it("a legacy company document card, posted before the reversal, falls back to the reply", () => {
    // Nothing composable lands here any more, but a card already in a conversation still renders.
    // There is no firm to derive from, so it says only what the supplier said — never "answered".
    const legacy = ask({ kind: "document", scope: "company", equipmentId: null, docTypes: ["cr"] });
    expect(renteeRequestState(legacy, null, null)).toBe("waiting");
    expect(renteeRequestState(legacy, null, { resolution: "provided" })).toBe("answered");
    expect(renteeRequestState(legacy, null, { resolution: "declined" })).toBe("refused");
  });
});
