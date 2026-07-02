"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { fetchBids, fetchRequestSubmissions, startDealRoom } from "@/lib/api/client";
import { BidTermsModal } from "@/components/requests/BidTermsModal";
import { SharedLinkBidCard } from "@/components/requests/SharedLinkBidCard";
import { SharedBidSubmissionModal } from "@/components/requests/SharedBidSubmissionModal";
import { QuotationVerifyGate } from "@/components/requests/QuotationVerifyGate";
import { useSession } from "@/lib/session";
import { bidSuppliers, CERT_LABEL, type BidCard } from "@/lib/contract/bids";
import { submissionToBidCard, type LinkBidSubmission } from "@/lib/contract/link-bids";
import { computeBidQuote } from "@/lib/contract/comparison";
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

/** Offer-state suffix for the deal-room CTA (uiState) — new / updated offer / whose move it is. */
function offerSuffix(uiState: string | null, L: (en: string, ar: string) => string): string | null {
  switch (uiState) {
    case "new": return L("New offer", "عرض جديد");
    case "fresh": return L("Updated offer", "عرض مُحدّث");
    case "your-turn": return L("Your turn", "دورك");
    default: return null;
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

/** Amount-in-words (Arabic tafqīt) — best-effort for currency amounts (0..999,999,999). */
function numWordsAr(num: number): string {
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
  .metastrip{display:grid;grid-template-columns:repeat(3,1fr);margin:18px 0;border:1px solid #e4edf5;border-radius:10px;overflow:hidden;}
  .metastrip>div{padding:11px 13px;border-inline-end:1px solid #e4edf5;border-top:1px solid #e4edf5;}
  .metastrip>div:nth-child(-n+3){border-top:0;}
  .metastrip>div:nth-child(3n){border-inline-end:0;}
  /* party identity rows (National address / CR / VAT) + verification chips (app parity) */
  .pid-row{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;padding:3px 0;}
  .pid-row span{color:#6b8fa8;font-weight:600;}
  .pid-row b{font-weight:800;font-family:'IBM Plex Sans',monospace;}
  .pill-ver{color:#1daf58;font-weight:800;}
  .pchips{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px;}
  .pchip{font-size:10px;font-weight:800;color:#1daf58;background:#e7f7ee;border-radius:100px;padding:2px 8px;}
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
  .kv{display:flex;align-items:center;gap:8px;padding:9px 15px;border-top:1px solid #f0f4f8;font-size:13px;}
  .kv::before{content:"";width:6px;height:6px;border-radius:50%;background:#1daf58;flex:0 0 auto;}
  .kv span{color:#6b8fa8;font-weight:600;}.kv b{font-weight:800;margin-inline-start:auto;text-align:end;}
  .tc{margin:0 0 18px;padding-inline-start:20px;font-size:11.5px;color:#2a4f72;line-height:1.7;}
  .tc li{margin-bottom:5px;}
  .signed{display:flex;align-items:center;gap:12px;background:#eef7f1;border-radius:10px;padding:13px 15px;font-size:12px;}
  .sig-check{flex:0 0 auto;width:30px;height:30px;border-radius:50%;background:#dcf4e8;color:#1daf58;font-weight:900;font-size:16px;display:flex;align-items:center;justify-content:center;}
  .sig-txt b{display:block;color:#1c3550;}.sig-txt>div{color:#6b8fa8;font-family:'IBM Plex Sans',monospace;margin-top:3px;}
  .foot{text-align:center;color:#9bb3c8;font-size:11px;margin-top:16px;}
  @media print{body{background:#fff;}.q-doc{box-shadow:none;margin:0;border-radius:0;}}`;

/**
 * Grouped My Bids (web-app/multi-item-requests, Phase 2). Fetches bids for every request in the
 * group, merges them, and shows a supplier Level-2 filter + equipment-focused bid cards across the
 * whole submission, plus select-for-quotation. `getBidList` is per-request, so we fan the fetch out.
 */
export function GroupBids({ group, initialItemId }: { group: RequestGroup; initialItemId?: string | null }) {
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
  const [selectedItem, setSelectedItem] = useState<string>(initialItemId ?? "all"); // scope bids to one request item
  const [itemMenuOpen, setItemMenuOpen] = useState(false);
  const [openPrice, setOpenPrice] = useState<string | null>(null);
  const [perUnit, setPerUnit] = useState(false); // price breakdown: "All N units" vs "Per unit"
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false); // prototype: pick bids to compare/export
  const [equipBid, setEquipBid] = useState<GroupBid | null>(null);
  const [termsBid, setTermsBid] = useState<GroupBid | null>(null);
  const [langPick, setLangPick] = useState(false); // quotation language chooser (Arabic | English)
  const [renterName, setRenterName] = useState("");
  const [companyName, setCompanyName] = useState("");
  // Renter company identity for the quotation Rentee block (app parity) — from /api/me.
  const [renterId, setRenterId] = useState<{ phone: string | null; email: string | null; crNumber: string | null; vatNumber: string | null; nationalAddress: string | null }>({ phone: null, email: null, crNumber: null, vatNumber: null, nationalAddress: null });
  const { tier } = useSession();
  const verified = tier === "verified";
  const [quoteGate, setQuoteGate] = useState(false); // unverified → confirm before issuing the quotation
  // web-app/006 demo (staging only) — relabel real bids as off-platform "via shared link".
  const [submissions, setSubmissions] = useState<LinkBidSubmission[]>([]); // real off-platform submissions (all group items)
  const [groupRef, setGroupRef] = useState<string | null>(null); // RFQ-NNNNN group short code (agents bid-submissions) — stamped on the quotation
  const [submissionBid, setSubmissionBid] = useState<GroupBid | null>(null);
  // Bid filter (source + refine), matching the bids-by-supplier prototype.
  const [filterOpen, setFilterOpen] = useState(false);
  const [fSource, setFSource] = useState<"all" | "link" | "platform" | "file">("all");
  const [fVerified, setFVerified] = useState(false);
  const [fKm, setFKm] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { user?: { firstName?: string; lastName?: string; companyName?: string | null; phone?: string | null; email?: string | null; crNumber?: string | null; vatNumber?: string | null; nationalAddress?: string | null } } | null) => {
        if (active && d?.user) {
          setRenterName([d.user.firstName, d.user.lastName].filter(Boolean).join(" "));
          setCompanyName(d.user.companyName ?? "");
          setRenterId({ phone: d.user.phone ?? null, email: d.user.email ?? null, crNumber: d.user.crNumber ?? null, vatNumber: d.user.vatNumber ?? null, nationalAddress: d.user.nationalAddress ?? null });
        }
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
    // Off-platform shared-link submissions are stored once per GROUP (a single bid covers all items),
    // so fetch them once by the group id — not per item (which would duplicate them). Best-effort.
    setSubmissions([]);
    fetchRequestSubmissions(group.id).then((r) => { if (active) { setSubmissions(r.submissions); setGroupRef(r.groupRef); } }).catch(() => {});
    return () => {
      active = false;
    };
  }, [group.id, group.items]);

  // Scope to the item the renter tapped "View Bids" on (or "all" when entering via "View all bids").
  useEffect(() => { setSelectedItem(initialItemId ?? "all"); }, [initialItemId, group.id]);

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // An off-platform submission is stored once per GROUP but covers several items. Show ONE card per
  // item (parity with on-platform bids) — scoped to that item's terms + price + total, matched to its
  // request so we can show the real equipment icon/image. Memoized so goCompare can include them too.
  const subCards: GroupBid[] = useMemo(
    () =>
      submissions.flatMap((s) =>
        s.items.map((it): GroupBid => {
          const gi = group.items.find((g) => g.id === it.requestId);
          return {
            ...submissionToBidCard(s, it),
            id: `link-${s.id}-${it.requestItemId}`, // unique per item-card (no key/selection collisions)
            requestId: it.requestId ?? s.requestId,
            itemLabel: gi?.item?.name ?? it.label ?? L("Equipment", "المعدة"),
            itemLabelAr: gi?.item?.nameAr ?? it.label ?? "المعدة",
            categoryId: gi?.item?.categoryId ?? null,
            itemImage: gi?.item?.imageUrl ?? null,
          };
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [submissions, group.items, ar],
  );

  // web-app/007 — open the comparison workspace pre-selected to the chosen bids (and their item).
  function goCompare() {
    const chosen = [...(bids ?? []), ...subCards].filter((b) => selected.has(b.id));
    if (chosen.length < 1) return;
    const params = new URLSearchParams({ group: group.id });
    const itemId = chosen[0]?.requestId;
    if (itemId) params.set("item", itemId);
    params.set("bids", chosen.map((b) => b.id).join(","));
    router.push(`/compare?${params.toString()}`);
  }

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

  function downloadQuotation(langIsAr: boolean, only?: GroupBid[]) {
    // Include off-platform (shared-link) bids alongside on-platform ones so a selected supplier
    // submission can be exported as a quotation just like an app bid. `only` lets a single card (e.g.
    // the submission viewer's Download) export just that bid through the SAME app-parity template.
    const chosen = only ?? [...(bids ?? []), ...subCards].filter((b) => selected.has(b.id));
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
    const reqCode = String(groupRef ?? group.items[0]?.displayId ?? group.id).replace(/[^A-Za-z0-9-]/g, "");

    // Render one supplier's quotation in a single language; bilingual output stacks both per supplier.
    const renderSection = (supBids: GroupBid[], si: number, isAr: boolean) => {
      const L = (en: string, arr: string) => (isAr ? arr : en);
      const sar = L("SAR", "ر.س");
      const dateStr = new Date().toLocaleDateString(isAr ? "ar-SA" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
      // Rentee identity (app parity) — company name primary when verified, else personal name; plus the
      // renter's real CR/VAT/national address/phone/email from /api/me (value-or-"Verified" pill).
      const rentee = {
        name: (verified && companyName.trim() ? companyName.trim() : renterName) || L("Moedatech renter", "مستأجر معداتك"),
        city: group.city ?? group.locationLabel,
        crNumber: renterId.crNumber,
        vatNumber: renterId.vatNumber,
        nationalAddress: renterId.nationalAddress,
        phone: renterId.phone,
        email: renterId.email,
      };
      const sup = supBids[0];
      const supInit = (sup.supplierName || "S").replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "S";
      const qnum = `Q-${reqCode}-${supInit}${si + 1}`;
      const validRaw = supBids.map((b) => b.validUntil).filter(Boolean).sort()[0] ?? null;
      const valid = validRaw ? new Date(validRaw).toLocaleDateString(isAr ? "ar-SA" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
      const reqIds = [...new Set(supBids.map((b) => itemMap.get(b.requestId)?.displayId ?? b.requestId))];
      const reqLabel = reqIds.length === 1 ? reqIds[0] : `${reqIds[0]} +${reqIds.length - 1}`;
      const rentalBasis = itemMap.get(sup.requestId)?.rentalType ?? "";
      const reqItem = itemMap.get(sup.requestId);
      const fmtRefDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString(isAr ? "ar-SA" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
      const startStr = fmtRefDate(reqItem?.startDate);
      const endStr = fmtRefDate(reqItem?.endDate);
      // Supplier identity rows (app parity): off-platform submissions carry real CR/VAT/address VALUES;
      // on-platform bids carry only verification FLAGS → render the app's value-or-"Verified" pill.
      const ld = sup.linkDocs ?? {};
      const idRow = (label: string, value: string | null | undefined, verifiedFlag: boolean) =>
        value ? `<div class="pid-row"><span>${esc(label)}</span><b>${esc(value)}</b></div>`
          : verifiedFlag ? `<div class="pid-row"><span>${esc(label)}</span><span class="pill-ver">✓ ${esc(L("Verified", "موثَّق"))}</span></div>`
            : "";
      // Value: off-platform link value first, else the on-platform real number (bid-list supplierProfile),
      // else the app's "Verified" pill when only the presence flag is known.
      const supIdRows =
        idRow(L("National address", "العنوان الوطني"), ld.national ?? sup.supplierNationalAddress, sup.compliance.nationalAddress) +
        idRow(L("CR #", "السجل التجاري"), ld.commercial ?? sup.supplierCrNumber, sup.compliance.activityLicense) +
        idRow(L("VAT #", "الرقم الضريبي"), ld.vat ?? sup.supplierVatNumber, sup.compliance.taxNumber) +
        idRow(L("Contact", "التواصل"), ld.contact ?? null, false);
      // Rentee identity rows (app parity) — same value-or-"Verified" rule as the supplier.
      const renteeIdRows =
        idRow(L("National address", "العنوان الوطني"), rentee.nationalAddress, verified) +
        idRow(L("CR #", "السجل التجاري"), rentee.crNumber, verified) +
        idRow(L("VAT #", "الرقم الضريبي"), rentee.vatNumber, verified) +
        idRow(L("Phone", "الهاتف"), rentee.phone, false) +
        idRow(L("Email", "البريد الإلكتروني"), rentee.email, false);
      const renteeChips = verified ? `<div class="pchips"><span class="pchip">✓ ${esc(L("Verified", "موثَّق"))}</span></div>` : "";
      // App parity: the quotation surfaces only the "Verified" chip — the app removed certificate chips
      // (Local content / SASO) from the quotation ("no longer surfaces certificates").
      const supChipList = [sup.verified ? L("Verified", "موثَّق") : null].filter(Boolean) as string[];
      const supChips = supChipList.length ? `<div class="pchips">${supChipList.map((c) => `<span class="pchip">✓ ${esc(c)}</span>`).join("")}</div>` : "";

      const eqLine = (b: GroupBid) => (b.equipment ? [b.equipment.make, b.equipment.model, b.equipment.year].filter(Boolean).join(" · ") : "—");
      const labelOf = (b: GroupBid) => (ar ? b.itemLabelAr : b.itemLabel) || (itemMap.get(b.requestId)?.displayId ?? b.requestId);
      // App rule (014 CR #141): the bid is priced per billing period; the unit count is NOT multiplied
      // into the price (it's shown for information only). Open-ended → ∞ qty + one-period "as operated".
      const daysPerPeriod = (u: string | null) => { switch ((u ?? "PER_DAY").toUpperCase()) { case "PER_WEEK": return 7; case "PER_MONTH": return 26; case "PER_JOB": return 0; default: return 1; } };
      const periodLabel = (u: string | null) => { switch ((u ?? "PER_DAY").toUpperCase()) { case "PER_WEEK": return L("week", "أسبوع"); case "PER_MONTH": return L("month", "شهر"); case "PER_JOB": return L("job", "مهمة"); default: return L("day", "يوم"); } };

      // Pricing rows — 6-column invoice (# · Item · Unit · Qty · Price · Total), app-parity layout.
      // Totals keep the web's chosen math: rate ÷ period-days × duration × units, mob/demob × units.
      let sub = 0;
      let rowNum = 0;
      const rows = supBids.map((b) => {
        const rate = b.price ?? 0;
        const units = b.numberOfUnits || 1;
        const dpp = daysPerPeriod(b.priceUnit);
        const plabel = periodLabel(b.priceUnit);
        const durDays = itemMap.get(b.requestId)?.durationDays ?? null;
        rowNum += 1;
        let lineSub: number, qtyCell: string, priceCell: string, totalCell: string;
        if (durDays == null) {
          lineSub = rate * units; // open-ended: one-period preview; billed "as operated"
          qtyCell = "∞";
          priceCell = `${nf(rate)} / ${esc(plabel)}`;
          totalCell = `<div class="sm">${esc(L("As operated", "حسب التشغيل"))}</div>${nf(rate)} / ${esc(plabel)}`;
        } else if (dpp > 0) {
          const periods = durDays / dpp;
          const pStr = Number.isInteger(periods) ? String(periods) : periods.toFixed(2);
          lineSub = (rate / dpp) * durDays * units;
          qtyCell = `${pStr} ${esc(plabel)}${units > 1 ? ` × ${units}` : ""}`;
          priceCell = `${nf(rate)} / ${esc(plabel)}`;
          totalCell = nf(lineSub);
        } else {
          lineSub = rate * units; // PER_JOB
          qtyCell = units > 1 ? String(units) : "1";
          priceCell = nf(rate);
          totalCell = nf(lineSub);
        }
        const mobTotal = (b.mobPrice ?? 0) * units;
        const demobTotal = (b.demobPrice ?? 0) * units;
        sub += lineSub + mobTotal + demobTotal;
        let r = `<tr><td class="num">${rowNum}</td><td><b>${esc(L("Rental", "الإيجار"))} — ${esc(labelOf(b))}</b><div class="sm">${esc(eqLine(b))}</div></td><td>${esc(plabel)}</td><td class="num">${qtyCell}</td><td class="num">${priceCell}</td><td class="num">${totalCell}</td></tr>`;
        if (b.mobPrice) r += `<tr><td></td><td><b>${esc(L("Delivery to site", "النقل إلى الموقع"))}</b><div class="sm">${esc(labelOf(b))}</div></td><td>${esc(L("Trip", "رحلة"))}</td><td class="num">${units}</td><td class="num">${nf(b.mobPrice)}</td><td class="num">${nf(mobTotal)}</td></tr>`;
        if (b.demobPrice) r += `<tr><td></td><td><b>${esc(L("Return from site", "الإرجاع من الموقع"))}</b><div class="sm">${esc(labelOf(b))}</div></td><td>${esc(L("Trip", "رحلة"))}</td><td class="num">${units}</td><td class="num">${nf(b.demobPrice)}</td><td class="num">${nf(demobTotal)}</td></tr>`;
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
      // App parity: the equipment-terms section prints the required/held safety certifications.
      const eqCertsText = (b: GroupBid) => {
        const cs = (b.heldCertCodes?.length ? b.heldCertCodes : b.equipmentCertCodes) ?? [];
        return cs.length ? cs.map((c) => (isAr ? CERT_LABEL[c]?.ar : CERT_LABEL[c]?.en)).filter(Boolean).join(" · ") : null;
      };
      let eqTermRows: string;
      if (supBids.length === 1) {
        const et = sup.requestTerms;
        eqTermRows =
          kvRow(L("Operator", "المشغّل"), tfmt.operator(et.operatorIncluded, et.operatorNationality)) +
          kvRow(L("Equipment safety certifications", "شهادات سلامة المعدة"), eqCertsText(sup)) +
          kvRow(L("Fuel type", "نوع الوقود"), tfmt.fuel(et.fuelType));
      } else {
        eqTermRows = supBids.map((b) => {
          const et = b.requestTerms;
          const parts = [tfmt.operator(et.operatorIncluded, et.operatorNationality), eqCertsText(b), tfmt.fuel(et.fuelType)].filter(Boolean).join(" · ");
          return kvRow(labelOf(b), parts || null);
        }).join("");
      }
      const eqTermsCard = eqTermRows ? `<div class="card"><div class="card-h">${esc(L("Equipment terms", "شروط المعدة"))}</div>${eqTermRows}</div>` : "";
      const ct = sup.requestTerms;
      const contractRows =
        kvRow(L("Payment terms", "شروط الدفع"), tfmt.payTerms(ct.paymentTerms)) +
        kvRow(L("Breakdown response", "زمن الاستجابة للأعطال"), tfmt.sla(ct.breakdownResponseSla)) +
        kvRow(L("Overtime", "العمل الإضافي"), tfmt.overtime(ct.overtimeRate)) +
        kvRow(L("Maintenance", "الصيانة"), tfmt.maint(ct.maintenanceResponsibility));
      const contractTermsCard = contractRows ? `<div class="card"><div class="card-h">${esc(L("Contract terms", "شروط العقد"))}</div>${contractRows}</div>` : "";

      return `<section class="q-doc" dir="${isAr ? "rtl" : "ltr"}" lang="${isAr ? "ar" : "en"}">
        <div class="q-head"><div class="q-title">${esc(L("Equipment rental quotation", "عرض سعر تأجير معدات"))}</div><div class="q-sub"><span class="qn">${esc(qnum)}</span><span>${esc(dateStr)}</span></div></div>
        <div class="q-body">
          <div class="parties">
            <div class="party"><div class="plabel">${esc(L("Supplier", "المؤجّر"))}</div><div class="pname">${esc(sup.supplierName)}</div>${sup.rating != null ? `<div class="pmeta">★ ${sup.rating.toFixed(1)}</div>` : ""}${supIdRows}${supChips}</div>
            <div class="party"><div class="plabel">${esc(L("Rentee", "المستأجر"))}</div><div class="pname">${esc(rentee.name)}</div>${rentee.city ? `<div class="pmeta">${esc(rentee.city)}</div>` : ""}${renteeIdRows}${renteeChips}</div>
          </div>
          <div class="metastrip">
            <div><span>${esc(L("Request #", "رقم الطلب"))}</span><b>${esc(groupRef ?? reqLabel)}</b></div>
            <div><span>${esc(L("Issue date", "تاريخ الإصدار"))}</span><b>${esc(dateStr)}</b></div>
            <div><span>${esc(L("Valid until", "صالح حتى"))}</span><b>${esc(valid)}</b></div>
            <div><span>${esc(L("Rental start", "بدء الإيجار"))}</span><b>${esc(startStr)}</b></div>
            <div><span>${esc(L("Rental end", "نهاية الإيجار"))}</span><b>${esc(endStr)}</b></div>
            <div><span>${esc(L("Currency", "العملة"))}</span><b>${esc(L("SAR · Saudi Riyal", "SAR · ريال سعودي"))}</b></div>
          </div>
          <div class="listed"><div class="ll">${esc(L("Listed equipment", "المعدات المدرجة"))} (${supBids.length})</div>${listedLines}</div>
          <table class="ptable">
            <thead><tr><th class="num">#</th><th>${esc(L("Item", "البند"))}</th><th>${esc(L("Unit", "الوحدة"))}</th><th class="num">${esc(L("Qty", "العدد"))}</th><th class="num">${esc(L("Price", "السعر"))}</th><th class="num">${esc(L("Total", "الإجمالي"))}</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="totals">
            <div class="trow"><span>${esc(L("Subtotal before VAT", "الإجمالي قبل الضريبة"))}</span><b>${nf(sub)}</b></div>
            <div class="trow"><span>${esc(L("VAT (15%)", "ضريبة القيمة المضافة (١٥٪)"))}</span><b>${nf(vat)}</b></div>
            <div class="trow grand"><span>${esc(L("Total", "الإجمالي"))}</span><b>${nf(total)} ${esc(sar)}</b></div>
          </div>
          <div class="words"><div class="wl">${esc(L("Amount in words", "المبلغ كتابةً"))}</div>${esc(isAr ? `${numWordsAr(total)} ريال سعودي` : `${numWords(total)} Saudi Riyals`)}</div>
          <div class="card"><div class="card-h">${esc(L("Project terms", "شروط المشروع"))}</div>
            ${scopeRows}
            <div class="kv"><span>${esc(L("Rental basis", "أساس الإيجار"))}</span><b>${esc(rentalBasis || "—")}</b></div>
            <div class="kv"><span>${esc(L("Equipment lines", "بنود المعدات"))}</span><b>${supBids.length}</b></div>
            <div class="kv"><span>${esc(L("Total units", "إجمالي الوحدات"))}</span><b>${supBids.reduce((sum, b) => sum + (b.numberOfUnits || 1), 0)}</b></div>
          </div>
          ${eqTermsCard}
          ${contractTermsCard}
          <ol class="tc">
            <li>${esc(L("This quotation is valid for seven (7) days from the issue date and expires automatically thereafter unless confirmed through the Moedatech platform.", "هذا العرض ساري المفعول لمدة سبعة (٧) أيام من تاريخ الإصدار، وتسقط صلاحيته تلقائيًا بعد ذلك ما لم يتم تأكيده عبر منصة معداتك."))}</li>
            <li>${esc(L("Prices are inclusive of items explicitly listed in the pricing table above. VAT at 15% applies per Saudi tax law.", "الأسعار شاملة لِما ذُكر صراحةً في جدول التسعير أعلاه، وضريبة القيمة المضافة بنسبة ١٥٪ مفروضة وفقًا للنظام السعودي."))}</li>
            <li>${esc(L("The supplier is responsible for the equipment's roadworthiness and technical safety on the delivery date, and for satisfying mandated safety certifications.", "المُورِّد مسؤول عن صلاحية المعدة وسلامتها الفنية في تاريخ التسليم، وعن استيفاء شهادات السلامة والوثائق المطلوبة نظامًا."))}</li>
            <li>${esc(L("This quotation is governed by the laws of the Kingdom of Saudi Arabia; competent Saudi courts have exclusive jurisdiction over any dispute.", "يخضع هذا العرض لأنظمة المملكة العربية السعودية، وتختصُّ المحاكم السعودية المختصة بالفصل في أي نزاع."))}</li>
            <li>${esc(L("This document is issued electronically via the Moedatech platform and is legally equivalent to a signed document under the Saudi Electronic Transactions Law.", "تَمَّ إصدار هذا المستند إلكترونيًا عبر منصة معداتك، ويُعدّ مكافئًا قانونيًا للمستند الموقَّع وفقًا لنظام التعاملات الإلكترونية السعودي."))}</li>
          </ol>
          <div class="signed"><span class="sig-check">✓</span><div class="sig-txt"><b>${esc(L("Electronically signed via the Moedatech platform", "موقّع إلكترونيًا عبر منصة معداتك"))}</b><div>${esc(qnum)} · ${esc(dateStr)}</div></div></div>
          <div class="foot">${esc(L("Auto-generated by Moedatech · support@moedatech.com", "صادر تلقائيًا من منصة معداتك · support@moedatech.com"))}</div>
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
  const allBids = [...bids, ...subCards];
  if (allBids.length === 0) return <div className="rempty">{L("No bids yet for this request.", "لا توجد عروض بعد لهذا الطلب.")}</div>;

  const suppliers = bidSuppliers(allBids);
  // Bid source: off-platform shared-link vs on-platform (no uploaded-file source on this surface yet).
  const sourceOf = (b: GroupBid): "link" | "platform" | "file" => (b.viaSharedLink ? "link" : "platform");
  const srcCount = (s: "all" | "link" | "platform" | "file") => (s === "all" ? allBids.length : allBids.filter((b) => sourceOf(b) === s).length);
  const base = supplierKey === "all" ? [...allBids].sort((a, b) => a.requestId.localeCompare(b.requestId)) : allBids.filter((b) => (b.supplierId ?? b.supplierName) === supplierKey);
  const shown = base.filter(
    (b) =>
      (selectedItem === "all" || b.requestId === selectedItem) &&
      (fSource === "all" || sourceOf(b) === fSource) &&
      (!fVerified || b.verified) &&
      (!fKm || (b.distanceKm != null && b.distanceKm <= 50)),
  );
  const fActive = (fSource !== "all" ? 1 : 0) + (fVerified ? 1 : 0) + (fKm ? 1 : 0);
  const selectedCount = allBids.filter((b) => selected.has(b.id)).length;
  // Item picker: one entry per request line + its bid count (off-platform included via allBids).
  const itemList = group.items.map((it) => ({
    id: it.id,
    name: (ar ? it.item?.nameAr : it.item?.name) || it.displayId,
    img: it.item?.imageUrl ?? null,
    categoryId: it.item?.categoryId ?? null,
    qty: it.item?.qty ?? 1,
    count: allBids.filter((b) => b.requestId === it.id).length,
  }));
  const selItem = itemList.find((i) => i.id === selectedItem) ?? null;
  const shownSuppliers = new Set(shown.map((b) => b.supplierId ?? b.supplierName)).size;
  // Card width scales with how many bids there are: 1–2 grow to fill the row (no empty side margin);
  // 3+ take a fixed width so the third card peeks at the edge, hinting the horizontal scroll.
  const cardFlex = shown.length <= 2 ? "1 1 0" : "0 0 calc(44% - 8px)";
  // Toolbar chip styles (prototype bids-by-supplier).
  const supChip = (on: boolean): CSSProperties => ({ display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap", flexShrink: 0, padding: "10px 14px", borderRadius: 22, cursor: "pointer", fontWeight: 800, fontSize: 13, fontFamily: "inherit", background: on ? "#1c3550" : "#fff", color: on ? "#fff" : "#1c3550", border: `1px solid ${on ? "#1c3550" : "#d4e0ec"}` });
  const chipCount = (on: boolean): CSSProperties => ({ fontSize: 11, fontWeight: 800, background: on ? "rgba(255,255,255,.18)" : "#eff4f9", color: on ? "#fff" : "#6b8fa8", padding: "1px 7px", borderRadius: 20 });
  const itemMenuRow = (on: boolean): CSSProperties => ({ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "start", padding: "9px 11px", borderRadius: 9, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 13, fontFamily: "inherit", background: on ? "#eff4f9" : "transparent", color: "#1c3550" });
  const menuCount: CSSProperties = { fontSize: 11, fontWeight: 800, color: "#6b8fa8", background: "#F0F4F9", padding: "1px 8px", borderRadius: 20 };

  return (
    <div>
      {/* toolbar — supplier tabs | item picker | filter icon (prototype bids-by-supplier) */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
        {/* supplier tabs */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          <button onClick={() => setSupplierKey("all")} style={supChip(supplierKey === "all")}>
            {L("All suppliers", "كل المؤجّرين")}<span style={chipCount(supplierKey === "all")}>{allBids.length}</span>
          </button>
          {suppliers.map((s) => {
            const on = supplierKey === s.key;
            return (
              <button key={s.key} onClick={() => setSupplierKey(s.key)} style={supChip(on)}>
                <span style={{ width: 18, height: 18, borderRadius: "50%", background: on ? "rgba(255,255,255,.2)" : "#1c3550", color: "#fff", fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{s.name.charAt(0).toUpperCase()}</span>
                {s.name}
                {s.verified && <span className="material-icons-outlined" style={{ fontSize: 14, color: on ? "#7CE5A6" : "#1daf58" }}>verified</span>}
                <span style={chipCount(on)}>{s.count}</span>
              </button>
            );
          })}
        </div>
        <div style={{ width: 1, height: 34, background: "#D7DEE8", flexShrink: 0 }} />
        {/* item picker */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={() => { setItemMenuOpen((o) => !o); setFilterOpen(false); }} title={L("Filter by item", "تصفية حسب البند")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 11, border: "1.5px solid #1c3550", background: "#1c3550", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, padding: 1 }}>
              {selItem
                ? <EquipImg src={selItem.img} categoryId={selItem.categoryId} name={selItem.name} box="" img="h-[26px] w-[26px] object-contain" iconSize={24} />
                : <span className="material-icons-outlined" style={{ fontSize: 20, color: "#1c3550" }}>apps</span>}
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, background: "rgba(255,255,255,.16)", color: "#FBBF6B", padding: "1px 7px", borderRadius: 20 }}>{selItem ? selItem.count : allBids.length}</span>
            <span className="material-icons-outlined" style={{ fontSize: 16, color: "#9DAFC6" }}>expand_more</span>
          </button>
          {itemMenuOpen && (
            <>
              <div onClick={() => setItemMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
              <div style={{ position: "absolute", zIndex: 30, top: "100%", insetInlineEnd: 0, marginTop: 6, background: "#fff", border: "1px solid #d4e0ec", borderRadius: 13, boxShadow: "0 16px 40px rgba(20,40,70,.20)", padding: 6, minWidth: 280, maxHeight: 360, overflowY: "auto" }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".06em", color: "#6b8fa8", padding: "6px 9px 7px" }}>{L("VIEWING ITEM", "البند المعروض")}</div>
                <button onClick={() => { setSelectedItem("all"); setItemMenuOpen(false); }} style={itemMenuRow(selectedItem === "all")}>
                  <span className="material-icons-outlined" style={{ fontSize: 18 }}>apps</span>
                  <span style={{ flex: 1 }}>{L("All items", "كل البنود")}</span>
                  <span style={menuCount}>{allBids.length}</span>
                </button>
                {itemList.map((m) => (
                  <button key={m.id} onClick={() => { setSelectedItem(m.id); setItemMenuOpen(false); }} style={itemMenuRow(selectedItem === m.id)}>
                    <EquipImg src={m.img} categoryId={m.categoryId} name={m.name} box="" img="h-4 w-4 object-contain" iconSize={18} />
                    <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</span>
                    {m.qty > 1 && <span style={{ fontSize: 10, fontWeight: 800, color: "#d4780a", background: "#fff3e0", padding: "1px 6px", borderRadius: 20 }}>×{m.qty}</span>}
                    <span style={menuCount}>{m.count}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {/* filter icon */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={() => { setFilterOpen((o) => !o); setItemMenuOpen(false); }} title={L("Filter bids", "تصفية العروض")} style={{ position: "relative", width: 42, height: 42, borderRadius: 11, border: `1.5px solid ${fActive ? "#f79009" : "#d4e0ec"}`, background: fActive ? "#fff4e5" : "#fff", color: fActive ? "#f79009" : "#1c3550", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span className="material-icons-outlined" style={{ fontSize: 20 }}>filter_list</span>
            {fActive > 0 && <span style={{ position: "absolute", top: -6, insetInlineEnd: -6, fontSize: 10, fontWeight: 900, background: "#f79009", color: "#fff", minWidth: 17, height: 17, borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>{fActive}</span>}
          </button>
          {filterOpen && (
            <>
              <div className="filter-backdrop" onClick={() => setFilterOpen(false)} />
              <div className="filter-pop" style={{ insetInlineStart: "auto", insetInlineEnd: 0 }}>
                <div className="fp-h">{L("Bid source", "مصدر العرض")}</div>
                {([
                  ["all", L("All sources", "كل المصادر"), null, ""],
                  ["link", L("Off your request link", "من رابط طلبك"), "link", "var(--action)"],
                  ["platform", L("On platform", "على المنصة"), "verified", "var(--success)"],
                ] as const).map(([key, label, icon, color]) => (
                  <div key={key} className={`fp-opt${fSource === key ? " on" : ""}`} onClick={() => setFSource(key)}>
                    <span className="radio" />
                    {icon && <span className="material-icons-outlined fp-ic" style={{ color }}>{icon}</span>}
                    {label}
                    <span className="fp-n">{srcCount(key)}</span>
                  </div>
                ))}
                <div className="fp-div" />
                <div className="fp-h">{L("Refine", "تنقية")}</div>
                <div className={`fp-opt fp-check${fVerified ? " on" : ""}`} onClick={() => setFVerified((v) => !v)}>
                  <span className="box"><span className="material-icons-outlined">check</span></span>
                  <span className="material-icons-outlined fp-ic" style={{ color: "var(--success)" }}>verified_user</span>{L("Verified suppliers only", "المؤجّرون الموثّقون فقط")}
                </div>
                <div className={`fp-opt fp-check${fKm ? " on" : ""}`} onClick={() => setFKm((v) => !v)}>
                  <span className="box"><span className="material-icons-outlined">check</span></span>
                  <span className="material-icons-outlined fp-ic" style={{ color: "var(--navy-mid)" }}>place</span>{L("Within 50 km of site", "ضمن ٥٠ كم من الموقع")}
                </div>
                <div className="fp-foot">
                  <button className="clr" onClick={() => { setFSource("all"); setFVerified(false); setFKm(false); }}>{L("Clear all", "مسح الكل")}</button>
                  <button className="done" onClick={() => setFilterOpen(false)}>{L("Done", "تم")}</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "0 0 14px" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#2a4f72" }}>
          {selectMode
            ? L("Tap a bid to select · compare or download a quotation", "اضغط على عرض للتحديد · قارن أو نزّل عرض سعر")
            : `${shown.length} ${L("bids from", "عروض من")} ${shownSuppliers} ${L("suppliers", "مؤجّرين")}${selItem ? ` · ${selItem.name}` : ""}`}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {selectMode && (
            <button onClick={() => { setSelectMode(false); setSelected(new Set()); }} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 800, color: "#6b8fa8" }}>
              {L("Cancel", "إلغاء")}
            </button>
          )}
          <button
            onClick={() => setSelectMode((m) => !m)}
            title={L("Pick bids to compare or quote", "اختر عروضًا للمقارنة أو التسعير")}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 11, padding: "10px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", background: selectMode ? "#1c3550" : "#fff", color: selectMode ? "#fff" : "#1c3550", border: `1px solid ${selectMode ? "#1c3550" : "#d4e0ec"}` }}
          >
            <span className="material-icons-outlined" style={{ fontSize: 17 }}>checklist</span>
            {selectMode ? L("Selecting", "جارٍ التحديد") : L("Select bids", "تحديد العروض")}
          </button>
        </div>
      </div>

      <div className="bids-snap">
      {shown.map((b) => {
        if (b.viaSharedLink) {
          return (
            <SharedLinkBidCard
              key={b.id}
              bid={b}
              ar={ar}
              L={L}
              isSel={selected.has(b.id)}
              selectMode={selectMode}
              cardFlex={cardFlex}
              onToggleSelect={() => toggleSelect(b.id)}
              onViewSubmission={() => setSubmissionBid(b)}
              itemLabel={ar ? b.itemLabelAr : b.itemLabel}
              itemImage={b.itemImage}
              categoryId={b.categoryId}
            />
          );
        }
        const sp = SPILL[b.status] ?? SPILL.PENDING;
        const sc = ({
          PENDING: { bg: "#e6f2fb", c: "#1a7ec8", dot: true },
          OPEN_FOR_NEGOTIATION: { bg: "#fff3e0", c: "#d4780a", dot: true },
          COUNTER_OFFERED: { bg: "#fff3e0", c: "#d4780a", dot: true },
          ACCEPTED: { bg: "#e7f7ee", c: "#1daf58", dot: false },
          EXPIRED: { bg: "#eff4f9", c: "#6b8fa8", dot: false },
          WITHDRAWN: { bg: "#eff4f9", c: "#6b8fa8", dot: false },
        } as Record<string, { bg: string; c: string; dot: boolean }>)[b.status] ?? { bg: "#e6f2fb", c: "#1a7ec8", dot: true };
        const disabled = b.status === "EXPIRED" || b.status === "WITHDRAWN" || b.expired;
        const offered = b.unitsOffered || 1; // units this supplier is offering
        const needed = b.numberOfUnits || offered; // units the request asked for
        const cover = needed ? Math.min(100, Math.round((offered / needed) * 100)) : 0;
        const priceOpen = openPrice === b.id;
        const isSel = selected.has(b.id);
        // Card price — canonical quote: rate ÷ period-days × duration (weekly ÷7, monthly ÷26),
        // mob/demob × units, VAT 15%. "Per unit" toggle prices one unit; else all offered units.
        const u = priceOpen && perUnit ? 1 : offered;
        const cq = computeBidQuote(b, { units: u, fallbackDays: group.items.find((it) => it.id === b.requestId)?.durationDays ?? null });
        const rental = cq.rentalSubtotal;
        const deliv = cq.mobTotal;
        const ret = cq.demobTotal;
        const sub = cq.subtotalPreVat;
        const vat = Math.round(cq.vat);
        const grand = Math.round(cq.total);
        // Mobile parity (v3_bid_card): collapsed headline = the PER-UNIT rental total (rate × periods),
        // excluding units/mob/demob/VAT — so bids compare on the unit rate. All-in lives in the grand total.
        const perUnitRentalTotal = Math.round((b.price ?? 0) * cq.periods);
        const rentalTotalLabel = ((): string => {
          switch ((b.priceUnit ?? "PER_DAY").toUpperCase()) {
            case "PER_WEEK": return L("Weekly rental total", "إجمالي الإيجار الأسبوعي");
            case "PER_MONTH": return L("Monthly rental total", "إجمالي الإيجار الشهري");
            case "PER_JOB": return L("Job total", "إجمالي المهمة");
            default: return L("Daily rental total", "إجمالي الإيجار اليومي");
          }
        })();
        const isAccepted = (b.status ?? "").toUpperCase() === "ACCEPTED";
        // Mobile parity (v3_bid_card TermsSectionRow): tally the negotiable terms into Matched / Conflict /
        // Pending (grey + negotiating fold into Pending) — the same 6 keys the app counts on the bid card.
        const NEG_KEYS = ["payment_terms", "breakdown_response_sla", "overtime_rate", "fuel_responsibility", "certs", "operator"];
        const negRows = (() => {
          const seen = new Set<string>(); const out: typeof b.terms.equipment = [];
          for (const r of [...b.terms.equipment, ...b.terms.contract, ...(b.negotiableTerms ?? [])]) {
            if (NEG_KEYS.includes(r.key) && !seen.has(r.key)) { seen.add(r.key); out.push(r); }
          }
          return out;
        })();
        const termTally = negRows.reduce((t, r) => {
          if (r.state === "matched" || r.state === "agreed") t.matched++;
          else if (r.state === "conflict") t.conflict++;
          else t.pending++;
          return t;
        }, { matched: 0, conflict: 0, pending: 0 });
        const termChips = [
          { label: L("Matched", "مطابق"), n: termTally.matched, c: "#1daf58" },
          { label: L("Conflict", "تعارض"), n: termTally.conflict, c: "#d9362a" },
          { label: L("Pending", "معلّق"), n: termTally.pending, c: "#d4780a" },
        ];
        const certChips = [
          ...(b.equipmentCertCodes ?? []).map((c) => (ar ? CERT_LABEL[c]?.ar : CERT_LABEL[c]?.en) || c),
          ...(b.ownershipDocs ?? []).map((o) => (ar ? o.labelAr : o.labelEn)),
        ].slice(0, 3);
        const rowSep = { borderTop: "1px solid #EFF2F6" } as const;
        const iconBox = { width: 40, height: 40, borderRadius: 11, background: "#eff4f9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } as const;
        const blueLink = { background: "none", border: "none", color: "#1a7ec8", fontWeight: 800, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" } as const;
        // Top banner = the bid's SOURCE only (2 values, app parity): on-platform bids are always
        // "Via Moedatech app" in BLUE; off-platform shared-link bids carry the ORANGE banner on their
        // own card (SharedLinkBidCard). The negotiation STATUS lives in the right badge + the CTA suffix.
        const banner = { icon: "verified_user", text: L("Via Moedatech app", "عبر تطبيق معداتك"), bg: "#e6f2fb", c: "#1a7ec8", bd: "#cfe6f7" };
        return (
          <div
            key={b.id}
            onClick={selectMode ? () => toggleSelect(b.id) : undefined}
            style={{ flex: cardFlex, minWidth: 320, scrollSnapAlign: "start", alignSelf: "stretch", display: "flex", flexDirection: "column", position: "relative", background: "#fff", border: `1px solid ${isSel ? "#f79009" : "#d4e0ec"}`, borderRadius: 18, overflow: "hidden", boxShadow: "0 1px 2px rgba(20,40,70,.04)", outline: isSel ? "2px solid #f79009" : "none", outlineOffset: 2, cursor: selectMode ? "pointer" : "default" }}
          >
            <div style={{ height: 4, background: banner.c }} />
            {banner && (
              <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", background: banner.bg, borderBottom: `1px solid ${banner.bd}`, fontSize: 11.5, fontWeight: 800, color: banner.c }}>
                <span className="material-icons-outlined" style={{ fontSize: 16 }}>{banner.icon}</span>{banner.text}
              </div>
            )}
            {selectMode && (
              <div style={{ position: "absolute", top: 12, insetInlineEnd: 12, width: 26, height: 26, borderRadius: "50%", background: isSel ? "#f79009" : "#fff", border: `2px solid ${isSel ? "#f79009" : "#d4e0ec"}`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(20,40,70,.18)", zIndex: 5, pointerEvents: "none" }}>
                {isSel && <span className="material-icons-outlined" style={{ fontSize: 16 }}>check</span>}
              </div>
            )}

            {/* header */}
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "16px 16px 12px" }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: "#eff4f9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <EquipImg src={b.itemImage} categoryId={b.categoryId} name={ar ? b.itemLabelAr : b.itemLabel} box="" img="h-10 w-10 object-contain" iconSize={36} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
                  <span style={{ flex: "0 1 auto", minWidth: 0, fontSize: 13.5, fontWeight: 900, color: "#1c3550", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.25 }} title={ar ? b.itemLabelAr : b.itemLabel}>{ar ? b.itemLabelAr : b.itemLabel}</span>
                  <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: "#d4780a", background: "#fff3e0", padding: "1px 8px", borderRadius: 20 }}>×{offered}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6 }}>
                  <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#1c3550", color: "#fff", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{(b.supplierName || "S").charAt(0).toUpperCase()}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: "#1c3550" }}>{b.supplierName}</span>
                  {b.verified && <span className="material-icons-outlined" style={{ fontSize: 16, color: "#1daf58" }}>verified</span>}
                </div>
              </div>
              {!selectMode && (
                <span style={{ whiteSpace: "nowrap", fontSize: 11, fontWeight: 800, padding: "5px 11px", borderRadius: 20, background: sc.bg, color: sc.c, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {sc.dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.c }} />}{ar ? sp.ar : sp.en}
                </span>
              )}
            </div>

            {/* fulfillment band */}
            <div style={{ margin: "0 16px 14px", padding: "10px 14px", borderRadius: 12, background: "#fff4e5", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#1c3550", whiteSpace: "nowrap" }}>{L(`Covers ${offered} of ${needed} units`, `يغطّي ${offered} من ${needed} وحدات`)}</span>
              <div style={{ flex: 1, height: 8, borderRadius: 6, background: "rgba(247,144,9,.18)", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 6, background: "#f79009", width: `${cover}%` }} />
              </div>
              <span style={{ fontSize: 12, color: "#6b8fa8", fontWeight: 700, whiteSpace: "nowrap" }}>{[b.rating != null ? `★ ${b.rating.toFixed(1)}` : "", b.distanceKm != null ? `${Math.round(b.distanceKm)} km` : ""].filter(Boolean).join(" · ")}</span>
            </div>

            {/* Equipment row */}
            <div style={{ ...rowSep, display: "flex", alignItems: "center", gap: 12, padding: "13px 16px" }}>
              <div style={iconBox}>
                <EquipImg src={b.itemImage} categoryId={b.categoryId} name={ar ? b.itemLabelAr : b.itemLabel} box="" img="h-5 w-5 object-contain" iconSize={20} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#1c3550" }}>{L("Equipment", "المعدة")}</span>
              <div style={{ display: "flex", gap: 4, flexWrap: "nowrap", flex: 1, minWidth: 0, overflowX: "auto" }} className="no-sb">
                {certChips.map((c, i) => (
                  <span key={i} style={{ fontSize: 11, fontWeight: 800, color: "#1daf58", background: "#e7f7ee", padding: "2px 9px", borderRadius: 20, whiteSpace: "nowrap" }}>✓ {c}</span>
                ))}
              </div>
              {!selectMode && (
                <button onClick={() => setEquipBid(b)} style={blueLink}>{L("Details", "التفاصيل")} ›</button>
              )}
            </div>

            {/* Terms row */}
            <div style={{ ...rowSep, display: "flex", alignItems: "center", gap: 12, padding: "13px 16px" }}>
              <div style={iconBox}><span className="material-icons-outlined" style={{ fontSize: 20, color: "#6b8fa8" }}>description</span></div>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#1c3550" }}>{L("Terms", "الشروط")}</span>
              <div style={{ display: "flex", gap: 4, flexWrap: "nowrap", flex: 1, minWidth: 0, overflowX: "auto" }} className="no-sb">
                {termChips.map((t) => (
                  <span key={t.label} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 800, color: t.n > 0 ? t.c : "#9AA7B8", whiteSpace: "nowrap" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: t.n > 0 ? t.c : "#c3d2e0" }} />{t.label} {t.n}
                  </span>
                ))}
              </div>
              {!selectMode && <button onClick={() => setTermsBid(b)} style={blueLink}>{L("View", "عرض")} ›</button>}
            </div>


            {/* Price row — headline is the PER-UNIT rental total (mobile parity); rate shown in the caption */}
            <div style={{ ...rowSep, padding: "13px 16px", ...(isAccepted ? { background: "#e7f7ee" } : {}) }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ ...iconBox, background: "#fff4e5" }}><span className="material-icons-outlined" style={{ fontSize: 20, color: "#f79009" }}>payments</span></div>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#1c3550" }}>{rentalTotalLabel}</span>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#6b8fa8", marginTop: 1 }}>{nf(b.price ?? 0)}/{periodOf(b.priceUnit)} × {Number.isInteger(cq.periods) ? cq.periods : cq.periods.toFixed(2)} · {L("per unit", "للوحدة")}</div>
                </div>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 17, fontWeight: 900, color: "#f79009" }}>{nf(perUnitRentalTotal)} {L("SAR", "ر.س")}</span>
                {isAccepted && <span className="material-icons-outlined" style={{ fontSize: 18, color: "#1daf58" }} title={L("Accepted", "مقبول")}>check_circle</span>}
                {!selectMode && (
                  <button onClick={() => { setOpenPrice(priceOpen ? null : b.id); setPerUnit(false); }} style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid #d4e0ec", background: "#F7FAFC", color: "#6b8fa8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span className="material-icons-outlined" style={{ fontSize: 18 }}>{priceOpen ? "expand_less" : "expand_more"}</span>
                  </button>
                )}
              </div>
              {priceOpen && !selectMode && (
                <div style={{ marginTop: 12 }}>
                  {offered > 1 && (
                    <div style={{ display: "inline-flex", background: "#eff4f9", borderRadius: 10, padding: 3, marginBottom: 12 }}>
                      {([[false, L(`All ${offered} units`, `كل ${offered} وحدات`)], [true, L("Per unit", "لكل وحدة")]] as [boolean, string][]).map(([v, lab]) => (
                        <button key={String(v)} onClick={() => setPerUnit(v)} style={{ padding: "6px 13px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 12.5, fontFamily: "inherit", background: perUnit === v ? "#1c3550" : "transparent", color: perUnit === v ? "#fff" : "#6b8fa8" }}>{lab}</button>
                      ))}
                    </div>
                  )}
                  {([
                    [L(`Rental (${nf(b.price ?? 0)}/${periodOf(b.priceUnit)} × ${Number.isInteger(cq.periods) ? cq.periods : cq.periods.toFixed(2)}${u > 1 ? ` × ${u}` : ""})`, `الإيجار (${nf(b.price ?? 0)}/${periodOf(b.priceUnit)} × ${Number.isInteger(cq.periods) ? cq.periods : cq.periods.toFixed(2)}${u > 1 ? ` × ${u}` : ""})`), rental, null],
                    ...(deliv ? [[u > 1 ? L(`Delivery to site (${nf(Math.round(deliv / u))} × ${u} units)`, `النقل إلى الموقع (${nf(Math.round(deliv / u))} × ${u} وحدة)`) : L("Delivery to site", "النقل إلى الموقع"), deliv, b.mobLeadTime]] as [string, number, string | null][] : []),
                    ...(ret ? [[u > 1 ? L(`Return from site (${nf(Math.round(ret / u))} × ${u} units)`, `الإرجاع من الموقع (${nf(Math.round(ret / u))} × ${u} وحدة)`) : L("Return from site", "الإرجاع من الموقع"), ret, b.demobLeadTime]] as [string, number, string | null][] : []),
                    [L("Subtotal before VAT", "المجموع قبل الضريبة"), sub, null],
                    [L("VAT (15%)", "ضريبة القيمة المضافة (١٥٪)"), vat, null],
                  ] as [string, number, string | null][]).map(([lab, val, note], i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: "1px solid #F2F5F8" }}>
                      <span style={{ fontSize: 13.5, color: "#2a4f72", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>{lab}{note ? <span style={{ fontSize: 11, color: "#6b8fa8", background: "#eff4f9", padding: "1px 7px", borderRadius: 20, whiteSpace: "nowrap" }}>{note}</span> : null}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#1c3550", fontVariantNumeric: "tabular-nums" }}>{nf(val)}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, padding: "12px 14px", borderRadius: 10, background: "#FAFCFE", border: "1.5px solid #1c3550" }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#1c3550" }}>{L("Grand total", "الإجمالي الكلي")}</span>
                    <span style={{ fontSize: 18, fontWeight: 900, color: "#1c3550" }}>{nf(grand)} <span style={{ color: "#f79009" }}>{L("SAR", "ر.س")}</span></span>
                  </div>
                </div>
              )}
            </div>

            {/* supplier note */}
            {b.note && (
              <div style={{ ...rowSep, display: "flex", gap: 8, padding: "12px 16px", alignItems: "flex-start" }}>
                <span style={{ fontSize: 15 }}>💬</span>
                <span style={{ fontSize: 13, color: "#6b8fa8", fontWeight: 600, lineHeight: 1.5 }}>{b.note}</span>
              </div>
            )}

            {/* CTA */}
            {!selectMode && (
              <div style={{ marginTop: "auto", padding: "12px 16px 16px" }}>
                <button disabled={disabled || busyId === b.id} onClick={() => startNegotiation(b)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 9, padding: "14px", borderRadius: 14, border: "none", background: disabled ? "#9AA7B8" : "#1c3550", color: "#fff", fontWeight: 800, fontSize: 15, cursor: disabled ? "default" : "pointer", fontFamily: "inherit", opacity: busyId === b.id ? 0.7 : 1 }}>
                  <span className="material-icons-outlined" style={{ fontSize: 18 }}>{b.status === "ACCEPTED" ? "receipt_long" : "forum"}</span>{pillLabel(b.status, L)}{offerSuffix(b.uiState, L) ? ` · ${offerSuffix(b.uiState, L)}` : ""}
                </button>
              </div>
            )}
          </div>
        );
      })}
      </div>

      {selectMode && selectedCount > 0 && (
        <div className="qbar">
          <span className="qn">{selectedCount} {L("selected", "محدّد")}</span>
          {selectedCount < shown.length && <span className="qclear" onClick={() => setSelected(new Set(shown.map((b) => b.id)))}>{L("Select all", "تحديد الكل")}</span>}
          <span className="qclear" onClick={() => setSelected(new Set())}>{L("Clear", "مسح")}</span>
          {/* web-app/007 — Compare the selected bids side by side (works with a single bid too). */}
          <button
            className="qdl"
            disabled={selectedCount < 1}
            style={{ background: "var(--navy)", opacity: selectedCount < 1 ? 0.5 : 1 }}
            title={L("Compare side by side", "قارن جنبًا إلى جنب")}
            onClick={goCompare}
          >
            <span className="material-icons-outlined">compare_arrows</span> {L("Compare", "قارن")}
          </button>
          <button className="qdl" onClick={() => (verified ? setLangPick(true) : setQuoteGate(true))}>
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

      {/* Terms modal (prototype "Terms — <supplier>") — per-class term status + Negotiate terms */}
      {termsBid && (
        <BidTermsModal
          supplier={termsBid.supplierName}
          terms={termsBid.terms}
          ar={ar}
          L={L}
          busy={busyId === termsBid.id}
          onNegotiate={() => { const b = termsBid; setTermsBid(null); startNegotiation(b); }}
          onClose={() => setTermsBid(null)}
        />
      )}

      {/* Issue-quotation gate for an unverified renter (company name vs personal name). */}
      {quoteGate && (
        <QuotationVerifyGate
          ar={ar}
          L={L}
          onClose={() => setQuoteGate(false)}
          onVerify={() => { setQuoteGate(false); router.push("/verify"); }}
          onContinue={() => { setQuoteGate(false); setLangPick(true); }}
        />
      )}

      {/* web-app/006 — read-only viewer of an off-platform shared-link submission (real answers) */}
      {submissionBid && (
        <SharedBidSubmissionModal
          bid={submissionBid}
          submission={submissions.find((s) => s.id === submissionBid.submissionKey) ?? null}
          ar={ar}
          L={L}
          onClose={() => setSubmissionBid(null)}
          onDownloadQuotation={() => downloadQuotation(ar, [submissionBid])}
        />
      )}
    </div>
  );
}
