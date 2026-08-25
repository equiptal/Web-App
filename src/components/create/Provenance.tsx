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

/** The sparkle the prototype puts beside an agent-chosen value. 11px, amber, decorative. */
function Sparkle() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="#f5871f" className="flex-none" aria-hidden>
      <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" />
    </svg>
  );
}

/**
 * The amber "AI selected" / "Default" line, rendered beneath its control.
 *
 * Renders nothing for a renter-set field: once someone has answered a question it stops being ours,
 * and a note saying so on every control the renter has touched is just clutter.
 */
export function ProvenanceNote({ source }: { source: FieldSource }) {
  const t = useT();
  if (!isSystemChosen(source)) return null;
  /**
   * One label for both sources. From the renter's side "the agent read this from your words" and "we
   * filled this in for you" are the same fact — nobody asked them — and splitting the wording made
   * them look like two different states worth telling apart. The sparkle carries it either way.
   */
  return (
    <div className="mt-1.5 flex items-center gap-1">
      <Sparkle />
      <span className="whitespace-nowrap text-[10px] font-bold text-warn">{t.create.provenance.agent}</span>
    </div>
  );
}

/** The blocking dot — the prototype's 8px amber bullet, inline after the label. */
export function RequiredDot({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span aria-hidden className="text-[8px] leading-none text-brand">
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
        className={`mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase leading-tight tracking-[0.05em] ${
          missing ? "text-brand" : isSystemChosen(source) ? "text-[#c9660f]" : "text-muted"
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
        className={isSystemChosen(source) ? "rounded-[10px] bg-warn/[0.07] ring-1 ring-warn/45 ring-offset-2 ring-offset-surface2" : undefined}
      >
        {children}
      </div>
      {hint && <p className="mt-1.5 text-[11.5px] leading-snug text-muted">{hint}</p>}
      <ProvenanceNote source={source} />
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
            className={`rounded-lg border px-1.5 py-2 text-center text-[13px] leading-tight transition ${
              on ? "border-navy bg-navy font-bold text-white shadow-[0_0_0_2px_#dbe6f1]" : "border-border bg-surface font-semibold text-navy-mid"
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
            className={`rounded-lg border px-4 py-2 text-[13px] transition ${
              on ? "border-navy bg-navy font-bold text-white shadow-[0_0_0_2px_#dbe6f1]" : "border-border bg-surface font-semibold text-navy-mid"
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
