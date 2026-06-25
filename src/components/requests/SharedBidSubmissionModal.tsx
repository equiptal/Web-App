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
    { key: "fuel", en: "Fuel responsibility", ar: "مسؤولية الوقود" },
    { key: "year", en: "Equipment year", ar: "سنة الصنع" },
    { key: "operatorCert", en: "Operator certificate", ar: "شهادة المشغّل" },
    { key: "equipmentCert", en: "Equipment certificate", ar: "شهادة المعدة" },
  ];

  const row = (label: string, value: string | null | undefined) =>
    value ? (
      <div className="flex items-start justify-between gap-3 py-1.5">
        <span className="text-[12.5px] text-slate-500">{label}</span>
        <span className="text-end text-[13px] font-semibold text-slate-800">{value}</span>
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

        <div style={{ maxHeight: "62vh", overflowY: "auto", padding: "12px 16px" }}>
          {!submission ? (
            <p className="py-8 text-center text-[13px] text-slate-500">{L("Submission details aren't available.", "تفاصيل العرض غير متاحة.")}</p>
          ) : (
            <>
              {/* Company details */}
              <div className="rounded-xl border border-slate-200 p-3.5">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{L("Company", "الشركة")}</p>
                {row(L("Company name", "اسم الشركة"), submission.companyName)}
                {row(L("CR number", "رقم السجل التجاري"), submission.crNumber)}
                {row(L("VAT number", "الرقم الضريبي"), submission.vatNumber)}
                {row(L("National address", "العنوان الوطني"), submission.nationalAddress)}
                {row(L("Contact", "التواصل"), submission.contactInfo)}
                {row(L("Notes", "ملاحظات"), submission.notes)}
              </div>

              {/* Per-item answers */}
              {submission.items.map((it, i) => {
                const units = it.numberOfUnits || 1;
                const total = it.total ?? (it.rentalRate ?? 0) * units + (it.deliveryPrice ?? 0) + (it.returnPrice ?? 0);
                const c = it.confirmations ?? {};
                const shown = TERMS.filter((t) => c[t.key] != null);
                return (
                  <div key={it.requestItemId || i} className="mt-3 rounded-xl border border-slate-200 p-3.5">
                    <p className="mb-1.5 text-[13px] font-bold text-slate-800">{it.label || L("Equipment", "المعدة")}{units > 1 && <span className="ms-1.5 text-[11px] font-semibold text-slate-400">× {units}</span>}</p>
                    {shown.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {shown.map((t) => (
                          <span key={t.key} className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold"
                            style={c[t.key] ? { background: "#dcfce7", color: "#16a34a" } : { background: "#ffe4e6", color: "#e11d48" }}>
                            <span className="material-icons-outlined" style={{ fontSize: 12 }}>{c[t.key] ? "check" : "close"}</span>{ar ? t.ar : t.en}
                          </span>
                        ))}
                      </div>
                    )}
                    {row(`${L("Rental rate", "سعر الإيجار")}${it.priceUnit ? ` (${it.priceUnit})` : ""}`, it.rentalRate != null ? `${sar} ${nf(it.rentalRate)}` : null)}
                    {row(L("Delivery to site", "النقل إلى الموقع"), it.deliveryPrice ? `${sar} ${nf(it.deliveryPrice)}` : null)}
                    {row(L("Return from site", "النقل من الموقع"), it.returnPrice ? `${sar} ${nf(it.returnPrice)}` : null)}
                    <div className="mt-1 flex justify-between border-t border-slate-100 pt-1.5 text-[13px] font-bold text-slate-800"><span>{L("Item total", "إجمالي البند")}</span><span>{sar} {nf(total)}</span></div>
                  </div>
                );
              })}

              {submission.grandTotal != null && (
                <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
                  <span className="text-[12.5px] font-semibold opacity-80">{L("Quoted total", "الإجمالي المُسعّر")}</span>
                  <span className="font-mono text-[16px] font-extrabold">{sar} {nf(submission.grandTotal)}</span>
                </div>
              )}
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
