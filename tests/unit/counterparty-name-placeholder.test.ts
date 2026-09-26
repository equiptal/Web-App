import { describe, expect, it } from "vitest";
import { counterpartyDisplayName } from "@/lib/contract/counterparty-name";

/**
 * Owner, 2026-09-26: *"why some show «My company»? … first show legal company name, if not exist
 * fallback to company name in profile, if not exist then to user name"*. The backend fills an unnamed
 * firm's `companies.name` with the literal «My Company»; that is no name, so it falls through.
 */
describe("counterparty name, the backend's placeholder", () => {
  it("skips «My Company» and shows the person", () => {
    expect(counterpartyDisplayName({ companyName: "My Company", personName: "Murad Alabdullah" })).toBe("Murad Alabdullah");
  });

  it("skips it in any case and falls to the profile's company name", () => {
    expect(counterpartyDisplayName({ companyName: "my company", profileCompanyName: "Al-Jaber", personName: "Murad" })).toBe("Al-Jaber");
  });

  it("still puts the legal name first", () => {
    expect(counterpartyDisplayName({ companyLegalName: "Al Faisal Heavy Equipment Est.", companyName: "Al Faisal", personName: "Murad" }))
      .toBe("Al Faisal Heavy Equipment Est.");
  });
});
