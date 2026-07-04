"use client";

import { useState } from "react";
import type { DealTerm } from "@/lib/contract/deal-room";

type LFn = (en: string, ar: string) => string;
type ResolveFn = (key: string, action: "accept" | "counter" | "reopen", value?: unknown) => void;

/** App parity (term_card.dart): 5 colour-coded states. */
export const STATE_META: Record<string, { en: string; ar: string; cls: string }> = {
  fixed: { en: "Fixed", ar: "ثابت", cls: "st-fixed" },
  agreed: { en: "Agreed", ar: "متفق عليه", cls: "st-agreed" },
  soft_accepted: { en: "Accepted", ar: "مقبول", cls: "st-soft" },
  disputed: { en: "Conflict", ar: "تعارض", cls: "st-disputed" },
  pending: { en: "Pending", ar: "قيد الانتظار", cls: "st-pending" },
};

/** Agreed / accepted terms collapse to a green row. Fixed terms are locked (own group). */
const isAgreedish = (state: string) => state === "agreed" || state === "soft_accepted";

export function valText(v: unknown, L: LFn): string {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.map((x) => String(x)).join(", ") : "—";
  if (typeof v === "boolean") return v ? L("Yes", "نعم") : L("No", "لا");
  const str = String(v);
  if (str === "supplier") return L("Supplier", "المؤجّر");
  if (str === "rentee") return L("Rentee", "المستأجر");
  if (str === "either") return L("Either", "أيّهما");
  if (str === "shared") return L("Shared", "مشترك");
  if (str.toLowerCase() === "true" || str === "included" || str === "yes") return L("Yes", "نعم");
  if (str.toLowerCase() === "false" || str === "excluded" || str === "not_included" || str === "no") return L("No", "لا");
  return str;
}

const isPriceKey = (k: string) => /mob|demob|pricing|rate/i.test(k);
/** Cert-list terms are multi-value (a set of cert codes) — countered as a checkable multi-select. */
const CERT_LIST_KEYS = new Set(["operator_certification", "safety_certifications"]);
const isCertListKey = (k: string) => CERT_LIST_KEYS.has(k);
function isBinary(t: DealTerm): boolean {
  const a = t.supplierDeclared, b = t.renteePreference;
  if (a == null || b == null) return false;
  if (Array.isArray(a) || Array.isArray(b)) return false;
  return (t.options?.length ?? 0) <= 2;
}

/** Inline counter editor — typed by term (price number / option pills / binary toggle / free value). */
function CounterEditor({ term, ar, L, onSubmit, onCancel }: { term: DealTerm; ar: boolean; L: LFn; onSubmit: (v: unknown) => void; onCancel: () => void }) {
  const [val, setVal] = useState<string>("");
  // Multi-select state for cert-list terms — seeded from the renter's current value.
  const [multi, setMulti] = useState<string[]>(() => {
    const cur = term.renteePreference ?? term.value;
    if (Array.isArray(cur)) return cur.map(String);
    if (typeof cur === "string" && cur.trim()) return cur.split(/[,/]/).map((s) => s.trim()).filter(Boolean);
    return [];
  });
  const acts = (disabled: boolean, v: () => unknown) => (
    <div className="tc-counter-acts">
      <button className="tc-btn ghost" type="button" onClick={onCancel}>{L("Cancel", "إلغاء")}</button>
      <button className="tc-btn solid" type="button" disabled={disabled} onClick={() => onSubmit(v())}>{L("Send counter", "إرسال العرض المضاد")}</button>
    </div>
  );
  if (isPriceKey(term.key)) {
    return (
      <div className="tc-counter">
        <div className="tc-counter-in">
          <input type="number" min={0} inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value)} placeholder={L("New amount", "المبلغ الجديد")} />
          <span className="tc-unit">{L("SAR", "ر.س")}</span>
        </div>
        {acts(val === "" || Number.isNaN(Number(val)), () => Number(val))}
      </div>
    );
  }
  // Cert-list terms (operator_certification / safety_certifications): multi-select set of cert codes.
  if (isCertListKey(term.key) && (term.options?.length ?? 0) > 0) {
    const toggle = (v: string) => setMulti((m) => (m.includes(v) ? m.filter((x) => x !== v) : [...m, v]));
    return (
      <div className="tc-counter">
        <div className="tc-pills">
          {term.options.map((o) => <button key={o.value} type="button" className={`tc-pill${multi.includes(o.value) ? " on" : ""}`} onClick={() => toggle(o.value)}>{ar ? o.labelAr : o.labelEn}</button>)}
        </div>
        {acts(false, () => multi)}
      </div>
    );
  }
  if ((term.options?.length ?? 0) > 0) {
    return (
      <div className="tc-counter">
        <div className="tc-pills">
          {term.options.map((o) => <button key={o.value} type="button" className={`tc-pill${val === o.value ? " on" : ""}`} onClick={() => setVal(o.value)}>{ar ? o.labelAr : o.labelEn}</button>)}
        </div>
        {acts(!val, () => val)}
      </div>
    );
  }
  if (isBinary(term)) {
    const opts = [term.renteePreference, term.supplierDeclared].filter((x, i, arr) => x != null && arr.findIndex((y) => String(y) === String(x)) === i);
    return (
      <div className="tc-counter">
        <div className="tc-pills">
          {opts.map((o, i) => <button key={i} type="button" className={`tc-pill${val === String(o) ? " on" : ""}`} onClick={() => setVal(String(o))}>{valText(o, L)}</button>)}
        </div>
        {acts(!val, () => val)}
      </div>
    );
  }
  return (
    <div className="tc-counter">
      <div className="tc-counter-in"><input value={val} onChange={(e) => setVal(e.target.value)} placeholder={L("New value", "قيمة جديدة")} /></div>
      {acts(!val.trim(), () => val.trim())}
    </div>
  );
}

/** The reference value rows (app parity, term_card.dart _ValueRow): Current (bold) → You → Supplier →
 *  Platform default. Only rows with a value are shown. */
function ValueRows({ term, L }: { term: DealTerm; L: LFn }) {
  const row = (label: string, v: unknown, bold = false) =>
    v == null || v === "" ? null : (
      <div className="tcard-vr"><span className="k">{label}</span><b className={bold ? "cur" : undefined}>{valText(v, L)}</b></div>
    );
  return (
    <div className="tcard-vrs">
      {row(L("Current value", "القيمة الحالية"), term.value, true)}
      {row(L("You", "أنت"), term.renteePreference)}
      {row(L("Supplier declared", "ما أقرّه المؤجّر"), term.supplierDeclared)}
      {row(L("Platform default", "الافتراضي"), term.platformDefault)}
    </div>
  );
}

/** One term card. Agreed → collapsed green row (with Reopen). Fixed → locked row. Conflict/pending →
 *  open card with the reference rows + inline resolve (Accept / Keep mine / Counter). */
function TermCard({ term, ar, L, busy, onResolve }: { term: DealTerm; ar: boolean; L: LFn; busy: boolean; onResolve: ResolveFn }) {
  const st = STATE_META[term.state] ?? STATE_META.pending;
  const disputed = term.state === "disputed";
  const fixed = term.state === "fixed";
  const [open, setOpen] = useState(false); // resolved rows can be expanded on demand
  const [countering, setCountering] = useState(false);
  const mandatory = term.isMandatory ? <span className="tcard-state st-mand">{L("Mandatory", "إلزامي")}</span> : null;

  // Fixed → locked row (lock icon + navy "Fixed" badge, no actions — app parity).
  if (fixed) {
    return (
      <div className="tcard tcard-fixed">
        <div className="tcard-resolved-h" style={{ cursor: "default" }}>
          <span className="material-icons-outlined lock-tick">lock</span>
          <span className="tcard-lab">{ar ? term.labelAr : term.label}{term.itemLabel ? <em> · {term.itemLabel}</em> : null}</span>
          <span className="tcard-val">{valText(term.value ?? term.platformDefault, L)}</span>
          <span className={`tcard-state ${st.cls}`}>{ar ? st.ar : st.en}</span>
          {mandatory}
        </div>
      </div>
    );
  }

  // Agreed / accepted → collapsed green row, tap to peek; renter can reopen.
  if (isAgreedish(term.state)) {
    return (
      <div className="tcard tcard-resolved">
        <button type="button" className="tcard-resolved-h" onClick={() => setOpen((o) => !o)}>
          <span className="material-icons-outlined ok-tick">check_circle</span>
          <span className="tcard-lab">{ar ? term.labelAr : term.label}{term.itemLabel ? <em> · {term.itemLabel}</em> : null}</span>
          <span className="tcard-val">{valText(term.value ?? term.supplierDeclared ?? term.renteePreference, L)}</span>
          <span className={`tcard-state ${st.cls}`}>{ar ? st.ar : st.en}</span>
          {mandatory}
        </button>
        {open && (
          <div className="tcard-peek">
            <ValueRows term={term} L={L} />
            <button type="button" className="tcard-reopen" disabled={busy} onClick={() => onResolve(term.key, "reopen")}>{L("Reopen term", "إعادة فتح الشرط")}</button>
          </div>
        )}
      </div>
    );
  }

  // Conflict / pending → open card with the reference rows + actions.
  return (
    <div className={`tcard ${disputed ? "tcard-critical" : "tcard-pending"}`}>
      <div className="tcard-h">
        {disputed && <span className="material-icons-outlined tcard-warn">warning_amber</span>}
        <span className="tcard-lab">{ar ? term.labelAr : term.label}{term.itemLabel ? <em> · {term.itemLabel}</em> : null}</span>
        <span className={`tcard-state ${st.cls}`}>{ar ? st.ar : st.en}</span>
        {mandatory}
      </div>
      <ValueRows term={term} L={L} />
      {countering ? (
        <CounterEditor term={term} ar={ar} L={L} onCancel={() => setCountering(false)} onSubmit={(v) => { setCountering(false); onResolve(term.key, "counter", v); }} />
      ) : (
        <div className="tcard-acts">
          {disputed && <button className="tc-btn ghost" type="button" disabled={busy} onClick={() => onResolve(term.key, "counter", term.renteePreference)}>{L("Keep mine", "الإبقاء على عرضي")}</button>}
          <button className="tc-btn outline" type="button" disabled={busy} onClick={() => setCountering(true)}>{L("Counter", "عرض مضاد")}</button>
          <button className="tc-btn solid" type="button" disabled={busy} onClick={() => onResolve(term.key, "accept")}>{disputed ? L("Accept supplier’s", "قبول عرض المؤجّر") : L("Accept", "قبول")}</button>
        </div>
      )}
    </div>
  );
}

/**
 * Deal-room terms — app parity (term_card.dart + term_grouping.dart). Grouped by actionability with a
 * progress meter: NEEDS YOUR INPUT (conflict/pending) → AGREED (collapsed green, reopenable) → FIXED
 * (locked). Resolve is immediate (per term). One screen, no staging.
 */
export function DealRoomTerms({ terms, ar, L, busy, onResolve }: { terms: DealTerm[]; ar: boolean; L: LFn; busy: boolean; onResolve: ResolveFn }) {
  if (terms.length === 0) return null;
  const needsInput = terms.filter((t) => t.state === "disputed" || t.state === "pending");
  const agreed = terms.filter((t) => isAgreedish(t.state));
  const fixed = terms.filter((t) => t.state === "fixed");
  const resolvedCount = agreed.length + fixed.length;
  const pct = terms.length ? Math.round((resolvedCount / terms.length) * 100) : 0;
  const groups: { label: string; terms: DealTerm[] }[] = [
    { label: L("Needs your input", "تحتاج ردّك"), terms: needsInput },
    { label: L("Agreed", "متفق عليه"), terms: agreed },
    { label: L("Fixed", "ثابتة"), terms: fixed },
  ];
  return (
    <div className="terms-list">
      {/* Progress meter (app parity: "N of M resolved"). */}
      <div className="terms-progress">
        <div className="terms-progress-h">
          <span>{L(`${resolvedCount} of ${terms.length} resolved`, `${resolvedCount} من ${terms.length} تمّت`)}</span>
          {needsInput.length > 0 && <span className="tp-open">{L(`${needsInput.length} to review`, `${needsInput.length} للمراجعة`)}</span>}
        </div>
        <div className="terms-progress-bar"><div style={{ width: `${pct}%` }} /></div>
      </div>
      {groups.filter((g) => g.terms.length > 0).map((g) => (
        <div key={g.label} className="terms-group">
          <div className="terms-group-h">{g.label} <span>{g.terms.length}</span></div>
          {g.terms.map((tm) => <TermCard key={tm.key + (tm.itemLabel ?? "")} term={tm} ar={ar} L={L} busy={busy} onResolve={onResolve} />)}
        </div>
      ))}
    </div>
  );
}
