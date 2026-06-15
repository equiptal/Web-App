"use client";

import { useEffect, useState } from "react";
import { useT, fmt } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Button, Card, Badge, Icon } from "@/components/ui";

export function Processing() {
  const t = useT();
  const { state, actions } = useRfq();
  const { busy, error, draft } = state;

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

  /* ----------------------------- Error (AC-09 / AC-10) ----------------------------- */
  if (error) {
    const isEmpty = error === "empty";
    return (
      <div className="mx-auto max-w-xl py-8">
        <Card tone={isEmpty ? "warn" : "danger"}>
          <h2 className="text-base font-semibold">{isEmpty ? t.errors.emptyTitle : t.errors.networkTitle}</h2>
          <p className="mt-1 text-sm text-muted">{isEmpty ? t.errors.emptyBody : t.errors.networkBody}</p>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => actions.process()}>{t.common.retry}</Button>
            <Button variant="secondary" onClick={() => actions.goIntake()}>
              {t.errors.switchManual}
            </Button>
          </div>
        </Card>
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
