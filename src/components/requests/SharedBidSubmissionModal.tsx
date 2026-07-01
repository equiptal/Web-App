"use client";

import { useEffect, useMemo, useState } from "react";
import type { BidCard } from "@/lib/contract/bids";
import type { BidFormData, BidFormItem, LinkBidSubmission, LinkBidItem } from "@/lib/contract/link-bids";
import { fetchBidFormData } from "@/lib/api/client";
import { BID_FORM_CSS } from "@/components/bid/bidFormStyles";

/**
 * web-app/006 — read-only viewer of an off-platform bid submitted through the renter's shared link.
 * Redesigned to the app-card visual language (rounded section cards + icon headers + term/price rows,
 * matching the My-Bids bid card & comparison) instead of the old quotation-PDF look. We fetch the
 * request's `BidFormData` for full context (project terms, delivery/return, renter notes) and overlay
 * the submission's answers; if unavailable (request closed), we render from the submission alone.
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

// App palette (matches the bid card / comparison).
const C = { navy: "#1c3550", navyMid: "#2a4f72", muted: "#6b8fa8", border: "#d4e0ec", line: "#eff2f6", surface: "#f7fafc", orange: "#f79009", orangeBg: "#fff4e5", green: "#1daf58", greenBg: "#e7f7ee", danger: "#d9362a", dangerBg: "#fcebea", blue: "#1a7ec8", blueBg: "#e6f2fb", gold: "#d4a840" };
const card = { background: "#fff", border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" } as const;

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

  const itemSubtotal = (a?: LinkBidItem) => {
    if (!a) return 0;
    const q = a.numberOfUnits || 1;
    return ((a.rentalRate ?? 0) + (a.deliveryPrice ?? 0) + (a.returnPrice ?? 0)) * q;
  };
  const subtotal = (submission?.items ?? []).reduce((s, a) => s + itemSubtotal(a), 0);
  const vat = subtotal * 0.15;
  const grandIncl = submission?.grandTotal ?? subtotal + vat;
  // Supplier's quote expiry ("Valid until") + the renter's bid deadline ("Bids close").
  const validUntil = submission?.validUntil ?? null;
  const vDaysLeft = validUntil ? Math.ceil((new Date(validUntil).getTime() - Date.now()) / 86400000) : null;
  const vExpired = vDaysLeft != null && vDaysLeft < 0;
  const vSoon = vDaysLeft != null && vDaysLeft >= 0 && vDaysLeft <= 3;
  const vTone = vExpired ? { c: C.danger, bg: C.dangerBg } : vSoon ? { c: "#d4780a", bg: C.orangeBg } : { c: C.blue, bg: C.blueBg };
  const bidsClose = form?.deadline ?? null;

  const projectTerms = form?.projectTerms ?? null;
  const renterNotes = form?.notes ?? null;
  const dir = ar ? "rtl" : "ltr";

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
          {L("Submitted bid — exactly what the supplier filled in", "العرض المُقدَّم — تمامًا كما ملأه المؤجّر")}
        </div>

        <div className="qprint" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16, background: C.surface }}>
          {!submission ? (
            <p style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: C.muted }}>{L("Submission details aren't available.", "تفاصيل العرض غير متاحة.")}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }} dir={dir}>

              {/* ── Summary: meta strip + navy price hero ── */}
              <div style={card}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 22px", padding: "12px 16px", borderBottom: `1px solid ${C.line}` }}>
                  {submission.quotationRef && <Meta k={L("Quotation", "عرض سعر")} v={submission.quotationRef} mono />}
                  {submission.rfqRef && <Meta k={L("RFQ", "الطلب")} v={submission.rfqRef} mono />}
                  {submission.createdAt && <Meta k={L("Issued", "التاريخ")} v={fmtDate(submission.createdAt)} />}
                  {validUntil && <Meta k={L("Valid until", "صالح حتى")} v={vExpired ? L("Expired", "منتهٍ") : fmtDate(validUntil)} tone={vTone} />}
                  {bidsClose && <Meta k={L("Bids close", "إغلاق العروض")} v={fmtDate(bidsClose)} />}
                </div>
                <div style={{ padding: 18, background: `linear-gradient(135deg,${C.navy},#12263a)`, color: "#fff" }}>
                  <div style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 800, color: C.gold, marginBottom: 11 }}>{L("Price breakdown", "تفاصيل السعر")}</div>
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".05em", color: "#94A3B8", fontWeight: 800, marginBottom: 3 }}>{L("Grand total · incl. VAT", "الإجمالي · شامل الضريبة")}</div>
                      <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-.5px", fontVariantNumeric: "tabular-nums" }}>{nf(grandIncl)} {sar}</div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <HeroPill>{L("Subtotal", "المجموع")}: {nf(subtotal)}</HeroPill>
                      <HeroPill>{L("VAT 15%", "الضريبة ١٥٪")}: {nf(vat)}</HeroPill>
                      <HeroPill>{items.length} {items.length === 1 ? L("item", "بند") : L("items", "بنود")}</HeroPill>
                      {validUntil && <HeroPill danger={vExpired} warn={vSoon}>{vExpired ? L("⏱ Expired", "⏱ منتهٍ") : `⏱ ${fmtDate(validUntil)}`}</HeroPill>}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Project + contract terms ── */}
              {(projectTerms || contractTerms.length > 0) && (
                <div style={card}>
                  <CardHead icon="tune" title={L("Project terms", "شروط المشروع")} tag={L("From request", "من الطلب")} />
                  <div style={{ padding: 16 }}>
                    {projectTerms && (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
                          {projectTerms.location && <KV k={L("Location", "الموقع")}>{projectTerms.lat != null && projectTerms.lng != null ? <a href={`https://www.google.com/maps?q=${projectTerms.lat},${projectTerms.lng}`} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}>{projectTerms.location}<span className="material-icons-outlined" style={{ fontSize: 14 }}>place</span></a> : projectTerms.location}</KV>}
                          {projectTerms.rentalBasis && <KV k={L("Rental basis", "أساس الإيجار")}>{rentalBasisLabel(projectTerms.rentalBasis, L)}</KV>}
                          {projectTerms.startDate && <KV k={L("Rental start", "بدء الإيجار")}>{fmtDate(projectTerms.startDate)}</KV>}
                          <KV k={L("Rental end", "نهاية الإيجار")}>{projectTerms.endDate ? fmtDate(projectTerms.endDate) : L("Open-ended", "بدون نهاية محددة")}</KV>
                          {projectTerms.hoursPerDay != null && <KV k={L("Hours per day", "ساعات/يوم")}>{projectTerms.hoursPerDay}</KV>}
                          {projectTerms.workingDaysPerWeek != null && <KV k={L("Working days / week", "أيام العمل/أسبوع")}>{projectTerms.workingDaysPerWeek}</KV>}
                        </div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>{L("Only details the renter set are shown.", "تُعرض فقط التفاصيل التي حدّدها المستأجر.")}</div>
                      </>
                    )}
                    {contractTerms.length > 0 && (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "14px 0 9px", fontSize: 12, fontWeight: 800, color: C.navyMid }}><span className="material-icons-outlined" style={{ fontSize: 16 }}>gavel</span>{L("Contract terms — for all items", "شروط العقد — لكل البنود")}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {contractTerms.map((c) => {
                            const ans = contractAns[c.key as keyof typeof contractAns];
                            const yes = ans === true, no = ans === false;
                            const tone = yes ? { c: C.green, bg: C.greenBg } : no ? { c: C.danger, bg: C.dangerBg } : { c: C.muted, bg: C.surface };
                            return <TermChip key={c.key} tone={tone} icon={yes ? "check" : no ? "close" : "remove"}>{c.label}: {c.value}</TermChip>;
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ── Parties ── */}
              <div style={card}>
                <CardHead icon="groups" title={L("Parties", "الأطراف")} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
                  <PartyCol dot={C.gold} label={L("Supplier", "المورّد")} name={submission.companyName} sub={[submission.crNumber ? `CR ${submission.crNumber}` : null, submission.contactInfo].filter(Boolean).join(" · ") || "—"} />
                  <PartyCol dot={C.orange} label={L("Renter", "المستأجر")} name={form?.renter?.name || L("Renter", "المستأجر")} sub={form?.renter?.city ?? null} startBorder />
                </div>
              </div>

              {/* ── Renter's notes ── */}
              {renterNotes && (
                <div style={card}>
                  <CardHead icon="sticky_note_2" title={L("Renter's notes", "ملاحظات المستأجر")} tag={L("From request", "من الطلب")} />
                  <p style={{ margin: 0, padding: 16, fontSize: 13, lineHeight: 1.6, color: C.navyMid }}>{renterNotes}</p>
                </div>
              )}

              {/* ── Quoted items — per-item rows (rate/delivery/return are per-unit; amount = ×qty) ── */}
              {items.length > 0 && (
                <div style={card}>
                  <CardHead icon="inventory_2" title={L("Quoted items", "البنود المُسعّرة")} />
                  <div>
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
                        <div key={it.requestItemId || idx} style={{ padding: 16, borderBottom: idx < items.length - 1 ? `1px solid ${C.line}` : "none" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                            <div style={{ minWidth: 0 }}>
                              <b style={{ fontSize: 14, fontWeight: 800, color: C.navy }}>{label}</b>
                              {size && <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 600, marginTop: 2 }}>{size}</div>}
                              {ctx && <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 600, marginTop: 2 }}>{ctx}</div>}
                            </div>
                            <div style={{ textAlign: "end", flexShrink: 0 }}>
                              <div style={{ fontSize: 15, fontWeight: 900, color: C.orange, fontVariantNumeric: "tabular-nums" }}>{amount ? nf(amount) : "—"} <span style={{ fontSize: 11, color: C.muted }}>{sar}</span></div>
                              <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginTop: 1 }}>{q} × {unit}</div>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 9 }}>
                            <MiniStat k={L("Rate", "السعر")} v={rate ? nf(rate) : "—"} />
                            {del ? <MiniStat k={L("Delivery", "التوصيل")} v={nf(del)} /> : null}
                            {ret ? <MiniStat k={L("Return", "الإرجاع")} v={nf(ret)} /> : null}
                          </div>
                          {terms.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                              {terms.map((k) => {
                                const ok = conf[k];
                                const val = (k === "operatorCert" || k === "equipmentCert") ? (it.requiredTerms[k] ?? "").toUpperCase() : it.requiredTerms[k];
                                const tone = ok ? { c: C.green, bg: C.greenBg } : { c: C.danger, bg: C.dangerBg };
                                return <TermChip key={k} tone={tone} icon={ok ? "check" : "close"}>{pillText(k, val ?? null, !!ok, L)}</TermChip>;
                              })}
                            </div>
                          )}
                          {it.notes && (
                            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, fontSize: 11.5, color: C.muted, fontStyle: "italic" }}>
                              <span className="material-icons-outlined" style={{ fontSize: 14 }}>sticky_note_2</span>{it.notes}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.line}`, background: C.surface }}>
                    <TotalRow k={L("Subtotal", "المجموع")}>{nf(subtotal)} {sar}</TotalRow>
                    <TotalRow k={L("VAT 15%", "ضريبة القيمة المضافة ١٥٪")}>{nf(vat)} {sar}</TotalRow>
                    <TotalRow k={L("Grand total (incl. VAT)", "الإجمالي (شامل الضريبة)")} grand>{nf(grandIncl)} {sar}</TotalRow>
                  </div>
                </div>
              )}

              {/* ── Supplier's details ── */}
              <div style={card}>
                <CardHead icon="badge" title={L("Supplier's details", "بيانات المؤجّر")} />
                <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                  <Field label={L("Company name", "اسم الشركة")} value={submission.companyName} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <Field label={L("CR number", "رقم السجل التجاري")} value={submission.crNumber} />
                    <Field label={L("VAT number", "الرقم الضريبي")} value={submission.vatNumber} />
                  </div>
                  <Field label={L("National address", "العنوان الوطني")} value={submission.nationalAddress} />
                  <Field label={L("Contact info", "بيانات التواصل")} value={submission.contactInfo} />
                  {submission.notes && (
                    <div>
                      <div style={{ fontSize: 11.5, fontWeight: 800, color: C.muted, marginBottom: 4 }}>{L("Notes — for the whole quotation", "ملاحظات — لكامل عرض السعر")}</div>
                      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.navyMid, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px" }}>{submission.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "#9AA7B8", padding: "4px 0 2px", letterSpacing: ".02em" }}>{L("Powered by", "مُشغّل بواسطة")} <b style={{ color: C.navy, fontWeight: 800 }}>Moedatech</b></div>
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

/** Section card header: icon tile + title + optional "From request" tag. */
function CardHead({ icon, title, tag }: { icon: string; title: string; tag?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.line}` }}>
      <span style={{ width: 32, height: 32, borderRadius: 9, background: C.surface, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span className="material-icons-outlined" style={{ fontSize: 18, color: C.navy }}>{icon}</span></span>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: C.navy }}>{title}</h3>
      {tag && <span style={{ marginInlineStart: "auto", fontSize: 10.5, fontWeight: 800, color: C.blue, background: C.blueBg, padding: "3px 9px", borderRadius: 20 }}>{tag}</span>}
    </div>
  );
}

/** Top meta item (Quotation / RFQ / Issued / Valid until / Bids close). */
function Meta({ k, v, mono, tone }: { k: string; v: string; mono?: boolean; tone?: { c: string; bg: string } }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", color: C.muted }}>{k}</span>
      {tone
        ? <span style={{ fontSize: 12, fontWeight: 800, color: tone.c, background: tone.bg, padding: "1px 8px", borderRadius: 6, alignSelf: "flex-start" }}>{v}</span>
        : <b style={{ fontSize: 12.5, fontWeight: 700, color: C.navy, fontFamily: mono ? "ui-monospace, monospace" : undefined }}>{v}</b>}
    </div>
  );
}

/** Navy price-hero pill. */
function HeroPill({ children, danger, warn }: { children: React.ReactNode; danger?: boolean; warn?: boolean }) {
  const style = danger
    ? { background: "rgba(217,54,42,.22)", borderColor: "rgba(255,150,140,.5)", color: "#FFD9D4" }
    : warn
    ? { background: "rgba(212,120,10,.28)", borderColor: "rgba(247,190,120,.5)", color: "#FFE3BE" }
    : { background: "rgba(255,255,255,.08)", borderColor: "rgba(255,255,255,.14)", color: "#E2E8F0" };
  return <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "4px 9px", border: `1px solid ${style.borderColor}`, background: style.background, color: style.color, fontVariantNumeric: "tabular-nums" }}>{children}</span>;
}

/** Project-terms key/value. */
function KV({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".03em", color: C.muted, marginBottom: 3 }}>{k}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{children}</div>
    </div>
  );
}

function TermChip({ children, tone, icon }: { children: React.ReactNode; tone: { c: string; bg: string }; icon: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 7, padding: "4px 9px", fontSize: 11, fontWeight: 700, color: tone.c, background: tone.bg }}><span className="material-icons-outlined" style={{ fontSize: 13 }}>{icon}</span>{children}</span>;
}

function PartyCol({ dot, label, name, sub, startBorder }: { dot: string; label: string; name: string; sub: string | null; startBorder?: boolean }) {
  return (
    <div style={{ padding: "14px 16px", borderInlineStart: startBorder ? `1px solid ${C.line}` : undefined }}>
      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: dot, marginBottom: 7 }} />
      <div style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", color: C.muted, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: C.navy, lineHeight: 1.2 }}>{name}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function MiniStat({ k, v }: { k: string; v: string }) {
  return <span style={{ fontSize: 12, color: C.navyMid, fontWeight: 600 }}>{k}: <b style={{ color: C.navy, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{v}</b></span>;
}

function TotalRow({ k, children, grand }: { k: string; children: React.ReactNode; grand?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: grand ? "9px 0 2px" : "5px 0", marginTop: grand ? 4 : 0, borderTop: grand ? `2px solid ${C.border}` : "none" }}>
      <span style={{ fontSize: grand ? 13.5 : 12.5, fontWeight: grand ? 800 : 600, color: grand ? C.navy : C.muted }}>{k}</span>
      <span style={{ fontSize: grand ? 16 : 13, fontWeight: grand ? 900 : 700, color: grand ? C.orange : C.navy, fontVariantNumeric: "tabular-nums" }}>{children}</span>
    </div>
  );
}

/** Read-only supplier field — label + boxed value. */
function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: C.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: value ? C.navy : C.muted, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px" }}>{value || "—"}</div>
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

/** Compact pill text for a term: include the requested value on conflicts + value-bearing terms. */
function pillText(k: TermKey, reqVal: string | null, ok: boolean, L: (e: string, a: string) => string): string {
  const label = L(TERM_LABEL[k][0], TERM_LABEL[k][1]);
  const withVal = !ok || k === "year" || k === "operatorCert" || k === "equipmentCert" || k === "nationality" || k === "fuelType";
  return withVal && reqVal ? `${label}: ${reqVal}` : label;
}
