"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { BidCard } from "@/lib/contract/bids";
import type { BidFormData, BidFormItem, LinkBidSubmission, LinkBidItem } from "@/lib/contract/link-bids";
import { fetchBidFormData } from "@/lib/api/client";
import { BID_FORM_CSS } from "@/components/bid/bidFormStyles";

/**
 * web-app/006 — read-only viewer of an off-platform bid submitted through the renter's shared link.
 * Renders the SAME layout the supplier saw on the public bid form (`/bid/[token]`), filled with their
 * submitted answers: per-item term Yes/No, pricing, totals, contract terms + company details. We fetch
 * the request's `BidFormData` for the full request context (project terms, size, delivery/return,
 * renter notes) and overlay the submission's answers; if that's unavailable (e.g. the request closed),
 * we fall back to rendering from the submission alone. No deal room — the supplier has no account.
 */

const TERM_KEYS = ["operator", "nationality", "fatFood", "fatTransport", "fuel", "fuelType", "year", "operatorCert", "equipmentCert"] as const;
type TermKey = (typeof TERM_KEYS)[number];
const TERM_LABEL: Record<TermKey, [string, string]> = {
  operator: ["Operator", "المشغّل"],
  nationality: ["Operator nationality", "جنسية المشغّل"],
  fatFood: ["Food (F.A.T)", "الطعام"],
  fatTransport: ["Accommodation & transport", "السكن والمواصلات"],
  fuel: ["Fuel responsibility", "مسؤولية الوقود"],
  fuelType: ["Fuel type", "نوع الوقود"],
  year: ["Equipment year", "سنة الصنع"],
  operatorCert: ["Operator certificate", "شهادة المشغّل"],
  equipmentCert: ["Equipment certificate", "شهادة المعدة"],
};
const UNIT_LABEL: Record<string, [string, string]> = {
  PER_DAY: ["day", "يوم"], PER_WEEK: ["week", "أسبوع"], PER_MONTH: ["month", "شهر"], PER_JOB: ["job", "مهمة"],
};

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
  const nf = (n: number) => new Intl.NumberFormat(ar ? "ar-EG" : "en-US").format(Math.round(n));
  const sar = L("SAR", "ر.س");

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

  // Full request context (project terms, size, delivery/return, renter notes) — best-effort.
  const [form, setForm] = useState<BidFormData | null>(null);
  useEffect(() => {
    if (!submission?.requestId) return;
    let alive = true;
    fetchBidFormData(submission.requestId).then((d) => alive && setForm(d)).catch(() => {});
    return () => { alive = false; };
  }, [submission?.requestId]);

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(ar ? "ar-SA" : "en-GB", { day: "numeric", month: "short", year: "numeric" });

  // Match a form item to the supplier's submitted answers (group submissions cover several items;
  // fall back to the sole submitted item when the per-item link is missing — mirrors My Bids).
  const ansFor = (requestItemId: string): LinkBidItem | undefined => {
    if (!submission) return undefined;
    return submission.items.find((i) => i.requestItemId === requestItemId) ?? (submission.items.length === 1 ? submission.items[0] : undefined);
  };

  // Items to render: prefer the live request's items (full context); else synthesize from the
  // submission so the viewer still works after the request closes.
  const items: BidFormItem[] = useMemo(() => {
    if (form && form.items.length) return form.items;
    if (!submission) return [];
    return submission.items.map((s) => {
      const rt = (s.requiredTerms ?? {}) as Record<string, string | null>;
      return {
        requestItemId: s.requestItemId,
        label: s.label ?? null,
        labelAr: null,
        size: null,
        sizeAr: null,
        numberOfUnits: s.numberOfUnits ?? 1,
        priceUnit: s.priceUnit ?? null,
        deliveryBy: null,
        returnBy: null,
        notes: null,
        requiredTerms: { operator: rt.operator ?? null, nationality: rt.nationality ?? null, fatFood: rt.fatFood ?? null, fatTransport: rt.fatTransport ?? null, fuel: rt.fuel ?? null, fuelType: rt.fuelType ?? null, year: rt.year ?? null, operatorCert: rt.operatorCert ?? null, equipmentCert: rt.equipmentCert ?? null },
      };
    });
  }, [form, submission]);

  // Contract terms (for-all-items): from the request when available, else synthesized from the
  // submission's per-item required values. Supplier's answer comes from any item's confirmations.
  const contractAns = submission?.items[0]?.confirmations ?? {};
  const contractTerms = useMemo(() => {
    if (form && form.contractTerms.length) return form.contractTerms;
    const rt = (submission?.items[0]?.requiredTerms ?? {}) as Record<string, string | null>;
    const labels: Record<string, [string, string]> = { payment: ["Payment type", "نوع الدفع"], overtime: ["Overtime rate", "أجر العمل الإضافي"], breakdownSla: ["Breakdown response", "زمن الاستجابة للأعطال"] };
    return (["payment", "overtime", "breakdownSla"] as const)
      .filter((k) => rt[k])
      .map((k) => ({ key: k, label: L(labels[k][0], labels[k][1]), value: rt[k] as string }));
  }, [form, submission, L]);

  const itemSubtotal = (a?: LinkBidItem) => {
    if (!a) return 0;
    const q = a.numberOfUnits || 1;
    return ((a.rentalRate ?? 0) + (a.deliveryPrice ?? 0) + (a.returnPrice ?? 0)) * q;
  };
  const subtotal = (submission?.items ?? []).reduce((s, a) => s + itemSubtotal(a), 0);
  const vat = subtotal * 0.15;
  const grandIncl = submission?.grandTotal ?? subtotal + vat;
  // Two distinct dates: the SUPPLIER's own quote expiry ("Valid until" — how long their price holds)
  // and the RENTER's bid deadline ("Bids close" — when the renter stops accepting bids). Show each when set.
  const validUntil = submission?.validUntil ?? null;
  const bidsClose = form?.deadline ?? null;

  const projectTerms = form?.projectTerms ?? null;
  const renterNotes = form?.notes ?? null;
  const dir = ar ? "rtl" : "ltr";

  return (
    <div className="slb-overlay" dir={dir} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="slb-modal" role="dialog" aria-modal="true">
        <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" />
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
          {L("Submitted bid — exactly what the supplier filled in", "العرض المُقدَّم — تمامًا كما ملأه المؤجّر")}
        </div>

        <div style={{ maxHeight: "70vh", overflowY: "auto", padding: "16px" }}>
          {!submission ? (
            <p className="py-8 text-center text-[13px] text-slate-500">{L("Submission details aren't available.", "تفاصيل العرض غير متاحة.")}</p>
          ) : (
            <div className={`bidpage inview qdoc${ar ? " rtl" : ""}`} dir={dir}>
              <style>{BID_FORM_CSS}</style>
              <style>{QUOTE_CSS}</style>
              <div className="wrap">
                {/* App-quotation template: navy header bar + ref pill, orange accent line, navy price hero. */}
                <div className="qbar">
                  <div className="qbar-l">
                    <span className="qbar-title">{L("Quotation", "عرض سعر")}</span>
                    {submission.quotationRef && <span className="qbar-ref">{submission.quotationRef}</span>}
                  </div>
                  <div className="qbar-r">
                    {submission.rfqRef && <div><span>{L("RFQ", "الطلب")}</span><b>{submission.rfqRef}</b></div>}
                    {submission.createdAt && <div><span>{L("Issued", "التاريخ")}</span><b>{fmtDate(submission.createdAt)}</b></div>}
                    {validUntil && <div><span>{L("Valid until", "صالح حتى")}</span><b>{fmtDate(validUntil)}</b></div>}
                    {bidsClose && <div><span>{L("Bids close", "إغلاق العروض")}</span><b>{fmtDate(bidsClose)}</b></div>}
                  </div>
                </div>
                <div className="qaccent" />
                <div className="qhero">
                  <div className="qhero-h">{L("Price breakdown", "تفاصيل السعر")}</div>
                  <div className="qhero-main">
                    <div className="qhero-tot">
                      <span className="qhero-lbl">{L("Grand total · incl. VAT", "الإجمالي · شامل الضريبة")}</span>
                      <span className="qhero-val">{nf(grandIncl)} {sar}</span>
                    </div>
                    <div className="qhero-pills">
                      <span className="qpill">{L("Subtotal", "المجموع")}: {nf(subtotal)}</span>
                      <span className="qpill">{L("VAT 15%", "الضريبة ١٥٪")}: {nf(vat)}</span>
                      <span className="qpill">{items.length} {items.length === 1 ? L("item", "بند") : L("items", "بنود")}</span>
                    </div>
                  </div>
                </div>

                {/* Project terms + contract terms (read-only, from the request) */}
                {(projectTerms || contractTerms.length > 0) && (
                  <div className="sec">
                    <div className="sec-h"><span className="material-icons-outlined hdic">tune</span><h3>{L("Project terms", "شروط المشروع")}</h3><span className="ro-tag">{L("From request", "من الطلب")}</span></div>
                    {projectTerms && (
                      <>
                        <div className="ro-grid">
                          {projectTerms.location && <Cell k={L("Location", "الموقع")}>{projectTerms.lat != null && projectTerms.lng != null ? <a className="maplink" href={`https://www.google.com/maps?q=${projectTerms.lat},${projectTerms.lng}`} target="_blank" rel="noopener noreferrer">{projectTerms.location}<span className="material-icons-outlined">place</span></a> : projectTerms.location}</Cell>}
                          {projectTerms.rentalBasis && <Cell k={L("Rental basis", "أساس الإيجار")}>{rentalBasisLabel(projectTerms.rentalBasis, L)}</Cell>}
                          {projectTerms.startDate && <Cell k={L("Rental start", "بدء الإيجار")}>{fmtDate(projectTerms.startDate)}</Cell>}
                          <Cell k={L("Rental end", "نهاية الإيجار")}>{projectTerms.endDate ? fmtDate(projectTerms.endDate) : L("Open-ended", "بدون نهاية محددة")}</Cell>
                          {projectTerms.hoursPerDay != null && <Cell k={L("Hours per day", "ساعات/يوم")}>{projectTerms.hoursPerDay}</Cell>}
                          {projectTerms.workingDaysPerWeek != null && <Cell k={L("Working days / week", "أيام العمل/أسبوع")}>{projectTerms.workingDaysPerWeek}</Cell>}
                        </div>
                        <div className="ro-hint">{L("Only details the renter set are shown.", "تُعرض فقط التفاصيل التي حدّدها المستأجر.")}</div>
                      </>
                    )}
                    {contractTerms.length > 0 && (
                      <>
                        <div className="subhead"><span className="material-icons-outlined">gavel</span>{L("Contract terms — for all items", "شروط العقد — لكل البنود")}</div>
                        <div className="tpills">
                          {contractTerms.map((c) => {
                            const ans = contractAns[c.key as keyof typeof contractAns];
                            const cls = ans === true ? "yes" : ans === false ? "no" : "na";
                            const icon = ans === true ? "check" : ans === false ? "close" : "remove";
                            return (
                              <span key={c.key} className={`tpill ${cls}`}>
                                <span className="material-icons-outlined">{icon}</span>{c.label}: {c.value}
                              </span>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Parties — supplier (gold) → renter (orange), app-quotation style */}
                <div className="sec qparties">
                  <div className="qp-col">
                    <span className="qp-dot gold" />
                    <div className="qp-lbl">{L("Supplier", "المورّد")}</div>
                    <div className="qp-name">{submission.companyName}</div>
                    <div className="qp-sub">{[submission.crNumber ? `CR ${submission.crNumber}` : null, submission.contactInfo].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                  <div className="qp-col">
                    <span className="qp-dot orange" />
                    <div className="qp-lbl">{L("Renter", "المستأجر")}</div>
                    <div className="qp-name">{form?.renter?.name || L("Renter", "المستأجر")}</div>
                    {form?.renter?.city && <div className="qp-sub">{form.renter.city}</div>}
                  </div>
                </div>

                {/* Renter's notes (read-only) */}
                {renterNotes && (
                  <div className="sec">
                    <div className="sec-h"><span className="material-icons-outlined hdic">sticky_note_2</span><h3>{L("Renter's notes", "ملاحظات المستأجر")}</h3><span className="ro-tag">{L("From request", "من الطلب")}</span></div>
                    <p className="rnote">{renterNotes}</p>
                  </div>
                )}

                {/* Quotation items — formal invoice line-item table (rate/delivery/return are per-unit; amount = ×qty). */}
                {items.length > 0 && (
                  <div className="sec" style={{ padding: 0, overflow: "hidden" }}>
                    <div className="qitbl-wrap">
                      <table className="qitbl">
                        <thead>
                          <tr>
                            <th className="num">#</th>
                            <th>{L("Description", "الوصف")}</th>
                            <th className="num">{L("Unit", "الوحدة")}</th>
                            <th className="num">{L("Qty", "العدد")}</th>
                            <th className="num">{L("Rate", "السعر")}</th>
                            <th className="num">{L("Delivery", "التوصيل")}</th>
                            <th className="num">{L("Return", "الإرجاع")}</th>
                            <th className="num">{L("Amount", "المبلغ")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it, idx) => {
                            const a = ansFor(it.requestItemId);
                            const terms = TERM_KEYS.filter((k) => it.requiredTerms[k] != null);
                            const label = (ar ? it.labelAr : it.label) || it.label || L("Equipment", "المعدة");
                            const size = (ar ? it.sizeAr : it.size) || it.size || null;
                            const q = (a?.numberOfUnits ?? it.numberOfUnits) || 1;
                            const unit = it.priceUnit ? (ar ? UNIT_LABEL[it.priceUnit]?.[1] : UNIT_LABEL[it.priceUnit]?.[0]) ?? it.priceUnit : L("unit", "وحدة");
                            const rate = a?.rentalRate ?? 0, del = a?.deliveryPrice ?? 0, ret = a?.returnPrice ?? 0;
                            const amount = (rate + del + ret) * q;
                            const conf = a?.confirmations ?? {};
                            const ctx = [it.deliveryBy ? `${L("Delivery", "التوصيل")}: ${partyLabel(it.deliveryBy, L)}` : null, it.returnBy ? `${L("Return", "الإرجاع")}: ${partyLabel(it.returnBy, L)}` : null].filter(Boolean).join(" · ");
                            return (
                              <Fragment key={it.requestItemId || idx}>
                                <tr className="r-main">
                                  <td className="num mono">{idx + 1}</td>
                                  <td className="desc"><b>{label}</b>{size && <div className="sz">{size}</div>}{ctx && <div className="sz">{ctx}</div>}</td>
                                  <td className="num">{unit}</td>
                                  <td className="num mono">{q}</td>
                                  <td className="num mono">{rate ? nf(rate) : "—"}</td>
                                  <td className="num mono">{del ? nf(del) : "—"}</td>
                                  <td className="num mono">{ret ? nf(ret) : "—"}</td>
                                  <td className="num mono amt">{amount ? nf(amount) : "—"}</td>
                                </tr>
                                {(terms.length > 0 || it.notes) && (
                                  <tr className="r-terms">
                                    <td></td>
                                    <td colSpan={7}>
                                      {terms.length > 0 && (
                                        <div className="tpills">
                                          {terms.map((k) => {
                                            const ok = conf[k];
                                            const val = (k === "operatorCert" || k === "equipmentCert") ? (it.requiredTerms[k] ?? "").toUpperCase() : it.requiredTerms[k];
                                            return (
                                              <span key={k} className={`tpill ${ok ? "yes" : "no"}`}>
                                                <span className="material-icons-outlined">{ok ? "check" : "close"}</span>{pillText(k, val ?? null, !!ok, L)}
                                              </span>
                                            );
                                          })}
                                        </div>
                                      )}
                                      {it.notes && <div className="qi-note"><span className="material-icons-outlined">sticky_note_2</span>{it.notes}</div>}
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr><td colSpan={7} className="lbl">{L("Subtotal", "المجموع")}</td><td className="num mono">{nf(subtotal)} {sar}</td></tr>
                          <tr><td colSpan={7} className="lbl">{L("VAT 15%", "ضريبة القيمة المضافة ١٥٪")}</td><td className="num mono">{nf(vat)} {sar}</td></tr>
                          <tr className="g"><td colSpan={7} className="lbl">{L("Grand total (incl. VAT)", "الإجمالي (شامل الضريبة)")}</td><td className="val">{nf(grandIncl)} {sar}</td></tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* Supplier's details (read-only) */}
                <div className="sec">
                  <div className="sec-h"><span className="material-icons-outlined hdic">badge</span><h3>{L("Supplier's details", "بيانات المؤجّر")}</h3></div>
                  <RoField label={L("Company name", "اسم الشركة")} value={submission.companyName} />
                  <div className="frow">
                    <RoField label={L("CR number", "رقم السجل التجاري")} value={submission.crNumber} />
                    <RoField label={L("VAT number", "الرقم الضريبي")} value={submission.vatNumber} />
                  </div>
                  <RoField label={L("National address", "العنوان الوطني")} value={submission.nationalAddress} />
                  <RoField label={L("Contact info", "بيانات التواصل")} value={submission.contactInfo} />
                  {submission.notes && (
                    <div className="notes-field"><label>{L("Notes — for the whole quotation", "ملاحظات — لكامل عرض السعر")}</label><p className="notes-ro">{submission.notes}</p></div>
                  )}
                </div>

                <div className="qfoot">{L("Powered by", "مُشغّل بواسطة")} <b>Moedatech</b></div>
              </div>
            </div>
          )}
        </div>

        <div className="slb-foot">
          <button className="btn sm" onClick={onClose}>{L("Close", "إغلاق")}</button>
          {submission && <button className="btn sm qprint-hide" onClick={() => window.print()}>{L("Download / Print", "تنزيل / طباعة")}</button>}
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

function Cell({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="ro-cell"><div className="k">{k}</div><div className="v">{children}</div></div>;
}

/** Read-only company field — same look as the form's input, filled and disabled. */
function RoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input value={value ?? "—"} readOnly />
    </div>
  );
}

function partyLabel(v: string | null | undefined, L: (e: string, a: string) => string) {
  const u = (v ?? "").toLowerCase();
  return u === "renter" || u === "rentee" ? L("Renter", "المستأجر") : u === "supplier" ? L("Supplier", "المؤجّر") : (v ?? "—");
}

function rentalBasisLabel(v: string, L: (e: string, a: string) => string) {
  const m: Record<string, [string, string]> = { DAILY: ["Daily", "يومي"], WEEKLY: ["Weekly", "أسبوعي"], MONTHLY: ["Monthly", "شهري"], PER_JOB: ["Per job", "للمهمة"], LONG_TERM: ["Long term", "طويل الأمد"] };
  const e = m[String(v).toUpperCase()];
  return e ? L(e[0], e[1]) : v;
}

/** Compact pill text for a term: include the requested value on conflicts (so the gap is clear) and on
 *  value-bearing terms (year/cert/nationality/fuel type); just the label for plain met terms. */
function pillText(k: TermKey, reqVal: string | null, ok: boolean, L: (e: string, a: string) => string): string {
  const label = L(TERM_LABEL[k][0], TERM_LABEL[k][1]);
  const withVal = !ok || k === "year" || k === "operatorCert" || k === "equipmentCert" || k === "nationality" || k === "fuelType";
  return withVal && reqVal ? `${label}: ${reqVal}` : label;
}

/** App-quotation template styling (ported from the deal-room PDF: navy header + orange accent + navy
 *  price hero + striped section cards + Supplier/Renter dots) + print isolation. Scoped to .qdoc so it
 *  recolors only the quotation viewer, not the public form. */
const QUOTE_CSS = `
/* Match the PDF palette (cooler grays, ORANGE #E8650A, GOLD #D4A840, SUCCESS #16A34A). */
.bidpage.inview.qdoc{--action:#E8650A;--success:#16A34A;--danger:#D9362A;--muted:#64748B;--navy:#1C3550;--navy-deep:#12263A;--navy-mid:#1C3550;--surface2:#F1F5F9;--line:#E2E8F0;--border:#E2E8F0}
/* Header bar + ref pill */
.qbar{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;background:var(--navy-deep);color:#fff;border-radius:var(--r-lg) var(--r-lg) 0 0;padding:16px 18px}
.qbar-l{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.qbar-title{font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#fff}
.qbar-ref{font-family:"IBM Plex Sans",monospace;font-size:11px;font-weight:700;color:#E2E8F0;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16);border-radius:5px;padding:3px 8px}
.qbar-r{display:flex;flex-wrap:wrap;gap:6px 22px;justify-content:flex-end}
.qbar-r > div{display:flex;flex-direction:column;gap:1px;text-align:end}
.qbar-r span{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#94A3B8}
.qbar-r b{font-size:12px;font-weight:700;color:#fff;font-family:"IBM Plex Sans",monospace}
.qaccent{height:3px;background:var(--action)}
/* Price hero */
.qhero{background:var(--navy);color:#fff;border-radius:0 0 var(--r-md) var(--r-md);padding:16px 18px;margin-bottom:14px}
.qhero-h{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#D4A840;margin-bottom:11px}
.qhero-main{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap}
.qhero-lbl{display:block;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#94A3B8;margin-bottom:3px}
.qhero-val{font-family:"IBM Plex Sans",monospace;font-size:26px;font-weight:800;color:#fff;letter-spacing:-.5px}
.qhero-pills{display:flex;flex-wrap:wrap;gap:6px}
.qpill{font-size:11px;font-weight:700;color:#E2E8F0;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:5px;padding:4px 9px;font-variant-numeric:tabular-nums}
/* Section cards: navy top stripe + navy title */
.qdoc .sec{border-top:3px solid var(--navy)}
.qdoc .sec-h h3{color:var(--navy)}
/* Parties card */
.qdoc .sec.qparties{display:grid;grid-template-columns:1fr 1fr;gap:0;padding:14px 0}
.qparties .qp-col{padding:2px 18px}
.qparties .qp-col:first-child{border-inline-end:1px solid var(--line)}
.qp-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-bottom:7px}
.qp-dot.gold{background:#D4A840}
.qp-dot.orange{background:var(--action)}
.qp-lbl{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:3px}
.qp-name{font-size:14px;font-weight:800;color:#1E293B;line-height:1.2}
.qp-sub{font-size:11.5px;color:var(--muted);margin-top:3px}
/* Footer */
.qfoot{text-align:center;color:var(--muted);font-size:11px;font-weight:600;padding:18px 0 4px;letter-spacing:.02em}
.qfoot b{color:var(--navy);font-weight:800}
@media(max-width:560px){.qdoc .sec.qparties{grid-template-columns:1fr;gap:14px}.qparties .qp-col:first-child{border-inline-end:0;border-bottom:1px solid var(--line);padding-bottom:14px}}
/* Formal invoice line-item table */
.qitbl-wrap{overflow-x:auto}
.qitbl{width:100%;border-collapse:collapse;font-size:13px;min-width:560px}
.qitbl thead th{background:var(--navy);color:#fff;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;padding:11px 12px;text-align:start;white-space:nowrap}
.qitbl thead th.num{text-align:end}
.qitbl .num{text-align:end;font-variant-numeric:tabular-nums}
.qitbl .mono{font-family:"IBM Plex Sans",monospace;font-weight:700}
.qitbl tbody td{padding:12px;vertical-align:top}
.qitbl .r-main td{border-bottom:0;padding-bottom:6px}
.qitbl .r-main .desc b{font-size:13.5px;font-weight:800}
.qitbl .r-main .desc .sz{font-size:11.5px;color:var(--muted);font-weight:600;margin-top:2px}
.qitbl .r-main .amt{font-weight:800}
.qitbl .r-terms td{padding-top:0;padding-bottom:14px;border-bottom:1px solid var(--line)}
.qitbl tbody tr:last-child td{border-bottom:0}
.qi-note{display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--muted);font-style:italic;margin-top:7px}
.qi-note .material-icons-outlined{font-size:14px}
.qitbl tfoot td{padding:9px 12px;font-size:13px}
.qitbl tfoot .lbl{text-align:end;color:var(--muted);font-weight:600}
.qitbl tfoot .num{font-family:"IBM Plex Sans",monospace;font-weight:700;color:var(--navy)}
.qitbl tfoot .g .lbl{color:var(--navy);font-weight:800;font-size:14px}
.qitbl tfoot .g td{border-top:2px solid var(--border)}
.qitbl tfoot .g .val{text-align:end;font-family:"IBM Plex Sans",monospace;font-weight:800;font-size:16px;color:var(--action);white-space:nowrap}
.tpills{display:flex;flex-wrap:wrap;gap:5px}
.tpill{display:inline-flex;align-items:center;gap:3px;border-radius:6px;padding:3px 9px;font-size:11px;font-weight:700}
.tpill .material-icons-outlined{font-size:13px}
.tpill.yes{background:var(--success-bg);color:var(--success)}
.tpill.no{background:var(--danger-bg);color:var(--danger)}
.tpill.na{background:var(--surface2);color:var(--muted);border:1px solid var(--line)}
@media print{
  html,body{height:auto!important;overflow:visible!important;background:#fff!important}
  body *{visibility:hidden!important}
  .qdoc,.qdoc *{visibility:visible!important}
  .qdoc{position:absolute!important;left:0;top:0;width:100%!important}
  .slb-overlay,.slb-modal{position:static!important;max-height:none!important;overflow:visible!important;background:#fff!important;inset:auto!important;padding:0!important;border:0!important;box-shadow:none!important}
  .slb-modal > div{max-height:none!important;overflow:visible!important}
  .qprint-hide{display:none!important}
  .sec,.qhead,.grand{break-inside:avoid}
}
`;
