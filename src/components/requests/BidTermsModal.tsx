"use client";

import { useState } from "react";
import { Dialog, DialogButton } from "@/components/Dialog";
import { bucketBidTerms, termSides, type TermRow, type TermState } from "@/lib/contract/bids";

/**
 * Per-term status modal (app parity: "Terms — <supplier>"). Every term the bid touches — equipment,
 * project, documents — is bucketed by STATE into three tabs, mirroring the mobile app: Conflict /
 * Pending review / Matched. matched+agreed → Matched; conflict → Conflict; grey+negotiating (still
 * being worked out) → Pending review. The footer opens the deal room.
 */
type Tone = { word: (ok: string) => string; ar: string; c: string; mark: string };
const STATE: Record<TermState, Tone> = {
  matched: { word: (ok) => ok, ar: "مطابق", c: "var(--ok)", mark: "✓" },
  agreed: { word: (ok) => ok, ar: "متفق", c: "var(--ok)", mark: "✓" },
  negotiating: { word: () => "In deal room", ar: "في غرفة الصفقة", c: "var(--warn)", mark: "↻" },
  conflict: { word: () => "Conflict", ar: "تعارض", c: "var(--danger)", mark: "!" },
  grey: { word: () => "Pending review", ar: "بانتظار المراجعة", c: "var(--muted-light)", mark: "–" },
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
    { key: "conflict", label: L("Conflict", "تعارض"), c: "var(--danger)", bg: "var(--danger-soft)" },
    // Hidden for off-platform bids — no deal room means terms are answered Yes/No, never "pending review".
    ...(hidePending ? [] : [{ key: "pending" as Bucket, label: L("Pending review", "بانتظار المراجعة"), c: "var(--warn)", bg: "var(--warn-soft)" }]),
    { key: "matched", label: L("Matched", "مطابق"), c: "var(--ok)", bg: "var(--ok-soft)" },
  ];
  // Open on the first tab that has something (Conflict → Pending → Matched), else Matched.
  const firstNonEmpty = tabs.find((t) => byBucket[t.key].length)?.key ?? "matched";
  const [active, setActive] = useState<Bucket>(firstNonEmpty);
  const rows = byBucket[active];

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={L("Terms", "الشروط")}
      subtitle={supplier}
      footer={
        <DialogButton tone="primary" full disabled={busy} onClick={onNegotiate}>
          {negotiateLabel ?? L("Negotiate terms", "التفاوض على الشروط")}
        </DialogButton>
      }
    >

        {/* 3 state tabs (Conflict / Pending review / Matched) with counts */}
        {/* ── Restyled onto the workspace's tokens (owner, 2026-08-25) ────────────────────────────
            This sheet opens from a card built on `bg-surface` / `border-border` / `text-navy`, and
            arrived in hard-coded hex — `var(--surface)`, `var(--navy)`, `color-mix(in srgb, var(--info-deep) 50%, transparent)` — that reads as another
            product and cannot follow a theme. Its BEHAVIOUR is untouched: the same three state
            buckets, the same tab that opens on the first non-empty one, the same deal-room footer.

            The tab below and the verdict beside each row keep their INLINE colour, and deliberately:
            each carries its own state's hue, which is data rather than a class. */}
        <div className="flex gap-2 pb-1">
          {tabs.map((t) => {
            const on = active === t.key;
            const n = byBucket[t.key].length;
            return (
              <button
                key={t.key}
                onClick={() => setActive(t.key)}
                style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 8px", borderRadius: "var(--radius-md)", border: `1.5px solid ${on ? t.c : "var(--surface3)"}`, background: on ? t.bg : "var(--surface)", color: on ? t.c : "var(--muted)", fontFamily: "inherit", fontWeight: 800, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                {t.label} <span className="font-extrabold">{n}</span>
              </button>
            );
          })}
        </div>

        <div className="pt-2.5">
          {rows.length === 0 ? (
            <div className="py-7 text-center text-body font-semibold text-muted">
              {active === "conflict" ? L("No conflicts.", "لا تعارضات.") : active === "pending" ? L("Nothing pending review.", "لا شيء بانتظار المراجعة.") : L("Nothing matched yet.", "لا مطابقات بعد.")}
            </div>
          ) : (
            rows.map((r, i) => {
              const st = STATE[r.state];
              const okWord = active === "matched" ? L("Matched", "مطابق") : st.word("");
              const word = ar ? st.ar : st.word(active === "matched" ? "Matched" : "");
              return (
                <div key={`${r.key}-${i}`} className="flex items-center justify-between gap-3 border-b border-border py-3">
                  <span className="text-subhead font-semibold text-navy">
                    {ar ? r.labelAr : r.labelEn}
                    {/* ── ONE value, unless he offered another (owner, 2026-09-06) ───────────────
                        *"No need to show «renter: — supplier: —» on each term. Just show the value
                        of the request the supplier did not match… unless the supplier proposes a
                        different value, like the renter wants TÜV and the supplier said SPSP — then
                        mention each side."*

                        ~~The whole «Renter: X · Supplier: Y» sentence, on every conflicted and
                        negotiating row.~~ On a refusal its second half only ever repeated the state
                        the row is already painted in: «Supplier: Not confirmed» beside a red
                        «Conflict». So a refusal now shows the RENTER'S value alone, in red — the
                        thing the supplier did not meet, which is the fact he needs — and both sides
                        appear only where the supplier actually named something else.

                        `termSides` (bids.ts) is what tells the two apart: it returns `offered: null`
                        for a refusal, a dash or an empty half. */}
                    {(r.state === "conflict" || r.state === "negotiating") && (() => {
                      const { asked, offered } = termSides(r, ar);
                      if (offered && asked && offered !== asked) {
                        return (
                          <span className="font-semibold">
                            {" · "}
                            <span className="text-muted">{asked}</span>
                            <span aria-hidden="true" className="text-muted/70">{ar ? " ← " : " → "}</span>
                            <span className="text-danger">{offered}</span>
                          </span>
                        );
                      }
                      const only = offered ?? asked;
                      return only ? <span className="font-semibold text-danger"> · {only}</span> : null;
                    })()}
                  </span>
                  <span style={{ fontSize: 14.5, fontWeight: 800, color: st.c, whiteSpace: "nowrap" }}>{st.mark} {word || okWord}</span>
                </div>
              );
            })
          )}
        </div>

    </Dialog>
  );
}
