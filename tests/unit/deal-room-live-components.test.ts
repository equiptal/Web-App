import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join, basename } from "node:path";

/**
 * **Every component in the deal-room directory is one something renders.**
 *
 * The defect this guards is drift, not a broken render. `DealRoomTerms` — a 278-line terms surface
 * with a progress meter, four groups, per-term accept/keep-mine/counter cards and an inline counter
 * editor — sat in this directory rendering NOWHERE, dressed by ~170 lines of live CSS, while
 * `DealRoom.tsx`'s own doc block said the counter flow "reuses `DealRoomTerms`". The counter flow
 * had grown its own terms table instead.
 *
 * Nothing failed. Unrendered markup type-checks, lints and styles perfectly; the tests passed; the
 * build shipped it. It was found only by grepping for the component's own name — which is to say,
 * by accident. Meanwhile the stale comment made the dead copy look like the live one, so a change
 * meant for the real terms step could have landed in the invisible one and appeared to do nothing.
 *
 * A component that nothing renders is either dead code or a surface that silently stopped appearing.
 * Both are worth failing a build over; neither shows up any other way.
 */

const DIR = resolve(process.cwd(), "src/components/deal-room");

/** Files whose exports are entered from outside — a route, or another feature's component. */
const ENTRY_POINTS = new Set(["DealRoom.tsx"]);

function sourcesOutside(exclude: string): string {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && basename(p) !== exclude) out.push(readFileSync(p, "utf8"));
    }
  };
  walk(resolve(process.cwd(), "src"));
  return out.join("\n");
}

/**
 * Exported React components: a PascalCase `export function` / `export const` binding.
 *
 * SCREAMING_CASE constants are excluded by the trailing boundary — `STATE_META` would otherwise be
 * captured as `STATE`, a name common enough to match something somewhere and pass the guard while
 * proving nothing.
 */
function exportedComponents(src: string): string[] {
  return [...src.matchAll(/export\s+(?:default\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9]*)(?![\w])/g)].map((m) => m[1]);
}

describe("src/components/deal-room", () => {
  const files = readdirSync(DIR).filter((f) => /\.tsx?$/.test(f));

  it("has components to check (the guard itself must not silently pass on an empty list)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const components = exportedComponents(readFileSync(join(DIR, file), "utf8"));
    if (components.length === 0 || ENTRY_POINTS.has(file)) continue;

    it(`${file} — every exported component is rendered somewhere`, () => {
      const outside = sourcesOutside(file);
      // RENDERED, not merely named. A bare-name search also matches the import PATH
      // (`@/components/deal-room/DealRoomTerms`) and any prose in a comment — which is how the dead
      // component hid for as long as it did, and why the first draft of this guard passed on it.
      // Only `<Name` counts.
      const dead = components.filter((c) => !new RegExp(`<${c}(?![\\w])`).test(outside));
      expect(dead, `exported but rendered nowhere — delete it, or wire it to the surface it was written for:\n${dead.join("\n")}`).toEqual([]);
    });
  }
});
