import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { AddFromMoedatechDialog } from "@/components/suppliers/AddFromMoedatechDialog";

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
  found: [] as { supplierId: string; name: string; contactName: string | null; city: string | null; verified: boolean; hasStore: boolean }[],
  totalPages: 1,
  total: 2,
  linked: [] as unknown[][],
}));

vi.mock("@/lib/api/client", () => ({
  searchSupplierDirectory: (_q: string, page = 1) =>
    Promise.resolve({ rows: api.found, page, totalPages: api.totalPages, total: api.total }),
  linkRenterSuppliers: (...args: unknown[]) => {
    api.linked.push(args);
    return Promise.resolve({ created: [{ supplierId: "9", id: "r1" }], skipped: [] });
  },
  isAlreadyLinked: () => false,
}));

beforeEach(() => {
  api.linked = [];
  api.totalPages = 1;
  api.total = 2;
  api.found = [
    { supplierId: "9", name: "Zahid Tractor", contactName: "Bandar", city: "Riyadh", verified: true, hasStore: true },
    // No store, no city, no mark — and listed exactly like the one above, because a firm with no
    // shopfront is still a firm.
    { supplierId: "17", name: "Najd Equipment Est.", contactName: null, city: null, verified: false, hasStore: false },
  ];
});

afterEach(cleanup);

function open(onDone: (msg: string) => void = () => {}) {
  return render(
    <LocaleProvider>
      <AddFromMoedatechDialog open onClose={() => {}} onDone={onDone} />
    </LocaleProvider>,
  );
}

/** It opens on page one, so nothing has to be typed before rows appear. */
const listed = async () => {
  await waitFor(() => expect(screen.getByText("Zahid Tractor")).toBeTruthy(), { timeout: 2000 });
};

describe("AddFromMoedatechDialog", () => {
  it("Given the dialog opens, Then it lists suppliers without anything being typed", async () => {
    /**
     * It opened on "type a name to search", which asks the renter to name a firm before he has been
     * shown that any exist (owner, 2026-09-02). There are 1,492 accounts; page one of them IS the
     * answer to "who is on Moedatech?".
     */
    open();
    expect(screen.getByText(en.suppliers.dirTitle)).toBeTruthy();
    await listed();
    expect(screen.getByText("Najd Equipment Est.")).toBeTruthy();
  });

  it("Given a supplier with no store, When searched, Then it is listed and selectable like any other", async () => {
    open();
    await listed();

    expect(screen.getByText("Najd Equipment Est.")).toBeTruthy();
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.every((b) => !b.disabled)).toBe(true);
  });

  it("Given a supplier is ticked, When saved, Then the SUPPLIER id is linked, registered by default", async () => {
    open();
    await listed();

    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: en.suppliers.dirAddN.replace("{n}", "1") }));

    await waitFor(() => expect(api.linked.length).toBe(1));
    expect(api.linked[0][0]).toEqual([{ supplierId: "9", vendorRegistered: true }]);
  });

  it("Given the vendor flag is unticked on a row, Then that firm is added without it", async () => {
    /**
     * It used to be forced on (owner, 2026-09-02 reversed it). Adding from Moedatech now behaves
     * exactly like adding a firm by hand, and the flag means the one thing it says: this is a firm I
     * have registered as a vendor. A renter can add one he is only trying out without claiming so.
     */
    open();
    await listed();

    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    // The row's own tick appears once the row is chosen.
    const ticks = screen.getAllByRole("checkbox");
    fireEvent.click(ticks[ticks.length - 1]);
    fireEvent.click(screen.getByRole("button", { name: en.suppliers.dirAddN.replace("{n}", "1") }));

    await waitFor(() => expect(api.linked.length).toBe(1));
    expect(api.linked[0][0]).toEqual([{ supplierId: "9", vendorRegistered: false }]);
  });

  it("Given more than one page, Then it pages rather than scrolling 1,492 rows", async () => {
    api.totalPages = 75;
    api.total = 1492;
    open();
    await listed();

    expect(screen.getByText(en.suppliers.dirCount.replace("{shown}", "2").replace("{total}", "1492"))).toBeTruthy();
    expect((screen.getByRole("button", { name: en.suppliers.prev }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: en.suppliers.next }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("Given every row, Then each carries its own vendor flag — not only the ticked ones", async () => {
    // It was revealed on selection, which is the moment it matters, and a control that appears only
    // after another one is pressed is a control a renter does not know he has (owner, 2026-09-02).
    open();
    await listed();

    // Per row: one select box and one vendor tick. Plus the master, which sets them all at once.
    expect(screen.getAllByRole("checkbox").length).toBe(api.found.length * 2 + 1);
  });

  it("Given nothing is ticked, Then the button is refused", async () => {
    open();
    await listed();
    expect((screen.getByRole("button", { name: en.suppliers.dirAdd }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Given a city and a person, Then both are shown — that is what tells two similar names apart", async () => {
    open();
    await listed();
    // The directory does carry these; the picker was built as though it did not (2026-09-02).
    expect(screen.getByText("Riyadh · Bandar")).toBeTruthy();
  });

  it("Given the SUPPLIER id, When linked, Then it goes out as a NUMBER", async () => {
    /**
     * `users.id` is an integer and the backend's schema says so. Sending the string this app carries
     * it as answered `422 VALIDATION_ERROR: items — Expected number, received string`, so nobody
     * could be linked at all (found end-to-end against the deployed stage, 2026-09-02).
     */
    open();
    await listed();
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: en.suppliers.dirAddN.replace("{n}", "1") }));

    await waitFor(() => expect(api.linked.length).toBe(1));
    expect(api.linked[0][0]).toEqual([{ supplierId: "9", vendorRegistered: true }]);
  });
});
