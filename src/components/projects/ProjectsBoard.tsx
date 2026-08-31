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
 * ── Nothing clips but the TRACK ───────────────────────────────────────────────────────────────────
 *
 * ~~The chart panel hid its overflow so a bar could not escape.~~ It swallowed the row menus with
 * them, which is the bug the owner reported on 2026-08-31: *"clicking on 3 dots opens a menu that is
 * hidden."* A bar cannot escape a track that clips itself, so the clip moved there (`ChartRow`) and
 * this panel has none.
 *
 * The chart SCROLLS on its own rather than making the page taller, and its header stays put while it
 * does. A menu on the last row still has somewhere to go: it flips upward when the viewport is short
 * of room — see `RowMenu`.
 */

import { useT } from "@/lib/i18n";
import { Button, Icon } from "@/components/ui";
import { projectTitle, projectEnded, endedLast, titleIsDerived, periodDiffers, type ProjectSummary } from "@/lib/contract/project";
import { chartSpan, isUnawarded, type ChartGroup } from "@/lib/contract/award";
import { AwardRow, AwaitingRow, pct, type Axis } from "./ChartRow";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * The month ticks the axis is read against. One per month start inside the span.
 *
 * **The label carries the YEAR** — «Mar 26», not «Mar» (owner, 2026-08-31, with his own reference).
 * A chart running November to February showed «Nov Dec Jan Feb» and left the reader to work out
 * which of them had rolled over; two more characters answer it on every column.
 */
function months(axis: Axis): { iso: string; label: string }[] {
  const out: { iso: string; label: string }[] = [];
  const from = new Date(axis.from + "T00:00:00Z");
  const to = new Date(axis.to + "T00:00:00Z");
  const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (cur <= to) {
    const iso = cur.toISOString().slice(0, 10);
    out.push({ iso, label: cur.toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" }) });
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

/** «Aug 31, 2026» — the today marker's own date, spelled out once at the top of its line. The month
 *  columns give the shape; this gives the renter the one date they are reading everything against. */
function longDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function ProjectsBoard({
  projects,
  selectedId,
  onSelect,
  onNewProject,
  chart,
  onEditProject,
  onNewWorkOrder,
  onAddRequest,
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
  /** Opens the picker: the site's unfiled requests, with *New request* at the top of them. */
  onAddRequest: (p: ProjectSummary) => void;
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

        {/* The ONE way to make a project (owner, 2026-08-31). The section header carried a second,
            identical button; two controls for one act, eighty pixels apart, teach a renter that one
            of them must do something else. This is the one that survives — it sits at the end of the
            list it adds to — and it wears the brand's border so it reads as an action rather than as
            an empty slot in the rail. */}
        <button
          type="button"
          onClick={onNewProject}
          className="flex min-w-[180px] items-center gap-1.5 rounded-sm border border-dashed border-brand px-3 py-2 text-start text-body font-semibold text-brand transition hover:bg-brand-soft"
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
            onAddRequest={() => onAddRequest(chart.project)}
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
  onAddRequest,
  onOpenConflict,
  rowMenu,
}: {
  project: ProjectSummary;
  groups: ChartGroup[];
  today: string;
  onEdit: (p: ProjectSummary) => void;
  onNewWorkOrder: () => void;
  onAddRequest: () => void;
  onOpenConflict?: (group: ChartGroup) => void;
  rowMenu?: (group: ChartGroup, itemId: string, awardId: string | null) => React.ReactNode;
}) {
  const t = useT();
  const projectWindow = { startDate: project.defaults.timing.startDate, endDate: project.defaults.timing.endDate };
  const axis = chartSpan(groups, projectWindow);
  const ticks = axis ? months(axis) : [];
  /** The same boundaries the header rules, handed to every row so the two cannot drift apart. */
  const grid = axis ? ticks.map((m) => pct(m.iso, axis)) : [];
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
      {/* ── The site, and its actions, on ONE line (owner, 2026-08-31) ──────────────────────────
          *"Make the header shorter so the 3 buttons below fit in it so it becomes all in one row."*
          They were a second row floating under the strip, right-aligned against nothing — two bands
          of chrome above a chart that is the actual subject of the page. The strip is shorter now
          (one line per cell, tighter padding) and the three controls ride its trailing edge. */}
      <div className="flex flex-wrap items-stretch gap-y-2 overflow-hidden rounded-sm border border-border bg-surface">
        <dl className="flex min-w-0 flex-1 flex-wrap">
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

          {/* ~~«Filed here — 0 req · 0 WO».~~ Removed (owner, 2026-08-31). It counted exactly what
              the chart below it draws in full, so on a site with rows it repeated them and on an
              empty site it said «0 req · 0 WO» beside a panel already saying so in words. The rail
              still carries the count, which is where a renter compares sites. */}
        </dl>

        {/* The actions, inside the strip. The pen edits the whole site rather than its name, so it
            belongs with the things you DO to a site — quiet, beside the two that are the reason a
            renter came: a work order for a machine already here, a request for one that is not.
            Both orange: different destinations, equal standing. */}
        <div className="flex flex-none items-center gap-2 border-s border-border px-3 py-2">
          <button
            type="button"
            onClick={() => onEdit(project)}
            aria-label={t.common.edit}
            title={t.common.edit}
            className="flex h-[34px] w-[34px] items-center justify-center rounded-md border border-border text-navy-mid transition hover:border-brand hover:text-brand"
          >
            <Icon name="edit" size={15} />
          </button>
          <Button size="sm" onClick={onNewWorkOrder}>
            <Icon name="handyman" size={14} /> {t.projects.board.addWorkOrder}
          </Button>
          {/* ONE request button: *New request* and *Add existing request* used to sit side by side
              asking the renter to know in advance whether the thing they wanted already existed. It
              is the same intention either way, so it is one door and the choice is made inside. */}
          <Button size="sm" onClick={onAddRequest}>
            <Icon name="add" size={14} /> {t.projects.board.addRequest}
          </Button>
        </div>
      </div>

      {/* ── Chart ──
          NO `overflow-hidden` here (see the note at the top): the track clips itself, and this panel
          clipping is what hid every row menu. It scrolls instead, so a long site does not stretch the
          page — and the header stays while it does, because a month column whose label has scrolled
          away is a column of nothing. */}
      <div className="max-h-[64vh] overflow-y-auto rounded-sm border border-border bg-surface">
        {axis ? (
          <>
            <div className="sticky top-0 z-20 flex items-stretch border-b border-border bg-surface2">
              <div className="w-[260px] flex-none px-3 py-2 text-label font-semibold uppercase tracking-[.03em] text-muted">
                {t.projects.board.whatIsHere}
              </div>
              {/* The reference's own arrangement (owner, 2026-08-31): a ruled column per month with
                  its «Mar 26» sitting just inside the rule, and today marked with the date it is. */}
              <div className="relative min-w-0 flex-1 py-2">
                {ticks.map((m) => (
                  <span
                    key={m.iso}
                    aria-hidden
                    className="absolute inset-y-0 w-px bg-border/70"
                    style={{ insetInlineStart: `${pct(m.iso, axis)}%` }}
                  />
                ))}
                {ticks.map((m) => (
                  <span
                    key={`l-${m.iso}`}
                    className="absolute top-1.5 ms-2 whitespace-nowrap text-label font-semibold text-navy-mid"
                    style={{ insetInlineStart: `${pct(m.iso, axis)}%` }}
                  >
                    {m.label}
                  </span>
                ))}
                {todayIn && (
                  <>
                    <span
                      aria-hidden
                      className="absolute inset-y-0 border-s border-dashed border-brand"
                      style={{ insetInlineStart: `${pct(todayIn, axis)}%` }}
                    />
                    {/* Centred on its own line and on the panel's ground, so it reads as a label ON
                        the marker rather than as one more month. */}
                    <span
                      className="absolute -top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-sm bg-surface2 px-1.5 text-label font-extrabold text-brand rtl:translate-x-1/2"
                      style={{ insetInlineStart: `${pct(todayIn, axis)}%` }}
                    >
                      {t.projects.board.today} · {longDate(todayIn)}
                    </span>
                  </>
                )}
              </div>
            </div>

            {groups.map((g) => (
              <div key={g.id}>
                <div className="flex items-center gap-2 border-t border-border bg-surface2/40 px-3 py-1.5">
                  <Icon name={g.kind === "work_order" ? "handyman" : "campaign"} size={13} className="flex-none text-muted" />
                  <span className="truncate text-meta font-semibold text-navy">{g.title?.trim() || g.ref}</span>
                  {g.kind === "request" && <span className="text-meta text-muted">{g.ref}</span>}
                  {/* Its own period, kept and shown rather than resolved away. A button, not a
                      label: the renter presses it to see WHAT differs and decide, and a difference
                      they cannot open is a warning they can only ignore.

                      Gated on the dates actually DIFFERING, not on the row holding a copy of them.
                      A request always holds a copy — it took one at submit — so the old condition
                      put this warning on every request ever filed, and the panel it opened had
                      nothing to list. */}
                  {periodDiffers(g.when, projectWindow) && (
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
                      grid={grid}
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
                        grid={grid}
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
    /* `basis-[150px]` and 6px of vertical padding: four cells and three buttons have to share one
       line on a laptop, and every pixel of this strip is a pixel the chart does not get. */
    <div className="flex min-w-0 flex-1 basis-[150px] flex-col justify-center gap-px border-s border-border px-3 py-1.5 first:border-s-0">
      <dt className="text-label font-semibold uppercase tracking-[.03em] text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-body font-semibold text-navy tabular-nums">{children}</dd>
    </div>
  );
}

/* ----------------------------- Unassigned ----------------------------- */

/** No chart, and **no `overflow-hidden`** — that is what cut the row menu in the prototype. */
