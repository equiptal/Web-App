"use client";

/**
 * The canvas's two marks (MREQ-AC-11/57/58/61).
 *
 * They look similar and mean opposite things, so they are defined together to keep them from
 * drifting into each other:
 *
 *  - **{@link ProvenanceBadge}** — this value was chosen FOR you. Amber, informational, never blocks.
 *    It is the honest half of a form that pre-answers most of itself.
 *  - **{@link RequiredDot}** — this value is still YOURS to choose, and nothing advances until it is.
 *    Amber, blocking, and counted by the "N things need you" pill.
 *
 * A field can carry a badge or a dot, never both: a value that came from somewhere is not missing,
 * and a missing value came from nowhere. The two web-only gates (year, certificate) are the exception
 * that proves it — they show a dot despite holding an agent value, because there the question is
 * whether the renter ANSWERED, not whether a value exists.
 */

import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { isSystemChosen, type FieldSource } from "@/lib/contract";

/** The amber "AI selected" / "Default" chip. Renders nothing for a renter-set or empty field. */
export function ProvenanceBadge({ source, className = "" }: { source: FieldSource; className?: string }) {
  const t = useT();
  if (!isSystemChosen(source)) return null;
  const isAgent = source === "agent";
  return (
    <span
      className={`inline-flex flex-none items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-warn ${className}`}
      title={isAgent ? t.create.provenance.agent : t.create.provenance.default}
    >
      {isAgent && <Icon name="auto_awesome" size={11} className="flex-none" />}
      {isAgent ? t.create.provenance.agent : t.create.provenance.default}
    </span>
  );
}

/** The blocking dot. Present only while the field is a genuine, counted gap. */
export function RequiredDot({ show, className = "" }: { show: boolean; className?: string }) {
  if (!show) return null;
  return <span aria-hidden className={`inline-block h-[7px] w-[7px] flex-none rounded-full bg-brand ${className}`} />;
}

/**
 * A labelled canvas control.
 *
 * The amber ring tracks provenance and the shake tracks refusal, so a field can be simultaneously
 * "we filled this in" and "we just refused to move past it" without the two treatments fighting.
 */
export function CanvasField({
  label,
  source = "empty",
  missing = false,
  shake = false,
  optional = false,
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
  hint?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  const highlighted = isSystemChosen(source) && !missing;
  return (
    <div className={shake ? "shake-error" : undefined}>
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.05em] text-muted">
        <RequiredDot show={missing} />
        <span className={missing ? "text-brand" : highlighted ? "text-warn" : undefined}>{label}</span>
        {optional && <span className="font-normal normal-case tracking-normal text-muted/70">{t.create.machineCard.notesOptional}</span>}
        <ProvenanceBadge source={source} />
      </div>
      <div className={highlighted ? "rounded-[10px] ring-1 ring-warn/45" : undefined}>{children}</div>
      {hint && <p className="mt-1.5 text-[11.5px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}

/** The green/amber dot on a panel header — green once that panel has no gaps left (MREQ-AC-13). */
export function PanelDot({ complete }: { complete: boolean }) {
  return <span aria-hidden className={`inline-block h-2 w-2 flex-none rounded-full ${complete ? "bg-ok" : "bg-brand"}`} />;
}
