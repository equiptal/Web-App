// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";

/**
 * *My suppliers* — picking rows, and what may be done to them.
 *
 * Owner, 2026-09-08: *"Remove «share a request» option, show option to remove that will open select
 * like create group behaviour, but for both make the selection smooth on row select, not exact tick
 * place. Also make the header as footer of the table and make the font bold here, and make the top
 * select all clear, like add text «all» beside the tick box."*
 *
 * ⚠️ These drive the real page against a stubbed client. What is under test is the picking model —
 * one mode, two jobs — and the removal it now carries.
 */

const api = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  removed: [] as string[],
  /** Ids that must fail, so a partial batch can be described. */
  refuse: [] as string[],
}));

vi.mock("@/lib/api/client", () => ({
  ApiError: class extends Error {},
  listRenterSuppliers: () => Promise.resolve(api.rows),
  removeRenterSupplier: (id: string) => {
    if (api.refuse.includes(id)) return Promise.reject(new Error("no"));
    api.removed.push(id);
    return Promise.resolve(true);
  },
  updateRenterSupplier: () => Promise.resolve({}),
  renameSupplierGroup: () => Promise.resolve({}),
  deleteSupplierGroup: () => Promise.resolve({}),
  listProjects: () => Promise.resolve([]),
  fetchSuggestedSuppliers: () => Promise.resolve([]),
  listSupplierSuggestions: () => Promise.resolve([]),
  getRenterSupplier: () => Promise.resolve(api.rows[0]),
  listSupplierSends: () => Promise.resolve([]),
  fetchBidCompanyDocuments: () => Promise.resolve(null),
  dismissSupplierSuggestion: () => Promise.resolve({}),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const { SuppliersPage } = await import("@/components/suppliers/SuppliersPage");

const c = en.suppliers;

beforeEach(() => {
  api.removed = [];
  api.refuse = [];
  api.rows = [
    { id: "1", name: "Al Faisal Rentals", email: "ops@alfaisal.sa", phone: "0503372850", vendorRegistered: false },
    { id: "2", name: "Najd Equipment Est.", email: null, phone: "+966 50-555-6677", vendorRegistered: false },
    { id: "3", name: "Hail Heavy Transport", email: null, phone: null, vendorRegistered: false },
  ];
});
afterEach(cleanup);

const draw = () =>
  render(
    <LocaleProvider initialLocale="en">
      <SuppliersPage />
    </LocaleProvider>,
  );

/** Enter the removal picking mode, the way the renter does. */
const startRemoving = async () => {
  draw();
  await screen.findByText("Al Faisal Rentals");
  fireEvent.click(screen.getByText(c.removeAction).closest("button")!);
  await waitFor(() => expect(screen.getByText(c.pickToRemove)).toBeTruthy());
};

const rowFor = (name: string) => screen.getByText(name).closest("tr")!;

/** The footer bar, found by what makes it a footer rather than by a label that changes. */
const bar = () => document.querySelector<HTMLElement>("div.sticky.bottom-0")!;
const barRemove = () =>
  [...bar().querySelectorAll("button")].find((b) => b.textContent?.includes(c.removeAction))!;

describe("the share door is gone from this screen", () => {
  it("Given the toolbar, Then there is no «Share a request» button", async () => {
    /**
     * 🔴 It opened the whole share panel — request picker, channel row, message preview — from a
     * screen about PEOPLE. The door from the request itself is the one that matches what the renter
     * is thinking about, and it is untouched: this removes a second entrance, not the feature.
     */
    draw();
    await screen.findByText("Al Faisal Rentals");
    expect(screen.queryByText("Share a request")).toBeNull();
  });
});

describe("picking rows", () => {
  it("Given picking, Then a press ANYWHERE on the row selects it", async () => {
    /**
     * 🔴 **The checkbox is a 14px target in a 44px row** (owner, 2026-09-08: *"make the selection
     * smooth on row select, not exact tick place"*). Ticking six suppliers was six small aims — and
     * the row's own click did something else entirely, opening the profile over the list he was
     * picking from.
     */
    await startRemoving();

    fireEvent.click(within(rowFor("Al Faisal Rentals")).getByText("Al Faisal Rentals"));

    await waitFor(() => expect(screen.getByText(fmt1(c.nSelectedToRemove, 1))).toBeTruthy());
    // The row's own checkbox mirrors it, which is what a reader and a screen reader both go by.
    expect((within(rowFor("Al Faisal Rentals")).getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  });

  it("Given a second press on the same row, Then it comes back out", async () => {
    await startRemoving();
    const row = rowFor("Najd Equipment Est.");

    fireEvent.click(within(row).getByText("Najd Equipment Est."));
    await waitFor(() => expect(screen.getByText(fmt1(c.nSelectedToRemove, 1))).toBeTruthy());

    fireEvent.click(within(row).getByText("Najd Equipment Est."));
    await waitFor(() => expect(screen.getByText(c.pickToRemove)).toBeTruthy());
  });

  it("Given NOT picking, Then a row press still opens the profile", async () => {
    // ⚠️ The row has one job at a time. Conflating the two is what made picking open dialogs.
    draw();
    await screen.findByText("Al Faisal Rentals");

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    fireEvent.click(screen.getByText("Al Faisal Rentals"));

    // ⚠️ The profile, which is what the row press has always done and still does.
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeTruthy());
  });

  it("Given the header tick, Then it says «All» beside it", async () => {
    /**
     * ⚠️ A lone checkbox in a header row is the one control on this table whose job cannot be
     * guessed: it sits where a column heading goes, so it reads as a heading rather than a switch.
     */
    await startRemoving();
    const head = document.querySelector("thead")!;
    expect(within(head).getByText(c.all)).toBeTruthy();

    fireEvent.click(within(head).getByRole("checkbox"));
    await waitFor(() => expect(screen.getByText(fmt1(c.nSelectedToRemove, 3))).toBeTruthy());
  });
});

describe("the bar is the table's footer", () => {
  it("Given picking, Then the bar is drawn AFTER the table, not before it", async () => {
    /**
     * ⚠️ It stood between the toolbar and the column headings, so a renter scrolling a long list
     * lost the count and both buttons the moment he started picking — the rows he was ticking pushed
     * the one control that finishes the job off the top of the screen.
     */
    await startRemoving();

    const table = document.querySelector("table")!;
    // eslint-disable-next-line no-bitwise
    expect(table.compareDocumentPosition(bar()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bar().className).toContain("sticky");
    expect(bar().className).toContain("bottom-0");
  });
});

describe("removing suppliers", () => {
  it("Given a confirmed removal, Then every picked row is removed and named first", async () => {
    // 🔴 A delete has no undo, so the names are on screen once more before it runs.
    await startRemoving();
    fireEvent.click(within(rowFor("Al Faisal Rentals")).getByText("Al Faisal Rentals"));
    fireEvent.click(within(rowFor("Najd Equipment Est.")).getByText("Najd Equipment Est."));

    fireEvent.click(barRemove());
    await waitFor(() => expect(screen.getByText(c.removeTitle)).toBeTruthy());
    // Named, not counted.
    expect(screen.getByText(c.removeBody)).toBeTruthy();

    fireEvent.click(screen.getByText(fmt1(c.removeConfirmMany, 2)).closest("button")!);

    await waitFor(() => expect(api.removed.sort()).toEqual(["1", "2"]));
  });

  it("Given Cancel on the confirmation, Then nothing is removed", async () => {
    await startRemoving();
    fireEvent.click(within(rowFor("Al Faisal Rentals")).getByText("Al Faisal Rentals"));
    fireEvent.click(barRemove());
    await waitFor(() => expect(screen.getByText(c.removeTitle)).toBeTruthy());

    fireEvent.click(screen.getAllByText(en.common.cancel).at(-1)!.closest("button")!);

    await waitFor(() => expect(screen.queryByText(c.removeTitle)).toBeNull());
    expect(api.removed).toHaveLength(0);
  });

  it("Given one row refuses, Then the count that DID go is reported rather than a blanket failure", async () => {
    /**
     * 🔴 `Promise.all` rejects on the first failure and throws away what the others answered, so a
     * batch where one row 404s said «that did not save» about nine removals that did.
     */
    api.refuse = ["2"];
    await startRemoving();
    fireEvent.click(within(rowFor("Al Faisal Rentals")).getByText("Al Faisal Rentals"));
    fireEvent.click(within(rowFor("Najd Equipment Est.")).getByText("Najd Equipment Est."));
    fireEvent.click(barRemove());
    await waitFor(() => expect(screen.getByText(c.removeTitle)).toBeTruthy());
    fireEvent.click(screen.getByText(fmt1(c.removeConfirmMany, 2)).closest("button")!);

    await waitFor(() => expect(api.removed).toEqual(["1"]));
    await waitFor(() =>
      expect(screen.getByText(c.removedSome.replace("{n}", "1").replace("{failed}", "1"))).toBeTruthy(),
    );
  });
});

describe("the phone column", () => {
  it("Given a stored number in any spelling, Then the cell prints it in E.164", async () => {
    /**
     * 🔴 **Normalised on the way OUT, not only on the way in** (owner, 2026-09-08: *"some numbers in
     * Excel still show weird values, not normalized"*). The import preview fixed everything sent
     * AFTER it and nothing already stored: `phone` on an own row is what the renter typed, so three
     * spellings of one number sat in a column he scans down.
     */
    draw();
    await screen.findByText("Al Faisal Rentals");

    expect(screen.getByText("+966503372850")).toBeTruthy();
    expect(screen.getByText("+966505556677")).toBeTruthy();
    expect(screen.queryByText("0503372850")).toBeNull();
  });
});

/** `{n}` is the only placeholder these strings carry. */
function fmt1(s: string, n: number) {
  return s.replace("{n}", String(n));
}
