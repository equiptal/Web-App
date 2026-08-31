import { describe, it, expect } from "vitest";
import { guessField, importable, mapRows, parseSheet, type SheetField } from "@/lib/contract/sheet-paste";

describe("reading a supplier list out of a spreadsheet", () => {
  it("takes a paste from Excel — tab separated", () => {
    const table = parseSheet("Company\tE-mail\tMobile\nZahid Tractor\tt@z.sa\t0551234567");
    expect(table?.headers).toEqual(["Company", "E-mail", "Mobile"]);
    expect(table?.rows[0]).toEqual(["Zahid Tractor", "t@z.sa", "0551234567"]);
  });

  it("takes a CSV file — comma separated", () => {
    const table = parseSheet("Company,E-mail\nZahid Tractor,t@z.sa");
    expect(table?.rows[0]).toEqual(["Zahid Tractor", "t@z.sa"]);
  });

  it("keeps a comma inside a quoted company name", () => {
    // The ordinary case in a supplier list, not an edge one: a naive split shifts every field after
    // it, and a renter only notices weeks later.
    const table = parseSheet('Company,City\n"Zahid Tractor, Riyadh Branch",Riyadh');
    expect(table?.rows[0]).toEqual(["Zahid Tractor, Riyadh Branch", "Riyadh"]);
  });

  it("unescapes a doubled quote", () => {
    const table = parseSheet('Company,City\n"He said ""yes""",Riyadh');
    expect(table?.rows[0][0]).toBe('He said "yes"');
  });

  it("pads a short row rather than rejecting it — a trailing empty column is not typed", () => {
    const table = parseSheet("Company,E-mail,Mobile\nZahid Tractor,t@z.sa");
    expect(table?.rows[0]).toEqual(["Zahid Tractor", "t@z.sa", ""]);
  });

  it("decides the delimiter from the header, not from where the text came from", () => {
    // A CSV pasted into the box is still a CSV.
    expect(parseSheet("a,b,c\n1,2,3")?.headers).toHaveLength(3);
    expect(parseSheet("a\tb\tc\n1\t2\t3")?.headers).toHaveLength(3);
  });

  it("answers null when there is nothing usable", () => {
    expect(parseSheet("")).toBeNull();
    expect(parseSheet("just one line")).toBeNull();
    expect(parseSheet("onecolumn\nvalue")).toBeNull();
  });

  it("caps at 500 rows and does not truncate silently — the caller reports the count", () => {
    const text = ["Company,E-mail", ...Array.from({ length: 600 }, (_, i) => `Firm ${i},f${i}@x.sa`)].join("\n");
    expect(parseSheet(text)?.rows).toHaveLength(500);
  });
});

describe("guessing what a column is", () => {
  const cases: [string, SheetField][] = [
    ["Company", "name"],
    ["Supplier Name", "name"],
    ["Contact person", "contactName"],
    ["E-mail", "email"],
    ["Mobile", "phone"],
    ["WhatsApp", "phone"],
    ["CR number", "crNumber"],
    ["Payment terms", "extra"],
  ];
  for (const [header, field] of cases) {
    it(`${header} → ${field}`, () => expect(guessField(header)).toBe(field));
  }

  it("anything unrecognised is kept, never dropped", () => {
    expect(guessField("Account manager")).toBe("extra");
  });
});

describe("mapping", () => {
  const table = parseSheet("Company,Contact person,E-mail,Mobile,Payment terms\nZahid,Faisal,t@z.sa,0551234567,30 days")!;
  const mapping = table.headers.map(guessField);

  it("puts every unmapped column under extra, under its own header", () => {
    const [row] = mapRows(table, mapping);
    expect(row.name).toBe("Zahid");
    expect(row.contactName).toBe("Faisal");
    expect(row.extra).toEqual({ "Payment terms": "30 days" });
  });

  it("drops a column the renter set to skip", () => {
    const skipped = [...mapping];
    skipped[4] = "skip";
    expect(mapRows(table, skipped)[0].extra).toEqual({});
  });

  it("a row is importable only with a name AND a way to reach them", () => {
    expect(importable(mapRows(table, mapping)[0])).toBe(true);
    const noContact = parseSheet("Company,City\nZahid,Riyadh")!;
    expect(importable(mapRows(noContact, ["name", "extra"])[0])).toBe(false);
  });
});
