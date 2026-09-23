import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ar } from "@/lib/i18n/ar";
import { en } from "@/lib/i18n/en";

/**
 * ── The suppliers table lines up in Arabic (owner, 2026-09-12) ──────────────────────────────────
 * *"fix this ui, the order is different in columns + vendor registered is not clear in arabic"*.
 *
 * On the Arabic table the «الجوال» and «البريد» headers sat against the RIGHT edge of their columns
 * while the values sat against the LEFT — two of six columns reading as shifted out of line.
 *
 * The cause is one attribute in the wrong place. Both cells put `dir="ltr"` on the BLOCK, and
 * `text-align: start` resolves against the element's OWN direction: an ltr block inside an rtl table
 * starts on the left, while its `text-start` header starts on the right. The direction itself is
 * needed — a `+966…` number must not be reordered by the Arabic around it — so it belongs on a
 * `<bdi>`, which isolates the run and leaves the block's alignment to the page.
 *
 * ⚠️ jsdom resolves no bidi and no `text-align: start`, so the alignment is a rendered fact these
 * cases cannot measure. What they pin is the rule that decides it.
 */
const SRC = readFileSync("src/components/suppliers/SuppliersPage.tsx", "utf8");

describe("the phone and e-mail columns", () => {
  it("puts the direction on a <bdi>, never on the block that carries the alignment", () => {
    expect(SRC).toContain('<bdi dir="ltr">');
    // Two cells, two isolates — phone and e-mail.
    expect(SRC.match(/<bdi dir="ltr">/g) ?? []).toHaveLength(2);
  });

  it("leaves no `dir` on a block element in the table", () => {
    // `className="block … " dir="ltr"` is the shape that misaligned the column.
    expect(SRC).not.toMatch(/className="block[^"]*"\s+dir="ltr"/);
  });

  it("still isolates the run, so a +966 number is not reordered by the Arabic around it", () => {
    // Dropping the direction altogether would "fix" the alignment and break the number.
    expect(SRC).toContain('dir="ltr"');
  });

  it("keeps every header on the table's own start edge", () => {
    // One rule for all six, so a column cannot drift on its own.
    expect(SRC).toMatch(/\[c\.colSupplier, c\.colVendor, c\.colPhone, c\.colEmail, c\.colGroups, c\.colBids, ""\]/);
    expect(SRC).toContain("text-start text-label font-extrabold uppercase");
  });
});

describe("the vendor column says what it is", () => {
  it("is «تسجيل المورّد» in Arabic — a registration, not an approval", () => {
    /* ~~«اعتماد المورّد».~~ «اعتماد» reads as an approval somebody grants, and the owner could not
       tell what the column was for. The English has always been «Vendor registration»: the RENTER's
       own record that he has registered this firm, which is what the tick on the row sets. */
    expect(ar.suppliers.colVendor).toBe("تسجيل المورّد");
    expect(ar.suppliers.colVendor).not.toContain("اعتماد");
  });

  it("still matches the English it translates", () => {
    expect(en.suppliers.colVendor).toBe("Vendor registration");
  });
});
