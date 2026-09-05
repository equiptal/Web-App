import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * One gap between the dashboard's blocks (owner, 2026-09-05: *"use consistent spacing between
 * sections in the dashboard"*).
 *
 * It was not one gap. `My Suppliers` and `My Projects` each carried `pb-24` on their embedded root,
 * written when each was the LAST block on the page — so whichever one ended up in the middle put 96px
 * of its own padding on top of the hub's 28px `gap-7`, and the dashboard had a hole in it between two
 * sections and normal spacing between the rest.
 *
 * The rule this pins: an embedded block owns the space INSIDE it, the page owns the space between and
 * after. It is asserted against the source because it fails silently — nothing throws, nothing looks
 * broken in a unit test, and it only shows up as a gap on a screenshot.
 */

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
/** The className strings only — the files discuss `pb-24` in their comments, which is not a class. */
const classNames = (src: string): string[] =>
  [...src.matchAll(/className=(?:"([^"]*)"|\{[^}]*?"([^"]*)"[^}]*\})/g)].map((m) => m[1] ?? m[2] ?? "");

describe("the dashboard's own spacing", () => {
  it("keeps ONE gap between the blocks, on the hub", () => {
    const hub = read("src/components/home/HomeHub.tsx");
    const root = classNames(hub).find((c) => c.includes("flex-col"));
    expect(root).toContain("gap-7");
    // The foot of the page belongs to the page: the chat dock floats over that corner, and a page
    // ending on its last row reads as truncated.
    expect(root).toContain("pb-24");
  });

  it("gives no embedded block a bottom padding of its own", () => {
    for (const file of [
      "src/components/projects/ProjectsSurface.tsx",
      "src/components/suppliers/SuppliersPage.tsx",
    ]) {
      const offenders = classNames(read(file)).filter((c) => /(^|\s)pb-(1[0-9]|2[0-9]|3[0-9])(\s|$)/.test(c));
      expect(offenders, `${file} should leave the page's bottom room to the page`).toEqual([]);
    }
  });

  it("still draws the blocks in the order the owner asked for", () => {
    // Suppliers above projects (owner, 2026-09-04) — the list he acts on, then the sites.
    const hub = read("src/components/home/HomeHub.tsx");
    expect(hub.indexOf("<SuppliersPage embedded />")).toBeGreaterThan(-1);
    expect(hub.indexOf("<SuppliersPage embedded />")).toBeLessThan(hub.indexOf("<ProjectsSurface embedded />"));
  });
});
