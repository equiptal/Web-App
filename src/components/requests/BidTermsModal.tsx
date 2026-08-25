"use client";

import { useState } from "react";
import { bucketBidTerms, type TermRow, type TermState } from "@/lib/contract/bids";

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

export function BidTermsModal({
  supplier,
  terms,
  ar,
  L,
  busy,
  onNegotiate,
  negotiateLabel,
  onClose,
  hidePending,
  negotiable,
  allTerms,
}: {
  supplier: string;
  terms: { equipment: TermRow[]; contract: TermRow[]; supplier: TermRow[] };
  ar: boolean;
  L: (en: string, arr: string) => string;
  busy: boolean;
  onNegotiate: () => void;
  negotiateLabel?: string;
  onClose: () => void;
  /** Off-platform (shared-link) bids have no deal room → no "Pending review" state; hide that tab. */
  hidePending?: boolean;
  /** The comparison's specific negotiable terms (safety cert, operator cert, FAT, fuel resp, …) — the
   *  app-accurate rows. When present they replace the vague equipment "certs"/"operator" lumped rows. */
  negotiable?: TermRow[];
  /** Off-platform: count/show EVERY answered required term (not just the app's 6 negotiable ones), so the
   *  tabs match the card tally + the full submission view. */
  allTerms?: boolean;
}) {
  // Shared bucketing (bids.ts bucketBidTerms) — the SAME logic the bid card's tally uses, so the tab
  // counts here always equal the card's "Conflict N · Matched N".
  const { byBucket } = bucketBidTerms(terms, negotiable, { all: allTerms });

  const tabs: { key: Bucket; label: string; c: string; bg: string }[] = [
    { key: "conflict", label: L("Conflict", "تعارض"), c: "#d9362a", bg: "#fdecea" },
    // Hidden for off-platform bids — no deal room means terms are answered Yes/No, never "pending review".
    ...(hidePending ? [] : [{ key: "pending" as Bucket, label: L("Pending review", "بانتظار المراجعة"), c: "#d4780a", bg: "#fff3e0" }]),
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
      className="fixed inset-0 z-[70] flex items-center justify-center bg-navy-deep/50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[20px] bg-surface shadow-[0_24px_60px_rgba(16,38,63,.35)]"
      >
        <div className="flex items-center justify-between gap-3 px-[22px] pb-3.5 pt-5">
          <h3 className="m-0 text-[18px] font-black text-navy">{L("Terms", "الشروط")} — {supplier}</h3>
          <button onClick={onClose} aria-label={L("Close", "إغلاق")} className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-surface2 text-muted transition hover:bg-surface3">
            <span className="material-icons-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        {/* 3 state tabs (Conflict / Pending review / Matched) with counts */}
        {/* ── Restyled onto the workspace's tokens (owner, 2026-08-25) ────────────────────────────
            This sheet opens from a card built on `bg-surface` / `border-border` / `text-navy`, and
            arrived in hard-coded hex — `#fff`, `#1c3550`, `rgba(16,38,63,.5)` — that reads as another
            product and cannot follow a theme. Its BEHAVIOUR is untouched: the same three state
            buckets, the same tab that opens on the first non-empty one, the same deal-room footer.

            The tab below and the verdict beside each row keep their INLINE colour, and deliberately:
            each carries its own state's hue, which is data rather than a class. */}
        <div className="flex gap-2 px-[22px] pb-1">
          {tabs.map((t) => {
            const on = active === t.key;
            const n = byBucket[t.key].length;
            return (
              <button
                key={t.key}
                onClick={() => setActive(t.key)}
                style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 8px", borderRadius: 11, border: `1.5px solid ${on ? t.c : "#e6ebf2"}`, background: on ? t.bg : "#fff", color: on ? t.c : "#6b8fa8", fontFamily: "inherit", fontWeight: 800, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                {t.label} <span className="font-black">{n}</span>
              </button>
            );
          })}
        </div>

        <div className="overflow-y-auto px-[22px] pb-[18px] pt-2.5">
          {rows.length === 0 ? (
            <div className="py-[26px] text-center text-[13.5px] font-semibold text-muted">
              {active === "conflict" ? L("No conflicts.", "لا تعارضات.") : active === "pending" ? L("Nothing pending review.", "لا شيء بانتظار المراجعة.") : L("Nothing matched yet.", "لا مطابقات بعد.")}
            </div>
          ) : (
            rows.map((r, i) => {
              const st = STATE[r.state];
              const okWord = active === "matched" ? L("Matched", "مطابق") : st.word("");
              const word = ar ? st.ar : st.word(active === "matched" ? "Matched" : "");
              return (
                <div key={`${r.key}-${i}`} className="flex items-center justify-between gap-3 border-b border-border py-[13px]">
                  <span className="text-[15px] font-semibold text-navy">
                    {ar ? r.labelAr : r.labelEn}
                    {r.detail && (r.state === "conflict" || r.state === "negotiating") && <span className="font-medium text-muted"> · {ar ? r.detail.ar : r.detail.en}</span>}
                  </span>
                  <span style={{ fontSize: 14.5, fontWeight: 800, color: st.c, whiteSpace: "nowrap" }}>{st.mark} {word || okWord}</span>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-border px-[22px] pb-5 pt-3.5">
          <button
            onClick={onNegotiate}
            disabled={busy}
            className="w-full rounded-[14px] bg-navy p-3.5 text-[15px] font-extrabold text-white transition hover:brightness-110 disabled:cursor-default disabled:opacity-70"
          >
            {negotiateLabel ?? L("Negotiate terms", "التفاوض على الشروط")}
          </button>
        </div>
      </div>
    </div>
  );
}
