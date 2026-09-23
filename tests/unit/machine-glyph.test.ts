import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **The drawn machine that stands in when the catalogue has no picture.**
 *
 * Owner, 2026-09-22, on a rail tile drawing Material's grey robot arm: *"use nice icons not this"*,
 * choosing a drawn SVG over another glyph from the icon font.
 *
 * ⚠️ Read from the SOURCE. jsdom rasterises nothing, so whether it LOOKS like an excavator is a
 * rendered fact and was judged in a browser at all five call sizes and inside the real 52px disc.
 * What is assertable here is the set of rules that fail SILENTLY if they are lost: it paints with
 * `currentColor`, it names no colour of its own, nothing is thin enough to vanish at 14px, and the
 * robot arm has not crept back onto a fallback.
 */

const SRC = resolve(__dirname, "../../src");
const read = (p: string) => readFileSync(resolve(SRC, p), "utf8");
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const glyph = read("components/MachineGlyph.tsx");
const code = strip(glyph);

describe("the machine glyph paints with whatever the caller paints with", () => {
  it("Given any call site, Then the colour is the caller's and never its own", () => {
    /**
     * 🔴 Every call site already paints it (`text-muted`, `text-muted-light`). A colour named
     * here would be one `palette-drift` has to be told about and one no caller could override —
     * and the two callers use two different greys deliberately.
     */
    expect(code).toContain('stroke="currentColor"');
    expect(code).toContain('fill="currentColor"');
    // No hex, no `rgb(`, no token: it owns no paint at all.
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/rgb\(|var\(--/);
  });

  it("Given a caller, Then the SIZE is all it decides", () => {
    // The disc, the row and the zoomed view ask for 14 / 16 / 20 / 64 and one computed value, so a
    // fixed box here would be right for exactly one of them.
    expect(code).toMatch(/size = 24,/);
    expect(code).toContain('width={size}');
    expect(code).toContain('height={size}');
    // One grid, so every call is the same drawing at a different scale.
    expect(code).toContain('viewBox="0 0 24 24"');
  });

  it("Given 14px, Then nothing on it is thin enough to disappear", () => {
    /**
     * ⚠️ The item tier asks for 14px, which is 0.58px per grid unit. Every stroke here is ≥2.2
     * units — 1.3px at that size. A 1-unit stroke would be 0.58px and would render as a grey
     * smear on one row and as a crisp line on the next.
     */
    const widths = [...code.matchAll(/strokeWidth="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(widths.length).toBeGreaterThan(0);
    for (const w of widths) expect(w).toBeGreaterThanOrEqual(2.2);
  });

  it("Given the standing rule, Then it carries no shadow, glow or ring", () => {
    // Owner, 2026-09-17: *"never use shadow in design"*. This design system spends none.
    expect(code).not.toMatch(/filter=|feGaussianBlur|drop-shadow|boxShadow/);
  });

  it("Given a screen reader, Then it is decoration and says nothing", () => {
    // It stands in for a picture that failed to arrive; the row names the machine in words beside it.
    expect(code).toContain('aria-hidden="true"');
    expect(code).toContain('focusable="false"');
  });
});

describe("the robot arm is off every no-artwork fallback", () => {
  /**
   * 🔴 `precision_manufacturing` is Material's articulated FACTORY arm, and this product rents
   * earthmoving plant — `RequestCard.tsx` has carried a note about it since 2026-08-11 (*"a robot
   * arm on an excavator"*). These are the six places a machine with no picture is drawn.
   */
  const FALLBACKS = [
    "components/workspace/RequestRail.tsx",
    "components/workspace/CircleArt.tsx",
    "components/workspace/RequestDetailsModal.tsx",
    "components/workspace/ItemTier.tsx",
    "components/create/MachineCard.tsx",
    "components/create/RequestsRail.tsx",
    /* The bid map's ASK CARD (owner, 2026-09-22: *"the euqipment must show the image or the
       fallback image used on the equipemtn card not this selly icon"*). It drew
       `equipmentIcon(view.title)`, a per-family glyph whose answer for an unplaced machine is a
       tractor or the factory arm — so the one surface that quotes a machine back to a supplier
       named it with a mark from a different industry. */
    "components/map/RequestCard.tsx",
  ];

  for (const f of FALLBACKS) {
    it(`Given ${f}, Then it draws the glyph component and not the icon font`, () => {
      const src = read(f);
      expect(src).toContain('import { MachineGlyph } from "@/components/MachineGlyph";');
      expect(src).toContain("<MachineGlyph");
      // ⚠️ COMMENTS STRIPPED: three of these files explain the robot arm they replaced, and a bare
      // `not.toContain` would fail on its own explanation. Sixth time in this repo.
      expect(strip(src)).not.toContain("precision_manufacturing");
    });
  }

  it("Given the per-FAMILY icon map, Then it is deliberately untouched", () => {
    /**
     * 🔴 `equipmentIcon` is a different thing and is NOT swept: it picks a glyph per machine
     * family (a forklift, a tractor), and it must return a NAME because `MapCanvas` renders it into
     * a Leaflet `divIcon`'s HTML string, where a React component cannot go. So a crane still draws
     * the robot arm on the map and on the public bid form. Reported, not fixed — it needs either a
     * per-family drawing set or a different glyph, and it is a decision about the map.
     */
    expect(read("components/requests/EquipImg.tsx")).toContain("precision_manufacturing");
    /* ⚠️ Its remaining CALLERS are the map surface alone, which is what makes the split
       defensible rather than merely unfinished: a `divIcon` is an HTML string. The ask card
       left that list on 2026-09-22 — it is React and had no reason to be on it. */
    expect(strip(read("components/map/RequestCard.tsx"))).not.toContain("equipmentIcon");
  });
});
