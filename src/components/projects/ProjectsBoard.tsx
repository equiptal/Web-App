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
import { Button, Icon } from "@/components/ui";
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
  onEditProject,
  onNewWorkOrder,
  onNewRequest,
  onFileExisting,
  onOpenConflict,
  rowMenu,
}: {
  projects: ProjectSummary[];
  /** `null` selects Unassigned. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onNewProject: () => void;
  chart: { project: ProjectSummary; groups: ChartGroup[] } | null;
  /** Rows filed nowhere. The rail entry appears only when this is non-empty. */
  onEditProject: (p: ProjectSummary) => void;
  /** Both live on the header — without them a site is a page with nothing to do on it. */
  onNewWorkOrder: (p: ProjectSummary) => void;
  onNewRequest: (p: ProjectSummary) => void;
  /** Bring a request that already exists onto this site. */
  onFileExisting: (p: ProjectSummary) => void;
  /** Pressed from the *own dates* chip on a group header. */
  onOpenConflict?: (group: ChartGroup) => void;
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
        {chart ? (
          <SitePanel
            project={chart.project}
            groups={chart.groups}
            today={now}
            onEdit={onEditProject}
            onNewWorkOrder={() => onNewWorkOrder(chart.project)}
            onNewRequest={() => onNewRequest(chart.project)}
            onFileExisting={() => onFileExisting(chart.project)}
            onOpenConflict={onOpenConflict}
            rowMenu={rowMenu}
          />
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
  onNewWorkOrder,
  onNewRequest,
  onFileExisting,
  onOpenConflict,
  rowMenu,
}: {
  project: ProjectSummary;
  groups: ChartGroup[];
  today: string;
  onEdit: (p: ProjectSummary) => void;
  onNewWorkOrder: () => void;
  onNewRequest: () => void;
  onFileExisting: () => void;
  onOpenConflict?: (group: ChartGroup) => void;
  rowMenu?: (group: ChartGroup, itemId: string, awardId: string | null) => React.ReactNode;
}) {
  const t = useT();
  const projectWindow = { startDate: project.defaults.timing.startDate, endDate: project.defaults.timing.endDate };
  const axis = chartSpan(groups, projectWindow);
  const ticks = axis ? months(axis) : [];
  const todayIn = axis && now >= axis.from && now <= axis.to ? now : undefined;

  return (
    <div className="flex flex-col gap-3">
      {/* ── The site, and the two ways to put something on it ────────────────────────────

          *"How to create a work order?"* — there was no way. The header stated four roll-ups and
          offered no action at all, so a site you had just made was a page you could only look at.

          The roll-ups are gone with it (owner, 2026-08-30). **Requests**, **work orders** and
          **units awarded** each counted what the chart below draws in full, and a number that
          disagrees with the picture under it is worse than no number. The two dates stay: they are
          the site's span, which the chart shows as a shape rather than as a value you can read off.

          The pen edits the whole site, not the name — there is no separate *Project defaults*
          button. One door to one form: a renter who wants to change the payment terms and a renter
          who wants to fix a typo both press the same thing. */}
      <div className="overflow-hidden rounded-sm border border-border bg-surface">
        <dl className="flex flex-wrap">
          <Cell label={t.projects.board.project}>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{projectTitle(project)}</span>
              {/* Marked as ours, so a renter knows the name is a fallback and not something they set. */}
              {titleIsDerived(project) && (
                <span className="flex-none text-meta font-normal text-muted">{t.projects.board.namedByUs}</span>
              )}
            </span>
          </Cell>

          <Cell
            label={
              <span className="flex items-center gap-1">
                {t.projects.board.location}
                {/* The padlock: a work order under this site cannot have a location of its own. */}
                <Icon name="lock" size={11} className="flex-none text-muted-light" />
              </span>
            }
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <Icon name="place" size={14} className="flex-none text-muted" />
              <span className="truncate font-normal">{project.location.label}</span>
            </span>
          </Cell>

          {/* The SITE's own dates, not a roll-up of what is filed under it (owner, 2026-08-31).
              *"Show start and end date of the project here — why show empty."* They read as empty
              because the roll-up had nothing to sum: a site with no requests and no work orders has
              no first start, while the renter had just typed 1 Sep – 31 Dec into the form and could
              see the cell contradict them.

              The filed span is kept as the fallback, so a site whose period nobody stated still
              answers the question from the only evidence there is, and a dash means genuinely
              nothing is known. */}
          <Cell label={t.projects.board.start}>{project.defaults.timing.startDate ?? project.firstStart ?? "—"}</Cell>
          <Cell label={t.projects.board.end}>{project.defaults.timing.endDate ?? project.lastEnd ?? "—"}</Cell>

          {/* What is filed, restored at the owner's request. It is a count, but not one the chart
              repeats: the chart draws each row, and this says how many there are to expect — which is
              what tells a renter the board finished loading rather than the site being empty. */}
          <Cell label={t.projects.board.filedHere}>
            {t.projects.board.filedCount
              .replace("{r}", String(project.requestCount))
              .replace("{w}", String(project.workOrderCount))}
          </Cell>
        </dl>
      </div>

      {/* The actions, and the pen among them (owner, 2026-08-31).
          *"Show the pencil edit beside the add work order and the request buttons, not on the
          title. Make all the action buttons on the right, not left."*

          It sat on the title because that is what it used to edit. It does not — it opens the whole
          site — so it belongs with the other things you DO to a site rather than decorating its name.

          Both orange: neither is the lesser act. A work order is a machine already on site and a
          request goes to suppliers — different destinations, equal standing. The pen stays quiet
          beside them, because editing is not the thing a renter came here to do. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => onEdit(project)}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-body font-semibold text-navy-mid transition hover:border-brand hover:text-brand"
        >
          <Icon name="edit" size={14} /> {t.common.edit}
        </button>
        <Button onClick={onNewWorkOrder}>
          <Icon name="handyman" size={14} /> {t.projects.board.addWorkOrder}
        </Button>
        <Button onClick={onNewRequest}>
          <Icon name="add" size={14} /> {t.projects.board.newRequest}
        </Button>

        {/* The third way to put something here: one that already exists (owner, 2026-08-31).
            It used to live in a rail entry called *Unassigned*, which made "filed nowhere" look like
            a place — a site sitting beside the real ones — and put the action on the request when
            the renter's sentence is *"put that request on THIS site"*, said while looking at the
            site. Quiet, like the pen: bringing an existing request here is a filing job, not the
            thing a renter came to do. */}
        <button
          type="button"
          onClick={onFileExisting}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-body font-semibold text-navy-mid transition hover:border-brand hover:text-brand"
        >
          <Icon name="playlist_add" size={14} /> {t.projects.board.fileExisting}
        </button>
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
                  {/* Its own period, kept and shown rather than resolved away. A button, not a
                      label: the renter presses it to see WHAT differs and decide, and a difference
                      they cannot open is a warning they can only ignore. */}
                  {g.when && (
                    <button
                      type="button"
                      onClick={() => onOpenConflict?.(g)}
                      className="text-meta font-semibold text-warn underline underline-offset-2"
                    >
                      {t.projects.board.ownPeriod}
                    </button>
                  )}
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

/**
 * One labelled cell of the site strip.
 *
 * `border-s` rather than `border-l`, and `first:border-s-0` rather than a nth-child rule: the
 * divider has to fall on the reading-start side, and in Arabic that is the right.
 */
function Cell({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 basis-[160px] flex-col gap-0.5 border-s border-border px-3 py-2 first:border-s-0">
      <dt className="text-label font-semibold uppercase tracking-[.03em] text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-body font-semibold text-navy tabular-nums">{children}</dd>
    </div>
  );
}

/* ----------------------------- Unassigned ----------------------------- */

/** No chart, and **no `overflow-hidden`** — that is what cut the row menu in the prototype. */
