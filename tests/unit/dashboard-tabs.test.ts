import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The dashboard is three tabs (owner, 2026-09-16: *"for dashboard can we have subtabs to show
 * requests-suppliers-projects or how do u suggest we can show them without scrolling in one page"*,
 * then his pick of the three-tab shape over the side-by-side one).
 *
 * The four rulings that decide whether this works, and every one of them fails SILENTLY — nothing
 * throws and jsdom lays out nothing, so none of it is visible in a render test:
 *
 *  1. Every block stays MOUNTED and the closed ones are hidden. Rendering only the open one would
 *     make two of the three counts unknowable, drop the renter's search box and his half-made group
 *     on every tab switch, and re-run all three reads each time he came back.
 *  2. The count comes UP from the block that already read the list, never from a second fetch here.
 *  3. A block that has not answered yet shows a dash, not a 0. A 0 on a list still loading is a
 *     wrong statement rather than a pending one.
 *  4. The open tab is in the URL, with `replaceState` — so a reload and a Back from a supplier
 *     profile land on the tab the renter left, and the browser's own Back still leaves the page
 *     rather than walking the three tabs. Same ruling as the workspace's (2026-09-06).
 */

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const HUB = read("src/components/home/HomeHub.tsx");

describe("the dashboard's tabs", () => {
  it("names the three views, in the owner's order", () => {
    expect(HUB).toContain('type View = "requests" | "suppliers" | "projects"');
    expect(HUB).toContain('const VIEWS: View[] = ["requests", "suppliers", "projects"]');
  });

  it("keeps all three blocks MOUNTED and hides the two that are closed", () => {
    for (const [block, view] of [
      ["HomeRequests", "requests"],
      ["SuppliersPage", "suppliers"],
      ["ProjectsSurface", "projects"],
    ] as const) {
      expect(HUB, `${block} must still be rendered`).toContain(`<${block} `);
      expect(HUB, `${block}'s pane must hide rather than unmount`).toContain(`view !== "${view}" && "hidden"`);
    }
    // A conditional render is the fault this pins: it would unmount the block and take its count,
    // its filters and its in-flight reads with it.
    expect(HUB).not.toMatch(/view === "(suppliers|projects)" && </);
  });

  it("takes each count from the block that read the list", () => {
    expect(HUB).toContain("onCount={countRequests}");
    expect(HUB).toContain("onCount={countSuppliers}");
    expect(HUB).toContain("onCount={countProjects}");
    for (const file of [
      "src/components/home/HomeRequests.tsx",
      "src/components/suppliers/SuppliersPage.tsx",
      "src/components/projects/ProjectsSurface.tsx",
    ]) {
      expect(read(file), `${file} must report its own count`).toContain("onCount?: (n: number) => void");
    }
  });

  it("shows a dash while a block has not answered, never a 0", () => {
    expect(HUB).toContain("{ requests: null, suppliers: null, projects: null }");
    expect(HUB).toContain('{n ?? "–"}');
    // Each block reports only once it HAS the list; `null` there is "not answered yet".
    expect(read("src/components/suppliers/SuppliersPage.tsx")).toContain("if (rows) onCount?.(rows.length)");
    expect(read("src/components/projects/ProjectsSurface.tsx")).toContain("if (projects) onCount?.(projects.length)");
    expect(read("src/components/home/HomeRequests.tsx")).toContain("if (groups) onCount?.(groups.length)");
  });

  it("puts the open tab in the URL with replaceState, never push", () => {
    expect(HUB).toContain('url.searchParams.set("view", view)');
    // The default is not written: a bare `/` is the requests tab.
    expect(HUB).toContain('if (view !== "requests") url.searchParams.set("view", view)');
    expect(HUB).toContain("window.history.replaceState(");
    expect(HUB).not.toContain("history.pushState(");
  });

  it("lets the tab be the heading, so the section is not named twice", () => {
    for (const [file, block] of [
      ["src/components/home/HomeRequests.tsx", "HomeRequests"],
      ["src/components/suppliers/SuppliersPage.tsx", "SuppliersPage"],
      ["src/components/projects/ProjectsSurface.tsx", "ProjectsSurface"],
    ] as const) {
      expect(read(file), `${block} must be able to drop its own plate and title`).toContain("hideHeading");
    }
    expect(HUB).toContain("<HomeRequests hideHeading");
    expect(HUB).toContain("<SuppliersPage embedded hideHeading");
    expect(HUB).toContain("<ProjectsSurface embedded hideHeading");
  });

  it("says something in the Requests pane when there are no requests", () => {
    // `HomeRequests` renders NOTHING on an empty account (`if (groups && !groups.length) return null`),
    // which behind a tab is a blank pane rather than a block that simply is not there.
    expect(HUB).toContain("counts.requests === 0");
    expect(HUB).toContain("t.home.noRequestsYet");
    for (const d of ["src/lib/i18n/en.ts", "src/lib/i18n/ar.ts"]) {
      expect(read(d), `${d} must carry the empty line`).toContain("noRequestsYet:");
    }
  });
});
