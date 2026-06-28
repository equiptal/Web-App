"use client";

import { useEffect } from "react";
import type { BidCard } from "@/lib/contract/bids";
import type { LinkBidSubmission } from "@/lib/contract/link-bids";

/**
 * web-app/006 (expanded) — read-only viewer of an off-platform bid submitted through the renter's
 * shared link. Renders the supplier's ACTUAL submitted answers (company details + per-item term
 * confirmations + pricing) from the stored `LinkBidSubmission`. No deal room — the supplier has no account.
 */
const nf = (n: number) => Math.round(n).toLocaleString("en-US");

export function SharedBidSubmissionModal({
  bid,
  submission,
  ar,
  L,
  onClose,
  onAddToCompare,
}: {
  bid: BidCard;
  submission: LinkBidSubmission | null;
  ar: boolean;
  L: (en: string, arr: string) => string;
  onClose: () => void;
  onAddToCompare?: () => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sar = L("SAR", "ر.س");
  const TERMS: { key: keyof NonNullable<LinkBidSubmission["items"][number]["confirmations"]>; en: string; ar: string }[] = [
    { key: "operator", en: "Operator", ar: "المشغّل" },
    { key: "nationality", en: "Operator nationality", ar: "جنسية المشغّل" },
    { key: "fatFood", en: "Food (F.A.T)", ar: "الطعام" },
    { key: "fatTransport", en: "Accommodation & transport", ar: "السكن والمواصلات" },
    { key: "fuel", en: "Fuel responsibility", ar: "مسؤولية الوقود" },
    { key: "fuelType", en: "Fuel type", ar: "نوع الوقود" },
    { key: "year", en: "Equipment year", ar: "سنة الصنع" },
    { key: "operatorCert", en: "Operator certificate", ar: "شهادة المشغّل" },
    { key: "equipmentCert", en: "Equipment certificate", ar: "شهادة المعدة" },
    { key: "payment", en: "Payment type", ar: "نوع الدفع" },
    { key: "overtime", en: "Overtime rate", ar: "أجر العمل الإضافي" },
    { key: "breakdownSla", en: "Breakdown response", ar: "زمن الاستجابة للأعطال" },
    { key: "maintenance", en: "Maintenance", ar: "الصيانة" },
  ];

  // Company-details grid cell (matches the prototype's company-grid). `full` spans both columns.
  const cd = (label: string, value: string | null | undefined, mono = false, full = false) =>
    value ? (
      <div className={full ? "col-span-2" : ""}>
        <div className="text-[11px] text-slate-400">{label}</div>
        <div className={`text-[13px] font-semibold text-slate-800${mono ? " font-mono" : ""}`}>{value}</div>
      </div>
    ) : null;

  return (
    <div className="slb-overlay" dir={ar ? "rtl" : "ltr"} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="slb-modal" role="dialog" aria-modal="true">
        <div className="slb-head">
          <span className="slb-head-ic"><span className="material-icons-outlined">link</span></span>
          <div className="slb-head-tx">
            <h3>{submission?.companyName ?? bid.supplierName}</h3>
            <p>{L("Off-platform · submitted via your shared link · read-only", "خارج المنصة · مُقدَّم عبر رابطك المشترك · للقراءة فقط")}</p>
          </div>
          <button className="slb-head-x" onClick={onClose} aria-label={L("Close", "إغلاق")}>
            <span className="material-icons-outlined">close</span>
          </button>
        </div>

        <div className="slb-banner">
          <span className="material-icons-outlined">visibility</span>
          {L("Submitted bid — exactly what the supplier submitted", "العرض المُقدَّم — تمامًا كما أرسله المؤجّر")}
        </div>

        <div style={{ maxHeight: "66vh", overflowY: "auto", padding: "14px 16px" }}>
          {!submission ? (
            <p className="py-8 text-center text-[13px] text-slate-500">{L("Submission details aren't available.", "تفاصيل العرض غير متاحة.")}</p>
          ) : (
            <>
              {/* Company details — grid (matches the prototype) */}
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400"><span className="material-icons-outlined" style={{ fontSize: 15 }}>business</span>{L("Company details (captured with the bid)", "بيانات الشركة (مُلتقطة مع العرض)")}</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-xl border border-slate-200 p-3.5">
                {cd(L("Company", "الشركة"), submission.companyName)}
                {cd(L("Contact", "التواصل"), submission.contactInfo)}
                {cd(L("CR number", "رقم السجل التجاري"), submission.crNumber, true)}
                {cd(L("VAT number", "الرقم الضريبي"), submission.vatNumber, true)}
                {cd(L("National address", "العنوان الوطني"), submission.nationalAddress, false, true)}
                {submission.notes ? cd(L("Notes", "ملاحظات"), submission.notes, false, true) : null}
              </div>

              {/* Pricing — per-item table (matches the prototype) */}
              <div className="mb-1.5 mt-4 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400"><span className="material-icons-outlined" style={{ fontSize: 15 }}>request_quote</span>{L("Pricing — per item", "التسعير — لكل صنف")}</div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-[12.5px]">
                  <thead><tr className="bg-slate-50 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
                    <th className="p-2.5 text-start">{L("Item", "الصنف")}</th>
                    <th className="p-2.5 text-end">{L("Rate × qty", "السعر × العدد")}</th>
                    <th className="p-2.5 text-end">{L("Delivery/return", "توصيل/إرجاع")}</th>
                    <th className="p-2.5 text-end">{L("Item total", "إجمالي الصنف")}</th>
                  </tr></thead>
                  <tbody>
                    {submission.items.map((it, i) => {
                      const units = it.numberOfUnits || 1;
                      const rq = (it.rentalRate ?? 0) * units;
                      const dr = ((it.deliveryPrice ?? 0) + (it.returnPrice ?? 0)) * units;
                      const tot = it.total ?? Math.round(((it.rentalRate ?? 0) + (it.deliveryPrice ?? 0) + (it.returnPrice ?? 0)) * units * 1.15);
                      const priced = (it.rentalRate ?? 0) > 0;
                      return (
                        <tr key={it.requestItemId || i} className="border-t border-slate-100">
                          <td className="p-2.5 font-semibold text-slate-800">{it.label || L("Equipment", "المعدة")}{units > 1 ? ` ×${units}` : ""}</td>
                          <td className="p-2.5 text-end font-mono">{priced ? nf(rq) : "—"}</td>
                          <td className="p-2.5 text-end font-mono">{dr ? nf(dr) : "—"}</td>
                          <td className="p-2.5 text-end font-mono font-bold text-slate-800">{priced ? nf(tot) : L("not quoted", "غير مُسعّر")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot><tr className="border-t border-slate-200 bg-slate-50 text-[12.5px] font-bold text-slate-800">
                    <td className="p-2.5" colSpan={3}>{L("Grand total (incl 15% VAT)", "الإجمالي (شامل ١٥٪ ضريبة)")}</td>
                    <td className="p-2.5 text-end font-mono">{sar} {nf(submission.grandTotal ?? 0)}</td>
                  </tr></tfoot>
                </table>
              </div>

              {/* Terms — per-item answers (green = met, red = declined) */}
              {submission.items.map((it, i) => {
                const c = it.confirmations ?? {};
                const shown = TERMS.filter((t) => c[t.key] != null);
                if (!shown.length) return null;
                return (
                  <div key={`t-${it.requestItemId || i}`} className="mt-4">
                    <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">{(it.label || L("Equipment", "المعدة"))} — {L("terms", "الشروط")}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {shown.map((t) => (
                        <span key={t.key} className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold"
                          style={c[t.key] ? { background: "#dcfce7", color: "#16a34a" } : { background: "#ffe4e6", color: "#e11d48" }}>
                          <span className="material-icons-outlined" style={{ fontSize: 12 }}>{c[t.key] ? "check" : "close"}</span>{ar ? t.ar : t.en}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="slb-foot">
          <button className="btn sm" onClick={onClose}>{L("Close", "إغلاق")}</button>
          <span className="slb-foot-sp" />
          {onAddToCompare && (
            <button className="slb-add" onClick={() => { onAddToCompare(); onClose(); }}>
              <span className="material-icons-outlined">balance</span>
              {L("Add to comparison", "أضف للمقارنة")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
