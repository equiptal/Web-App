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
    stubLayout({ overflowing: true });
    draw();
    const open = await screen.findByText(`${en.projects.chips.all} (11)`);
    fireEvent.click(open.closest("button")!);
    // The same control, now offering the way back — nothing navigated and no dialog opened.
    expect(screen.getByText(en.projects.chips.fewer)).toBeTruthy();
    expect(screen.queryByText(`${en.projects.chips.all} (11)`)).toBeNull();
  });

  it("draws no toggle at all when two rows already hold every site", async () => {
    stubLayout({ overflowing: false });
    draw();
    expect(await screen.findByText("Site 1")).toBeTruthy();
    expect(screen.queryByText(new RegExp(en.projects.chips.all))).toBeNull();
  });

  it("still hands a caller's own picker the press, when one is given", async () => {
    stubLayout({ overflowing: true });
    const browse = vi.fn();
    draw({ onBrowseAll: browse });
    const open = await screen.findByText(`${en.projects.chips.all} (11)`);
    fireEvent.click(open.closest("button")!);
    expect(browse).toHaveBeenCalledTimes(1);
    // And it does NOT expand: that caller owns the surface.
    expect(screen.queryByText(en.projects.chips.fewer)).toBeNull();
  });
});

describe("the sentence beside the pills", () => {
  /**
   * 🔴 Owner, 2026-09-13, on «اختر مشروعاً»: *"this is only shown when user have projects"*.
   *
   * It was a `<span>` in `Intake`, drawn unconditionally, while this component returns `null` for a
   * renter with no sites - so the first screen a renter meets asked a question with no answers
   * anywhere near it. The `lead` slot puts both behind the same guard.
   */
  it("Given sites, Then the lead is drawn ahead of the strip", async () => {
    rows.value = [site(1), site(2)];
    render(
      <LocaleProvider>
        <ProjectChips lead={<span>PICK A PROJECT</span>} />
      </LocaleProvider>,
    );
    const lead = await screen.findByText("PICK A PROJECT");
    const chip = await screen.findByText("Site 1");
    expect(lead).toBeTruthy();
    // ⚠️ Before them in the DOM, which is what puts it before them on the row.
    // eslint-disable-next-line no-bitwise
    expect(lead.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Given NO sites, Then the lead is not drawn either", async () => {
    // 🔴 The whole point: no answers, so no question.
    rows.value = [];
    render(
      <LocaleProvider>
        <ProjectChips lead={<span>PICK A PROJECT</span>} />
      </LocaleProvider>,
    );
    // ⚠️ The component returns `null` synchronously for an empty list, so there is nothing to
    // wait for: a `findBy*` here would pass by timing out on the thing it is meant to assert.
    expect(screen.queryByText("PICK A PROJECT")).toBeNull();
  });
});
