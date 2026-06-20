"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { fetchBids, startDealRoom } from "@/lib/api/client";
import { CredentialPills } from "@/components/requests/CredentialPills";
import { TermsPanel } from "@/components/requests/TermsPanel";
import { TermClassBadges } from "@/components/requests/TermClassBadges";
import { DealRoomBanner, SupplierDocs } from "@/components/requests/BidCardExtras";
import { bidSuppliers, CERT_LABEL, type BidCard } from "@/lib/contract/bids";
import type { RequestGroup } from "@/lib/contract/requests";
import { BidEquipmentModal } from "@/components/requests/BidEquipmentModal";
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
  .docs{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;}
  .doc-ok{font-size:10.5px;font-weight:800;color:#1daf58;background:#e7f7ee;border-radius:100px;padding:2px 8px;}
  .ver-ok{color:#1daf58;font-weight:800;}
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
  // Period label from the bid's billing unit — for the collapsed "rate / period" on the card.
  const periodOf = (u: string | null) => {
    switch ((u ?? "PER_DAY").toUpperCase()) {
      case "PER_WEEK": return L("week", "أسبوع");
      case "PER_MONTH": return L("month", "شهر");
      case "PER_JOB": return L("job", "مهمة");
      default: return L("day", "يوم");
    }
  };
  const router = useRouter();

  const [bids, setBids] = useState<GroupBid[] | null>(null);
  const [error, setError] = useState(false);
  const [supplierKey, setSupplierKey] = useState<string>("all");
  const [openPrice, setOpenPrice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [equipBid, setEquipBid] = useState<GroupBid | null>(null);
  const [openTermsId, setOpenTermsId] = useState<string | null>(null);
  const [langPick, setLangPick] = useState(false); // quotation language chooser (Arabic | English)
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
      // App parity: opening the deal room is pre-acceptance — don't accept the bid here.
      const { id } = await startDealRoom(b.id);
      if (id) router.push(`/deal-room/${id}`);
      else setBusyId(null);
    } catch {
      setBusyId(null);
    }
  }

  function downloadQuotation(langIsAr: boolean) {
    if (!bids) return;
    const chosen = bids.filter((b) => selected.has(b.id));
    if (!chosen.length) return;
    const esc = (str: string) => String(str).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
    const itemMap = new Map(group.items.map((it) => [it.id, it]));
    // Request codes this quotation covers — stamped in the filename so Compare scopes to them.
    const coveredCodes = [...new Set(chosen.map((b) => itemMap.get(b.requestId)?.displayId).filter(Boolean) as string[])];

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

    // Render one supplier's quotation in a single language; bilingual output stacks both per supplier.
    const renderSection = (supBids: GroupBid[], si: number, isAr: boolean) => {
      const L = (en: string, arr: string) => (isAr ? arr : en);
      const sar = L("SAR", "ر.س");
      const dateStr = new Date().toLocaleDateString(isAr ? "ar-SA" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
      const rentee = { name: renterName || L("Moedatech renter", "مستأجر معداتك"), org: "Moedatech", city: group.city ?? group.locationLabel };
      const sup = supBids[0];
      const supInit = (sup.supplierName || "S").replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "S";
      const qnum = `Q-${reqCode}-${supInit}${si + 1}`;
      const validRaw = supBids.map((b) => b.validUntil).filter(Boolean).sort()[0] ?? null;
      const valid = validRaw ? new Date(validRaw).toLocaleDateString(isAr ? "ar-SA" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
      const reqIds = [...new Set(supBids.map((b) => itemMap.get(b.requestId)?.displayId ?? b.requestId))];
      const reqLabel = reqIds.length === 1 ? reqIds[0] : `${reqIds[0]} +${reqIds.length - 1}`;
      const rentalBasis = itemMap.get(sup.requestId)?.rentalType ?? "";

      const eqLine = (b: GroupBid) => (b.equipment ? [b.equipment.make, b.equipment.model, b.equipment.year].filter(Boolean).join(" · ") : "—");
      const labelOf = (b: GroupBid) => (ar ? b.itemLabelAr : b.itemLabel) || (itemMap.get(b.requestId)?.displayId ?? b.requestId);
      // App rule (014 CR #141): the bid is priced per billing period; the unit count is NOT multiplied
      // into the price (it's shown for information only). Open-ended → ∞ qty + one-period "as operated".
      const daysPerPeriod = (u: string | null) => { switch ((u ?? "PER_DAY").toUpperCase()) { case "PER_WEEK": return 7; case "PER_MONTH": return 30; case "PER_JOB": return 0; default: return 1; } };
      const periodLabel = (u: string | null) => { switch ((u ?? "PER_DAY").toUpperCase()) { case "PER_WEEK": return L("week", "أسبوع"); case "PER_MONTH": return L("month", "شهر"); case "PER_JOB": return L("job", "مهمة"); default: return L("day", "يوم"); } };

      // Pricing rows across every selected equipment for this supplier.
      let rowNum = 0;
      let sub = 0;
      const rows = supBids.map((b) => {
        const it = itemMap.get(b.requestId);
        const rate = b.price ?? 0;
        const units = b.numberOfUnits || 1; // bid price is per-unit → multiply by quantity (app parity)
        const dpp = daysPerPeriod(b.priceUnit);
        const plabel = periodLabel(b.priceUnit);
        const durDays = it?.durationDays ?? null;
        const openEnded = durDays == null;
        let lineSub: number, qtyCell: string, totalCell: string, durTxt: string;
        const unitsTxt = units > 1 ? ` · ${units} ${esc(L("units", "وحدة"))}` : "";
        if (openEnded) {
          lineSub = rate * units; // one-period preview × quantity; billed "as operated"
          qtyCell = "∞";
          totalCell = `<div class="sm">${esc(L("As operated", "حسب التشغيل"))}</div>${nf(rate)}${units > 1 ? " × " + units : ""} / ${esc(plabel)}`;
          durTxt = esc(L("open-ended", "غير محدّد")) + unitsTxt;
        } else if (dpp > 0) {
          const dd = durDays as number;
          const periods = dd / dpp;
          lineSub = (rate / dpp) * dd * units;
          qtyCell = Number.isInteger(periods) ? String(periods) : periods.toFixed(2);
          totalCell = nf(lineSub);
          durTxt = `${qtyCell} × ${esc(plabel)}${units > 1 ? ` × ${units} ${esc(L("units", "وحدة"))}` : ""}`;
        } else {
          lineSub = rate * units; // PER_JOB — per-unit rate × quantity
          qtyCell = "1";
          totalCell = nf(lineSub);
          durTxt = esc(L("per job", "لكل مهمة")) + unitsTxt;
        }
        sub += lineSub + (b.mobPrice ?? 0) + (b.demobPrice ?? 0);
        let r = `<tr><td>${++rowNum}</td><td><b>${esc(labelOf(b))}</b><div class="sm">${esc(eqLine(b))} · ${durTxt}</div></td><td>${esc(plabel)}</td><td class="num">${qtyCell}</td><td class="num">${nf(rate)}</td><td class="num">${totalCell}</td></tr>`;
        if (b.mobPrice) r += `<tr><td>${++rowNum}</td><td><b>${esc(L("Mobilization to site", "النقل إلى الموقع"))}</b><div class="sm">${esc(labelOf(b))}</div></td><td>${esc(L("trip", "رحلة"))}</td><td class="num">1</td><td class="num">${nf(b.mobPrice)}</td><td class="num">${nf(b.mobPrice)}</td></tr>`;
        if (b.demobPrice) r += `<tr><td>${++rowNum}</td><td><b>${esc(L("Return from site", "الإرجاع من الموقع"))}</b><div class="sm">${esc(labelOf(b))}</div></td><td>${esc(L("trip", "رحلة"))}</td><td class="num">1</td><td class="num">${nf(b.demobPrice)}</td><td class="num">${nf(b.demobPrice)}</td></tr>`;
        return r;
      }).join("");
      const vat = Math.round(sub * 0.15);
      const total = sub + vat;

      const listedLines = supBids.map((b) => {
        const units = b.numberOfUnits || 1;
        const verified = b.eqVerified ? ` &nbsp;·&nbsp; <span class="ver-ok">✔ ${esc(L("verified", "موثّقة"))}</span>` : "";
        const certs = b.heldCertCodes.length
          ? ` &nbsp;·&nbsp; ${b.heldCertCodes.map((c) => `<span class="doc-ok">✓ ${esc(isAr ? CERT_LABEL[c].ar : CERT_LABEL[c].en)}</span>`).join(" ")}`
          : "";
        return `<div class="lv">${esc(labelOf(b))} &nbsp;·&nbsp; ${esc(eqLine(b))} &nbsp;·&nbsp; ${units} ${esc(units > 1 ? L("units", "وحدات") : L("unit", "وحدة"))}${verified}${certs}</div>`;
      }).join("");
      const scopeRows = supBids.map((b) => {
        const it = itemMap.get(b.requestId);
        const units = b.numberOfUnits || 1;
        return `<div class="kv"><span>${esc(it?.displayId ?? b.requestId)}</span><b>${units} × ${esc(labelOf(b))}</b></div>`;
      }).join("");

      // ---- Equipment-terms + Contract-terms cards (the renter's RFQ terms, formatted bilingually) ----
      const tfmt = {
        sla: (v: string | null) => { if (!v) return null; const m: Record<string, [string, string]> = { FOUR_HR: ["4 hours", "٤ ساعات"], EIGHT_HR: ["8 hours", "٨ ساعات"], TWENTY_FOUR_HR: ["24 hours", "٢٤ ساعة"], FORTY_EIGHT_HR: ["48 hours", "٤٨ ساعة"], SEVENTY_TWO_HR: ["72 hours", "٧٢ ساعة"] }; const x = m[v.toUpperCase()]; return x ? L(x[0], x[1]) : v; },
        overtime: (v: string | null) => { if (v == null) return null; const u = v.toUpperCase(); if (u === "0" || u === "WITHOUT") return L("None", "بدون"); if (u === "1.5X") return "1.5×"; if (u === "2X") return "2×"; return v; },
        maint: (v: string | null) => { if (!v) return null; const u = v.toLowerCase(); if (u === "supplier") return L("Supplier", "المؤجّر"); if (u === "renter" || u === "rentee") return L("Renter", "المستأجر"); return v; },
        payTerms: (v: string | null) => { if (!v) return null; const m: Record<string, [string, string]> = { upfront: ["Upfront", "مقدمًا"], daily: ["Daily", "يومي"], "net-30": ["Net 30 days", "صافي ٣٠ يومًا"], "net-60": ["Net 60 days", "صافي ٦٠ يومًا"], "end-of-job": ["End of job", "نهاية المهمة"] }; const x = m[v.toLowerCase()]; return x ? L(x[0], x[1]) : v; },
        fuel: (v: string | null) => { if (!v) return null; const m: Record<string, [string, string]> = { DIESEL: ["Diesel", "ديزل"], PETROL: ["Petrol", "بنزين"], ELECTRIC: ["Electric", "كهربائي"] }; const x = m[v.toUpperCase()]; return x ? L(x[0], x[1]) : v; },
        operator: (inc: string | null, nat: string | null) => { if (inc == null) return null; if (inc.toUpperCase() !== "YES") return L("No operator", "بدون مشغّل"); return L("Includes operator", "يشمل مشغّلاً") + (nat ? ` · ${L("Nationality", "الجنسية")}: ${nat}` : ""); },
      };
      const kvRow = (label: string, val: string | null) => (val ? `<div class="kv"><span>${esc(label)}</span><b>${esc(val)}</b></div>` : "");
      let eqTermRows: string;
      if (supBids.length === 1) {
        const et = sup.requestTerms;
        eqTermRows = kvRow(L("Operator", "المشغّل"), tfmt.operator(et.operatorIncluded, et.operatorNationality)) + kvRow(L("Fuel type", "نوع الوقود"), tfmt.fuel(et.fuelType));
      } else {
        eqTermRows = supBids.map((b) => {
          const et = b.requestTerms;
          const parts = [tfmt.operator(et.operatorIncluded, et.operatorNationality), tfmt.fuel(et.fuelType)].filter(Boolean).join(" · ");
          return kvRow(labelOf(b), parts || null);
        }).join("");
      }
      const eqTermsCard = eqTermRows ? `<div class="card"><div class="card-h">${esc(L("Equipment terms", "شروط المعدة"))}</div>${eqTermRows}</div>` : "";
      const ct = sup.requestTerms;
      const contractRows =
        kvRow(L("Payment method", "طريقة الدفع"), ct.paymentMethod) +
        kvRow(L("Payment terms", "شروط الدفع"), tfmt.payTerms(ct.paymentTerms)) +
        kvRow(L("Breakdown response", "زمن الاستجابة للأعطال"), tfmt.sla(ct.breakdownResponseSla)) +
        kvRow(L("Overtime", "العمل الإضافي"), tfmt.overtime(ct.overtimeRate)) +
        kvRow(L("Maintenance", "الصيانة"), tfmt.maint(ct.maintenanceResponsibility));
      const contractTermsCard = contractRows ? `<div class="card"><div class="card-h">${esc(L("Contract terms", "شروط العقد"))}</div>${contractRows}</div>` : "";

      return `<section class="q-doc" dir="${isAr ? "rtl" : "ltr"}" lang="${isAr ? "ar" : "en"}">
        <div class="q-head"><div class="q-title">${esc(L("Equipment rental quotation", "عرض سعر تأجير معدات"))}</div><div class="q-sub"><span class="qn">${esc(qnum)}</span><span>${esc(dateStr)}</span></div></div>
        <div class="q-body">
          <div class="parties">
            <div class="party"><div class="plabel">${esc(L("Supplier", "المؤجّر"))}</div><div class="pname">${esc(sup.supplierName)}</div><div class="pmeta">${[sup.verified ? esc(L("Verified supplier", "مؤجّر موثّق")) : "", sup.rating != null ? "★ " + sup.rating.toFixed(1) : ""].filter(Boolean).join(" · ")}</div>${(() => {
              const c = sup.compliance;
              const docs = [c.activityLicense && L("CR", "السجل التجاري"), c.taxNumber && L("VAT", "الرقم الضريبي"), c.nationalAddress && L("National address", "العنوان الوطني")].filter(Boolean) as string[];
              return docs.length ? `<div class="docs">${docs.map((d) => `<span class="doc-ok">✓ ${esc(d)}</span>`).join("")}</div>` : "";
            })()}</div>
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
          ${!isAr ? `<div class="words"><div class="wl">Amount in words</div>${esc(numWords(total))} Saudi Riyals · ${supBids.length} ${supBids.length > 1 ? "items" : "item"} · final amount as operated</div>` : ""}
          <div class="card"><div class="card-h">${esc(L("Project terms", "شروط المشروع"))}</div>
            ${scopeRows}
            <div class="kv"><span>${esc(L("Rental basis", "أساس الإيجار"))}</span><b>${esc(rentalBasis || "—")}</b></div>
            <div class="kv"><span>${esc(L("Equipment lines", "بنود المعدات"))}</span><b>${supBids.length}</b></div>
            <div class="kv"><span>${esc(L("Total units", "إجمالي الوحدات"))}</span><b>${supBids.reduce((sum, b) => sum + (b.numberOfUnits || 1), 0)}</b></div>
          </div>
          ${eqTermsCard}
          ${contractTermsCard}
          <ol class="tc">
            <li>${esc(
              valid !== "—"
                ? L(`Valid until ${valid}. After this date the quotation expires automatically unless it is confirmed on the Moedatech platform.`, `صالح حتى ${valid}. ينتهي هذا العرض تلقائيًا بعد هذا التاريخ ما لم يُؤكَّد عبر منصة معداتك.`)
                : L("This quotation stays valid until it is confirmed on the Moedatech platform.", "يظل هذا العرض ساريًا حتى يتم تأكيده عبر منصة معداتك."),
            )}</li>
            <li>${esc(L("Prices cover only the equipment and services listed above; VAT at 15% is added as shown, in line with Saudi tax law.", "تشمل الأسعار المعدات والخدمات المدرجة أعلاه فقط، وتُضاف ضريبة القيمة المضافة ١٥٪ كما هو موضّح وفق النظام الضريبي السعودي."))}</li>
            <li>${esc(L("The supplier guarantees the equipment is roadworthy and technically safe on the delivery date, and provides the required safety certificates.", "يضمن المؤجّر أن المعدة صالحة وآمنة فنيًا في تاريخ التسليم، ويوفّر شهادات السلامة المطلوبة."))}</li>
            <li>${esc(L("This quotation is governed by the laws of the Kingdom of Saudi Arabia, and the competent Saudi courts have exclusive jurisdiction over any dispute.", "يخضع هذا العرض لأنظمة المملكة العربية السعودية، وتختص المحاكم السعودية المختصة بالنظر في أي نزاع."))}</li>
            <li>${esc(L("Issued electronically through the Moedatech platform, this quotation is legally equivalent to a signed document under the Saudi Electronic Transactions Law.", "صدر هذا العرض إلكترونيًا عبر منصة معداتك ويعادل قانونيًا وثيقة موقّعة وفق نظام التعاملات الإلكترونية السعودي."))}</li>
          </ol>
          <div class="signed"><b>${esc(L("Electronically signed via the Moedatech platform", "موقّع إلكترونيًا عبر منصة معداتك"))}</b><div>${esc(qnum)} · ${esc(dateStr)}</div></div>
          <div class="foot">${esc(L("Auto-generated by Moedatech", "مُولّد تلقائيًا بواسطة معداتك"))} · ${esc(L("Comparison code", "رمز المقارنة"))}: ${esc(group.id)}</div>
        </div>
      </section>`;
    };

    // Single language (the renter picks Arabic or English) — one page per supplier, no 2-in-1.
    const sections = [...bySupplier.values()]
      .map((supBids, si) => renderSection(supBids, si, langIsAr))
      .join("");

    const html = `<!doctype html><html lang="${langIsAr ? "ar" : "en"}" dir="${langIsAr ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${esc(quotationFileTitle(group.id, coveredCodes))}</title>` +
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
        const units = b.numberOfUnits || 1; // bid price is per-unit → × units (app parity)
        const rentalTotal = (b.price ?? 0) * periods * units;
        const sub = rentalTotal + (b.mobPrice ?? 0) + (b.demobPrice ?? 0);
        const vat = Math.round(sub * 0.15);
        const grand = sub + vat;
        const priceOpen = openPrice === b.id;
        const isSel = selected.has(b.id);
        return (
          <div className={`bid${isSel ? " sel" : ""}`} key={b.id}>
            {/* deal-room status banner (app parity) — whose move it is + agreed-terms meter */}
            <DealRoomBanner bid={b} ar={ar} />
            {/* equipment-focused header */}
            <div className="bid-head">
              <div className="bid-eq"><EquipImg src={b.itemImage} categoryId={b.categoryId} name={ar ? b.itemLabelAr : b.itemLabel} box="" img="h-7 w-7 object-contain" iconSize={24} /></div>
              <div className="bid-hh">
                <div className="r1">
                  <span className="sname">{ar ? b.itemLabelAr : b.itemLabel}</span>
                  {units > 1 && <span className="qty-badge">× {units}</span>}
                  <span className={`material-icons-outlined ${b.verified ? "eqv-ok" : "eqv-no"}`}>{b.verified ? "verified" : "gpp_bad"}</span>
                  <span className={`spill ${sp.cls}`}>{sp.dot && <span className="d" />}{ar ? sp.ar : sp.en}</span>
                </div>
                <div className="bid-by">
                  <span className="material-icons-outlined">storefront</span>{b.supplierName}
                  {b.verified && <span className="material-icons-outlined vf">verified</span>}
                  {b.rating != null && <><span className="dotsep">·</span><span className="star"><span className="material-icons-outlined">star</span>{b.rating.toFixed(1)}</span></>}
                </div>
                <CredentialPills required={b.requiredCerts} held={b.heldCertCodes} ar={ar} />
                {/* supplier credentials on file — identity docs (CR / VAT / National address) + held certs */}
                <SupplierDocs compliance={b.compliance} heldCerts={b.heldCertCodes} requiredCerts={b.requiredCerts} ar={ar} />
              </div>
              <div className={`bid-check${isSel ? " on" : ""}`} onClick={() => toggleSelect(b.id)} title={L("Select for quotation", "حدّد لعرض السعر")}>
                <span className="material-icons-outlined">check</span>
              </div>
            </div>

            {/* offered equipment (013 AC-06: collapsed row = distance + label + tap; make/model/year live in the modal) */}
            <div
              className={`equip-row row-sep${b.equipment?.id ? " tappable" : ""}`}
              role={b.equipment?.id ? "button" : undefined}
              tabIndex={b.equipment?.id ? 0 : undefined}
              onClick={() => b.equipment?.id && setEquipBid(b)}
              onKeyDown={(e) => b.equipment?.id && (e.key === "Enter" || e.key === " ") && setEquipBid(b)}
              title={b.equipment?.id ? L("Tap for details", "اضغط للتفاصيل") : undefined}
            >
              <div className="el">
                <div className="elab">{L("Equipment", "المعدة")}{b.eqVerified && <span className="material-icons-outlined vt">verified</span>}</div>
                <div className="esub">{b.distanceKm != null ? `${Math.round(b.distanceKm)} ${L("km from the project", "كم من المشروع")}` : L("Distance not shared", "المسافة غير محددة")}</div>
              </div>
              {b.equipment?.id && (
                <span className="equip-view">
                  {L("Tap for details", "اضغط للتفاصيل")}<span className="material-icons-outlined">chevron_right</span>
                </span>
              )}
            </div>

            {/* Terms — per-class status badges (Equipment / Project / Supplier); tap → modal with the
                per-term status inside each class. New-counter badge surfaces unseen deal-room changes. */}
            <button
              type="button"
              className={`terms-row row-sep tappable${openTermsId === b.id ? " open" : ""}`}
              aria-expanded={openTermsId === b.id}
              onClick={() => setOpenTermsId(openTermsId === b.id ? null : b.id)}
            >
              <span className="tlab">{L("Terms", "الشروط")}</span>
              <TermClassBadges terms={b.terms} ar={ar} />
              {b.unreadTerms.length > 0 && <span className="dr-turn">{b.unreadTerms.length} {L("new", "جديد")}</span>}
              <span className="material-icons-outlined chev">expand_more</span>
            </button>
            {openTermsId === b.id && <TermsPanel terms={b.terms} ar={ar} L={L} />}

            {/* supplier note (app parity — BidModel.note) */}
            {b.note && (
              <div className="bid-note row-sep">
                <span className="material-icons-outlined">sticky_note_2</span>
                <span className="bn-text">{b.note}</span>
              </div>
            )}

            {/* price */}
            <div className={`price-row${priceOpen ? " open" : ""}`}>
              <div className="price-collapsed" onClick={() => setOpenPrice(priceOpen ? null : b.id)}>
                <span className="pl">{L("Rate", "السعر")}</span>
                <span className="pr">{nf(b.price ?? 0)} {L("SAR", "ر.س")} / {periodOf(b.priceUnit)}{units > 1 ? ` · ${L("per unit", "لكل وحدة")}` : ""}<span className="chev">expand_more</span></span>
              </div>
              {priceOpen && (
                <div className="price-body">
                  <div className="prow"><span className="pl2">{L("Rental", "الإيجار")} ({nf(b.price ?? 0)} × {periods}{units > 1 ? ` × ${units}` : ""})</span><span className="pv">{nf(rentalTotal)}</span></div>
                  {b.mobPrice ? <div className="prow"><span className="pl2">{L("Delivery to site", "النقل إلى الموقع")}{b.mobLeadTime && <span className="lead">{L("delivery within", "تسليم خلال")} {b.mobLeadTime}</span>}</span><span className="pv">{nf(b.mobPrice)}</span></div> : null}
                  {b.demobPrice ? <div className="prow"><span className="pl2">{L("Return from site", "النقل من الموقع")}{b.demobLeadTime && <span className="lead">{L("return within", "إرجاع خلال")} {b.demobLeadTime}</span>}</span><span className="pv">{nf(b.demobPrice)}</span></div> : null}
                  <div className="prow"><span className="pl2">{L("Subtotal before VAT", "المجموع قبل الضريبة")}</span><span className="pv">{nf(sub)}</span></div>
                  <div className="prow"><span className="pl2">{L("VAT (15%)", "ضريبة القيمة المضافة (١٥٪)")}</span><span className="pv">{nf(vat)}</span></div>
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
          <button className="qdl" onClick={() => setLangPick(true)}>
            <span className="material-icons-outlined">download</span> {L("Download quotations", "تنزيل عروض الأسعار")}
          </button>
        </div>
      )}

      {/* Quotation language chooser — one PDF in the chosen language (no 2-in-1). */}
      {langPick && (
        <div className="tm-overlay" dir={ar ? "rtl" : "ltr"} onClick={() => setLangPick(false)}>
          <div className="tm-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="tm-head">
              <h3>{L("Quotation language", "لغة عرض السعر")}</h3>
              <button type="button" onClick={() => setLangPick(false)} aria-label={L("Close", "إغلاق")}>
                <span className="material-icons-outlined">close</span>
              </button>
            </div>
            <div className="tm-body">
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
                {L("Choose the language for the generated PDF.", "اختر لغة ملف عرض السعر.")}
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn primary" style={{ flex: 1 }} onClick={() => { setLangPick(false); downloadQuotation(false); }}>
                  English
                </button>
                <button className="btn primary" style={{ flex: 1 }} onClick={() => { setLangPick(false); downloadQuotation(true); }}>
                  العربية
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {equipBid && (
        <BidEquipmentModal
          bid={equipBid}
          busy={busyId === equipBid.id}
          onRequestDetails={() => startNegotiation(equipBid)}
          onClose={() => setEquipBid(null)}
        />
      )}
    </div>
  );
}
