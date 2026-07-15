"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BidCard } from "@/lib/contract/bids";
import type { BidFormData, BidFormItem, LinkBidSubmission, LinkBidItem } from "@/lib/contract/link-bids";
import { CERT_TERM_KEYS, certCodesFromValue, certConfKey, prettyCert } from "@/lib/contract/link-bids";
import { fetchBidFormData, postSubmissionMessage } from "@/lib/api/client";
import { hasVatInclusiveNote, stripVatInclusiveNote } from "@/lib/contract/vat-inclusive";
import { qualityFromSubmission } from "@/lib/contract/bid-quality";
import { QualityRing } from "@/components/bid/QualityRing";
import { BID_FORM_CSS } from "@/components/bid/bidFormStyles";

/**
 * web-app/006 — read-only viewer of an off-platform bid submitted through the renter's shared link.
 * Renders the SAME layout as the public supplier bid form (`/bid/[token]` — project terms, per-item
 * terms table, pricing table, company details), but filled in with the supplier's submitted answers and
 * fully read-only: Yes/No answers show as static chips, prices as static values. We fetch the request's
 * `BidFormData` for full context (project terms, delivery/return, renter notes) and overlay the
 * submission's answers; if unavailable (request closed) we render from the submission alone.
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
// Attachment type code → readable label (EN/AR) for the read-only viewer chips/thumbnails.
const ATT_LABEL: Record<string, [string, string]> = {
  front_photo: ["Front photo", "صورة أمامية"], serial_photo: ["Serial / plate", "الرقم التسلسلي"], hours_photo: ["Operating hours", "ساعات التشغيل"],
  istimara: ["Istimara", "الاستمارة"], customs_card: ["Customs card", "البطاقة الجمركية"], sales_contract: ["Sales contract", "عقد البيع"], saso_registration: ["SASO registration", "تسجيل ساسو"], combined: ["Several documents (one file)", "عدة مستندات (ملف واحد)"],
  tuv: ["TÜV", "فحص TÜV"], spsp: ["SPSP", "SPSP"], saso: ["SASO", "ساسو"], other: ["Other", "أخرى"],
  operator_tuv: ["Operator TÜV", "فحص TÜV للمشغّل"], operator_spsp: ["Operator SPSP", "SPSP للمشغّل"], operator_saso: ["Operator SASO", "ساسو للمشغّل"], operator_other: ["Operator (other)", "المشغّل (أخرى)"],
  cr: ["Commercial registration", "السجل التجاري"], vat_cert: ["VAT certificate", "شهادة الضريبة"], national_address: ["National address", "العنوان الوطني"], local_content: ["Local content", "المحتوى المحلي"], saso_heavy_equip: ["SASO heavy equipment", "ساسو للمعدات الثقيلة"],
};
// Classify an item's documents back into the same groups the form uploads them under.
const OWNERSHIP_TYPES = new Set(["istimara", "customs_card", "sales_contract", "saso_registration", "combined"]);
// Party-responsibility values read clearer as "On renter" / "On supplier" (matches the supplier form).
const PARTY_CHOICE: Record<string, [string, string]> = { RENTER: ["On renter", "على المستأجر"], RENTEE: ["On renter", "على المستأجر"], SUPPLIER: ["On supplier", "على المؤجّر"], ME: ["On supplier", "على المؤجّر"] };
const renterChoice = (v: string | null | undefined, ar: boolean): string => { const p = PARTY_CHOICE[String(v ?? "").trim().toUpperCase()]; return p ? (ar ? p[1] : p[0]) : String(v ?? ""); };

export function SharedBidSubmissionModal({
  bid,
  submission,
  focusItemId,
  ar,
  L,
  onClose,
  onDownloadQuotation,
}: {
  bid: BidCard;
  submission: LinkBidSubmission | null;
  /** When set, the viewer shows ONLY this request item (opened from a single item's bid card) instead
   *  of every item in the group submission. */
  focusItemId?: string;
  ar: boolean;
  L: (en: string, arr: string) => string;
  onClose: () => void;
  /** Export this submission as the app-parity quotation doc (same template as an on-platform bid). */
  onDownloadQuotation?: () => void;
}) {
  const nf = (n: number) => new Intl.NumberFormat(ar ? "ar-EG" : "en-US").format(Math.round(n));
  const sar = L("SAR", "ر.س");
  const attLabel = (t: string) => { const e = ATT_LABEL[t]; return e ? (ar ? e[1] : e[0]) : t.replace(/_/g, " "); };
  // Read-only chip row for uploaded documents (open in a new tab to view / download).
  const DocChips = ({ docs }: { docs?: { key: string; type: string; filename?: string | null }[] }) => (
    !docs?.length ? null : (
      <div className="ro-chips">
        {docs.map((d, i) => (
          <a key={i} className="ro-chip" href={d.key} target="_blank" rel="noopener noreferrer">
            <span className="material-icons-outlined ic">description</span>
            {attLabel(d.type)}{d.filename ? ` · ${d.filename}` : ""}
            <span className="material-icons-outlined dl">download</span>
          </a>
        ))}
      </div>
    )
  );
  // A company field the supplier gave as text OR a document — render whichever they submitted, in place.
  const coDoc = (type: string) => submission?.companyDocuments?.find((d) => d.type === type);
  const CoField = ({ label, text, docType }: { label: string; text?: string | null; docType: string }) => {
    if (text && text.trim()) return <RoField label={label} value={text} />;
    const doc = coDoc(docType);
    if (!doc) return <RoField label={label} value={null} />;
    return (
      <div className="field" style={{ marginBottom: 12 }}>
        <label>{label}</label>
        <a className="ro-chip" href={doc.key} target="_blank" rel="noopener noreferrer" style={{ marginTop: 2 }}>
          <span className="material-icons-outlined ic">description</span>
          {doc.filename || attLabel(doc.type)}
          <span className="material-icons-outlined dl">download</span>
        </a>
      </div>
    );
  };

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

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "short", year: "numeric" });

  // Match a form item to the supplier's submitted answers (group submissions cover several items;
  // fall back to the sole submitted item when the per-item link is missing — mirrors My Bids).
  const ansFor = (requestItemId: string): LinkBidItem | undefined => {
    if (!submission) return undefined;
    return submission.items.find((i) => i.requestItemId === requestItemId) ?? (submission.items.length === 1 ? submission.items[0] : undefined);
  };

  // Items to render: prefer the live request's items (full context); else synthesize from the submission.
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

  const contractAns = submission?.items[0]?.confirmations ?? {};
  const contractTerms = useMemo(() => {
    if (form && form.contractTerms.length) return form.contractTerms;
    const rt = (submission?.items[0]?.requiredTerms ?? {}) as Record<string, string | null>;
    const labels: Record<string, [string, string]> = { payment: ["Payment type", "نوع الدفع"], overtime: ["Overtime rate", "أجر العمل الإضافي"], breakdownSla: ["Breakdown response", "زمن الاستجابة للأعطال"] };
    return (["payment", "overtime", "breakdownSla"] as const)
      .filter((k) => rt[k])
      .map((k) => ({ key: k, label: L(labels[k][0], labels[k][1]), value: rt[k] as string }));
  }, [form, submission, L]);

  // When opened from a single item's card, show only that item (fall back to all if it doesn't match).
  const focusedItems = focusItemId ? items.filter((it) => it.requestItemId === focusItemId) : items;
  const shownItems = focusedItems.length ? focusedItems : items;
  const singleItem = !!focusItemId && shownItems.length === 1 && items.length > 1;

  const itemSubtotal = (a?: LinkBidItem) => {
    if (!a) return 0;
    const q = a.numberOfUnits || 1;
    return ((a.rentalRate ?? 0) + (a.deliveryPrice ?? 0) + (a.returnPrice ?? 0)) * q;
  };
  const subtotal = (submission?.items ?? []).reduce((s, a) => s + itemSubtotal(a), 0);
  const vat = subtotal * 0.15;
  // Focused on one item → total for THAT item only; otherwise the whole-submission grand total.
  const shownIds = new Set(shownItems.map((it) => it.requestItemId));
  const shownSubtotal = (submission?.items ?? []).filter((a) => shownIds.has(a.requestItemId)).reduce((s, a) => s + itemSubtotal(a), 0);
  const grandIncl = singleItem ? shownSubtotal * 1.15 : (submission?.grandTotal ?? subtotal + vat);
  const quality = submission ? qualityFromSubmission(submission) : null;
  // Supplier's quote expiry ("Valid until") + the renter's bid deadline ("Bids close").
  const validUntil = submission?.validUntil ?? null;
  const vDaysLeft = validUntil ? Math.ceil((new Date(validUntil).getTime() - Date.now()) / 86400000) : null;
  const vExpired = vDaysLeft != null && vDaysLeft < 0;
  const bidsClose = form?.deadline ?? null;

  const projectTerms = form?.projectTerms ?? null;
  const renterNotes = form?.notes ?? null;
  const dir = ar ? "rtl" : "ltr";

  // VAT-inclusive pricing has no backend flag — the form carries it as a "[VAT-INCLUSIVE]" line in the
  // supplier's notes. Detect it (language-agnostic token), show a dedicated note, and strip the token
  // line from the notes we display so it reads cleanly.
  const vatInclusive = hasVatInclusiveNote(submission?.notes);
  const supplierNotes = stripVatInclusiveNote(submission?.notes);

  return (
    <div className="slb-overlay" dir={dir} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="slb-modal" role="dialog" aria-modal="true">
        <style>{BID_FORM_CSS}</style>
        <style>{`@media print{body *{visibility:hidden!important}.slb-modal,.slb-modal *{visibility:visible!important}.slb-overlay{position:static!important;background:#fff!important;padding:0!important;overflow:visible!important}.slb-modal{position:absolute!important;inset-inline-start:0;top:0;width:100%!important;height:auto!important;max-height:none!important;box-shadow:none!important}.qprint{max-height:none!important;overflow:visible!important;background:#fff!important}.qprint-hide,.slb-head-x{display:none!important}}`}</style>
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
          {L("Submitted bid — exactly what the supplier filled in your form", "العرض المُقدَّم — تمامًا كما ملأه المؤجّر في نموذجك")}
        </div>

        <div className="qprint" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {!submission ? (
            <p style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#6b8fa8" }}>{L("Submission details aren't available.", "تفاصيل العرض غير متاحة.")}</p>
          ) : (
            <div className={`bidpage${ar ? " rtl" : ""}`} dir={dir}>
              <div style={{ padding: "18px 18px 40px", maxWidth: 900, margin: "0 auto" }}>

                {/* ── Bid quality — prominent, with the same breakdown the supplier saw while bidding ── */}
                {quality && (
                  <div className="qbanner">
                    <QualityRing quality={quality} L={L} />
                    <div className="qb-tx">
                      <b>{L("Bid quality", "جودة العرض")}</b>
                      <span>{L("How well this bid matches your request and how complete its documents and company details are.", "مدى مطابقة هذا العرض لطلبك ومدى اكتمال مستنداته وبيانات الشركة.")}</span>
                      <div className="qb-parts">
                        {([
                          { icon: "rule", lb: L("Terms match", "مطابقة الشروط"), w: 40, v: quality.parts.terms },
                          { icon: "photo_library", lb: L("Equipment docs", "مستندات المعدة"), w: 30, v: quality.parts.equipment },
                          { icon: "business", lb: L("Company details", "بيانات الشركة"), w: 30, v: quality.parts.company },
                        ] as const).map((p) => {
                          const done = p.v >= 0.999;
                          return (
                            <div className={`qpart${done ? " done" : ""}`} key={p.lb}>
                              <div className="qpart-h">
                                <span className="qpart-lb"><span className="material-icons-outlined">{done ? "check_circle" : p.icon}</span>{p.lb}</span>
                                <span className="qpart-pc">{Math.round(p.v * 100)}%</span>
                              </div>
                              <div className="qpart-track"><i style={{ width: `${Math.round(p.v * 100)}%` }} /></div>
                              <span className="qpart-w">{L("weight", "الوزن")} {p.w}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Meta strip (Quotation / RFQ / Issued / Valid until / Bids close) ── */}
                {(submission.quotationRef || submission.rfqRef || submission.groupRef || submission.createdAt || validUntil || bidsClose) && (
                  <div className="sec" style={{ marginBottom: 14 }}>
                    <div className="ro-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))" }}>
                      {submission.quotationRef && <RoCell k={L("Quotation", "عرض سعر")}><span style={{ fontFamily: "ui-monospace, monospace" }}>{submission.quotationRef}</span></RoCell>}
                      {submission.groupRef && <RoCell k={L("RFQ", "طلب العرض")}><span style={{ fontFamily: "ui-monospace, monospace" }}>{submission.groupRef}</span></RoCell>}
                      {submission.rfqRef && <RoCell k={L("Request", "الطلب")}><span style={{ fontFamily: "ui-monospace, monospace" }}>{submission.rfqRef}</span></RoCell>}
                      {submission.createdAt && <RoCell k={L("Issued", "التاريخ")}>{fmtDate(submission.createdAt)}</RoCell>}
                      {validUntil && <RoCell k={L("Valid until", "صالح حتى")}><span style={{ color: vExpired ? "var(--danger)" : "var(--navy)" }}>{vExpired ? L("Expired", "منتهٍ") : fmtDate(validUntil)}</span></RoCell>}
                      {bidsClose && <RoCell k={L("Bids close", "إغلاق العروض")}>{fmtDate(bidsClose)}</RoCell>}
                    </div>
                  </div>
                )}

                {/* ── Project terms + contract terms (read-only answers) ── */}
                {(projectTerms || contractTerms.length > 0) && (
                  <div className="sec">
                    <div className="sec-h"><span className="material-icons-outlined hdic">tune</span><h3>{L("Project terms", "شروط المشروع")}</h3><span className="ro-tag">{L("From request", "من الطلب")}</span></div>
                    {projectTerms && (
                      <>
                        <div className="ro-grid">
                          {projectTerms.location && <RoCell k={L("Location", "الموقع")}>{projectTerms.lat != null && projectTerms.lng != null ? <a className="maplink" href={`https://www.google.com/maps?q=${projectTerms.lat},${projectTerms.lng}`} target="_blank" rel="noopener noreferrer">{projectTerms.location}<span className="material-icons-outlined">place</span></a> : projectTerms.location}</RoCell>}
                          {projectTerms.rentalBasis && <RoCell k={L("Rental basis", "أساس الإيجار")}>{rentalBasisLabel(projectTerms.rentalBasis, L)}</RoCell>}
                          {projectTerms.startDate && <RoCell k={L("Rental start", "بدء الإيجار")}>{fmtDate(projectTerms.startDate)}</RoCell>}
                          <RoCell k={L("Rental end", "نهاية الإيجار")}>{projectTerms.endDate ? fmtDate(projectTerms.endDate) : L("Open-ended", "بدون نهاية محددة")}</RoCell>
                          {projectTerms.hoursPerDay != null && <RoCell k={L("Hours per day", "ساعات/يوم")}>{projectTerms.hoursPerDay}</RoCell>}
                          {projectTerms.workingDaysPerWeek != null && <RoCell k={L("Working days / week", "أيام العمل/أسبوع")}>{projectTerms.workingDaysPerWeek}</RoCell>}
                        </div>
                        <div className="ro-hint">{L("Only details the renter set are shown.", "تُعرض فقط التفاصيل التي حدّدها المستأجر.")}</div>
                      </>
                    )}
                    {contractTerms.length > 0 && (
                      <>
                        <div className="subhead"><span className="material-icons-outlined">gavel</span>{L("Contract terms — for all items", "شروط العقد — لكل البنود")}</div>
                        <div className="treqgrid">
                          {contractTerms.map((c) => {
                            const ok = contractAns[c.key as keyof typeof contractAns];
                            return (
                              <div key={c.key} className={`treqcell${ok === false ? " declined" : ""}`}>
                                <div className="tc-name">{c.label}</div>
                                <div className="tc-rw"><span className="q">{L("Renter wants", "يطلب المستأجر")}:</span> <i>{c.value}</i></div>
                                <div className="tc-sw"><span className="q">{L("Supplier's answer", "إجابة المؤجّر")}:</span><RoAns ok={ok} L={L} /></div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* ── Renter's notes ── */}
                {renterNotes && (
                  <div className="sec">
                    <div className="sec-h"><span className="material-icons-outlined hdic">sticky_note_2</span><h3>{L("Renter's notes", "ملاحظات المستأجر")}</h3><span className="ro-tag">{L("From request", "من الطلب")}</span></div>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--navy-mid)" }}>{renterNotes}</p>
                  </div>
                )}

                {/* ── Per item — terms table + pricing table (read-only). Focused to one item when opened
                       from that item's bid card; else every item in the group submission. ── */}
                {shownItems.map((it) => {
                  // Real position in the full submission (not the filtered index) so a focused item still
                  // reads e.g. "Item 2 of 3" rather than "Item 1 of 3".
                  const idx = Math.max(0, items.findIndex((x) => x.requestItemId === it.requestItemId));
                  const a = ansFor(it.requestItemId);
                  const terms = TERM_KEYS.filter((k) => it.requiredTerms[k] != null);
                  const label = (ar ? it.labelAr : it.label) || it.label || L("Equipment", "المعدة");
                  const size = (ar ? it.sizeAr : it.size) || it.size || null;
                  const q = (a?.numberOfUnits ?? it.numberOfUnits) || 1;
                  const unit = it.priceUnit ? (ar ? UNIT_LABEL[it.priceUnit]?.[1] : UNIT_LABEL[it.priceUnit]?.[0]) ?? it.priceUnit : L("unit", "وحدة");
                  const rate = a?.rentalRate ?? 0, del = a?.deliveryPrice ?? 0, ret = a?.returnPrice ?? 0;
                  const sub = (rate + del + ret) * q;
                  const conf = a?.confirmations ?? {};
                  return (
                    <div className="sec" key={it.requestItemId || idx}>
                      <div className="item-hd">
                        <span className="material-icons-outlined">construction</span>
                        <div className="inm-wrap"><span className="inm">{label}</span>{size && <span className="imeta">· {size}</span>}
                          <span className={`units-chip${q > 1 ? " multi" : ""}`}><span className="material-icons-outlined">{q > 1 ? "layers" : "package_2"}</span>×{q} {q === 1 ? L("unit", "وحدة") : L("units", "وحدات")}</span></div>
                        <span className="ibadge">{L(`Item ${idx + 1} of ${items.length}`, `البند ${idx + 1} من ${items.length}`)}</span>
                      </div>

                      {(it.deliveryBy || it.returnBy || it.notes) && (
                        <div className="iteminfo">
                          {it.deliveryBy && <span className="ii"><b>{L("Delivery", "النقل إلى الموقع")}:</b> {partyLabel(it.deliveryBy, L)}</span>}
                          {it.returnBy && <span className="ii"><b>{L("Return", "النقل من الموقع")}:</b> {partyLabel(it.returnBy, L)}</span>}
                          {it.notes && <span className="ii note"><span className="material-icons-outlined">sticky_note_2</span>{it.notes}</span>}
                        </div>
                      )}

                      {terms.length > 0 && (
                        <>
                          <div className="subhead"><span className="material-icons-outlined">fact_check</span>{L("Terms — supplier's answers", "الشروط — إجابات المؤجّر")}</div>
                          <div className="treqgrid">
                            {terms.flatMap((k) => {
                              const cc = conf as Record<string, boolean | undefined>;
                              const codes = CERT_TERM_KEYS.has(k) ? certCodesFromValue(it.requiredTerms[k]) : [];
                              // A cert term with 2+ certs shows one card per cert (the supplier may hold TÜV but not SPSP).
                              const rows = codes.length > 1
                                ? codes.map((code) => ({ rk: certConfKey(k, code), ok: cc[certConfKey(k, code)] ?? conf[k], val: prettyCert(code) }))
                                : [{ rk: k, ok: conf[k], val: (k === "operatorCert" || k === "equipmentCert") ? prettyCert(it.requiredTerms[k] ?? "") : renterChoice(it.requiredTerms[k], ar) }];
                              return rows.map((row) => (
                                <div key={row.rk} className={`treqcell${row.ok === true ? " ok" : ""}${row.ok === false ? " declined" : ""}`}>
                                  <div className="tc-main"><div className="tc-name">{L(TERM_LABEL[k][0], TERM_LABEL[k][1])}</div></div>
                                  <div className="tc-rw"><span className="q">{L("Renter's choice", "اختيار المستأجر")}</span> <i>{row.val}</i></div>
                                  <div className="tc-sw"><span className="q">{L("Supplier's choice", "اختيار المؤجّر")}</span><RoAns ok={row.ok} L={L} /></div>
                                </div>
                              ));
                            })}
                          </div>
                        </>
                      )}

                      <div className="subhead"><span className="material-icons-outlined">request_quote</span>{L("Pricing", "التسعير")}</div>
                      <div className="ptbl-wrap"><table className="ptbl">
                        <thead><tr><th>{L("Item", "البند")}</th><th className="num">{L("Unit", "الوحدة")}</th><th className="num">{L("Qty", "العدد")}</th><th className="num">{L("Price", "السعر")}</th><th className="num">{L("Total", "الإجمالي")}</th></tr></thead>
                        <tbody>
                          <tr>
                            <td><div className="it-lbl">{L("Rental", "الإيجار")}</div></td>
                            <td className="num">{unit}</td><td className="num">{q}</td>
                            <td className="num"><span className="ptbl-ro">{rate ? nf(rate) : "—"}</span></td>
                            <td className="num tot">{rate ? nf(rate * q) : "—"}</td>
                          </tr>
                          {del ? (
                            <tr>
                              <td><div className="it-lbl">{L("Delivery to site", "النقل إلى الموقع")}</div><div className="it-sub2">{L("price × qty", "السعر × العدد")}</div></td>
                              <td className="num">{L("Trip", "رحلة")}</td><td className="num">{q}</td>
                              <td className="num"><span className="ptbl-ro">{nf(del)}</span></td>
                              <td className="num tot">{nf(del * q)}</td>
                            </tr>
                          ) : null}
                          {ret ? (
                            <tr>
                              <td><div className="it-lbl">{L("Return from site", "النقل من الموقع")}</div><div className="it-sub2">{L("price × qty", "السعر × العدد")}</div></td>
                              <td className="num">{L("Trip", "رحلة")}</td><td className="num">{q}</td>
                              <td className="num"><span className="ptbl-ro">{nf(ret)}</span></td>
                              <td className="num tot">{nf(ret * q)}</td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table></div>
                      <div className="itot">
                        <span className="r">{L("Subtotal", "المجموع")}<b>{sub ? nf(sub) : "—"} {sar}</b></span>
                        <span className="r">{L("VAT 15%", "ضريبة ١٥٪")}<b>{sub ? nf(sub * 0.15) : "—"} {sar}</b></span>
                        <span className="r t">{L("Item total", "إجمالي البند")}<b>{sub ? nf(sub * 1.15) : "—"} {sar}</b></span>
                      </div>
                      {(() => {
                        const docs = a?.documents ?? [];
                        const ownership = docs.filter((d) => OWNERSHIP_TYPES.has(d.type));
                        const operatorCert = docs.filter((d) => d.type.startsWith("operator_"));
                        const equipCert = docs.filter((d) => !OWNERSHIP_TYPES.has(d.type) && !d.type.startsWith("operator_"));
                        if (!(a?.photos?.length || docs.length)) return null;
                        return (
                          <div className="ro-att">
                            {a?.photos?.length ? (
                              <div className="ro-grp">
                                <div className="ro-att-h">{L("Equipment photos", "صور المعدة")}</div>
                                <div className="ro-thumbs">
                                  {a.photos.map((p, i) => (
                                    <a key={i} className="ro-fig" href={p.key} target="_blank" rel="noopener noreferrer" title={p.filename ?? undefined}>
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={p.key} alt={attLabel(p.type)} />
                                      <span className="ro-fig-lb">{attLabel(p.type)}</span>
                                    </a>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {ownership.length ? <div className="ro-grp"><div className="ro-att-h">{L("Proof of ownership", "إثبات الملكية")}</div><DocChips docs={ownership} /></div> : null}
                            {equipCert.length ? <div className="ro-grp"><div className="ro-att-h">{L("Equipment certificate", "شهادة المعدة")}</div><DocChips docs={equipCert} /></div> : null}
                            {operatorCert.length ? <div className="ro-grp"><div className="ro-att-h">{L("Operator certificate", "شهادة المشغّل")}</div><DocChips docs={operatorCert} /></div> : null}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}

                {/* Supplier priced VAT-inclusive — informational (stored prices are VAT-exclusive). */}
                {vatInclusive && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px", padding: "10px 14px", borderRadius: "var(--r-md)", background: "var(--action-dim)", border: "1px solid rgba(247,144,9,.3)", fontSize: 12.5, fontWeight: 700, color: "var(--navy-mid)" }}>
                    <span className="material-icons-outlined" style={{ fontSize: 18, color: "var(--action)", flexShrink: 0 }}>receipt_long</span>
                    {L("The supplier quoted VAT-inclusive prices. Amounts here are shown net of 15% VAT — the grand total is exactly what they entered.", "قدّم المؤجّر أسعارًا شاملة لضريبة القيمة المضافة. تُعرض المبالغ هنا صافية من ضريبة ١٥٪ — والإجمالي الكلي هو ما أدخله تمامًا.")}
                  </div>
                )}

                {/* ── Total (this item when focused, else the whole submission) ── */}
                <div className="grand"><span className="gk">{singleItem ? L("Item total (incl. VAT)", "إجمالي البند (شامل الضريبة)") : L("Grand total — all items (incl. VAT)", "الإجمالي الكلي — كل البنود (شامل الضريبة)")}</span><span className="gv">{nf(grandIncl)} {sar}</span></div>

                {/* ── Supplier's details (read-only) ── */}
                <div className="sec">
                  <div className="sec-h"><span className="material-icons-outlined hdic">badge</span><h3>{L("Supplier's details", "بيانات المؤجّر")}</h3></div>
                  <RoField label={L("Company name", "اسم الشركة")} value={submission.companyName} />
                  <div className="frow">
                    <CoField label={L("CR number", "رقم السجل التجاري")} text={submission.crNumber} docType="cr" />
                    <CoField label={L("VAT number", "الرقم الضريبي")} text={submission.vatNumber} docType="vat_cert" />
                  </div>
                  <CoField label={L("National address", "العنوان الوطني")} text={submission.nationalAddress} docType="national_address" />
                  <RoField label={L("Contact info", "بيانات التواصل")} value={submission.contactInfo} />
                  {supplierNotes && <RoField label={L("Notes — for the whole quotation", "ملاحظات — لكامل عرض السعر")} value={supplierNotes} multiline />}
                </div>

                {/* ── Other company documents (CR/VAT/Address now render in their fields above) ── */}
                {(() => {
                  const extras = (submission.companyDocuments ?? []).filter((d) => !["cr", "vat_cert", "national_address"].includes(d.type));
                  return extras.length ? (
                    <div className="sec">
                      <div className="sec-h"><span className="material-icons-outlined hdic">folder_open</span><h3>{L("Other company documents", "مستندات أخرى للشركة")}</h3></div>
                      <DocChips docs={extras} />
                    </div>
                  ) : null;
                })()}

                {/* ── Negotiate — pre-conversion relay. The supplier bid off-platform via the shared link and
                       isn't on the app yet, so the renter can't chat live. Messages sent here are stored on the
                       submission and injected into the in-app deal room (as the renter, room opened NEGOTIATING)
                       the moment ops onboard the supplier and convert the bid. ── */}
                <NegotiateThread submission={submission} ar={ar} L={L} />

                <div style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "#9AA7B8", padding: "4px 0 2px" }}>{L("Powered by", "مُشغّل بواسطة")} <b style={{ color: "var(--navy)", fontWeight: 800 }}>Moedatech</b></div>
              </div>
            </div>
          )}
        </div>

        <div className="slb-foot">
          <button className="btn sm" onClick={onClose}>{L("Close", "إغلاق")}</button>
          {submission && (
            onDownloadQuotation
              ? <button className="btn sm qprint-hide" onClick={onDownloadQuotation}>{L("Download quotation", "تنزيل عرض السعر")}</button>
              : <button className="btn sm qprint-hide" onClick={() => window.print()}>{L("Download / Print", "تنزيل / طباعة")}</button>
          )}
          {submission && (
            <button
              className="btn sm primary qprint-hide"
              onClick={() => {
                document.getElementById("slbneg")?.scrollIntoView({ behavior: "smooth", block: "start" });
                setTimeout(() => document.getElementById("slbneg-input")?.focus(), 350);
              }}
            >
              <span className="material-icons-outlined" style={{ fontSize: 17, marginInlineEnd: 5, verticalAlign: -3 }}>forum</span>
              {L("Negotiate", "تفاوض")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Project-terms / meta key-value cell (form's `.ro-cell`). */
function RoCell({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="ro-cell"><div className="k">{k}</div><div className="v">{children}</div></div>;
}

/** Static read-only Yes/No chip — the supplier's confirmation for a term. */
function RoAns({ ok, L }: { ok: boolean | undefined; L: (e: string, a: string) => string }) {
  const base = { display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 7, padding: "5px 11px", fontSize: 11.5, fontWeight: 800 } as const;
  if (ok === true) return <span style={{ ...base, color: "#fff", background: "var(--success)" }}><span className="material-icons-outlined" style={{ fontSize: 14 }}>check</span>{L("Yes", "نعم")}</span>;
  if (ok === false) return <span style={{ ...base, color: "#fff", background: "var(--danger)" }}><span className="material-icons-outlined" style={{ fontSize: 14 }}>close</span>{L("No", "لا")}</span>;
  return <span style={{ ...base, color: "var(--muted)", background: "var(--surface2)" }}>—</span>;
}

/** Read-only company field — label + boxed value (mirrors the form's `.field`, non-editable). */
function RoField({ label, value, multiline }: { label: string; value: string | null | undefined; multiline?: boolean }) {
  return (
    <div className="field" style={{ marginBottom: 12 }}>
      <label>{label}</label>
      <div style={{ minHeight: multiline ? undefined : 42, border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "10px 12px", fontSize: 13.5, fontWeight: 600, color: value ? "var(--navy)" : "var(--muted)", background: "var(--surface2)", whiteSpace: multiline ? "pre-wrap" : undefined, lineHeight: multiline ? 1.6 : undefined }}>{value || "—"}</div>
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

const NEG_CSS = `
.slbneg{border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden;background:var(--surface2);margin:4px 0 14px;scroll-margin-top:12px}
.slbneg-h{display:flex;gap:11px;align-items:flex-start;padding:14px 16px;background:linear-gradient(180deg,var(--action-dim),transparent);border-bottom:1px solid var(--border)}
.slbneg-h .hic{font-size:20px;color:var(--action);background:#fff;width:34px;height:34px;display:grid;place-items:center;border-radius:9px;flex-shrink:0;border:1px solid rgba(247,144,9,.28)}
.slbneg-h b{display:block;font-size:14px;font-weight:800;color:var(--navy)}
.slbneg-h p{margin:3px 0 0;font-size:12px;line-height:1.55;color:var(--navy-mid)}
.slbneg-thread{display:flex;flex-direction:column;gap:9px;padding:16px;max-height:300px;overflow-y:auto;background:#fff}
.slbneg-sys{align-self:center;max-width:92%;text-align:center;font-size:11.5px;font-weight:600;line-height:1.5;color:var(--navy-mid);background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:8px 12px}
.slbneg-sys .material-icons-outlined{font-size:14px;vertical-align:-2px;margin-inline-end:4px;color:var(--action)}
.slbneg-row{display:flex}
.slbneg-row.mine{justify-content:flex-end}
.slbneg-b{max-width:80%;display:flex;flex-direction:column;gap:3px}
.slbneg-msg{padding:9px 13px;font-size:13px;line-height:1.5;border-radius:14px;word-break:break-word;white-space:pre-wrap;background:var(--surface2);color:var(--navy);border:1px solid var(--border)}
.slbneg-row.mine .slbneg-msg{background:var(--navy);color:#fff;border:none;border-end-end-radius:4px}
.slbneg-t{font-size:10.5px;font-weight:600;color:var(--muted);align-self:flex-end;display:inline-flex;align-items:center;gap:3px;padding-inline-end:2px}
.slbneg-t .material-icons-outlined{font-size:12px}
.slbneg-t.pending{color:var(--action)}
.slbneg-t.failed{color:var(--danger)}
.slbneg-empty{text-align:center;padding:18px 8px 10px}
.slbneg-empty .material-icons-outlined{font-size:28px;color:var(--action);opacity:.85}
.slbneg-empty p{margin:7px auto 0;max-width:280px;font-size:12.5px;font-weight:600;line-height:1.5;color:var(--navy-mid)}
.slbneg-composer{display:flex;gap:8px;align-items:flex-end;padding:11px 12px;border-top:1px solid var(--border);background:var(--surface2)}
.slbneg-composer textarea{flex:1;resize:none;border:1px solid var(--border);border-radius:11px;padding:10px 12px;font-size:13px;line-height:1.5;font-family:inherit;color:var(--navy);background:#fff;min-height:42px;max-height:120px;outline:none}
.slbneg-composer textarea:focus{border-color:var(--action);box-shadow:0 0 0 3px var(--action-dim)}
.slbneg-composer textarea:disabled{opacity:.6}
.slbneg-send{flex-shrink:0;width:42px;height:42px;border:none;border-radius:11px;background:var(--action);color:#fff;display:grid;place-items:center;cursor:pointer;transition:opacity .15s,transform .1s}
.slbneg-send:disabled{opacity:.4;cursor:not-allowed}
.slbneg-send:not(:disabled):active{transform:scale(.94)}
.slbneg-send .material-icons-outlined{font-size:20px}
[dir=rtl] .slbneg-send .material-icons-outlined{transform:scaleX(-1)}
.slbneg-err{display:flex;align-items:center;gap:6px;padding:8px 14px;font-size:12px;font-weight:700;color:var(--danger);background:rgba(220,38,38,.06);border-top:1px solid rgba(220,38,38,.18)}
.slbneg-err .material-icons-outlined{font-size:15px}
`;

type NegMsg = { text: string; at: string; pending?: boolean; failed?: boolean };

/**
 * web-app/006 — the renter's pre-conversion negotiate relay on an off-platform shared-link submission.
 * The supplier isn't on the app yet, so there's no live chat: messages the renter sends are stored on
 * the submission (`rentee_messages`) and, when ops onboard the supplier and convert the bid, replayed
 * into the in-app deal room as the renter's messages with the room opened in NEGOTIATING. First message
 * also cues ops (email) to bring the supplier onboard. Shows the renter's own thread — no supplier
 * replies exist until they join and reply in-app.
 */
function NegotiateThread({ submission, ar, L }: { submission: LinkBidSubmission; ar: boolean; L: (e: string, a: string) => string }) {
  const [messages, setMessages] = useState<NegMsg[]>(() => (submission.renteeMessages ?? []).slice());
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset when reopened on a different submission.
  useEffect(() => { setMessages((submission.renteeMessages ?? []).slice()); setText(""); setError(null); }, [submission.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the thread pinned to the newest message.
  useEffect(() => { const el = threadRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages.length]);

  const fmtTime = (iso: string) => {
    try { return new Date(iso).toLocaleString(ar ? "ar-SA" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
    catch { return ""; }
  };

  const grow = (el: HTMLTextAreaElement) => { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 120)}px`; };

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true); setError(null);
    const optimistic: NegMsg = { text: body, at: new Date().toISOString(), pending: true };
    setMessages((m) => [...m, optimistic]);
    setText("");
    if (taRef.current) taRef.current.style.height = "auto";
    try {
      await postSubmissionMessage(submission.requestId, submission.id, body);
      setMessages((m) => m.map((x) => (x === optimistic ? { text: body, at: optimistic.at } : x)));
    } catch (e) {
      setMessages((m) => m.map((x) => (x === optimistic ? { ...x, pending: false, failed: true } : x)));
      setError(e instanceof Error && e.message ? e.message : L("Couldn't send your message. Please try again.", "تعذّر إرسال رسالتك. حاول مرة أخرى."));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="slbneg" id="slbneg">
      <style>{NEG_CSS}</style>
      <div className="slbneg-h">
        <span className="material-icons-outlined hic">forum</span>
        <div>
          <b>{L("Negotiate this bid", "تفاوض على هذا العرض")}</b>
          <p>{L(
            "This bid arrived through your shared link, so the supplier isn't on Moedatech yet. Start the conversation here — we'll invite them to the app and carry your messages over, so you can settle terms and close the deal in-app.",
            "وصل هذا العرض عبر رابطك المشترك، لذا فإن المؤجّر ليس على معداتك بعد. ابدأ المحادثة هنا — سندعوه إلى التطبيق وننقل رسائلك إليه، لتتمكن من الاتفاق على الشروط وإتمام الصفقة داخل التطبيق.",
          )}</p>
        </div>
      </div>

      <div className="slbneg-thread" ref={threadRef}>
        <div className="slbneg-sys">
          <span className="material-icons-outlined">bolt</span>
          {L(
            "Messages you send are saved to this bid and delivered to the supplier's deal room the moment they join the app.",
            "تُحفظ الرسائل التي ترسلها في هذا العرض وتُسلَّم إلى غرفة الصفقة الخاصة بالمؤجّر بمجرد انضمامه إلى التطبيق.",
          )}
        </div>

        {messages.length === 0 ? (
          <div className="slbneg-empty">
            <span className="material-icons-outlined">chat_bubble_outline</span>
            <p>{L("No messages yet — send the first one to open negotiations on this bid.", "لا توجد رسائل بعد — أرسل أول رسالة لبدء التفاوض على هذا العرض.")}</p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div className="slbneg-row mine" key={`${m.at}-${i}`}>
              <div className="slbneg-b">
                <div className="slbneg-msg">{m.text}</div>
                <span className={`slbneg-t${m.pending ? " pending" : ""}${m.failed ? " failed" : ""}`}>
                  {m.pending ? (
                    <>
                      <span className="material-icons-outlined">schedule</span>
                      {L("Sending…", "جارٍ الإرسال…")}
                    </>
                  ) : m.failed ? (
                    <>
                      <span className="material-icons-outlined">error_outline</span>
                      {L("Not sent", "لم تُرسل")}
                    </>
                  ) : (
                    <>
                      <span className="material-icons-outlined">done</span>
                      {fmtTime(m.at)}
                    </>
                  )}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {error && (
        <div className="slbneg-err">
          <span className="material-icons-outlined">error_outline</span>
          {error}
        </div>
      )}

      <div className="slbneg-composer">
        <textarea
          id="slbneg-input"
          ref={taRef}
          value={text}
          disabled={sending}
          placeholder={L("Write a message to the supplier…", "اكتب رسالة إلى المؤجّر…")}
          rows={1}
          onChange={(e) => { setText(e.target.value); grow(e.target); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
        />
        <button
          className="slbneg-send"
          onClick={() => void send()}
          disabled={!text.trim() || sending}
          aria-label={L("Send", "إرسال")}
          title={L("Send", "إرسال")}
        >
          <span className="material-icons-outlined">send</span>
        </button>
      </div>
    </div>
  );
}
