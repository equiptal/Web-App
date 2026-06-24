"use client";

import { useState } from "react";
import type { DealTerm } from "@/lib/contract/deal-room";

type LFn = (en: string, ar: string) => string;

/** A staged decision for one term inside the counter-offer flow (not yet submitted). */
export type TermChoice = { choice: "accept" | "keep" | "counter"; value?: unknown };
export type Decisions = Record<string, TermChoice>;
type DecideFn = (key: string, choice: TermChoice) => void;

/** App parity (term_card.dart): 5 colour-coded states. */
export const STATE_META: Record<string, { en: string; ar: string; cls: string }> = {
  fixed: { en: "Fixed", ar: "ثابت", cls: "st-fixed" },
  agreed: { en: "Agreed", ar: "متفق عليه", cls: "st-agreed" },
  soft_accepted: { en: "Soft accepted", ar: "مقبول مبدئياً", cls: "st-soft" },
  disputed: { en: "Disputed", ar: "متنازع عليه", cls: "st-disputed" },
  pending: { en: "Pending", ar: "قيد الانتظار", cls: "st-pending" },
};

/** App parity (terms_review_cubit `_classifyTier`): disputed → critical, pending/soft → review, else matched. */
export function tierOf(state: string): "critical" | "review" | "matched" {
  if (state === "disputed") return "critical";
  if (state === "pending" || state === "soft_accepted") return "review";
  return "matched"; // agreed | fixed
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
/** App parity (terms_review_sheet `_isBinaryTerm`): scalar (non-list) supplier + rentee values. */
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

/** Critical (disputed) term card with staged accept / keep-mine / counter. */
function CriticalCard({ term, ar, L, decision, onDecide }: { term: DealTerm; ar: boolean; L: LFn; decision?: TermChoice; onDecide: DecideFn }) {
  const [countering, setCountering] = useState(false);
  const st = STATE_META[term.state] ?? STATE_META.pending;
  const chosen = decision?.choice;
  return (
    <div className={`tcard tcard-critical${chosen ? " decided" : ""}`}>
      <div className="tcard-h">
        <span className="tcard-lab">{ar ? term.labelAr : term.label}{term.itemLabel ? <em> · {term.itemLabel}</em> : null}</span>
        <span className={`tcard-state ${st.cls}`}>{ar ? st.ar : st.en}</span>
      </div>
      <div className="tcard-vals">
        <div className="tcard-v"><span className="k">{L("Supplier", "المؤجّر")}</span><b>{valText(term.supplierDeclared, L)}</b></div>
        <div className="tcard-v mine"><span className="k">{L("You", "أنت")}</span><b>{valText(term.renteePreference, L)}</b></div>
      </div>
      {chosen && !countering && (
        <div className="tcard-chosen">
          <span className="material-icons-outlined">check_circle</span>
          {chosen === "accept" ? L("Accepting supplier’s", "قبول عرض المؤجّر")
            : chosen === "keep" ? L("Keeping yours", "الإبقاء على عرضك")
            : `${L("Countering with", "عرض مضاد بـ")}: ${valText(decision?.value, L)}`}
        </div>
      )}
      {countering ? (
        <CounterEditor term={term} ar={ar} L={L} onCancel={() => setCountering(false)} onSubmit={(v) => { setCountering(false); onDecide(term.key, { choice: "counter", value: v }); }} />
      ) : (
        <div className="tcard-acts">
          <button className={`tc-btn ghost${chosen === "keep" ? " on" : ""}`} type="button" onClick={() => onDecide(term.key, { choice: "keep", value: term.renteePreference })}>{L("Keep mine", "الإبقاء على عرضي")}</button>
          <button className={`tc-btn outline${chosen === "counter" ? " on" : ""}`} type="button" onClick={() => setCountering(true)}>{L("Counter", "عرض مضاد")}</button>
          <button className={`tc-btn solid${chosen === "accept" ? " on" : ""}`} type="button" onClick={() => onDecide(term.key, { choice: "accept" })}>{L("Accept supplier’s", "قبول عرض المؤجّر")}</button>
        </div>
      )}
    </div>
  );
}

/**
 * Counter-offer Terms page (app parity — terms_review): tiered Critical / Review / Matched, each a
 * colour-coded state card. Decisions are STAGED here (not submitted) and applied together on the flow's
 * summary step.
 */
export function DealRoomTerms({ terms, ar, L, decisions, onDecide }: { terms: DealTerm[]; ar: boolean; L: LFn; decisions: Decisions; onDecide: DecideFn }) {
  const [matchedOpen, setMatchedOpen] = useState(false);
  if (terms.length === 0) return <p className="co-empty">{L("No terms to review.", "لا توجد شروط للمراجعة.")}</p>;
  const critical = terms.filter((t) => tierOf(t.state) === "critical");
  const review = terms.filter((t) => tierOf(t.state) === "review");
  const matched = terms.filter((t) => tierOf(t.state) === "matched");

  return (
    <div className="terms-review">
      {critical.length > 0 && (
        <div className="tier tier-critical">
          <div className="tier-h"><span className="material-icons-outlined">priority_high</span>{critical.length} {L("critical", "حرجة")}</div>
          {critical.map((t) => <CriticalCard key={t.key + (t.itemLabel ?? "")} term={t} ar={ar} L={L} decision={decisions[t.key]} onDecide={onDecide} />)}
        </div>
      )}
      {review.length > 0 && (
        <div className="tier tier-review">
          <div className="tier-h"><span className="material-icons-outlined">rule</span>{review.length} {L("review", "مراجعة")}</div>
          {review.map((t) => {
            const st = STATE_META[t.state] ?? STATE_META.pending;
            const chosen = decisions[t.key]?.choice === "accept";
            return (
              <div className="tcard tcard-review" key={t.key + (t.itemLabel ?? "")}>
                <div className="tcard-main">
                  <span className="tcard-lab">{ar ? t.labelAr : t.label}{t.itemLabel ? <em> · {t.itemLabel}</em> : null}</span>
                  <span className="tcard-val">{valText(t.value ?? t.supplierDeclared ?? t.renteePreference, L)}</span>
                </div>
                <span className={`tcard-state ${st.cls}`}>{ar ? st.ar : st.en}</span>
                <button className={`tc-btn solid sm${chosen ? " on" : ""}`} type="button" onClick={() => onDecide(t.key, { choice: "accept" })}>{chosen ? L("Accepted", "تم القبول") : L("Accept", "قبول")}</button>
              </div>
            );
          })}
        </div>
      )}
      {matched.length > 0 && (
        <div className="tier tier-matched">
          <button type="button" className="tier-h tier-toggle" aria-expanded={matchedOpen} onClick={() => setMatchedOpen((o) => !o)}>
            <span className="material-icons-outlined">check_circle</span>{matched.length} {L("matched", "متوافقة")}
            <span className="material-icons-outlined tier-chev" style={{ transform: matchedOpen ? "rotate(180deg)" : "none" }}>expand_more</span>
          </button>
          {matchedOpen && matched.map((t) => {
            const st = STATE_META[t.state] ?? STATE_META.agreed;
            return (
              <div className="tcard tcard-matched" key={t.key + (t.itemLabel ?? "")}>
                <span className="tcard-lab">{ar ? t.labelAr : t.label}{t.itemLabel ? <em> · {t.itemLabel}</em> : null}</span>
                <span className="tcard-val">{valText(t.value ?? t.supplierDeclared ?? t.renteePreference, L)}</span>
                <span className={`tcard-state ${st.cls}`}>{ar ? st.ar : st.en}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
