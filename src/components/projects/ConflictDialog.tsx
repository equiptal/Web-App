"use client";

/**
 * *Differs from the project* — what differs, and what to do about it (W-T20 · spec §11.2).
 *
 * ── A difference is shown, never resolved ────────────────────────────────────────────────────────
 *
 * A work order that runs three months past the site's end is not a mistake: the crane is there
 * longer, and that is the fact. So this dialog opens from a chip the renter chooses to press, lists
 * only what actually differs, and offers *keep it different* as a first-class answer rather than a
 * way out of a warning.
 *
 * ── A work order can only ever conflict on TIME ──────────────────────────────────────────────────
 *
 * Its location is the site's — there is no control anywhere that could give it another — so the only
 * thing it can disagree about is when it runs. A request can differ on both, because a renter can
 * state a place in their own words that the site does not match.
 *
 * ── *Match the project* runs the ordinary edit rule ──────────────────────────────────────────────
 *
 * It is an edit like any other, so it obeys the same rule the drawer's Edit button does: free with
 * no bids, spends the one post-bid edit once bids have landed, refused once that is spent. When it
 * cannot run it is **disabled with the reason**, not hidden — a renter who cannot see the option
 * goes looking for it.
 */

import { useT } from "@/lib/i18n";
import { Button, Icon } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import type { PropagationState } from "@/lib/contract/project";

/** One field that differs: what it is, what the site says, what this row says. */
export interface ConflictField {
  key: string;
  label: string;
  project: string;
  row: string;
}

export function ConflictDialog({
  open,
  onClose,
  /** The row's own name, for the two column headers. */
  rowLabel,
  projectLabel,
  fields,
  /** From `propagationForRequest` — decides whether *Match the project* can run. */
  state,
  onMatch,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  rowLabel: string;
  projectLabel: string;
  fields: ConflictField[];
  state: PropagationState;
  onMatch: () => void;
  busy?: boolean;
}) {
  const t = useT();
  const c = t.projects.conflict;

  const blocked = state === "edit_used" || state === "closed";
  const costs = state === "costs_the_edit";
  const why = state === "edit_used" ? c.editUsed : state === "closed" ? c.closed : null;

  return (
    <Dialog open={open} onClose={onClose} title={c.title}>
      <div className="flex flex-col gap-4">
        <p className="text-body text-navy-mid">{c.intro}</p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[380px] border-collapse text-body">
            <thead>
              <tr className="text-label font-semibold uppercase tracking-[.03em] text-muted">
                <th className="border-b border-border px-2 py-1.5 text-start" />
                <th className="border-b border-border px-2 py-1.5 text-start">{projectLabel}</th>
                <th className="border-b border-border px-2 py-1.5 text-start">{rowLabel}</th>
              </tr>
            </thead>
            <tbody>
              {/* Only what differs. Listing every field would bury the one that does. */}
              {fields.map((f) => (
                <tr key={f.key}>
                  <td className="border-b border-border px-2 py-2 text-muted">{f.label}</td>
                  <td className="border-b border-border px-2 py-2 tabular-nums text-navy-mid">{f.project}</td>
                  <td className="border-b border-border px-2 py-2 font-semibold tabular-nums text-navy">{f.row}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {costs && (
          <p className="flex items-start gap-2 rounded-sm border border-warn/40 bg-warn/5 px-3 py-2 text-meta text-navy">
            <Icon name="warning" size={14} className="mt-px flex-none text-warn" />
            {c.costsTheEdit}
          </p>
        )}

        {why && (
          // Disabled with the reason, never hidden.
          <p className="flex items-start gap-2 rounded-sm border border-border bg-surface2/50 px-3 py-2 text-meta text-navy-mid">
            <Icon name="info" size={14} className="mt-px flex-none text-muted" />
            {why}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
          {/* First, and not the quiet one: keeping the difference is usually the right answer. */}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {c.keepDifferent}
          </Button>
          <Button onClick={onMatch} disabled={blocked || busy}>
            {c.matchProject}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/* ----------------------------- Which fields differ ----------------------------- */

/**
 * The period fields a row states differently from its site.
 *
 * `null` on a row's field means *inherit*, not *unset*, so a null never counts as a difference — that
 * distinction is the entire reason these are separate values rather than one blob.
 */
export function periodConflicts(
  row: { startDate: string | null; endDate: string | null } | null,
  project: { startDate: string | null; endDate: string | null },
  labels: { start: string; end: string },
): ConflictField[] {
  if (!row) return [];
  const out: ConflictField[] = [];
  if (row.startDate != null && row.startDate !== project.startDate) {
    out.push({ key: "startDate", label: labels.start, project: project.startDate ?? "—", row: row.startDate });
  }
  if (row.endDate != null && row.endDate !== project.endDate) {
    out.push({ key: "endDate", label: labels.end, project: project.endDate ?? "—", row: row.endDate });
  }
  return out;
}
