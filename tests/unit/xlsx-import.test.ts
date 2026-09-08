import { describe, it, expect, afterEach, vi } from "vitest";
import { readXlsxSheet, gridToTable } from "@/lib/contract/xlsx-sheet";
import { normalizePhone, phoneE164, readScientific } from "@/lib/contract/phone-normalize";
import { guessField, mapRows } from "@/lib/contract/sheet-paste";

/**
 * **Importing suppliers from Excel, and the numbers in it** (owner, 2026-09-08: *"can't we add
 * xlsx?"* and *"normalize the numbers"* — the screenshot showed a phone column reading
 * `9.66503E+11` on one row and `503372850` on the next).
 *
 * Two halves of one bug, so one suite:
 *   · the workbook is read directly, where a 12-digit phone is still 12 digits
 *   · every phone is normalised to E.164 the way the backend's `normalizePhoneE164` does it, and a
 *     number Excel already destroyed is called destroyed rather than guessed at
 *
 * The workbooks below are BUILT here rather than committed as fixtures: a binary blob in the repo
 * cannot be read in review, and `CompressionStream` writes a genuine zip, so these exercise the real
 * container rather than a hand-rolled approximation of one.
 */

/* ─────────────────────────── a minimal, real .xlsx ─────────────────────────── */

const enc = new TextEncoder();

/** CRC-32, which a zip entry must carry. Table-free: 40 rows of test data is not a hot loop. */
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Write a zip. Entries are DEFLATE-compressed, which is what Excel writes and therefore the path
 * that has to work — a stored-only zip would leave the inflate half of the reader untested.
 */
async function zip(files: Record<string, string>): Promise<ArrayBuffer> {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const [name, text] of Object.entries(files)) {
    const raw = enc.encode(text);
    const body = await deflateRaw(raw);
    const nameBytes = enc.encode(name);
    const crc = crc32(raw);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(8, 8, true); // method: deflate
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);

    const dir = new Uint8Array(46 + nameBytes.length);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint16(10, 8, true);
    dv.setUint32(16, crc, true);
    dv.setUint32(20, body.length, true);
    dv.setUint32(24, raw.length, true);
    dv.setUint16(28, nameBytes.length, true);
    dv.setUint32(42, offset, true);
    dir.set(nameBytes, 46);

    parts.push(local, body);
    central.push(dir);
    offset += local.length + body.length;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const all = [...parts, ...central, eocd];
  const out = new Uint8Array(all.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of all) {
    out.set(a, at);
    at += a.length;
  }
  return out.buffer;
}

/** `sheet1.xml` from rows of `{ v, t }` cells — `t: "s"` means "index into the shared pool". */
const sheetXml = (rows: { v: string; t?: string }[][]): string => {
  const col = (i: number) => String.fromCharCode(65 + i);
  const body = rows
    .map((cells, r) => {
      const cs = cells
        .map((c, i) => (c.v === "" ? "" : `<c r="${col(i)}${r + 1}"${c.t ? ` t="${c.t}"` : ""}><v>${c.v}</v></c>`))
        .join("");
      return `<row r="${r + 1}">${cs}</row>`;
    })
    .join("");
  return `<?xml version="1.0"?><worksheet><sheetData>${body}</sheetData></worksheet>`;
};

const poolXml = (items: string[]): string =>
  `<?xml version="1.0"?><sst>${items.map((i) => `<si><t>${i}</t></si>`).join("")}</sst>`;

/** A workbook whose phone column is a NUMBER, which is the case the whole change exists for. */
const workbook = () => {
  const pool = ["COMPANY", "CONTACT", "PHONE NUMBER", "Al-Faisal Contracting Est.", "Murad", "Zahid Tractor", "Salem"];
  return zip({
    "[Content_Types].xml": '<?xml version="1.0"?><Types/>',
    "xl/workbook.xml": '<?xml version="1.0"?><workbook><sheets><sheet name="Suppliers" sheetId="1"/></sheets></workbook>',
    "xl/sharedStrings.xml": poolXml(pool),
    "xl/worksheets/sheet1.xml": sheetXml([
      [{ v: "0", t: "s" }, { v: "1", t: "s" }, { v: "2", t: "s" }],
      [{ v: "3", t: "s" }, { v: "4", t: "s" }, { v: "966503372850" }],
      [{ v: "5", t: "s" }, { v: "6", t: "s" }, { v: "503372850" }],
    ]),
  });
};

/* ────────────────────── Chrome is stricter than Node ─────────────────── */

/**
 * 🔴 **The bug this file did not catch, and now does** (owner, 2026-09-08: *"That file couldn't be
 * read as an Excel workbook"* — on a workbook this repo generated itself).
 *
 * `DecompressionStream("deflate-raw")` in **Node** stops at the end of the deflate stream and
 * ignores whatever follows. **Chrome errors the stream.** In a zip something always follows an
 * entry, so a reader that hands the inflater "everything from here to the end of the file" works in
 * every test and fails on every real upload. Measured in Chrome: the exact compressed bytes inflate,
 * the same bytes plus fifty trailing ones throw.
 *
 * So the platform's leniency is taken away for one test: this stub throws if it is given a single
 * byte more than the deflate stream needs, which is what the browser does.
 */
const strictInflate = () => {
  const real = globalThis.DecompressionStream;
  class Strict extends TransformStream<Uint8Array, Uint8Array> {
    constructor(format: string) {
      const chunks: Uint8Array[] = [];
      super({
        transform(chunk) {
          chunks.push(chunk);
        },
        async flush(controller) {
          const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
          let at = 0;
          for (const c of chunks) {
            all.set(c, at);
            at += c.length;
          }
          // Round-trip through the real implementation, then compare: re-deflating the output and
          // getting FEWER bytes than we were given means the tail was junk the browser would
          // refuse. (Not byte-identical re-compression — the length is what matters here.)
          const text = await new Response(
            new Blob([all as unknown as BlobPart]).stream().pipeThrough(new real(format as "deflate-raw")),
          ).arrayBuffer();
          const again = new Uint8Array(
            await new Response(
              new Blob([text]).stream().pipeThrough(new CompressionStream(format as "deflate-raw")),
            ).arrayBuffer(),
          );
          if (all.length > again.length + 8) throw new Error("junk found after the deflate stream");
          controller.enqueue(new Uint8Array(text));
        },
      });
    }
  }
  globalThis.DecompressionStream = Strict as unknown as typeof globalThis.DecompressionStream;
  return () => {
    globalThis.DecompressionStream = real;
  };
};

describe("with the browser's own strictness", () => {
  afterEach(() => vi.restoreAllMocks());

  it("hands the inflater the entry's bytes and nothing after them", async () => {
    const restore = strictInflate();
    try {
      const out = await readXlsxSheet(await workbook());
      expect(typeof out).not.toBe("string");
      if (typeof out === "string") return;
      expect(out.rows[0][2]).toBe("966503372850");
    } finally {
      restore();
    }
  });
});

/* ────────────────────────────── the reader ────────────────────────────── */

describe("reading a workbook", () => {
  it("reads the header row and the rows under it", async () => {
    const out = await readXlsxSheet(await workbook());
    expect(typeof out).not.toBe("string");
    if (typeof out === "string") return;
    expect(out.headers).toEqual(["COMPANY", "CONTACT", "PHONE NUMBER"]);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0][0]).toBe("Al-Faisal Contracting Est.");
  });

  it("keeps every digit of a phone stored as a number — the whole point", async () => {
    // Saved as CSV the same cell reads `9.66503E+11` and the number is unrecoverable.
    const out = await readXlsxSheet(await workbook());
    if (typeof out === "string") throw new Error(out);
    expect(out.rows[0][2]).toBe("966503372850");
  });

  it("reads an inline string and a formula's cached text", async () => {
    const buf = await zip({
      "xl/workbook.xml": "<workbook/>",
      "xl/worksheets/sheet1.xml":
        '<worksheet><sheetData>' +
        '<row r="1"><c r="A1" t="inlineStr"><is><t>COMPANY</t></is></c><c r="B1" t="inlineStr"><is><t>PHONE</t></is></c></row>' +
        '<row r="2"><c r="A2" t="str"><f>A1</f><v>Bin Quraya</v></c><c r="B2"><v>0503372850</v></c></row>' +
        "</sheetData></worksheet>",
    });
    const out = await readXlsxSheet(buf);
    if (typeof out === "string") throw new Error(out);
    expect(out.headers).toEqual(["COMPANY", "PHONE"]);
    expect(out.rows[0]).toEqual(["Bin Quraya", "0503372850"]);
  });

  it("undoes the XML entities a supplier name is full of", async () => {
    const buf = await zip({
      "xl/workbook.xml": "<workbook/>",
      "xl/sharedStrings.xml": poolXml(["COMPANY", "PHONE", "Salem &amp; Sons &#39;Riyadh&#39;"]),
      "xl/worksheets/sheet1.xml": sheetXml([
        [{ v: "0", t: "s" }, { v: "1", t: "s" }],
        [{ v: "2", t: "s" }, { v: "503372850" }],
      ]),
    });
    const out = await readXlsxSheet(buf);
    if (typeof out === "string") throw new Error(out);
    expect(out.rows[0][0]).toBe("Salem & Sons 'Riyadh'");
  });

  it("refuses a zip that is not a workbook, rather than showing an empty table", async () => {
    // A `.docx` renamed to `.xlsx` is a valid zip — the extension cannot tell them apart.
    const buf = await zip({ "word/document.xml": "<document/>" });
    expect(await readXlsxSheet(buf)).toBe("not-a-workbook");
  });

  it("says nothing was in it when the sheet has no rows", async () => {
    const buf = await zip({ "xl/workbook.xml": "<workbook/>", "xl/worksheets/sheet1.xml": sheetXml([]) });
    expect(await readXlsxSheet(buf)).toBe("empty");
  });
});

describe("the header row is the first real one", () => {
  it("skips a title and a blank line, as a company template has", () => {
    // «COMPARISON OF QUOTATIONS» on its own line is a title, not a one-column header row.
    const table = gridToTable([["COMPARISON OF SUPPLIERS"], [], ["COMPANY", "PHONE"], ["Zahid", "0503372850"]]);
    expect(table?.headers).toEqual(["COMPANY", "PHONE"]);
    expect(table?.rows).toEqual([["Zahid", "0503372850"]]);
  });

  it("drops a trailing column that Excel declares and nobody filled", () => {
    const table = gridToTable([["COMPANY", "PHONE", ""], ["Zahid", "0503372850", ""]]);
    expect(table?.headers).toEqual(["COMPANY", "PHONE"]);
  });

  it("drops a blank line inside the used range", () => {
    const table = gridToTable([["COMPANY", "PHONE"], ["Zahid", "0503372850"], ["", ""], ["Salem", "0503372851"]]);
    expect(table?.rows).toHaveLength(2);
  });
});

/* ─────────────────────────────── the numbers ─────────────────────────────── */

describe("normalising a phone the way the backend does", () => {
  it("takes every spelling of one Saudi number to one string", () => {
    for (const raw of [
      "0503372850",
      "503372850",
      "966503372850",
      "00966503372850",
      "+966 50 337 2850",
      "+966-50-337-2850",
      "+966 0 50 337 2850", // the country code AND the trunk zero, a very common paste
      "٠٥٠٣٣٧٢٨٥٠", // an Arabic sheet
    ]) {
      expect(phoneE164(raw), raw).toBe("+966503372850");
    }
  });

  it("keeps a number that carries its own country code", () => {
    // A renter's list holds a UAE supplier; forcing it to +966 would invent a number.
    expect(phoneE164("+971 4 555 1234")).toBe("+97145551234");
  });

  it("accepts a Saudi landline, which a tender desk usually is", () => {
    expect(phoneE164("011 456 7890")).toBe("+966114567890");
  });

  it("refuses what is not a number instead of storing it", () => {
    // The backend stores an unparseable value as NULL — a raw string in `phone_e164` is a key that
    // can never match, so the screen has to say so while the renter can still fix it.
    for (const raw of ["call the office", "5033", "0503372850 / 0503372851 ext 4"]) {
      const out = normalizePhone(raw);
      expect(out && "problem" in out ? out.problem : null, raw).toBe("unreadable");
    }
  });

  it("reads nothing as nothing — an empty phone is not a problem", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe("what Excel's scientific notation did to the number", () => {
  it("calls a truncated cell truncated instead of inventing the missing digits", () => {
    // 9.66503E+11 IS 966,503,000,000. The last six digits were never written to the file, so any
    // expansion here would be a plausible wrong phone number.
    expect(readScientific("9.66503E+11")).toBe("truncated");
    const out = normalizePhone("9.66503E+11");
    expect(out && "problem" in out ? out.problem : null).toBe("truncated");
  });

  it("expands notation that kept all its digits", () => {
    expect(readScientific("9.66503372850E+11")).toEqual({ digits: "966503372850" });
    expect(phoneE164("9.66503372850E+11")).toBe("+966503372850");
  });

  it("leaves an ordinary number alone", () => {
    expect(readScientific("966503372850")).toBeNull();
  });
});

/* ───────────────────── the two halves, on one sheet ───────────────────── */

describe("the sheet from the owner's screenshot", () => {
  it("maps the phone column and normalises both spellings to the same supplier key", async () => {
    const out = await readXlsxSheet(await workbook());
    if (typeof out === "string") throw new Error(out);
    const mapping = out.headers.map(guessField);
    expect(mapping).toEqual(["name", "contactName", "phone"]);
    const rows = mapRows(out, mapping);
    expect(rows.map((r) => phoneE164(r.phone))).toEqual(["+966503372850", "+966503372850"]);
  });
});
