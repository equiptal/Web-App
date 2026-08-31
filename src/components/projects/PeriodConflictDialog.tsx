"use client";

/**
 * "Three things here keep different dates. Change them too?"
 *
 * Shown only when saving a site would leave something under it saying something different — never
 * as a routine step (owner, 2026-08-31: *"edit the project by default, no need to mention its sub
 * children unless there is a conflict"*).
 *
 * ── Why this replaced a list of everything ───────────────────────────────────────────────────────
 *
 * The form used to show every request and work order on the site with tick boxes, on every edit.
 * That asked the renter to review a decision they mostly did not have: a work order with no period
 * of its own already follows the site, and a request whose dates already match is not in
 * disagreement with anything. Ticking it changed nothing, and the list still had to be read.
 *
 * ── The locked rows are told, not offered ────────────────────────────────────────────────────────
 *
 * A closed request, or one whose single post-bid edit is spent, cannot take the new dates. It is
 * listed anyway, with the reason, and with no control beside it. A renter who is not told will find
 * out weeks later from a supplier holding different dates to theirs — and a disabled tick box says
 * *no* without ever saying *why*.
 */

import { useT } from "@/lib/i18n";
import { Button, Icon } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import type { SiteConflict } from "@/lib/contract/project";

const dash = "—";

export function PeriodConflictDialog({
  open,
  conflicts,
  site,
  onKeep,
  onApply,
  onCancel,
  busy,
}: {
  open: boolean;
  conflicts: SiteConflict[];
  /** What the site is about to say — the thing everything below is being compared against. */
  site: { startDate: string | null; endDate: string | null };
  /** Save the site and leave every row as it is. */
  onKeep: () => void;
  /** Save the site and move the rows that can move. */
  onApply: (ids: string[]) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const t = useT();
  const c = t.projects.periodConflict;

  const movable = conflicts.filter((x) => x.editable);
  const locked = conflicts.filter((x) => !x.editable);

  const period = (s: string | null, e: string | null) => `${s ?? dash} → ${e ?? dash}`;

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={c.title.replace("{n}", String(conflicts.length))}
      subtitle={c.sub.replace("{period}", period(site.startDate, site.endDate))}
    >
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col divide-y divide-border rounded-sm border border-border">
          {conflicts.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <Icon
                name={x.kind === "work_order" ? "handyman" : "campaign"}
                size={14}
                className="flex-none text-muted"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-semibold text-navy">{x.ref}</span>
                <span className="block text-meta text-muted tabular-nums">{period(x.startDate, x.endDate)}</span>
              </span>

              {/* Told, not offered — see the note at the top. */}
              {!x.editable && (
                <span className="flex-none rounded-full bg-surface2 px-2 py-0.5 text-meta font-semibold text-muted">
                  {c.locked[x.reason as "edit_used" | "closed"] ?? c.locked.closed}
                </span>
              )}
            </li>
          ))}
        </ul>

        {locked.length > 0 && (
          <p className="flex items-start gap-2 rounded-sm border border-border bg-surface2/50 px-3 py-2 text-meta text-navy-mid">
            <Icon name="info" size={14} className="mt-px flex-none text-muted" />
            {c.lockedNote.replace("{n}", String(locked.length))}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {t.common.cancel}
          </Button>

          {/* Keeping them is the safe half and stays navy; the orange belongs to the one that
              changes things the renter is not currently looking at. */}
          <Button variant="tinted" onClick={onKeep} disabled={busy}>
            {c.keep}
          </Button>

          {movable.length > 0 && (
            <Button onClick={() => onApply(movable.map((x) => x.id))} disabled={busy}>
              {c.apply.replace("{n}", String(movable.length))}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
