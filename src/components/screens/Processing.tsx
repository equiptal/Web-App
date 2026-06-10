"use client";

import { useEffect, useState } from "react";
import { useT, fmt } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Button, Card, Badge } from "@/components/ui";

export function Processing() {
  const t = useT();
  const { state, actions } = useRfq();
  const { busy, error, draft } = state;

  // AC-04: items populate progressively as they're parsed. We reveal the drafted rows over time
  // once the draft arrives, to mirror progressive parsing.
  const [revealed, setRevealed] = useState(0);
  const itemCount = draft?.items.length ?? 0;

  useEffect(() => {
    if (busy || error || !draft) return;
    setRevealed(0);
    const id = setInterval(() => {
      setRevealed((n) => {
        if (n >= itemCount) {
          clearInterval(id);
          return n;
        }
        return n + 1;
      });
    }, 180);
    return () => clearInterval(id);
  }, [busy, error, draft, itemCount]);

  if (error) {
    const isEmpty = error === "empty"; // AC-09 vs AC-10
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

  if (busy || !draft) {
    return (
      <div className="mx-auto max-w-xl py-12 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand" />
        <h2 className="mt-4 text-base font-semibold">{t.processing.title}</h2>
        <p className="mt-1 text-sm text-muted">{t.processing.note}</p>
      </div>
    );
  }

  const s = draft.summary;
  const done = revealed >= itemCount;

  return (
    <div className="mx-auto max-w-xl py-8">
      <h2 className="text-base font-semibold">{t.processing.title}</h2>
      <p className="mt-1 text-sm text-muted">{t.processing.note}</p>

      {/* AC-56: processing summary counts. */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge tone="brand">{fmt(t.processing.summaryItems, { count: s.totalItems })}</Badge>
        {s.needsValidation > 0 && <Badge tone="warn">{fmt(t.processing.summaryNeedCheck, { count: s.needsValidation })}</Badge>}
        {s.notAvailable > 0 && <Badge tone="danger">{fmt(t.processing.summaryNotAvailable, { count: s.notAvailable })}</Badge>}
      </div>

      <ul className="mt-4 space-y-1">
        {draft.items.slice(0, revealed).map((i) => (
          <li key={i.id} className="rounded-md bg-surface px-3 py-2 text-sm shadow-sm">
            {i.rawLabel ?? i.id}
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <Button disabled={!done} onClick={() => actions.enterWizard()}>
          {t.common.next}
        </Button>
      </div>
    </div>
  );
}
