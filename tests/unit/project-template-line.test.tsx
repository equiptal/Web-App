/**
 * ── What a template TYPES into the renter's request ─────────────────────────────────────────────
 *
 * Owner, 2026-09-12, on a request box reading «12 × null» twice: *"still why the equipment name
 * doesn't appear here, why showing null"*.
 *
 * `option.machine` is `ChartItem.label`, and it is genuinely absent for an off-catalogue line: the
 * chart's projection names a request's item from its taxonomy pair alone, and that pair is empty.
 * It was TYPED `string`, so nothing objected; `${null}` in the template literal produced the four
 * characters «null», `trim()` reported them as a perfectly good line, and the typewriter wrote them
 * into the renter's own words — where they went on to the agent as a machine called null.
 *
 * The TERMS still apply. They are what a template is for, and they are keyed on the item, not on its
 * name; only the sentence is withheld, because there is no name to put in it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import React from "react";
import type { ProjectSummary } from "@/lib/contract/project";
import type { TemplateOption } from "@/lib/contract/project-apply";

const rows = vi.hoisted(() => ({ value: [] as ProjectSummary[] }));
const tpls = vi.hoisted(() => ({ value: [] as TemplateOption[] }));
/**
 * ⚠️ **This mock must carry EVERY action `ProjectChips` calls.** `applyTemplate` ends in a bare
 * `catch {}` - a template that fails to apply leaves the renter where he was, deliberately - so a
 * missing function here is not a `TypeError` in the report: the whole template silently does
 * nothing and two unrelated cases fail with «0 calls». That is exactly what `setAgentTyping` did
 * when it landed on 2026-09-13.
 */
const store = vi.hoisted(() => ({
  setText: vi.fn(),
  markProjectTyped: vi.fn(),
  setAgentTyping: vi.fn(),
  useTemplate: vi.fn(),
  selectProject: vi.fn(),
  clearProject: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ useSession: () => ({ user: { id: 70, phone: "+966501234567", tier: "verified" }, status: "authed" }) }));
vi.mock("@/lib/store/rfq-store", () => ({
  useRfq: () => ({ state: { project: { id: "p1" }, templateTerms: null, text: "" }, actions: store }),
}));
vi.mock("@/lib/api/client", () => ({
  listProjects: () => Promise.resolve(rows.value),
  listTemplates: () => Promise.resolve(tpls.value),
  fetchTemplateTerms: () => Promise.resolve({ fuelType: "diesel" }),
}));

const { ProjectChips } = await import("@/components/create/ProjectChips");
const { LocaleProvider } = await import("@/lib/i18n");

const site = (): ProjectSummary =>
  ({
    id: "p1", title: "Wadi Hanifah", location: { label: "Wadi Hanifah, Riyadh", lat: null, lng: null },
    defaults: { timing: { rentalBasis: null, extendable: null, startDate: null, endDate: null }, paymentTerms: null },
    version: 1, awards: { requests: {}, workOrderItems: {}, labels: {}, marks: {} },
    ownerUserId: "70", ownerName: null, createdAt: null, updatedAt: null,
    requestCount: 0, workOrderCount: 0, unitsAwarded: 0, firstStart: null, lastEnd: null,
  }) as unknown as ProjectSummary;

const tpl = (machine: string | null): TemplateOption => ({
  id: "g1", kind: "request", ref: "JTR060995", itemId: "i1", machine, quantity: 12, when: null,
});

/**
 * Pick the template the picker offers, by the label it actually draws.
 *
 * `ProjectChips` labels a row `tpl.machine || tpl.ref`, which is why the DROPDOWN read correctly all
 * along — an unnamed machine falls back to the request's code there — while the line it typed did
 * not. So the row is found by whichever of the two the case under test produces.
 */
async function pickTemplate(label: string) {
  const row = await screen.findByText(label);
  fireEvent.click(row.closest("button") ?? row);
}

beforeEach(() => {
  rows.value = [site()];
  store.setText.mockClear();
  store.markProjectTyped.mockClear();
  store.setAgentTyping.mockClear();
  store.useTemplate.mockClear();
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 26 });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 26 });
  class RO { constructor(private cb: () => void) {} observe() { this.cb(); } disconnect() {} }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
});

afterEach(() => {
  cleanup();
  delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
});

const draw = () => render(<LocaleProvider><ProjectChips /></LocaleProvider>);

describe("a template whose machine has no name", () => {
  it("writes NOTHING into the request box", async () => {
    tpls.value = [tpl(null)];
    draw();
    await pickTemplate("JTR060995");
    await waitFor(() => expect(store.useTemplate).toHaveBeenCalled());
    // The four characters that reached the agent as a machine the renter had asked for.
    for (const call of store.setText.mock.calls) expect(String(call[0])).not.toContain("null");
    expect(store.setText).not.toHaveBeenCalled();
    expect(store.markProjectTyped).not.toHaveBeenCalled();
  });

  it("still applies the TERMS, which are keyed on the item and not on its name", async () => {
    tpls.value = [tpl(null)];
    draw();
    await pickTemplate("JTR060995");
    await waitFor(() => expect(store.useTemplate).toHaveBeenCalled());
  });

  it("writes the line as usual when the machine IS named", async () => {
    tpls.value = [tpl("Crawler Excavator 20 ton")];
    draw();
    await pickTemplate("Crawler Excavator 20 ton");
    await waitFor(() => expect(store.markProjectTyped).toHaveBeenCalledWith("12 × Crawler Excavator 20 ton"));
  });

  it("drops the count when there is only one of it", async () => {
    tpls.value = [{ ...tpl("Tower crane"), quantity: 1 }];
    draw();
    await pickTemplate("Tower crane");
    await waitFor(() => expect(store.markProjectTyped).toHaveBeenCalledWith("Tower crane"));
  });

  it("says the AGENT is writing it, and stops saying so", async () => {
    /**
     * Owner, 2026-09-13: *"make it like this mansour is writing it"*. The words already arrived as
     * typing (2026-08-31); what was missing was WHO. The intake draws him on the box for exactly
     * the length of this flag - see `mansour.test.tsx`.
     */
    tpls.value = [tpl("Tower crane")];
    draw();
    await pickTemplate("Tower crane");
    await waitFor(() => expect(store.setAgentTyping).toHaveBeenCalledWith(true));
    await waitFor(() => expect(store.setAgentTyping).toHaveBeenCalledWith(false), { timeout: 3000 });
  });

  it("does NOT raise him for a template with no machine to write", async () => {
    // Nothing is typed, so nobody is typing. He would appear over a box he never touched.
    tpls.value = [tpl(null)];
    draw();
    await pickTemplate("JTR060995");
    await waitFor(() => expect(store.useTemplate).toHaveBeenCalled());
    /**
     * ⚠️ `not.toHaveBeenCalledWith(true)`, never `not.toHaveBeenCalled()`. The typewriter holds the
     * flag for 900ms AFTER its last character so he is seen reading the line back, and that beat
     * outlives the test that started it: an earlier case's `finally` lands here, past this file's
     * `mockClear`, and the blunt assertion failed on a leak rather than on the rule. What this case
     * is about is the RAISE.
     */
    expect(store.setAgentTyping).not.toHaveBeenCalledWith(true);
  });
});
