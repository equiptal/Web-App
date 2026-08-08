/**
 * **RM3-AC-29 — no bid-quality score anywhere on the equipment-verification surface.**
 *
 * A negative AC with a live risk behind it. `src/lib/contract/bid-quality.ts` and
 * `src/components/bid/QualityRing.tsx` are real, working modules that four other renter-facing
 * surfaces already render (`/bid/[token]`, the comparison workspace, `RequestBids`, `GroupBids` /
 * `SharedLinkBidCard`). Putting the same ring on a machine card is one `import` away, would look like
 * an improvement in review, and would violate the AC on the surface where it matters most: this one
 * states what a lessor HAS and what he has not, machine by machine, and a single 0–100 number over
 * that invites the renter to stop reading the evidence.
 *
 * Nothing in the suite referenced this AC before. Two facts are asserted here, and between them the
 * negative is closed as far as it can be closed without a component harness:
 *
 *   1. **An import-graph fact.** Neither module is imported by the surface — not directly, and not
 *      transitively through the 67 modules the surface can reach. A score cannot be rendered by code
 *      that cannot be reached.
 *   2. **A model-shape fact.** Section E asks a negative to be proven by the model exposing no such
 *      field. Every view model this surface renders is built from a real fixture and swept for a
 *      quality / score / ring / percent key. The sharpest case is `unitIndicators`: the scorer behind
 *      it DOES compute a `percent`, and the map's per-unit view model deliberately carries only the
 *      band — so the field exists one call away and the model still refuses it.
 *
 * There is a positive control on both halves. A test that passed because `bid-quality.ts` had been
 * deleted, or because a fixture produced an empty model, would be exactly the green-over-a-hole this
 * suite exists to stop.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { unitCounts, unitIndicators } from "@/lib/contract/bid-map";
import { computeUnitReadiness } from "@/lib/contract/bid-readiness";
import { equipmentListView } from "@/lib/contract/equipment-list";
import { mapFleet, type FleetMachine } from "@/lib/contract/fleet";
import { priceFooterModel } from "@/lib/contract/price-footer";

/* ─────────────────────────────────── the import graph ─────────────────────────────────── */

const ROOT = process.cwd();
const EXT = [".ts", ".tsx", ".js", ".jsx"];

/** The two modules AC-29 forbids this surface from reaching. */
const FORBIDDEN = ["src/lib/contract/bid-quality", "src/components/bid/QualityRing"];

/** The surface's entry points: its route, and every file of its component tree. */
const SURFACE_ROOTS = ["src/app/bids/[bidId]/equipment/page.tsx", "src/components/map"];

const norm = (p: string) => p.replace(/\\/g, "/");

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else if (EXT.some((e) => name.endsWith(e))) out.push(norm(p));
  }
  return out;
}

/** Every module specifier a file imports — `import from`, bare `import`, `export from`, `import()`. */
function importSpecifiers(file: string): string[] {
  const src = readFileSync(file, "utf8");
  return [
    ...[...src.matchAll(/(?:^|\n)\s*import\s[^;]*?from\s*["']([^"']+)["']/g)].map((m) => m[1]),
    ...[...src.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g)].map((m) => m[1]),
    ...[...src.matchAll(/(?:^|\n)\s*export\s[^;]*?from\s*["']([^"']+)["']/g)].map((m) => m[1]),
    ...[...src.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]),
  ];
}

/** Resolve `@/…` and relative specifiers to a file on disk; anything else (a package) is not ours. */
function resolveSpecifier(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = resolve(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null;
  for (const e of EXT) if (existsSync(base + e) && statSync(base + e).isFile()) return norm(base + e);
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const e of EXT) if (existsSync(join(base, `index${e}`))) return norm(join(base, `index${e}`));
  }
  if (existsSync(base) && statSync(base).isFile()) return norm(base);
  return null;
}

const surfaceFiles: string[] = SURFACE_ROOTS.flatMap((r) => {
  const abs = resolve(ROOT, r);
  return statSync(abs).isDirectory() ? filesUnder(abs) : [norm(abs)];
});

/** Everything the surface can reach, transitively, through first-party imports. */
const closure: string[] = (() => {
  const seen = new Set(surfaceFiles);
  const queue = [...surfaceFiles];
  while (queue.length) {
    const file = queue.shift() as string;
    for (const spec of importSpecifiers(file)) {
      const target = resolveSpecifier(spec, file);
      if (!target || seen.has(target)) continue;
      seen.add(target);
      queue.push(target);
    }
  }
  return [...seen];
})();

const hits = (files: string[]) =>
  files.filter((f) => FORBIDDEN.some((bad) => norm(f).includes(bad)));

describe("the surface cannot reach a bid-quality score (RM3-AC-29)", () => {
  it("has the surface it says it has — the walk found the route and the whole map tree", () => {
    // The positive control on the walker. If `SURFACE_ROOTS` ever stops resolving, every assertion
    // below would pass over an empty file list — a green report over nothing.
    expect(surfaceFiles.some((f) => f.endsWith("src/components/map/ChatDock.tsx"))).toBe(true);
    expect(surfaceFiles.some((f) => f.endsWith("equipment/page.tsx"))).toBe(true);
    expect(surfaceFiles.length).toBeGreaterThan(8);
    expect(closure.length).toBeGreaterThan(surfaceFiles.length);
  });

  it("has the modules it forbids — they exist, and other surfaces DO render them", () => {
    // The positive control on the rule. Deleting `bid-quality.ts` would make this AC vacuously true;
    // it is not deleted, it is live, and that is precisely why the negative needs a test.
    for (const bad of FORBIDDEN) expect(existsSync(resolve(ROOT, `${bad}.ts`)) || existsSync(resolve(ROOT, `${bad}.tsx`))).toBe(true);
    const siblings = [
      "src/app/bid/[token]/page.tsx",
      "src/components/compare/BidComparisonWorkspace.tsx",
      "src/components/requests/RequestBids.tsx",
    ];
    for (const sibling of siblings) {
      const specs = importSpecifiers(resolve(ROOT, sibling)).join(" ");
      expect(specs, `${sibling} should still import a quality module`).toMatch(/bid-quality|QualityRing/);
    }
  });

  it("imports neither module anywhere under the map tree or its route", () => {
    const offenders = surfaceFiles.filter((f) =>
      importSpecifiers(f).some((s) => /bid-quality|QualityRing/.test(s)),
    );
    expect(offenders).toEqual([]);
  });

  it("cannot reach either module TRANSITIVELY either — not through one shared module", () => {
    // The stronger claim, and the one that catches the realistic regression: a score arriving on a
    // machine card because a shared component the surface already renders started drawing the ring.
    expect(hits(closure)).toEqual([]);
  });

  it("never mentions a quality band in its own copy, in either locale", () => {
    // `QualityBand` copy ("Strong bid" / «عرض قوي») would be a score stated in words.
    for (const locale of ["src/lib/i18n/en.ts", "src/lib/i18n/ar.ts"]) {
      const bidMap = readFileSync(resolve(ROOT, locale), "utf8");
      const block = bidMap.slice(bidMap.indexOf("bidMap: {"), bidMap.indexOf("\n  },", bidMap.indexOf("bidMap: {")));
      expect(block).not.toMatch(/quality|bidScore|جودة العرض/i);
    }
  });
});

/* ─────────────────────────────────── the model shapes ─────────────────────────────────── */

interface RawMachine {
  id: string;
  inBid?: boolean;
  source?: string;
  km?: number | null;
  docs?: string[];
}

/** Through `mapFleet`, because the parser is the only thing that produces a `FleetMachine` in
 *  production — a hand-built literal could pass on a shape the wire cannot make. */
const fleet = (rows: RawMachine[]): FleetMachine[] =>
  mapFleet(
    rows.map((r) => ({
      equipmentId: r.id,
      manufacturer: "Caterpillar",
      modelName: "320D",
      year: 2022,
      serialNumber: `SER-${r.id}`,
      locationSource: r.source ?? "listing_yard",
      distanceKm: r.km === undefined ? 10 : r.km,
      lat: 24.7,
      lng: 46.7,
      inBid: r.inBid !== false,
      photoKeys: [],
      documentKeys: (r.docs ?? []).map((type, i) => ({ type, key: `d${i}`, url: `https://x/${type}` })),
    })),
  );

/** Every key at every depth of a model's output. Arrays are walked, so a key hidden on a chip or a
 *  totals line is caught as readily as one on the root. */
function keysDeep(value: unknown, seen = new Set<object>()): string[] {
  if (value == null || typeof value !== "object") return [];
  if (seen.has(value as object)) return [];
  seen.add(value as object);
  if (Array.isArray(value)) return value.flatMap((v) => keysDeep(v, seen));
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [k, ...keysDeep(v, seen)]);
}

/** A key that would BE a score, or would carry one. */
const SCORE_KEY = /quality|score|ring|percent|pct|grade|rating/i;

describe("no view model on this surface exposes a score field (RM3-AC-29, §E)", () => {
  const listed = fleet([
    { id: "m1", source: "unit_yard", km: 8, docs: ["tuv", "istimara"] },
    { id: "m2", source: "listing_yard", km: 40 },
    { id: "m3", source: "bid_pin", km: 120, docs: ["spsp"] },
  ]);

  it("the list view — the cards, the chips and the count — carries no score key", () => {
    const view = equipmentListView(listed, { reqEquipmentCerts: ["tuv"], reqMinYear: 2020 }, []);
    // The fixture must actually produce chips, or the sweep would be over an empty model.
    expect(view.groups.length).toBeGreaterThan(0);
    expect(view.machines.length).toBe(3);
    expect(keysDeep(view).filter((k) => SCORE_KEY.test(k))).toEqual([]);
  });

  it("the per-unit indicators carry a BAND and refuse the percent that sits one call away", () => {
    // The sharpest form of this AC. `computeUnitReadiness` computes `percent: number`; the map's own
    // view model takes `band` off it and drops the number. Adding `percent` here — the natural way a
    // ring would arrive — makes this go red.
    const scored = computeUnitReadiness(listed[0], ["tuv"], [], 2020);
    expect(typeof scored.percent).toBe("number"); // the score EXISTS, one call away

    const indicators = unitIndicators(listed[0], scored);
    expect(Object.keys(indicators).sort()).toEqual(["availability", "readinessBand"]);
    expect(keysDeep(indicators).filter((k) => SCORE_KEY.test(k))).toEqual([]);
    // And what it does carry is a band — three named states, never a 0–100 number.
    expect(["green", "yellow", "red"]).toContain(indicators.readinessBand);
  });

  it("the count pills carry no score key", () => {
    const counts = unitCounts({ unitsOffered: 5 }, listed);
    expect(counts.offered).toBe(5); // the model is populated
    expect(keysDeep(counts).filter((k) => SCORE_KEY.test(k))).toEqual([]);
  });

  it("the price footer carries no score key", () => {
    const model = priceFooterModel(
      {
        price: 1000, priceUnit: "PER_DAY", unitsOffered: 3, agreedUnits: null,
        mobPrice: 500, demobPrice: 400, mobUnits: null, demobUnits: null,
        mobExcluded: false, demobExcluded: false, dealRoomId: null,
      },
      10,
    );
    expect(model.totals.grand).toBeGreaterThan(0); // the model is populated
    expect(keysDeep(model).filter((k) => SCORE_KEY.test(k))).toEqual([]);
  });

  it("the fleet row a card is drawn from carries no score key either", () => {
    // The card reads the wire row directly for its identity fields, so a score arriving on the ROW
    // would reach the card without passing through any of the models above.
    expect(listed[0].equipmentId).toBe("m1");
    expect(keysDeep(listed[0]).filter((k) => SCORE_KEY.test(k))).toEqual([]);
  });
});
