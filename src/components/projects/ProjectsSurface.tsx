"use client";

/**
 * `/projects` — the list of sites, and the form for making or editing one (W-T10 · W-T11).
 *
 * Phase 1 is deliberately just this. The board with the chart is W-T13; until it lands, a renter can
 * create a site and edit its terms, which is what the intake chips need to be worth anything.
 */

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Icon, Button } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import { useRouter } from "next/navigation";
import {
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  fetchChart,
  saveAward,
  markAward,
  deleteAward,
  saveWorkOrder,
  deleteWorkOrder,
  fetchTaxonomy,
  fetchAllMyRequests,
  assignToProject,
  attachDocument,
  removeDocument,
  withFreshVersion,
  ProjectVersionConflict,
  ApiError,
  type AwardInput,
} from "@/lib/api/client";
import {
  propagationForRequest,
  propagationForWorkOrder,
  type ProjectSummary,
  type PropagationRow,
} from "@/lib/contract/project";
import { ProjectForm, emptyProjectForm, projectToForm, type ProjectFormValue } from "./ProjectForm";
import { ProjectDelete, ProjectCreated, projectIsEmpty } from "./ProjectDelete";
import { ProjectsBoard } from "./ProjectsBoard";
import type { Award, ChartGroup, ChartItem } from "@/lib/contract/award";
import { RowMenu } from "./RowMenu";
import { AwardDialog, UnawardConfirm } from "./AwardDialog";
import { WorkOrderForm, workOrderPayload, blankMachine, type WorkOrderDraft } from "./WorkOrderForm";
import { MoveDialog } from "./MoveDialog";
import { DocumentsDialog } from "./DocumentsDialog";
import { ConflictDialog, periodConflicts } from "./ConflictDialog";
import { projectTitle } from "@/lib/contract/project";
import { EMPTY_WHEN } from "@/lib/contract/work-order";
import type { Taxonomy } from "@/lib/contract/taxonomy";

/**
 * The section header, matching *My Requests* exactly (owner, 2026-08-30).
 *
 * A navy plate carrying the section's glyph, the title over its summary, the action on the trailing
 * edge — and NO bordered box, because the page already has enough bordered rectangles and the plate
 * is what the eye finds. Two sections in one column that announce themselves differently read as two
 * pages accidentally stacked.
 *
 * The action is the PRIMARY button, not a quiet one: on an empty dashboard it is the only thing to
 * do here, and a white button beside an orange one elsewhere on the page says this matters less.
 */
function SectionHeader({ count, onNew }: { count: number; onNew: () => void }) {
  const t = useT();
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-[38px] flex-none place-items-center rounded-sm bg-navy text-surface">
        <Icon name="place" size={22} />
      </span>
      <span className="min-w-0">
        <h2 className="text-title font-extrabold text-navy">{t.projects.surface.heading}</h2>
        <span className="mt-0.5 block text-meta text-muted">
          {count > 0 ? t.projects.surface.summary.replace("{n}", String(count)) : t.projects.surface.empty}
        </span>
      </span>
      <span className="flex-1" />
      <Button onClick={onNew}>
        <Icon name="add" size={16} /> {t.projects.surface.newProject}
      </Button>
    </div>
  );
}

export function ProjectsSurface({ embedded }: { embedded?: boolean } = {}) {
  const t = useT();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  /** `version` rides along on an EDIT: the backend requires the version the form was opened on. */
  const [editing, setEditing] = useState<{
    id: string | null;
    version?: number;
    value: ProjectFormValue;
    rows?: PropagationRow[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [chart, setChart] = useState<{ project: ProjectSummary; groups: ChartGroup[] } | null>(null);
  const [version, setVersion] = useState(1);
  const [awarding, setAwarding] = useState<{ group: ChartGroup; item: ChartItem } | null>(null);
  const [unawarding, setUnawarding] = useState<Award | null>(null);
  const [workOrder, setWorkOrder] = useState<WorkOrderDraft | null>(null);
  const [taxonomy, setTaxonomy] = useState<Taxonomy>([]);
  const [unassigned, setUnassigned] = useState<ChartGroup[]>([]);
  const [filing, setFiling] = useState<{ requestId: string; address: string | null; projectId: string | null } | null>(null);
  const [papers, setPapers] = useState<{ award: Award; isRequest: boolean } | null>(null);
  const [conflict, setConflict] = useState<ChartGroup | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [created, setCreated] = useState<ProjectSummary | null>(null);
  const router = useRouter();
  const { sessionKey, status } = useSession();

  /**
   * `null` = not answered yet OR not ours to show. `[]` = answered, and this renter has no sites.
   *
   * The two must not collapse into one. A guest gets 401 here, and treating that as "no projects
   * yet" puts a *Your projects · New project* row on a signed-out dashboard — a control that cannot
   * work, offered to someone who was never asked (PROJ-AC-28).
   */
  const reload = useCallback(async () => {
    try {
      setProjects(await listProjects());
    } catch (err) {
      const status = err instanceof ApiError ? err.status : undefined;
      setProjects(status === 401 || status === 403 ? null : []);
    }
  }, []);

  /**
   * Requests filed nowhere.
   *
   * Read from the renter's own request list rather than from a projects endpoint, because "filed
   * nowhere" is a fact about a request and there is no project to ask. They arrive shaped as chart
   * groups so the rail and the board treat them like any other row - Unassigned is a place in the
   * same page, not a second kind of screen.
   */
  const reloadUnassigned = useCallback(async () => {
    try {
      const { requests } = await fetchAllMyRequests();
      setUnassigned(
        requests
          .filter((r) => r.projectId == null)
          .map((r) => ({
            kind: "request" as const,
            id: r.id,
            ref: r.displayId,
            title: null,
            status: r.status,
            bidCount: r.bidCount,
            renteeEditUsed: r.renteeEditUsed,
            // No project means no inherited period, so no bar - which is why Unassigned has no chart.
            when: null,
            items: [
              {
                id: r.id,
                label: r.item?.name ?? r.displayId,
                labelAr: r.item?.nameAr ?? null,
                quantity: r.item?.qty ?? 1,
                awards: [],
              },
            ],
            // Carried so the file dialog can lead with the sites at this row's own address.
            address: r.city ?? null,
          })),
      );
    } catch {
      setUnassigned([]);
    }
  }, []);

  /* Re-read when the ACCOUNT changes, not only on mount (owner, 2026-08-30): this surface sits on the
     dashboard, and signing in through the modal never remounts the page — so the sites stayed the
     guest's empty set until a reload. `sessionKey` is the one signal for that across the dashboard;
     see its note in `lib/session`.

     The taxonomy is not per-account and is deliberately left in here anyway: it is fetched once per
     mount either way, and splitting it into its own effect to save a repeat that only happens on a
     sign-in is a second effect to keep in step for nothing. */
  useEffect(() => {
    if (status === "loading") return;
    void reload();
    // The catalogue is fetched once for the whole surface rather than when the form opens, so a
    // renter adding a machine does not wait on a network round trip before the first dropdown works.
    fetchTaxonomy().then(setTaxonomy).catch(() => setTaxonomy([]));
    void reloadUnassigned();
  }, [reload, reloadUnassigned, sessionKey, status]);

  // Land on a site rather than an empty right-hand pane. The first is the most recently touched,
  // which is almost always the one the renter came back for.
  useEffect(() => {
    if (selected === null && projects && projects.length > 0) setSelected(projects[0].id);
  }, [projects, selected]);

  useEffect(() => {
    if (!selected) {
      setChart(null);
      return;
    }
    let live = true;
    fetchChart(selected)
      .then((c) => {
        if (!live) return;
        setChart({ project: c.project, groups: c.groups });
        // The version travels with the chart, not with the project card: a card can be stale while
        // the chart was fetched a moment ago, and every award write sends this back.
        setVersion(c.version);
      })
      // A chart that will not load leaves the pane empty rather than half-drawn: a renter reading a
      // partial site cannot tell that is what they are looking at.
      .catch(() => live && setChart(null));
    return () => {
      live = false;
    };
  }, [selected]);

  /**
   * Opening the edit form loads what is filed under the site, because the propagation list is part
   * of the form rather than a step after it — the renter decides what the change reaches while they
   * are making it, not once it is already saved.
   */
  async function openEdit(p: ProjectSummary) {
    setEditing({ id: p.id, version: p.version, value: projectToForm(p), rows: [] });
    try {
      const chart = await fetchChart(p.id);
      const rows = chart.groups.map((g) =>
        g.kind === "request"
          ? propagationForRequest({
              id: g.id,
              ref: g.ref,
              status: g.status ?? "OPEN",
              bidCount: g.bidCount ?? 0,
              renteeEditUsed: g.renteeEditUsed ?? false,
            })
          : propagationForWorkOrder({ id: g.id, ref: g.title?.trim() || g.ref }),
      );
      setEditing((cur) => (cur && cur.id === p.id ? { ...cur, rows } : cur));
    } catch {
      // An empty list is the safe failure: the form still saves the project, and nothing propagates
      // silently to rows we could not read.
      setEditing((cur) => (cur && cur.id === p.id ? { ...cur, rows: [] } : cur));
    }
  }

  async function save(value: ProjectFormValue, applyTo: string[]) {
    if (!editing) return;
    setSaving(true);
    setNotice(null);
    try {
      if (editing.id) {
        await updateProject(editing.id, editing.version ?? 1, value, applyTo);
        setEditing(null);
        await reload();
      } else {
        // Straight into "what is on this site?" — an empty project does nothing for anybody, and
        // both ways to fill one live somewhere the renter has not been yet.
        const made = await createProject(value);
        setEditing(null);
        setCreated(made);
        await reload();
      }
    } catch (err) {
      // Someone else edited this site while the form was open. Say so plainly rather than
      // overwriting their change with a form that was filled in before it existed.
      if (err instanceof ProjectVersionConflict) {
        setNotice(t.projects.surface.stale);
      } else {
        // The code and status ride along. "That did not save" tells a renter nothing they can act
        // on and tells us nothing we can debug — and this is the first thing a new renter does, so
        // a failure here is the failure most likely to be reported and least likely to be
        // reproducible without it.
        const detail = err instanceof ApiError ? [err.backendCode, err.status].filter(Boolean).join(" · ") : "";
        setNotice(detail ? `${t.projects.surface.saveFailed} (${detail})` : t.projects.surface.saveFailed);
      }
    } finally {
      setSaving(false);
    }
  }

  async function file(projectId: string | null) {
    if (!filing) return;
    setSaving(true);
    try {
      await assignToProject(filing.requestId, projectId);
      setFiling(null);
      await Promise.all([reload(), reloadUnassigned(), selected ? refreshChart() : Promise.resolve()]);
      if (projectId) setSelected(projectId);
    } catch {
      setNotice(t.projects.surface.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  /** Re-read after any award write, so the chart and the version move together. */
  async function refreshChart() {
    if (!selected) return;
    const c = await fetchChart(selected);
    setChart({ project: c.project, groups: c.groups });
    setVersion(c.version);
    await reload();
  }

  async function award(lines: AwardInput[]) {
    if (!awarding || !selected) return;
    const parent =
      awarding.group.kind === "request"
        ? { requestId: awarding.group.id, workOrderItemId: null }
        : { requestId: null, workOrderItemId: awarding.item.id };
    setSaving(true);
    setNotice(null);
    try {
      // Sequential, and each call carries the version the previous one returned. A split is two
      // writes to the same blob; firing them together would make the second one stale by definition.
      let v = version;
      for (const line of lines) {
        const res = await saveAward(selected, v, { ...line, ...parent });
        v = res.version;
      }
      setAwarding(null);
      await refreshChart();
    } catch (err) {
      // NOT retried. Replaying a create after somebody else's write can promise the same units
      // twice, so the renter is told and re-reads instead.
      setNotice(err instanceof ProjectVersionConflict ? t.projects.surface.stale : t.projects.surface.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  /** Marks and un-awards land on the same result whatever order they arrive in, so these retry. */
  async function mark(awardId: string, which: "mobilizedAt" | "demobilizedAt", value: string | null) {
    if (!selected) return;
    try {
      await withFreshVersion(selected, version, (v) => markAward(selected, awardId, v, { [which]: value }));
      await refreshChart();
    } catch {
      setNotice(t.projects.surface.saveFailed);
    }
  }

  /**
   * A blank work order for this site, seeded with the site's own period.
   *
   * Seeded rather than empty because that is the whole point of a site holding defaults: a renter
   * who set 1 Sep – 31 Dec once should not retype it per machine. They can still change it here,
   * and the chart marks an order that ends up disagreeing with its site as having *own dates*.
   */
  function startWorkOrder(p: ProjectSummary) {
    setWorkOrder({
      title: "",
      when: {
        ...EMPTY_WHEN,
        rentalBasis: p.defaults.timing.rentalBasis,
        extendable: p.defaults.timing.extendable,
        startDate: p.defaults.timing.startDate,
        endDate: p.defaults.timing.endDate,
      },
      machines: [blankMachine()],
    });
  }

  async function saveOrder(d: WorkOrderDraft) {
    if (!selected) return;
    setSaving(true);
    setNotice(null);
    try {
      // `workOrderPayload` keeps each existing machine's id. Rebuilding the set without them
      // scrubs every award, mark and purchase order under the order.
      await saveWorkOrder(selected, version, workOrderPayload(d, { create: !d.groupId }));
      setWorkOrder(null);
      await refreshChart();
    } catch {
      setNotice(t.projects.surface.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function removeOrder(groupId: string) {
    setSaving(true);
    try {
      await deleteWorkOrder(groupId);
      await refreshChart();
    } catch {
      setNotice(t.projects.surface.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function attach(file: File, kind: string) {
    if (!selected || !papers) return;
    setSaving(true);
    try {
      await attachDocument(selected, papers.award.id, version, file, kind);
      await refreshChart();
      // Re-read the award so the list in the open dialog shows what was just added.
      setPapers((cur) => (cur ? { ...cur, award: findAward(cur.award.id) ?? cur.award } : cur));
    } catch {
      setNotice(t.projects.surface.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function detach(docId: string) {
    if (!selected || !papers) return;
    setSaving(true);
    try {
      await removeDocument(selected, papers.award.id, docId);
      await refreshChart();
      setPapers((cur) => (cur ? { ...cur, award: findAward(cur.award.id) ?? cur.award } : cur));
    } catch {
      setNotice(t.projects.surface.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  /** The award as the freshly-read chart holds it, so an open dialog is never a stale copy. */
  function findAward(id: string): Award | null {
    for (const g of chart?.groups ?? []) {
      for (const it of g.items) {
        const hit = it.awards.find((x) => x.id === id);
        if (hit) return hit;
      }
    }
    return null;
  }

  async function unaward() {
    if (!selected || !unawarding) return;
    setSaving(true);
    try {
      await withFreshVersion(selected, version, (v) => deleteAward(selected, unawarding.id, v));
      setUnawarding(null);
      await refreshChart();
    } catch {
      setNotice(t.projects.surface.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  /**
   * Embedded with no sites yet: one quiet row, not the whole board and not nothing.
   *
   * Rendering nothing here was a dead end — the only *New project* control lives inside the board
   * below, so a renter with no sites could never make their first one. An empty block competing
   * with the dashboard's hero was the thing to avoid; a feature nobody can start is worse.
   *
   * So it is a single line with the action on it, and it disappears the moment there is a real site
   * to show instead.
   */
  if (embedded && projects && projects.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <SectionHeader count={0} onNew={() => setEditing({ id: null, value: emptyProjectForm() })} />

        {/* This branch returns early, so it needs its own copy of the notice. Without one a failed
            save was completely silent — the renter pressed Save and nothing happened, which is
            indistinguishable from a broken button. */}
        {notice && <p className="rounded-sm border border-danger/40 bg-danger/5 px-3 py-2 text-body text-danger">{notice}</p>}

        {/* The form still has to be reachable from here, or the button does nothing. */}
        <Dialog open={!!editing} onClose={() => setEditing(null)} title={t.projects.surface.newProject} size="xl">
          {editing && (
            <ProjectForm
              value={editing.value}
              onChange={(value) => setEditing((cur) => (cur ? { ...cur, value } : cur))}
              onCancel={() => setEditing(null)}
              onSave={(value, applyTo) => void save(value, applyTo)}
              saving={saving}
            />
          )}
        </Dialog>
      </section>
    );
  }

  // Still loading: nothing, rather than a flash of an empty state that is about to be wrong.
  if (embedded && !projects) return null;

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        count={projects?.length ?? 0}
        onNew={() => setEditing({ id: null, value: emptyProjectForm() })}
      />

      {notice && <p className="rounded-sm border border-danger/40 bg-danger/5 px-3 py-2 text-body text-danger">{notice}</p>}

      {projects && projects.length === 0 && <p className="text-body text-muted">{t.projects.surface.empty}</p>}

      {projects && (
        <ProjectsBoard
          projects={projects}
          selectedId={selected}
          onSelect={setSelected}
          onNewProject={() => setEditing({ id: null, value: emptyProjectForm() })}
          chart={chart}
          /* W-T18 fills this from the requests list; until then the rail entry stays hidden, which
             is exactly what it should do when nothing is filed nowhere. */
          unassigned={unassigned}
          onEditProject={(p) => void openEdit(p)}
          onNewWorkOrder={startWorkOrder}
          onNewRequest={(p) => router.push(`/create?project=${encodeURIComponent(p.id)}`)}
          onOpenConflict={setConflict}
          rowMenu={(group, itemId, awardId) => {
            const item = group.items.find((i) => i.id === itemId);
            if (!item) return null;
            const a = awardId ? item.awards.find((x) => x.id === awardId) ?? null : null;
            return (
              <RowMenu
                group={group}
                award={a}
                actions={{
                  onAward: a ? undefined : () => setAwarding({ group, item }),
                  onChangeAward: a ? () => setAwarding({ group, item }) : undefined,
                  onMark: a ? (which, value) => void mark(a.id, which, value) : undefined,
                  // Un-awarding is reached through Change the award's own confirm, so the menu
                  // does not offer two doors to the same destructive act.
                  onOpenRequest: group.kind === "request" ? () => router.push(`/requests/${group.id}`) : undefined,
                  onEditWorkOrder:
                    group.kind === "work_order"
                      ? () =>
                          setWorkOrder({
                            groupId: group.id,
                            title: group.title ?? "",
                            when: {
                              ...EMPTY_WHEN,
                              startDate: group.when?.startDate ?? null,
                              endDate: group.when?.endDate ?? null,
                            },
                            // Every existing machine carries its id through the form and back out.
                            machines: group.items.map((it) => ({
                              ...blankMachine(),
                              id: it.id,
                              offCatalogue: true,
                              rawLabel: it.label,
                              quantity: it.quantity,
                              lines: it.awards.length
                                ? it.awards.map((aw) => ({
                                    supplierName: aw.supplierName,
                                    units: aw.units,
                                    rateAmount: aw.rateAmount != null ? String(aw.rateAmount) : "",
                                    rentalBasis: aw.rentalBasis,
                                  }))
                                : blankMachine().lines,
                            })),
                          })
                      : undefined,
                  onDeleteWorkOrder: group.kind === "work_order" ? () => void removeOrder(group.id) : undefined,
                  onAttachDocument: a ? () => setPapers({ award: a, isRequest: group.kind === "request" }) : undefined,
                  onRemoveFromProject:
                    group.kind === "request"
                      ? () => setFiling({ requestId: group.id, address: chart?.project.location.label ?? null, projectId: selected })
                      : undefined,
                  onFileInProject:
                    group.kind === "request"
                      ? () =>
                          setFiling({
                            requestId: group.id,
                            address: (group as ChartGroup & { address?: string | null }).address ?? null,
                            projectId: null,
                          })
                      : undefined,
                  // Remove from the project, the quotation and the deal room arrive with W-T18/W-T19.
                  // Left undefined rather than stubbed: an entry that does nothing when pressed is
                  // worse than one that is not there, because the renter tries it twice.
                }}
              />
            );
          }}
        />
      )}

      <Dialog
        open={!!workOrder}
        onClose={() => setWorkOrder(null)}
        title={workOrder?.groupId ? t.projects.menu.editWorkOrder : t.projects.created.workOrder}
        subtitle={t.projects.created.workOrderSub}
      >
        {workOrder && chart && (
          <WorkOrderForm
            taxonomy={taxonomy}
            draft={workOrder}
            onChange={setWorkOrder}
            projectWhen={{
              startDate: chart.project.defaults.timing.startDate,
              endDate: chart.project.defaults.timing.endDate,
            }}
            onCancel={() => setWorkOrder(null)}
            onSave={(d) => void saveOrder(d)}
            saving={saving}
          />
        )}
      </Dialog>

      {papers && (
        <DocumentsDialog
          open
          onClose={() => setPapers(null)}
          award={papers.award}
          isRequest={papers.isRequest}
          onAttach={(file, kind) => void attach(file, kind)}
          onRemove={(id) => void detach(id)}
          busy={saving}
        />
      )}

      {conflict && chart && (
        <ConflictDialog
          open
          onClose={() => setConflict(null)}
          rowLabel={conflict.title?.trim() || conflict.ref}
          projectLabel={projectTitle(chart.project)}
          fields={periodConflicts(
            conflict.when,
            { startDate: chart.project.defaults.timing.startDate, endDate: chart.project.defaults.timing.endDate },
            { start: t.projects.form.start, end: t.projects.form.end },
          )}
          /* A work order goes to nobody, so matching the project costs nothing and is never refused.
             A request obeys the same edit rule the drawer's Edit button does. */
          state={
            conflict.kind === "work_order"
              ? "work_order"
              : propagationForRequest({
                  id: conflict.id,
                  ref: conflict.ref,
                  status: conflict.status ?? "OPEN",
                  bidCount: conflict.bidCount ?? 0,
                  renteeEditUsed: conflict.renteeEditUsed ?? false,
                }).state
          }
          onMatch={() => {
            // The edit itself belongs to the work-order form and the request edit modal, which own
            // the validation. This opens the right one rather than writing a second edit path.
            setConflict(null);
            if (conflict.kind === "work_order") setNotice(t.projects.conflict.openTheForm);
            else router.push(`/requests/${conflict.id}`);
          }}
          busy={saving}
        />
      )}

      {filing && projects && (
        <MoveDialog
          open
          onClose={() => setFiling(null)}
          projects={projects}
          address={filing.address}
          currentProjectId={filing.projectId}
          onFile={(id) => void file(id)}
          busy={saving}
        />
      )}

      {awarding && (
        <AwardDialog
          open
          onClose={() => setAwarding(null)}
          item={awarding.item}
          defaultBasis={(chart?.project.defaults.timing.rentalBasis as Award["rentalBasis"]) ?? "monthly"}
          onSave={(lines) => void award(lines)}
          saving={saving}
        />
      )}

      {unawarding && (
        <UnawardConfirm open onClose={() => setUnawarding(null)} award={unawarding} onConfirm={() => void unaward()} busy={saving} />
      )}

      {deleting && (
        <ProjectDelete
          project={deleting}
          open
          onClose={() => setDeleting(null)}
          busy={saving}
          onDelete={async () => {
            setSaving(true);
            try {
              await deleteProject(deleting.id);
              setDeleting(null);
              setEditing(null);
              await reload();
            } catch {
              setNotice(t.projects.surface.saveFailed);
            } finally {
              setSaving(false);
            }
          }}
        />
      )}

      {created && (
        <ProjectCreated
          project={created}
          open
          onClose={() => setCreated(null)}
          onAddWorkOrder={() => {
            setSelected(created.id);
            setCreated(null);
            setWorkOrder({ title: "", when: { ...EMPTY_WHEN }, machines: [blankMachine()] });
          }}
          onPostRequest={() => router.push("/create")}
        />
      )}

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? t.projects.surface.editTitle : t.projects.surface.newProject}
        /* Wide, so the four *When* fields — start · end · extendable · basis — stand on one row
           instead of wrapping into what looks like a second question. */
        size="xl"
      >
        {editing && (
          <ProjectForm
            value={editing.value}
            onChange={(value) => setEditing((cur) => (cur ? { ...cur, value } : cur))}
            rows={editing.rows}
            onCancel={() => setEditing(null)}
            onSave={(value, applyTo) => void save(value, applyTo)}
            saving={saving}
          />
        )}

        {/* Delete lives here rather than on the card, because it is a thing you do to a project you
            are already looking at — and because the panel it opens has to be able to say what is
            filed, which is what the edit view has just loaded. */}
        {editing?.id && (
          <button
            type="button"
            onClick={() => {
              const p = projects?.find((x) => x.id === editing.id);
              if (p) setDeleting(p);
            }}
            className="mt-4 self-start text-meta font-semibold text-muted underline underline-offset-2 hover:text-danger"
          >
            {(() => {
              const p = projects?.find((x) => x.id === editing.id);
              // Not a disabled button: a project with rows gets an explanation, not a refusal.
              return p && projectIsEmpty(p) ? t.projects.del.confirmAction : t.projects.del.busyTitle;
            })()}
          </button>
        )}
      </Dialog>
    </div>
  );
}
