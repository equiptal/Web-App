"use client";

import type { TermRow, TermState } from "@/lib/contract/bids";

/**
 * Per-term status modal (prototype "Terms — <supplier>"): three sections — Equipment / Project /
 * Documents — each row carrying one status. matched/agreed are settled; negotiating/conflict are the
 * live deal-room state; grey = not declared/verified yet. The footer opens the deal room.
 */
type Tone = { label: (ok: string) => string; ar: string; c: string; mark: string };
const STATE: Record<TermState, Tone> = {
  matched: { label: (ok) => ok, ar: "مطابق", c: "#1daf58", mark: "✓" },
  agreed: { label: (ok) => ok, ar: "متفق", c: "#1daf58", mark: "✓" },
  negotiating: { label: () => "In deal room", ar: "في غرفة الصفقة", c: "#d4780a", mark: "↻" },
  conflict: { label: () => "Conflict", ar: "تعارض", c: "#d9362a", mark: "!" },
  grey: { label: () => "Unverified", ar: "غير موثَّق", c: "#9AA7B8", mark: "–" },
};

export function BidTermsModal({
  supplier,
  terms,
  ar,
  L,
  busy,
  onNegotiate,
  negotiateLabel,
  onClose,
}: {
  supplier: string;
  terms: { equipment: TermRow[]; contract: TermRow[]; supplier: TermRow[] };
  ar: boolean;
  L: (en: string, arr: string) => string;
  busy: boolean;
  onNegotiate: () => void;
  negotiateLabel?: string;
  onClose: () => void;
}) {
  const okCount = (rows: TermRow[]) => rows.filter((r) => r.state === "matched" || r.state === "agreed").length;
  const chip = (label: string, rows: TermRow[]) => {
    const ok = okCount(rows), total = rows.length;
    const tone = total && ok === total ? { bg: "#e7f7ee", c: "#1daf58" } : ok > 0 ? { bg: "#fff3e0", c: "#d4780a" } : { bg: "#eff4f9", c: "#6b8fa8" };
    return (
      <span key={label} style={{ fontSize: 13, fontWeight: 800, color: tone.c, background: tone.bg, padding: "5px 12px", borderRadius: 20 }}>
        {label} {ok}/{total}
      </span>
    );
  };

  const section = (title: string, okWord: string, rows: TermRow[]) =>
    rows.length === 0 ? null : (
      <div key={title} style={{ marginTop: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".06em", color: "#6b8fa8", marginBottom: 4 }}>{title}</div>
        {rows.map((r) => {
          const st = STATE[r.state];
          const word = ar ? st.ar : st.label(okWord);
          return (
            <div key={r.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 0", borderBottom: "1px solid #EFF2F6" }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: "#1c3550" }}>
                {ar ? r.labelAr : r.labelEn}
                {r.state === "conflict" && r.detail && <span style={{ color: "#6b8fa8", fontWeight: 500 }}> · {ar ? r.detail.ar : r.detail.en}</span>}
              </span>
              <span style={{ fontSize: 14.5, fontWeight: 800, color: st.c, whiteSpace: "nowrap" }}>{st.mark} {word}</span>
            </div>
          );
        })}
      </div>
    );

  return (
    <div
      dir={ar ? "rtl" : "ltr"}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(16,38,63,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 560, maxHeight: "90vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 20, overflow: "hidden", boxShadow: "0 24px 60px rgba(16,38,63,.35)" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "20px 22px 14px" }}>
          <h3 style={{ fontSize: 18, fontWeight: 900, color: "#1c3550", margin: 0 }}>{L("Terms", "الشروط")} — {supplier}</h3>
          <button onClick={onClose} aria-label={L("Close", "إغلاق")} style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: "#eff4f9", color: "#6b8fa8", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span className="material-icons-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: "0 22px 18px" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {chip(L("Equipment", "المعدة"), terms.equipment)}
            {chip(L("Project", "المشروع"), terms.contract)}
            {chip(L("Documents", "المستندات"), terms.supplier)}
          </div>
          {section(L("EQUIPMENT TERMS", "شروط المعدة"), L("Matched", "مطابق"), terms.equipment)}
          {section(L("PROJECT TERMS", "شروط المشروع"), L("Agreed", "متفق"), terms.contract)}
          {section(L("DOCUMENTS", "المستندات"), L("Verified", "موثَّق"), terms.supplier)}
        </div>

        <div style={{ padding: "14px 22px 20px", borderTop: "1px solid #EFF2F6" }}>
          <button
            onClick={onNegotiate}
            disabled={busy}
            style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: "#1c3550", color: "#fff", fontWeight: 800, fontSize: 15, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.7 : 1 }}
          >
            {negotiateLabel ?? L("Negotiate terms", "التفاوض على الشروط")}
          </button>
        </div>
      </div>
    </div>
  );
}
