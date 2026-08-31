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
import {
  projectTitle,
  projectEnded,
  endedLast,
  titleIsDerived,
  periodDiffers,
  siteSpan,
  type ProjectSummary,
} from "@/lib/contract/project";
import { awardWindow, chartSpan, isUnawarded, type ChartGroup } from "@/lib/contract/award";
import { AwardRow, AwaitingRow, pct, type Axis } from "./ChartRow";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * The axis, snapped OUT to whole months — first of the start month to last of the end month.
 *
 * `chartSpan` returns the exact min and max of the data, and a site running 31 Aug → 7 Oct therefore
 * gave August a column 2.7% wide: its label had nowhere to sit and collided with September's or
 * truncated to nothing, which is what the owner saw on 2026-08-31 (*"why does the chart only show 26
 * Aug and 26 Oct"* — September was there, in a sliver two characters wide).
 *
 * Snapping is the fix rather than skipping crowded labels: a month axis whose first and last columns
 * are part-months is a chart whose columns are not comparable, so a bar covering half of September
 * and half of October looks like it covers most of the chart. Every column is now one month wide and
 * the same width, which is what makes the shape of a bar mean something.
 *
 * Bars are unaffected — they position as a percentage of whatever axis they are given, and the
 * clamp in `pct` still holds.
 */
function monthAxis(span: { from: string; to: string } | null, openEnded: boolean): Axis | null {
  if (!span) return null;
  const f = new Date(span.from + "T00:00:00Z");
  const t = new Date(span.to + "T00:00:00Z");
  const from = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), 1));
  // Day 0 of the NEXT month is the last day of this one — no month-length table.
  const monthEnd = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0));
  /**
   * **The END is the last day of the WORK, not of its month** (owner, 2026-08-31: *"I still don't
   * understand how 7-10 is shown after Oct 26 … it must clearly show the end with respect to the
   * chart"*). Rounding the end out to 31 October put the site's last day a fifth of the way into a
   * month-wide column with no day marks in it, so a bar that stopped on the 7th looked like it ran
   * to the 20th. Ending the axis ON that day puts it against the chart's own trailing edge, where
   * there is nothing to misread it against.
   *
   * The START still rounds out to the 1st: that fixed a real fault the other way, a first column two
   * characters wide whose label collided with the next one.
   *
   * A chart holding an OPEN-ENDED row is the exception. Its longest bar has no end to reach, so the
   * axis is given the rest of that month to run into — otherwise the open bar and the last closed
   * one both end at 100% and look like the same statement.
   */
  const to = openEnded ? monthEnd : t;
  // A single-day span would make every percentage 0 (see `pct`). Fall back to the month.
  const usable = to > from ? to : monthEnd;
  return { from: from.toISOString().slice(0, 10), to: usable.toISOString().slice(0, 10) };
}

/** Does anything on this site run without an end date? See {@link monthAxis}. */
function hasOpenEnd(groups: ChartGroup[], projectWindow: { startDate: string | null; endDate: string | null }): boolean {
  return groups.some((g) =>
    g.items.some((it) =>
      it.awards.length > 0
        ? it.awards.some((a) => !awardWindow(g, a, projectWindow).end)
        : !(g.when?.endDate ?? projectWindow.endDate),
    ),
  );
}

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
  onRename,
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
  onRename?: (group: ChartGroup) => void;
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
            onRename={onRename}
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
  onRename,
  onOpenConflict,
  rowMenu,
}: {
  project: ProjectSummary;
  groups: ChartGroup[];
  today: string;
  onEdit: (p: ProjectSummary) => void;
  onNewWorkOrder: () => void;
  onAddRequest: () => void;
  /** Rename one row on the chart — a work order or a request. */
  onRename?: (group: ChartGroup) => void;
  onOpenConflict?: (group: ChartGroup) => void;
  rowMenu?: (group: ChartGroup, itemId: string, awardId: string | null) => React.ReactNode;
}) {
  const t = useT();
  const projectWindow = { startDate: project.defaults.timing.startDate, endDate: project.defaults.timing.endDate };
  const axis = monthAxis(chartSpan(groups, projectWindow), hasOpenEnd(groups, projectWindow));
  const span = siteSpan(project);
  const siteSays = (d: string) => t.projects.board.siteSays.replace("{date}", d);
  const ticks = axis ? months(axis) : [];
  /** The same boundaries the header rules, handed to every row so the two cannot drift apart. */
  const grid = axis ? ticks.map((m) => pct(m.iso, axis)) : [];
  /**
   * The months as COLUMNS — each one's own share of the axis.
   *
   * A cell cannot overlap its neighbour, which is what absolute labels at percentage offsets did:
   * «Aug 26» and «Sep 26» printed over each other on any span where two month starts fell within a
   * label's width of one another. The last column runs to the end of the axis.
   */
  const cols = axis
    ? grid.map((left, i) => ({ ...ticks[i], width: (i + 1 < grid.length ? grid[i + 1] : 100) - left }))
    : [];
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
            {/* An underlined link to the real place (owner, 2026-08-31).
                A site's address that cannot be pressed is an address a renter retypes into another
                tab. And this one can be a PIN rather than a search: the project holds `lat`/`lng`
                from the map the renter dropped it on, so the link opens the exact point they chose
                — unlike the request details, whose payload carries no coordinates at all and has to
                search the address instead. */}
            <span className="flex min-w-0 items-center gap-1.5">
              <Icon name="place" size={14} className="flex-none text-muted" />
              {project.location.label ? (
                <a
                  href={
                    typeof project.location.lat === "number" && typeof project.location.lng === "number"
                      ? `https://www.google.com/maps?q=${project.location.lat},${project.location.lng}`
                      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.location.label)}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate font-normal underline decoration-border underline-offset-2 transition hover:text-brand hover:decoration-brand"
                >
                  {project.location.label}
                </a>
              ) : (
                <span className="truncate font-normal">{"—"}</span>
              )}
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
          {/* The span the site ACTUALLY runs, with the site's own date noted where it differs
              (owner, 2026-08-31: *"the end or start date must show first start or last end if its
              children have different values, with a note of the difference — we are not changing
              project values, just viewing the latest ones"*).

              It printed the site's stated dates and stopped, so a renter reading *ends 7 Oct* had no
              way to know something on that site ran to December. A view, never a correction: the
              site keeps saying what it was told to say, and changing it stays a deliberate act
              through the pen. */}
          <Cell label={t.projects.board.start} note={span.start.stated ? siteSays(span.start.stated) : undefined}>
            {span.start.shown ?? "—"}
          </Cell>
          <Cell label={t.projects.board.end} note={span.end.stated ? siteSays(span.end.stated) : undefined}>
            {span.end.shown ?? "—"}
          </Cell>

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
            {/* ── The axis header: two lines, and they cannot collide ─────────────────────────────
                *"Why are dates on each other? Show the line clearly and today not overlapping any
                date"* (owner, 2026-08-31). Both faults were the same mistake — absolute labels at
                percentage offsets, free to sit on top of each other and on the today marker.

                Line 1 is today's and nothing else's. Line 2 is the months, laid out as FLEX CELLS
                one month wide rather than absolutely: two labels can no longer overlap because
                neither can leave its own column, and a month too narrow for its label truncates
                instead of running into its neighbour.

                `z-10`, not 20: an open row menu has to paint over this header (see `ChartRow`). */}
            <div className="sticky top-0 z-10 flex items-stretch border-b border-border bg-surface2">
              <div className="flex w-[260px] flex-none items-end px-3 pb-1.5 text-label font-semibold uppercase tracking-[.03em] text-muted">
                {t.projects.board.whatIsHere}
              </div>

              <div className="relative min-w-0 flex-1">
                {/* Today's own line. It sits ABOVE the months, so the chip has nothing to cover. */}
                <div className="relative h-[18px]">
                  {todayIn && (
                    <span
                      className="absolute top-0 -translate-x-1/2 whitespace-nowrap px-1 text-label font-extrabold text-brand rtl:translate-x-1/2"
                      style={{ insetInlineStart: `${pct(todayIn, axis)}%` }}
                    >
                      {t.projects.board.today} · {longDate(todayIn)}
                    </span>
                  )}
                </div>

                {/* The months, one cell each. */}
                <div className="flex h-[22px] items-end">
                  {cols.map((c) => (
                    <span
                      key={c.iso}
                      className="min-w-0 flex-none truncate border-s border-border/70 px-1.5 pb-1 text-label font-semibold text-navy-mid"
                      style={{ width: `${c.width}%` }}
                      title={c.label}
                    >
                      {c.label}
                    </span>
                  ))}
                </div>

                {/* The marker itself, over both lines. */}
                {todayIn && (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 border-s border-dashed border-brand"
                    style={{ insetInlineStart: `${pct(todayIn, axis)}%` }}
                  />
                )}
              </div>
            </div>

            {groups.map((g) => (
              <div key={g.id}>
                {/* ── The group header, and it must not look like a row (owner, 2026-08-31) ──────
                    *"The headers must be shown different from the items."* Header and item sat on
                    the same near-white ground at the same type size, so a chart of two requests read
                    as five equal rows and the renter had to work out which lines were containers.

                    It is now a navy-tinted band, a hair taller, and the name on it is the whole
                    label. ~~A `campaign` megaphone for a request and a `handyman` spanner for a work
                    order~~ → ~~a «Request» / «Work order» tag~~ → nothing (owner, 2026-08-31, twice:
                    *"remove icon or use consistent one"*, then *"remove this work order or request
                    label"*). What a row IS shows in what it does: a work order is named by its own
                    title and carries no bids, a request carries its reference. The band does not
                    have to announce the category to be read. */}
                <div className="flex items-center gap-2 border-t-2 border-border bg-navy/[.045] px-3 py-2">
                  <span className="truncate text-body font-extrabold text-navy">{g.title?.trim() || g.ref}</span>
                  {/* The ref, and only when the TITLE is something else (owner, 2026-08-31: *"why is
                      the request id repeated twice"*). A request with no title of its own falls back
                      to its ref above, and this line printed it a second time. */}
                  {g.kind === "request" && !!g.title?.trim() && <span className="text-meta text-muted">{g.ref}</span>}

                  {/* Rename it (owner, 2026-08-31).
                      A renter reading their own board should not have to recognise ATC310894. The
                      reference stays — it is what a supplier quotes back at them — but it stops being
                      the only thing a row can be called.

                      On every row, not only work orders: the request is the one that arrives with no
                      name at all, so it is the one that needs this most. */}
                  {onRename && (
                    <button
                      type="button"
                      onClick={() => onRename(g)}
                      aria-label={t.common.edit}
                      title={t.common.edit}
                      className="flex-none text-muted transition hover:text-brand"
                    >
                      <Icon name="edit" size={12} />
                    </button>
                  )}
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
                      title={t.projects.board.ownPeriod}
                      className="flex-none whitespace-nowrap text-meta font-semibold text-warn underline underline-offset-2 tabular-nums"
                    >
                      {/* ~~«own dates».~~ It says WHICH dates now (owner, 2026-08-31): the phrase
                          told a renter that this row disagrees with the site and made them press to
                          find out how, which is one click to read two dates they were already
                          looking at a chart of. The words move to the `title`; the dates take the
                          label. */}
                      {g.when?.startDate ?? "—"} → {g.when?.endDate ?? "—"}
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

            {/* ── Room after the last row (owner, 2026-08-31) ────────────────────────────────────
                *"Let users scroll for a space after the chart so the chart is not at the bottom."*
                The last row sat flush against the panel's own border, which made a full chart look
                cut off rather than finished — and a row menu opening downward on that row had
                nothing to open into, so it flipped up over the rows the renter was comparing.

                Inside the scroller, so it is scrollable space rather than a permanent gap: a chart
                short enough to fit needs no scrollbar and shows none. */}
            <div aria-hidden className="h-24 flex-none" />
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
function Cell({
  label,
  children,
  note,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  /** A second line under the value — what the site itself claims, when it differs. */
  note?: string;
}) {
  return (
    /* `basis-[150px]` and 6px of vertical padding: four cells and three buttons have to share one
       line on a laptop, and every pixel of this strip is a pixel the chart does not get. */
    <div className="flex min-w-0 flex-1 basis-[150px] flex-col justify-center gap-px border-s border-border px-3 py-1.5 first:border-s-0">
      <dt className="text-label font-semibold uppercase tracking-[.03em] text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-body font-semibold text-navy tabular-nums">{children}</dd>
      {/* Amber, not red: a machine that stays longer than the site's own dates is a fact, and the
          renter is being informed rather than warned. */}
      {note && <dd className="min-w-0 truncate text-meta font-semibold text-warn tabular-nums">{note}</dd>}
    </div>
  );
}

/* ----------------------------- Unassigned ----------------------------- */

/** No chart, and **no `overflow-hidden`** — that is what cut the row menu in the prototype. */
