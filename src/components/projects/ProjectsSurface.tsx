"use client";

/**
 * `/projects` — the list of sites, and the form for making or editing one (W-T10 · W-T11).
 *
 * Phase 1 is deliberately just this. The board with the chart is W-T13; until it lands, a renter can
 * create a site and edit its terms, which is what the intake chips need to be worth anything.
 */

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
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
  withFreshVersion,
  ProjectVersionConflict,
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

export function ProjectsSurface() {
  const t = useT();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; value: ProjectFormValue; rows?: PropagationRow[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [chart, setChart] = useState<{ project: ProjectSummary; groups: ChartGroup[] } | null>(null);
  const [version, setVersion] = useState(1);
  const [awarding, setAwarding] = useState<{ group: ChartGroup; item: ChartItem } | null>(null);
  const [unawarding, setUnawarding] = useState<Award | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [created, setCreated] = useState<ProjectSummary | null>(null);
  const router = useRouter();

  const reload = useCallback(async () => {
    try {
      setProjects(await listProjects());
    } catch {
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

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
    setEditing({ id: p.id, value: projectToForm(p), rows: [] });
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
        await updateProject(editing.id, value, applyTo);
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
      setNotice(err instanceof ProjectVersionConflict ? t.projects.surface.stale : t.projects.surface.saveFailed);
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-display font-extrabold leading-tight tracking-[-.02em] text-navy">{t.projects.surface.heading}</h1>
          <p className="mt-1 text-body text-muted">{t.projects.surface.sub}</p>
        </div>
        <Button onClick={() => setEditing({ id: null, value: emptyProjectForm() })}>
          <Icon name="add" size={16} /> {t.projects.surface.newProject}
        </Button>
      </div>

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
          unassigned={[]}
          onEditProject={(p) => void openEdit(p)}
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
                  // Remove from the project, the quotation and the deal room arrive with W-T18/W-T19.
                  // Left undefined rather than stubbed: an entry that does nothing when pressed is
                  // worse than one that is not there, because the renter tries it twice.
                }}
              />
            );
          }}
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
          onAddWorkOrder={() => router.push(`/projects/${created.id}?new=work-order`)}
          onPostRequest={() => router.push("/create")}
        />
      )}

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? t.projects.surface.editTitle : t.projects.surface.newProject}
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
