"use client";

/**
 * **The request's equipment, as tabs** (owner, 2026-09-09).
 *
 * *"If there is multi itme in the request i will show each equipment type with size here as tabs
 * below 16 inside the machine and operator with same style as this, with + at first card and it adds
 * an equipment."*
 *
 * ── What it replaces ────────────────────────────────────────────────────────────────────────────
 * Moving between equipment was a CHAIN: «Next equipment» at the foot, «Previous equipment» beside
 * it, and a modal in between explaining what carried over. On a five-item request the renter could
 * only see where he was («Equipment #2 of 5») and never what the others were, so choosing which one
 * to go and fix meant walking the chain and reading each card. The tabs are the whole request on one
 * row: `type · size` per item, the current one raised, and the way to add another at the head of it.
 *
 * The chain itself is NOT removed — «Next equipment» is still the way FORWARD through a request the
 * renter is answering for the first time, and it is the control that refuses when this equipment is
 * unfinished. The tabs are for going back to one he has already passed.
 *
 * ── The style is the workspace's tab strip ──────────────────────────────────────────────────────
 * Same recipe as «Cards / Compare» (`RequestsWorkspace`): `control-lg`, `rounded-t-md`, a `-mb-px`
 * that lets the active tab eat the rule under it, white and navy when open, `surface3/70` and muted
 * when resting. Copied as a recipe rather than shared as a component: this strip's items are DATA
 * (one per equipment, a variable number, one of them an add control) and that one's are two fixed
 * views — a component covering both would take a props object saying which of the two it is.
 *
 * ── The + is a real add, and it refuses like every other add on this canvas ─────────────────────
 * `onAdd` is the canvas's own `addMachine`, so an unfinished equipment shakes rather than being left
 * half-answered behind a new blank card. It is FIRST in the row, where the owner asked for it.
 */

import { Icon } from "@/components/ui";
import { cx } from "@/lib/ds";
import { useT } from "@/lib/i18n";
import { pin } from "@/lib/uiPins";

export interface EquipmentTab {
  id: string;
  /** `type · size`, already localised by the canvas from the taxonomy. */
  label: string;
  /** Whether everything this equipment owes has been answered — the dot, as on the panel headers. */
  complete: boolean;
}

export function EquipmentTabs({
  tabs,
  activeId,
  onPick,
  onAdd,
}: {
  tabs: readonly EquipmentTab[];
  activeId: string | null;
  onPick: (id: string) => void;
  /** Absent → no + card. The canvas withholds it while this equipment is unanswered. */
  onAdd?: () => void;
}) {
  const t = useT();
  return (
    <div
      {...pin("equipment-tabs")}
      className="-mb-px flex items-end gap-1.5 overflow-x-auto overflow-y-clip border-b border-border pb-0"
      role="tablist"
      aria-label={t.create.equipmentTabs.label}
    >
      {/* The + FIRST (owner's word), and as a tab-shaped card rather than a button in the row: it is
          one more thing in the same strip, not a control floating beside it. */}
      {onAdd && (
        <button
          {...pin("equipment-tabs-add")}
          type="button"
          onClick={onAdd}
          title={t.create.addAnother}
          aria-label={t.create.addAnother}
          className="control-lg relative z-[1] -mb-px inline-flex flex-none items-center justify-center gap-1 rounded-t-md border border-border bg-surface3/70 px-3 text-meta font-semibold text-brand-press transition-colors hover:bg-brand-soft"
        >
          <Icon name="add" size={16} />
        </button>
      )}
      {tabs.map((tab) => {
        const on = tab.id === activeId;
        return (
          <button
            key={tab.id}
            {...pin("equipment-tab")}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onPick(tab.id)}
            className={cx(
              "control-lg relative -mb-px inline-flex max-w-[240px] flex-none items-center gap-2 rounded-t-md border border-border px-3.5 text-meta font-semibold transition-colors",
              on
                ? "z-[2] border-b-surface bg-surface text-navy"
                : "z-[1] bg-surface3/70 text-muted hover:text-navy-mid",
            )}
          >
            {/* Answered or not, at a glance — the same reading the panel headers give, so the strip
                says which equipment still owes something without opening any of them. */}
            <span
              aria-hidden="true"
              className={cx("h-1.5 w-1.5 flex-none rounded-full", tab.complete ? "bg-ok" : "bg-warn")}
            />
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
