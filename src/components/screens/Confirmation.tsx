"use client";

import { useT, fmt } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Button, Icon } from "@/components/ui";
import { postableItems } from "@/lib/contract";

/** AC-42: web confirmation; renter stays on web (no bid-tracking surface). Matches the prototype. */
export function Confirmation() {
  const t = useT();
  const { state, actions } = useRfq();
  const draft = state.draft;
  const count = draft ? postableItems(draft.items).length : 0;
  const loc = draft?.project.location.label;
  const start = draft?.project.timing.startDate;
  const summary = [fmt(t.confirmation.itemsSummary, { count }), loc, start].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-xl px-5 pb-2 pt-10 text-center">
      <div className="mb-[18px] inline-flex h-[72px] w-[72px] items-center justify-center rounded-full bg-ok-soft">
        <Icon name="check" size={40} className="text-ok" />
      </div>
      <h2 className="text-[24px] font-extrabold tracking-tight">{t.confirmation.title}</h2>
      <p className="mx-auto mb-5 mt-2 max-w-[440px] text-sm text-muted">{t.confirmation.message}</p>

      <div className="inline-flex items-center gap-2.5 rounded-[10px] border border-border bg-surface px-[18px] py-[11px] text-[13.5px] font-bold">
        <Icon name="inventory_2" size={19} className="text-navy-mid" />
        {summary}
        {state.requestIds.length > 0 && <span className="text-muted">· {state.requestIds.join(", ")}</span>}
      </div>

      <div className="mt-[26px] flex justify-center gap-2.5">
        <Button onClick={() => actions.reset()}>
          <Icon name="add" size={18} /> {t.confirmation.newRequest}
        </Button>
        <Button variant="secondary" onClick={() => actions.reset()}>
          {t.confirmation.done}
        </Button>
      </div>

      {/* "viewing/tracking on web is out of scope — later epic" (brief Non-goals). */}
      <div className="mx-auto mt-[22px] flex max-w-[520px] items-start gap-2.5 rounded-[10px] border border-border bg-surface px-3.5 py-[11px] text-left text-xs text-muted">
        <Icon name="info" size={16} className="flex-none text-muted" />
        <span>{t.confirmation.laterNote}</span>
      </div>
    </div>
  );
}
