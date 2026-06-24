"use client";

import { useState } from "react";
import type { DealTerm } from "@/lib/contract/deal-room";

type LFn = (en: string, ar: string) => string;
type ResolveFn = (key: string, action: "accept" | "counter", value?: unknown) => void;

/** App parity (term_card.dart): 5 colour-coded states. */
export const STATE_META: Record<string, { en: string; ar: string; cls: string }> = {
  fixed: { en: "Fixed", ar: "ثابت", cls: "st-fixed" },
  agreed: { en: "Agreed", ar: "متفق عليه", cls: "st-agreed" },
  soft_accepted: { en: "Accepted", ar: "مقبول", cls: "st-agreed" },
  disputed: { en: "Conflict", ar: "تعارض", cls: "st-disputed" },
  pending: { en: "Pending", ar: "قيد الانتظار", cls: "st-pending" },
};

/** Resolved (matched/accepted) terms collapse to a green row; conflicted/pending stay open. */
const isResolved = (state: string) => state === "agreed" || state === "fixed" || state === "soft_accepted";
/** Sort order on the single screen: conflicts first (open/red), then pending, then resolved (collapsed/green). */
function order(state: string): number {
  if (state === "disputed") return 0;
  if (state === "pending") return 1;
  return 2;
}

export function valText(v: unknown, L: LFn): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? L("Yes", "نعم") : L("No", "لا");
  const str = String(v);
  if (str === "supplier") return L("Supplier", "المؤجّر");
  if (str === "rentee") return L("Rentee", "المستأجر");
  if (str.toLowerCase() === "true") return L("Yes", "نعم");
  if (str.toLowerCase() === "false") return L("No", "لا");
  return str;
}

const isPriceKey = (k: string) => /mob|demob|pricing|rate/i.test(k);
function isBinary(t: DealTerm): boolean {
  const a = t.supplierDeclared, b = t.renteePreference;
  if (a == null || b == null) return false;
  if (Array.isArray(a) || Array.isArray(b)) return false;
  return (t.options?.length ?? 0) <= 2;
}

/** Inline counter editor — typed by term (price number / option pills / binary toggle / free value). */
function CounterEditor({ term, ar, L, onSubmit, onCancel }: { term: DealTerm; ar: boolean; L: LFn; onSubmit: (v: unknown) => void; onCancel: () => void }) {
  const [val, setVal] = useState<string>("");
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

/** One term card. Resolved → collapsed green row. Conflict/pending → open card with inline resolve. */
function TermCard({ term, ar, L, busy, onResolve }: { term: DealTerm; ar: boolean; L: LFn; busy: boolean; onResolve: ResolveFn }) {
  const st = STATE_META[term.state] ?? STATE_META.pending;
  const disputed = term.state === "disputed";
  const [open, setOpen] = useState(false); // resolved rows can be expanded on demand
  const [countering, setCountering] = useState(false);

  // Resolved (matched / accepted) → collapsed green row, tap to peek.
  if (isResolved(term.state)) {
    return (
      <div className="tcard tcard-resolved">
        <button type="button" className="tcard-resolved-h" onClick={() => setOpen((o) => !o)}>
          <span className="material-icons-outlined ok-tick">check_circle</span>
          <span className="tcard-lab">{ar ? term.labelAr : term.label}{term.itemLabel ? <em> · {term.itemLabel}</em> : null}</span>
          <span className="tcard-val">{valText(term.value ?? term.supplierDeclared ?? term.renteePreference, L)}</span>
          <span className={`tcard-state ${st.cls}`}>{ar ? st.ar : st.en}</span>
        </button>
        {open && (
          <div className="tcard-peek">
            <span>{L("Supplier", "المؤجّر")}: <b>{valText(term.supplierDeclared, L)}</b></span>
            <span>{L("You", "أنت")}: <b>{valText(term.renteePreference, L)}</b></span>
          </div>
        )}
      </div>
    );
  }

  // Conflict / pending → open card with actions.
  return (
    <div className={`tcard ${disputed ? "tcard-critical" : "tcard-pending"}`}>
      <div className="tcard-h">
        <span className="tcard-lab">{ar ? term.labelAr : term.label}{term.itemLabel ? <em> · {term.itemLabel}</em> : null}</span>
        <span className={`tcard-state ${st.cls}`}>{ar ? st.ar : st.en}</span>
      </div>
      <div className="tcard-vals">
        <div className="tcard-v"><span className="k">{L("Supplier", "المؤجّر")}</span><b>{valText(term.supplierDeclared, L)}</b></div>
        <div className="tcard-v mine"><span className="k">{L("You", "أنت")}</span><b>{valText(term.renteePreference, L)}</b></div>
      </div>
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
 * Deal-room terms — ALL on one screen (app parity, term_card.dart): conflicted terms are open/red with
 * inline resolve (Accept / Keep mine / Counter); matched & accepted terms collapse to a green row.
 * Sorted conflicts → pending → resolved. Resolve is immediate (per term), not staged.
 */
export function DealRoomTerms({ terms, ar, L, busy, onResolve }: { terms: DealTerm[]; ar: boolean; L: LFn; busy: boolean; onResolve: ResolveFn }) {
  if (terms.length === 0) return null;
  const sorted = [...terms].sort((a, b) => order(a.state) - order(b.state));
  return (
    <div className="terms-list">
      {sorted.map((tm) => <TermCard key={tm.key + (tm.itemLabel ?? "")} term={tm} ar={ar} L={L} busy={busy} onResolve={onResolve} />)}
    </div>
  );
}
