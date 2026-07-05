"use client";

import { useEffect, useState } from "react";
import { useT, fmt } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Button, Badge, Icon } from "@/components/ui";

export function Processing() {
  const t = useT();
  const { state, actions } = useRfq();
  const { busy, error, draft, errorDetail } = state;

  const stages = [t.processing.stage1, t.processing.stage2, t.processing.stage3, t.processing.stage4];

  // Walk the 4 stages while parsing (the real call is async; this paces the loader, AC-04).
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!busy) return;
    setStage(0);
    const id = setInterval(() => setStage((n) => Math.min(n + 1, stages.length - 1)), 2200);
    return () => clearInterval(id);
  }, [busy, stages.length]);

  // Auto-advance to the wizard once parsing completes — no manual "Next" (brief pause to show counts).
  const done = !busy && !!draft && !error;
  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => actions.enterWizard(), 1400);
    return () => clearTimeout(id);
  }, [done, actions]);

  /* ----------------------------- Error (AC-09 / AC-10) — clear modal ----------------------------- */
  if (error) {
    const isEmpty = error === "empty";
    // Distinguish the agent's real failure (forwarded from Mansour) from a plain connection drop, so the
    // reason is clear: 429 = busy/rate-limited, 402/403 = unavailable (usage/credits/auth).
    const bs = errorDetail?.backendStatus;
    const agentBusy = bs === 429;
    const agentDown = bs === 402 || bs === 403;
    const title = isEmpty ? t.errors.emptyTitle : agentBusy ? t.errors.busyTitle : agentDown ? t.errors.unavailableTitle : t.errors.networkTitle;
    const body = isEmpty ? t.errors.emptyBody : agentBusy ? t.errors.busyBody : agentDown ? t.errors.unavailableBody : t.errors.networkBody;
    const icon = isEmpty ? "search_off" : agentBusy ? "hourglass_empty" : agentDown ? "cloud_off" : "wifi_off";
    return (
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-navy/45 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="proc-err-title"
        onClick={(e) => { if (e.target === e.currentTarget) actions.goIntake(); }}
      >
        <div className="relative w-full max-w-sm rounded-2xl bg-surface p-7 text-center shadow-[0_24px_60px_rgba(16,32,58,.35)]">
          <button
            onClick={() => actions.goIntake()}
            aria-label={t.common.close}
            className="absolute end-3 top-3 grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface3 hover:text-navy"
          >
            <Icon name="close" size={18} />
          </button>
          <div className={`mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full ${isEmpty || agentBusy ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger"}`}>
            <Icon name={icon} size={34} />
          </div>
          <h2 id="proc-err-title" className="text-[19px] font-extrabold tracking-tight text-navy">{title}</h2>
          <p className="mx-auto mt-2 max-w-[300px] text-[14px] leading-relaxed text-muted">{body}</p>
          {errorDetail?.detail && (
            <p className="mx-auto mt-3 max-w-[320px] break-words rounded-lg bg-surface3 px-3 py-2 text-start font-mono text-[11.5px] leading-snug text-muted">{errorDetail.detail}</p>
          )}
          <Button className="mt-6 w-full py-3 text-[15px]" onClick={() => actions.process()}>
            <Icon name="refresh" size={19} /> {t.common.retry}
          </Button>
        </div>
      </div>
    );
  }

  // Once the result is in, mark everything complete.
  const effectiveStage = done ? stages.length : stage;
  const barPct = done ? 100 : Math.round(((stage + 1) / stages.length) * 100);

  return (
    <div className="mx-auto mt-9 max-w-[460px] text-center">
      {/* loadicon: the AI agent glyph (our agent mark) + spinning ring; check when done */}
      <div className="relative mx-auto mb-[22px] grid h-[84px] w-[84px] place-items-center rounded-full border border-border bg-surface shadow-[0_6px_20px_rgba(28,53,80,.06)]">
        {!done && <span className="absolute -inset-px rounded-full border-[3px] border-transparent border-r-brand border-t-brand motion-safe:animate-spin" />}
        <Icon name={done ? "task_alt" : "smart_toy"} size={34} className={done ? "text-ok" : "text-warn"} />
      </div>

      <h2 className="text-[21px] font-extrabold tracking-tight">{t.processing.title}</h2>
      <p className="mb-[26px] mt-1.5 text-[13.5px] text-muted">{t.processing.sub}</p>

      {/* stages */}
      <div className="mx-auto mb-6 flex max-w-full sm:max-w-[330px] flex-col gap-[13px] text-start">
        {stages.map((label, i) => {
          const s = i < effectiveStage ? "done" : i === effectiveStage ? "active" : "todo";
          return (
            <div key={i} className={`flex items-center gap-[11px] text-[13.5px] font-semibold ${s === "todo" ? "text-muted/50" : s === "active" ? "text-navy" : "text-navy-mid"}`}>
              <span
                className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-full text-[11px] font-extrabold ${
                  s === "done"
                    ? "bg-ok text-white"
                    : s === "active"
                      ? "border-2 border-brand border-t-transparent motion-safe:animate-spin"
                      : "border-2 border-border"
                }`}
              >
                {s === "done" ? "✓" : ""}
              </span>
              {label}
            </div>
          );
        })}
      </div>

      {/* progress bar */}
      <div className="mx-auto h-1.5 max-w-full sm:max-w-[330px] overflow-hidden rounded-full bg-surface3">
        <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${barPct}%` }} />
      </div>

      {/* When done: AC-56 summary counts + continue. */}
      {done && draft && (
        <div className="mt-7">
          <div className="flex flex-wrap justify-center gap-2">
            <Badge tone="brand">{fmt(t.processing.summaryItems, { count: draft.summary.totalItems })}</Badge>
            {draft.summary.needsValidation > 0 && <Badge tone="warn">{fmt(t.processing.summaryNeedCheck, { count: draft.summary.needsValidation })}</Badge>}
            {draft.summary.notAvailable > 0 && <Badge tone="danger">{fmt(t.processing.summaryNotAvailable, { count: draft.summary.notAvailable })}</Badge>}
          </div>
        </div>
      )}
    </div>
  );
}
