import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { AwardDialog } from "@/components/projects/AwardDialog";
import type { ChartGroup } from "@/lib/contract/award";

/**
 * PROJ-AC-15 · SUP-T18 — who may be awarded.
 *
 * **An award carries a supplier ROW.** There is no typed-name branch: a free-text supplier is a firm
 * nothing can be looked up against, so its bids, its papers and its history would all belong to a
 * string. That branch existed only while the registry did not.
 *
 * **The vendor flag does not gate it** (owner, 2026-09-01). It used to — an unregistered row was
 * shown and disabled — but the list itself is the gate: every row on it is a firm the renter put
 * there. A supplier who bid through a shared link arrives unregistered, and the old rule made him
 * findable and unpickable for a reason the renter had not been told at the moment he needed it. The
 * flag is still SHOWN beside the name, because it is his label and he keeps it.
 */

const suppliers = vi.hoisted(() => ({ rows: [] as { id: string; name: string; vendorRegistered: boolean }[] }));

vi.mock("@/lib/api/client", () => ({
  listRenterSuppliers: () => Promise.resolve(suppliers.rows),
  // The add dialog opens over this one; it is never submitted here, but its imports must resolve.
  addRenterSuppliersBulk: () => Promise.resolve({ created: [], merged: [], rejected: [] }),
}));

const item = {
  id: "m1",
  label: "Excavator 20t",
  quantity: 3,
  awards: [],
} as unknown as ChartGroup["items"][number];

function open(onSave: (lines: unknown[]) => void = () => {}) {
  return render(
    <LocaleProvider>
      <AwardDialog open onClose={() => {}} item={item} onSave={onSave} />
    </LocaleProvider>,
  );
}

/* The list is the house `Dropdown`, not a native `select` (owner, 2026-08-31: one dropdown across the
   product), so its rows exist only while it is open — a native select keeps its `<option>`s in the
   DOM whether or not the menu is showing. */
const openSupplierList = async () => {
  const trigger = await screen.findByRole("combobox", { name: en.projects.award.supplier });
  fireEvent.click(trigger);
};

/** Pick a supplier by name, which is the only way to name one now. */
const pick = async (name: RegExp) => {
  await openSupplierList();
  fireEvent.click(await screen.findByRole("option", { name }));
};

describe("who may be awarded", () => {
  beforeEach(() => cleanup());

  it("Given a registered supplier, When the list opens, Then they can be chosen", async () => {
    suppliers.rows = [{ id: "s1", name: "Zahid Tractor", vendorRegistered: true }];
    open();
    await openSupplierList();

    const opt = (await screen.findByRole("option", { name: /Zahid Tractor/ })) as HTMLButtonElement;
    expect(opt.disabled).toBe(false);
  });

  it("Given an unregistered supplier, When the list opens, Then it says so and still lets them be picked", async () => {
    suppliers.rows = [{ id: "s2", name: "Al-Rajhi", vendorRegistered: false }];
    open();
    await openSupplierList();

    const opt = (await screen.findByRole("option", { name: /Al-Rajhi/ })) as HTMLButtonElement;
    // The label is information, not a refusal — the renter knows which of his firms he has registered
    // without the picker deciding what he may do about it.
    expect(opt.textContent).toContain(en.projects.award.notRegistered);
    expect(opt.disabled).toBe(false);
  });

  it("Given an empty list, When the dialog opens, Then it offers Add a supplier and no free-text box", async () => {
    suppliers.rows = [];
    open();

    await waitFor(() => {
      expect(screen.getByText(en.projects.award.noSuppliers)).toBeTruthy();
    });
    expect(screen.getAllByRole("button", { name: en.projects.award.addSupplier }).length).toBeGreaterThan(0);
    // The typed-name branch is gone: an award without a row is not an award.
    expect(screen.queryByPlaceholderText(en.projects.award.supplierPlaceholder)).toBeNull();
  });

  it("Given no supplier chosen, When Save is read, Then it is refused", async () => {
    suppliers.rows = [{ id: "s1", name: "Zahid Tractor", vendorRegistered: true }];
    open();

    const save = (await screen.findByRole("button", { name: en.projects.award.save })) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it("Given a supplier is chosen, When saved, Then the award carries the id and the name as a snapshot", async () => {
    suppliers.rows = [{ id: "s1", name: "Zahid Tractor", vendorRegistered: true }];
    const onSave = vi.fn();
    open(onSave);
    await pick(/Zahid Tractor/);

    fireEvent.click(screen.getByRole("button", { name: en.projects.award.save }));
    const [lines] = onSave.mock.calls[0];
    expect(lines[0].supplierId).toBe("s1");
    // Kept beside the id as what the firm was called that day — never a lookup key again.
    expect(lines[0].supplierName).toBe("Zahid Tractor");
  });
});

/* ============================================================================================== *
 * The money, which must be the same money the work order asks for
 * ============================================================================================== */

describe("what an award can record", () => {
  beforeEach(() => {
    cleanup();
    suppliers.rows = [{ id: "s1", name: "Zahid Tractor", vendorRegistered: true }];
  });

  /* The chart's Award is the ONLY path to a supplier for a machine whose supplier section was left
     blank on the work order (owner, 2026-08-31). It carried rate but not mobilization or
     demobilization, so the same stored record could hold haulage money through one entry path and
     not the other — and lost it for exactly the case this dialog exists to serve. */

  it("asks for mobilization and demobilization, like the work order does", async () => {
    open();
    await screen.findByRole("combobox", { name: en.projects.award.supplier });

    // The work order's own labels, not near-synonyms — one vocabulary for one field.
    expect(screen.getByText(en.projects.award.mobAmount)).toBeTruthy();
    expect(screen.getByText(en.projects.award.demobAmount)).toBeTruthy();
    expect(en.projects.award.mobAmount).toBe(en.projects.workOrder.mobAmount);
    expect(en.projects.award.demobAmount).toBe(en.projects.workOrder.demobAmount);
  });

  it("sends them only when they were filled, and never as zero", async () => {
    const onSave = vi.fn();
    open(onSave);
    await pick(/Zahid Tractor/);

    fireEvent.click(screen.getByRole("button", { name: en.projects.award.save }));

    const [lines] = onSave.mock.calls[0];
    /* Absent, not 0. The backend schema is `.partial()`, so an omitted key means "not recorded"
       while 0 would mean "agreed, and free" — a different fact about a supplier. */
    expect("mobilizationAmount" in lines[0]).toBe(false);
    expect("demobilizationAmount" in lines[0]).toBe(false);
  });

  it("totals the line the way the work order totals it", async () => {
    const onSave = vi.fn();
    open(onSave);
    await pick(/Zahid Tractor/);

    const boxes = screen.getAllByRole("spinbutton");
    fireEvent.change(boxes[0], { target: { value: "2" } }); // units
    fireEvent.change(boxes[1], { target: { value: "8000" } }); // rate
    fireEvent.change(boxes[2], { target: { value: "1200" } }); // mobilization
    fireEvent.change(boxes[3], { target: { value: "800" } }); // demobilization

    // (8000 + 1200 + 800) × 2 = 20,000 — the work order's own arithmetic, imported not re-typed.
    expect(screen.getByText(/20,000/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: en.projects.award.save }));
    const [lines] = onSave.mock.calls[0];
    expect(lines[0].mobilizationAmount).toBe(1200);
    expect(lines[0].demobilizationAmount).toBe(800);
  });
});
