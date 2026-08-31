import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { AwardDialog } from "@/components/projects/AwardDialog";
import type { ChartGroup } from "@/lib/contract/award";

/**
 * PROJ-AC-15 — who may be awarded (ruled 2026-08-31, see `RULINGS.md` · R-P1).
 *
 * **The gate follows the list.** While `renter-suppliers` does not answer, the dialog falls back to
 * a typed name and registration cannot be required — enforcing it then would block every award on a
 * feature that has not shipped. The moment a list exists, choosing from it means choosing a
 * registered supplier.
 *
 * An unregistered row is rendered DISABLED rather than hidden: a renter hunting for a supplier they
 * have used before needs to find it and read why it cannot be picked, not wonder where it went.
 */

const suppliers = vi.hoisted(() => ({ rows: [] as { id: string; name: string; vendorRegistered: boolean }[] }));

vi.mock("@/lib/api/client", () => ({
  listRenterSuppliers: () => Promise.resolve(suppliers.rows),
}));

const item = {
  id: "m1",
  label: "Excavator 20t",
  quantity: 3,
  awards: [],
} as unknown as ChartGroup["items"][number];

function open() {
  return render(
    <LocaleProvider>
      <AwardDialog open onClose={() => {}} item={item} onSave={() => {}} />
    </LocaleProvider>,
  );
}

describe("who may be awarded", () => {
  beforeEach(() => cleanup());

  it("lets a registered supplier be chosen", async () => {
    suppliers.rows = [{ id: "s1", name: "Zahid Tractor", vendorRegistered: true }];
    open();

    const opt = (await screen.findByRole("option", { name: /Zahid Tractor/ })) as HTMLOptionElement;
    expect(opt.disabled).toBe(false);
  });

  it("shows an unregistered supplier, says so, and refuses it", async () => {
    suppliers.rows = [{ id: "s2", name: "Al-Rajhi", vendorRegistered: false }];
    open();

    const opt = (await screen.findByRole("option", { name: /Al-Rajhi/ })) as HTMLOptionElement;
    // Present, so it can be found — and disabled, so it cannot be picked.
    expect(opt.disabled).toBe(true);
    expect(opt.textContent).toContain(en.projects.award.notRegistered);
  });

  it("requires nothing when there is no list to choose from", async () => {
    /* The registry has not shipped. The dialog falls back to a typed name, and a renter can award
       whoever actually supplied the machine — which is the whole reason AC-15 cannot bind yet. */
    suppliers.rows = [];
    open();

    /* Asserted on the free-text box, not on "no combobox": the dialog has other selects — the rental
       basis for one — and a blanket check would pass or fail for reasons unrelated to suppliers. */
    await waitFor(() => {
      expect(screen.getByPlaceholderText(en.projects.award.supplierPlaceholder)).toBeTruthy();
    });
  });
});

/* ============================================================================================== *
 * The money, which must be the same money the work order asks for
 * ============================================================================================== */

describe("what an award can record", () => {
  beforeEach(() => cleanup());

  /* The chart's Award is the ONLY path to a supplier for a machine whose supplier section was left
     blank on the work order (owner, 2026-08-31). It carried rate but not mobilization or
     demobilization, so the same stored record could hold haulage money through one entry path and
     not the other — and lost it for exactly the case this dialog exists to serve. */

  it("asks for mobilization and demobilization, like the work order does", async () => {
    suppliers.rows = [];
    open();
    await waitFor(() => screen.getByPlaceholderText(en.projects.award.supplierPlaceholder));

    // The work order's own labels, not near-synonyms — one vocabulary for one field.
    expect(screen.getByText(en.projects.award.mobAmount)).toBeTruthy();
    expect(screen.getByText(en.projects.award.demobAmount)).toBeTruthy();
    expect(en.projects.award.mobAmount).toBe(en.projects.workOrder.mobAmount);
    expect(en.projects.award.demobAmount).toBe(en.projects.workOrder.demobAmount);
  });

  it("sends them only when they were filled, and never as zero", async () => {
    suppliers.rows = [];
    const onSave = vi.fn();
    render(
      <LocaleProvider>
        <AwardDialog open onClose={() => {}} item={item} onSave={onSave} />
      </LocaleProvider>,
    );
    const name = await waitFor(() => screen.getByPlaceholderText(en.projects.award.supplierPlaceholder));
    fireEvent.change(name, { target: { value: "Zahid Tractor" } });
    fireEvent.click(screen.getByRole("button", { name: en.projects.award.save }));

    const [lines] = onSave.mock.calls[0];
    /* Absent, not 0. The backend schema is `.partial()`, so an omitted key means "not recorded"
       while 0 would mean "agreed, and free" — a different fact about a supplier. */
    expect("mobilizationAmount" in lines[0]).toBe(false);
    expect("demobilizationAmount" in lines[0]).toBe(false);
  });

  it("totals the line the way the work order totals it", async () => {
    suppliers.rows = [];
    const onSave = vi.fn();
    render(
      <LocaleProvider>
        <AwardDialog open onClose={() => {}} item={item} onSave={onSave} />
      </LocaleProvider>,
    );
    const name = await waitFor(() => screen.getByPlaceholderText(en.projects.award.supplierPlaceholder));
    fireEvent.change(name, { target: { value: "Zahid Tractor" } });

    const boxes = screen.getAllByRole("spinbutton");
    fireEvent.change(boxes[0], { target: { value: "2" } });     // units
    fireEvent.change(boxes[1], { target: { value: "8000" } });  // rate
    fireEvent.change(boxes[2], { target: { value: "1200" } });  // mobilization
    fireEvent.change(boxes[3], { target: { value: "800" } });   // demobilization

    // (8000 + 1200 + 800) × 2 = 20,000 — the work order's own arithmetic, imported not re-typed.
    expect(screen.getByText(/20,000/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: en.projects.award.save }));
    const [lines] = onSave.mock.calls[0];
    expect(lines[0].mobilizationAmount).toBe(1200);
    expect(lines[0].demobilizationAmount).toBe(800);
  });
});
