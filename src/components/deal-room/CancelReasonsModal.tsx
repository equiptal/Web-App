"use client";

/**
 * **Cancel the deal — one flow, two surfaces** (owner, 2026-08-19).
 *
 * Lifted out of `DealRoom.tsx` unchanged so the map’s chat dock can offer the same act from its
 * kebab, with the same six reasons and the same wording the supplier will be shown.
 *
 * This component only COLLECTS the reason. The write — `closeDealRoom` — stays with the caller, so
 * each surface refreshes whatever it holds afterwards and there is still exactly one place that flips
 * a room to ABANDONED.
 */

import { useState } from "react";
import { Dialog } from "@/components/Dialog";

const CANCEL_REASONS: ReadonlyArray<{ en: string; ar: string }> = [
  { en: "Found a better offer", ar: "وجدت عرضاً أفضل" },
  { en: "Price is not suitable", ar: "السعر غير مناسب" },
  { en: "Equipment does not match", ar: "المعدات غير مطابقة" },
  { en: "Delayed response", ar: "تأخر في الرد" },
  { en: "Emergency circumstances", ar: "ظروف طارئة" },
  { en: "Other reason", ar: "سبب آخر" },
];

/**
 * Cancel-the-deal reasons modal — app parity (`showCancelReasonsModal`).
 *
 * Six radio rows; the last one ("Other reason") opens a free-text box and is the only row that can
 * hold the renter back — an empty "Other" submits nothing useful, so Confirm stays disabled until
 * he writes something. Every other row is submittable the moment it is picked.
 */
export function CancelReasonsModal({ ar, L, busy, error, onSubmit, onClose }: {
  ar: boolean;
  L: (en: string, arr: string) => string;
  busy: boolean;
  error: string | null;
  onSubmit: (reason: string) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [other, setOther] = useState("");
  const isOther = picked === CANCEL_REASONS.length - 1;
  const reason = picked === null ? "" : isOther ? other.trim() : L(CANCEL_REASONS[picked].en, CANCEL_REASONS[picked].ar);
  const canSubmit = !busy && reason.length > 0;

  return (
    <Dialog open onClose={busy ? () => {} : onClose} size="sm" padded={false}>
      <div dir={ar ? "rtl" : "ltr"} style={{ padding: "26px 22px 22px", textAlign: "center" }}>
        <span style={{ display: "inline-flex", width: 44, height: 44, borderRadius: "50%", background: "var(--danger-bg, var(--danger-soft))", color: "var(--danger, var(--danger))", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
          <span className="material-icons-outlined" style={{ fontSize: 22 }}>cancel</span>
        </span>
        <h3 style={{ fontSize: 16, fontWeight: 900, color: "var(--navy)", margin: "0 0 14px" }}>{L("Cancellation Reason", "سبب الإلغاء")}</h3>

        <div style={{ display: "grid", gap: 8, textAlign: ar ? "right" : "left" }}>
          {CANCEL_REASONS.map((r, i) => {
            const on = picked === i;
            return (
              <button
                key={r.en}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={busy}
                onClick={() => setPicked(i)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "inherit",
                  padding: "12px 12px", borderRadius: "var(--radius-md)", cursor: busy ? "default" : "pointer",
                  background: on ? "color-mix(in srgb, var(--danger) 6%, transparent)" : "var(--background)",
                  border: `${on ? 1.5 : 1}px solid ${on ? "color-mix(in srgb, var(--danger) 40%, transparent)" : "color-mix(in srgb, var(--border-strong) 50%, transparent)"}`,
                }}
              >
                <span style={{ width: 20, height: 20, borderRadius: "50%", flex: "0 0 auto", border: `${on ? 6 : 2}px solid ${on ? "var(--danger, var(--danger))" : "var(--muted)"}` }} />
                <span style={{ fontSize: 13, fontWeight: on ? 700 : 600, color: "var(--navy)" }}>{L(r.en, r.ar)}</span>
              </button>
            );
          })}
        </div>

        {isOther && (
          <textarea
            rows={3}
            value={other}
            disabled={busy}
            onChange={(e) => setOther(e.target.value)}
            placeholder={L("Write the reason...", "اكتب السبب...")}
            style={{ width: "100%", marginTop: 10, padding: 12, borderRadius: "var(--radius-md)", background: "var(--background)", border: "1px solid color-mix(in srgb, var(--border-strong) 50%, transparent)", fontSize: 14, color: "var(--navy)", resize: "vertical" }}
          />
        )}

        {error && <p className="dl-err" style={{ marginTop: 12 }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button type="button" className="dl-mbtn" style={{ flex: 1 }} disabled={busy} onClick={onClose}>{L("Back", "رجوع")}</button>
          <button type="button" className="dl-mbtn danger" style={{ flex: 1 }} disabled={!canSubmit} onClick={() => onSubmit(reason)}>
            {busy ? L("Cancelling…", "جارٍ الإلغاء…") : L("Confirm Cancellation", "تأكيد الإلغاء")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Request-summary modal — app parity (`showRequestSummarySheet`). A statement of what this room is
 * about, in the app's four sections: equipment, location, duration, preferences.
 *
 * Every row reads `room.details`, which the deal-room payload already carries, so the modal fetches
 * nothing. Rows whose value is missing are DROPPED rather than shown empty — the payload maps the
 * request tolerantly and a blank "Working hours: —" states less than no row at all.
 *
 * The app's equipment section also carries a YEAR and an asking PRICE. Neither is on the web's
 * `DealItemDetails`, so neither is rendered; nothing here is fabricated from the negotiated rate,
 * which is a different number from the request's ask.
 */
