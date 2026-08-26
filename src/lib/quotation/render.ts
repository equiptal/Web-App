/**
 * ONE quotation template, shared by the bid-card quotation download (GroupBids) and the deal-room
 * confirmed quotation (DealRoom), so both look identical and match the app's formal quotation
 * (ported from prototypes/requests-grouped.html + apps/mobile live_quotation_document.dart).
 *
 * Pure string builder — no React. Callers map their own data into `QuotationDoc`; number formatting +
 * amount-in-words + the CR/VAT/"Verified" pill logic + the CSS all live here so the two surfaces can
 * never drift apart again.
 */

import { DS_ROOT_CSS } from "@/lib/ds-colors";

export type QLang = "en" | "ar";

/** One party identity row (National Address / CR # / VAT # / Phone / Email). A row shows its `value`,
 *  or the app's green "Verified" pill when `verified` is true and no value is known, or nothing. */
export interface QuotationIdRow {
  label: string;
  value?: string | null;
  /** When there's no value, gate showing a "Verified" pill on this (party-verified). */
  verified?: boolean;
}

export interface QuotationParty {
  label: string;
  name: string;
  sub?: string | null;
  idRows: QuotationIdRow[];
  /** Small green chips under the party (e.g. "Verified"). */
  chips?: string[];
}

export interface QuotationMetaCell {
  label: string;
  value: string;
}

export interface QuotationListedLine {
  label: string;
  detail: string;
  units: number;
  verified?: boolean;
  /** Already-localized cert labels (e.g. "TÜV", "SPSP"). */
  certs?: string[];
  /** Labeled spec chips (app parity: Type/Size/Brand/Model/Year/Fuel/Units). When present, rendered as
   *  chips under the equipment name instead of the concatenated detail line. */
  chips?: { label: string; value: string }[];
}

/** One invoice row. `num` numbers the primary (rental) rows; sub-rows (delivery/return) pass null. */
export interface QuotationLineItem {
  num?: number | null;
  label: string;
  detail?: string | null;
  unit: string;
  qty: string;
  price: string;
  total: string;
  /** Small note shown above the total (e.g. "As operated" for open-ended rentals). */
  totalNote?: string | null;
}

export interface QuotationCard {
  title: string;
  rows: { label: string; value: string }[];
}

export interface QuotationDoc {
  lang: QLang;
  title: string;
  /** Optional header logo (absolute URL / data URI — the doc renders in a blank print window). */
  logoUrl?: string;
  quotationNumber: string;
  dateStr: string;
  supplier: QuotationParty;
  rentee: QuotationParty;
  meta: QuotationMetaCell[];
  /** Extra price rows shown between the line-item table and the totals (app parity: overtime rate,
   *  cost-responsibility items — "fuel → supplier", etc.). */
  priceExtras?: { label: string; value: string }[];
  /** Show the "electronically signed" trust block (default true). */
  showSigned?: boolean;
  listedTitle?: string;
  listed?: QuotationListedLine[];
  lineItems: QuotationLineItem[];
  currency: string;
  /** `label`/`valueOverride` reframe the grand row for open-ended/as-operated bids (app parity:
   *  "Total / unit · day" showing the per-unit·period rate instead of the summed total). */
  totals: { subtotal: number; vat: number; total: number; label?: string; valueOverride?: string };
  cards: QuotationCard[];
  legal: string[];
  /** Appended after the amount-in-words (app parity: "Estimate for one day · Final amount as operated"). */
  amountWordsSuffix?: string;
  /**
   * When set, the document renders as a **DRAFT**: this label as a header badge AND as a diagonal
   * watermark across the page, and the "electronically signed" block is suppressed unconditionally.
   *
   * A pre-confirmation quotation is not a document anyone may rely on — the supplier can still
   * counter. An unmarked one is how a renter concludes the deal is done (and how a third party
   * receiving the PDF concludes it is binding), so the marking lives HERE, in the shared renderer,
   * rather than in each caller where it could be forgotten.
   */
  draftLabel?: string | null;
}

/** Formal quotation stylesheet — ported verbatim from prototypes/requests-grouped.html. */
export const QUOTATION_STYLE = `${DS_ROOT_CSS}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Inter','Segoe UI',Roboto,sans-serif;color:var(--navy);background:var(--background);-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .q-doc{position:relative;max-width:780px;margin:18px auto;background:var(--surface);border-radius:14px;overflow:hidden;page-break-after:always;}
  .q-doc:last-child{page-break-after:auto;}
  /* DRAFT marking (pre-confirmation quotations) — amber badge in the header + a diagonal watermark
     over the whole page, so an exported/printed draft can never be mistaken for the signed document. */
  .q-draft{display:inline-block;margin-top:9px;font-size:10.5px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--brand-light);background:color-mix(in srgb, var(--brand) 20%, transparent);border:1px solid color-mix(in srgb, var(--brand) 55%, transparent);border-radius:100px;padding:3px 11px;}
  .q-wm{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;overflow:hidden;pointer-events:none;}
  .q-wm b{transform:rotate(-32deg);font-size:76px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;color:color-mix(in srgb, var(--brand) 13%, transparent);}
  .q-head{background:linear-gradient(135deg,var(--navy),var(--navy-deep));color:var(--surface);padding:26px 34px;}
  .q-head-row{display:flex;align-items:center;gap:14px;}
  .q-logo{flex:0 0 auto;width:44px;height:44px;border-radius:10px;background:var(--surface);padding:6px;object-fit:contain;}
  .q-title{font-size:23px;font-weight:900;letter-spacing:-.3px;}
  .price-extras{border:1px solid var(--surface3);border-radius:10px;margin:2px 0 12px;overflow:hidden;}
  .price-extras .pe-h{background:var(--surface2);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);padding:8px 13px;}
  .price-extras .pe-row{display:flex;justify-content:space-between;gap:10px;padding:8px 13px;border-top:1px solid var(--surface2);font-size:12.5px;}
  .price-extras .pe-row span{color:var(--muted);font-weight:600;}.price-extras .pe-row b{font-weight:800;}
  .q-sub{display:flex;justify-content:space-between;margin-top:10px;font-size:12.5px;font-weight:700;color:rgba(255,255,255,.72);}
  .q-sub .qn{color:var(--surface);font-family:'IBM Plex Sans',monospace;}
  .q-body{padding:24px 34px 30px;}
  .parties{display:flex;gap:30px;padding-bottom:18px;border-bottom:1px solid var(--surface3);}
  .party{flex:1;}
  .plabel{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);}
  .phead{display:flex;align-items:center;gap:10px;margin-top:6px;}
  .pava{flex:0 0 auto;width:38px;height:38px;border-radius:50%;background:var(--surface2);color:var(--navy-mid);font-weight:900;font-size:16px;display:flex;align-items:center;justify-content:center;}
  .phead-t{min-width:0;}
  .phead .pname{margin-top:0;}
  .pname{font-size:17px;font-weight:800;margin-top:5px;}
  .pmeta{font-size:12px;color:var(--muted);font-weight:600;margin-top:3px;}
  .psub{font-size:12px;color:var(--muted);font-weight:600;margin-top:2px;}
  .docs{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;}
  .doc-ok{font-size:10.5px;font-weight:800;color:var(--ok);background:var(--ok-soft);border-radius:100px;padding:2px 8px;}
  .ver-ok{color:var(--ok);font-weight:800;}
  .metastrip{display:grid;grid-template-columns:repeat(3,1fr);margin:18px 0;border:1px solid var(--surface3);border-radius:10px;overflow:hidden;}
  .metastrip>div{padding:11px 13px;border-inline-end:1px solid var(--surface3);border-top:1px solid var(--surface3);}
  .metastrip>div:nth-child(-n+3){border-top:0;}
  .metastrip>div:nth-child(3n){border-inline-end:0;}
  /* party identity rows (National address / CR / VAT) + verification chips (app parity) */
  .pid-row{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;padding:3px 0;}
  .pid-row span{color:var(--muted);font-weight:600;}
  .pid-row b{font-weight:800;font-family:'IBM Plex Sans',monospace;}
  .pill-ver{display:inline-flex;align-items:center;gap:5px;color:var(--ok);background:var(--ok-soft);border-radius:100px;padding:2px 9px;font-weight:800;font-size:10.5px;}
  .pv-seal{display:inline-grid;place-items:center;width:13px;height:13px;border-radius:50%;background:var(--ok);color:var(--surface);font-size:8.5px;line-height:1;}
  .pchips{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px;}
  .pchip{font-size:10px;font-weight:800;color:var(--ok);background:var(--ok-soft);border-radius:100px;padding:2px 8px;}
  .metastrip span{display:block;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);}
  .metastrip b{font-size:12.5px;font-weight:800;margin-top:4px;display:block;}
  .listed{background:var(--surface);border:1px solid var(--surface3);border-radius:10px;padding:13px 15px;margin-bottom:18px;}
  .listed .ll{font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--muted);}
  .listed .lv{font-size:13.5px;font-weight:700;color:var(--navy-mid);margin-top:5px;}
  .lchips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
  .lchip{font-size:11px;font-weight:700;color:var(--navy-mid);background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:3px 9px;}
  .lchip i{color:var(--muted);font-style:normal;font-weight:800;margin-inline-end:5px;text-transform:uppercase;font-size:9.5px;letter-spacing:.03em;}
  .ptable{width:100%;border-collapse:collapse;margin-bottom:8px;}
  .ptable th{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);text-align:start;padding:8px 10px;background:var(--surface2);}
  .ptable th.num,.ptable td.num{text-align:end;font-family:'IBM Plex Sans',monospace;}
  .ptable td{padding:11px 10px;border-bottom:1px solid var(--surface3);font-size:13px;vertical-align:top;}
  .ptable td .sm{font-size:11px;color:var(--muted);font-weight:600;margin-top:2px;}
  /* Per-item grouping: each numbered rental row starts a group (thicker top rule); its delivery/return
     sub-rows are tinted + indented with a ↳ so it's clear which item they belong to. */
  .ptable tr.grp td{border-top:2px solid var(--border);}
  .ptable tbody tr.grp:first-child td{border-top:0;}
  .ptable tr.sub td{background:var(--surface);}
  .ptable tr.sub td.item{padding-inline-start:26px;position:relative;}
  .ptable tr.sub td.item::before{content:"↳";position:absolute;inset-inline-start:10px;color:var(--muted-light);font-weight:800;}
  .totals{margin:6px 0 18px;}
  .trow{display:flex;justify-content:space-between;padding:7px 10px;font-size:13.5px;}
  .trow span{color:var(--navy-mid);font-weight:600;}
  .trow b{font-family:'IBM Plex Sans',monospace;font-weight:800;}
  .trow.grand{border-top:2px solid var(--border);margin-top:4px;padding-top:11px;font-size:16px;}
  .trow.grand b{color:var(--brand);}
  .words{background:var(--surface2);border:1px solid var(--info-soft);border-radius:10px;padding:13px 15px;margin-bottom:18px;font-size:13px;color:var(--info-deep);}
  .words .wl{font-size:10px;font-weight:800;text-transform:uppercase;margin-bottom:4px;}
  .card{border:1px solid var(--surface3);border-radius:10px;overflow:hidden;margin-bottom:18px;}
  .card-h{background:var(--danger-soft);padding:11px 15px;font-size:13.5px;font-weight:800;}
  .kv{display:flex;align-items:center;gap:8px;padding:9px 15px;border-top:1px solid var(--surface2);font-size:13px;}
  .kv::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--ok);flex:0 0 auto;}
  .kv span{color:var(--muted);font-weight:600;}.kv b{font-weight:800;margin-inline-start:auto;text-align:end;}
  .tc{margin:0 0 18px;padding-inline-start:20px;font-size:11.5px;color:var(--navy-mid);line-height:1.7;}
  .tc li{margin-bottom:5px;}
  .signed{display:flex;align-items:center;gap:12px;background:var(--ok-soft);border-radius:10px;padding:13px 15px;font-size:12px;}
  .sig-check{flex:0 0 auto;width:30px;height:30px;border-radius:50%;background:var(--ok-soft);color:var(--ok);font-weight:900;font-size:16px;display:flex;align-items:center;justify-content:center;}
  .sig-txt b{display:block;color:var(--navy);}.sig-txt>div{color:var(--muted);font-family:'IBM Plex Sans',monospace;margin-top:3px;}
  .foot{text-align:center;color:var(--muted-light);font-size:11px;margin-top:16px;}
  @media print{body{background:var(--surface);}.q-doc{box-shadow:none;margin:0;border-radius:0;}}`;

const esc = (str: unknown) => String(str ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
/** 2-decimal money (app parity: quotation totals show halalas, e.g. 250.00 / 37.50). */
const money2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

function idRowHtml(row: QuotationIdRow, L: (en: string, ar: string) => string): string {
  if (row.value) return `<div class="pid-row"><span>${esc(row.label)}</span><b>${esc(row.value)}</b></div>`;
  if (row.verified) return `<div class="pid-row"><span>${esc(row.label)}</span><span class="pill-ver">✓ ${esc(L("Verified", "موثَّق"))}</span></div>`;
  return "";
}

function partyHtml(p: QuotationParty, L: (en: string, ar: string) => string): string {
  const idRows = p.idRows.map((r) => idRowHtml(r, L)).join("");
  const chips = (p.chips ?? []).filter(Boolean);
  const chipsHtml = chips.length ? `<div class="pchips">${chips.map((c) => `<span class="pchip">✓ ${esc(c)}</span>`).join("")}</div>` : "";
  // Avatar circle with the party initial (app parity).
  const initial = (p.name || "?").trim().charAt(0).toUpperCase() || "?";
  return `<div class="party"><div class="plabel">${esc(p.label)}</div><div class="phead"><span class="pava">${esc(initial)}</span><div class="phead-t"><div class="pname">${esc(p.name || "—")}</div>${p.sub ? `<div class="psub">${esc(p.sub)}</div>` : ""}</div></div>${idRows}${chipsHtml}</div>`;
}

function cardHtml(card: QuotationCard): string {
  if (!card.rows.length) return "";
  const rows = card.rows.map((r) => `<div class="kv"><span>${esc(r.label)}</span><b>${esc(r.value)}</b></div>`).join("");
  return `<div class="card"><div class="card-h">${esc(card.title)}</div>${rows}</div>`;
}

/** Render ONE quotation as a `<section class="q-doc">` (one per supplier / deal). */
export function renderQuotationSection(doc: QuotationDoc): string {
  const isAr = doc.lang === "ar";
  const L = (en: string, ar: string) => (isAr ? ar : en);
  const metaHtml = doc.meta.map((m) => `<div><span>${esc(m.label)}</span><b>${esc(m.value)}</b></div>`).join("");
  const listedHtml = doc.listed?.length
    ? `<div class="listed"><div class="ll">${esc(doc.listedTitle ?? L("Listed equipment", "المعدات المدرجة"))} (${doc.listed.length})</div>${doc.listed
        .map((l) => {
          const ver = l.verified ? ` &nbsp;·&nbsp; <span class="ver-ok">✔ ${esc(L("verified", "موثّقة"))}</span>` : "";
          const certs = l.certs?.length ? ` &nbsp;·&nbsp; ${l.certs.map((c) => `<span class="doc-ok">✓ ${esc(c)}</span>`).join(" ")}` : "";
          // App parity: labeled spec chips (Type/Size/Brand/Model/Year/Fuel/Units) when provided, else
          // the legacy concatenated line.
          if (l.chips?.length) {
            const chips = l.chips.filter((c) => c.value).map((c) => `<span class="lchip"><i>${esc(c.label)}</i>${esc(c.value)}</span>`).join("");
            const extras = [
              l.verified ? `<span class="ver-ok">✔ ${esc(L("verified", "موثّقة"))}</span>` : "",
              ...(l.certs ?? []).map((c) => `<span class="doc-ok">✓ ${esc(c)}</span>`),
            ].filter(Boolean).join(" ");
            return `<div class="lchips">${chips}</div>${extras ? `<div class="lv" style="margin-top:8px">${extras}</div>` : ""}`;
          }
          return `<div class="lv">${esc(l.label)} &nbsp;·&nbsp; ${esc(l.detail)} &nbsp;·&nbsp; ${l.units} ${esc(l.units > 1 ? L("units", "وحدات") : L("unit", "وحدة"))}${ver}${certs}</div>`;
        })
        .join("")}</div>`
    : "";
  const rows = doc.lineItems
    .map(
      (it) =>
        `<tr class="${it.num != null ? "grp" : "sub"}"><td class="num">${it.num ?? ""}</td><td class="item"><b>${esc(it.label)}</b>${it.detail ? `<div class="sm">${esc(it.detail)}</div>` : ""}</td><td>${esc(it.unit)}</td><td class="num">${esc(it.qty)}</td><td class="num">${esc(it.price)}</td><td class="num">${it.totalNote ? `<div class="sm">${esc(it.totalNote)}</div>` : ""}${esc(it.total)}</td></tr>`,
    )
    .join("");
  // Amount in words with halalas (app parity), + an optional suffix ("Estimate for one day · …").
  const riyals = Math.floor(doc.totals.total + 1e-6);
  const halalas = Math.round((doc.totals.total - riyals) * 100);
  const wordsBase = isAr
    ? `${numWordsAr(riyals)} ريال سعودي${halalas ? ` و${numWordsAr(halalas)} هللة` : ""}`
    : `${numWords(riyals)} Saudi Riyals${halalas ? ` and ${numWords(halalas)} halalas` : ""}`;
  const words = doc.amountWordsSuffix ? `${wordsBase} · ${doc.amountWordsSuffix}` : wordsBase;
  const grandLabel = doc.totals.label ?? L("Total", "الإجمالي");
  const grandValue = doc.totals.valueOverride ? esc(doc.totals.valueOverride) : `${money2(doc.totals.total)} ${esc(doc.currency)}`;
  const cards = doc.cards.map(cardHtml).join("");
  const legal = doc.legal.length ? `<ol class="tc">${doc.legal.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>` : "";
  const priceExtras = doc.priceExtras?.length
    ? `<div class="price-extras"><div class="pe-h">${esc(L("Rate & cost responsibilities", "السعر ومسؤوليات التكلفة"))}</div>${doc.priceExtras
        .map((r) => `<div class="pe-row"><span>${esc(r.label)}</span><b>${esc(r.value)}</b></div>`)
        .join("")}</div>`
    : "";
  const logo = doc.logoUrl ? `<img class="q-logo" src="${esc(doc.logoUrl)}" alt="" />` : "";
  // A draft is never "electronically signed" — suppress the trust block regardless of `showSigned`.
  const signed = doc.draftLabel || doc.showSigned === false ? "" : `<div class="signed"><span class="sig-check">✓</span><div class="sig-txt"><b>${esc(L("Electronically signed via the Moedatech platform", "موقّع إلكترونيًا عبر منصة معداتك"))}</b><div>${esc(doc.quotationNumber)} · ${esc(doc.dateStr)}</div></div></div>`;

  const draftBadge = doc.draftLabel ? `<div><span class="q-draft">${esc(doc.draftLabel)}</span></div>` : "";
  const draftMark = doc.draftLabel ? `<div class="q-wm" aria-hidden="true"><b>${esc(doc.draftLabel)}</b></div>` : "";

  return `<section class="q-doc" dir="${isAr ? "rtl" : "ltr"}" lang="${isAr ? "ar" : "en"}">
    ${draftMark}
    <div class="q-head"><div class="q-head-row">${logo}<div style="flex:1"><div class="q-title">${esc(doc.title)}</div><div class="q-sub"><span class="qn">${esc(doc.quotationNumber)}</span><span>${esc(doc.dateStr)}</span></div>${draftBadge}</div></div></div>
    <div class="q-body">
      <div class="parties">${partyHtml(doc.supplier, L)}${partyHtml(doc.rentee, L)}</div>
      ${metaHtml ? `<div class="metastrip">${metaHtml}</div>` : ""}
      ${listedHtml}
      <table class="ptable">
        <thead><tr><th class="num">#</th><th>${esc(L("Item", "البند"))}</th><th>${esc(L("Unit", "الوحدة"))}</th><th class="num">${esc(L("Qty", "العدد"))}</th><th class="num">${esc(L("Price", "السعر"))}</th><th class="num">${esc(L("Total", "الإجمالي"))}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${priceExtras}
      <div class="totals">
        <div class="trow"><span>${esc(L("Subtotal before VAT", "الإجمالي قبل الضريبة"))}</span><b>${money2(doc.totals.subtotal)}</b></div>
        <div class="trow"><span>${esc(L("VAT (15%)", "ضريبة القيمة المضافة (١٥٪)"))}</span><b>${money2(doc.totals.vat)}</b></div>
        <div class="trow grand"><span>${esc(grandLabel)}</span><b>${grandValue}</b></div>
      </div>
      <div class="words"><div class="wl">${esc(L("Amount in words", "المبلغ كتابةً"))}</div>${esc(words)}</div>
      ${cards}
      ${legal}
      ${signed}
      <div class="foot">${esc(L("Auto-generated by Moedatech · support@moedatech.com", "صادر تلقائيًا من منصة معداتك · support@moedatech.com"))}</div>
    </div>
  </section>`;
}

/** The standard Saudi quotation legal clauses (bilingual). */
export function quotationLegal(L: (en: string, ar: string) => string): string[] {
  return [
    L("This quotation is valid for seven (7) days from the issue date and expires automatically thereafter unless confirmed through the Moedatech platform.", "هذا العرض ساري المفعول لمدة سبعة (٧) أيام من تاريخ الإصدار، وتسقط صلاحيته تلقائيًا بعد ذلك ما لم يتم تأكيده عبر منصة معداتك."),
    L("Prices are inclusive of items explicitly listed in the pricing table above. VAT at 15% applies per Saudi tax law.", "الأسعار شاملة لِما ذُكر صراحةً في جدول التسعير أعلاه، وضريبة القيمة المضافة بنسبة ١٥٪ مفروضة وفقًا للنظام السعودي."),
    L("The supplier is responsible for the equipment's roadworthiness and technical safety on the delivery date, and for satisfying mandated safety certifications.", "المُورِّد مسؤول عن صلاحية المعدة وسلامتها الفنية في تاريخ التسليم، وعن استيفاء شهادات السلامة والوثائق المطلوبة نظامًا."),
    L("This quotation is governed by the laws of the Kingdom of Saudi Arabia; competent Saudi courts have exclusive jurisdiction over any dispute.", "يخضع هذا العرض لأنظمة المملكة العربية السعودية، وتختصُّ المحاكم السعودية المختصة بالفصل في أي نزاع."),
    L("This document is issued electronically via the Moedatech platform and is legally equivalent to a signed document under the Saudi Electronic Transactions Law.", "تَمَّ إصدار هذا المستند إلكترونيًا عبر منصة معداتك، ويُعدّ مكافئًا قانونيًا للمستند الموقَّع وفقًا لنظام التعاملات الإلكترونية السعودي."),
  ];
}

/** Wrap one or more rendered sections into a full, self-printing HTML page. */
export function wrapQuotationPage(sectionsHtml: string, opts: { lang: QLang; title: string; autoPrint?: boolean }): string {
  const isAr = opts.lang === "ar";
  const printScript = opts.autoPrint === false ? "" : `<script>window.onload=function(){setTimeout(function(){window.print();},350);}</script>`;
  return `<!doctype html><html lang="${isAr ? "ar" : "en"}" dir="${isAr ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${esc(opts.title)}</title>` +
    `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=IBM+Plex+Sans:wght@400;600;700&display=swap" rel="stylesheet">` +
    `<style>${QUOTATION_STYLE}</style></head><body>${sectionsHtml}${printScript}</body></html>`;
}
