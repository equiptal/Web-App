"use client";

import { useState, type ReactNode } from "react";
import { commitBid } from "@/lib/api/client";
import type { NormalizedBid } from "@/lib/contract/agent-bids";
import {
  type BidFormDraft, type DraftStatus, type TermAnswer,
  BID_TERM_LABEL, bidFormDraftToNormalized, isBidFormDraftValid, draftVatMode,
} from "@/lib/contract/bid-form";

/**
 * Renter-verify screen for an uploaded quote (Option A). Renders the `BidFormDraft` built by
 * `bidQuoteToFormDraft`, colours every field by `status` (extracted=green · assumed=amber ·
 * needs_verification=red), lets the renter edit each one, and — once the form's own validation passes —
 * commits it via `/bids/commit`, handing the returned comparison bid back to the caller.
 */
type LFn = (en: string, ar: string) => string;

const STATUS_META: Record<DraftStatus, { c: string; bg: string; en: string; ar: string }> = {
  extracted: { c: "#1daf58", bg: "#e7f7ee", en: "From quote", ar: "من العرض" },
  assumed: { c: "#d4780a", bg: "#fff3e0", en: "Assumed — confirm", ar: "افتراضي — أكّد" },
  needs_verification: { c: "#d9362a", bg: "#fdecea", en: "Verify", ar: "تحقّق" },
};

function StatusChip({ status, ar }: { status: DraftStatus; ar: boolean }) {
  const m = STATUS_META[status];
  return <span style={{ fontSize: 10.5, fontWeight: 800, color: m.c, background: m.bg, borderRadius: 100, padding: "2px 8px", whiteSpace: "nowrap" }}>{ar ? m.ar : m.en}</span>;
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
  const [showErrors, setShowErrors] = useState(false);

  const item = draft.items[0];
  const valid = isBidFormDraftValid(draft);

  // Immutable setters — every edit clears the field's needs-verification status (renter confirmed it).
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

  async function submit() {
    setShowErrors(true);
    setErr(null);
    if (!valid) return;
    setSubmitting(true);
    try {
      const corrected = bidFormDraftToNormalized(draft, extracted);
      const r = await commitBid({ source_file: draft.meta.source_file, extracted, corrected, vat_mode: draftVatMode(draft) });
      if (r.agent && r.result?.bid) {
        onCommitted(r.result.bid);
      } else {
        setErr(L("Couldn't add the quote — your AI assistant isn't connected. Try again.", "تعذّر إضافة العرض — مساعدك الذكي غير متصل. حاول مجددًا."));
      }
    } catch {
      setErr(L("Couldn't add the quote — please try again.", "تعذّرت الإضافة — حاول مجددًا."));
    } finally {
      setSubmitting(false);
    }
  }

  const C = { navy: "#1c3550", muted: "#6b8fa8", border: "#e4edf5", surface: "#f7fafd" };
  const label = item ? (item.size ? `${item.label} · ${item.size}` : item.label) : "";
  const inCls = (bad: boolean) => ({ width: "100%", padding: "9px 11px", borderRadius: 9, border: `1.5px solid ${bad ? "#d9362a" : C.border}`, fontSize: 13.5, fontFamily: "inherit", outline: "none", background: "#fff", color: C.navy });
  const missing = (v: unknown) => showErrors && (v == null || String(v).trim() === "");

  return (
    <div dir={ar ? "rtl" : "ltr"} onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(16,38,63,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 640, maxHeight: "92vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 18, overflow: "hidden", boxShadow: "0 24px 60px rgba(16,38,63,.35)" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 20px 14px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: C.navy }}>{L("Verify the uploaded quote", "تحقّق من العرض المرفوع")}</h3>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, color: C.muted }}>{L("Confirm or fix each field — red needs your input — then add it to the comparison.", "أكّد أو صحّح كل حقل — الأحمر يحتاج إدخالك — ثم أضِفه للمقارنة.")}</p>
          </div>
          <button onClick={onClose} aria-label={L("Close", "إغلاق")} style={{ width: 34, height: 34, borderRadius: 9, border: "none", background: C.surface, color: C.muted, cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>

        <div style={{ overflowY: "auto", padding: "16px 20px 8px" }}>
          {/* §1 project terms (read-only) */}
          {draft.project_terms && Object.keys(draft.project_terms).length > 0 && (
            <section style={{ marginBottom: 18 }}>
              <SecH>{L("Project terms — from your request", "شروط المشروع — من طلبك")}</SecH>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {Object.entries(draft.project_terms).map(([k, v]) => (
                  <div key={k} style={{ background: C.surface, borderRadius: 8, padding: "7px 10px" }}>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: C.muted }}>{k}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{v}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* §4 item — terms + pricing */}
          {item && (
            <section style={{ marginBottom: 18 }}>
              <SecH>{L("Equipment & pricing", "المعدة والتسعير")}</SecH>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.navy, marginBottom: 10 }}>{label}</div>

              {/* Terms */}
              {item.terms.length > 0 && (
                <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                  {item.terms.map((t, i) => (
                    <TermRow key={t.key} t={t} ar={ar} L={L} bad={showErrors && t.answer == null} onPick={(a) => setTerm(i, a)} />
                  ))}
                </div>
              )}

              {/* Units + VAT mode */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
                <Field label={L("Units offered", "الوحدات المعروضة")} status={item.units_offered.status} ar={ar}>
                  <input type="number" min={1} inputMode="numeric" value={item.units_offered.value ?? ""} onChange={(e) => setUnits(e.target.value)} style={{ ...inCls(false), width: 110 }} />
                </Field>
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: C.navy, marginBottom: 5 }}>{L("Prices are", "الأسعار")} <StatusChip status={item.pricing.vat_mode.status} ar={ar} /></div>
                  <div style={{ display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                    {([["excl", L("Excl. VAT", "قبل الضريبة")], ["incl", L("Incl. VAT", "شامل الضريبة")]] as ["excl" | "incl", string][]).map(([v, lab]) => (
                      <button key={v} type="button" onClick={() => setVat(v)} style={{ border: "none", cursor: "pointer", font: "inherit", fontWeight: 800, fontSize: 11.5, padding: "7px 12px", background: draftVatMode(draft) === v ? C.navy : "#fff", color: draftVatMode(draft) === v ? "#fff" : C.muted }}>{lab}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div style={{ display: "grid", gap: 10 }}>
                <Field label={L("Rental price", "سعر الإيجار")} status={item.pricing.rental_price.status} ar={ar} req>
                  <input inputMode="numeric" value={item.pricing.rental_price.value ?? ""} onChange={(e) => setPrice("rental_price", e.target.value)} placeholder="0" style={inCls(showErrors && !(item.pricing.rental_price.value! > 0))} />
                </Field>
                <Field label={L("Delivery price", "سعر النقل")} status={item.pricing.delivery_price.status} ar={ar}>
                  <input inputMode="numeric" value={item.pricing.delivery_price.value ?? ""} onChange={(e) => setPrice("delivery_price", e.target.value)} placeholder="0" style={inCls(false)} />
                </Field>
                <Field label={L("Return price", "سعر الإرجاع")} status={item.pricing.return_price.status} ar={ar}>
                  <input inputMode="numeric" value={item.pricing.return_price.value ?? ""} onChange={(e) => setPrice("return_price", e.target.value)} placeholder="0" style={inCls(false)} />
                </Field>
              </div>
            </section>
          )}

          {/* §5 company */}
          <section style={{ marginBottom: 8 }}>
            <SecH>{L("Supplier details", "بيانات المؤجّر")}</SecH>
            <div style={{ display: "grid", gap: 10 }}>
              <Field label={L("Company name", "اسم الشركة")} status={draft.company.company_name.status} ar={ar} req>
                <input value={draft.company.company_name.value ?? ""} onChange={(e) => setCompany("company_name", e.target.value)} style={inCls(missing(draft.company.company_name.value))} />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label={L("CR number", "رقم السجل التجاري")} status={draft.company.cr_number.status} ar={ar} req>
                  <input inputMode="numeric" value={draft.company.cr_number.value ?? ""} onChange={(e) => setCompany("cr_number", e.target.value)} style={inCls(missing(draft.company.cr_number.value))} />
                </Field>
                <Field label={L("VAT number", "الرقم الضريبي")} status={draft.company.vat_number.status} ar={ar} req>
                  <input inputMode="numeric" value={draft.company.vat_number.value ?? ""} onChange={(e) => setCompany("vat_number", e.target.value)} style={inCls(missing(draft.company.vat_number.value))} />
                </Field>
              </div>
              <Field label={L("National address", "العنوان الوطني")} status={draft.company.national_address.status} ar={ar} req>
                <input value={draft.company.national_address.value ?? ""} onChange={(e) => setCompany("national_address", e.target.value)} style={inCls(missing(draft.company.national_address.value))} />
              </Field>
              <Field label={L("Contact info", "بيانات التواصل")} status={draft.company.contact.status} ar={ar} req>
                <input value={draft.company.contact.value ?? ""} onChange={(e) => setCompany("contact", e.target.value)} style={inCls(missing(draft.company.contact.value))} />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label={L("Quote valid until", "صلاحية العرض حتى")} status={draft.company.valid_until.status} ar={ar}>
                  <input type="date" value={draft.company.valid_until.value ?? ""} onChange={(e) => setCompany("valid_until", e.target.value)} style={inCls(false)} />
                </Field>
                <Field label={L("Notes", "ملاحظات")} status={draft.company.notes.status} ar={ar}>
                  <input value={draft.company.notes.value ?? ""} onChange={(e) => setCompany("notes", e.target.value)} style={inCls(false)} />
                </Field>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px 16px", borderTop: `1px solid ${C.border}` }}>
          {showErrors && !valid && <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "#d9362a" }}>{L("Answer every term, enter a rental price, and fill all supplier details.", "أجب عن كل شرط، وأدخل سعر الإيجار، واملأ جميع بيانات المؤجّر.")}</p>}
          {err && <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "#d9362a" }}>{err}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ flex: "0 0 auto", padding: "11px 18px", borderRadius: 11, border: `1px solid ${C.border}`, background: "#fff", color: C.navy, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>{L("Cancel", "إلغاء")}</button>
            <button onClick={submit} disabled={submitting} style={{ flex: 1, padding: "11px", borderRadius: 11, border: "none", background: "#1c3550", color: "#fff", fontWeight: 800, fontSize: 14, cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.7 : 1, fontFamily: "inherit" }}>
              {submitting ? L("Adding…", "جارٍ الإضافة…") : L("Add to comparison", "أضِف للمقارنة")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SecH({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", color: "#6b8fa8", marginBottom: 9 }}>{children}</div>;
}

function Field({ label, status, ar, req, children }: { label: string; status: DraftStatus; ar: boolean; req?: boolean; children: ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: "#1c3550" }}>{label}{req && <span style={{ color: "#d9362a" }}> *</span>}</span>
        <StatusChip status={status} ar={ar} />
      </div>
      {children}
    </label>
  );
}

function TermRow({ t, ar, L, bad, onPick }: { t: TermAnswer; ar: boolean; L: LFn; bad: boolean; onPick: (a: "yes" | "no") => void }) {
  const lbl = BID_TERM_LABEL[t.key] ? (ar ? BID_TERM_LABEL[t.key][1] : BID_TERM_LABEL[t.key][0]) : t.label;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 9, border: `1.5px solid ${bad ? "#d9362a" : "#e4edf5"}`, background: "#fff" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#1c3550" }}>{lbl}</div>
        {t.renter_wants && <div style={{ fontSize: 11.5, color: "#6b8fa8" }}>{L("Renter wants", "يطلب المستأجر")}: <b>{t.renter_wants}</b></div>}
      </div>
      <StatusChip status={t.status} ar={ar} />
      <span style={{ display: "inline-flex", border: "1px solid #e4edf5", borderRadius: 8, overflow: "hidden" }}>
        {([["yes", L("Yes", "نعم")], ["no", L("No", "لا")]] as ["yes" | "no", string][]).map(([v, lab]) => (
          <button key={v} type="button" onClick={() => onPick(v)} style={{ border: "none", cursor: "pointer", font: "inherit", fontWeight: 800, fontSize: 12, padding: "6px 12px", background: t.answer === v ? (v === "yes" ? "#1daf58" : "#d9362a") : "#fff", color: t.answer === v ? "#fff" : "#6b8fa8" }}>{lab}</button>
        ))}
      </span>
    </div>
  );
}
