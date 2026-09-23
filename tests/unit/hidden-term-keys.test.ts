import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HIDDEN_TERM_KEYS, isHiddenTermKey } from "@/lib/contract/term-visibility";
import { HIDDEN_DEAL_ROOM_TERM_KEYS, isHiddenDealRoomTermKey } from "@/lib/contract/deal-room";

/**
 * **Operator nationality is off every renter-facing surface** (owner, 2026-09-22: *"operator
 * nationality is removed in the app, check it there and align web to it"*).
 *
 * The app's own rule, read off `core/constants/term_options.dart` rather than assumed:
 * `kHiddenTermKeys = {'operator_nationality'}` with a case-insensitive `isHiddenTermKey`, applied at
 * the PARSE where it can be and at each display loop otherwise.
 *
 * 🔴 **DISPLAY ONLY**, and the app is explicit about all three halves: the field is still stored on
 * the request item, still declared on the bid payload, and still rendered by the admin panel. So the
 * cases below assert what a surface DRAWS, and deliberately assert that the contract types still
 * carry it — a "fix" that dropped the field would silently clear it on every old request that an
 * edit touches.
 */

const SRC = resolve(__dirname, "../../src");
const read = (p: string) => readFileSync(resolve(SRC, p), "utf8");
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

describe("the rule itself, mirroring the app's", () => {
  it("Given the set, Then it holds the key the app holds", () => {
    expect([...HIDDEN_TERM_KEYS]).toEqual(["operator_nationality"]);
  });

  it("Given either casing, Then the key is hidden", () => {
    /**
     * ⚠️ Load-bearing rather than tidy: deviation keys and T3 declarations arrive in BOTH forms
     * (`operator_nationality` off the deviations array, `operatorNationality` off `t3Declarations`),
     * so a payload cased differently would otherwise smuggle a retired term back onto a surface.
     */
    expect(isHiddenTermKey("operator_nationality")).toBe(true);
    expect(isHiddenTermKey("OPERATOR_NATIONALITY")).toBe(true);
    expect(isHiddenTermKey("payment_terms")).toBe(false);
  });

  it("Given the deal room's wider set, Then it COMPOSES this one rather than restating it", () => {
    /**
     * 🔴 `HIDDEN_DEAL_ROOM_TERM_KEYS` carried `operator_nationality` of its own since 2026-09-18.
     * Two lists saying one thing is how one of them comes to be edited alone — and nothing fails
     * when it happens, the term simply reappears on half the product.
     */
    for (const k of HIDDEN_TERM_KEYS) expect(HIDDEN_DEAL_ROOM_TERM_KEYS.has(k)).toBe(true);
    expect(isHiddenDealRoomTermKey("operator_nationality")).toBe(true);
    // The deal room keeps its own extra keys; this is a superset, not a rename.
    expect(HIDDEN_DEAL_ROOM_TERM_KEYS.size).toBeGreaterThan(HIDDEN_TERM_KEYS.size);
    expect(strip(read("lib/contract/deal-room.ts"))).toContain("...HIDDEN_TERM_KEYS,");
  });
});

describe("no renter-facing surface draws it", () => {
  /**
   * The ten places it was drawn on 2026-09-22, before this pass. Each is asserted against the CODE
   * with comments stripped: every one of these files now explains the term it retired, so a bare
   * `not.toContain` would fail on its own explanation — seventh time in this repo.
   */
  const SURFACES: [string, string][] = [
    ["the create flow's operator rail", "components/create/OperatorRail.tsx"],
    ["the intake floor's terms pills", "components/create/ProjectPills.tsx"],
    ["the projects board's terms form", "components/projects/TermsFields.tsx"],
    ["the request details, both sides", "lib/contract/request-fields.ts"],
    ["the deal room's details card", "components/deal-room/DealRoom.tsx"],
    ["the bid card and the comparison", "lib/contract/bids.ts"],
    ["the public bid form", "app/bid/[token]/BidFormClient.tsx"],
    ["the off-platform submission viewer", "components/requests/SharedBidSubmissionModal.tsx"],
    ["the off-platform submission's parse", "lib/contract/link-bids.ts"],
  ];

  for (const [what, file] of SURFACES) {
    it(`Given ${what}, Then it prints no nationality label`, () => {
      const code = strip(read(file));
      expect(code).not.toMatch(/Operator nationality/i);
      expect(code).not.toContain("جنسية المشغّل");
    });
  }

  it("Given the bid-quality score, Then a term he is never shown cannot count against him", () => {
    // Same ruling `fuelType` took on 2026-09-04, and for the same reason.
    expect(strip(read("lib/contract/bid-quality.ts"))).not.toMatch(/"nationality"/);
  });
});

describe("what the change deliberately does NOT do", () => {
  it("Given the request contract, Then the field is still parsed and still carried", () => {
    /**
     * 🔴 The app keeps `_operatorNationality` loaded from the item and written back by
     * `_saveCurrentEquipment`, so editing a request created before the term was hidden preserves
     * what it holds. Dropping the field here would clear it on the next save, silently, on data the
     * renter cannot see to restore.
     */
    expect(read("lib/contract/requests.ts")).toContain("operatorNationality: string | null;");
    expect(read("lib/contract/project-apply.ts")).toContain("operatorNationality?: string | null;");
  });

  it("Given a bid's deviation on it, Then it is dropped at the PARSE and paints nothing", () => {
    /**
     * 🔴 App parity (`marketplace_models.dart` filters `deviations` with `isHiddenTermKey`). Three
     * separate readings in `bids.ts` ask `deviationKeys` whether the operator row conflicts and what
     * its detail line says — filtering once at the source is what stops a retired term painting a
     * row red over a question nobody was asked.
     */
    const bids = strip(read("lib/contract/bids.ts"));
    expect(bids).toContain(".filter((k) => !isHiddenTermKey(k))");
    expect(bids).not.toContain('deviationKeys.has("operator_nationality")');
  });

  it("Given the operator rail, Then it can still reach COMPLETE", () => {
    /**
     * 🔴 The rail's `complete` test read `op.nationality`. With the control hidden that field can
     * never be answered on a new request, so leaving it in would have made the panel read incomplete
     * for ever — a permanent amber dot with nothing left to fill. The one place a display-only
     * change could create a dead state, and the one worth a case of its own.
     */
    const rail = strip(read("components/create/OperatorRail.tsx"));
    expect(rail).toContain("const complete = !on || [op.fatFood, op.fatAccommodationTransport].every(Boolean);");
  });
});
