"use client";

import { useState } from "react";
import { commitBid } from "@/lib/api/client";
import type { NormalizedBid } from "@/lib/contract/agent-bids";
import {
  type BidFormDraft, type DraftStatus, type TermAnswer,
  BID_TERM_LABEL, bidFormDraftToNormalized, draftVatMode,
} from "@/lib/contract/bid-form";
import { BID_FORM_CSS } from "@/components/bid/bidFormStyles";
import { VAT_RATE } from "@/lib/pricing/rental";

/**
 * Renter-verify screen for an uploaded quote (Option A). Renders the quote transformed into OUR bid-form
 * template — the SAME layout/classes as the public shareable form (`/bid/[token]` + BID_FORM_CSS) — but
 * pre-filled with the extracted values and fully editable. Verification is OPTIONAL: the renter can add
 * it with fields still blank/unverified. Submit → `/bids/commit` (VAT-stripped) → onCommitted(bid).
 */
type LFn = (en: string, ar: string) => string;

const UNIT_LABEL: Record<string, [string, string]> = {
  PER_DAY: ["day", "يوم"], PER_WEEK: ["week", "أسبوع"], PER_MONTH: ["month", "شهر"], PER_JOB: ["job", "مهمة"],
};
const PT_LABEL: Record<string, [string, string]> = {
  subtype: ["Type", "النوع"], capacity: ["Size", "المقاس"], location: ["Location", "الموقع"],
  start_date: ["Rental start", "بدء الإيجار"], end_date: ["Rental end", "نهاية الإيجار"],
};
const HINT: Record<DraftStatus, { c: string; en: string; ar: string }> = {
  extracted: { c: "var(--ok)", en: "from quote", ar: "من العرض" },
  assumed: { c: "var(--warn)", en: "assumed", ar: "افتراضي" },
  needs_verification: { c: "var(--info)", en: "to verify", ar: "للتحقّق" },
};
/** Tiny per-field provenance hint — subtle, so it doesn't break the shared-form look. */
function Hint({ status, ar }: { status: DraftStatus; ar: boolean }) {
  const h = HINT[status];
  return <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".02em", color: h.c, marginInlineStart: 6, textTransform: "uppercase" }}>· {ar ? h.ar : h.en}</span>;
}

export function BidVerifyModal({
  draft: initial, extracted, ar, L, onClose, onCommitted,
}: {
  draft: BidFormDraft;
  extracted: NormalizedBid;
  ar: boolean;
  L: LFn;
  onClose: () => void;
  onCommitted: (bid: NormalizedBid) => void;
}) {
  const [draft, setDraft] = useState<BidFormDraft>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const item = draft.items[0];

  // Immutable setters — every edit marks the field extracted (renter confirmed/entered it).
  const setCompany = (key: keyof BidFormDraft["company"], value: string) =>
    setDraft((d) => ({ ...d, company: { ...d.company, [key]: { ...d.company[key], value: value || null, status: "extracted" } } }));
  const setPrice = (key: "rental_price" | "delivery_price" | "return_price", value: string) =>
    setDraft((d) => { const items = [...d.items]; const n = value.trim() ? Number(value) : null; items[0] = { ...items[0], pricing: { ...items[0].pricing, [key]: { ...items[0].pricing[key], value: Number.isFinite(n) ? n : null, status: "extracted" } } }; return { ...d, items }; });
  const setUnits = (value: string) =>
    setDraft((d) => { const items = [...d.items]; const n = value.trim() ? Math.round(Number(value)) : null; items[0] = { ...items[0], units_offered: { ...items[0].units_offered, value: Number.isFinite(n) && (n as number) > 0 ? n : null, status: "extracted" } }; return { ...d, items }; });
  const setVat = (mode: "excl" | "incl") =>
    setDraft((d) => { const items = [...d.items]; items[0] = { ...items[0], pricing: { ...items[0].pricing, vat_mode: { value: mode, status: "extracted" } } }; return { ...d, items }; });
  const setTerm = (idx: number, answer: "yes" | "no") =>
    setDraft((d) => { const items = [...d.items]; const terms = [...items[0].terms]; terms[idx] = { ...terms[idx], answer, status: "extracted" }; items[0] = { ...items[0], terms }; return { ...d, items }; });
  const setContract = (idx: number, answer: "yes" | "no") =>
    setDraft((d) => { const ct = [...d.contract_terms]; ct[idx] = { ...ct[idx], answer, status: "extracted" }; return { ...d, contract_terms: ct }; });
  const setExtra = (idx: number, value: string) =>
    setDraft((d) => { const extras = [...d.extras]; extras[idx] = { ...extras[idx], value, status: "extracted" }; return { ...d, extras }; });

  const allTermsYes = !!item && item.terms.length > 0 && item.terms.every((t) => t.answer === "yes");
  const toggleAllYes = () =>
    setDraft((d) => { const items = [...d.items]; const on = !allTermsYes; items[0] = { ...items[0], terms: items[0].terms.map((t) => ({ ...t, answer: on ? "yes" : null, status: on ? "extracted" : t.status })) }; return { ...d, items }; });

  async function submit() {
    // Verification is OPTIONAL — no hard gate; add with whatever's known.
    setErr(null);
    setSubmitting(true);
    try {
      const corrected = bidFormDraftToNormalized(draft, extracted);
      const r = await commitBid({ source_file: draft.meta.source_file, extracted, corrected, vat_mode: draftVatMode(draft) });
      if (r.agent && r.result?.bid) onCommitted(r.result.bid);
      else setErr(L("Couldn't add the quote — your AI assistant isn't connected. Try again.", "تعذّر إضافة العرض — مساعدك الذكي غير متصل. حاول مجددًا."));
    } catch {
      setErr(L("Couldn't add the quote — please try again.", "تعذّرت الإضافة — حاول مرة أخرى."));
    } finally {
      setSubmitting(false);
    }
  }

  const dir = ar ? "rtl" : "ltr";
  const sar = L("SAR", "ر.س");
  const nf = (n: number) => new Intl.NumberFormat(ar ? "ar-EG" : "en-US").format(Math.round(n));
  const units = item ? (item.units_offered.value || 1) : 1;
  const vatMode = draftVatMode(draft);
  const rental = item ? (item.pricing.rental_price.value ?? 0) : 0;
  const delivery = item ? (item.pricing.delivery_price.value ?? 0) : 0;
  const ret = item ? (item.pricing.return_price.value ?? 0) : 0;
  const grossItem = (rental + delivery + ret) * units;
  const net = vatMode === "incl" ? grossItem / 1.15 : grossItem;
  const itemTotal = net * 1.15;
  const line = (v: number) => (v ? v * units : 0);
  const unit = extracted.price_unit ? (ar ? UNIT_LABEL[extracted.price_unit]?.[1] : UNIT_LABEL[extracted.price_unit]?.[0]) ?? extracted.price_unit : L("unit", "وحدة");

  const termCell = (t: TermAnswer, onPick: (a: "yes" | "no") => void) => {
    const lbl = BID_TERM_LABEL[t.key] ? (ar ? BID_TERM_LABEL[t.key][1] : BID_TERM_LABEL[t.key][0]) : t.label;
    const cls = t.answer === "no" ? " declined" : t.answer == null ? " needpick" : "";
    return (
      <div key={t.key} className={`treqcell${cls}`}>
        <div className="tc-name">{lbl}<Hint status={t.status} ar={ar} /></div>
        {t.renter_wants && <div className="tc-rw"><span className="q">{L("Renter wants", "يطلب المستأجر")}:</span> <i>{t.renter_wants}</i></div>}
        <div className="tc-sw"><span className="q">{L("Your answer", "إجابتك")}:</span>
          <span className="miniseg">
            <button type="button" className={`ok${t.answer === "yes" ? " on" : ""}`} onClick={() => onPick("yes")}><span className="material-icons-outlined">check</span>{L("Yes", "نعم")}</button>
            <button type="button" className={`no${t.answer === "no" ? " on" : ""}`} onClick={() => onPick("no")}>{L("No", "لا")}</button>
          </span>
        </div>
      </div>
    );
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "color-mix(in srgb, var(--info-deep) 50%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(960px, 96vw)", maxHeight: "94vh", display: "flex", flexDirection: "column", background: "var(--surface)", borderRadius: 16, overflow: "hidden", }}>
        {/* Header (renter-side chrome, not the public renter-identity bar) */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--surface3)", flex: "0 0 auto" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: "var(--navy)" }}>{L("Verify the uploaded quote", "تحقّق من العرض المرفوع")}</h3>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--muted)" }}>{L("We transformed the quote into your bid form — confirm, edit, or leave blank, then add it.", "حوّلنا العرض إلى نموذج عرضك — أكّد أو عدّل أو اترك فارغًا ثم أضِفه.")}</p>
          </div>
          <button onClick={onClose} aria-label={L("Close", "إغلاق")} style={{ width: 34, height: 34, borderRadius: 9, border: "none", background: "var(--surface2)", color: "var(--muted)", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>

        {/* Body — the bid form, styled with BID_FORM_CSS */}
        <div style={{ flex: 1, overflowY: "auto", background: "var(--surface2)" }}>
          <div className={`bidpage${ar ? " rtl" : ""}`} dir={dir} style={{ minHeight: 0, background: "transparent" }}>
            <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" />
            <style>{BID_FORM_CSS}</style>
            <div className="wrap" style={{ maxWidth: "none", padding: "18px 20px 24px" }}>

              {/* §1 Project terms — from the request (read-only) */}
              {draft.project_terms && Object.keys(draft.project_terms).length > 0 && (
                <div className="sec">
                  <div className="sec-h"><span className="material-icons-outlined hdic">tune</span><h3>{L("Project terms", "شروط المشروع")}</h3><span className="ro-tag">{L("From request", "من الطلب")}</span></div>
                  <div className="ro-grid">
                    {Object.entries(draft.project_terms).map(([k, v]) => (
                      <div key={k} className="ro-cell"><div className="k">{PT_LABEL[k] ? (ar ? PT_LABEL[k][1] : PT_LABEL[k][0]) : k}</div><div className="v">{v}</div></div>
                    ))}
                  </div>
                  <div className="ro-hint">{L("Only details from your request are shown here.", "تُعرض هنا فقط تفاصيل طلبك.")}</div>
                </div>
              )}

              {/* §2 Contract terms (for all items) — usually empty for a transformed quote */}
              {draft.contract_terms.length > 0 && (
                <div className="sec">
                  <div className="sec-h"><span className="material-icons-outlined hdic">gavel</span><h3>{L("Contract terms", "شروط العقد")}</h3></div>
                  <div className="treqgrid">{draft.contract_terms.map((t, i) => termCell(t, (a) => setContract(i, a)))}</div>
                </div>
              )}

              {/* §3 Renter's notes (read-only) */}
              {draft.renter_notes && (
                <div className="sec">
                  <div className="sec-h"><span className="material-icons-outlined hdic">sticky_note_2</span><h3>{L("Renter's notes", "ملاحظات المستأجر")}</h3></div>
                  <p className="rnote">{draft.renter_notes}</p>
                </div>
              )}

              {/* §4 The item — terms + pricing */}
              {item && (
                <div className="sec">
                  <div className="item-hd">
                    <span className="material-icons-outlined">construction</span>
                    <div className="inm-wrap"><span className="inm">{item.label || L("Equipment", "المعدة")}</span>{item.size && <span className="imeta">· {item.size}</span>}
                      <span className={`units-chip${units > 1 ? " multi" : ""}`}><span className="material-icons-outlined">{units > 1 ? "layers" : "package_2"}</span>×{units} {units === 1 ? L("unit", "وحدة") : L("units", "وحدات")}</span></div>
                  </div>

                  {(item.delivery_by || item.return_by || item.item_notes) && (
                    <div className="iteminfo">
                      {item.delivery_by && <span className="ii"><b>{L("Delivery", "النقل إلى الموقع")}:</b> {item.delivery_by}</span>}
                      {item.return_by && <span className="ii"><b>{L("Return", "النقل من الموقع")}:</b> {item.return_by}</span>}
                      {item.item_notes && <span className="ii note"><span className="material-icons-outlined">sticky_note_2</span>{item.item_notes}</span>}
                    </div>
                  )}

                  {/* Terms */}
                  {item.terms.length > 0 && (
                    <>
                      <div className="subhead"><span className="material-icons-outlined">fact_check</span>{L("Terms — does the quote meet each?", "الشروط — هل يلبّي العرض كلًّا منها؟")}
                        <button type="button" className={`yall${allTermsYes ? " on" : ""}`} onClick={toggleAllYes}><span className="yall-sw"></span>{L("Yes to all", "نعم للكل")}</button>
                      </div>
                      <div className="treqgrid">{item.terms.map((t, i) => termCell(t, (a) => setTerm(i, a)))}</div>
                    </>
                  )}

                  {/* Units */}
                  <div className="subhead"><span className="material-icons-outlined">tag</span>{L("Units offered", "الوحدات المعروضة")}<Hint status={item.units_offered.status} ar={ar} /></div>
                  <input className="ptbl-in" style={{ width: 120, textAlign: "start" }} type="number" min={1} inputMode="numeric" value={item.units_offered.value ?? ""} onChange={(e) => setUnits(e.target.value)} />

                  {/* Pricing */}
                  <div className="subhead"><span className="material-icons-outlined">request_quote</span>{L("Pricing", "التسعير")}
                    <span style={{ marginInlineStart: "auto", display: "inline-flex", border: "1px solid var(--border)", borderRadius: 7, overflow: "hidden", textTransform: "none", letterSpacing: 0 }}>
                      {([["excl", L("Excl. VAT", "قبل الضريبة")], ["incl", L("Incl. VAT", "شامل الضريبة")]] as ["excl" | "incl", string][]).map(([v, lab]) => (
                        <button key={v} type="button" onClick={() => setVat(v)} style={{ border: "none", cursor: "pointer", font: "inherit", textTransform: "none", letterSpacing: 0, fontWeight: 800, fontSize: 10.5, padding: "3px 9px", background: vatMode === v ? "var(--navy)" : "var(--surface)", color: vatMode === v ? "var(--surface)" : "var(--muted)" }}>{lab}</button>
                      ))}
                    </span>
                  </div>
                  <table className="ptbl">
                    <thead><tr><th>{L("Item", "البند")}</th><th className="num">{L("Unit", "الوحدة")}</th><th className="num">{L("Qty", "العدد")}</th><th className="num">{vatMode === "incl" ? L("Price (incl. VAT)", "السعر (شامل)") : L("Price", "السعر")}</th><th className="num">{L("Total", "الإجمالي")}</th></tr></thead>
                    <tbody>
                      <tr>
                        <td><div className="it-lbl">{L("Rental", "الإيجار")}</div></td>
                        <td className="num">{unit}</td><td className="num">{units}</td>
                        <td className="num"><input className="ptbl-in" inputMode="numeric" value={item.pricing.rental_price.value ?? ""} onChange={(e) => setPrice("rental_price", e.target.value)} placeholder="0" /></td>
                        <td className="num tot">{rental ? nf(line(rental)) : "—"}</td>
                      </tr>
                      <tr>
                        <td><div className="it-lbl">{L("Delivery to site", "النقل إلى الموقع")}</div><div className="it-sub2">{L("if the supplier delivers", "إن كان النقل على المؤجّر")}</div></td>
                        <td className="num">{L("Trip", "رحلة")}</td><td className="num">{units}</td>
                        <td className="num"><input className="ptbl-in" inputMode="numeric" value={item.pricing.delivery_price.value ?? ""} onChange={(e) => setPrice("delivery_price", e.target.value)} placeholder="0" /></td>
                        <td className="num tot">{delivery ? nf(line(delivery)) : "—"}</td>
                      </tr>
                      <tr>
                        <td><div className="it-lbl">{L("Return from site", "النقل من الموقع")}</div><div className="it-sub2">{L("if the supplier returns it", "إن كان الإرجاع على المؤجّر")}</div></td>
                        <td className="num">{L("Trip", "رحلة")}</td><td className="num">{units}</td>
                        <td className="num"><input className="ptbl-in" inputMode="numeric" value={item.pricing.return_price.value ?? ""} onChange={(e) => setPrice("return_price", e.target.value)} placeholder="0" /></td>
                        <td className="num tot">{ret ? nf(line(ret)) : "—"}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="itot">
                    <span className="r">{vatMode === "incl" ? L("Net (before VAT)", "الصافي (قبل الضريبة)") : L("Subtotal", "المجموع")}<b>{net ? nf(net) : "—"} {sar}</b></span>
                    <span className="r">{L("VAT 15%", "ضريبة ١٥٪")}<b>{net ? nf(net * VAT_RATE) : "—"} {sar}</b></span>
                    <span className="r t">{L("Item total", "إجمالي البند")}<b>{net ? nf(itemTotal) : "—"} {sar}</b></span>
                  </div>
                </div>
              )}

              {/* Grand total */}
              <div className="grand"><span className="gk">{L("Grand total (incl. VAT)", "الإجمالي الكلي (شامل الضريبة)")}</span><span className="gv">{net ? nf(itemTotal) : "—"} {sar}</span></div>

              {/* §5 Supplier details */}
              <div className="sec">
                <div className="sec-h"><span className="material-icons-outlined hdic">badge</span><h3>{L("Supplier details", "بيانات المؤجّر")}</h3></div>
                <div className="field">
                  <label>{L("Company name", "اسم الشركة")}<span className="reqx"> *</span><Hint status={draft.company.company_name.status} ar={ar} /></label>
                  <input value={draft.company.company_name.value ?? ""} onChange={(e) => setCompany("company_name", e.target.value)} placeholder={L("e.g. Gulf Heavy Equipment Co.", "مثال: شركة الخليج للمعدات")} />
                </div>
                <div className="frow">
                  <div className="field"><label>{L("CR number", "رقم السجل التجاري")}<span className="reqx"> *</span><Hint status={draft.company.cr_number.status} ar={ar} /></label><input inputMode="numeric" value={draft.company.cr_number.value ?? ""} onChange={(e) => setCompany("cr_number", e.target.value)} /></div>
                  <div className="field"><label>{L("VAT number", "الرقم الضريبي")}<span className="reqx"> *</span><Hint status={draft.company.vat_number.status} ar={ar} /></label><input inputMode="numeric" value={draft.company.vat_number.value ?? ""} onChange={(e) => setCompany("vat_number", e.target.value)} /></div>
                </div>
                <div className="field"><label>{L("National address", "العنوان الوطني")}<span className="reqx"> *</span><Hint status={draft.company.national_address.status} ar={ar} /></label><input value={draft.company.national_address.value ?? ""} onChange={(e) => setCompany("national_address", e.target.value)} /></div>
                <div className="field"><label>{L("Contact info", "بيانات التواصل")}<span className="reqx"> *</span><Hint status={draft.company.contact.status} ar={ar} /></label><input value={draft.company.contact.value ?? ""} onChange={(e) => setCompany("contact", e.target.value)} placeholder={L("Phone or email", "هاتف أو بريد")} /></div>
                <div className="field"><label>{L("Quote valid until", "صلاحية العرض حتى")}<Hint status={draft.company.valid_until.status} ar={ar} /></label><input type="date" value={draft.company.valid_until.value ?? ""} onChange={(e) => setCompany("valid_until", e.target.value)} /></div>
                <div className="notes-field"><label>{L("Notes", "ملاحظات")}</label><textarea value={draft.company.notes.value ?? ""} onChange={(e) => setCompany("notes", e.target.value)} /></div>
              </div>

              {/* §6 Additional notes & terms — non-canonical clauses the agent pulled from the quote. */}
              {draft.extras.length > 0 && (
                <div className="sec">
                  <div className="sec-h"><span className="material-icons-outlined hdic">notes</span><h3>{L("Additional notes & terms", "ملاحظات وشروط إضافية")}</h3><span className="ro-tag">{L("From quote", "من العرض")}</span></div>
                  {draft.extras.map((e, i) => (
                    <div className="field" key={i}>
                      <label>{e.label}<Hint status={e.status} ar={ar} /></label>
                      <input value={e.value} onChange={(ev) => setExtra(i, ev.target.value)} />
                    </div>
                  ))}
                  <div className="ro-hint">{L("Anything from the quote that doesn't fit a field above — edit or clear it. These show in the comparison's Notes row.", "أي شيء من العرض لا يناسب حقلًا أعلاه — عدّله أو امسحه. تظهر في صف الملاحظات بالمقارنة.")}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px 16px", borderTop: "1px solid var(--surface3)", flex: "0 0 auto" }}>
          <p style={{ margin: "0 0 8px", fontSize: 11.5, color: "var(--muted)" }}>{L("Anything unknown is left for you to fill — or leave it blank and add it now.", "كل ما هو غير معروف متروك لك لتعبئته — أو اتركه فارغًا وأضِفه الآن.")}</p>
          {err && <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "var(--danger)" }}>{err}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ flex: "0 0 auto", padding: "12px 18px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--navy)", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>{L("Cancel", "إلغاء")}</button>
            <button onClick={submit} disabled={submitting} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "13px", borderRadius: 10, border: "none", background: "var(--brand)", color: "var(--surface)", fontWeight: 800, fontSize: 15, cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.7 : 1, fontFamily: "inherit" }}>
              <span className="material-icons-outlined" style={{ fontSize: 18 }}>{submitting ? "hourglass_top" : "add"}</span>{submitting ? L("Adding…", "جارٍ الإضافة…") : L("Add to comparison", "أضِف للمقارنة")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
