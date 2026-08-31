import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { AddFromMoedatechPanel } from "@/components/suppliers/AddFromMoedatechPanel";
import { mapStoreCard } from "@/lib/contract/stores";

/**
 * SUP-T14 — adding a supplier who already has a Moedatech account.
 *
 * The two rules worth pinning are both about what the panel REFUSES to do quietly: a store whose
 * payload does not name its company is listed and unpickable rather than dropped, and the link is
 * written against the supplier id rather than the store id. Linking a shopfront would attach the
 * renter to something that is not a company, and nothing downstream would ever match it.
 */

const linked = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock("@/lib/api/client", () => ({
  linkRenterSuppliers: (...args: unknown[]) => {
    linked.calls.push(args);
    return Promise.resolve({ created: [{ supplierId: "9", id: "r1" }], skipped: [] });
  },
  isAlreadyLinked: () => false,
}));

/** Two rows off the real mapper: one that names its company, one that does not. */
const stores = [
  mapStoreCard({ id: "st1", name: "Zahid Tractor", supplierId: 9, city: "Riyadh", isVerified: true }),
  mapStoreCard({ id: "st2", name: "Anonymous Yard", city: "Dammam" }),
];

beforeEach(() => {
  linked.calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ stores }) } as Response)),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function open(onDone: (msg: string) => void = () => {}) {
  return render(
    <LocaleProvider>
      <AddFromMoedatechPanel onDone={onDone} onCancel={() => {}} typeTabLabel={en.suppliers.modeType} />
    </LocaleProvider>,
  );
}

const search = async () => {
  fireEvent.change(screen.getByPlaceholderText(en.suppliers.appSearch), { target: { value: "zahid" } });
  await waitFor(() => expect(screen.getByText("Zahid Tractor")).toBeTruthy(), { timeout: 2000 });
};

describe("AddFromMoedatechPanel", () => {
  it("Given the panel opens, Then it says out loud that only suppliers with a store are listed", () => {
    open();
    // An absence a renter can see is a limit; an absence he cannot is a bug.
    expect(screen.getByText(en.suppliers.appOnlyStores.replace("{tab}", en.suppliers.modeType))).toBeTruthy();
  });

  it("Given a store that does not name its company, When listed, Then it is shown, explained and unpickable", async () => {
    open();
    await search();

    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes[0].disabled).toBe(false);
    expect(boxes[1].disabled).toBe(true);
    expect(screen.getByText(new RegExp(en.suppliers.appNoSupplierId))).toBeTruthy();
  });

  it("Given a supplier is ticked, When saved, Then the SUPPLIER id is linked, never the store id", async () => {
    open();
    await search();

    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: en.suppliers.appAddOne }));

    await waitFor(() => expect(linked.calls.length).toBe(1));
    // "9", the supplier behind the shopfront — not "st1".
    expect(linked.calls[0][0]).toEqual([{ supplierId: "9", vendorRegistered: true }]);
  });

  it("Given nothing is ticked, Then the button is refused", async () => {
    open();
    await search();
    expect((screen.getByRole("button", { name: en.suppliers.appAddNone }) as HTMLButtonElement).disabled).toBe(true);
  });
});
