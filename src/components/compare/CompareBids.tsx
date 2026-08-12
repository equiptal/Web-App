// DISABLED — the quote-upload comparison (already had no callers), replaced by the requests workspace at /requests.
// Nothing was deleted: every line below is the original, line-commented in place, so re-enabling
// is a mechanical revert. See docs/requests-workspace-disabled.md.
// "use client";
//
// import { useEffect, useRef, useState, type ReactNode } from "react";
// import { useRouter } from "next/navigation";
// import { useLocale } from "@/lib/i18n";
// import { GroupStrip } from "@/components/requests/RequestsList";
// import { fetchRequestGroup, fetchBids, fetchRequestDetail, fetchMyRequests } from "@/lib/api/client";
// import { groupRequests, mapRequestListItem, type RequestGroup, type RequestListItem } from "@/lib/contract/requests";
// import type { BidCard } from "@/lib/contract/bids";
// import { EquipImg, equipmentIcon } from "@/components/requests/EquipImg";
// import { groupIdFromFileName, itemCodesFromFileName, primaryCodeFromFileName } from "@/lib/compare/quotation-token";
// import "@/components/requests/requests-proto.css";
// import "@/components/compare/compare-proto.css";
// import { computeBidQuote } from "@/lib/contract/comparison";
//
// const nf = (n: number) => Math.round(n).toLocaleString("en-US");
//
// /** One supplier's offer on an item — a received bid, with its computed VAT-inclusive total. */
// type Offer = { bid: BidCard; total: number };
//
// /** Computed conclusion (no AI) — the takeaways from one item's offers, in a couple of lines. */
// function comparisonSummary(offers: Offer[], ar: boolean, L: (en: string, arr: string) => string): string[] {
//   if (!offers.length) return [];
//   const sar = L("SAR", "ر.س");
//   const reqMet = (o: Offer) => [o.bid.verified, o.bid.compliance.activityLicense, o.bid.compliance.taxNumber, o.bid.compliance.safety, o.bid.compliance.localContent, o.bid.compliance.saso, o.bid.eqVerified].filter(Boolean).length;
//   const yearOf = (o: Offer) => o.bid.equipment?.year ?? 0;
//   const nm = (o: Offer) => o.bid.supplierName;
//   const cheapest = offers.reduce((a, b) => (b.total < a.total ? b : a));
//   const topCompliant = offers.reduce((a, b) => (reqMet(b) > reqMet(a) ? b : a));
//   const out: string[] = [];
//   if (offers.length === 1) {
//     const o = offers[0];
//     out.push(L(`${nm(o)} is the only quotation: ${nf(o.total)} ${sar} total (incl. VAT), meeting ${reqMet(o)} of 7 requirements.`,
//       `${nm(o)} هو العرض الوحيد: ${nf(o.total)} ${sar} الإجمالي (شامل الضريبة)، ويستوفي ${reqMet(o)} من 7 متطلبات.`));
//   } else {
//     const maxTotal = Math.max(...offers.map((o) => o.total));
//     const saving = maxTotal - cheapest.total;
//     out.push(saving > 0
//       ? L(`Cheapest: ${nm(cheapest)} at ${nf(cheapest.total)} ${sar} — ${nf(saving)} ${sar} below the highest offer.`,
//           `الأرخص: ${nm(cheapest)} بسعر ${nf(cheapest.total)} ${sar} — أقل بـ ${nf(saving)} ${sar} من أعلى عرض.`)
//       : L(`All offers are priced the same (${nf(cheapest.total)} ${sar} incl. VAT).`,
//           `جميع العروض بنفس السعر (${nf(cheapest.total)} ${sar} شامل الضريبة).`));
//     out.push(nm(topCompliant) === nm(cheapest)
//       ? L(`${nm(cheapest)} also meets the most requirements (${reqMet(cheapest)}/7) — strongest overall.`,
//           `${nm(cheapest)} يستوفي أيضًا أكثر المتطلبات (${reqMet(cheapest)}/7) — الأقوى إجمالاً.`)
//       : L(`Best documented: ${nm(topCompliant)} meets ${reqMet(topCompliant)}/7 requirements (vs ${reqMet(cheapest)}/7 for the cheapest).`,
//           `الأكثر توثيقًا: ${nm(topCompliant)} يستوفي ${reqMet(topCompliant)}/7 (مقابل ${reqMet(cheapest)}/7 للأرخص).`));
//     const withYear = offers.filter((o) => yearOf(o) > 0);
//     if (withYear.length) {
//       const newest = withYear.reduce((a, b) => (yearOf(b) > yearOf(a) ? b : a));
//       if (nm(newest) !== nm(cheapest)) out.push(L(`${nm(newest)} has the newest equipment (${yearOf(newest)}).`, `${nm(newest)} لديه أحدث معدة (${yearOf(newest)}).`));
//     }
//   }
//   return out;
// }
//
// /** One uploaded quotation's resolved data — its group + items + bids per item. */
// type Loaded = { group: RequestGroup; items: RequestListItem[]; bidsByItem: Record<string, BidCard[]> };
//
// export function CompareBids() {
//   const { locale } = useLocale();
//   const ar = locale === "ar";
//   const L = (en: string, arr: string) => (ar ? arr : en);
//   const router = useRouter();
//
//   // Each uploaded quotation → its group id (codes are deduped). Multiple files / groups allowed.
//   const [entries, setEntries] = useState<{ code: string; name: string }[]>([]);
//   const [loaded, setLoaded] = useState<Record<string, Loaded | "error">>({});
//   const [selKey, setSelKey] = useState<string | null>(null);
//   const [busy, setBusy] = useState(false);
//   const [error, setError] = useState<string | null>(null);
//   const [dragOver, setDragOver] = useState(false);
//   const fileRef = useRef<HTMLInputElement | null>(null);
//
//   useEffect(() => {
//     const pending = entries.filter((e) => !(e.code in loaded));
//     if (!pending.length) return;
//     let active = true;
//     setBusy(true);
//     (async () => {
//       for (const e of pending) {
//         try {
//           let items: RequestListItem[] = [];
//           if (/^(RFQ|REQ)-\d+$/i.test(e.code)) {
//             // New quotation filenames carry a HUMAN short code (RFQ-NNNNN group / REQ-NNNNN single) with
//             // no UUID — resolve it against the renter's own requests (groupRef / displayId).
//             const code = e.code.toUpperCase();
//             const all = await fetchMyRequests().then((r) => r.requests).catch(() => [] as RequestListItem[]);
//             items = /^RFQ-/i.test(e.code)
//               ? all.filter((it) => (it.groupRef ?? "").toUpperCase() === code)
//               : all.filter((it) => it.displayId.toUpperCase() === code);
//           } else {
//             const { requests } = await fetchRequestGroup(e.code);
//             items = requests;
//             // Historical/solo requests have a null requestGroupId, so the stamped code is the request
//             // id (not a group id) and the groupId filter returns nothing — fall back to that one request.
//             if (!items.length) {
//               const rec = await fetchRequestDetail(e.code).catch(() => null);
//               if (rec) items = [mapRequestListItem(rec)];
//             }
//           }
//           if (!items.length) { if (active) setLoaded((p) => ({ ...p, [e.code]: "error" })); continue; }
//           // Scope to ONLY the equipment the uploaded quotation covered (stamped in its filename).
//           // If none were stamped (older file / renamed), keep the whole group.
//           const wanted = itemCodesFromFileName(e.name);
//           if (wanted.length) {
//             const scoped = items.filter((it) => wanted.includes(it.displayId));
//             if (scoped.length) items = scoped;
//           }
//           const [g] = groupRequests(items);
//           const lists = await Promise.all(
//             items.map((r) => fetchBids(r.id).then((d) => [r.id, d.bids] as const).catch(() => [r.id, [] as BidCard[]] as const)),
//           );
//           if (!active) return;
//           setLoaded((p) => ({ ...p, [e.code]: { group: g, items, bidsByItem: Object.fromEntries(lists) } }));
//         } catch {
//           if (active) setLoaded((p) => ({ ...p, [e.code]: "error" }));
//         }
//       }
//       if (active) setBusy(false);
//     })();
//     return () => { active = false; };
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [entries]);
//
//   function addCode(code: string, name: string) {
//     setError(null);
//     setEntries((prev) => (prev.some((e) => e.code === code) ? prev : [...prev, { code, name }]));
//   }
//   function onFiles(files: FileList | null) {
//     if (!files?.length) return;
//     let added = false;
//     for (const f of Array.from(files)) {
//       // Legacy files embed the group UUID; new files are named with the human RFQ-/REQ- short code.
//       const gid = groupIdFromFileName(f.name) ?? primaryCodeFromFileName(f.name);
//       if (gid) { addCode(gid, f.name); added = true; }
//     }
//     if (!added) setError(L("That file isn’t a Moedatech quotation — use the file you downloaded, or paste its comparison code.", "هذا الملف ليس عرض سعر من معداتك — استخدم الملف الذي نزّلته أو الصق رمز المقارنة."));
//   }
//   function removeEntry(code: string) { setEntries((prev) => prev.filter((e) => e.code !== code)); }
//   function clearAll() { setEntries([]); setLoaded({}); setSelKey(null); setError(null); }
//
//   // Combine items + bids across every successfully-loaded quotation (different request ids never collide).
//   const okGroups = entries.map((e) => loaded[e.code]).filter((d): d is Loaded => !!d && d !== "error");
//   const allItems = okGroups.flatMap((d) => d.items);
//   const bidsByItem: Record<string, BidCard[]> = Object.assign({}, ...okGroups.map((d) => d.bidsByItem));
//
//   // Priced through the shared quote helper — the same one the request's own bid list and the comparison
//   // workspace use. This used to be `rate × days × units`, with NO divisor: a 4,200/week bid over 13 days
//   // came out at 54,600 instead of 7,700, so the cross-quotation basket ranked bids on invented money.
//   const lineTotal = (it: RequestListItem, b: BidCard) =>
//     computeBidQuote(b, { units: it.item?.qty ?? 1, fallbackDays: it.durationDays ?? null, startDate: it.startDate ?? null }).total;
//   const offersFor = (it: RequestListItem): Offer[] => (bidsByItem[it.id] ?? []).map((b) => ({ bid: b, total: lineTotal(it, b) }));
//   const selItem = allItems.find((i) => i.id === selKey) ?? allItems[0] ?? null;
//
//   let basketTotal = 0, basketItems = 0;
//   for (const it of allItems) {
//     const offs = offersFor(it);
//     if (offs.length) { basketTotal += Math.min(...offs.map((o) => o.total)); basketItems++; }
//   }
//
//   const stillLoading = busy && entries.some((e) => !(e.code in loaded));
//   // No bids surfaced — either a quotation didn't resolve, or it resolved but no item has any bid.
//   // The usual cause is a quotation from a different account, so guide the renter.
//   const someNotFound = entries.some((e) => loaded[e.code] === "error");
//   const noBidsFound = allItems.length > 0 && basketItems === 0;
//   const showNoBidsNote = !stillLoading && entries.length > 0 && (someNotFound || noBidsFound);
//
//   // Export every item's comparison (table + summary) as a print-ready PDF (browser "Save as PDF").
//   function exportComparisonPdf() {
//     const items = allItems.filter((it) => offersFor(it).length > 0);
//     if (!items.length) return;
//     const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
//     const sar = L("SAR", "ر.س");
//     const dateStr = new Date().toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
//
//     const sections = items.map((it) => {
//       const offers = offersFor(it);
//       const minTotal = Math.min(...offers.map((o) => o.total));
//       const yearOf = (o: Offer) => o.bid.equipment?.year ?? 0;
//       const distOf = (o: Offer) => o.bid.distanceKm ?? Infinity;
//       const maxYear = Math.max(...offers.map(yearOf));
//       const minDist = Math.min(...offers.map(distOf));
//       const reqMet = (o: Offer) => [o.bid.verified, o.bid.compliance.activityLicense, o.bid.compliance.taxNumber, o.bid.compliance.safety, o.bid.compliance.localContent, o.bid.compliance.saso, o.bid.eqVerified].filter(Boolean).length;
//       const maxReq = Math.max(...offers.map(reqMet));
//       const title = (ar ? it.item?.nameAr : it.item?.name) || it.displayId;
//       const money = (v: number | null) => (v == null ? `<span class="soft">${esc(L("Not specified", "غير محدّد"))}</span>` : v === 0 ? `<span class="soft">${esc(L("Included", "مشمول"))}</span>` : `${nf(v)} ${esc(sar)}`);
//       const chk = (b: boolean) => `<span class="${b ? "ok" : "no"}">${b ? "✓" : "✕"}</span>`;
//       const row = (label: string, cell: (o: Offer) => string, win?: (o: Offer) => boolean) =>
//         `<tr><td class="lbl">${esc(label)}</td>${offers.map((o) => `<td class="${win && win(o) ? "win" : ""}">${cell(o)}</td>`).join("")}</tr>`;
//       const bh = (label: string, cls: string) => `<tr class="bh ${cls}"><td colspan="${offers.length + 1}">${esc(label)}</td></tr>`;
//       const body = [
//         bh(L("Price", "السعر"), "p"),
//         row(L("Total incl. VAT", "الإجمالي شامل الضريبة"), (o) => `<b>${nf(o.total)} ${esc(sar)}</b>`, (o) => o.total === minTotal),
//         row(`${L("Rate", "السعر")} / ${(it.rentalType ?? "day").toLowerCase()}${(it.item?.qty ?? 1) > 1 ? ` × ${it.item?.qty} ${L("units", "وحدة")}` : ""}`, (o) => `${nf(o.bid.price ?? 0)} ${esc(sar)}`),
//         row(L("Delivery to site", "التوصيل للموقع"), (o) => money(o.bid.mobPrice)),
//         row(L("Pickup from site", "الاستلام من الموقع"), (o) => money(o.bid.demobPrice)),
//         bh(L("Quality & suitability", "الجودة والملاءمة"), "q"),
//         row(L("Year of manufacture", "سنة الصنع"), (o) => String(o.bid.equipment?.year ?? "—"), (o) => yearOf(o) === maxYear && maxYear > 0),
//         row(L("Brand", "العلامة"), (o) => esc(o.bid.equipment?.make ?? "—")),
//         row(L("Model", "الطراز"), (o) => esc(o.bid.equipment?.model ?? "—")),
//         row(L("Distance from site", "المسافة من الموقع"), (o) => (o.bid.distanceKm != null ? `${Math.round(o.bid.distanceKm)} ${esc(L("km", "كم"))}` : "—"), (o) => distOf(o) === minDist && Number.isFinite(minDist)),
//         row(L("Rating", "التقييم"), (o) => (o.bid.rating != null ? `★ ${o.bid.rating.toFixed(1)}` : "—")),
//         bh(L("Compliance & documents", "الامتثال والمستندات"), "c"),
//         row(L("Verification status", "حالة التوثيق"), (o) => (o.bid.verified ? esc(L("Verified", "موثّق")) : esc(L("Not verified", "غير موثّق")))),
//         row(L("Entity type", "نوع الكيان"), (o) => (o.bid.compliance.entityType === "company" ? esc(L("Company", "شركة")) : esc(L("Individual", "فرد")))),
//         row(L("Activity license", "رخصة النشاط"), (o) => chk(o.bid.compliance.activityLicense)),
//         row(L("Tax number", "الرقم الضريبي"), (o) => chk(o.bid.compliance.taxNumber)),
//         row(L("Safety certifications", "شهادات السلامة"), (o) => chk(o.bid.compliance.safety)),
//         row(L("Local content certificate", "شهادة المحتوى المحلي"), (o) => chk(o.bid.compliance.localContent)),
//         row(L("SASO certificate", "شهادة ساسو"), (o) => chk(o.bid.compliance.saso)),
//         row(L("Equipment verification", "توثيق المعدة"), (o) => chk(o.bid.eqVerified)),
//         row(L("Requirements met", "المتطلبات المستوفاة"), (o) => `${reqMet(o)} / 7`, (o) => reqMet(o) === maxReq && maxReq > 0),
//         // Trailing free-text row — surfaces every non-fixed quote term the supplier attached (folds in
//         // uploaded quotes' notes + extra_terms). Display-only: the comparison math stays on the fixed schema.
//         row(L("Notes", "ملاحظات"), (o) => esc(o.bid.note || "—")),
//       ].join("");
//       const sup = offers.map((o) => `<th>${esc(o.bid.supplierName)}${o.bid.verified ? " ✓" : ""}</th>`).join("");
//       const summary = comparisonSummary(offers, ar, L);
//       const meta = `${it.item?.qty ?? 1} ${esc(L("units", "وحدة"))} · ${offers.length} ${esc(offers.length === 1 ? L("quotation", "عرض") : L("quotations", "عروض"))}`;
//       return `<section class="cmp-doc"><h2>${esc(title)} <small>${meta}</small></h2>` +
//         `<table><thead><tr><th class="lbl"></th>${sup}</tr></thead><tbody>${body}</tbody></table>` +
//         (summary.length ? `<div class="sum"><div class="sum-h">${esc(L("Summary", "الخلاصة"))}</div><ul>${summary.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>` : "") +
//         `</section>`;
//     }).join("");
//
//     const basket = basketItems > 0 ? `<div class="basket">${esc(L("Cheapest basket — lowest offer per item", "أرخص سلة — أقل عرض لكل عنصر"))}: <b>${nf(basketTotal)} ${esc(sar)}</b> <span class="soft">(${basketItems} ${esc(L("of", "من"))} ${allItems.length} ${esc(L("items", "عناصر"))})</span></div>` : "";
//     const css = `*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Inter','Segoe UI',Roboto,sans-serif;color:#1c3550;padding:22px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}h1{font-size:20px;font-weight:900;}.head{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #1c3550;padding-bottom:10px;margin-bottom:14px;}.head .d{font-size:12px;color:#6b8fa8;font-weight:700;}.basket{background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:13px;font-weight:700;}.basket b{color:#f79009;}.cmp-doc{margin-bottom:22px;page-break-inside:avoid;}.cmp-doc h2{font-size:15px;font-weight:800;margin-bottom:8px;}.cmp-doc h2 small{font-size:11.5px;font-weight:600;color:#6b8fa8;}table{width:100%;border-collapse:collapse;font-size:12px;}th,td{border:1px solid #e4edf5;padding:7px 9px;text-align:start;}thead th{background:#1c3550;color:#fff;font-weight:800;font-size:11.5px;}thead th.lbl{background:#fff;}td.lbl{background:#f7fafd;font-weight:700;color:#6b8fa8;width:200px;}tr.bh td{font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:.04em;}tr.bh.p td{background:rgba(247,144,9,.1);color:#b45309;}tr.bh.q td{background:rgba(37,99,235,.1);color:#1d4ed8;}tr.bh.c td{background:rgba(29,175,88,.1);color:#15803d;}td.win{background:rgba(29,175,88,.12);}.ok{color:#15803d;font-weight:800;}.no{color:#dc2626;font-weight:800;}.soft{color:#94a3b8;}.sum{background:#eef4fe;border:1px solid #cfe0fb;border-radius:8px;padding:9px 12px;margin-top:8px;}.sum-h{font-size:11.5px;font-weight:800;color:#2563eb;margin-bottom:4px;}.sum ul{padding-inline-start:18px;}.sum li{font-size:12px;font-weight:600;color:#33506e;line-height:1.5;}@media print{body{padding:0;}}`;
//     const html = `<!doctype html><html lang="${ar ? "ar" : "en"}" dir="${ar ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${esc(L("Bid comparison", "مقارنة العروض"))}</title>` +
//       `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet"><style>${css}</style></head><body>` +
//       `<div class="head"><h1>${esc(L("Bid comparison", "مقارنة العروض"))}</h1><span class="d">${esc(dateStr)}</span></div>${basket}${sections}` +
//       `<script>window.onload=function(){setTimeout(function(){window.print();},350);}</script></body></html>`;
//     const w = window.open("", "_blank");
//     if (!w) return;
//     w.document.write(html);
//     w.document.close();
//   }
//
//   return (
//     <div className="rproto" dir={ar ? "rtl" : "ltr"}>
//       {/* drop zone — stays visible so more quotations (even from other requests) can be added */}
//       <div
//         className={`dropzone${dragOver ? " over" : ""}`}
//         onClick={() => fileRef.current?.click()}
//         onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
//         onDragLeave={() => setDragOver(false)}
//         onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
//       >
//         <div className="dz-ic"><span className="material-icons-outlined">upload_file</span></div>
//         <div className="dz-t">{L("Upload Moedatech quotations", "ارفع عروض أسعار معداتك")}</div>
//         <div className="dz-s">{L("Drop one or more quotation PDFs you downloaded — even from different requests. We compare every item across them.", "أسقط ملفًا أو أكثر من عروض الأسعار التي نزّلتها — حتى من طلبات مختلفة. نقارن كل عنصر عبرها.")}</div>
//         <input ref={fileRef} type="file" accept="application/pdf" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
//       </div>
//       {error && <p className="cmp-error">{error}</p>}
//
//       {/* uploaded tray — one chip per quotation */}
//       {entries.length > 0 && (
//         <div className="tray">
//           <span className="tlab">{entries.length} {entries.length > 1 ? L("quotations", "عروض") : L("quotation", "عرض")}</span>
//           {entries.map((e) => {
//             const d = loaded[e.code];
//             const err = d === "error";
//             const g = d && d !== "error" ? d.group : null;
//             return (
//               <span key={e.code} className={`qchip${err ? " err" : ""}`}>
//                 <span className="av">{(g?.locationLabel ?? "?").charAt(0).toUpperCase()}</span>
//                 {err ? L("Not found", "غير موجود") : g ? g.locationLabel : L("Loading…", "جارٍ التحميل…")}
//                 <span className="fn">{e.name}</span>
//                 <span className="x" onClick={() => removeEntry(e.code)}><span className="material-icons-outlined">close</span></span>
//               </span>
//             );
//           })}
//           <span className="clear-all" onClick={clearAll}>{L("Clear all", "مسح الكل")}</span>
//         </div>
//       )}
//
//       {stillLoading && <div className="rstate"><span className="material-icons-outlined" style={{ fontSize: 28 }}>progress_activity</span></div>}
//
//       {showNoBidsNote && (
//         <p className="cmp-note">
//           <span className="material-icons-outlined">info</span>
//           {L("No bids found for this quotation — make sure it was generated by your Moedatech account.", "لم يتم العثور على عروض لهذا العرض — تأكد من أنه صادر من حساب معداتك الخاص بك.")}
//         </p>
//       )}
//
//       {allItems.length > 0 && (
//         <>
//           {/* one request/bid-style header per uploaded quotation (same GroupStrip as Requests & Bids) */}
//           {okGroups.map((d) => <GroupStrip key={d.group.id} group={d.group} ar={ar} L={L} router={router} />)}
//
//           {/* cheapest basket — across every item from every uploaded quotation */}
//           {basketItems > 0 && (
//             <div className="basket">
//               <span className="bk-ic"><span className="material-icons-outlined">shopping_basket</span></span>
//               <div>
//                 <div className="bk-t">{L("Cheapest basket — lowest offer per item", "أرخص سلة — أقل عرض لكل عنصر")}</div>
//                 <div className="bk-s">{L("Lowest offer on", "أقل عرض على")} {basketItems} {L("of", "من")} {allItems.length} {L("items, combined (incl. VAT)", "عناصر، شامل الضريبة")}</div>
//               </div>
//               <span className="bk-v">{nf(basketTotal)} {L("SAR", "ر.س")}</span>
//             </div>
//           )}
//
//           {/* export the whole comparison (all items) as a print-ready PDF */}
//           {basketItems > 0 && (
//             <div className="cmp-actions">
//               <button className="cmp-export" onClick={exportComparisonPdf}>
//                 <span className="material-icons-outlined">picture_as_pdf</span> {L("Export comparison (PDF)", "تصدير المقارنة (PDF)")}
//               </button>
//             </div>
//           )}
//
//           {/* item tabs — every item across all uploaded quotations */}
//           <div className="item-tabs">
//             <div className="flab"><span className="material-icons-outlined">view_module</span>{L("Item", "العنصر")}</div>
//             <div className="itabs">
//               {allItems.map((it) => {
//                 const cnt = offersFor(it).length;
//                 return (
//                   <button key={it.id} className={`itab${it.id === selItem?.id ? " on" : ""}`} onClick={() => setSelKey(it.id)}>
//                     <span className="material-icons-outlined">{equipmentIcon(it.item?.name)}</span>
//                     {(ar ? it.item?.nameAr : it.item?.name) || it.displayId}
//                     <span className="ct">{cnt}</span>
//                   </button>
//                 );
//               })}
//             </div>
//           </div>
//
//           {selItem && <ItemComparison item={selItem} offers={offersFor(selItem)} ar={ar} L={L} />}
//         </>
//       )}
//     </div>
//   );
// }
//
// /* ── one item's comparison — suppliers as columns, attributes as rows in 3 blocks ── */
// function ItemComparison({ item, offers, ar, L }: { item: RequestListItem; offers: Offer[]; ar: boolean; L: (en: string, arr: string) => string }) {
//   const title = (ar ? item.item?.nameAr : item.item?.name) || item.displayId;
//   const head = (
//     <div className="cmp-h">
//       <span className="ci"><EquipImg src={item.item?.imageUrl ?? null} categoryId={item.item?.categoryId ?? null} name={item.item?.name} box="" img="h-7 w-7 object-contain" iconSize={22} /></span>
//       <div>
//         <div className="ct">{title}</div>
//         <div className="cs">{(item.item?.qty ?? 1)} {L("units", "وحدة")} · {offers.length} {offers.length === 1 ? L("quotation", "عرض") : L("quotations", "عروض")} · {item.durationDays ? `${item.durationDays} ${L("days", "يوم")}` : item.rentalType ?? ""}</div>
//       </div>
//     </div>
//   );
//
//   if (offers.length === 0) {
//     return <section className="cmp">{head}<div className="cmp-empty">{L("No bids on this item yet.", "لا توجد عروض على هذا العنصر بعد.")}</div></section>;
//   }
//
//   const n = offers.length;
//   const gt = { gridTemplateColumns: `136px repeat(${n}, minmax(124px, 1fr))` };
//   const yearOf = (o: Offer) => o.bid.equipment?.year ?? 0;
//   const distOf = (o: Offer) => o.bid.distanceKm ?? Infinity;
//   const minTotal = Math.min(...offers.map((o) => o.total));
//   const maxYear = Math.max(...offers.map(yearOf));
//   const minDist = Math.min(...offers.map(distOf));
//   const reqMet = (o: Offer) => [o.bid.verified, o.bid.compliance.activityLicense, o.bid.compliance.taxNumber, o.bid.compliance.safety, o.bid.compliance.localContent, o.bid.compliance.saso, o.bid.eqVerified].filter(Boolean).length;
//   const maxReq = Math.max(...offers.map(reqMet));
//
//   const sar = L("SAR", "ر.س");
//   const moneyOrState = (v: number | null) =>
//     v == null ? <span className="csoft">{L("Not specified", "غير محدّد")}</span>
//     : v === 0 ? <span className="csoft">{L("Included", "مشمول")}</span>
//     : <span className="cmoney">{nf(v)} <span className="sar">{sar}</span></span>;
//   const chk = (b: boolean) => <span className={`cchk ${b ? "ok" : "no"}`}>{b ? "✓" : "✕"}</span>;
//
//   // Computed conclusion (no AI) — shared with the PDF export.
//   const conclusion = comparisonSummary(offers, ar, L);
//
//   const Row = ({ label, cell }: { label: string; cell: (o: Offer) => ReactNode }) => (
//     <div className="crow cgrid" style={gt}>
//       <div className="clbl">{label}</div>
//       {offers.map((o, i) => <div key={i} className="ccell">{cell(o)}</div>)}
//     </div>
//   );
//   const RowWin = ({ label, win, cell }: { label: string; win: (o: Offer) => boolean; cell: (o: Offer) => ReactNode }) => (
//     <div className="crow cgrid" style={gt}>
//       <div className="clbl">{label}</div>
//       {offers.map((o, i) => <div key={i} className={`ccell${win(o) ? " win" : ""}`}>{cell(o)}</div>)}
//     </div>
//   );
//
//   return (
//     <section className="cmp">
//       {head}
//       <div className="cmpx-scroll">
//         <div className="cmpx" style={{ minWidth: 136 + n * 130 }}>
//           {/* supplier strip */}
//           <div className="cstrip cgrid" style={gt}>
//             <div className="clbl" />
//             {offers.map((o, i) => (
//               <div key={i} className="csup">
//                 <div className="cava">{o.bid.supplierName.charAt(0).toUpperCase()}{o.bid.verified && <span className="ctick">✓</span>}</div>
//                 <div className="cname">{o.bid.supplierName}</div>
//                 {o.bid.status === "ACCEPTED" && <span className="cacc">{L("Accepted", "مقبول")}</span>}
//               </div>
//             ))}
//           </div>
//
//           {/* Price */}
//           <div className="cblock b-price">
//             <div className="cbhead"><span className="cdot" />{L("Price", "السعر")}</div>
//             <RowWin label={L("Total incl. VAT", "الإجمالي شامل الضريبة")} win={(o) => o.total === minTotal} cell={(o) => <span className="cmoney big">{nf(o.total)} <span className="sar">{sar}</span></span>} />
//             <Row label={`${L("Rate", "السعر")} / ${(item.rentalType ?? "day").toLowerCase()}${(item.item?.qty ?? 1) > 1 ? ` × ${item.item?.qty} ${L("units", "وحدة")}` : ""}`} cell={(o) => <span className="cmoney">{nf(o.bid.price ?? 0)} <span className="sar">{sar}</span></span>} />
//             <Row label={L("Delivery to site", "التوصيل للموقع")} cell={(o) => moneyOrState(o.bid.mobPrice)} />
//             <Row label={L("Pickup from site", "الاستلام من الموقع")} cell={(o) => moneyOrState(o.bid.demobPrice)} />
//           </div>
//
//           {/* Quality */}
//           <div className="cblock b-qual">
//             <div className="cbhead"><span className="cdot" />{L("Quality & suitability", "الجودة والملاءمة")}</div>
//             <RowWin label={L("Year of manufacture", "سنة الصنع")} win={(o) => yearOf(o) === maxYear && maxYear > 0} cell={(o) => <span className="cval num">{o.bid.equipment?.year ?? "—"}</span>} />
//             <Row label={L("Brand", "العلامة")} cell={(o) => <span className="cval">{o.bid.equipment?.make ?? "—"}</span>} />
//             <Row label={L("Model", "الطراز")} cell={(o) => <span className="cval">{o.bid.equipment?.model ?? "—"}</span>} />
//             <RowWin label={L("Distance from site", "المسافة من الموقع")} win={(o) => distOf(o) === minDist && Number.isFinite(minDist)} cell={(o) => <span className="cval">{o.bid.distanceKm != null ? `${Math.round(o.bid.distanceKm)} ${L("km", "كم")}` : "—"}</span>} />
//             <Row label={L("Rating", "التقييم")} cell={(o) => <span className="cval">{o.bid.rating != null ? `★ ${o.bid.rating.toFixed(1)}` : "—"}</span>} />
//           </div>
//
//           {/* Compliance & documents */}
//           <div className="cblock b-comp">
//             <div className="cbhead"><span className="cdot" />{L("Compliance & documents", "الامتثال والمستندات")}</div>
//             <Row label={L("Verification status", "حالة التوثيق")} cell={(o) => <span className={`cvpill ${o.bid.verified ? "ok" : "no"}`}>{o.bid.verified ? L("Verified", "موثّق") : L("Not verified", "غير موثّق")}</span>} />
//             <Row label={L("Entity type", "نوع الكيان")} cell={(o) => <span className="cval">{o.bid.compliance.entityType === "company" ? L("Company", "شركة") : L("Individual", "فرد")}</span>} />
//             <Row label={L("Activity license", "رخصة النشاط")} cell={(o) => chk(o.bid.compliance.activityLicense)} />
//             <Row label={L("Tax number", "الرقم الضريبي")} cell={(o) => chk(o.bid.compliance.taxNumber)} />
//             <Row label={L("Safety certifications", "شهادات السلامة")} cell={(o) => chk(o.bid.compliance.safety)} />
//             <Row label={L("Local content certificate", "شهادة المحتوى المحلي")} cell={(o) => chk(o.bid.compliance.localContent)} />
//             <Row label={L("SASO certificate", "شهادة ساسو")} cell={(o) => chk(o.bid.compliance.saso)} />
//             <Row label={L("Equipment verification", "توثيق المعدة")} cell={(o) => chk(o.bid.eqVerified)} />
//             <RowWin label={L("Requirements met", "المتطلبات المستوفاة")} win={(o) => reqMet(o) === maxReq && maxReq > 0} cell={(o) => <span className="cfrac">{reqMet(o)} / 7</span>} />
//             {/* Trailing free-text row — every non-fixed quote term (uploaded quotes fold notes + extra_terms
//                 into bid.note). Display-only; the comparison math stays on the fixed schema. */}
//             <Row label={L("Notes", "ملاحظات")} cell={(o) => <span className="cval">{o.bid.note || "—"}</span>} />
//           </div>
//         </div>
//       </div>
//       {conclusion.length > 0 && (
//         <div className="cmp-summary">
//           <div className="cmp-sum-h"><span className="material-icons-outlined">insights</span>{L("Summary", "الخلاصة")}</div>
//           <ul>{conclusion.map((ln, i) => <li key={i}>{ln}</li>)}</ul>
//         </div>
//       )}
//     </section>
//   );
// }
//
