import { describe, expect, it } from "vitest";
import { fieldSource, hasValue, isSystemChosen } from "@/lib/contract";

const draft = (touched: string[] = []) => ({ touchedFields: touched });

describe("fieldSource (MREQ-AC-57/58/59)", () => {
  it("marks a value the agent supplied and the renter has not changed", () => {
    const s = fieldSource({ current: "supplier", agentOriginal: "supplier", key: "delivery", draft: draft() });
    expect(s).toBe("agent");
    expect(isSystemChosen(s)).toBe(true);
  });

  it("marks a value we seeded, with no agent original behind it", () => {
    const s = fieldSource({ current: "me", key: "delivery", draft: draft() });
    expect(s).toBe("default");
    expect(isSystemChosen(s)).toBe(true);
  });

  // The renter answering wins over both, and it wins even when they land on the same value the agent
  // proposed — otherwise a deliberate confirmation would keep reading as someone else's choice.
  it("marks a touched field as the renter's, whatever the value", () => {
    expect(fieldSource({ current: "supplier", agentOriginal: "supplier", key: "delivery", draft: draft(["delivery"]) })).toBe("renter");
    expect(isSystemChosen("renter")).toBe(false);
  });

  it("leaves a genuinely empty, untouched field with no provenance at all", () => {
    const s = fieldSource({ current: null, key: "nationality", draft: draft() });
    expect(s).toBe("empty");
    expect(isSystemChosen(s)).toBe(false);
  });

  // Delivery and return are the case this exists for: their default IS a value, and it assigns the
  // renter both transport legs. It has to read as "Default", not as nothing.
  it("treats a seeded-but-falsy field as defaulted when told it is seeded", () => {
    expect(fieldSource({ current: false, key: "operator.night_shift", draft: draft(), seeded: true })).toBe("default");
    expect(fieldSource({ current: false, key: "operator.night_shift", draft: draft() })).toBe("default");
  });

  it("does not treat an agent's blank as an agent value", () => {
    expect(fieldSource({ current: [], agentOriginal: [], key: "certs", draft: draft() })).toBe("empty");
    expect(fieldSource({ current: "", agentOriginal: "", key: "notes", draft: draft() })).toBe("empty");
  });
});

describe("hasValue", () => {
  it("counts empty strings and empty arrays as absent", () => {
    expect(hasValue("")).toBe(false);
    expect(hasValue("  ")).toBe(false);
    expect(hasValue([])).toBe(false);
    expect(hasValue(null)).toBe(false);
    expect(hasValue(undefined)).toBe(false);
  });

  it("counts zero and false as present", () => {
    expect(hasValue(0)).toBe(true);
    expect(hasValue(false)).toBe(true);
    expect(hasValue(["tuv"])).toBe(true);
  });
});
