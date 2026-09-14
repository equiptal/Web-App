import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ── A short catalogue and a BROKEN one stop looking the same (owner, 2026-09-14) ─────────────────
 *
 * `/api/taxonomy` answers the built-in stand-in — 6 categories, 17 subtypes — whenever the agents
 * service fails, and it said nothing about having done so. From the screen the two are one picture:
 * the renter opens TYPE, finds little, and concludes we do not carry his machine.
 *
 * 🔴 This is not hypothetical. «Why is the hidden taxonomy not shown in the dropdown?» was diagnosed
 * twice in one night before anyone asked WHICH catalogue was on screen, and the answer to that
 * question did not exist anywhere in the app.
 *
 * ⚠️ The fallback itself STAYS. Refusing outright would take the create flow down on a misconfigured
 * environment, which is worse than a short list. What is fixed is that the answer now carries its own
 * provenance, and the card says so.
 */
const ROUTE = readFileSync("src/app/api/taxonomy/route.ts", "utf8");
const CARD = readFileSync("src/components/create/MachineCard.tsx", "utf8");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function fetchWith(headers: Record<string, string>) {
  vi.resetModules();
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify([]), { status: 200, headers }));
  const mod = await import("@/lib/api/client");
  await mod.fetchTaxonomy();
  return mod.taxonomyFromFixture();
}

describe("the route says which catalogue it served", () => {
  it("marks the live answer and the stand-in differently", () => {
    // Both branches carry the header — a flag set on only one of them is a flag nobody can trust.
    expect(ROUTE).toContain('[SOURCE_HEADER]: "live"');
    expect(ROUTE).toContain('[SOURCE_HEADER]: "fixture"');
  });

  it("still answers 200 with the stand-in rather than refusing", () => {
    // The create flow must keep working on a misconfigured environment; a short list beats no card.
    expect(ROUTE).toContain("NextResponse.json(TAXONOMY, { status: 200");
  });
});

describe("the client keeps the provenance", () => {
  it("reads the header as the answer arrives", async () => {
    expect(await fetchWith({ "x-taxonomy-source": "fixture" })).toBe(true);
  });

  it("clears it again on the next live answer, so one blip does not stick", async () => {
    expect(await fetchWith({ "x-taxonomy-source": "fixture" })).toBe(true);
    expect(await fetchWith({ "x-taxonomy-source": "live" })).toBe(false);
  });

  it("treats a missing header as live — an older route must not raise the warning", async () => {
    expect(await fetchWith({})).toBe(false);
  });
});

describe("the card says why its list is short", () => {
  it("draws the note only when the catalogue is the stand-in", () => {
    expect(CARD).toContain("taxonomyFromFixture()");
    expect(CARD).toContain("catalogueShort");
  });
});
