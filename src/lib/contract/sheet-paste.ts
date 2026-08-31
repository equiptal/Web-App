/**
 * SUP-T23 — reading a supplier list out of a spreadsheet, without a spreadsheet library.
 *
 * ── Why there is no SheetJS here ────────────────────────────────────────────────────────────────
 *
 * The plan said parse `.xlsx` client-side. That means a ~1 MB dependency whose only job is to undo a
 * zip container so we can read forty rows of text — and a renter with the file open in Excel already
 * has a faster way to give it to us: **select the rows and press copy.** The clipboard carries them as
 * tab-separated text, which is twenty lines of parsing and no dependency at all.
 *
 * So this reads two things, and they are the same thing:
 *   · a **paste** from Excel, Google Sheets or Numbers — tab-separated
 *   · a **CSV file**, which is what "Save as" produces everywhere
 *
 * `.xlsx` upload stays open as a follow-up if renters ask for it. Nobody has yet, and adding a parser
 * for a format the source application can export out of is a cost with no reader.
 *
 * ── NO React, NO DOM ────────────────────────────────────────────────────────────────────────────
 */

/** What a mapped column becomes. `extra` keeps the renter's own column as it is; `skip` drops it. */
export type SheetField = "name" | "contactName" | "email" | "phone" | "crNumber" | "extra" | "skip";

export interface SheetTable {
  headers: string[];
  rows: string[][];
}

/** A renter's sheet is not a schema, so no import may ever be all-or-nothing. */
export const SHEET_MAX_ROWS = 500;

/**
 * Split one delimited line, honouring quotes.
 *
 * A company name with a comma in it — "Zahid Tractor, Riyadh Branch" — is the ordinary case in a
 * supplier list, not an edge one. A naive `split(",")` turns that single firm into two columns and
 * shifts every field after it, which is the kind of corruption a renter only notices weeks later.
 */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      // A doubled quote inside a quoted cell is one literal quote — the CSV escape everywhere.
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      out.push(cell.trim());
      cell = "";
    } else {
      cell += ch;
    }
  }
  out.push(cell.trim());
  return out;
}

/**
 * Read pasted or uploaded text into a header row and its rows.
 *
 * **The delimiter is decided by the header line**, not by where the text came from: a paste is tabs,
 * a CSV is commas, and a CSV pasted into the box is still commas. Counting beats assuming.
 *
 * Returns `null` when there is nothing usable — one line, or no columns — so the caller can say so
 * rather than showing an empty mapping table and letting the renter wonder what he did wrong.
 */
export function parseSheet(text: string): SheetTable | null {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;

  const tabs = (lines[0].match(/\t/g) ?? []).length;
  const commas = (lines[0].match(/,/g) ?? []).length;
  const delimiter = tabs >= commas && tabs > 0 ? "\t" : ",";

  const headers = splitLine(lines[0], delimiter);
  if (headers.filter(Boolean).length < 2) return null;

  const rows = lines.slice(1, SHEET_MAX_ROWS + 1).map((l) => {
    const cells = splitLine(l, delimiter);
    // Short rows are normal — a trailing empty column is not typed. Pad rather than reject.
    while (cells.length < headers.length) cells.push("");
    return cells.slice(0, headers.length);
  });

  return { headers, rows };
}

/**
 * A first guess at what each column is, from its header.
 *
 * Deliberately generous, and deliberately not trusted: every guess is shown in a dropdown the renter
 * can change before anything is imported. Guessing saves five clicks; guessing silently would put a
 * phone number in the CR column of forty suppliers.
 */
export function guessField(header: string): SheetField {
  const h = header.toLowerCase().replace(/[^a-z؀-ۿ]/g, "");
  if (/^(company|companyname|supplier|suppliername|name|vendor|شركة|المورد|الاسم)/.test(h)) return "name";
  if (/(contactperson|contactname|contact|person|attn|جهةالاتصال|المسؤول)/.test(h)) return "contactName";
  if (/(email|mail|بريد)/.test(h)) return "email";
  if (/(phone|mobile|tel|whatsapp|هاتف|جوال)/.test(h)) return "phone";
  if (/(cr|crno|crnumber|commercial|registration|السجل)/.test(h)) return "crNumber";
  return "extra";
}

export interface MappedRow {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  crNumber: string;
  extra: Record<string, string>;
}

/** Apply the mapping. Unmapped columns ride along under `extra` — nothing the renter typed is lost. */
export function mapRows(table: SheetTable, mapping: SheetField[]): MappedRow[] {
  return table.rows.map((cells) => {
    const out: MappedRow = { name: "", contactName: "", email: "", phone: "", crNumber: "", extra: {} };
    mapping.forEach((field, i) => {
      const value = cells[i] ?? "";
      if (!value || field === "skip") return;
      if (field === "extra") out.extra[table.headers[i] || `column ${i + 1}`] = value;
      else out[field] = value;
    });
    return out;
  });
}

/** A row is worth importing once it names a firm AND carries a way to reach it — the add rule. */
export const importable = (r: MappedRow): boolean => !!r.name.trim() && !!(r.email.trim() || r.phone.trim());
