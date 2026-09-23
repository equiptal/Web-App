/**
 * The printed comparison sheet — the whole table, on paper.
 *
 * ── What the owner asked for (2026-09-09) ───────────────────────────────────────────────────────
 * *"i wanna the export template for compare table to be as full table with all but grouped by
 * section price or terms but showing moedatech logo at top and showing green and red too"*.
 *
 * What it replaced was four columns — supplier, rate, transport, grand total — so a renter who had
 * spent the afternoon reading eight term columns exported a sheet with none of them on it, and the
 * verdicts he was actually choosing by (this supplier meets the certificate, that one refuses it)
 * printed nowhere at all. The sheet now carries every column the screen does, under the screen's own
 * section bands, with the same green and the same red.
 *
 * **One derivation, two renderers.** The term columns and every cell's verdict come from
 * `buildTermColumns` and `readTerm`, the functions the matrix itself renders from, and the money
 * arrives already resolved by the caller from the same `computeCycleTotals` call. A sheet that
 * decides these for itself is a sheet that prints a term the screen dropped — and nothing fails
 * when it does; it just quietly disagrees with the screen it claims to be a copy of.
 *
 * **NO React and NO DOM.** It returns an HTML string; the caller opens the window.
 */

import { buildTermColumns, readTerm } from "@/components/workspace/CompareMatrix";
import type { WorkspaceBid } from "@/lib/contract/workspace";
import type { Dictionary } from "@/lib/i18n/en";
import { DS_ROOT_CSS } from "@/lib/ds-colors";

/** A money column, already resolved to one printed figure per bid. */
export interface SheetMoneyCol {
  label: string;
  /** The second line under the head — «for one cycle», «over 30 days». */
  sub?: string | null;
  /** Formatted for print, or null where the bid never stated it. */
  cell: (b: WorkspaceBid) => string | null;
  /** The cheapest bid on this column, marked the way the screen marks it. */
  win?: string | null;
}

export interface CompareSheetInput {
  bids: WorkspaceBid[];
  ar: boolean;
  t: Dictionary;
  L: (en: string, arr: string) => string;
  /** Title block: what is being compared, and where. */
  title: string;
  subtitle: string;
  /** Absolute URL — the sheet renders in a blank window, where a relative path resolves to nothing. */
  logoUrl?: string | null;
  /** The two money bands, in the screen's order. */
  perCycle: SheetMoneyCol[];
  grandTotal: SheetMoneyCol[];
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] as string);

/**
 * The sheet carries the app's own `:root` with it.
 *
 * ⚠️ The old export wrote `color:var(--navy)` and `border:1px solid var(--border)` into
 * `window.open("", "_blank")` — a document that inherits no stylesheet from this app, so every one
 * of those resolved to nothing and the sheet printed in the browser's defaults while claiming to be
 * branded. `DS_ROOT_CSS` is the fix the QUOTATION already uses for the same reason: one palette,
 * defined in the document that needs it, so this file writes tokens like every other surface rather
 * than a private copy of the numbers.
 */
const ROOT = DS_ROOT_CSS;

export function buildCompareSheet(input: CompareSheetInput): string {
  const { bids, ar, t, L, perCycle, grandTotal } = input;
  const termCols = buildTermColumns(bids, ar);
  const dir = ar ? "rtl" : "ltr";
  const align = ar ? "right" : "left";
  const moneyCols = [...perCycle, ...grandTotal];

  /* ── Two header decks, as on screen ─────────────────────────────────────────────────────────
     The BAND first (PER CYCLE · GRAND TOTAL · TERMS), then the columns under it. The supplier cell
     spans both decks, which is what the 96px supplier column does on screen and what keeps a name
     in line with its own figures. A band with no columns is omitted rather than drawn empty. */
  const band = (label: string, span: number, tint?: string) =>
    span > 0 ? `<th colspan="${span}" class="band"${tint ? ` style="background:${tint}"` : ""}>${esc(label)}</th>` : "";

  const head =
    `<tr>` +
    `<th class="band sup" rowspan="2">${esc(t.workspace.supplier)}</th>` +
    band(t.workspace.perCycle, perCycle.length) +
    band(t.workspace.grandTotal, grandTotal.length, "var(--surface2)") +
    band(t.workspace.groupTerms, termCols.length) +
    `</tr><tr>` +
    moneyCols
      .map((c) => `<th class="col">${esc(c.label)}${c.sub ? `<span class="sub">${esc(c.sub)}</span>` : ""}</th>`)
      .join("") +
    termCols.map((c) => `<th class="col">${esc(ar ? c.labelAr : c.labelEn)}</th>`).join("") +
    `</tr>`;

  const body = bids
    .map((b) => {
      const money = moneyCols
        .map((c) => {
          const v = c.cell(b);
          // The cheapest figure is the one thing the sheet editorialises about, in the green the
          // screen uses for the same fact.
          const win = c.win != null && c.win === b.card.id;
          return v == null
            ? `<td class="q">${esc(t.workspace.didntSay)}</td>`
            : `<td class="num${win ? " win" : ""}">${esc(v)}</td>`;
        })
        .join("");
      const rowsOf = [...(b.card.negotiableTerms ?? []), ...b.card.terms.contract, ...b.card.terms.equipment];
      const terms = termCols
        .map((col) => {
          const row = rowsOf.find((r) => col.keys.includes(r.key)) ?? null;
          const a = readTerm(row, col.keys[0], ar, t, L, col.group);
          const cls = a.against ? "bad" : a.met ? "good" : a.text ? "" : "q";
          /* ✗ before a requirement he refused. Without it «TÜV» refused and «TÜV» met are the same
             word twice — and a printed sheet may be read in black and white, or photocopied, where
             the colour is the first thing to go. */
          const mark = a.refused ? "✗ " : "";
          return `<td class="${cls}">${esc(mark + (a.text ?? t.workspace.didntSay))}</td>`;
        })
        .join("");
      const src = b.source === "offline" ? t.workspace.offlineInvite : t.workspace.sourceApp;
      return `<td class="sup">${esc(b.card.supplierName)}<span class="src">${esc(src)}</span></td>${money}${terms}`;
    })
    .map((cells) => `<tr>${cells}</tr>`)
    .join("");

  const logo = input.logoUrl ? `<img class="logo" src="${esc(input.logoUrl)}" alt="Moedatech" />` : "";

  const css = [
    ROOT,
    "@page{size:A4 landscape;margin:10mm}",
    "*{box-sizing:border-box}",
    `body{font:13px system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;padding:20px;color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}`,
    `.head{display:flex;align-items:center;gap:12px;border-bottom:2px solid var(--brand);padding-bottom:10px;margin-bottom:14px}`,
    ".logo{height:30px;width:auto}",
    "h1{font-size:16px;margin:0;font-weight:800}",
    `.sub-t{margin:2px 0 0;color:var(--muted);font-size:11px}`,
    "table{border-collapse:collapse;width:100%;table-layout:fixed}",
    `th,td{border:1px solid var(--border);padding:6px 8px;text-align:${align};font-size:11px;vertical-align:middle;word-break:break-word}`,
    `th.band{background:var(--surface2);font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;text-align:center}`,
    `th.col{background:var(--surface);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--muted)}`,
    `th.col .sub{display:block;font-weight:600;text-transform:none;letter-spacing:0;color:var(--muted-light)}`,
    "th.sup,td.sup{width:150px}",
    "td.sup{font-weight:800}",
    `td.sup .src{display:block;font-weight:600;font-size:9px;color:var(--muted)}`,
    "td.num{font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:700}",
    `td.num.win{color:var(--ok);background:var(--ok-soft)}`,
    `td.good{color:var(--ok);background:var(--ok-soft);font-weight:700}`,
    `td.bad{color:var(--danger);background:var(--danger-soft);font-weight:700}`,
    `td.q{color:var(--muted-light)}`,
    "tr{break-inside:avoid}",
    `.foot{margin-top:12px;color:var(--muted-light);font-size:9.5px}`,
  ].join("");

  return (
    `<!doctype html><html dir="${dir}"><head><meta charset="utf-8">` +
    `<title>${esc(input.title)}</title><style>${css}</style></head><body>` +
    `<div class="head">${logo}<div><h1>${esc(input.title)}</h1>` +
    `<p class="sub-t">${esc(input.subtitle)}</p></div></div>` +
    `<table><thead>${head}</thead><tbody>${body}</tbody></table>` +
    `<p class="foot">${esc(t.workspace.exportLegend)}</p>` +
    `</body></html>`
  );
}
