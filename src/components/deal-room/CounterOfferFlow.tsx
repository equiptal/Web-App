"use client";

import { useState } from "react";
import type { DealRoomView } from "@/lib/contract/deal-room";
import { proposeRate, resolveTerm } from "@/lib/api/client";
import { DealRoomTerms, valText, tierOf, type Decisions } from "@/components/deal-room/DealRoomTerms";

type LFn = (en: string, ar: string) => string;
const nf = (n: number) => Math.round(n).toLocaleString("en-US");

/** One editable price line (daily rate / mobilization / demobilization). */
type Line = { amount: number; removed: boolean };

/**
 * Counter-offer flow (app parity — counter_offer_flow_sheet): a 3-page bottom sheet —
 * 1) Offer terms (tiered review, decisions staged) · 2) Price changes (daily rate / mob / demob, each
 * editable with "I'll handle it myself") · 3) Summary & acknowledgement → submit. Everything is staged
 * locally and submitted together on the final step (rate → proposeRate; terms + mob/demob → resolveTerm).
 */
export function CounterOfferFlow({
  room,
  id,
  ar,
  L,
  onClose,
  onSubmitted,
}: {
  room: DealRoomView;
  id: string;
  ar: boolean;
  L: LFn;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [page, setPage] = useState(0);
  const [decisions, setDecisions] = useState<Decisions>({});
  const [rate, setRate] = useState<Line>({ amount: room.rate ?? 0, removed: false });
  const [mob, setMob] = useState<Line>({ amount: room.mobPrice ?? 0, removed: false });
  const [demob, setDemob] = useState<Line>({ amount: room.demobPrice ?? 0, removed: false });
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sar = L("SAR", "ر.س");
  const pages = [L("Offer terms", "شروط العرض"), L("Price changes", "تغييرات السعر"), L("Summary", "الملخّص")];

  // What actually changed vs the current offer (drives the summary + the submit calls).
  const rateChanged = (rate.amount || 0) !== (room.rate ?? 0);
  const mobChanged = mob.removed || (mob.amount || 0) !== (room.mobPrice ?? 0);
  const demobChanged = demob.removed || (demob.amount || 0) !== (room.demobPrice ?? 0);
  const termChanges = Object.entries(decisions).filter(([, d]) => d.choice === "counter" || d.choice === "keep");
  const termAccepts = Object.entries(decisions).filter(([, d]) => d.choice === "accept");
  const hasAnyChange = rateChanged || mobChanged || demobChanged || termChanges.length > 0;
  const criticalCount = room.terms.filter((t) => tierOf(t.state) === "critical").length;
  const decidedCritical = room.terms.filter((t) => tierOf(t.state) === "critical" && decisions[t.key]).length;
  const allCriticalDecided = decidedCritical >= criticalCount;

  function labelFor(key: string): string {
    const t = room.terms.find((x) => x.key === key);
    return t ? (ar ? t.labelAr : t.label) : key;
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      // Terms: accept → accept; keep → counter with own value; counter → counter with chosen value.
      for (const [key, d] of Object.entries(decisions)) {
        if (d.choice === "accept") await resolveTerm(id, key, "accept");
        else await resolveTerm(id, key, "counter", d.value);
      }
      // Mob / demob pricing terms: removed ("I'll handle it") → 0; else the edited amount.
      if (mobChanged) await resolveTerm(id, "mobilization_pricing", "counter", mob.removed ? 0 : mob.amount);
      if (demobChanged) await resolveTerm(id, "demobilization_pricing", "counter", demob.removed ? 0 : demob.amount);
      // Daily rate last (mirrors lastProposedRate).
      if (rateChanged) await proposeRate(id, { proposedRate: rate.amount, priceUnit: room.priceUnit ?? "PER_DAY" });
      onSubmitted();
    } catch {
      setErr(L("Couldn’t send your counter — please try again.", "تعذّر إرسال عرضك المقابل — حاول مرة أخرى."));
      setBusy(false);
    }
  }

  const lineItem = (kind: "rate" | "mob" | "demob", line: Line, set: (l: Line) => void) => {
    const meta = {
      rate: { en: "Daily rate", ar: "السعر اليومي", icon: "event", removable: false },
      mob: { en: "Mobilization fee", ar: "رسوم النقل", icon: "local_shipping", removable: true },
      demob: { en: "Demobilization fee", ar: "رسوم الإرجاع", icon: "keyboard_return", removable: true },
    }[kind];
    return (
      <div className={`co-line${line.removed ? " removed" : ""}`}>
        <div className="co-line-h">
          <span className="material-icons-outlined">{meta.icon}</span>
          <span className="co-line-lab">{L(meta.en, meta.ar)}</span>
          {meta.removable && (
            line.removed ? (
              <button type="button" className="co-line-undo" onClick={() => set({ ...line, removed: false })}>{L("Undo", "تراجع")}</button>
            ) : (
              <button type="button" className="co-line-rm" onClick={() => set({ ...line, removed: true })}>{L("I’ll handle it myself", "سأتكفّل به بنفسي")}</button>
            )
          )}
        </div>
        {line.removed ? (
          <div className="co-line-removed">{L("Rentee’s responsibility — not charged.", "على عاتق المستأجر — بدون رسوم.")}</div>
        ) : (
          <div className="co-line-in">
            <input type="number" min={0} inputMode="numeric" value={line.amount || ""} onChange={(e) => set({ ...line, amount: Number(e.target.value) || 0 })} />
            <span className="co-unit">{sar}{kind === "rate" ? ` / ${L("day", "يوم")}` : ""}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="co-backdrop" onClick={onClose}>
      <div className="co-sheet" onClick={(e) => e.stopPropagation()} dir={ar ? "rtl" : "ltr"}>
        {/* header + stepper */}
        <div className="co-head">
          <span className="co-title">{L("Create counter offer", "إنشاء عرض مضاد")}</span>
          <button className="co-x" type="button" onClick={onClose} aria-label={L("Close", "إغلاق")}><span className="material-icons-outlined">close</span></button>
        </div>
        <div className="co-steps">
          {pages.map((p, i) => (
            <span key={p} className={`co-step${i === page ? " on" : ""}${i < page ? " done" : ""}`}>
              <i>{i < page ? "✓" : i + 1}</i>{p}
            </span>
          ))}
        </div>

        <div className="co-body">
          {page === 0 && (
            <DealRoomTerms terms={room.terms} ar={ar} L={L} decisions={decisions} onDecide={(key, choice) => setDecisions((d) => ({ ...d, [key]: choice }))} />
          )}
          {page === 1 && (
            <div className="co-price">
              {lineItem("rate", rate, setRate)}
              {lineItem("mob", mob, setMob)}
              {lineItem("demob", demob, setDemob)}
            </div>
          )}
          {page === 2 && (
            <div className="co-summary">
              <div className="co-sum-h">{L("Review your counter offer", "راجع عرضك المضاد")}</div>
              {!hasAnyChange ? (
                <p className="co-empty">{L("No changes yet — accept terms or edit a price.", "لا تغييرات بعد — اقبل الشروط أو عدّل سعرًا.")}</p>
              ) : (
                <ul className="co-sum-list">
                  {rateChanged && <li><span>{L("Daily rate", "السعر اليومي")}</span><b>{sar} {nf(rate.amount)}</b></li>}
                  {mobChanged && <li><span>{L("Mobilization fee", "رسوم النقل")}</span><b>{mob.removed ? L("I’ll handle it", "سأتكفّل به") : `${sar} ${nf(mob.amount)}`}</b></li>}
                  {demobChanged && <li><span>{L("Demobilization fee", "رسوم الإرجاع")}</span><b>{demob.removed ? L("I’ll handle it", "سأتكفّل به") : `${sar} ${nf(demob.amount)}`}</b></li>}
                  {termChanges.map(([k, d]) => <li key={k}><span>{labelFor(k)}</span><b>{d.choice === "keep" ? L("Keep mine", "إبقاء عرضي") : valText(d.value, L)}</b></li>)}
                  {termAccepts.map(([k]) => <li key={k} className="ok"><span>{labelFor(k)}</span><b>{L("Accepted", "تم القبول")}</b></li>)}
                </ul>
              )}
              <label className="co-ack">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                <span>{L("I understand this counter offer is binding once the supplier accepts it.", "أفهم أن هذا العرض المضاد مُلزم بمجرد قبول المؤجّر له.")}</span>
              </label>
              {!allCriticalDecided && <p className="co-warn"><span className="material-icons-outlined">error_outline</span>{L("Decide every critical term before sending.", "احسم كل شرط حرج قبل الإرسال.")}</p>}
              {err && <p className="co-warn">{err}</p>}
            </div>
          )}
        </div>

        {/* footer nav */}
        <div className="co-foot">
          {page > 0 ? (
            <button className="btn outline" type="button" disabled={busy} onClick={() => setPage((p) => p - 1)}>{L("Back", "رجوع")}</button>
          ) : <span />}
          {page < 2 ? (
            <button className="btn green" type="button" onClick={() => setPage((p) => p + 1)}>{L("Next", "التالي")}<span className="material-icons-outlined rtl:scale-x-[-1]">arrow_forward</span></button>
          ) : (
            <button className="btn green" type="button" disabled={busy || !ack || !hasAnyChange || !allCriticalDecided} onClick={submit}>
              <span className="material-icons-outlined">{busy ? "hourglass_top" : "send"}</span>{L("Send counter offer", "إرسال العرض المضاد")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
