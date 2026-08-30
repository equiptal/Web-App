import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
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
