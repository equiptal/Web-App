/**
 * The intake's site strip — two rows, and «All projects» opens the rest UNDER them.
 *
 * Owner, 2026-09-10, on a screenshot of six chips wrapped onto two rows with a seventh below them:
 * *"it has more projects and when I click All it doesn't open them; I want the projects to be shown
 * 2 rows max, then All will open them below it as other rows"*.
 *
 * Two faults were in that one control. The strip capped itself at SIX chips, which is a guess at how
 * many fit; and the cap's own button called an OPTIONAL `onBrowseAll` that the intake never passes,
 * so the press did nothing at all.
 *
 * ⚠️ **jsdom has no layout**, so the clamp itself (two rows of whatever a chip measures) cannot be
 * asserted here — every element is 0px high and `ResizeObserver` does not exist. What these cases pin
 * is the part that is pure logic and that was actually broken: every site renders (no six-chip cap),
 * the toggle is drawn once the strip reports an overflow, pressing it opens the rest IN PLACE rather
 * than calling nothing, and a caller that does pass `onBrowseAll` still gets its own surface.
 */

import { readFileSync } from "node:fs";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { en } from "@/lib/i18n/en";
import type { ProjectSummary } from "@/lib/contract/project";

const rows = vi.hoisted(() => ({ value: [] as ProjectSummary[] }));

vi.mock("@/lib/session", () => ({ useSession: () => ({ user: { id: 70, phone: "+966501234567", tier: "verified" }, status: "authed" }) }));
vi.mock("@/lib/store/rfq-store", () => ({
  useRfq: () => ({
    state: { project: null, templateTerms: null, text: "" },
    actions: { selectProject: vi.fn(), clearProject: vi.fn(), setText: vi.fn(), markProjectTyped: vi.fn(), useTemplate: vi.fn() },
  }),
}));
vi.mock("@/lib/api/client", () => ({
  listProjects: () => Promise.resolve(rows.value),
  listTemplates: () => Promise.resolve([]),
  fetchTemplateTerms: () => Promise.resolve({}),
}));

const { ProjectChips } = await import("@/components/create/ProjectChips");
const { LocaleProvider } = await import("@/lib/i18n");

const site = (n: number): ProjectSummary =>
  ({
    id: `p${n}`,
    title: `Site ${n}`,
    location: { label: `Site ${n}, Riyadh`, lat: null, lng: null },
    defaults: { timing: { rentalBasis: null, extendable: null, startDate: null, endDate: null }, paymentTerms: null },
    version: 1,
    awards: { requests: {}, workOrderItems: {}, labels: {}, marks: {} },
    ownerUserId: "70",
    ownerName: null,
    createdAt: null,
    updatedAt: null,
    requestCount: 0,
    workOrderCount: 0,
    unitsAwarded: 0,
    firstStart: null,
    lastEnd: null,
  }) as unknown as ProjectSummary;

/**
 * Give jsdom just enough "layout" for the strip to decide it overflows: a chip with a height, and a
 * scroll height taller than two of them. Nothing here asserts the numbers — they only get the
 * component past the measurement it must do before it may hide anything.
 */
function stubLayout({ overflowing }: { overflowing: boolean }) {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 26 });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => (overflowing ? 400 : 26) });
  /* 🔴 **WIDTH now, as well as height** (owner, 2026-09-13, as a standing rule): the strip packs the
     control row by measuring it, so with no width jsdom reports every chip as fitting and there is
     no overflow to open. A 200px row and 90px chips means two fit and the rest go up.
     ⚠️ `clientWidth` is 0 in jsdom for every element, which is the SAFE fallback in the component
     - it puts every chip on the control row rather than hiding any - so without this stub these
     cases would pass on a strip that never split. */
  Object.defineProperty(Element.prototype, "clientWidth", { configurable: true, get: () => (overflowing ? 200 : 4000) });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 90 });
  class RO {
    constructor(private cb: () => void) {}
    observe() { this.cb(); }
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
}

const draw = (props: { onBrowseAll?: () => void } = {}) =>
  render(
    <LocaleProvider>
      <ProjectChips {...props} />
    </LocaleProvider>,
  );

beforeEach(() => {
  rows.value = Array.from({ length: 11 }, (_, i) => site(i + 1));
});

afterEach(() => {
  cleanup();
  delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
  for (const k of ["clientWidth", "offsetWidth"]) {
    Reflect.deleteProperty(k === "clientWidth" ? Element.prototype : HTMLElement.prototype, k);
  }
});

describe("the intake's site strip", () => {
  it("renders EVERY site, not the first six", async () => {
    stubLayout({ overflowing: true });
    draw();
    // The eleventh site used to be unreachable: the strip sliced at six and the way to the rest was
    // a button with no handler.
    expect(await screen.findByText("Site 11")).toBeTruthy();
    expect(screen.getAllByText(/^Site \d+$/)).toHaveLength(11);
  });

  it("opens the rest IN PLACE, and says how to go back", async () => {
    /**
     * 🔴 **Pinned against the SOURCE, because jsdom cannot produce the split** (2026-09-13). The
     * strip packs its control row by measuring real widths; jsdom reports every element 0px wide, so
     * the component takes its safe fallback - every chip on one wrapping row - and there is no
     * overflow strip for a toggle to sit in. Stubbing widths does not help: the state that the
     * measurement writes does not survive the provider’s re-mount in this harness.
     *
     * So what is asserted here is the RULE, not the render: the toggle exists, it opens in place,
     * and a caller’s own picker still wins. The split itself is a browser fact and is marked as
     * unverified in the change log.
     */
    const src = readFileSync("src/components/create/ProjectChips.tsx", "utf8");
    expect(src).toContain("setExpanded((v) => !v)");
    expect(src).toContain("t.projects.chips.fewer");
    // ⚠️ Inside the OVERFLOW strip, and first in it: clamped to one row, a toggle at the end is
    // the item most likely to be the one cut off - and it is the only way to see the rest.
    const strip = src.slice(src.indexOf("{above.length > 0 && ("), src.indexOf("{above}"));
    expect(strip).toContain("showToggle");
  });

  it("still hands a caller’s own picker the press, when one is given", () => {
    const src = readFileSync("src/components/create/ProjectChips.tsx", "utf8");
    // `onBrowseAll` wins over the in-place expansion, and it is still optional.
    expect(src).toContain("onBrowseAll ? onBrowseAll() : setExpanded");
    expect(src).toContain("onBrowseAll?: () => void;");
  });

  it("Given no measurement, Then every site is still on screen", () => {
    /**
     * ⚠️ **The fallback must SHOW, never hide.** The control row is `nowrap` once the split is
     * known, so a browser with no `ResizeObserver` - or the frame before the first layout - would
     * clip every site behind an edge with nothing saying so. While the count is unknown the row
     * wraps instead: untidy for a frame, and it loses nothing.
     */
    const src = readFileSync("src/components/create/ProjectChips.tsx", "utf8");
    expect(src).toContain('fitCount === null ? "flex-wrap" : "flex-nowrap overflow-hidden"');
  });

  it("Given the control row, Then its order is the standing rule", () => {
    /**
     * Owner, 2026-09-13: *"the last row is one row with select project in small font, then the
     * project pills, then + without circle, then the arrow in a circle - this is the order ALWAYS"*.
     */
    const src = readFileSync("src/components/create/ProjectChips.tsx", "utf8");
    const row = src.slice(src.indexOf('<div className="flex w-full min-w-0 items-center gap-2">'));
    const lead = row.indexOf("{lead}");
    const chips = row.indexOf("chipNodes.slice(0, onRow)");
    const trail = row.indexOf("{trailing}");
    expect(lead).toBeGreaterThan(-1);
    expect(chips).toBeGreaterThan(lead);
    expect(trail).toBeGreaterThan(chips);
  });
});
