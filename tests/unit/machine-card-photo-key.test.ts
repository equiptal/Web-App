import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **The machine photograph follows the tab** (owner, 2026-10-13). One `<img>` served every equipment
 * tab, and a browser keeps the old picture on screen until the new `src` loads, so the first
 * machine's ~4 MB photograph stayed on the next ones. Keying the element by its URL replaces it.
 */
const card = readFileSync("src/components/create/MachineCard.tsx", "utf8");

describe("the machine card's photograph", () => {
  it("is a new element for each URL", () => {
    expect(card).toMatch(/key=\{photo\}\s+src=\{photo\}/);
  });
});
