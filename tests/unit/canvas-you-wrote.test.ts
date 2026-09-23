import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The canvas's «YOU WROTE» card: when it is drawn, and what colour it is.
 *
 * Owner, 2026-09-13, on a screenshot of a direct request showing the card with a bare em dash in
 * it: *"remove the below one when direct request as no input, and also use the above colour in the
 * intake card below in case of broadcast"* — «the above» being the direct ribbon that sits over it,
 * which is the brand orange.
 *
 * ⚠️ These read the SOURCE. Both facts are layout rulings — whether an element exists, and which
 * tone it carries — and jsdom neither lays out nor resolves a Tailwind class, so a render test
 * would mount the whole create flow to assert something it still could not see.
 */

const SRC = resolve(__dirname, "../../src");
const canvas = readFileSync(resolve(SRC, "components/create/Canvas.tsx"), "utf8");
const surface = readFileSync(resolve(SRC, "components/CreateSurface.tsx"), "utf8");

/** The card's own block, from its opening guard to the end of its container. */
const card = canvas.slice(canvas.indexOf("{!(state.direct && !state.text"), canvas.indexOf("{/* Which machine, when"));

describe("a direct request with no words does not draw it", () => {
  it("Given the card, Then it is gated on there being something he wrote", () => {
    /**
     * 🔴 A direct request is seeded from the machine he PRESSED in a store, so `state.text` is
     * empty and the card drew «YOU WROTE» over a dash: a heading for a quote that does not exist,
     * beside an «Edit» whose whole job is to walk back to the typing box.
     */
    expect(canvas).toContain("{!(state.direct && !state.text?.trim()) && (");
  });

  it("Given a direct request that DID arrive with words, Then the card still draws", () => {
    /**
     * ⚠️ The test is the WORDS, not the mode. `?prefill=` can seed a direct request's text, and
     * then there IS something to check against what we read — which is the only thing this card is
     * for. Gating on `state.direct` alone would hide it exactly when it starts being useful.
     */
    expect(canvas).not.toContain("{!state.direct && (");
    expect(card).toContain("state.text ?");
  });

  it("Given the removal, Then Start over is named as going with it", () => {
    /**
     * 🔴 This card is the canvas's ONLY «Start over», so hiding it takes that control off the
     * direct path. Deliberate and not replaced — Back walks the flow out, and the ✕ on a direct
     * tab is a trip to the store — but a control that disappears has to be written down, or the
     * next reader restores the card to get it back.
     */
    expect(canvas).toContain("Start over` goes with it on that path");
  });
});

describe("the card wears the ribbon's orange", () => {
  it("Given the card, Then it carries the same tone as the direct banner above it", () => {
    // The ribbon in `CreateSurface` is what the owner pointed at; the card now matches it.
    expect(surface).toContain("border-brand/35 bg-brand-soft");
    expect(card).toContain("border-brand/35 bg-brand-soft");
    expect(card).toContain("bg-brand/15");
  });

  it("Given the card, Then no mustard survives on it", () => {
    /**
     * 🔴 It was `--warn`, which this palette serves as a MUSTARD (#b98a1d) and not an orange —
     * the same mismatch the canvas's provenance ring was corrected for on 2026-09-08. One orange
     * on this screen now, whatever sits above it.
     */
    expect(card).not.toContain("text-warn");
    expect(card).not.toContain("bg-warn");
    expect(card).not.toContain("border-warn");
    expect(card).not.toContain("decoration-warn");
  });

  it("Given the words on it, Then they are brand-DEEP, never brand", () => {
    /**
     * ⚠️ Orange text on a light ground has to be the dark one (#c2570f) to pass AA; the brand
     * orange is a FILL. The tile and the border keep `brand` because those are a fill and an edge.
     * Same ruling as 2026-09-08, and the reason that ruling exists at all.
     */
    expect(card).toContain("text-brand-deep");
    expect(card).not.toMatch(/text-brand(?![-a-z])/);
  });
});
