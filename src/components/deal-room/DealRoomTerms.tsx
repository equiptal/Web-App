"use client";

import { useState } from "react";
import type { DealTerm } from "@/lib/contract/deal-room";

type LFn = (en: string, ar: string) => string;

/** A locally-collected resolution for one term (app parity: nothing is sent until Counter/Accept). */
export type TermResolution = { action: "accept" | "counter"; value?: unknown };
export type ResolutionsMap = Record<string, TermResolution>;

type ResolveLocalFn = (key: string, action: "accept" | "counter", value?: unknown) => void;
type ReopenLocalFn = (key: string) => void;

/** App parity (term_card.dart): 5 colour-coded states. */
export const STATE_META: Record<string, { en: string; ar: string; cls: string }> = {
  fixed: { en: "Fixed", ar: "ثابت", cls: "st-fixed" },
  agreed: { en: "Agreed", ar: "متفق عليه", cls: "st-agreed" },
  soft_accepted: { en: "Accepted", ar: "مقبول", cls: "st-soft" },
  disputed: { en: "Conflict", ar: "تعارض", cls: "st-disputed" },
  pending: { en: "Pending", ar: "قيد الانتظار", cls: "st-pending" },
};

/** Agreed / accepted terms (server-side) collapse to a green row. Fixed terms are locked (own group). */
const isAgreedish = (state: string) => state === "agreed" || state === "soft_accepted";
const isNeedsInput = (state: string) => state === "disputed" || state === "pending";

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
  const [multi, setMulti] = useState<string[]>(() => {
    const cur = term.renteePreference ?? term.value;
    if (Array.isArray(cur)) return cur.map(String);
    if (typeof cur === "string" && cur.trim()) return cur.split(/[,/]/).map((s) => s.trim()).filter(Boolean);
    return [];
  });
  const acts = (disabled: boolean, v: () => unknown) => (
    <div className="tc-counter-acts">
      <button className="tc-btn ghost" type="button" onClick={onCancel}>{L("Cancel", "إلغاء")}</button>
      <button className="tc-btn solid" type="button" disabled={disabled} onClick={() => onSubmit(v())}>{L("Set counter", "تعيين العرض المضاد")}</button>
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

/** The reference value rows (app parity, term_card.dart _ValueRow). Only rows with a value are shown. */
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

/**
 * One term card. Server-agreed/fixed render read-only. A needs-input term is either OPEN (accept /
 * keep-mine / counter → collected LOCALLY, no server call) or, once the renter has chosen, a collapsed
 * "you'll…" row with Undo. Nothing is sent until Counter/Accept (app parity — batched submit).
 */
function TermCard({ term, ar, L, busy, readOnly, resolution, onResolveLocal, onReopenLocal }: {
  term: DealTerm; ar: boolean; L: LFn; busy: boolean; readOnly: boolean;
  resolution?: TermResolution; onResolveLocal: ResolveLocalFn; onReopenLocal: ReopenLocalFn;
}) {
  const st = STATE_META[term.state] ?? STATE_META.pending;
  const disputed = term.state === "disputed";
  const fixed = term.state === "fixed";
  const [open, setOpen] = useState(false);
  const [countering, setCountering] = useState(false);
  const mandatory = term.isMandatory ? <span className="tcard-state st-mand">{L("Mandatory", "إلزامي")}</span> : null;
  const label = <span className="tcard-lab">{ar ? term.labelAr : term.label}{term.itemLabel ? <em> · {term.itemLabel}</em> : null}</span>;

  // Fixed → locked row (lock icon + navy "Fixed" badge, no actions — app parity).
  if (fixed) {
    return (
      <div className="tcard tcard-fixed">
        <div className="tcard-resolved-h" style={{ cursor: "default" }}>
          <span className="material-icons-outlined lock-tick">lock</span>
          {label}
          <span className="tcard-val">{valText(term.value ?? term.platformDefault, L)}</span>
          <span className={`tcard-state ${st.cls}`}>{ar ? st.ar : st.en}</span>
          {mandatory}
        </div>
      </div>
    );
  }

  // Server-agreed / accepted → collapsed green row, tap to peek. Read-only (settled server-side; the
  // app never reopens a term server-side).
  if (isAgreedish(term.state)) {
    return (
      <div className="tcard tcard-resolved">
        <button type="button" className="tcard-resolved-h" onClick={() => setOpen((o) => !o)}>
          <span className="material-icons-outlined ok-tick">check_circle</span>
          {label}
          <span className="tcard-val">{valText(term.value ?? term.supplierDeclared ?? term.renteePreference, L)}</span>
          <span className={`tcard-state ${st.cls}`}>{ar ? st.ar : st.en}</span>
          {mandatory}
        </button>
        {open && <div className="tcard-peek"><ValueRows term={term} L={L} /></div>}
      </div>
    );
  }

  // Needs-input term the renter has resolved LOCALLY → collapsed "you'll…" row + Undo (drops the local
  // resolution; no server call). Submitted only on Counter/Accept.
  if (resolution) {
    const chosen = resolution.action === "accept"
      ? L("You'll accept", "ستقبل")
      : L("You'll counter", "ستقترح");
    const chosenVal = resolution.action === "accept"
      ? valText(term.supplierDeclared ?? term.value, L)
      : valText(resolution.value, L);
    return (
      <div className="tcard tcard-resolved">
        <div className="tcard-resolved-h" style={{ cursor: "default" }}>
          <span className="material-icons-outlined ok-tick">check_circle</span>
          {label}
          <span className="tcard-val">{chosen}{chosenVal !== "—" ? `: ${chosenVal}` : ""}</span>
          {mandatory}
        </div>
        {!readOnly && (
          <div className="tcard-peek">
            <button type="button" className="tcard-reopen" disabled={busy} onClick={() => onReopenLocal(term.key)}>{L("Undo", "تراجع")}</button>
          </div>
        )}
      </div>
    );
  }

  // Needs-input, unresolved → open card with the reference rows + actions (collected locally).
  return (
    <div className={`tcard ${disputed ? "tcard-critical" : "tcard-pending"}`}>
      <div className="tcard-h">
        {disputed && <span className="material-icons-outlined tcard-warn">warning_amber</span>}
        {label}
        <span className={`tcard-state ${st.cls}`}>{ar ? st.ar : st.en}</span>
        {mandatory}
      </div>
      <ValueRows term={term} L={L} />
      {/* App parity: when it's NOT the renter's turn, terms are read-only (no action buttons) — the
          rentee can view the conflict but can't act until the supplier responds. */}
      {readOnly ? null : countering ? (
        <CounterEditor term={term} ar={ar} L={L} onCancel={() => setCountering(false)} onSubmit={(v) => { setCountering(false); onResolveLocal(term.key, "counter", v); }} />
      ) : (
        <div className="tcard-acts">
          {disputed && <button className="tc-btn ghost" type="button" disabled={busy} onClick={() => onResolveLocal(term.key, "counter", term.renteePreference)}>{L("Keep mine", "الإبقاء على عرضي")}</button>}
          <button className="tc-btn outline" type="button" disabled={busy} onClick={() => setCountering(true)}>{L("Counter", "عرض مضاد")}</button>
          <button className="tc-btn solid" type="button" disabled={busy} onClick={() => onResolveLocal(term.key, "accept")}>{disputed ? L("Accept supplier’s", "قبول عرض المؤجّر") : L("Accept", "قبول")}</button>
        </div>
      )}
    </div>
  );
}

/**
 * Deal-room terms — app parity (term_card.dart + counter_offer_terms_page.dart). The renter resolves
 * needs-input terms LOCALLY (accept / keep-mine / counter); nothing is sent until the batched Counter
 * or Accept submit. Grouped with a progress meter: NEEDS YOUR INPUT → YOU'LL SEND (locally resolved) →
 * AGREED (server) → FIXED.
 */
export function DealRoomTerms({ terms, ar, L, busy, readOnly = false, resolutions, onResolveLocal, onReopenLocal }: {
  terms: DealTerm[]; ar: boolean; L: LFn; busy: boolean; readOnly?: boolean;
  resolutions: ResolutionsMap; onResolveLocal: ResolveLocalFn; onReopenLocal: ReopenLocalFn;
}) {
  if (terms.length === 0) return null;
  const needsInput = terms.filter((t) => isNeedsInput(t.state));
  const unresolved = needsInput.filter((t) => !resolutions[t.key]);
  const pendingLocal = needsInput.filter((t) => resolutions[t.key]);
  const agreed = terms.filter((t) => isAgreedish(t.state));
  const fixed = terms.filter((t) => t.state === "fixed");
  const resolvedCount = agreed.length + fixed.length + pendingLocal.length;
  const pct = terms.length ? Math.round((resolvedCount / terms.length) * 100) : 0;
  const groups: { label: string; terms: DealTerm[] }[] = [
    { label: L("Needs your input", "تحتاج ردّك"), terms: unresolved },
    { label: L("You'll send", "سترسل"), terms: pendingLocal },
    { label: L("Agreed", "متفق عليه"), terms: agreed },
    { label: L("Fixed", "ثابتة"), terms: fixed },
  ];
  return (
    <div className="terms-list">
      <div className="terms-progress">
        <div className="terms-progress-h">
          <span>{L(`${resolvedCount} of ${terms.length} resolved`, `${resolvedCount} من ${terms.length} تمّت`)}</span>
          {unresolved.length > 0 && <span className="tp-open">{L(`${unresolved.length} to review`, `${unresolved.length} للمراجعة`)}</span>}
        </div>
        <div className="terms-progress-bar"><div style={{ width: `${pct}%` }} /></div>
      </div>
      {groups.filter((g) => g.terms.length > 0).map((g) => (
        <div key={g.label} className="terms-group">
          <div className="terms-group-h">{g.label} <span>{g.terms.length}</span></div>
          {g.terms.map((tm) => (
            <TermCard key={tm.key + (tm.itemLabel ?? "")} term={tm} ar={ar} L={L} busy={busy} readOnly={readOnly} resolution={resolutions[tm.key]} onResolveLocal={onResolveLocal} onReopenLocal={onReopenLocal} />
          ))}
        </div>
      ))}
    </div>
  );
}
