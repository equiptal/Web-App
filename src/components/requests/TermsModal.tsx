import type { TermRow } from "@/lib/contract/bids";

/**
 * Unified per-term state: the static request-vs-offer compare (matched/conflict/grey) overlaid with
 * the live deal-room state — `agreed` (locked, green padlock) and `negotiating` (an unseen counter).
 */
// Wording mirrors the mobile app's bid-card terms (app_en/ar.arb).
const STATE: Record<TermRow["state"], { cls: string; en: string; ar: string; icon: string }> = {
  agreed: { cls: "locked", en: "Agreed", ar: "متفق", icon: "lock" },
  negotiating: { cls: "open", en: "Determined in deal room", ar: "تُحدَّد في غرفة الصفقة", icon: "forum" },
  matched: { cls: "matched", en: "Matched", ar: "مطابق", icon: "check_circle" },
  conflict: { cls: "conflict", en: "Conflict", ar: "تعارض", icon: "cancel" },
  grey: { cls: "grey", en: "Unverified", ar: "غير موثَّق", icon: "remove_circle_outline" },
};

/**
 * Terms modal (app parity): three stacked buckets — Equipment / Project (contract) / Supplier docs —
 * each row in one status. The first two are the request-vs-offer compare overlaid with the live
 * deal-room state; Supplier lists the verification docs held (CR / VAT / National address).
 */
export function TermsModal({
  terms,
  ar,
  L,
  onClose,
}: {
  terms: { equipment: TermRow[]; contract: TermRow[]; supplier: TermRow[] };
  ar: boolean;
  L: (en: string, arr: string) => string;
  onClose: () => void;
}) {
  const bucket = (title: string, rows: TermRow[]) =>
    rows.length === 0 ? null : (
    <div className="tm-bucket">
      <div className="tm-bh">{title}</div>
      {rows.map((r) => {
        const st = STATE[r.state];
        return (
          <div key={r.key} className="tm-row">
            <span className="tm-lab">{ar ? r.labelAr : r.labelEn}</span>
            <span className={`tm-state ${st.cls}`}>
              <span className="material-icons-outlined">{st.icon}</span>
              {ar ? st.ar : st.en}
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="tm-overlay" dir={ar ? "rtl" : "ltr"} onClick={onClose}>
      <div className="tm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tm-head">
          <h3>{L("Terms", "الشروط")}</h3>
          <button type="button" onClick={onClose} aria-label={L("Close", "إغلاق")}>
            <span className="material-icons-outlined">close</span>
          </button>
        </div>
        <div className="tm-body">
          {bucket(L("Equipment terms", "شروط المعدة"), terms.equipment)}
          {bucket(L("Project terms", "شروط المشروع"), terms.contract)}
          {bucket(L("Supplier documents", "مستندات المؤجّر"), terms.supplier)}
        </div>
      </div>
    </div>
  );
}
