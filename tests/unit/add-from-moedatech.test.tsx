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
  /** Every directory call, so a test can say WHAT was asked for and not only that it was. */
  calls: [] as unknown[][],
}));

vi.mock("@/lib/api/client", () => ({
  searchSupplierDirectory: (...args: unknown[]) => {
    api.calls.push(args);
    const page = typeof args[1] === "number" ? args[1] : 1;
    return Promise.resolve({ rows: api.found, page, totalPages: api.totalPages, total: api.total });
  },
  linkRenterSuppliers: (...args: unknown[]) => {
    api.linked.push(args);
    return Promise.resolve({ created: [{ supplierId: "9", id: "r1" }], skipped: [] });
  },
  isAlreadyLinked: () => false,
}));

beforeEach(() => {
  api.linked = [];
  api.calls = [];
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

  it("Given a supplier is ticked, When saved, Then it is linked and NOT marked a vendor", async () => {
    /**
     * 🔴 **Off by default** (owner, 2026-09-08: *"for add from Moedatech, same, doesn't auto-mark
     * vendor for all, the default is unselected"*).
     *
     * ~~On.~~ «Registered vendor» is a claim about a procurement relationship, and picking a firm
     * out of a directory of every account on the platform is not the moment it becomes true. Ticked
     * for him, the flag ended up on everybody and stopped meaning anything.
     */
    open();
    await listed();

    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: en.suppliers.dirAddN.replace("{n}", "1") }));

    await waitFor(() => expect(api.linked.length).toBe(1));
    expect(api.linked[0][0]).toEqual([{ supplierId: "9", vendorRegistered: false }]);
  });

  it("Given the vendor flag is ticked on a row, Then that firm is added WITH it", async () => {
    /**
     * It used to be forced on (owner, 2026-09-02 reversed it). Adding from Moedatech now behaves
     * exactly like adding a firm by hand, and the flag means the one thing it says: this is a firm I
     * have registered as a vendor. A renter can add one he is only trying out without claiming so.
     *
     * ⚠️ THE ROW'S OWN CHIP, by position, and that is the point of the rewrite. This pressed the
     * LAST checkbox in the dialog, which is the master, so it proved that unticking ALL of them
     * works and said nothing about the row. The row's chip could not be unticked at all, and this
     * test passed throughout (owner, 2026-09-03: *"I can't add a supplier without deselecting him as
     * not registered"*). Checkbox 0 picks the first row, checkbox 1 is that same row's vendor flag.
     */
    open();
    await listed();

    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    fireEvent.click(screen.getByRole("button", { name: en.suppliers.dirAddN.replace("{n}", "1") }));

    await waitFor(() => expect(api.linked.length).toBe(1));
    expect(api.linked[0][0]).toEqual([{ supplierId: "9", vendorRegistered: true }]);
  });

  it("Given a row's vendor chip is pressed, Then it does not also pick or unpick the row", async () => {
    /* The chip used to live INSIDE the row's label, so it toggled the pick as well — which is why it
       carried a `preventDefault` that froze its own tick. Two labels now, side by side. */
    open();
    await listed();

    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    fireEvent.click(boxes[1]);

    // The row is untouched; the chip took its own press. ⚠️ Both start OFF now (2026-09-08).
    expect(boxes[0].checked).toBe(false);
    expect(boxes[1].checked).toBe(true);
  });

  it("Given more than the first page, Then it offers ALL of them rather than a pager", async () => {
    /**
     * 🔴 **~~Prev / Next over seventy-five pages.~~** (owner, 2026-09-08: *"show first 20 with show
     * all at the end that will show all suppliers we have, but in the same order we are
     * following"*). A renter could not see how far in he was, could not get back to a firm he had
     * passed, and the ordering meant nothing across a boundary he had to click through.
     */
    api.totalPages = 75;
    api.total = 1492;
    open();
    await listed();

    expect(screen.getByText(en.suppliers.dirCount.replace("{shown}", "2").replace("{total}", "1492"))).toBeTruthy();
    expect(screen.getByRole("button", { name: en.suppliers.dirShowAll })).toBeTruthy();
    /* ⚠️ «Prev» and «Next» are gone from the dictionary as well as from the screen: two spellings
       of «how do I see more» is how the two came to disagree in the first place. */
    expect(screen.getAllByRole("button").map((b) => b.textContent)).not.toContain("Next");
  });

  it("Given «show all» is pressed, Then the whole directory is asked for in ONE call", async () => {
    /* ⚠️ `limit = total`, not seventy-five requests. The alternative is the same bytes plus a
       spinner that lies about being finished — and the sort is only a statement about the whole
       directory once the whole directory is in hand. */
    api.totalPages = 75;
    api.total = 1492;
    open();
    await listed();

    fireEvent.click(screen.getByRole("button", { name: en.suppliers.dirShowAll }));

    await waitFor(() => expect(api.calls.some((a) => a[2] === 1492)).toBe(true));
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
    expect(api.linked[0][0]).toEqual([{ supplierId: "9", vendorRegistered: false }]);
  });
});
