import { SHEET_MAX_ROWS, type SheetTable } from "./sheet-paste";

/**
 * Reading an `.xlsx` supplier list, without a spreadsheet library and without a zip library.
 *
 * ── Why this exists (owner, 2026-09-08: *"can't we add xlsx?"*) ─────────────────────────────────
 *
 * The import took CSV only, and the refusal told the renter to save his workbook as CSV first. Two
 * costs came with that advice, and the second one is the reason this file exists rather than a
 * reworded message:
 *
 *   · It is a chore, on the file he already has.
 *   · **CSV loses the phone numbers.** Excel stores a 12-digit number like `966503372850` as a
 *     number, displays it as `9.66503E+11`, and writes *the displayed text* to CSV. The digits are
 *     gone at that point — no normaliser can recover them, because 9.66503×10¹¹ really is
 *     966,503,000,000. Read straight out of the workbook, the cell still holds every digit.
 *
 * ── Why there is still no dependency ────────────────────────────────────────────────────────────
 *
 * `sheet-paste.ts` refused SheetJS: ~1 MB of JavaScript to undo a zip so we can read forty rows of
 * text. That reasoning holds, and it turns out nothing has to be installed at all:
 *
 *   · an `.xlsx` is a ZIP, and the browser inflates DEFLATE natively — `DecompressionStream`
 *     ("deflate-raw"), which is also a global in Node 18+, so this file is testable with no DOM
 *   · the parts we need are small XML documents, read here with regexes rather than a DOM parser,
 *     for the same reason the CSV parser is hand-written: the vocabulary is four tags wide
 *
 * ── NO React, NO DOM ────────────────────────────────────────────────────────────────────────────
 * Same rule as `sheet-paste.ts`, and it is what lets the tests build a workbook and read it back
 * without a browser.
 *
 * ⚠️ **Values, not formats.** A cell's number format is ignored, so a DATE column arrives as Excel's
 * serial number (`45912`) rather than a date. No supplier list keeps a date in a column we map, and
 * carrying a format engine in here to be right about one would be the SheetJS argument again. Such a
 * column rides along under `extra` as the number it is.
 */

/* ─────────────────────────────── the zip container ─────────────────────────────── */

/** One entry we care about: where its bytes are and how they were stored. */
interface ZipEntry {
  name: string;
  /** 0 = stored verbatim, 8 = DEFLATE. Anything else is a format we do not read. */
  method: number;
  start: number;
  size: number;
}

const u16 = (b: DataView, o: number) => b.getUint16(o, true);
const u32 = (b: DataView, o: number) => b.getUint32(o, true);

/**
 * Read the zip's central directory.
 *
 * The central directory is at the END of the file and is the only authority on what is inside it:
 * walking local headers forwards works until one entry has a data descriptor instead of a size, at
 * which point there is no way to find the next header. So the EOCD record is found by scanning
 * backwards for its signature, and every entry is read from the directory it points at.
 */
function readZip(buf: Uint8Array): ZipEntry[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // 0x06054b50, the end-of-central-directory signature. It sits at most 64 KB from the end (the
  // comment field's own maximum), so the scan is bounded.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66_000); i--) {
    if (u32(view, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];

  const count = u16(view, eocd + 10);
  let p = u32(view, eocd + 16);
  const out: ZipEntry[] = [];
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (u32(view, p) !== 0x02014b50) break; // central-directory header signature
    const method = u16(view, p + 10);
    const size = u32(view, p + 20);
    const nameLen = u16(view, p + 28);
    const extraLen = u16(view, p + 30);
    const commentLen = u16(view, p + 32);
    const localOff = u32(view, p + 42);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));

    // The local header repeats the name and extra fields, and its extra field can be a DIFFERENT
    // length from the directory's — so the data offset is computed from the local header, never by
    // reusing the numbers above.
    if (localOff + 30 <= buf.length && u32(view, localOff) === 0x04034b50) {
      const lNameLen = u16(view, localOff + 26);
      const lExtraLen = u16(view, localOff + 28);
      out.push({ name, method, start: localOff + 30 + lNameLen + lExtraLen, size });
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** One entry's bytes as text. `deflate-raw` is what a zip holds — not zlib, so no header to skip. */
async function readEntry(buf: Uint8Array, e: ZipEntry): Promise<string> {
  const raw = buf.subarray(e.start, e.start + (e.method === 0 ? e.size : buf.length - e.start));
  if (e.method === 0) return new TextDecoder().decode(raw);
  if (e.method !== 8) throw new Error(`unsupported zip method ${e.method}`);
  // A compressed entry's stored length is not in the local header when a data descriptor is used,
  // so the stream is handed everything from here to the end of the file: inflate stops on its own
  // at the end of the deflate stream and ignores the trailing bytes.
  const stream = new Blob([raw as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

/* ─────────────────────────────── the workbook's XML ─────────────────────────────── */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Undo the five named entities and the numeric ones. A supplier list is full of «&» and «'». */
function unescapeXml(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) return String.fromCodePoint(parseInt(body.slice(2), 16));
    if (body.startsWith("#")) return String.fromCodePoint(parseInt(body.slice(1), 10));
    return ENTITIES[body] ?? whole;
  });
}

/** Every `<t>` run inside one element, joined. Rich text splits one cell across several runs. */
function textRuns(xml: string): string {
  const out: string[] = [];
  for (const m of xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) out.push(unescapeXml(m[1]));
  // A `<t/>` run is an empty string, which `matchAll` above does not see and does not need to.
  return out.join("");
}

/** The shared-string pool, in order — `t="s"` cells hold an index into it. */
function sharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textRuns(m[1]));
}

/** `"BC12"` → `{ col: 54, row: 12 }`, zero-based column. A1 notation is base-26 with no zero. */
function refToPosition(ref: string): { col: number; row: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: Number(m[2]) - 1 };
}

/**
 * One sheet's cells into a sparse grid.
 *
 * A cell's value depends on `t`: `s` is an index into the shared pool, `inlineStr` carries its own
 * `<is><t>`, `str` is a formula's cached string, `b` is a boolean, and no `t` at all means the `<v>`
 * is a number — which is the case this whole file was written for, because that is how Excel stores
 * a phone number that was typed without a leading apostrophe.
 */
function sheetGrid(xml: string, pool: string[]): string[][] {
  const grid: string[][] = [];
  for (const m of xml.matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1];
    const body = m[2] ?? "";
    const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
    const at = ref ? refToPosition(ref) : null;
    if (!at) continue;

    const type = /\bt="([a-zA-Z]+)"/.exec(attrs)?.[1] ?? "n";
    const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
    let value = "";
    if (type === "s") value = pool[Number(v)] ?? "";
    else if (type === "inlineStr") value = textRuns(body);
    else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
    else if (type === "e") value = ""; // an error cell (#N/A) is not data
    else value = unescapeXml(v);

    while (grid.length <= at.row) grid.push([]);
    const row = grid[at.row];
    while (row.length <= at.col) row.push("");
    row[at.col] = value.trim();
  }
  return grid;
}

/* ─────────────────────────────── the public read ─────────────────────────────── */

/** What went wrong, in the terms the panel explains it to the renter in. */
export type XlsxError = "not-a-workbook" | "no-sheet" | "empty";

/**
 * Read the first populated worksheet of an `.xlsx` into the same table the CSV parser produces.
 *
 * The header row is the first row carrying two or more values, exactly as `parseSheet` requires —
 * a company template usually has a title, a blank line and only then its headers, and treating the
 * title as the header row would map one column and drop the rest.
 *
 * Returns a string error rather than throwing: every outcome here is something the renter is told,
 * and an exception would make the caller invent the message.
 *
 * ⚠️ **The first worksheet by FILE ORDER, not by tab order.** Resolving the tab order properly means
 * reading `xl/workbook.xml` and following its `r:id` through `xl/_rels/workbook.xml.rels`, and the
 * two agree in every workbook Excel itself writes. The cost of being wrong is reading the wrong tab
 * of a multi-tab workbook, which the renter sees at once in the preview — so it is a visible,
 * correctable slip rather than a silent one, and the preview is the reason it can stay that way.
 */
export async function readXlsxSheet(bytes: ArrayBuffer): Promise<SheetTable | XlsxError> {
  const buf = new Uint8Array(bytes);
  const entries = readZip(buf);
  // Every `.xlsx` has this part. A `.docx` renamed to `.xlsx` is a valid zip and does not.
  if (!entries.some((e) => e.name === "xl/workbook.xml")) return "not-a-workbook";

  const sheets = entries
    .filter((e) => /^xl\/worksheets\/sheet[^/]*\.xml$/.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  if (sheets.length === 0) return "no-sheet";

  const poolEntry = entries.find((e) => e.name === "xl/sharedStrings.xml");
  let pool: string[] = [];
  try {
    if (poolEntry) pool = sharedStrings(await readEntry(buf, poolEntry));
  } catch {
    // A workbook whose string pool will not inflate is not readable at all.
    return "not-a-workbook";
  }

  for (const sheet of sheets) {
    let grid: string[][];
    try {
      grid = sheetGrid(await readEntry(buf, sheet), pool);
    } catch {
      return "not-a-workbook";
    }
    const table = gridToTable(grid);
    if (table) return table;
  }
  return "empty";
}

/**
 * A sparse grid into headers + rows.
 *
 * Exported for the tests, which build grids directly to pin the header-row rule without writing a
 * workbook for each case.
 */
export function gridToTable(grid: string[][]): SheetTable | null {
  const headerAt = grid.findIndex((r) => r.filter((c) => c.trim()).length >= 2);
  if (headerAt < 0) return null;

  const headers = grid[headerAt].map((h) => h.trim());
  // Trailing empty columns: Excel writes a used range, not a table, so a sheet that once had a
  // sixth column still declares one. A column with no header and no values is not a column.
  let width = headers.length;
  const body = grid.slice(headerAt + 1);
  for (const row of body) width = Math.max(width, row.length);
  while (width > 0 && !headers[width - 1]?.trim() && !body.some((r) => r[width - 1]?.trim())) width--;
  if (width < 2) return null;

  const rows = body
    .map((cells) => Array.from({ length: width }, (_, i) => cells[i] ?? ""))
    // A wholly blank line inside the used range is not a supplier — the CSV path drops these too.
    .filter((cells) => cells.some((c) => c.trim()))
    .slice(0, SHEET_MAX_ROWS);
  if (rows.length === 0) return null;

  return { headers: Array.from({ length: width }, (_, i) => headers[i] ?? ""), rows };
}
