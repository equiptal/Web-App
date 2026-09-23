import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AddSuppliersDialog } from "@/components/suppliers/AddSuppliersDialog";
import { LocaleProvider } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";

/**
 * **One add rule, both doors** (owner, 2026-09-08: *"why doesn't it import a missing company or
 * e-mail or phone, while adding them manually allows it? No sense"*).
 *
 * He was right and the inconsistency was ours. The import began asking whether the phone could
 * actually be READ; the typed form went on accepting any non-empty string. So `9.66503E+11` pasted
 * out of a spreadsheet was a contact when typed and not a contact when imported — and since both
 * doors post to the same endpoint, which normalises the phone and refuses a row with no reachable
 * key, the looser side was not more permissive. It just moved the refusal to after the press.
 *
 * Worse, a row short of the rule was dropped in SILENCE here: the button counted the rows that
 * qualified and the rest simply did not go.
 */

const posted: unknown[] = [];

beforeEach(() => {
  posted.length = 0;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("/api/renter-suppliers/bulk")) posted.push(JSON.parse(String(init?.body ?? "{}")));
    return new Response(JSON.stringify({ created: [{ id: "1" }], merged: [], rejected: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
});
afterEach(cleanup);

const draw = () =>
  render(
    <LocaleProvider initialLocale="en">
      <AddSuppliersDialog open onClose={() => {}} onAdded={() => {}} />
    </LocaleProvider>,
  );

/** The four text boxes of the first row, in column order. */
const firstRow = () => {
  const inputs = [...document.querySelectorAll<HTMLInputElement>("input:not([type='checkbox'])")];
  return { name: inputs[0], contact: inputs[1], email: inputs[2], phone: inputs[3] };
};
const type = (el: HTMLInputElement, v: string) => fireEvent.change(el, { target: { value: v } });
/** The dialog's own primary button. NOT «Add another», which also begins with "Add". */
const addButton = () =>
  [...document.querySelectorAll("button")].find((b) =>
    [en.suppliers.addOne, en.suppliers.addNone].includes((b.textContent ?? "").trim()) ||
    /^Add \d+ suppliers$/.test((b.textContent ?? "").trim()),
  )!;

describe("a row short of the rule says so, instead of vanishing", () => {
  it("names the missing contact once a company is typed", async () => {
    draw();
    type(firstRow().name, "Al-Faisal Contracting Est.");
    expect(await screen.findByText(new RegExp(en.suppliers.rMissingContact))).toBeTruthy();
  });

  it("names the missing company when only a phone is typed", async () => {
    draw();
    type(firstRow().phone, "0503372850");
    expect(await screen.findByText(new RegExp(en.suppliers.rMissingName))).toBeTruthy();
  });

  it("says nothing at all about an empty row — that is the next line, not a mistake", () => {
    draw();
    expect(screen.queryByText(new RegExp(en.suppliers.rMissingName))).toBeNull();
    expect(screen.queryByText(new RegExp(en.suppliers.rMissingContact))).toBeNull();
  });

  it("clears the note the moment the row is complete", async () => {
    draw();
    type(firstRow().name, "Zahid Tractor");
    await screen.findByText(new RegExp(en.suppliers.rMissingContact));
    type(firstRow().phone, "0503372850");
    await waitFor(() => expect(screen.queryByText(new RegExp(en.suppliers.rMissingContact))).toBeNull());
  });
});

describe("a phone has to be one we can read", () => {
  it("refuses a spreadsheet's truncated number here too, and names it", async () => {
    // The exact value from the owner's screenshot, pasted into the typed form.
    draw();
    type(firstRow().name, "Al-Faisal Contracting Est.");
    type(firstRow().phone, "9.66503E+11");
    expect(await screen.findByText(new RegExp(en.suppliers.rPhoneTruncated))).toBeTruthy();
  });

  it("refuses «call the office», which used to pass and then be refused by the backend", async () => {
    draw();
    type(firstRow().name, "Al-Madar Trading");
    type(firstRow().phone, "call the office");
    expect(await screen.findByText(new RegExp(en.suppliers.rPhoneUnreadable))).toBeTruthy();
  });

  it("still adds a row whose only contact is an e-mail", async () => {
    draw();
    type(firstRow().name, "Dammam Plant Hire");
    type(firstRow().email, "bandar@dph.sa");
    await waitFor(() => expect(addButton().hasAttribute("disabled")).toBe(false));
  });
});

describe("what is put on the wire", () => {
  it("sends the phone in E.164, exactly as the import sends it", async () => {
    // One supplier typed in two places must produce ONE key, or the backend's dedupe sees two
    // counterparties for the same firm.
    draw();
    type(firstRow().name, "Zahid Tractor");
    type(firstRow().phone, "0503372850");
    await waitFor(() => expect(addButton().hasAttribute("disabled")).toBe(false));
    fireEvent.click(addButton());
    await waitFor(() => expect(posted).toHaveLength(1));
    expect((posted[0] as { rows: { phone: string }[] }).rows[0].phone).toBe("+966503372850");
  });
});
