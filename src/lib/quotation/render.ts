/**
 * ONE quotation template, shared by the workspace's bid-quotation download and the deal-room
 * quotation (preview + final), so both look identical and match the APP's own sheet.
 *
 * 🔴 **This is the `q3` template**, ported from `Moedatech-App`'s `quotation_document.dart` — the
 * owner's own instruction on handing the design over: *"this is the quotation template u must follow
 * in the preview and in the pdf for all web and app"*. The app shipped it on 2026-09-16 and its own
 * change log recorded the other half as owed: *"WEB IS NOT DONE, and it is a separate renderer"*.
 * ~~A navy gradient header, avatar circles, a three-column meta strip, a "listed equipment" chip
 * block, a six-column table with delivery and return as indented SUB-ROWS, a boxed amount in words,
 * and the terms as key/value cards.~~ Every one of those is gone; see each block below for what
 * replaced it.
 *
 * Pure string builder — no React. Callers map their own data into `QuotationDoc`; number formatting,
 * amount-in-words and the CSS all live here so the two surfaces can never drift apart again.
 */

import { DS_ROOT_CSS } from "@/lib/ds-colors";

export type QLang = "en" | "ar";

/** One `LABEL` over its value in the title bar (the app’s _RefPair). */
export interface QuotationRef {
  label: string;
  value: string;
}

/** One labelled line inside a party box. A row with no value is dropped by the CALLER, never printed
 *  empty: «VAT: —» is not a fact, and a Saudi tax document stating a blank VAT number is worse than
 *  one stating none (the app's `_rows`). */
export interface QuotationPartyRow {
  label: string;
  value: string;
}

export interface QuotationParty {
  /** The bilingual eyebrow, already composed by the caller (`SUPPLIER / المورد`). */
  label: string;
  name: string;
  /** A green tick beside the NAME. It states a checked company registration and nothing else — the
   *  app refuses it for an individual however much else is on file. */
  verified?: boolean;
  /**
   * The party's own mark, drawn at the box's TRAILING edge beside the text column.
   *
   * 🔴 ~~**A MARK ONLY EXISTS BEHIND A VERIFIED PARTY** — a profile can carry a logo while its firm
   * is unverified, and printing it puts a company's brand on a document beside a party nobody has
   * checked.~~ **WITHDRAWN 2026-09-22 on the owner's word** (*"the supplier logo must appear at top
   * and at footer beside his name"*), and it now matches the ruling the NAMES took the same day: a
   * mark, like a company name, is the firm's own CLAIM, and the thing that says whether anyone
   * checked it is the verified tick drawn beside it. One gate for both, or a document names a firm it
   * refuses to show the mark of.
   *
   * ⚠️ Absent, NOTHING is drawn: an empty tile reads as a mark that failed to load.
   */
  logoUrl?: string | null;
  rows: QuotationPartyRow[];
}

/**
 * One money cell in the three per-unit columns.
 *
 * 🔴 Three states, and the difference is the point (app parity): a FIGURE is a price, `–` is a leg
 * both parties agreed is not the supplier's, and «Not priced» is a leg nobody put a number on.
 * Collapsing the last two tells a renter a price is still coming when it never was. A zero is
 * `unpriced`, never `0` — a zero in a money column reads as FREE, which is a claim no supplier made.
 */
export type QuotationMoneyCell =
  | { kind: "amount"; text: string }
  | { kind: "excluded" }
  | { kind: "unpriced" };

/**
 * ONE ROW PER MACHINE, with delivery and return as COLUMNS.
 *
 * ~~A numbered rental row with its two transport legs as indented `↳` sub-rows.~~ On a single-machine
 * bid both print the same figures; on a multi-item one this reads as a quotation and that read as a
 * list of charges.
 */
export interface QuotationLineItem {
  /** `المعدة` — the machine's own name, nothing else. */
  equipment: string;
  /** `الوصف` — the labelled specs the app prints: size · year · model · manufacturer.
   *
   *  ⚠️ STRUCTURED, never a pre-built HTML run: the label is bold and the value is not, and a caller
   *  composing that itself would be a caller escaping its own values. */
  description: { label: string; value: string }[];
  /** `الوحدة` — the unit COUNT, a bare number. */
  units: string;
  /** `المدة` — the billing period as an ADJECTIVE (`daily` / `يومي`), never a noun. */
  duration: string;
  rental: QuotationMoneyCell;
  delivery: QuotationMoneyCell;
  ret: QuotationMoneyCell;
  /** `الإجمالي` — this row's own total, already formatted. */
  total: string;
  /** A small note above the total (the divisor behind a weekly/monthly rate, «As operated», …). */
  totalNote?: string | null;
}

/**
 * One numbered term on the document.
 *
 * The app resolves each term's value the same way the terms modal does — deal-room LOCKED value →
 * latest counter → the supplier's declaration → the request's own side — so a clause can never state
 * a term the room contradicts.
 */
export interface QuotationClause {
  /** The bold lead-in (`Maintenance`). Absent on a legal clause, which is plain prose. */
  title?: string | null;
  body: string;
}

/** The navy footer band: the SUPPLIER's mark, name and registration. Nothing else — a platform mark
 *  in the supplier's own footer credits the wrong party. */
export interface QuotationFooter {
  name: string;
  address?: string | null;
  logoUrl?: string | null;
  crNumber?: string | null;
  vatNumber?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface QuotationDoc {
  lang: QLang;
  /** The SHORT title (`عرض سعر`). The long form wrapped and pushed the references onto a second row. */
  title: string;
  /** The terminal state, beside the title. A live quotation gets NO stamp: a sheet that stamps its own
   *  normal state teaches the reader to ignore the stamp, and then the withdrawn one is ignored too. */
  statusStamp?: { label: string; tone: "ok" | "muted" } | null;
  quotationNumber: string;
  dateStr: string;
  /**
   * The REQUEST's own code, printed on the SIGNATURE STRIP rather than in the reference strip.
   *
   * 🔴 App parity, and it is a placement the app arrived at deliberately: that strip is the one band
   * on the sheet that speaks for the PLATFORM rather than for the supplier, so the request id and the
   * support address belong on it, and the navy footer below stays the supplier's.
   */
  requestRef?: string | null;
  /** The platform's support address, at the end of the signature strip (app parity). Absent, the
   *  strip simply ends at the date. */
  supportEmail?: string | null;
  /** The title bar's reference strip, in the caller's order (ref · issue · valid until · site · currency). */
  refs: QuotationRef[];
  supplier: QuotationParty;
  rentee: QuotationParty;
  lineItems: QuotationLineItem[];
  currency: string;
  /** `label`/`valueOverride` reframe the grand row for open-ended bids (app parity: "Total / unit · day"). */
  totals: { subtotal: number; vat: number; total: number; label?: string; valueOverride?: string };
  /** The term sentences. The legal clauses follow them in the SAME numbered list, after a hairline. */
  clauses: QuotationClause[];
  legal: string[];
  /** Show the "electronically signed" strip (default true). */
  showSigned?: boolean;
  /** The platform's mark, at the END of the signature strip (app parity).
   *
   *  ⚠️ On a white tile, because the mark is dark-on-light and disappears into the strip's green tint
   *  without one — and at the strip's end rather than beside the tick, where it read as a second
   *  bullet in the sentence instead of as the seal on a signature. */
  sealUrl?: string | null;
  /**
   * **The renter's own gap, named on his own document** (owner, 2026-09-22).
   *
   * Drawn when the RENTER viewing this paper has no verified company, or has one with no mark: his
   * side of the header prints as a bare name beside a supplier carrying a logo and a tick, and
   * nothing anywhere told him why or what to do about it.
   *
   * 🔴 **His OWN gap only, never the supplier's.** A strip naming a missing supplier mark would
   * tell the renter to fix something only the supplier can, on a document the supplier wrote.
   *
   * 🔴 **SCREEN ONLY.** `@media print` drops it, and no caller passes it into a PDF, a share or an
   * e-mail: it is an invitation to the one person reading it in the app, and on a paper handed to a
   * counterparty it would be a note about the reader's own account printed on someone else's copy.
   */
  ownerPrompt?: { text: string; actionLabel?: string | null; href?: string | null } | null;
  footer?: QuotationFooter | null;
  /** Appended after the amount-in-words (app parity: "Estimate for one day · Final amount as operated"). */
  amountWordsSuffix?: string;
  /**
   * What the amount-in-words line spells out. Defaults to the grand total.
   *
   * ⚠️ An OPEN-ENDED bid passes the recurring rental instead (the app's `amountInWordsValue`): the
   * grand total folds in a one-time mobilisation fee, and spelling that out under a line framed as
   * "estimate for one period" states a per-period figure that includes a charge paid once.
   */
  amountWordsValue?: number;
  /**
   * When set, the document renders as a **DRAFT**: this label as a header badge AND as a diagonal
   * watermark across the page, and the "electronically signed" block is suppressed unconditionally.
   *
   * ⚠️ WEB-ONLY — the app's template has no such slot, and this is kept anyway. A pre-confirmation
   * quotation is not a document anyone may rely on: the supplier can still counter. An unmarked one
   * is how a renter concludes the deal is done (and how a third party receiving the PDF concludes it
   * is binding), so the marking lives HERE, in the shared renderer, rather than in each caller where
   * it could be forgotten.
   */
  draftLabel?: string | null;
}

/**
 * The `q3` stylesheet.
 *
 * ⚠️ Every colour is a TOKEN. This file is exempt from `font-drift` (it renders in a blank
 * `window.open`, where `var(--font-sans)` points at a `next/font` face that does not exist there) and
 * is NOT exempt from `palette-drift`, which is the right way round: the faces have to be real names,
 * the colours must not be.
 *
 * ⚠️ The faces are the design's own — Tajawal for Arabic, Inter for the Latin runs and every figure
 * (owner, 2026-09-18). They are loaded by `wrapQuotationPage`'s Google Fonts link and each stack ends
 * in a real system fallback, because a printed document must not depend on a network.
 */
export const QUOTATION_STYLE = `${DS_ROOT_CSS}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Tajawal','Inter',system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--navy-deep);background:var(--surface2);-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .q-doc{position:relative;width:100%;max-width:880px;margin:20px auto;background:var(--surface);border-radius:14px;overflow:hidden;page-break-after:always;}
  .q-doc:last-child{page-break-after:auto;}
  .q-num{font-family:'Inter',system-ui,sans-serif;unicode-bidi:isolate;}
  /* DRAFT marking (pre-confirmation quotations) — a badge in the header and a diagonal watermark over
     the page, so an exported or printed draft can never be mistaken for the signed document. */
  .q-draft{display:inline-block;font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--brand-deep);background:var(--brand-soft);border:1px solid var(--brand-light);border-radius:4px;padding:3px 9px;}
  .q-wm{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;overflow:hidden;pointer-events:none;}
  .q-wm b{transform:rotate(-32deg);font-size:76px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;color:color-mix(in srgb, var(--brand) 13%, transparent);}

  /* ── Title bar ───────────────────────────────────────────────────────────────────────────────
     White, with a 2px navy rule under it. The navy lives on the footer and this rule; a second navy
     band competes with the one that matters. */
  .q-head{border-bottom:2px solid var(--navy-deep);padding:20px 30px 14px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 18px;}
  .q-head-l{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
  .q-title{font-size:22px;font-weight:900;color:var(--navy-deep);line-height:1.2;}
  /* Outlined, never filled: a filled block beside the title reads as a second heading, and the heading
     of this sheet is the word «عرض سعر». */
  .q-stamp{border:1.2px solid currentColor;border-radius:4px;padding:2px 8px;font-size:10px;font-weight:800;letter-spacing:.04em;white-space:nowrap;}
  .q-stamp.is-ok{color:var(--ok);}
  .q-stamp.is-muted{color:var(--muted-light);}
  /* ⚠️ The label is NOT upper-cased here. The app’s own _RefPair draws whatever string it is handed, and
     its own labels are sentence case («Issue date», «Valid until»); a text-transform on top of them
     shouted five references at a reader who only ever quotes one. */
  .q-refs{display:flex;flex-wrap:wrap;gap:10px 18px;font-size:12px;color:var(--muted-dark);}
  .q-ref span{display:block;font-family:'Inter',system-ui,sans-serif;font-size:9.5px;font-weight:700;color:var(--muted-light);}
  .q-ref b{font-weight:800;}
  .q-body{padding:24px 30px 28px;}

  /* ── Parties ─────────────────────────────────────────────────────────────────────────────────
     Two bordered boxes. ONE FIELD PER LINE, each with its own label — «الرياض · س.ت: 1010… · ض.ق.م:
     3000…» is a sentence a reader has to parse before finding the one number they came for. */
  .q-parties{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;margin-bottom:16px;}
  /* The mark sits BESIDE the text column, never above it: a row of its own reserves its height whether
     or not anything follows, which is the band of white the app's owner saw between a party's name and
     its details. Alongside, the mark costs no vertical space at all. */
  .q-party{display:flex;align-items:flex-start;gap:10px;border:1px solid var(--border-hair);border-radius:10px;padding:12px 16px;}
  .q-party-t{flex:1 1 auto;min-width:0;}
  .q-eyebrow{font-family:'Inter',system-ui,sans-serif;font-size:9.5px;font-weight:700;letter-spacing:.5px;color:var(--muted-light);}
  .q-pname{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:3px;}
  /* 48px and NO tile behind it (app). A bordered white square left an empty rectangle whenever the
     image failed, which reads as a broken mark rather than as no mark. */
  .q-plogo{flex:0 0 auto;width:48px;height:48px;object-fit:contain;}
  .q-pn{font-size:14px;font-weight:800;color:var(--navy-deep);line-height:1.25;min-width:0;}
  .q-tick{flex:0 0 auto;display:inline-grid;place-items:center;width:14px;height:14px;border-radius:50%;background:var(--ok);color:var(--surface);font-size:9px;line-height:1;font-weight:900;}
  /* 🔴 ONE RUN, «label: value», never two columns. ~~The label on the start edge and the value pushed
     to the end.~~ A value long enough to wrap then broke into its own narrow column with the label
     stranded opposite it; the app sets these as one Text.rich so the pair wraps together. */
  .q-prow{font-size:10.5px;font-weight:500;line-height:1.5;color:var(--muted);margin-top:3px;overflow-wrap:anywhere;}
  .q-prow b{font-weight:700;color:var(--muted-light);}

  /* ── Items ───────────────────────────────────────────────────────────────────────────────────
     Eight columns, one row per machine. The head is PALE; the three per-unit money columns carry a
     per-unit sub-line, which is what tells the reader the figure below is per machine and not the
     line's total — the single most misreadable thing on the sheet. */
  .q-tw{border:1px solid var(--border-hair);border-radius:10px;overflow:hidden;margin-bottom:10px;}
  .q-table{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed;}
  .q-table th{background:var(--surface2);padding:10px 6px;font-weight:700;color:var(--muted-dark);text-align:start;vertical-align:top;}
  .q-table th.c{text-align:center;}
  .q-table th i{display:block;font-style:normal;font-size:8.5px;font-weight:600;color:var(--muted-light);}
  .q-table td{padding:8px 6px;border-top:1px solid var(--border-hair);vertical-align:top;overflow-wrap:anywhere;}
  .q-table td.c{text-align:center;}
  .q-eq{font-weight:700;color:var(--navy-deep);}
  .q-desc{font-size:10px;color:var(--muted);}
  .q-desc b{color:var(--muted-dark);font-weight:700;}
  .q-money{font-family:'Inter',system-ui,sans-serif;color:var(--muted);unicode-bidi:isolate;}
  .q-total{font-family:'Inter',system-ui,sans-serif;font-weight:700;color:var(--navy-deep);unicode-bidi:isolate;}
  .q-total .n{display:block;font-family:'Tajawal',system-ui,sans-serif;font-size:9px;font-weight:600;color:var(--muted-light);}
  .q-dash{color:var(--border-strong);}
  .q-unpriced{font-style:italic;color:var(--border-strong);font-size:9.5px;}
  /* Every total sits in the column the row figures are in, the grand total included: the one figure a
     reader came for must not be the only one somewhere else. */
  .q-table tfoot td{border-top:1px solid var(--border-hair);padding:8px 6px;font-size:11px;color:var(--muted-light);text-align:end;white-space:nowrap;}
  .q-table tfoot td.v{font-family:'Inter',system-ui,sans-serif;font-size:11.5px;color:var(--muted-dark);text-align:center;unicode-bidi:isolate;}
  .q-table tfoot tr.grand td{background:var(--surface2);border-top:2px solid var(--navy-deep);padding:12px 6px;font-size:13px;font-weight:800;color:var(--navy-deep);}
  .q-table tfoot tr.grand td.v{font-weight:800;}
  .q-table tfoot tr.grand .g{font-family:'Inter',system-ui,sans-serif;font-size:16px;}
  .q-table tfoot tr.grand .cur{font-size:10.5px;font-weight:700;color:var(--muted);}
  .q-words{font-size:11px;color:var(--muted-light);margin:0 2px 20px;line-height:1.5;}
  .q-words b{font-weight:800;color:var(--muted-dark);}

  /* ── Terms ───────────────────────────────────────────────────────────────────────────────────
     ONE numbered list: the term sentences first, then the platform's legal clauses after a hairline. */
  .q-th{font-weight:800;font-size:14px;color:var(--navy-deep);margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid var(--navy-deep);display:inline-block;}
  .q-tc{margin:0;padding-inline-start:22px;font-size:12px;line-height:1.75;color:var(--navy);}
  .q-tc li{margin-bottom:14px;padding-inline-start:4px;}
  .q-tc li.rule{padding-top:10px;border-top:1px solid var(--border-hair);}
  .q-tc b{color:var(--navy-deep);font-weight:800;}

  /* The renter's own gap, on his own document (owner, 2026-09-22). Orange — «pay attention», not
     «something is wrong with this offer», which is what a red strip on a supplier's quotation would
     say. 🔴 SCREEN ONLY: the print media query below drops it, because it is an invitation to the
     reader and not part of the paper anyone is handed.
     ⚠️ NO BACKTICKS in this block: it lives inside a template literal, and one ends the string —
     the same trap this file hit on 2026-09-18. */
  .q-prompt{margin-top:16px;display:flex;align-items:center;gap:10px;background:var(--brand-soft);border:1px solid var(--brand-light);border-radius:10px;padding:10px 14px;font-size:12px;font-weight:600;color:var(--brand-deep);}
  .q-prompt .material{flex:0 0 auto;font-size:14px;}
  .q-prompt .txt{flex:1 1 auto;min-width:0;}
  .q-prompt .act{flex:0 0 auto;font-weight:800;color:var(--brand-deep);text-decoration:underline;}
  .q-signed{margin-top:16px;display:flex;align-items:center;gap:10px;background:var(--ok-soft);border:1px solid color-mix(in srgb, var(--ok) 35%, transparent);border-radius:10px;padding:10px 14px;}
  .q-signed .tick{flex:0 0 auto;color:var(--ok);font-size:14px;font-weight:900;}
  .q-signed .txt{flex:1;font-size:10.5px;color:var(--navy);line-height:1.5;}
  .q-seal{flex:0 0 auto;width:30px;height:30px;padding:3px;border-radius:7px;background:var(--surface);object-fit:contain;}

  /* ── Footer ──────────────────────────────────────────────────────────────────────────────────
     The SUPPLIER's mark, or nothing: a white tile with no mark in it reads as a broken image. */
  .q-foot{background:var(--navy-deep);color:var(--text-on-dark-dim);padding:20px 26px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;}
  .q-foot-l{display:flex;align-items:center;gap:12px;min-width:0;}
  .q-flogo{flex:0 0 auto;width:40px;height:40px;padding:5px;border-radius:9px;background:var(--surface);object-fit:contain;}
  .q-fname{font-weight:800;font-size:13px;color:var(--surface);line-height:1.35;}
  .q-faddr{font-size:9.5px;font-weight:500;color:var(--text-on-dark-dim);margin-top:2px;line-height:1.6;}
  .q-freg{font-family:'Inter',system-ui,sans-serif;font-size:9.5px;color:var(--text-on-dark-dim);text-align:end;line-height:1.7;unicode-bidi:isolate;}
  /* 🔴 The owner prompt is SCREEN ONLY — it invites the reader to fix his own account, and a paper
     handed to a counterparty must not carry a note about the other side's profile. */
  @media print{body{background:var(--surface);}.q-doc{margin:0;border-radius:0;max-width:none;}.q-prompt{display:none;}}
  @media (max-width:640px){.q-parties{grid-template-columns:minmax(0,1fr);}.q-head,.q-body,.q-foot{padding-inline:18px;}}`;

const esc = (str: unknown) => String(str ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
/**
 * Money on the totals block.
 *
 * ⚠️ HALALAS ONLY WHEN THERE ARE ANY. ~~Always two decimals.~~ The grand figure shares its cell with
 * the currency word, and `219,075.00 SAR` is wider than the column the fixed table layout gives it —
 * it was clipped to «219,075.00 s.» at the sheet's own width. A whole-riyal total prints whole, which
 * is also how the app draws it; a total with halalas still states them, because that is the sum the
 * renter is held to.
 */
const money2 = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: Math.round(n * 100) % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 });

/** Amount-in-words (English) — ported from the requests-grouped prototype's quotation export. */
export function numWords(n: number): string {
  n = Math.round(n);
  if (n === 0) return "Zero";
  const o = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const t = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const u = (x: number) => { let s = ""; if (x >= 100) { s += o[Math.floor(x / 100)] + " hundred"; x %= 100; if (x) s += " and "; } if (x >= 20) { s += t[Math.floor(x / 10)]; if (x % 10) s += "-" + o[x % 10]; } else if (x > 0) s += o[x]; return s; };
  let r = "";
  ([["million", 1e6], ["thousand", 1e3]] as [string, number][]).forEach(([nm, v]) => { if (n >= v) { r += u(Math.floor(n / v)) + " " + nm + " "; n %= v; } });
  if (n > 0) r += u(n);
  r = r.trim();
  return r.charAt(0).toUpperCase() + r.slice(1);
}

/** Amount-in-words (Arabic tafqīt) — best-effort for currency amounts (0..999,999,999). */
export function numWordsAr(num: number): string {
  num = Math.round(num);
  if (num === 0) return "صفر";
  const ones = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
  const tens = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
  const hundreds = ["", "مائة", "مئتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
  const below1000 = (x: number): string => {
    const out: string[] = [];
    const h = Math.floor(x / 100);
    const rem = x % 100;
    if (h) out.push(hundreds[h]);
    if (rem) {
      if (rem < 20) out.push(ones[rem]);
      else {
        const o = rem % 10;
        if (o) out.push(ones[o]);
        out.push(tens[Math.floor(rem / 10)]);
      }
    }
    return out.join(" و");
  };
  const parts: string[] = [];
  const millions = Math.floor(num / 1e6);
  const thousands = Math.floor((num % 1e6) / 1e3);
  const rest = num % 1e3;
  if (millions) parts.push(millions === 1 ? "مليون" : millions === 2 ? "مليونان" : `${below1000(millions)} مليون`);
  if (thousands) parts.push(thousands === 1 ? "ألف" : thousands === 2 ? "ألفان" : `${below1000(thousands)} ألف`);
  if (rest) parts.push(below1000(rest));
  return parts.join(" و");
}

function partyHtml(p: QuotationParty): string {
  // Drawn whenever there IS one — the verification gate went on 2026-09-22; see
  // `QuotationParty.logoUrl`. The tick beside the name is what states the check.
  const logo = p.logoUrl ? `<img class="q-plogo" src="${esc(p.logoUrl)}" alt="" />` : "";
  const tick = p.verified ? `<span class="q-tick">✓</span>` : "";
  const rows = p.rows
    .filter((r) => (r.value ?? "").toString().trim().length > 0)
    .map((r) => `<div class="q-prow"><b>${esc(r.label)}:</b> ${esc(r.value)}</div>`)
    .join("");
  return (
    `<div class="q-party"><div class="q-party-t">` +
    `<div class="q-eyebrow">${esc(p.label)}</div>` +
    `<div class="q-pname"><span class="q-pn">${esc(p.name || "—")}</span>${tick}</div>` +
    `${rows}</div>${logo}</div>`
  );
}

function moneyCellHtml(cell: QuotationMoneyCell, notPriced: string): string {
  if (cell.kind === "excluded") return `<span class="q-dash">–</span>`;
  if (cell.kind === "unpriced") return `<span class="q-unpriced">${esc(notPriced)}</span>`;
  return `<span class="q-money">${esc(cell.text)}</span>`;
}

/** Render ONE quotation as a `<section class="q-doc">` (one per supplier / deal). */
export function renderQuotationSection(doc: QuotationDoc): string {
  const isAr = doc.lang === "ar";
  const L = (en: string, ar: string) => (isAr ? ar : en);
  const notPriced = L("Not priced", "لم يُسعّر");

  const stamp = doc.statusStamp
    ? `<span class="q-stamp is-${doc.statusStamp.tone === "ok" ? "ok" : "muted"}">${esc(doc.statusStamp.label)}</span>`
    : "";
  const draftBadge = doc.draftLabel ? `<span class="q-draft">${esc(doc.draftLabel)}</span>` : "";
  const draftMark = doc.draftLabel ? `<div class="q-wm" aria-hidden="true"><b>${esc(doc.draftLabel)}</b></div>` : "";
  /* ⚠️ A pair whose value REPEATS one already in the strip is dropped: a preview quotation has no
     formal number yet and falls back to the request's own code, which then stood twice in a row under
     two headings saying the same thing. */
  const seenRef = new Set<string>();
  const refs = doc.refs
    .filter((r) => {
      const v = (r.value ?? "").toString().trim();
      if (!v || seenRef.has(v)) return false;
      seenRef.add(v);
      return true;
    })
    .map((r) => `<div class="q-ref"><span>${esc(r.label)}</span><b>${esc(r.value)}</b></div>`)
    .join("");

  const rows = doc.lineItems
    .map(
      (it) =>
        `<tr>` +
        `<td class="q-eq">${esc(it.equipment)}</td>` +
        // An empty description prints a DASH, never an empty cell: a blank reads as a column that
        // failed to render, and the app draws `—` for exactly this row (`_specs`).
        `<td class="q-desc">${
          it.description.filter((d) => (d.value ?? "").toString().trim().length > 0).length
            ? it.description
                .filter((d) => (d.value ?? "").toString().trim().length > 0)
                .map((d) => `<b>${esc(d.label)}:</b> ${esc(d.value)}`)
                .join(" · ")
            : "—"
        }</td>` +
        `<td class="c">${esc(it.units)}</td>` +
        `<td class="c">${esc(it.duration || "—")}</td>` +
        `<td class="c">${moneyCellHtml(it.rental, notPriced)}</td>` +
        `<td class="c">${moneyCellHtml(it.delivery, notPriced)}</td>` +
        `<td class="c">${moneyCellHtml(it.ret, notPriced)}</td>` +
        `<td class="c q-total">${it.totalNote ? `<span class="n">${esc(it.totalNote)}</span>` : ""}${esc(it.total)}</td>` +
        `</tr>`,
    )
    .join("");

  // Amount in words with halalas (app parity), plus an optional suffix ("Estimate for one day · …").
  const wordsValue = doc.amountWordsValue ?? doc.totals.total;
  const riyals = Math.floor(wordsValue + 1e-6);
  const halalas = Math.round((wordsValue - riyals) * 100);
  const wordsBase = isAr
    ? `${numWordsAr(riyals)} ريال سعودي${halalas ? ` و${numWordsAr(halalas)} هللة` : ""}`
    : `${numWords(riyals)} Saudi Riyals${halalas ? ` and ${numWords(halalas)} halalas` : ""}`;
  const words = doc.amountWordsSuffix ? `${wordsBase} · ${doc.amountWordsSuffix}` : wordsBase;

  const grandLabel = doc.totals.label ?? L("Total · incl. VAT", "الإجمالي · شامل الضريبة");
  /* ⚠️ NO currency word on the grand row. The app states the currency ONCE, in the reference strip, and
     repeating it here is what pushed `219,075.00 SAR` past the column the fixed table layout gives it. */
  const grandValue = doc.totals.valueOverride
    ? `<span class="g">${esc(doc.totals.valueOverride)}</span>`
    : `<span class="g">${money2(doc.totals.total)}</span>`;

  /* ONE numbered list: the term sentences, then the legal clauses after a hairline.
     🔴 NO per-clause «agreed» mark. It was carried for a day and the app removed it the next: the owner
     reads this as a legal document, and a clause annotated with its negotiation state is not how a
     quotation is written. The sheet states the terms as they stand at download, full stop. */
  const clauseItems = doc.clauses
    .filter((c) => (c.body ?? "").trim().length > 0)
    .map((c) => `<li>${c.title ? `<b>${esc(c.title)}:</b> ` : ""}${esc(c.body)}</li>`);
  const legalItems = doc.legal.map((t, i) => `<li${i === 0 && clauseItems.length ? ` class="rule"` : ""}>${esc(t)}</li>`);
  const termsHtml = clauseItems.length + legalItems.length
    ? `<div class="q-th">${esc(L("Terms and Conditions", "الشروط والأحكام"))}</div><ol class="q-tc">${clauseItems.join("")}${legalItems.join("")}</ol>`
    : "";

  /* The signature strip carries the REQUEST number and the support address as well as the quotation's
     own reference (app parity): this is the one band that speaks for the platform, so the route to help
     belongs here rather than in the supplier's navy footer. A draft is never "electronically signed",
     so the block is suppressed for one regardless of `showSigned`. */
  const signed =
    doc.draftLabel || doc.showSigned === false
      ? ""
      : `<div class="q-signed"><span class="tick">✓</span><div class="txt">${[
          esc(L("Electronically signed via the Moedatech platform", "موقَّع إلكترونيًا عبر منصة معداتك")),
          `<span class="q-num">${esc(doc.quotationNumber)}</span>`,
          doc.requestRef ? `${esc(L("Request #", "رقم الطلب"))} <span class="q-num">${esc(doc.requestRef)}</span>` : "",
          `<span class="q-num">${esc(doc.dateStr)}</span>`,
          doc.supportEmail ? `<span class="q-num">${esc(doc.supportEmail)}</span>` : "",
        ]
          .filter(Boolean)
          .join(" · ")}</div>${doc.sealUrl ? `<img class="q-seal" src="${esc(doc.sealUrl)}" alt="" />` : ""}</div>`;

  /* Above the signature strip, which is where the document stops being the offer and starts being
     the platform speaking. A prompt among the TERMS would read as one. */
  const prompt = doc.ownerPrompt
    ? `<div class="q-prompt"><span class="material">⚠</span><span class="txt">${esc(doc.ownerPrompt.text)}</span>${
        doc.ownerPrompt.href && doc.ownerPrompt.actionLabel
          ? `<a class="act" href="${esc(doc.ownerPrompt.href)}">${esc(doc.ownerPrompt.actionLabel)}</a>`
          : ""
      }</div>`
    : "";

  const f = doc.footer;
  const reg = f ? [f.crNumber ? `C.R. ${f.crNumber}` : "", f.vatNumber ? `VAT ${f.vatNumber}` : ""].filter(Boolean).join(" · ") : "";
  const contact = f ? [f.phone, f.email].filter(Boolean).join(" · ") : "";
  const footLines = [reg, contact].filter(Boolean).map((l) => esc(l)).join("<br />");
  const footer = f
    ? `<div class="q-foot"><div class="q-foot-l">${f.logoUrl ? `<img class="q-flogo" src="${esc(f.logoUrl)}" alt="" />` : ""}<div><div class="q-fname">${esc(f.name)}</div>${
        f.address ? `<div class="q-faddr">${esc(f.address)}</div>` : ""
      }</div></div>${footLines ? `<div class="q-freg">${footLines}</div>` : ""}</div>`
    : "";

  return `<section class="q-doc" dir="${isAr ? "rtl" : "ltr"}" lang="${isAr ? "ar" : "en"}">
    ${draftMark}
    <div class="q-head">
      <div class="q-head-l"><span class="q-title">${esc(doc.title)}</span>${stamp}${draftBadge}</div>
      <div class="q-refs">${refs}</div>
    </div>
    <div class="q-body">
      <div class="q-parties">${partyHtml(doc.supplier)}${partyHtml(doc.rentee)}</div>
      <div class="q-tw">
        <table class="q-table">
          <colgroup><col style="width:12%"><col style="width:28%"><col style="width:6%"><col style="width:8%"><col style="width:11%"><col style="width:11%"><col style="width:11%"><col style="width:13%"></colgroup>
          <thead><tr>
            <th>${esc(L("Equipment", "المعدة"))}</th>
            <th>${esc(L("Description", "الوصف"))}</th>
            <th class="c">${esc(L("Unit", "الوحدة"))}</th>
            <th class="c">${esc(L("Duration", "المدة"))}</th>
            <th class="c">${esc(L("Rental", "الإيجار"))}<i>${esc(L("/unit", "/وحدة"))}</i></th>
            <th class="c">${esc(L("Delivery", "التوصيل"))}<i>${esc(L("/unit", "/وحدة"))}</i></th>
            <th class="c">${esc(L("Return", "الاسترجاع"))}<i>${esc(L("/unit", "/وحدة"))}</i></th>
            <th class="c">${esc(L("Total", "الإجمالي"))}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr><td colspan="7">${esc(L("Subtotal before tax", "المجموع قبل الضريبة"))}</td><td class="v">${money2(doc.totals.subtotal)}</td></tr>
            <tr><td colspan="7">${esc(L("VAT (15%)", "ضريبة القيمة المضافة (15٪)"))}</td><td class="v">${money2(doc.totals.vat)}</td></tr>
            <tr class="grand"><td colspan="7">${esc(grandLabel)}</td><td class="v">${grandValue}</td></tr>
          </tfoot>
        </table>
      </div>
      <div class="q-words">${esc(L("Amount in words", "المبلغ كتابةً"))}: <b>${esc(words)}</b></div>
      ${termsHtml}
      ${prompt}
      ${signed}
    </div>
    ${footer}
  </section>`;
}

/**
 * The standard Saudi quotation legal clauses (bilingual).
 *
 * 🔴 VERBATIM from the app's `quotationTcValidity` / `Vat` / `Safety` / `Law` / `ESignature`, in that
 * order and WITHOUT the trailing full stops the web had added: they are the same five sentences on both
 * products, and a document that quotes them differently is two documents.
 */
export function quotationLegal(L: (en: string, ar: string) => string): string[] {
  return [
    L("This quotation is valid for seven (7) days from the issue date and expires automatically thereafter unless confirmed through the Moedatech platform", "هذا العرض ساري المفعول لمدة سبعة (7) أيام من تاريخ الإصدار، وتسقط صلاحيته تلقائيًا بعد ذلك ما لم يتم تأكيده عبر منصة معداتك"),
    L("Prices are inclusive of items explicitly listed in the pricing table above. VAT at 15% applies per Saudi tax law", "الأسعار شاملة لِما ذُكر صراحةً في جدول التسعير أعلاه، وضريبة القيمة المضافة بنسبة 15٪ مفروضة وفقًا للنظام السعودي"),
    L("The supplier is responsible for the equipment's roadworthiness and technical safety on the delivery date, and for satisfying mandated safety certifications", "المُورِّد مسؤول عن صلاحية المعدة وسلامتها الفنية في تاريخ التسليم، وعن استيفاء شهادات السلامة والوثائق المطلوبة نظامًا"),
    L("This quotation is governed by the laws of the Kingdom of Saudi Arabia; competent Saudi courts have exclusive jurisdiction over any dispute", "يخضع هذا العرض لأنظمة المملكة العربية السعودية، وتختصُّ المحاكم السعودية المختصة بالفصل في أي نزاع"),
    L("This document is issued electronically via the Moedatech platform and is legally equivalent to a signed document under the Saudi Electronic Transactions Law", "تَمَّ إصدار هذا المستند إلكترونيًا عبر منصة معداتك، ويُعدّ مكافئًا قانونيًا للمستند الموقَّع وفقًا لنظام التعاملات الإلكترونية السعودي"),
  ];
}

/** Wrap one or more rendered sections into a full, self-printing HTML page. */
export function wrapQuotationPage(sectionsHtml: string, opts: { lang: QLang; title: string; autoPrint?: boolean }): string {
  const isAr = opts.lang === "ar";
  const printScript = opts.autoPrint === false ? "" : `<script>window.onload=function(){setTimeout(function(){window.print();},350);}</script>`;
  return `<!doctype html><html lang="${isAr ? "ar" : "en"}" dir="${isAr ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${esc(opts.title)}</title>` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
    `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Tajawal:wght@400;500;700;900&display=swap" rel="stylesheet">` +
    `<style>${QUOTATION_STYLE}</style></head><body>${sectionsHtml}${printScript}</body></html>`;
}
