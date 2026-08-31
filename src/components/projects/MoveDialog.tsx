"use client";

/**
 * Filing a request under a site — or moving it (W-T18 · spec §11.3, PROJ-AC-54).
 *
 * ── It leads with the sites at this row's own address ────────────────────────────────────────────
 *
 * A renter with forty projects meeting a dropdown is being asked to run a search. A renter meeting
 * *the two sites at the address this request was posted to* — named, one click — is being offered a
 * decision. The request already carries the location it was posted with, so in almost every case the
 * right project is one of one, and the list below it is the exception rather than the interface.
 *
 * The match is a **string comparison in the browser**: the leading segment of each address,
 * case-insensitively. No model, no geocoding. A site label carries a postcode and a city a renter
 * would never type, so comparing whole strings would match nothing at all.
 *
 * ── When nothing matches, it says so ─────────────────────────────────────────────────────────────
 *
 * Dropping the renter into a bare select with no explanation reads as though the suggestion failed.
 * One line saying no site is at that address turns a blank space into an answer.
 *
 * ── Filing changes NOTHING, and the dialog says so ───────────────────────────────────────────────
 *
 * Not one value on the request moves, even where the new site says something different. That is why
 * it is allowed after bids and why it does not spend the renter's one post-bid edit — and a renter
 * who does not know that will not file a live request at all.
 */

import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { Button, Icon } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import { projectTitle, projectEnded, shortSite, endedLast, type ProjectSummary } from "@/lib/contract/project";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * The sites at this address.
 *
 * Exported because it is the whole idea of the dialog and is worth pinning in a test rather than
 * being a closure nobody can reach.
 */
export function sitesAt(projects: ProjectSummary[], address: string | null | undefined): ProjectSummary[] {
  const here = shortSite(address).trim().toLowerCase();
  if (!here) return [];
  return projects.filter((p) => shortSite(p.location.label).trim().toLowerCase() === here);
}

export function MoveDialog({
  open,
  onClose,
  projects,
  /** The address the request was posted with — what the suggestion is computed from. */
  address,
  /** The site it is filed under now; `null` when it is filed nowhere. */
  currentProjectId,
  /**
   * What the destructive half of this dialog does.
   *
   * A REQUEST is unfiled: it stays a request, keeps every value, and can be filed again. A WORK ORDER
   * is deleted — it exists nowhere but on the site it was made on, so removing it from the site
   * removes it. The same door, two very different second halves, and a renter must be told which one
   * they are standing in front of.
   */
  kind,
  onFile,
  /** Unfile a request, or delete a work order. Red either way. */
  onRemove,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  projects: ProjectSummary[];
  address: string | null | undefined;
  currentProjectId: string | null;
  /** Which kind of row this is — it decides what the destructive half does. */
  kind: "request" | "work_order";
  onFile: (projectId: string | null) => void;
  /** Unfile a request, or delete a work order. */
  onRemove: () => void;
  busy?: boolean;
}) {
  const t = useT();
  const m = t.projects.move;
  const [picked, setPicked] = useState("");

  const others = useMemo(() => projects.filter((p) => p.id !== currentProjectId), [projects, currentProjectId]);
  const suggested = useMemo(() => sitesAt(others, address), [others, address]);
  const rest = useMemo(
    () => endedLast(others.filter((p) => !suggested.some((s) => s.id === p.id)), today()),
    [others, suggested],
  );

  const unfiled = currentProjectId === null;
  const destroys = kind === "work_order";

  return (
    <Dialog open={open} onClose={onClose} title={unfiled ? m.fileTitle : m.moveTitle}>
      <div className="flex flex-col gap-4">
        {/* The reassurance belongs to a REQUEST only. A work order is not "just filed here" — this
            site is the only place it exists — so telling a renter nothing moves would be a comfort
            about the wrong thing. */}
        {!destroys && (
          <p className="flex items-start gap-2 rounded-sm border border-border bg-surface2/50 px-3 py-2 text-meta text-navy-mid">
            <Icon name="lock_open" size={14} className="mt-px flex-none text-muted" />
            {m.changesNothing}
          </p>
        )}

        {/* RED (owner, 2026-08-31). Moving drops the awards, and amber reads as *mind your step*
            where this needs to read as *you will lose something*. Told before they choose. */}
        {!unfiled && (
          <p className="flex items-start gap-2 rounded-sm border border-danger/40 bg-danger/5 px-3 py-2 text-meta text-navy">
            <Icon name="warning" size={14} className="mt-px flex-none text-danger" />
            {destroys ? m.movingDropsAwardsWorkOrder : m.movingDropsAwards}
          </p>
        )}

        {suggested.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h4 className="text-label font-semibold uppercase tracking-[.03em] text-muted">
              {m.atThisAddress.replace("{site}", shortSite(address) || "—")}
            </h4>
            {suggested.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy}
                onClick={() => onFile(p.id)}
                className="flex items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2.5 text-start transition hover:border-brand"
              >
                <Icon name="place" size={15} className="flex-none text-brand" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold text-navy">{projectTitle(p)}</span>
                  <span className="block truncate text-meta text-muted">
                    {t.projects.board.railCounts.replace("{r}", String(p.requestCount)).replace("{w}", String(p.workOrderCount))}
                  </span>
                </span>
                {projectEnded(p, today()) && <span className="flex-none text-meta text-muted">{t.projects.chips.ended}</span>}
              </button>
            ))}
          </section>
        ) : (
          // An answer, not a blank space.
          <p className="text-body text-muted">{m.noneHere.replace("{site}", shortSite(address) || "—")}</p>
        )}

        {rest.length > 0 && (
          <section className="flex flex-col gap-2">
            <h4 className="text-label font-semibold uppercase tracking-[.03em] text-muted">
              {suggested.length > 0 ? m.orAnother : m.chooseOne}
            </h4>
            <div className="flex gap-2">
              <select
                className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-body text-navy outline-none focus:border-brand"
                value={picked}
                onChange={(e) => setPicked(e.target.value)}
              >
                <option value="">—</option>
                {rest.map((p) => (
                  <option key={p.id} value={p.id}>
                    {/* Ended ones are labelled rather than hidden: a date passing is not proof a
                        site is finished, and a renter who extended verbally still needs it here. */}
                    {projectTitle(p)}
                    {projectEnded(p, today()) ? ` · ${t.projects.chips.ended}` : ""}
                  </option>
                ))}
              </select>
              <Button disabled={!picked || busy} onClick={() => onFile(picked)}>
                {unfiled ? m.file : m.move}
              </Button>
            </div>
          </section>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          {/* RED, and it says which of the two things it does (owner, 2026-08-31).
              Unfiling a request destroys nothing — it keeps every value and can be filed again — but
              it is still the one irreversible-looking act in this dialog, and a renter should not have
              to work out which half they are pressing. Deleting a work order genuinely destroys it,
              and that one says so outright. */}
          {!unfiled ? (
            <button
              type="button"
              disabled={busy}
              onClick={onRemove}
              className="me-auto flex items-center gap-1.5 text-meta font-semibold text-danger transition hover:underline"
            >
              <Icon name={destroys ? "delete" : "playlist_remove"} size={14} className="flex-none" />
              {destroys ? m.deleteWorkOrder : m.removeFromProject}
            </button>
          ) : (
            <span className="me-auto" />
          )}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t.common.cancel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
