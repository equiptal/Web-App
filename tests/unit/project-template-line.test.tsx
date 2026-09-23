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
const reqs = vi.hoisted(() => ({ value: [] as unknown[] }));
/**
 * ⚠️ **This mock must carry EVERY action `RequestsRail` calls.** `applyTemplate` ends in a bare
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
  /* The rail's ROWS come from my-requests; the TERMS behind a press come from the chart. The two
     are joined on the machine's name, which is what these cases are about. */
  fetchMyRequests: () => Promise.resolve({ requests: reqs.value }),
}));

const { RequestsRail, useRequestRail } = await import("@/components/create/RequestsRail");
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
 * Press one machine in the rail, by the name the row draws.
 *
 * ⚠️ An UNNAMED machine reaches the rail as «—» — `itemName` ends
 * `taxonomy || customEquipmentLabel(it) || "—"` — so that is what the row says and what this
 * presses. It is exactly the value that must never be TYPED, which is the point of the first case.
 */
async function pickRow(label: string) {
  /* ⚠️ A project's machines are fetched and listed only once it is OPENED - `listTemplates` is a
     chart read per project, so the rail does not run one for every project on mount. Pressing the
     head is what a renter does too. */
  const head = await screen.findByText("Wadi Hanifah");
  fireEvent.click(head.closest("button") ?? head);
  const row = await screen.findByText(label);
  fireEvent.click(row.closest("button") ?? row);
}

/** One rail row, shaped as `my-requests` sends it. */
const req = (name: string, qty: number) => ({
  id: "r1", projectId: "p1", status: "OPEN",
  item: { name, nameAr: name, qty, imageUrl: null, imageIsPhoto: false, categoryId: null },
});

beforeEach(() => {
  rows.value = [site()];
  store.setText.mockClear();
  store.markProjectTyped.mockClear();
  store.setAgentTyping.mockClear();
  store.useTemplate.mockClear();
  store.selectProject.mockClear();
  reqs.value = [];
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 26 });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 26 });
  class RO { constructor(private cb: () => void) {} observe() { this.cb(); } disconnect() {} }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
});

afterEach(() => {
  cleanup();
  delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
});

/* The rail takes its state from the hook the screen owns, so the harness is what `Intake` does in
   one line: call it once, hand it down. */
function Harness() {
  const rail = useRequestRail();
  return <RequestsRail rail={rail} />;
}

const draw = () => render(<LocaleProvider><Harness /></LocaleProvider>);

describe("a machine the catalogue could not name", () => {
  it("writes NOTHING into the request box", async () => {
    /* — is `itemName`'s last resort, and it is the «12 × null» bug wearing a different character:
       a placeholder at one end and a machine's name by the time it reaches the agent. */
    /* An unnamed machine LISTS by its reference, so the row is still recognisable and pressable -
       and that reference must never reach the box. */
    tpls.value = [tpl(null)];
    draw();
    await pickRow("JTR060995");
    await waitFor(() => expect(store.useTemplate).toHaveBeenCalled());
    for (const call of store.setText.mock.calls) expect(String(call[0])).not.toContain("null");
    expect(store.setText).not.toHaveBeenCalled();
    expect(store.markProjectTyped).not.toHaveBeenCalled();
  });

  it("still applies the TERMS, which are keyed on the machine and not on its name", async () => {
    tpls.value = [tpl("Crawler Excavator 20 ton")];
    draw();
    await pickRow("Crawler Excavator 20 ton");
    await waitFor(() => expect(store.useTemplate).toHaveBeenCalled());
  });

  it("writes the line as usual when the machine IS named", async () => {
    tpls.value = [tpl("Crawler Excavator 20 ton")];
    draw();
    await pickRow("Crawler Excavator 20 ton");
    await waitFor(() => expect(store.markProjectTyped).toHaveBeenCalledWith("12 × Crawler Excavator 20 ton"));
  });

  it("drops the count when there is only one of it", async () => {
    tpls.value = [{ ...tpl("Tower crane"), quantity: 1 }];
    draw();
    await pickRow("Tower crane");
    await waitFor(() => expect(store.markProjectTyped).toHaveBeenCalledWith("Tower crane"));
  });

  it("lists an unnamed machine by its REFERENCE rather than hiding it", async () => {
    /* 🔴 The rows ARE the templates (owner, 2026-09-16: *"the behaviour will not change from
       existing pills just ui"*), so there is no such thing as a row without one and nothing is
       matched. What a nameless machine needs is a label to be pressed by, and the reference is it. */
    tpls.value = [tpl(null)];
    draw();
    const head = await screen.findByText("Wadi Hanifah");
    fireEvent.click(head.closest("button") ?? head);
    expect(await screen.findByText("JTR060995")).toBeTruthy();
  });

  it("says the AGENT is writing it, and stops saying so", async () => {
    /**
     * Owner, 2026-09-13: *"make it like this mansour is writing it"*. The words already arrived as
     * typing (2026-08-31); what was missing was WHO. The intake draws him on the box for exactly
     * the length of this flag — see `mansour.test.tsx`.
     */
    tpls.value = [tpl("Tower crane")];
    draw();
    await pickRow("Tower crane");
    await waitFor(() => expect(store.setAgentTyping).toHaveBeenCalledWith(true));
    await waitFor(() => expect(store.setAgentTyping).toHaveBeenCalledWith(false), { timeout: 3000 });
  });

  it("does NOT raise him for a machine with no name to write", async () => {
    tpls.value = [tpl(null)];
    draw();
    await pickRow("JTR060995");
    await waitFor(() => expect(store.useTemplate).toHaveBeenCalled());
    /**
     * ⚠️ `not.toHaveBeenCalledWith(true)`, never `not.toHaveBeenCalled()`. The typewriter holds the
     * flag for 900ms AFTER its last character so he is seen reading the line back, and that beat
     * outlives the test that started it: an earlier case's `finally` lands here, past this file's
     * `mockClear`, and the blunt assertion failed on a leak rather than on the rule.
     */
    expect(store.setAgentTyping).not.toHaveBeenCalledWith(true);
  });
});
