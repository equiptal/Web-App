"use client";

/**
 * One row of the site's timeline (W-T14 · spec §8).
 *
 * **The row is the AWARD, not the item.** Three excavators can be two from Zahid and one from
 * Al-Rajhi: they arrive on different days, carry different purchase orders and are mobilized
 * separately, so each is its own row with its own bar, marks and papers. Drawing one row per item
 * would average two suppliers into a single bar that describes neither.
 *
 * An item nobody has awarded draws **one hatched row** saying *awaiting award*, with no marks and no
 * documents — not because a rule forbids them, but because there is no award to hang them on.
 *
 * ── No legend ────────────────────────────────────────────────────────────────────────────────────
 *
 * A legend is a promise that the reader will look away from the chart to decode it, and they do not.
 * Green means arrived, orange means left, and the date is in the tooltip; a renter learns both in
 * one hover and never needs the key again.
 *
 * ── The marks sit on the bar's TOP EDGE ──────────────────────────────────────────────────────────
 *
 * Centred, they cover the bar's own dates — which is what the prototype did and what made it
 * unreadable at three rows. On the edge they are still unmistakably *on* that bar and cover nothing.
 *
 * ── The menu is on the ROW, not out at the end of the track ───────────────────────────────────────
 *
 * It rode a 36px cell after the timeline, which put it against the panel's clipped edge — so the one
 * control on the row opened a menu nobody could see (owner, 2026-08-31: *"make it 3 dots on the
 * request not on the bar"*). It now sits in the label column, beside the thing it acts on, and the
 * TRACK is the only part of the row that clips.
 */

import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { awardWindow, awardedUnits, type Award, type ChartGroup, type ChartItem } from "@/lib/contract/award";

/** The axis, as a pair of day numbers. Everything positions as a percentage between them. */
export interface Axis {
  from: string;
  to: string;
}

const day = (iso: string) => Date.parse(iso + "T00:00:00Z");

/** Where a date sits on the axis, 0–100. Clamped, so a stray value cannot push a bar off-screen. */
export function pct(iso: string | null, axis: Axis): number {
  if (!iso) return 0;
  const from = day(axis.from);
  const span = day(axis.to) - from;
  if (!Number.isFinite(span) || span <= 0) return 0;
  return Math.max(0, Math.min(100, ((day(iso) - from) / span) * 100));
}

/* ----------------------------- The awarded row ----------------------------- */

export function AwardRow({
  group,
  item,
  award,
  axis,
  projectWindow,
  today,
  menu,
}: {
  group: ChartGroup;
  item: ChartItem;
  award: Award;
  axis: Axis;
  projectWindow: { startDate: string | null; endDate: string | null };
  today?: string;
  /** Month boundaries as axis percentages — the same ticks the header rules. */
  grid?: number[];
  /** The row menu, rendered by the caller so this stays a drawing component. */
  menu?: React.ReactNode;
}) {
  const t = useT();
  const win = awardWindow(group, award, projectWindow);
  const x1 = pct(win.start, axis);
  const x2 = pct(win.end, axis);

  const promised = awardedUnits(item);
  const split = item.awards.length > 1 || promised < item.quantity;

  const docs = award.documents.slice(0, 3);
  const extra = award.documents.length - docs.length;

  return (
    <div className="flex items-stretch border-t border-border">
      {/* The label column: what this row is, its papers, and its menu. `pe-10` keeps the text clear
          of the menu's 28px target rather than letting a long machine name run under it. */}
      <div className="relative flex w-[260px] flex-none flex-col justify-center gap-0.5 py-2 pe-10 ps-3">
        {/* Papers in the top corner, out of the bar's way. */}
        {award.documents.length > 0 && (
          <span className="absolute end-10 top-1.5 flex items-center gap-0.5">
            {docs.map((d) => (
              <span key={d.id} title={`${d.kind} · ${d.filename}`} className="text-brand">
                <Icon name={d.kind === "po" ? "receipt_long" : d.kind === "contract" ? "gavel" : "description"} size={12} />
              </span>
            ))}
            {extra > 0 && <span className="text-meta font-semibold text-brand">+{extra}</span>}
          </span>
        )}

        <span className="truncate text-body font-semibold text-navy">
          {item.label} ×{award.units}
          {/* "of 3" only when it is not the whole line — otherwise it is noise on every row. */}
          {split && <span className="ms-1 font-semibold text-muted-light">{t.projects.chart.of} {item.quantity}</span>}
        </span>
        <span className="truncate text-meta text-muted">
          {award.rateAmount != null && <b className="font-semibold text-navy-mid">{award.rateAmount.toLocaleString()} </b>}
          {award.rateAmount != null && `${t.common.sar} · `}
          {award.supplierName}
        </span>

        {/* The menu, on the row it acts on. */}
        {menu && <span className="absolute end-1.5 top-1/2 -translate-y-1/2">{menu}</span>}
      </div>

      {/* `overflow-hidden` HERE and nowhere else: a bar must not escape the track, and the panel
          around it must not clip or the menus go with the bars. */}
      <div className="relative min-w-0 flex-1 overflow-hidden py-3">
        <Grid at={grid} />
        {today && <TodayLine at={pct(today, axis)} />}

        <span
          className="absolute top-1/2 -translate-y-1/2 truncate rounded-sm bg-navy px-2 py-1 text-label font-semibold text-white"
          style={{ insetInlineStart: `${x1}%`, width: `${Math.max(x2 - x1, 2)}%` }}
        >
          {win.start} → {win.end}
        </span>

        {award.mobilizedAt && (
          <Mark at={award.mobilizedAt} axis={axis} tone="in" title={`${t.projects.chart.mobilized} ${award.mobilizedAt}`} />
        )}
        {award.demobilizedAt && (
          <Mark at={award.demobilizedAt} axis={axis} tone="out" title={`${t.projects.chart.demobilized} ${award.demobilizedAt}`} />
        )}
      </div>
    </div>
  );
}

/** The month boundaries, carried down through every row so a bar can be read against them.
 *  Hairlines at 60% of the border colour: a grid you notice is a grid competing with the bars. */
function Grid({ at }: { at?: number[] }) {
  if (!at?.length) return null;
  return (
    <>
      {at.map((x) => (
        <span key={x} aria-hidden className="absolute inset-y-0 w-px bg-border/60" style={{ insetInlineStart: `${x}%` }} />
      ))}
    </>
  );
}

/** Today. Dashed rather than solid, so it reads as a marker across the chart and not as a bar of
 *  its own — the header carries the date it stands for. */
function TodayLine({ at }: { at: number }) {
  return <span aria-hidden className="absolute inset-y-0 border-s border-dashed border-brand" style={{ insetInlineStart: `${at}%` }} />;
}

/** A pin on the bar's top edge. Unlabelled — the date is in the title. */
function Mark({ at, axis, tone, title }: { at: string; axis: Axis; tone: "in" | "out"; title: string }) {
  return (
    <span
      title={title}
      className={`absolute h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-white ${tone === "in" ? "bg-ok" : "bg-warn"}`}
      style={{ insetInlineStart: `${pct(at, axis)}%`, top: "calc(50% - 11px)" }}
    />
  );
}

/* ----------------------------- The un-awarded row ----------------------------- */

export function AwaitingRow({
  group,
  item,
  axis,
  projectWindow,
  today,
  menu,
}: {
  group: ChartGroup;
  item: ChartItem;
  axis: Axis;
  projectWindow: { startDate: string | null; endDate: string | null };
  today?: string;
  grid?: number[];
  menu?: React.ReactNode;
}) {
  const t = useT();
  // Its own window still has to fit on the axis: a work order running three months past the site's
  // end must be visible as a ghost, not clipped off the right edge.
  const start = group.when?.startDate ?? projectWindow.startDate;
  const end = group.when?.endDate ?? projectWindow.endDate;
  const x1 = pct(start, axis);
  const x2 = pct(end, axis);

  return (
    <div className="flex items-stretch border-t border-border">
      <div className="relative flex w-[260px] flex-none flex-col justify-center gap-0.5 py-2 pe-10 ps-3">
        <span className="truncate text-body font-semibold text-navy">
          {item.label} ×{item.quantity}
        </span>
        {/* *Pending*, not *not awarded yet* (owner, 2026-08-31).
            A request that has just gone out has not failed to be awarded — it is waiting, which is
            the normal and expected state for most of its life. Naming it by what has not happened
            yet made a healthy request read like a stalled one. */}
        <span className="truncate text-meta text-muted">{t.projects.chart.pending}</span>
        {menu && <span className="absolute end-1.5 top-1/2 -translate-y-1/2">{menu}</span>}
      </div>

      <div className="relative min-w-0 flex-1 overflow-hidden py-3">
        <Grid at={grid} />
        {today && <TodayLine at={pct(today, axis)} />}
        <span
          className="absolute top-1/2 -translate-y-1/2 truncate rounded-sm border border-dashed border-border-strong bg-surface2 px-2 py-1 text-label font-semibold text-muted"
          style={{ insetInlineStart: `${x1}%`, width: `${Math.max(x2 - x1, 2)}%` }}
        >
          {t.projects.chart.awaiting}
        </span>
      </div>
    </div>
  );
}
