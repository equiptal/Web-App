"use client";

/**
 * The board — the rail, the meta bar and the chart (W-T13 · spec §8).
 *
 * ── Requests and work orders are counted separately, never summed ────────────────────────────────
 *
 * A work order also posted as a request is deliberately two rows: the order is the plan, the request
 * is the asking. Adding them would report four machines where a renter has two, and the number they
 * would trust for an insurance form or a site meeting would be wrong.
 *
 * ── Unassigned is a rail entry, not a warning ────────────────────────────────────────────────────
 *
 * It appears only when something is filed nowhere, and it is where filing actually happens — most
 * requests never reach it, because they are offered a project at the moment they are posted.
 *
 * ── The panel clips, and Unassigned must not ─────────────────────────────────────────────────────
 *
 * The chart panel hides its overflow so a bar cannot escape the track. Unassigned has no chart, and
 * with the same rule its row menu was cut in half in the prototype. The class is applied to the
 * chart panel only.
 */

import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { projectTitle, projectEnded, endedLast, titleIsDerived, type ProjectSummary } from "@/lib/contract/project";
import { chartSpan, isUnawarded, type ChartGroup } from "@/lib/contract/award";
import { AwardRow, AwaitingRow, pct, type Axis } from "./ChartRow";

const today = () => new Date().toISOString().slice(0, 10);

/** The month ticks the axis is read against. One label per month start inside the span. */
function months(axis: Axis): { iso: string; label: string }[] {
  const out: { iso: string; label: string }[] = [];
  const from = new Date(axis.from + "T00:00:00Z");
  const to = new Date(axis.to + "T00:00:00Z");
  const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (cur <= to) {
    const iso = cur.toISOString().slice(0, 10);
    out.push({ iso, label: cur.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }) });
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

export function ProjectsBoard({
  projects,
  selectedId,
  onSelect,
  onNewProject,
  chart,
  unassigned,
  onEditProject,
  rowMenu,
}: {
  projects: ProjectSummary[];
  /** `null` selects Unassigned. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onNewProject: () => void;
  chart: { project: ProjectSummary; groups: ChartGroup[] } | null;
  /** Rows filed nowhere. The rail entry appears only when this is non-empty. */
  unassigned: ChartGroup[];
  onEditProject: (p: ProjectSummary) => void;
  rowMenu?: (group: ChartGroup, itemId: string, awardId: string | null) => React.ReactNode;
}) {
  const t = useT();
  const now = today();
  const ordered = endedLast(projects, now);

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* ── Rail ── */}
      <nav className="flex w-full flex-none gap-1.5 overflow-x-auto lg:w-[248px] lg:flex-col lg:overflow-visible">
        {ordered.map((p) => {
          const ended = projectEnded(p, now);
          const on = p.id === selectedId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className={`flex min-w-[180px] flex-col gap-0.5 rounded-sm border px-3 py-2 text-start transition ${
                on ? "border-brand bg-brand-soft" : "border-border bg-surface hover:border-brand"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Icon name="place" size={13} className="flex-none text-brand" />
                <span className="min-w-0 flex-1 truncate text-body font-semibold text-navy">{projectTitle(p)}</span>
                {ended && <span className="flex-none text-meta text-muted">{t.projects.chips.ended}</span>}
              </span>
              <span className="truncate text-meta text-muted">
                {t.projects.board.railCounts.replace("{r}", String(p.requestCount)).replace("{w}", String(p.workOrderCount))}
              </span>
            </button>
          );
        })}

        {/* Only when something is actually filed nowhere. */}
        {unassigned.length > 0 && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={`flex min-w-[180px] items-center gap-1.5 rounded-sm border px-3 py-2 text-start transition ${
              selectedId === null ? "border-brand bg-brand-soft" : "border-dashed border-border bg-surface hover:border-brand"
            }`}
          >
            <Icon name="inbox" size={13} className="flex-none text-muted" />
            <span className="min-w-0 flex-1 truncate text-body font-semibold text-navy">{t.projects.board.unassigned}</span>
            <span className="flex-none text-meta font-semibold text-muted">{unassigned.length}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onNewProject}
          className="flex min-w-[180px] items-center gap-1.5 rounded-sm border border-dashed border-border px-3 py-2 text-start text-body font-semibold text-muted transition hover:border-brand hover:text-brand"
        >
          <Icon name="add" size={14} /> {t.projects.surface.newProject}
        </button>
      </nav>

      {/* ── The site ── */}
      <div className="min-w-0 flex-1">
        {selectedId === null ? (
          <UnassignedPanel groups={unassigned} rowMenu={rowMenu} />
        ) : chart ? (
          <SitePanel project={chart.project} groups={chart.groups} today={now} onEdit={onEditProject} rowMenu={rowMenu} />
        ) : (
          <p className="text-body text-muted">{t.projects.board.loading}</p>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- One site ----------------------------- */

function SitePanel({
  project,
  groups,
  today: now,
  onEdit,
  rowMenu,
}: {
  project: ProjectSummary;
  groups: ChartGroup[];
  today: string;
  onEdit: (p: ProjectSummary) => void;
  rowMenu?: (group: ChartGroup, itemId: string, awardId: string | null) => React.ReactNode;
}) {
  const t = useT();
  const projectWindow = { startDate: project.defaults.timing.startDate, endDate: project.defaults.timing.endDate };
  const axis = chartSpan(groups, projectWindow);
  const ticks = axis ? months(axis) : [];
  const todayIn = axis && now >= axis.from && now <= axis.to ? now : undefined;

  return (
    <div className="flex flex-col gap-3">
      {/* ── Meta ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-display font-extrabold leading-tight text-navy">
            {projectTitle(project)}
            {/* Marked as ours, so a renter knows the name is a fallback and not something they set. */}
            {titleIsDerived(project) && <span className="text-meta font-semibold text-muted">{t.projects.board.namedByUs}</span>}
            <button type="button" onClick={() => onEdit(project)} aria-label={t.common.edit} className="text-muted transition hover:text-brand">
              <Icon name="edit" size={15} />
            </button>
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-body text-muted">
            <Icon name="place" size={14} className="flex-none" />
            {project.location.label}
            {/* The padlock: a work order under this site cannot have a location of its own. */}
            <Icon name="lock" size={12} className="flex-none text-muted-light" />
          </p>
        </div>

        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-meta">
          <Stat label={t.projects.board.requests} value={project.requestCount} />
          {/* Never summed with the requests — see the note at the top. */}
          <Stat label={t.projects.board.workOrders} value={project.workOrderCount} />
          <Stat label={t.projects.board.units} value={project.unitsAwarded} />
          <Stat label={t.projects.board.runs} value={`${project.firstStart ?? "—"} → ${project.lastEnd ?? "—"}`} />
        </dl>
      </div>

      {/* ── Chart. `overflow-hidden` is for the bars; the row menu lives outside the track. ── */}
      <div className="overflow-hidden rounded-sm border border-border bg-surface">
        {axis ? (
          <>
            <div className="flex items-stretch bg-surface2/60">
              <div className="w-[260px] flex-none px-3 py-1.5 text-label font-semibold uppercase tracking-[.03em] text-muted">
                {t.projects.board.whatIsHere}
              </div>
              <div className="relative min-w-0 flex-1 py-1.5">
                {ticks.map((m) => (
                  <span key={m.iso} className="absolute text-label font-semibold text-muted" style={{ insetInlineStart: `${pct(m.iso, axis)}%` }}>
                    {m.label}
                  </span>
                ))}
              </div>
              <div className="w-9 flex-none" />
            </div>

            {groups.map((g) => (
              <div key={g.id}>
                <div className="flex items-center gap-2 border-t border-border bg-surface2/40 px-3 py-1.5">
                  <Icon name={g.kind === "work_order" ? "handyman" : "campaign"} size={13} className="flex-none text-muted" />
                  <span className="truncate text-meta font-semibold text-navy">{g.title?.trim() || g.ref}</span>
                  {g.kind === "request" && <span className="text-meta text-muted">{g.ref}</span>}
                  {/* Its own period, kept and shown rather than resolved away. */}
                  {g.when && <span className="text-meta font-semibold text-warn">{t.projects.board.ownPeriod}</span>}
                </div>

                {g.items.map((item) =>
                  isUnawarded(item) ? (
                    <AwaitingRow
                      key={item.id}
                      group={g}
                      item={item}
                      axis={axis}
                      projectWindow={projectWindow}
                      today={todayIn}
                      menu={rowMenu?.(g, item.id, null)}
                    />
                  ) : (
                    item.awards.map((a) => (
                      <AwardRow
                        key={a.id}
                        group={g}
                        item={item}
                        award={a}
                        axis={axis}
                        projectWindow={projectWindow}
                        today={todayIn}
                        menu={rowMenu?.(g, item.id, a.id)}
                      />
                    ))
                  ),
                )}
              </div>
            ))}
          </>
        ) : (
          <p className="px-3 py-6 text-center text-body text-muted">{t.projects.board.nothingYet}</p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <dt className="text-label font-semibold uppercase tracking-[.03em] text-muted">{label}</dt>
      <dd className="text-body font-semibold text-navy tabular-nums">{value}</dd>
    </div>
  );
}

/* ----------------------------- Unassigned ----------------------------- */

/** No chart, and **no `overflow-hidden`** — that is what cut the row menu in the prototype. */
function UnassignedPanel({
  groups,
  rowMenu,
}: {
  groups: ChartGroup[];
  rowMenu?: (group: ChartGroup, itemId: string, awardId: string | null) => React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-display font-extrabold leading-tight text-navy">{t.projects.board.unassigned}</h2>
        <p className="mt-1 text-body text-muted">{t.projects.board.unassignedSub}</p>
      </div>

      <div className="rounded-sm border border-border bg-surface">
        {groups.map((g) => (
          <div key={g.id} className="flex items-center gap-2 border-b border-border px-3 py-2.5 last:border-b-0">
            <Icon name="campaign" size={14} className="flex-none text-muted" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-semibold text-navy">{g.title?.trim() || g.ref}</span>
              <span className="block truncate text-meta text-muted">
                {g.items.map((i) => `${i.label} ×${i.quantity}`).join(" · ")}
              </span>
            </span>
            {rowMenu?.(g, g.items[0]?.id ?? "", null)}
          </div>
        ))}
      </div>
    </div>
  );
}
