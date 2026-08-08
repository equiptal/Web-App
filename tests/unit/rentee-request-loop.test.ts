import { describe, it, expect } from "vitest";
import {
  RETIRED_REQUEST_KINDS,
  composeAlternativeRequest,
  composeAvailabilityRequest,
  canonicalDocType,
  companyDocAskSatisfied,
  composeRenteeRequest,
  documentAskSatisfied,
  parseRenteeRequestCard,
  parseRenteeRequestReply,
  renteeRequestState,
  type RenteeRequestCardPayload,
  type RequestTargetCompany,
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

  it("refuses an equipment-scoped ask that names no machine — the backend would 400 it", () => {
    expect(composeRenteeRequest({ kind: "availability", equipmentId: null, scope: "equipment" })).toBeNull();
  });

  it("carries MANY document types on ONE card, deduped — never one card per row (§6.6)", () => {
    const draft = composeRenteeRequest({
      kind: "document",
      equipmentId: "eq-1",
      scope: "equipment",
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

  it("nulls the id on a company-scoped document ask — company papers belong to the firm", () => {
    const draft = composeRenteeRequest({ kind: "document", scope: "company", equipmentId: "eq-1", docTypes: ["cr"] });
    expect(draft?.equipmentId).toBeNull();
  });

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
    expect(canonicalDocType("saso")).toBe("saso");
    expect(canonicalDocType("istimara")).toBe("istimara");
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

/* ────────── the company half: a paper that belongs to the firm, not to a machine ────────── */

const firm = (over: Partial<RequestTargetCompany> = {}): RequestTargetCompany => ({
  docKeys: [],
  ...over,
});

const companyAsk = (docTypes: string[]) =>
  ask({ kind: "document", scope: "company", equipmentId: null, docTypes });

describe("companyDocAskSatisfied — two storage systems behind four papers", () => {
  it("a catalogue paper on the firm's file answers the ask", () => {
    expect(companyDocAskSatisfied(firm({ docKeys: ["cr"] }), ["cr"])).toBe(true);
    expect(companyDocAskSatisfied(firm({ docKeys: [] }), ["cr"])).toBe(false);
  });

  it("both sides go through the SAME alias table — the panel says `vat`, the catalogue says `vat_cert`", () => {
    expect(companyDocAskSatisfied(firm({ docKeys: ["vat"] }), ["vat_cert"])).toBe(true);
    expect(companyDocAskSatisfied(firm({ docKeys: ["vat_cert"] }), ["vat"])).toBe(true);
  });

  it("answered as a WHOLE — one card carries many papers, and a partial file is not an answer", () => {
    const f = firm({ docKeys: ["cr", "vat_cert"] });
    expect(companyDocAskSatisfied(f, ["cr", "vat_cert"])).toBe(true);
    expect(companyDocAskSatisfied(f, ["cr", "national_address"])).toBe(false);
  });

  it("an ask naming nothing is a question about nothing", () => {
    expect(companyDocAskSatisfied(firm({ docKeys: ["cr"] }), [])).toBe(false);
  });

  /* AC-70 — local content is a HELD CERT, and the legacy column is still populated. Resolving it
   * against `docKeys` alone would leave the newly-requestable key permanently unanswered, which is
   * exactly the failure `assertKnownDocTypes` refuses unknown types to prevent. */
  it("local content resolves from the canonical `held_cert_docs.LC`", () => {
    expect(companyDocAskSatisfied(firm({ heldCertDocs: { LC: "docs/lc.pdf" } }), ["local_content"])).toBe(true);
  });

  it("local content resolves from the LEGACY `local_content_doc_key` ALONE", () => {
    expect(companyDocAskSatisfied(firm({ localContentDocKey: "docs/lc.pdf" }), ["local_content"])).toBe(true);
  });

  it("local content resolves from a mapped bid's `companyCertCodes` — mapBid already dual-read it", () => {
    expect(companyDocAskSatisfied(firm({ certCodes: ["LC", "SASO"] }), ["local_content"])).toBe(true);
    expect(companyDocAskSatisfied(firm({ certCodes: ["lc"] }), ["local_content"])).toBe(true);
  });

  it("a lowercase map key still counts — the map has more than one writer", () => {
    expect(companyDocAskSatisfied(firm({ heldCertDocs: { lc: "docs/lc.pdf" } }), ["local_content"])).toBe(true);
  });

  it("no local-content file anywhere reads UNANSWERED, and SASO never stands in for it", () => {
    expect(companyDocAskSatisfied(firm({ heldCertDocs: { SASO: "docs/saso.pdf" }, certCodes: ["SASO"] }), ["local_content"]))
      .toBe(false);
    expect(companyDocAskSatisfied(firm({ heldCertDocs: { LC: "" } }), ["local_content"])).toBe(false);
    expect(companyDocAskSatisfied(firm({ localContentDocKey: "  " }), ["local_content"])).toBe(false);
  });
});

describe("renteeRequestState — a company-scope document ask", () => {
  it("reads ANSWERED off the firm's file, with no reply ever posted", () => {
    expect(renteeRequestState(companyAsk(["local_content"]), null, null, firm({ certCodes: ["LC"] })))
      .toBe("answered");
  });

  it("reads WAITING when the paper is not on the file — never refused", () => {
    expect(renteeRequestState(companyAsk(["local_content"]), null, null, firm())).toBe("waiting");
  });

  it("DERIVED STATE WINS here too: a provided reply the firm's file does not corroborate reads waiting", () => {
    expect(renteeRequestState(companyAsk(["cr"]), null, { resolution: "provided" }, firm())).toBe("waiting");
  });

  it("a refusal is still the reply's alone", () => {
    expect(renteeRequestState(companyAsk(["cr"]), null, { resolution: "declined" }, firm())).toBe("refused");
    expect(renteeRequestState(companyAsk(["cr"]), null, { resolution: "declined" }, firm({ docKeys: ["cr"] })))
      .toBe("answered");
  });

  it("OMITTING the firm changes nothing — the ask falls back to the reply, exactly as before", () => {
    // The whole point of the optional argument: `/deal-room/[id]` has no company read in hand and must
    // keep behaving as it did rather than reading every company paper as missing.
    expect(renteeRequestState(companyAsk(["local_content"]), null, null)).toBe("waiting");
    expect(renteeRequestState(companyAsk(["local_content"]), null, { resolution: "provided" })).toBe("answered");
  });

  it("the shortfall `alternative` is STILL reply-only, even with the firm in hand", () => {
    const card = ask({ kind: "alternative", scope: "company", equipmentId: null });
    expect(renteeRequestState(card, null, null, firm({ docKeys: ["cr"], certCodes: ["LC"] }))).toBe("waiting");
  });

  it("an EQUIPMENT ask never reads a company paper as its answer", () => {
    const card = ask({ kind: "document", equipmentId: "eq-1", docTypes: ["local_content"] });
    expect(renteeRequestState(card, machine(), null, firm({ certCodes: ["LC"] }))).toBe("waiting");
  });
});

describe("companyDocAskSatisfied — SASO, the same fix with an overloaded name", () => {
  it("resolves from the canonical `held_cert_docs.SASO`", () => {
    expect(companyDocAskSatisfied(firm({ heldCertDocs: { SASO: "docs/saso.pdf" } }), ["saso"])).toBe(true);
  });

  it("resolves from the LEGACY `saso_heavy_equip_doc_key` ALONE", () => {
    expect(companyDocAskSatisfied(firm({ sasoHeavyEquipDocKey: "docs/saso.pdf" }), ["saso"])).toBe(true);
  });

  it("resolves from a mapped bid's `companyCertCodes`", () => {
    expect(companyDocAskSatisfied(firm({ certCodes: ["SASO"] }), ["saso"])).toBe(true);
  });

  it("the two held certs never stand in for one another", () => {
    expect(companyDocAskSatisfied(firm({ certCodes: ["LC"] }), ["saso"])).toBe(false);
    expect(companyDocAskSatisfied(firm({ certCodes: ["SASO"] }), ["local_content"])).toBe(false);
    // Both asked for, only one held — a partial file is not an answer.
    expect(companyDocAskSatisfied(firm({ certCodes: ["SASO"] }), ["saso", "local_content"])).toBe(false);
    expect(companyDocAskSatisfied(firm({ certCodes: ["SASO", "LC"] }), ["saso", "local_content"])).toBe(true);
  });

  it("an EQUIPMENT-level `saso` never answers the FIRM's SASO — the two are separated by scope alone", () => {
    // `EQUIPMENT_CERT_TYPES` holds a bare `'saso'` for a machine's safety cert, and the retired
    // `saso_registration` term already conflated the two once. The company resolver reads no machine…
    const withSasoDoc = machine({ documentKeys: [{ type: "saso" }, { type: "saso_registration" }] });
    expect(companyDocAskSatisfied(firm(), ["saso"])).toBe(false);
    expect(renteeRequestState(companyAsk(["saso"]), withSasoDoc, null, firm())).toBe("waiting");
    // …and the machine resolver reads no firm.
    const eqAsk = ask({ kind: "document", equipmentId: "eq-1", docTypes: ["saso"] });
    expect(renteeRequestState(eqAsk, machine(), null, firm({ certCodes: ["SASO"] }))).toBe("waiting");
  });

  it("the equipment SASO keys are never aliased onto the firm's, in either direction", () => {
    // A company file holding the registration does not answer an ask for a machine's papers…
    expect(companyDocAskSatisfied(firm({ certCodes: ["SASO"] }), ["saso_registration"])).toBe(false);
    expect(companyDocAskSatisfied(firm({ certCodes: ["SASO"] }), ["saso_inspection"])).toBe(false);
    // …and canonicalisation leaves every spelling exactly as written, so nothing can drift into another.
    for (const t of ["saso", "saso_registration", "saso_inspection", "saso_technical_inspection"]) {
      expect(canonicalDocType(t)).toBe(t);
    }
  });
});

describe("renteeRequestState — a company-scope SASO ask", () => {
  it("reads ANSWERED off the firm's file, with no reply ever posted", () => {
    expect(renteeRequestState(companyAsk(["saso"]), null, null, firm({ sasoHeavyEquipDocKey: "k" })))
      .toBe("answered");
  });

  it("reads WAITING when the registration is not on file — never refused", () => {
    expect(renteeRequestState(companyAsk(["saso"]), null, null, firm())).toBe("waiting");
  });
});
