"use client";

import { useState } from "react";
import type { TermRow, TermState } from "@/lib/contract/bids";

/**
 * Per-term status modal (app parity: "Terms — <supplier>"). Every term the bid touches — equipment,
 * project, documents — is bucketed by STATE into three tabs, mirroring the mobile app: Conflict /
 * Pending review / Matched. matched+agreed → Matched; conflict → Conflict; grey+negotiating (still
 * being worked out) → Pending review. The footer opens the deal room.
 */
type Tone = { word: (ok: string) => string; ar: string; c: string; mark: string };
const STATE: Record<TermState, Tone> = {
  matched: { word: (ok) => ok, ar: "مطابق", c: "#1daf58", mark: "✓" },
  agreed: { word: (ok) => ok, ar: "متفق", c: "#1daf58", mark: "✓" },
  negotiating: { word: () => "In deal room", ar: "في غرفة الصفقة", c: "#d4780a", mark: "↻" },
  conflict: { word: () => "Conflict", ar: "تعارض", c: "#d9362a", mark: "!" },
  grey: { word: () => "Pending review", ar: "بانتظار المراجعة", c: "#9AA7B8", mark: "–" },
};

type Bucket = "conflict" | "pending" | "matched";
const bucketOf = (s: TermState): Bucket => (s === "conflict" ? "conflict" : s === "matched" || s === "agreed" ? "matched" : "pending");

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
  // Flatten every term the bid touches and bucket by state (app's 3-way split).
  const allRows = [...terms.equipment, ...terms.contract, ...terms.supplier];
  const byBucket: Record<Bucket, TermRow[]> = { conflict: [], pending: [], matched: [] };
  for (const r of allRows) byBucket[bucketOf(r.state)].push(r);

  const tabs: { key: Bucket; label: string; c: string; bg: string }[] = [
    { key: "conflict", label: L("Conflict", "تعارض"), c: "#d9362a", bg: "#fdecea" },
    { key: "pending", label: L("Pending review", "بانتظار المراجعة"), c: "#d4780a", bg: "#fff3e0" },
    { key: "matched", label: L("Matched", "مطابق"), c: "#1daf58", bg: "#e7f7ee" },
  ];
  // Open on the first tab that has something (Conflict → Pending → Matched), else Matched.
  const firstNonEmpty = tabs.find((t) => byBucket[t.key].length)?.key ?? "matched";
  const [active, setActive] = useState<Bucket>(firstNonEmpty);
  const rows = byBucket[active];

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

        {/* 3 state tabs (Conflict / Pending review / Matched) with counts */}
        <div style={{ display: "flex", gap: 8, padding: "0 22px 4px" }}>
          {tabs.map((t) => {
            const on = active === t.key;
            const n = byBucket[t.key].length;
            return (
              <button
                key={t.key}
                onClick={() => setActive(t.key)}
                style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 8px", borderRadius: 11, border: `1.5px solid ${on ? t.c : "#e6ebf2"}`, background: on ? t.bg : "#fff", color: on ? t.c : "#6b8fa8", fontFamily: "inherit", fontWeight: 800, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                {t.label} <span style={{ fontWeight: 900 }}>{n}</span>
              </button>
            );
          })}
        </div>

        <div style={{ overflowY: "auto", padding: "10px 22px 18px" }}>
          {rows.length === 0 ? (
            <div style={{ padding: "26px 0", textAlign: "center", fontSize: 13.5, fontWeight: 600, color: "#9AA7B8" }}>
              {active === "conflict" ? L("No conflicts.", "لا تعارضات.") : active === "pending" ? L("Nothing pending review.", "لا شيء بانتظار المراجعة.") : L("Nothing matched yet.", "لا مطابقات بعد.")}
            </div>
          ) : (
            rows.map((r, i) => {
              const st = STATE[r.state];
              const okWord = active === "matched" ? L("Matched", "مطابق") : st.word("");
              const word = ar ? st.ar : st.word(active === "matched" ? "Matched" : "");
              return (
                <div key={`${r.key}-${i}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 0", borderBottom: "1px solid #EFF2F6" }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#1c3550" }}>
                    {ar ? r.labelAr : r.labelEn}
                    {r.detail && (r.state === "conflict" || r.state === "negotiating") && <span style={{ color: "#6b8fa8", fontWeight: 500 }}> · {ar ? r.detail.ar : r.detail.en}</span>}
                  </span>
                  <span style={{ fontSize: 14.5, fontWeight: 800, color: st.c, whiteSpace: "nowrap" }}>{st.mark} {word || okWord}</span>
                </div>
              );
            })
          )}
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
