import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SupplierImportPanel } from "@/components/suppliers/SupplierImportPanel";
import { LocaleProvider } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";

/**
 * **The import preview shows the number that will be saved** (owner, 2026-09-08: *"normalize the
 * numbers"*, on a screenshot of a phone column reading `9.66503E+11` above `503372850`).
 *
 * The parsers are pinned in `xlsx-import.test.ts`. What these pin is the SCREEN, because the fault
 * the owner saw was not in a parser: the panel drew the sheet's own text, so a mangled number and a
 * bare subscriber number both looked like data, one of them was silently dropped by the backend, and
 * the count under the table promised an import that would not happen.
 *
 * `File.text()` is stubbed rather than relying on jsdom's — jsdom implements `Blob.text()` but the
 * panel also reads `arrayBuffer()` on the workbook path, and one stub for both keeps the two paths
 * symmetrical here.
 */

const csv = (body: string) =>
  ({
    name: "suppliers.csv",
    size: body.length,
    text: async () => body,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  }) as unknown as File;

const done = vi.fn();

beforeEach(() => {
  done.mockReset();
  // The panel asks the backend what it WOULD do as soon as a file is read. Nothing here is about
  // that plan, so it answers "nothing to report" and stays out of the way.
  vi.stubGlobal("fetch", async () =>
    new Response(JSON.stringify({ created: [], merged: [], rejected: [], warnings: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
});
afterEach(cleanup);

const draw = () =>
  render(
    <LocaleProvider initialLocale="en">
      <SupplierImportPanel onDone={done} onCancel={() => {}} />
    </LocaleProvider>,
  );

const pick = async (file: File) => {
  draw();
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file] });
  fireEvent.change(input);
  await waitFor(() => expect(screen.queryByText(en.suppliers.preview)).toBeTruthy());
};

/** Every editable preview cell, by value — the table is one input per cell. */
const cellValues = () =>
  [...document.querySelectorAll<HTMLInputElement>("tbody input[type='text'], tbody input:not([type])")].map(
    (i) => i.value,
  );

describe("the phone column, as it will be saved", () => {
  it("shows a bare subscriber number in E.164", async () => {
    await pick(csv("COMPANY,PHONE NUMBER\nZahid Tractor,503372850"));
    expect(cellValues()).toContain("+966503372850");
  });

  it("shows the national form in E.164 too, so two spellings read as one supplier", async () => {
    await pick(csv("COMPANY,PHONE NUMBER\nZahid,0503372850\nSalem,+966 50 337 2851"));
    expect(cellValues()).toContain("+966503372850");
    expect(cellValues()).toContain("+966503372851");
  });

  it("says once that the numbers were rewritten", async () => {
    // Otherwise a renter wonders why his sheet's 0503372850 now reads +966503372850.
    await pick(csv("COMPANY,PHONE NUMBER\nZahid,0503372850"));
    expect(screen.getByText(en.suppliers.phonesNormalized)).toBeTruthy();
  });

  it("leaves a column that is not a phone alone", async () => {
    await pick(csv("COMPANY,CR NUMBER\nZahid,1010012345"));
    expect(cellValues()).toContain("1010012345");
    expect(screen.queryByText(en.suppliers.phonesNormalized)).toBeNull();
  });
});

describe("a number Excel destroyed", () => {
  it("keeps the renter's own text and names the cure", async () => {
    await pick(csv("COMPANY,PHONE NUMBER\nAl-Faisal Contracting Est.,9.66503E+11"));
    // Not rewritten: 9.66503×10¹¹ is not a phone number and we do not invent the missing digits.
    expect(cellValues()).toContain("9.66503E+11");
    expect(screen.getByText(en.suppliers.phoneTruncated)).toBeTruthy();
  });

  it("counts the row as unreachable, which is what the backend will do with it", async () => {
    // The old rule counted any non-empty phone string, so the panel said «1 supplier ready» and the
    // backend then refused the row for having no contact at all.
    await pick(csv("COMPANY,PHONE NUMBER\nAl-Faisal Contracting Est.,9.66503E+11"));
    expect(screen.getByText("0 will be imported · 1 skipped")).toBeTruthy();
    expect(screen.getByText(new RegExp(en.suppliers.rPhoneTruncated))).toBeTruthy();
  });

  it("still imports the row when there is an e-mail behind it", async () => {
    await pick(csv("COMPANY,E-MAIL,PHONE NUMBER\nAl-Faisal,sales@faisal.sa,9.66503E+11"));
    expect(screen.getByText("1 will be imported")).toBeTruthy();
    // The warning is still shown: the phone is a fact about the file, not about the row's fate.
    expect(screen.getByText(en.suppliers.phoneTruncated)).toBeTruthy();
  });

  it("says which half of the rule an unreadable phone breaks", async () => {
    await pick(csv("COMPANY,PHONE NUMBER\nAl-Faisal,call the office"));
    expect(screen.getByText(new RegExp(en.suppliers.rPhoneUnreadable))).toBeTruthy();
  });
});

describe("which files the picker offers", () => {
  it("takes a workbook as well as a CSV", async () => {
    draw();
    const accept = document.querySelector('input[type="file"]')!.getAttribute("accept") ?? "";
    expect(accept).toContain(".xlsx");
    expect(accept).toContain(".csv");
  });

  it("refuses .xls and the other containers, and says what to do", async () => {
    draw();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const xls = { name: "suppliers.xls", size: 20, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
    Object.defineProperty(input, "files", { value: [xls as unknown as File] });
    fireEvent.change(input);
    expect(await screen.findByText(en.suppliers.xlsxNotRead)).toBeTruthy();
  });
});
