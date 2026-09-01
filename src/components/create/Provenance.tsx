"use client";

/**
 * The canvas's marks and its field chrome, at the prototype's geometry.
 *
 * Two marks that look similar and mean opposite things, so they are defined together to keep them
 * from drifting into each other:
 *
 *  - **the provenance note** — this value was chosen FOR you. Amber, informational, never blocks.
 *  - **the required dot** — this value is still YOURS to choose, and nothing advances until it is.
 *
 * **Placement is load-bearing.** The prototype puts the provenance note UNDER the control and the
 * required dot inline after the label, as an 8px `●`. Putting the note in the label instead — which
 * is what the first cut did — makes every marked label wrap onto two lines, so a card with six
 * marked fields reads as noise and the labels stop being scannable. The note belongs with the value
 * it describes, not with the name of the field.
 */

import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { isSystemChosen, type FieldSource } from "@/lib/contract";

/**
 * ~~The amber "AI selected" / "Default" line under a system-chosen control.~~
 *
 * Removed (owner, 2026-09-01): **the orange highlight is enough to say a value was chosen for you.**
 * The ring and the line said the same thing twice, and the line said it in a sentence — so a card
 * with five prefilled fields carried five amber captions, and the marker that was meant to be quiet
 * became the loudest thing on the panel.
 *
 * The distinction the line drew — agent-read versus site-default — was never one a renter could act
 * on differently: either way he checks the value and changes it or leaves it. `FieldSource` still
 * carries it for the code that does care (the ring, and what gets sent), and it is one import away if
 * it is ever wanted back.
 */

/** The blocking dot — the prototype's 8px amber bullet, inline after the label. */
export function RequiredDot({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span aria-hidden className="text-label leading-none text-brand">
      ●
    </span>
  );
}

/**
 * A labelled canvas control at the prototype's field metrics: a 10px uppercase label with 0.05em
 * tracking and an 8px gap to the control, then the provenance note below.
 */
export function CanvasField({
  label,
  source = "empty",
  missing = false,
  shake = false,
  optional = false,
  icon,
  hint,
  children,
}: {
  label: ReactNode;
  source?: FieldSource;
  /** True when this field is an unmet requirement — draws the dot and counts toward the pill. */
  missing?: boolean;
  /** True for the duration of a refused move. */
  shake?: boolean;
  optional?: boolean;
  icon?: ReactNode;
  /** A quiet line under the control — the prototype's "KSA STANDARD", "Suppliers quote you a …". */
  hint?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className={`min-w-0 ${shake ? "shake-error" : ""}`}>
      <div
        className={`mb-2 flex items-center gap-1.5 text-label font-semibold uppercase leading-tight tracking-[0.05em] ${
          missing ? "text-brand" : "text-muted"
        }`}
      >
        {icon}
        <span>{label}</span>
        {optional && <span className="font-normal normal-case tracking-normal text-muted/70">{t.create.machineCard.notesOptional}</span>}
        <RequiredDot show={missing} />
      </div>
      {/**
        * The amber highlight wraps the CONTROL, not the whole field.
        *
        * The prototype tints an entire card amber, which reads as "this group is special" and, being a
        * box with its own padding, pushed the delivery leg's chips a few pixels below the other two —
        * three choices that should sit on one line did not. Ringing just the options keeps the marker
        * on the thing it describes and leaves every leg on the same baseline.
        */}
      <div
        className={isSystemChosen(source) ? "rounded-sm bg-warn/[0.07] ring-1 ring-warn/45 ring-offset-2 ring-offset-surface2" : undefined}
      >
        {children}
      </div>
      {hint && <p className="mt-1.5 text-label leading-snug text-muted">{hint}</p>}
    </div>
  );
}

/**
 * The prototype's `pillFull` — a full-width choice inside a grid, navy when chosen.
 *
 * Not the shared `Pchips`: those are rounded-full amber chips that wrap, which is what made the
 * two-way choices stack vertically and lose the side-by-side reading the prototype relies on.
 */
export function ChoiceRow<T extends string>({
  value,
  options,
  onChange,
  columns = 2,
}: {
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  columns?: number;
}) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            /** Wraps rather than truncating: a choice whose label is cut off has lost its meaning. */
            className={`rounded-sm border px-1.5 py-2 text-center text-body leading-tight transition ${
              on ? "border-navy bg-navy font-semibold text-white" : "border-border bg-surface font-semibold text-navy-mid"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** The prototype's `pill` — an inline-width chip for multi-selects (attachments, certificates). */
export function ChoiceChips<T extends string>({
  values,
  options,
  onToggle,
}: {
  values: T[];
  options: { value: T; label: string }[];
  onToggle: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((o) => {
        const on = values.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            className={`rounded-sm border px-4 py-2 text-body transition ${
              on ? "border-navy bg-navy font-semibold text-white" : "border-border bg-surface font-semibold text-navy-mid"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** The green/amber dot on a panel header — green once that panel has no gaps left (MREQ-AC-13). */
export function PanelDot({ complete }: { complete: boolean }) {
  return <span aria-hidden className={`inline-block h-2 w-2 flex-none rounded-full ${complete ? "bg-ok" : "bg-brand"}`} />;
}
