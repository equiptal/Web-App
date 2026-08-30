"use client";

/**
 * Deleting a project — and refusing to offer it (W-T12 · spec §12, PROJ-AC-24).
 *
 * **A project with anything filed under it is never shown a delete button.** Not a disabled one, not
 * one behind a typed confirmation: none at all. The renter is shown what is on the site instead.
 *
 * That is not caution for its own sake. A site holds requests suppliers have bid on, work orders
 * recording machines that are physically standing there, and the purchase orders against them.
 * There is no version of "delete this" that a renter means when they have all that filed — what
 * they actually mean is one of three other things, and the panel names all three:
 *
 *  - the job is finished       → nothing to do; a site reads *ended* on its own once its last date
 *                                passes, which is why there is no archive either
 *  - one row is in the wrong   → *Remove from the project*, on that row
 *    place
 *  - it was made by mistake    → empty it first, and the delete appears
 *
 * A disabled button with a tooltip would have been cheaper and would teach the renter nothing: they
 * would keep pressing it, and keep being told no.
 */

import { useT } from "@/lib/i18n";
import { Icon, Button } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import { projectTitle, type ProjectSummary } from "@/lib/contract/project";

/** Empty means nothing is filed AND nothing is awarded — an award can outlive the row it hung on. */
export function projectIsEmpty(p: Pick<ProjectSummary, "requestCount" | "workOrderCount" | "unitsAwarded">): boolean {
  return p.requestCount === 0 && p.workOrderCount === 0 && p.unitsAwarded === 0;
}

export function ProjectDelete({
  project,
  open,
  onClose,
  onDelete,
  busy,
}: {
  project: ProjectSummary;
  open: boolean;
  onClose: () => void;
  onDelete: () => void;
  busy?: boolean;
}) {
  const t = useT();
  const d = t.projects.del;
  const empty = projectIsEmpty(project);
  const name = projectTitle(project);

  return (
    <Dialog open={open} onClose={onClose} title={empty ? d.confirmTitle : d.busyTitle}>
      {empty ? (
        <div className="flex flex-col gap-4">
          <p className="text-body text-navy">{d.confirmBody.replace("{name}", name)}</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {t.common.cancel}
            </Button>
            <Button variant="danger" onClick={onDelete} disabled={busy}>
              {d.confirmAction}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-body text-navy">{d.busyBody.replace("{name}", name)}</p>

          <ul className="flex flex-col gap-1 rounded-sm border border-border bg-surface2/50 px-3 py-2.5 text-body text-navy">
            {project.requestCount > 0 && (
              <li className="flex items-center gap-2">
                <Icon name="campaign" size={14} className="flex-none text-muted" />
                {d.countRequests.replace("{n}", String(project.requestCount))}
              </li>
            )}
            {project.workOrderCount > 0 && (
              <li className="flex items-center gap-2">
                <Icon name="handyman" size={14} className="flex-none text-muted" />
                {d.countWorkOrders.replace("{n}", String(project.workOrderCount))}
              </li>
            )}
            {project.unitsAwarded > 0 && (
              <li className="flex items-center gap-2">
                <Icon name="local_shipping" size={14} className="flex-none text-muted" />
                {d.countUnits.replace("{n}", String(project.unitsAwarded))}
              </li>
            )}
          </ul>

          {/* The three things they might actually have meant. */}
          <div className="flex flex-col gap-2 text-body text-navy-mid">
            <p>
              <b className="font-semibold text-navy">{d.finishedLead}</b> {d.finished}
            </p>
            <p>
              <b className="font-semibold text-navy">{d.wrongPlaceLead}</b> {d.wrongPlace}
            </p>
            <p>
              <b className="font-semibold text-navy">{d.mistakeLead}</b> {d.mistake}
            </p>
          </div>

          <div className="flex justify-end">
            {/* One way out, and it is not destructive. */}
            <Button variant="secondary" onClick={onClose}>
              {t.common.close}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/* ----------------------------- After creating one ----------------------------- */

/**
 * *Project created* — and immediately, what goes on it.
 *
 * An empty project does nothing for anybody, and the two ways to fill one both live somewhere the
 * renter has not been yet: *Add work order* is on a board they have never opened, and posting a
 * request means leaving this page entirely. Asking here is the difference between a feature they
 * used once and a site they actually run their job from.
 *
 * Both routes are offered flat, with what each one means. The work order is named as private in the
 * choice itself, because "work order" tells a renter nothing and the fear it raises — *does this
 * get sent to suppliers?* — is exactly the one that stops them using it.
 */
export function ProjectCreated({
  project,
  open,
  onClose,
  onAddWorkOrder,
  onPostRequest,
}: {
  project: ProjectSummary;
  open: boolean;
  onClose: () => void;
  onAddWorkOrder: () => void;
  onPostRequest: () => void;
}) {
  const t = useT();
  const c = t.projects.created;

  return (
    <Dialog open={open} onClose={onClose} title={c.title.replace("{name}", projectTitle(project))} subtitle={c.sub}>
      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onAddWorkOrder}
          className="flex items-start gap-3 rounded-sm border border-border bg-surface px-3.5 py-3 text-start transition hover:border-brand"
        >
          <Icon name="handyman" size={18} className="mt-0.5 flex-none text-brand" />
          <span className="min-w-0">
            <span className="block text-body font-semibold text-navy">{c.workOrder}</span>
            <span className="block text-meta text-muted">{c.workOrderSub}</span>
          </span>
        </button>

        <button
          type="button"
          onClick={onPostRequest}
          className="flex items-start gap-3 rounded-sm border border-border bg-surface px-3.5 py-3 text-start transition hover:border-brand"
        >
          <Icon name="campaign" size={18} className="mt-0.5 flex-none text-brand" />
          <span className="min-w-0">
            <span className="block text-body font-semibold text-navy">{c.request}</span>
            <span className="block text-meta text-muted">{c.requestSub}</span>
          </span>
        </button>

        {/* Leaving is a real answer. A renter setting up three sites before posting anything is not
            doing it wrong, and a modal with no way past it would make them think they were. */}
        <button type="button" onClick={onClose} className="self-end pt-1 text-meta font-semibold text-muted underline underline-offset-2">
          {c.later}
        </button>
      </div>
    </Dialog>
  );
}
