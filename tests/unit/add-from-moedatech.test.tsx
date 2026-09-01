import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { AddFromMoedatechPanel } from "@/components/suppliers/AddFromMoedatechPanel";

/**
 * SUP-T14 — adding a supplier who already has a Moedatech account.
 *
 * It reads the DIRECTORY (`GET /agents/suppliers`), not the shopfront list. That is the whole point:
 * a firm with no store is still a firm, and the renter who cannot find one here types it in by hand,
 * which makes a second row for a company that already has an account — and every match after that
 * runs against the wrong record.
 *
 * The link carries the SUPPLIER's id. Linking a store id would attach the renter to a shopfront, and
 * nothing downstream would ever match it.
 */

const api = vi.hoisted(() => ({
  found: [] as { supplierId: string; name: string; contactName: string | null }[],
  linked: [] as unknown[][],
}));

vi.mock("@/lib/api/client", () => ({
  searchSupplierDirectory: () => Promise.resolve(api.found),
  linkRenterSuppliers: (...args: unknown[]) => {
    api.linked.push(args);
    return Promise.resolve({ created: [{ supplierId: "9", id: "r1" }], skipped: [] });
  },
  isAlreadyLinked: () => false,
}));

beforeEach(() => {
  api.linked = [];
  api.found = [
    { supplierId: "9", name: "Zahid Tractor", contactName: "Bandar" },
    // No store, no city, no verification mark — and listed exactly like the one above.
    { supplierId: "17", name: "Najd Equipment Est.", contactName: null },
  ];
});

afterEach(cleanup);

function open(onDone: (msg: string) => void = () => {}) {
  return render(
    <LocaleProvider>
      <AddFromMoedatechPanel onDone={onDone} onCancel={() => {}} typeTabLabel={en.suppliers.modeType} />
    </LocaleProvider>,
  );
}

const search = async () => {
  fireEvent.change(screen.getByPlaceholderText(en.suppliers.appSearch), { target: { value: "za" } });
  await waitFor(() => expect(screen.getByText("Zahid Tractor")).toBeTruthy(), { timeout: 2000 });
};

describe("AddFromMoedatechPanel", () => {
  it("Given the panel opens, Then it says the directory covers everyone with an account", () => {
    open();
    expect(screen.getByText(en.suppliers.appEveryone.replace("{tab}", en.suppliers.modeType))).toBeTruthy();
  });

  it("Given a supplier with no store, When searched, Then it is listed and selectable like any other", async () => {
    open();
    await search();

    expect(screen.getByText("Najd Equipment Est.")).toBeTruthy();
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.every((b) => !b.disabled)).toBe(true);
  });

  it("Given a supplier is ticked, When saved, Then the SUPPLIER id is linked and marked registered", async () => {
    open();
    await search();

    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: en.suppliers.appAddOne }));

    await waitFor(() => expect(api.linked.length).toBe(1));
    // The account id, and registered — a renter does not add a platform firm unless he works with it,
    // and that flag is what unlocks the contact details.
    expect(api.linked[0][0]).toEqual([{ supplierId: "9", vendorRegistered: true }]);
  });

  it("Given nothing is ticked, Then the button is refused", async () => {
    open();
    await search();
    expect((screen.getByRole("button", { name: en.suppliers.appAddNone }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Given the account has no company name of its own, Then the person is not repeated under it", async () => {
    open();
    await search();
    // "Bandar" sits under "Zahid Tractor"; "Najd Equipment Est." has no second line to repeat itself.
    expect(screen.getByText("Bandar")).toBeTruthy();
    expect(screen.queryByText("Najd Equipment Est.", { selector: "span" })).toBeNull();
  });
});
