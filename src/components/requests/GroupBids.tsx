"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { fetchBids, startDealRoom, acceptBid } from "@/lib/api/client";
import { bidSuppliers, type BidCard } from "@/lib/contract/bids";
import type { RequestGroup } from "@/lib/contract/requests";
import { EquipmentDetailModal } from "@/components/stores/EquipmentDetailModal";
import { EquipImg } from "@/components/requests/EquipImg";
import { quotationFileTitle } from "@/lib/compare/quotation-token";

/** A group bid = a request's bid tagged with which item (request) it belongs to. */
type GroupBid = BidCard & { requestId: string; itemLabel: string; itemLabelAr: string; categoryId: string | null; itemImage: string | null };

const SPILL: Record<string, { cls: string; dot: boolean; en: string; ar: string }> = {
  PENDING: { cls: "sp-pending", dot: true, en: "New", ar: "جديد" },
  OPEN_FOR_NEGOTIATION: { cls: "sp-open", dot: false, en: "Negotiating", ar: "تحت التفاوض" },
  COUNTER_OFFERED: { cls: "sp-counter", dot: true, en: "Counter-offer", ar: "عرض مُقابل" },
  ACCEPTED: { cls: "sp-accepted", dot: false, en: "Accepted", ar: "مقبول" },
  EXPIRED: { cls: "sp-expired", dot: false, en: "Expired", ar: "منتهٍ" },
  WITHDRAWN: { cls: "sp-withdrawn", dot: false, en: "Withdrawn", ar: "مسحوب" },
};
const nf = (n: number) => Math.round(n).toLocaleString("en-US");

function pillLabel(status: string, L: (en: string, ar: string) => string): string {
  switch (status) {
    case "OPEN_FOR_NEGOTIATION": return L("Open chat", "فتح المحادثة");
    case "COUNTER_OFFERED": return L("Review counter-offer", "مراجعة العرض المُقابل");
    case "ACCEPTED": return L("View deal", "عرض الصفقة");
    case "EXPIRED": return L("Expired", "منتهٍ");
    case "WITHDRAWN": return L("Withdrawn", "مسحوب");
    default: return L("Start negotiation on this bid", "بدء التفاوض على هذا العرض");
  }
}
function donutStyle(m: number, c: number) {
  const tot = m + c || 1;
  const mp = ((m / tot) * 100).toFixed(0);
  return { background: `conic-gradient(var(--success) 0 ${mp}%, var(--warning) ${mp}% 100%, var(--surface3) 100% 100%)` };
}

/** Amount-in-words (English) — ported from the requests-grouped prototype's quotation export. */
function numWords(n: number): string {
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

/** Formal quotation PDF stylesheet — ported verbatim from prototypes/requests-grouped.html. */
const QSTYLE = `
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Inter','Segoe UI',Roboto,sans-serif;color:#1c3550;background:#f1f5f9;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .q-doc{max-width:780px;margin:18px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 6px 24px rgba(28,53,80,.1);page-break-after:always;}
  .q-doc:last-child{page-break-after:auto;}
  .q-head{background:linear-gradient(135deg,#1c3550,#12263a);color:#fff;padding:26px 34px;}
  .q-title{font-size:23px;font-weight:900;letter-spacing:-.3px;}
  .q-sub{display:flex;justify-content:space-between;margin-top:10px;font-size:12.5px;font-weight:700;color:rgba(255,255,255,.72);}
  .q-sub .qn{color:#fff;font-family:'IBM Plex Sans',monospace;}
  .q-body{padding:24px 34px 30px;}
  .parties{display:flex;gap:30px;padding-bottom:18px;border-bottom:1px solid #e4edf5;}
  .party{flex:1;}
  .plabel{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#6b8fa8;}
  .pname{font-size:17px;font-weight:800;margin-top:5px;}
  .pmeta{font-size:12px;color:#6b8fa8;font-weight:600;margin-top:3px;}
  .metastrip{display:grid;grid-template-columns:repeat(5,1fr);margin:18px 0;border:1px solid #e4edf5;border-radius:10px;overflow:hidden;}
  .metastrip>div{padding:11px 13px;border-inline-end:1px solid #e4edf5;}
  .metastrip>div:last-child{border-inline-end:0;}
  .metastrip span{display:block;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b8fa8;}
  .metastrip b{font-size:12.5px;font-weight:800;margin-top:4px;display:block;}
  .listed{background:#f7fafd;border:1px solid #e4edf5;border-radius:10px;padding:13px 15px;margin-bottom:18px;}
  .listed .ll{font-size:10.5px;font-weight:700;text-transform:uppercase;color:#6b8fa8;}
  .listed .lv{font-size:13.5px;font-weight:700;color:#2a4f72;margin-top:5px;}
  .ptable{width:100%;border-collapse:collapse;margin-bottom:8px;}
  .ptable th{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#6b8fa8;text-align:start;padding:8px 10px;background:#eff4f9;}
  .ptable th.num,.ptable td.num{text-align:end;font-family:'IBM Plex Sans',monospace;}
  .ptable td{padding:11px 10px;border-bottom:1px solid #e4edf5;font-size:13px;vertical-align:top;}
  .ptable td .sm{font-size:11px;color:#6b8fa8;font-weight:600;margin-top:2px;}
  .totals{margin:6px 0 18px;}
  .trow{display:flex;justify-content:space-between;padding:7px 10px;font-size:13.5px;}
  .trow span{color:#2a4f72;font-weight:600;}
  .trow b{font-family:'IBM Plex Sans',monospace;font-weight:800;}
  .trow.grand{border-top:2px solid #d4e0ec;margin-top:4px;padding-top:11px;font-size:16px;}
  .trow.grand b{color:#f79009;}
  .words{background:#eaf1fe;border:1px solid #cfe0fb;border-radius:10px;padding:13px 15px;margin-bottom:18px;font-size:13px;color:#1849a9;}
  .words .wl{font-size:10px;font-weight:800;text-transform:uppercase;margin-bottom:4px;}
  .card{border:1px solid #e4edf5;border-radius:10px;overflow:hidden;margin-bottom:18px;}
  .card-h{background:#fbeeea;padding:11px 15px;font-size:13.5px;font-weight:800;}
  .kv{display:flex;justify-content:space-between;gap:14px;padding:10px 15px;border-top:1px solid #f0f4f8;font-size:13px;}
  .kv span{color:#6b8fa8;font-weight:600;}.kv b{font-weight:800;text-align:end;}
  .tc{margin:0 0 18px;padding-inline-start:20px;font-size:11.5px;color:#2a4f72;line-height:1.7;}
  .tc li{margin-bottom:5px;}
  .signed{background:#eef7f1;border-radius:10px;padding:13px 15px;font-size:12px;}
  .signed b{display:block;color:#1c3550;}.signed div{color:#6b8fa8;font-family:'IBM Plex Sans',monospace;margin-top:3px;}
  .foot{text-align:center;color:#9bb3c8;font-size:11px;margin-top:16px;}
  @media print{body{background:#fff;}.q-doc{box-shadow:none;margin:0;border-radius:0;}}`;

/**
 * Grouped My Bids (web-app/multi-item-requests, Phase 2). Fetches bids for every request in the
 * group, merges them, and shows a supplier Level-2 filter + equipment-focused bid cards across the
 * whole submission, plus select-for-quotation. `getBidList` is per-request, so we fan the fetch out.
 */
export function GroupBids({ group }: { group: RequestGroup }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);
  const router = useRouter();

  const [bids, setBids] = useState<GroupBid[] | null>(null);
  const [error, setError] = useState(false);
  const [supplierKey, setSupplierKey] = useState<string>("all");
  const [openPrice, setOpenPrice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewEquipId, setViewEquipId] = useState<string | null>(null);
  const [renterName, setRenterName] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { user?: { firstName?: string; lastName?: string } } | null) => {
        if (active && d?.user) setRenterName([d.user.firstName, d.user.lastName].filter(Boolean).join(" "));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setBids(null);
    setError(false);
    setSupplierKey("all");
    setSelected(new Set());
    Promise.all(
      group.items.map((it) =>
        fetchBids(it.id)
          .then((d) =>
            d.bids.map((b): GroupBid => ({
              ...b,
              requestId: it.id,
              itemLabel: it.item?.name ?? it.displayId,
              itemLabelAr: it.item?.nameAr ?? it.displayId,
              categoryId: it.item?.categoryId ?? null,
              itemImage: it.item?.imageUrl ?? null,
            })),
          )
          .catch(() => [] as GroupBid[]),
      ),
    )
      .then((lists) => active && setBids(lists.flat()))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [group.id, group.items]);

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function startNegotiation(b: GroupBid) {
    if (busyId) return;
    if (b.dealRoomId) {
      router.push(`/deal-room/${b.dealRoomId}`);
      return;
    }
    setBusyId(b.id);
    try {
      await acceptBid(b.id).catch(() => {});
      const { id } = await startDealRoom(b.id);
      if (id) router.push(`/deal-room/${id}`);
      else setBusyId(null);
    } catch {
      setBusyId(null);
    }
  }

  function downloadQuotation() {
    if (!bids) return;
    const chosen = bids.filter((b) => selected.has(b.id));
    if (!chosen.length) return;
    const esc = (str: string) => String(str).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
    const sar = L("SAR", "ر.س");
    const itemMap = new Map(group.items.map((it) => [it.id, it]));
    const dateStr = new Date().toLocaleDateString(ar ? "ar-SA" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
    const rentee = { name: renterName || L("Moedatech renter", "مستأجر مودياتك"), org: "Moedatech", city: group.city ?? group.locationLabel };

    // One quotation per supplier: group the selected bids by supplier, then list ALL of that
    // supplier's chosen equipment as line items under a single quotation (with this request's terms).
    // Multiple suppliers → multiple quotation sections in the same file.
    const bySupplier = new Map<string, GroupBid[]>();
    for (const b of chosen) {
      const key = b.supplierId ?? b.supplierName ?? "—";
      const list = bySupplier.get(key);
      if (list) list.push(b);
      else bySupplier.set(key, [b]);
    }
    const reqCode = String(group.items[0]?.displayId ?? group.id).replace(/[^A-Za-z0-9-]/g, "");

    const sections = [...bySupplier.values()].map((supBids, si) => {
      const sup = supBids[0];
      const supInit = (sup.supplierName || "S").replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "S";
      const qnum = `Q-${reqCode}-${supInit}${si + 1}`;
      const validRaw = supBids.map((b) => b.validUntil).filter(Boolean).sort()[0] ?? null;
      const valid = validRaw ? new Date(validRaw).toLocaleDateString(ar ? "ar-SA" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
      const reqIds = [...new Set(supBids.map((b) => itemMap.get(b.requestId)?.displayId ?? b.requestId))];
      const reqLabel = reqIds.length === 1 ? reqIds[0] : `${reqIds[0]} +${reqIds.length - 1}`;
      const rentalBasis = itemMap.get(sup.requestId)?.rentalType ?? "";

      const eqLine = (b: GroupBid) => (b.equipment ? [b.equipment.make, b.equipment.model, b.equipment.year].filter(Boolean).join(" · ") : "—");
      const labelOf = (b: GroupBid) => (ar ? b.itemLabelAr : b.itemLabel) || (itemMap.get(b.requestId)?.displayId ?? b.requestId);

      // Pricing rows across every selected equipment for this supplier.
      let rowNum = 0;
      let sub = 0;
      const rows = supBids.map((b) => {
        const it = itemMap.get(b.requestId);
        const dur = b.duration ?? it?.durationDays ?? 1;
        const rental = (b.price ?? 0) * dur;
        const rtype = it?.rentalType ?? "";
        sub += rental + (b.mobPrice ?? 0) + (b.demobPrice ?? 0);
        let r = `<tr><td>${++rowNum}</td><td><b>${esc(labelOf(b))}</b><div class="sm">${esc(eqLine(b))}${rtype ? " · " + esc(rtype) : ""} · ${dur} ${esc(L("periods", "فترات"))}</div></td><td>${esc(L("period", "فترة"))}</td><td class="num">${dur}</td><td class="num">${nf(b.price ?? 0)}</td><td class="num">${nf(rental)}</td></tr>`;
        if (b.mobPrice) r += `<tr><td>${++rowNum}</td><td><b>${esc(L("Mobilization to site", "النقل إلى الموقع"))}</b><div class="sm">${esc(labelOf(b))}</div></td><td>${esc(L("trip", "رحلة"))}</td><td class="num">1</td><td class="num">${nf(b.mobPrice)}</td><td class="num">${nf(b.mobPrice)}</td></tr>`;
        if (b.demobPrice) r += `<tr><td>${++rowNum}</td><td><b>${esc(L("Return from site", "الإرجاع من الموقع"))}</b><div class="sm">${esc(labelOf(b))}</div></td><td>${esc(L("trip", "رحلة"))}</td><td class="num">1</td><td class="num">${nf(b.demobPrice)}</td><td class="num">${nf(b.demobPrice)}</td></tr>`;
        return r;
      }).join("");
      const vat = Math.round(sub * 0.15);
      const total = sub + vat;

      const listedLines = supBids.map((b) => {
        const units = itemMap.get(b.requestId)?.item?.qty ?? 1;
        return `<div class="lv">${esc(labelOf(b))} &nbsp;·&nbsp; ${esc(eqLine(b))} &nbsp;·&nbsp; ${units} ${esc(units > 1 ? L("units", "وحدات") : L("unit", "وحدة"))}${b.eqVerified ? " &nbsp;·&nbsp; ✔ " + esc(L("verified", "موثّقة")) : ""}</div>`;
      }).join("");
      const scopeRows = supBids.map((b) => {
        const it = itemMap.get(b.requestId);
        const units = it?.item?.qty ?? 1;
        return `<div class="kv"><span>${esc(it?.displayId ?? b.requestId)}</span><b>${units} × ${esc(labelOf(b))}</b></div>`;
      }).join("");

      return `<section class="q-doc">
        <div class="q-head"><div class="q-title">${esc(L("Equipment rental quotation", "عرض سعر تأجير معدات"))}</div><div class="q-sub"><span class="qn">${esc(qnum)}</span><span>${esc(dateStr)}</span></div></div>
        <div class="q-body">
          <div class="parties">
            <div class="party"><div class="plabel">${esc(L("Supplier", "المؤجّر"))}</div><div class="pname">${esc(sup.supplierName)}</div><div class="pmeta">${sup.verified ? esc(L("Verified supplier", "مؤجّر موثّق")) + " · " : ""}${sup.rating != null ? "★ " + sup.rating.toFixed(1) : ""}</div></div>
            <div class="party"><div class="plabel">${esc(L("Rentee", "المستأجر"))}</div><div class="pname">${esc(rentee.name)}</div><div class="pmeta">${esc(rentee.org)}${rentee.city ? " · " + esc(rentee.city) : ""}</div></div>
          </div>
          <div class="metastrip">
            <div><span>${esc(L("Request #", "رقم الطلب"))}</span><b>${esc(reqLabel)}</b></div>
            <div><span>${esc(L("Issue date", "تاريخ الإصدار"))}</span><b>${esc(dateStr)}</b></div>
            <div><span>${esc(L("Valid until", "صالح حتى"))}</span><b>${esc(valid)}</b></div>
            <div><span>${esc(L("Rental basis", "أساس الإيجار"))}</span><b>${esc(rentalBasis || "—")}</b></div>
            <div><span>${esc(L("Currency", "العملة"))}</span><b>${esc(sar)}</b></div>
          </div>
          <div class="listed"><div class="ll">${esc(L("Listed equipment", "المعدات المدرجة"))} (${supBids.length})</div>${listedLines}</div>
          <table class="ptable">
            <thead><tr><th>#</th><th>${esc(L("Item", "البند"))}</th><th>${esc(L("Unit", "الوحدة"))}</th><th class="num">${esc(L("Qty", "الكمية"))}</th><th class="num">${esc(L("Price", "السعر"))}</th><th class="num">${esc(L("Total", "الإجمالي"))}</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="totals">
            <div class="trow"><span>${esc(L("Subtotal before VAT", "الإجمالي قبل الضريبة"))}</span><b>${nf(sub)}</b></div>
            <div class="trow"><span>${esc(L("VAT (15%)", "ضريبة القيمة المضافة (١٥٪)"))}</span><b>${nf(vat)}</b></div>
            <div class="trow grand"><span>${esc(L("Total", "الإجمالي"))}</span><b>${nf(total)} ${esc(sar)}</b></div>
          </div>
          ${!ar ? `<div class="words"><div class="wl">Amount in words</div>${esc(numWords(total))} Saudi Riyals · ${supBids.length} ${supBids.length > 1 ? "items" : "item"} · final amount as operated</div>` : ""}
          <div class="card"><div class="card-h">${esc(L("Project terms", "شروط المشروع"))}</div>
            ${scopeRows}
            <div class="kv"><span>${esc(L("Rental basis", "أساس الإيجار"))}</span><b>${esc(rentalBasis || "—")}</b></div>
            <div class="kv"><span>${esc(L("Equipment count", "عدد المعدات"))}</span><b>${supBids.length}</b></div>
          </div>
          <ol class="tc">
            <li>${esc(L(`This quotation is valid until ${valid} and expires automatically thereafter unless confirmed through the Moedatech platform.`, `هذا العرض صالح حتى ${valid} وينتهي تلقائيًا بعد ذلك ما لم يُؤكَّد عبر منصة مودياتك.`))}</li>
            <li>${esc(L("Prices are inclusive of items explicitly listed above. VAT at 15% applies per Saudi tax law.", "الأسعار تشمل البنود المدرجة أعلاه فقط. تُطبَّق ضريبة القيمة المضافة ١٥٪ وفق النظام الضريبي السعودي."))}</li>
            <li>${esc(L("The supplier is responsible for the equipment's roadworthiness and technical safety on the delivery date, and for required safety certifications.", "المؤجّر مسؤول عن صلاحية المعدة وسلامتها الفنية في تاريخ التسليم وعن شهادات السلامة المطلوبة."))}</li>
            <li>${esc(L("This quotation is governed by the laws of the Kingdom of Saudi Arabia; competent Saudi courts have exclusive jurisdiction over any dispute.", "يخضع هذا العرض لأنظمة المملكة العربية السعودية، وتختص المحاكم السعودية بالنظر في أي نزاع."))}</li>
            <li>${esc(L("Issued electronically via the Moedatech platform and legally equivalent to a signed document under the Saudi Electronic Transactions Law.", "صدر إلكترونيًا عبر منصة مودياتك ويعادل قانونيًا الوثيقة الموقّعة وفق نظام التعاملات الإلكترونية السعودي."))}</li>
          </ol>
          <div class="signed"><b>${esc(L("Electronically signed via the Moedatech platform", "موقّع إلكترونيًا عبر منصة مودياتك"))}</b><div>${esc(qnum)} · ${esc(dateStr)}</div></div>
          <div class="foot">${esc(L("Auto-generated by Moedatech", "مُولّد تلقائيًا بواسطة مودياتك"))} · ${esc(L("Comparison code", "رمز المقارنة"))}: ${esc(group.id)}</div>
        </div>
      </section>`;
    }).join("");

    const html = `<!doctype html><html lang="${ar ? "ar" : "en"}" dir="${ar ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${esc(quotationFileTitle(group.id))}</title>` +
      `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=IBM+Plex+Sans:wght@400;600;700&display=swap" rel="stylesheet">` +
      `<style>${QSTYLE}</style></head><body>${sections}` +
      `<script>window.onload=function(){setTimeout(function(){window.print();},350);}</script></body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  }

  if (error) return <div className="rempty">{L("Couldn’t load the bids.", "تعذّر تحميل العروض.")}</div>;
  if (!bids) return <div className="rstate"><span className="material-icons-outlined" style={{ fontSize: 26 }}>progress_activity</span></div>;
  if (bids.length === 0) return <div className="rempty">{L("No bids yet for this request.", "لا توجد عروض بعد لهذا الطلب.")}</div>;

  const suppliers = bidSuppliers(bids);
  const shown = (supplierKey === "all" ? [...bids].sort((a, b) => a.requestId.localeCompare(b.requestId)) : bids.filter((b) => (b.supplierId ?? b.supplierName) === supplierKey));
  const selectedCount = bids.filter((b) => selected.has(b.id)).length;

  return (
    <div>
      {/* Level 2 — supplier filter */}
      <div className="flevel">
        <div className="flab"><span className="material-icons-outlined">storefront</span>{L("Supplier", "المؤجّر")}</div>
        <div className="chips-row">
          <button className={`req-chip${supplierKey === "all" ? " on" : ""}`} onClick={() => setSupplierKey("all")}>
            {L("All suppliers", "كل المؤجّرين")} <span className="ct">{bids.length}</span>
          </button>
          {suppliers.map((s) => (
            <button key={s.key} className={`req-chip sup-chip${supplierKey === s.key ? " on" : ""}`} onClick={() => setSupplierKey(s.key)}>
              <span className="av">{s.name.charAt(0).toUpperCase()}</span>{s.name}
              {s.verified && <span className="material-icons-outlined vtick">verified</span>}
              <span className="ct">{s.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="contentbar">
        <span className="count">
          {supplierKey === "all"
            ? `${shown.length} ${L("bids from", "عروض من")} ${suppliers.length} ${L("suppliers", "مؤجّرين")}`
            : `${shown.length} ${L("bids from this supplier", "عروض من هذا المؤجّر")}`}
          {" — "}{L("select cards to quote", "حدّد البطاقات لعرض السعر")}
        </span>
      </div>

      {shown.map((b) => {
        const sp = SPILL[b.status] ?? SPILL.PENDING;
        const disabled = b.status === "EXPIRED" || b.status === "WITHDRAWN" || b.expired;
        const periods = b.duration ?? 1;
        const rentalTotal = (b.price ?? 0) * periods;
        const sub = rentalTotal + (b.mobPrice ?? 0) + (b.demobPrice ?? 0);
        const vat = Math.round(sub * 0.15);
        const grand = sub + vat;
        const eqLine = b.equipment ? [b.equipment.make, b.equipment.model, b.equipment.year].filter(Boolean).join(" · ") : "—";
        const priceOpen = openPrice === b.id;
        const isSel = selected.has(b.id);
        return (
          <div className={`bid${isSel ? " sel" : ""}`} key={b.id}>
            {/* equipment-focused header */}
            <div className="bid-head">
              <div className="bid-eq"><EquipImg src={b.itemImage} categoryId={b.categoryId} name={ar ? b.itemLabelAr : b.itemLabel} box="" img="h-7 w-7 object-contain" iconSize={24} /></div>
              <div className="bid-hh">
                <div className="r1">
                  <span className="sname">{ar ? b.itemLabelAr : b.itemLabel}</span>
                  <span className={`material-icons-outlined ${b.verified ? "eqv-ok" : "eqv-no"}`}>{b.verified ? "verified" : "gpp_bad"}</span>
                  <span className={`spill ${sp.cls}`}>{sp.dot && <span className="d" />}{ar ? sp.ar : sp.en}</span>
                </div>
                <div className="bid-by">
                  <span className="material-icons-outlined">storefront</span>{b.supplierName}
                  {b.verified && <span className="material-icons-outlined vf">verified</span>}
                  {b.rating != null && <><span className="dotsep">·</span><span className="star"><span className="material-icons-outlined">star</span>{b.rating.toFixed(1)}</span></>}
                </div>
              </div>
              <div className={`bid-check${isSel ? " on" : ""}`} onClick={() => toggleSelect(b.id)} title={L("Select for quotation", "حدّد لعرض السعر")}>
                <span className="material-icons-outlined">check</span>
              </div>
            </div>

            {/* offered equipment */}
            <div className="equip-row row-sep">
              <div className="el">
                <div className="elab">{eqLine}</div>
                <div className="esub">{b.distanceKm != null ? `${Math.round(b.distanceKm)} ${L("km away", "كم")}` : ""}</div>
              </div>
              {b.equipment?.id && (
                <span className="equip-view" onClick={() => b.equipment?.id && setViewEquipId(b.equipment.id)}>
                  {L("View details", "عرض التفاصيل")}<span className="material-icons-outlined">chevron_right</span>
                </span>
              )}
            </div>

            {/* terms */}
            <div className="terms-row row-sep">
              <span className="tlab">{L("Terms", "الشروط")}</span>
              <div className="buckets">
                <span className="bucket">
                  <span className="donut" style={donutStyle(b.matchCount, b.conflictCount)}><span>{b.matchCount + b.conflictCount || 0}</span></span>
                  <span className="bl">{b.conflictCount > 0 ? `${b.conflictCount} ${L("differ", "مختلف")}` : L("All match", "كله مطابق")}</span>
                </span>
              </div>
            </div>

            {/* price */}
            <div className={`price-row${priceOpen ? " open" : ""}`}>
              <div className="price-collapsed" onClick={() => setOpenPrice(priceOpen ? null : b.id)}>
                <span className="pl">{L("Total", "الإجمالي")}</span>
                <span className="pr">{nf(grand)} {L("SAR", "ر.س")}<span className="chev">expand_more</span></span>
              </div>
              {priceOpen && (
                <div className="price-body">
                  <div className="prow"><span className="pl2">{L("Rental", "الإيجار")} ({nf(b.price ?? 0)} × {periods})</span><span className="pv">{nf(rentalTotal)}</span></div>
                  {b.mobPrice ? <div className="prow"><span className="pl2">{L("Mobilization", "النقل")}</span><span className="pv">{nf(b.mobPrice)}</span></div> : null}
                  {b.demobPrice ? <div className="prow"><span className="pl2">{L("Return", "الإرجاع")}</span><span className="pv">{nf(b.demobPrice)}</span></div> : null}
                  <div className="prow"><span className="pl2">{L("VAT 15%", "ضريبة ١٥٪")}</span><span className="pv">{nf(vat)}</span></div>
                  <div className="grandcard"><span className="gl">{L("Estimated total", "الإجمالي التقديري")}</span><span className="gv">{nf(grand)} {L("SAR", "ر.س")}</span></div>
                </div>
              )}
            </div>

            {/* lifecycle chips */}
            <div className="lc-chips">
              {b.validUntil && <span className="lc-chip"><span className="material-icons-outlined">schedule</span>{L("Valid until", "صالح حتى")} {new Date(b.validUntil).toLocaleDateString(ar ? "ar-SA" : "en-GB", { day: "numeric", month: "short" })}</span>}
              {b.distanceKm != null && <span className="lc-chip"><span className="material-icons-outlined">place</span>{Math.round(b.distanceKm)} {L("km", "كم")}</span>}
            </div>

            {/* negotiate footer */}
            <div className="neg-footer">
              <button className="neg-pill" disabled={disabled || busyId === b.id} onClick={() => startNegotiation(b)}>
                {pillLabel(b.status, L)}
                {!disabled && <span className="material-icons-outlined">arrow_forward</span>}
              </button>
            </div>
          </div>
        );
      })}

      {selectedCount > 0 && (
        <div className="qbar">
          <span className="qn">{selectedCount} {L("selected", "محدّد")}</span>
          <span className="qclear" onClick={() => setSelected(new Set())}>{L("Clear", "مسح")}</span>
          <button className="qdl" onClick={downloadQuotation}>
            <span className="material-icons-outlined">download</span> {L("Download quotations", "تنزيل عروض الأسعار")}
          </button>
        </div>
      )}

      {viewEquipId && <EquipmentDetailModal equipmentId={viewEquipId} onClose={() => setViewEquipId(null)} />}
    </div>
  );
}
