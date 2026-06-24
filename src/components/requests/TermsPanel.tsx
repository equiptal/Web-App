import type { TermRow } from "@/lib/contract/bids";

/**
 * Per-term status inside the inline Terms dropdown. `agreed`/`negotiating` are the live deal-room
 * state (locked term / unseen counter); `matched`/`conflict`/`grey` are the request-vs-offer compare.
 */
// Wording mirrors the mobile app's bid-card terms (app_en/ar.arb): termsStateMatched / Conflict,
// verificationLabelUnverified (grey), termsValueDealRoom (in-negotiation), dealTermsAgreed (locked).
const STATE: Record<TermRow["state"], { cls: string; en: string; ar: string; icon: string }> = {
  agreed: { cls: "ok", en: "Agreed", ar: "متفق", icon: "lock" },
  negotiating: { cls: "warn", en: "Determined in deal room", ar: "تُحدَّد في غرفة الصفقة", icon: "forum" },
  matched: { cls: "ok", en: "Matched", ar: "مطابق", icon: "check_circle" },
  conflict: { cls: "bad", en: "Conflict", ar: "تعارض", icon: "error" },
  grey: { cls: "neutral", en: "Unverified", ar: "غير موثَّق", icon: "remove" },
};

/**
 * Inline Terms dropdown (app parity, expands within the card — not a popup): three stacked classes —
 * Equipment / Project / Supplier — each row carrying one status. Equipment + Project are the
 * request-vs-offer compare overlaid with the live deal-room state; Supplier lists the verification
 * documents the supplier has on file (CR / VAT / National address).
 */
export function TermsPanel({
  terms,
  ar,
  L,
}: {
  terms: { equipment: TermRow[]; contract: TermRow[]; supplier: TermRow[] };
  ar: boolean;
  L: (en: string, arr: string) => string;
}) {
  const bucket = (title: string, rows: TermRow[]) =>
    rows.length === 0 ? null : (
      <div className="tp-bucket" key={title}>
        <div className="tp-bh">{title}</div>
        {rows.map((r) => {
          const st = STATE[r.state];
          return (
            <div key={r.key} className="tp-row">
              <span className="tp-lab">{ar ? r.labelAr : r.labelEn}</span>
              <span className={`tp-state ${st.cls}`}>
                <span className="material-icons-outlined">{st.icon}</span>
                {ar ? st.ar : st.en}
              </span>
            </div>
          );
        })}
      </div>
    );

  return (
    <div className="terms-panel row-sep">
      {bucket(L("Equipment terms", "شروط المعدة"), terms.equipment)}
      {bucket(L("Project terms", "شروط المشروع"), terms.contract)}
      {bucket(L("Supplier documents", "مستندات المؤجّر"), terms.supplier)}
    </div>
  );
}
