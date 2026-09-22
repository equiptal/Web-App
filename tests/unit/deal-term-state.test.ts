import { describe, it, expect } from "vitest";
import { bothSidesAgree, bothSidesDiffer, isConflictingTerm, isSettledByValues, type DealTerm } from "@/lib/contract/deal-room";

/**
 * A term's state as the READER meets it, not as the server last stamped it.
 * App parity: `TermModel.bothSidesDiffer` / `.isConflicting` / `.isSettledByValues`.
 *
 * 🔴 **The server sets `disputed` exactly ONCE**, in `buildTermsArray`, comparing the request against
 * the bid at room creation. Every later move — `counter`, `propose_update`, `reopen` — writes
 * `pending`. So a clash created in round two arrived as `pending`, the sheet drew it as «not set»
 * with two contradictory values sitting on it, and the accept gate let it through.
 *
 * ⚠️ These are BEHAVIOURAL cases on purpose. The negotiation-sheet suite reads the source, and a
 * source test cannot tell a right predicate from a wrong one — verified by mutating this rule and
 * watching that suite stay green.
 */

const term = (p: Partial<DealTerm>): DealTerm => ({
  key: "breakdown_response_sla",
  label: "Breakdown SLA",
  labelAr: "زمن الاستجابة",
  state: "pending",
  value: null,
  renteePreference: null,
  supplierDeclared: null,
  platformDefault: null,
  source: "platform_default",
  history: [],
  isMandatory: false,
  itemLabel: null,
  options: [],
  ...p,
});

describe("bothSidesDiffer / bothSidesAgree", () => {
  /* 🔴 **FOLDED before comparing.** These are enum-shaped values written by two different producers,
     so `NET_30` from the request and `net_30` from the bid are ONE schedule, not a disagreement. A
     raw compare reports a clash the two surfaces render with the SAME label: red, unresolvable, and
     blocking Accept for good. */
  it("folds case and whitespace, so one schedule written twice is not a clash", () => {
    const t = term({ renteePreference: "NET_30", supplierDeclared: " net_30 " });
    expect(bothSidesDiffer(t)).toBe(false);
    expect(bothSidesAgree(t)).toBe(true);
  });

  it("reads a real disagreement as one", () => {
    const t = term({ renteePreference: "net_30", supplierDeclared: "net_60" });
    expect(bothSidesDiffer(t)).toBe(true);
    expect(bothSidesAgree(t)).toBe(false);
  });

  /* ⚠️ **A comparison needs TWO values.** One side silent is not a difference and not an agreement —
     reporting either would state a conflict against a party who has said nothing at all, which is the
     defect the payment card was fixed for. */
  it("says nothing at all when only one side has spoken", () => {
    for (const t of [
      term({ renteePreference: "net_30", supplierDeclared: null }),
      term({ renteePreference: null, supplierDeclared: "net_30" }),
      term({ renteePreference: "  ", supplierDeclared: "net_30" }),
      term({ renteePreference: null, supplierDeclared: null }),
    ]) {
      expect(bothSidesDiffer(t)).toBe(false);
      expect(bothSidesAgree(t)).toBe(false);
    }
  });
});

describe("isConflictingTerm", () => {
  it("is true for the clash the server stamped at room creation", () => {
    expect(isConflictingTerm(term({ state: "disputed" }))).toBe(true);
  });

  /* 🔴 The case this predicate exists for: a clash raised by a LATER counter, which the server
     writes as `pending`. */
  it("is true for a pending term whose two sides hold different values", () => {
    expect(isConflictingTerm(term({ state: "pending", renteePreference: "net_30", supplierDeclared: "net_60" }))).toBe(true);
  });

  it("is false for a pending term nobody has answered", () => {
    expect(isConflictingTerm(term({ state: "pending" }))).toBe(false);
  });

  /* ⚠️ **Excludes anything already settled** — an `agreed` term is not in conflict however its two
     sides once looked, and a `fixed` one was accepted by the act of bidding. */
  it("is false once the term is settled, whatever its two sides say", () => {
    expect(isConflictingTerm(term({ state: "agreed", renteePreference: "net_30", supplierDeclared: "net_60" }))).toBe(false);
    expect(isConflictingTerm(term({ state: "fixed", renteePreference: "net_30", supplierDeclared: "net_60" }))).toBe(false);
    expect(isConflictingTerm(term({ state: "soft_accepted", renteePreference: "net_30", supplierDeclared: "net_60" }))).toBe(false);
  });
});

describe("isSettledByValues", () => {
  /* 🔴 **Nothing left to ask.** A counter that lands ON the other side's value writes `pending`,
     never `agreed` — so two identical values sat in the queue asking the renter to answer a question
     both parties had already answered the same way, and the accept gate stayed shut over it. */
  it("is true for a pending term both sides have answered identically", () => {
    expect(isSettledByValues(term({ state: "pending", renteePreference: "NET_30", supplierDeclared: "net_30" }))).toBe(true);
  });

  it("is true for an agreed term", () => {
    expect(isSettledByValues(term({ state: "agreed" }))).toBe(true);
  });

  it("is false while the two sides differ, and false while one is silent", () => {
    expect(isSettledByValues(term({ state: "pending", renteePreference: "net_30", supplierDeclared: "net_60" }))).toBe(false);
    expect(isSettledByValues(term({ state: "pending", supplierDeclared: "net_30" }))).toBe(false);
  });

  /* The two are mutually exclusive by construction — a term cannot be both a clash and an agreement —
     and a case says so, because the queue files a row under exactly one of them. */
  it("never agrees with isConflictingTerm about the same term", () => {
    for (const t of [
      term({ state: "pending", renteePreference: "a", supplierDeclared: "b" }),
      term({ state: "pending", renteePreference: "a", supplierDeclared: "A" }),
      term({ state: "pending" }),
      term({ state: "disputed" }),
      term({ state: "agreed" }),
      term({ state: "fixed" }),
    ]) {
      expect(isConflictingTerm(t) && isSettledByValues(t)).toBe(false);
    }
  });
});
