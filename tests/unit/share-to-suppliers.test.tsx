import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { ShareToSuppliers } from "@/components/requests/ShareToSuppliers";

/**
 * SUP-T41 — sending a request to the suppliers the renter already keeps.
 *
 * Two rules are worth pinning because breaking either one is silent: recipients go in **BCC** (forty
 * suppliers in a To line tells each of them who else was asked), and a supplier with no e-mail is
 * **named before the send** rather than dropped from a message that reports success.
 */

const rows = vi.hoisted(() => ({
  list: [] as { id: string; name: string; email: string | null; groups?: string[] }[],
  patched: [] as unknown[][],
  recorded: [] as unknown[][],
}));

vi.mock("@/lib/api/client", () => ({
  listRenterSuppliers: () => Promise.resolve(rows.list),
  updateRenterSupplier: (...args: unknown[]) => {
    rows.patched.push(args);
    return Promise.resolve({});
  },
  recordRequestShare: (...args: unknown[]) => {
    rows.recorded.push(args);
    return Promise.resolve();
  },
}));

vi.mock("@/lib/bidCardHtml", async (real) => ({
  ...(await real<typeof import("@/lib/bidCardHtml")>()),
  copyBidLink: () => Promise.resolve(true),
}));

const L = (en: string) => en;
const URL_ = "https://web.moedatech.net/bid/excavator-5cc5efdc-86ab-459e-a73e-564257e2cbd2";

let href = "";

beforeEach(() => {
  rows.patched = [];
  rows.recorded = [];
  href = "";
  // `mailto:` navigation is the whole output of this component, so it is what the test reads.
  Object.defineProperty(window, "location", {
    value: {
      get href() {
        return href;
      },
      set href(v: string) {
        href = v;
      },
    },
    writable: true,
  });
});

afterEach(cleanup);

const open = () => {
  render(<ShareToSuppliers shareUrl={URL_} renterName="Shibh Al Jazira" requestCode="EXC-170845" ar={false} L={L} />);
  fireEvent.click(screen.getByRole("button", { name: /Send to my suppliers/ }));
};

describe("ShareToSuppliers", () => {
  it("Given suppliers are picked, When sent, Then the addresses are in BCC and the To line is empty", async () => {
    rows.list = [
      { id: "a", name: "Zahid Tractor", email: "bids@zahid.sa" },
      { id: "b", name: "Al-Rajhi Equipment", email: "rfq@rajhi.sa" },
    ];
    open();
    await waitFor(() => expect(screen.getByText("Zahid Tractor")).toBeTruthy());

    screen.getAllByRole("checkbox").forEach((box) => fireEvent.click(box));
    fireEvent.click(screen.getByRole("button", { name: /Send to 2/ }));

    expect(href.startsWith("mailto:?bcc=")).toBe(true);
    expect(decodeURIComponent(href)).toContain("bids@zahid.sa,rfq@rajhi.sa");
    // The request's own code rides in the subject so an operator can file the reply against it.
    expect(decodeURIComponent(href)).toContain("EXC-170845");
    expect(decodeURIComponent(href)).toContain(URL_);

    // Declared, not observed: the record is written against the link token the renter shared, and it
    // says who he chose — never who received it or opened it.
    expect(rows.recorded[0]).toEqual(["5cc5efdc-86ab-459e-a73e-564257e2cbd2", ["a", "b"], "email"]);
  });

  it("Given one of them has no e-mail, When picked, Then it is named before the send and not counted", async () => {
    rows.list = [
      { id: "a", name: "Zahid Tractor", email: "bids@zahid.sa" },
      { id: "b", name: "Yard With No Mail", email: null },
    ];
    open();
    await waitFor(() => expect(screen.getByText("Yard With No Mail")).toBeTruthy());

    screen.getAllByRole("checkbox").forEach((box) => fireEvent.click(box));

    // Said out loud: reporting "sent to 2" when one was dropped is found out a week later, when a
    // bid the renter was waiting for never came.
    expect(screen.getByText(/1 of the ones you picked have no e-mail/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Send to 1/ })).toBeTruthy();
  });

  it("Given a missing e-mail is added on the row, Then it saves and the supplier becomes reachable", async () => {
    rows.list = [{ id: "b", name: "Yard With No Mail", email: null }];
    open();
    await waitFor(() => expect(screen.getByText("Yard With No Mail")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Add e-mail" }));
    fireEvent.change(screen.getByPlaceholderText("name@company.com"), { target: { value: "ops@yard.sa" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(rows.patched.length).toBe(1));
    expect(rows.patched[0]).toEqual(["b", { email: "ops@yard.sa" }]);
  });

  it("Given more than 25 recipients, When read, Then it offers the addresses instead of a truncated mailto", async () => {
    rows.list = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, name: `Supplier ${i}`, email: `s${i}@x.sa` }));
    open();
    await waitFor(() => expect(screen.getByText("Supplier 0")).toBeTruthy());

    screen.getAllByRole("checkbox").forEach((box) => fireEvent.click(box));

    expect(screen.getByText(/Over 25 recipients/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy the addresses" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Send to/ })).toBeNull();
  });
});
