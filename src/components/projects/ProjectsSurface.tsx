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
import {
  listProjects,
  createProject,
  updateProject,
  fetchChart,
  ProjectVersionConflict,
} from "@/lib/api/client";
import {
  projectTitle,
  projectEnded,
  endedLast,
  propagationForRequest,
  propagationForWorkOrder,
  type ProjectSummary,
  type PropagationRow,
} from "@/lib/contract/project";
import { ProjectForm, emptyProjectForm, projectToForm, type ProjectFormValue } from "./ProjectForm";

const today = () => new Date().toISOString().slice(0, 10);

export function ProjectsSurface() {
  const t = useT();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; value: ProjectFormValue; rows?: PropagationRow[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
      if (editing.id) await updateProject(editing.id, value, applyTo);
      else await createProject(value);
      setEditing(null);
      await reload();
    } catch (err) {
      // Someone else edited this site while the form was open. Say so plainly rather than
      // overwriting their change with a form that was filled in before it existed.
      setNotice(err instanceof ProjectVersionConflict ? t.projects.surface.stale : t.projects.surface.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  const ordered = projects ? endedLast(projects, today()) : [];

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

      {projects && ordered.length === 0 && <p className="text-body text-muted">{t.projects.surface.empty}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((p) => {
          const ended = projectEnded(p, today());
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => void openEdit(p)}
              className="flex flex-col gap-1.5 rounded-sm border border-border bg-surface p-4 text-start transition hover:border-brand"
            >
              <span className="flex items-center gap-1.5">
                <Icon name="place" size={14} className="flex-none text-brand" />
                <span className="min-w-0 flex-1 truncate text-subhead font-extrabold text-navy">{projectTitle(p)}</span>
                {/* Tagged, never hidden — a date passing is not proof a site is finished. */}
                {ended && <span className="flex-none text-meta font-semibold text-muted">{t.projects.chips.ended}</span>}
              </span>
              <span className="truncate text-meta text-muted">{p.location.label}</span>
              <span className="mt-1 text-meta text-muted">
                {t.projects.surface.counts
                  .replace("{requests}", String(p.requestCount))
                  .replace("{workOrders}", String(p.workOrderCount))
                  .replace("{units}", String(p.unitsAwarded))}
              </span>
              {(p.firstStart || p.lastEnd) && (
                <span className="text-meta text-muted">
                  {p.firstStart ?? "—"} → {p.lastEnd ?? "—"}
                </span>
              )}
            </button>
          );
        })}
      </div>

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
      </Dialog>
    </div>
  );
}
