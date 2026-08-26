"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { formatSar, rentalDivisor } from "@/lib/pricing/rental";
import { computeCycleTotals, type CycleTotals } from "@/lib/contract/cycle-totals";
import { cheapest, findTerm, type WorkspaceBid } from "@/lib/contract/workspace";
import { termValueLabel } from "@/lib/contract/labels";
import type { TermRow } from "@/lib/contract/bids";
import { btn } from "@/lib/ds";

/**
 * The Compare tab — every bid on the selected item as a ROW, its figures as columns.
 *
 * **Picking a supplier focuses, it does not award.** The row drives the dark strip above and nothing
 * else; awarding happens in the deal room, which is where the price is settled, and this page never
 * calls `acceptBid`.
 *
 * The money columns come from `computeCycleTotals`, which splits what recurs from what is paid once.
 * A single all-in figure would hide exactly the difference a renter is here to find — free delivery
 * looks dear beside a 6,500 charge until the second month arrives.
 *
 * ── Everything folds, and folds independently (owner's reference, 2026-08-25) ─────────────────────
 * A fixed supplier column on the inline-start edge, then four groups — PER CYCLE, GRAND TOTAL, TERMS,
 * EQUIPMENT — each of which can stand on its edge as a rail, and, inside the money groups, each
 * COLUMN can fold to a rail of its own. That is what lets fourteen columns be read on one screen
 * without scrolling them past each other: the renter keeps what he is comparing and folds the rest.
 * An earlier cut let only one group be open at a time, which meant he could never see the rate and
 * the grand total together — the one comparison the page exists for.
 *
 * Geometry is fixed and shared: every header block is 72px and every data row 52px including its
 * hairline, so a supplier's name stays in line with his figures across groups whose headers differ.
 *
 * Type is the app's own scale: 11px uppercase labels, 13px answers, 15px figures, 10px currency.
 */

/** The four groups. `equipment` never opens here — it is a door to the map (see `openEquipment`). */
type GroupKey = "cycle" | "totals" | "terms" | "equipment";

/** The money columns: sortable, foldable, and the only ones with an amount to order by. */
type ColKey = "rate" | "mob" | "demob" | "firstCycle" | "everyCycle" | "duration";

/** One term column: which keys answer it, and whether the renter set it or the supplier volunteered it. */
const YOU_SET: { label: (t: Dict) => string; keys: string[] }[] = [
  { label: (t) => t.workspace.termOperator, keys: ["operator_included", "operator"] },
  { label: (t) => t.workspace.termFuel, keys: ["fuel_responsibility", "fuel"] },
];
const THEY_OFFERED: { label: (t: Dict) => string; keys: string[] }[] = [
  { label: (t) => t.workspace.termPayment, keys: ["payment_terms", "payment"] },
  { label: (t) => t.workspace.termSla, keys: ["breakdown_response_sla", "breakdown_sla"] },
  { label: (t) => t.workspace.termOvertime, keys: ["overtime_rate", "overtime"] },
  { label: (t) => t.workspace.termNationality, keys: ["operator_nationality", "nationality"] },
];

type Dict = ReturnType<typeof useT>;
type LFn = (en: string, arr: string) => string;

const ROW_PX = 52;
const ROW = "h-[52px] flex-none box-border border-b border-border";
const HEAD = "h-[36px] flex-none box-border border-b border-border";

export function CompareMatrix({
  bids,
  selectedId,
  durationDays,
  startDate,
  onSelect,
  benched,
  onBench,
  ranking,
  rankBusy,
  onRank,
}: {
  bids: WorkspaceBid[];
  selectedId: string | null;
  /** The request's duration — what the third total column is measured over, and named after. */
  durationDays: number | null;
  /** The request's start date. Without it the Fridays cannot be located, so the duration column
   *  falls back to the bare rate and says so rather than claiming a day count. */
  startDate: string | null;
  onSelect: (bidId: string) => void;
  /**
   * Bids taken off the comparison, owned by the WORKSPACE (owner, 2026-08-25).
   *
   * It was local state here, which meant the export beside the tabs covered every bid the renter had
   * just taken off the table in front of him. The bench is also what «Select all» clears, so it has
   * to live where the export can read it.
   */
  benched: Set<string>;
  onBench: (bidId: string, off: boolean) => void;
  /** The agent's pick, held by the workspace so the suggestion bar under the card can read it too. */
  ranking: { bidId: string | null; note: string | null } | null;
  rankBusy: boolean;
  onRank: (bids: WorkspaceBid[]) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L: LFn = (en, arr) => (ar ? arr : en);
  const router = useRouter();

  /** Folded groups. The money opens on the money: the two cost groups, and terms on request. */
  const [shut, setShut] = useState<Set<GroupKey>>(() => new Set<GroupKey>(["terms"]));
  /** Folded money columns, inside an open group. */
  const [shutCols, setShutCols] = useState<Set<ColKey>>(new Set());
  const [popover, setPopover] = useState<"first" | "after" | "duration" | null>(null);

  const toggleGroup = (k: GroupKey) =>
    setShut((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const toggleCol = (k: ColKey) =>
    setShutCols((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  /**
   * ── Which money column orders the table (owner, 2026-08-25) ──────────────────────────────────
   *
   * The default is FIRST CYCLE ascending, which is the reference's own: every money header there
   * carries «↕» except that one, which carries «▲», and its rows follow it. It is also the honest
   * default — cheapest to start is the figure a renter reads first, and the fact that cheapest to
   * FINISH is often a different supplier is exactly what one press on another column reveals.
   */
  const [sortKey, setSortKey] = useState<ColKey>("firstCycle");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const sortBy = (k: ColKey) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(1);
    }
  };

  const bench = useMemo(() => bids.filter((b) => benched.has(b.card.id)), [bids, benched]);

  const totals = useMemo(() => {
    const map = new Map<string, CycleTotals>();
    for (const b of bids) {
      map.set(
        b.card.id,
        computeCycleTotals({
          rate: b.card.price,
          priceUnit: b.card.priceUnit,
          mob: { amount: b.card.mobPrice, units: b.card.mobUnits, excluded: b.card.mobExcluded },
          demob: { amount: b.card.demobPrice, units: b.card.demobUnits, excluded: b.card.demobExcluded },
          durationDays,
          startDate,
          units: b.card.unitsOffered > 0 ? b.card.unitsOffered : b.card.numberOfUnits,
        }),
      );
    }
    return map;
  }, [bids, durationDays, startDate]);

  /**
   * The rows, ordered by the chosen column.
   *
   * A bid that did not quote the sorted figure sorts LAST in both directions — it has not made an
   * offer on that line, and floating it to the top of an ascending sort would read as the cheapest
   * answer to a question it never answered.
   */
  const rows = useMemo(() => {
    const live = bids.filter((b) => !benched.has(b.card.id));
    const value = (b: WorkspaceBid): number | null => {
      const tt = totals.get(b.card.id);
      switch (sortKey) {
        case "rate": return b.card.price ?? null;
        // The two legs are read off the BID rather than the cycle: `oneOff` folds them together, and
        // sorting by "delivery" has to mean delivery, not delivery-plus-return.
        case "mob": return b.card.mobExcluded ? 0 : b.card.mobPrice ?? null;
        case "demob": return b.card.demobExcluded ? 0 : b.card.demobPrice ?? null;
        case "firstCycle": return tt?.firstCycle.total ?? null;
        case "everyCycle": return tt?.everyCycleAfter?.total ?? null;
        case "duration": return tt?.duration?.total ?? null;
      }
    };
    return live.slice().sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * sortDir;
    });
  }, [bids, benched, totals, sortKey, sortDir]);

  const lowRate = useMemo(() => cheapest(rows, (b) => b.card.price), [rows]);
  const lowFirst = useMemo(() => cheapest(rows, (b) => totals.get(b.card.id)?.firstCycle.total ?? null), [rows, totals]);
  const lowAfter = useMemo(() => cheapest(rows, (b) => totals.get(b.card.id)?.everyCycleAfter?.total ?? null), [rows, totals]);
  const lowDuration = useMemo(() => cheapest(rows, (b) => totals.get(b.card.id)?.duration?.total ?? null), [rows, totals]);

  if (bids.length === 0) {
    return (
      <div className="grid min-h-[220px] place-items-center px-4 py-12 text-center">
        <div>
          <Icon name="table_chart" size={30} className="text-muted" />
          <p className="mt-2 text-body font-semibold text-muted">{t.workspace.noBidsYet}</p>
        </div>
      </div>
    );
  }

  /**
   * Where the EQUIPMENT rail goes.
   *
   * Availability is not a column: it is a machine-by-machine question, and the map already answers it
   * in full — pins, papers, the yard a lessor confirmed. So the rail is a door, and it opens on the
   * row the renter is reading; with nothing picked it opens on the first row, which is the one the
   * ordering put in front of him.
   */
  const equipmentTarget = rows.find((b) => b.card.id === selectedId) ?? rows[0] ?? null;
  const openEquipment = () => {
    if (!equipmentTarget) return;
    router.push(`/bids/${encodeURIComponent(equipmentTarget.card.id)}/equipment`);
  };

  /**
   * What the rate column is CALLED — «Monthly», «Weekly», «Daily» — rather than the bare word
   * «Rental» (owner's reference, 2026-08-25). The period is the unit the figure is in, and a column of
   * amounts whose unit is not stated is a column a renter has to guess at. Read off the bids
   * themselves; where they disagree, or none says, it falls back to the neutral word rather than
   * naming a period only some of them quoted in.
   */
  const rateLabel = (() => {
    const units = new Set(rows.map((b) => b.card.priceUnit ?? "").filter(Boolean));
    if (units.size !== 1) return t.workspace.colRate;
    switch ([...units][0]) {
      case "PER_MONTH": return t.workspace.rentalMonthly;
      case "PER_WEEK": return t.workspace.rentalWeekly;
      case "PER_DAY": return t.workspace.rentalDaily;
      case "PER_JOB": return t.workspace.rentalJob;
      default: return t.workspace.colRate;
    }
  })();

  /** The money columns, in the order they read. The duration one exists only if the request has one. */
  const cycleCols: MoneyCol[] = [
    { key: "rate", label: rateLabel, value: (b) => b.card.price, win: lowRate },
    { key: "mob", label: t.priceFooter.mobilisation, value: (b) => (b.card.mobExcluded ? null : b.card.mobPrice), excluded: (b) => !!b.card.mobExcluded },
    { key: "demob", label: t.priceFooter.demobilisation, value: (b) => (b.card.demobExcluded ? null : b.card.demobPrice), excluded: (b) => !!b.card.demobExcluded },
  ];
  const totalCols: MoneyCol[] = [
    { key: "firstCycle", label: t.workspace.firstCycle, value: (b) => totals.get(b.card.id)?.firstCycle.total ?? null, win: lowFirst, vat: true, info: "first" },
    { key: "everyCycle", label: t.workspace.everyCycleAfter, value: (b) => totals.get(b.card.id)?.everyCycleAfter?.total ?? null, win: lowAfter, vat: true, info: "after" },
    ...(durationDays
      ? [{
          key: "duration" as ColKey,
          label: t.workspace.overDays.replace("{n}", String(durationDays)),
          value: (b: WorkspaceBid) => totals.get(b.card.id)?.duration?.total ?? null,
          win: lowDuration,
          vat: true,
          info: "duration" as const,
        }]
      : []),
  ];

  /**
   * A money group, laid out as a row of COLUMN STACKS rather than a stack of rows.
   *
   * Each column owns its header and its own cells, which is what lets a single column fold to a rail
   * that runs the full height of the table — a row-first layout would have to leave a gap in every
   * row and stack the rail's label across them.
   */
  const moneyGroup = (key: GroupKey, label: string, cols: MoneyCol[], tinted?: boolean) => (
    <div className={`flex min-w-0 flex-[3_1_0] flex-col border-s border-border ${tinted ? "" : ""}`}>
      <GroupBand label={label} onFold={() => toggleGroup(key)} tinted={tinted} />
      <div className="flex flex-1">
        {cols.map((c) =>
          shutCols.has(c.key) ? (
            <ColRail key={c.key} label={c.label} hint={t.workspace.showColumn} onClick={() => toggleCol(c.key)} />
          ) : (
            <div key={c.key} className="flex min-w-0 flex-1 flex-col border-e border-border last:border-e-0">
              <MoneyHead
                col={c}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={sortBy}
                onFold={() => toggleCol(c.key)}
                onInfo={c.info ? () => setPopover((p) => (p === c.info ? null : c.info!)) : undefined}
                popover={
                  c.info && popover === c.info ? (
                    <BuildPopover
                      which={c.info}
                      totals={pickTotals(totals, selectedId, rows)}
                      priceUnit={pickBid(selectedId, rows).card.priceUnit}
                      onClose={() => setPopover(null)}
                    />
                  ) : null
                }
              />
              {rows.map((b) => (
                <Money
                  key={b.card.id}
                  v={c.value(b)}
                  win={!!c.win?.has(b.card.id)}
                  vat={c.vat}
                  excluded={c.excluded?.(b)}
                  picked={b.card.id === selectedId}
                />
              ))}
            </div>
          ),
        )}
      </div>
    </div>
  );

  return (
    // The pane no longer scrolls the page for anyone, so a table that outgrows it scrolls itself
    // (owner, 2026-08-25). That is a table's own business: a comparison with twenty rows has to stay
    // readable, and clipping its tail would hide the very figures it exists to line up.
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex items-stretch overflow-x-auto">
        {/* ── The suppliers, on the inline-start edge ── */}
        <div className="w-[185px] flex-none border-e border-border">
          <div className="box-border flex h-[72px] items-end border-b border-border bg-surface2/60 px-3 pb-2">
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="flex-none text-label font-extrabold uppercase tracking-wide text-muted">
                {t.workspace.supplier}
              </span>
              <span className="min-w-0 truncate text-label font-semibold uppercase tracking-wide text-brand">
                {t.workspace.pickOne}
              </span>
            </span>
          </div>

          {rows.map((b) => {
            const picked = b.card.id === selectedId;
            const recommended = ranking?.bidId === b.card.id;
            return (
              <button
                key={b.card.id}
                type="button"
                onClick={() => onSelect(b.card.id)}
                aria-current={picked ? "true" : undefined}
                className={`${ROW} group relative flex w-full items-center gap-2.5 px-3 text-start transition hover:bg-surface2/50 ${
                  picked ? "bg-brand-soft/50" : ""
                }`}
              >
                {picked && <span className="absolute inset-y-0 start-0 w-[3px] bg-brand" />}
                <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-navy text-label font-semibold text-white">
                  {initials(b.card.supplierName)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-body font-extrabold leading-tight text-navy">{b.card.supplierName}</span>
                  <span className={`truncate text-label font-semibold leading-none ${recommended ? "text-ok" : "text-muted"}`}>
                    {recommended
                      ? `★ ${t.workspace.recommended}`
                      : b.source === "offline"
                        ? t.workspace.offlineInvite
                        : b.card.dealRoomId
                          ? t.workspace.inNegotiation
                          : t.workspace.awaitingReply}
                  </span>
                </span>
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onBench(b.card.id, true);
                  }}
                  aria-label={t.workspace.removeColumn}
                  title={t.workspace.removeColumn}
                  className="flex-none rounded px-1 py-0.5 text-body font-semibold text-muted/50 transition hover:bg-danger-soft hover:text-danger"
                >
                  ✕
                </span>
              </button>
            );
          })}
        </div>

        {/* ── The money: what recurs, then what it comes to ── */}
        {shut.has("cycle")
          ? <GroupRail label={t.workspace.perCycle} hint={t.workspace.openCost} onClick={() => toggleGroup("cycle")} glyph="dot" />
          : moneyGroup("cycle", t.workspace.perCycle, cycleCols)}
        {shut.has("totals")
          ? <GroupRail label={t.workspace.grandTotal} hint={t.workspace.openTotals} onClick={() => toggleGroup("totals")} glyph="dot" />
          : moneyGroup("totals", t.workspace.grandTotal, totalCols, true)}

        {/* ── The terms: what the renter asked for, then what suppliers volunteered ── */}
        {shut.has("terms") ? (
          <GroupRail label={t.workspace.groupTerms} hint={t.workspace.openTerms} onClick={() => toggleGroup("terms")} glyph="square" />
        ) : (
          <div className="flex min-w-0 flex-[6_1_0] flex-col overflow-hidden border-s border-border">
            <div className={`${HEAD} flex items-stretch bg-surface2/60`}>
              <div className="flex min-w-0 flex-[2] items-center gap-1.5 px-3">
                <span className="truncate text-label font-extrabold uppercase tracking-wide text-navy-mid">
                  {t.workspace.termsYouSet}
                </span>
                <FoldButton onClick={() => toggleGroup("terms")} hint={t.workspace.hideGroup} />
              </div>
              <div className="flex min-w-0 flex-[4] items-center justify-center gap-2.5 border-s border-border bg-surface3/50 px-3">
                <span className="flex-none text-label font-extrabold uppercase tracking-wide text-navy-mid">
                  {t.workspace.theyOffered}
                </span>
                <button
                  type="button"
                  onClick={() => onRank(rows)}
                  disabled={rankBusy || rows.length === 0}
                  className={`flex-none whitespace-nowrap rounded-full border px-2.5 py-1 text-label font-semibold transition disabled:bg-disabled-bg disabled:text-disabled-fg ${
                    ranking ? "border-ok/40 bg-ok-soft text-ok" : "border-border bg-surface text-navy-mid"
                  }`}
                >
                  ✦ {ranking ? t.workspace.aiRanked : t.workspace.rankWithAi}
                </button>
              </div>
            </div>
            <div className="flex flex-1">
              {YOU_SET.map((col) => (
                <TermColumn key={col.keys[0]} label={col.label(t)} keys={col.keys} rows={rows} selectedId={selectedId} ar={ar} L={L} asked />
              ))}
              {THEY_OFFERED.map((col) => (
                <TermColumn key={col.keys[0]} label={col.label(t)} keys={col.keys} rows={rows} selectedId={selectedId} ar={ar} L={L} />
              ))}
            </div>
          </div>
        )}

        {/* ── Equipment: the one rail that leaves the page ── */}
        <button
          type="button"
          onClick={openEquipment}
          disabled={!equipmentTarget}
          title={t.workspace.checkAvailability}
          aria-label={t.workspace.checkAvailability}
          className="flex w-11 flex-none flex-col items-center justify-center gap-2.5 overflow-hidden border-s border-brand/25 bg-brand-soft transition hover:bg-brand/15 disabled:cursor-default disabled:bg-disabled-bg disabled:text-disabled-fg"
        >
          <span className="grid h-5 w-5 flex-none place-items-center rounded-full border border-brand/30 bg-surface text-brand">
            <Icon name="lock" size={11} />
          </span>
          <span className="rotate-180 truncate text-label font-extrabold uppercase tracking-wide text-brand [writing-mode:vertical-rl]">
            {t.workspace.groupEquipment}
          </span>
        </button>
      </div>

      {/* The bench: bids that are on this item but not on the comparison. */}
      {bench.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 border-t border-border bg-surface2/40 px-3.5 py-2.5">
          {bench.map((b) => (
            <button
              key={b.card.id}
              type="button"
              onClick={() => onBench(b.card.id, false)}
              className={btn("secondary", "sm", { pill: true, className: "flex flex-none pe-3 ps-1 transition" })}
            >
              <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-surface3 text-label font-semibold text-muted">
                {initials(b.card.supplierName)}
              </span>
              <span className="text-meta font-semibold text-navy-mid">{b.card.supplierName}</span>
              <span className="text-body font-semibold text-brand">+</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** One money column: its label, where its figure comes from, and who wins it. */
interface MoneyCol {
  key: ColKey;
  label: string;
  value: (b: WorkspaceBid) => number | null | undefined;
  win?: Set<string>;
  vat?: boolean;
  excluded?: (b: WorkspaceBid) => boolean;
  info?: "first" | "after" | "duration";
}

/** Two initials at most — the avatar is 28px, and a third letter turns it into a word. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  // «Al Ghadeer Heavy» reads as AG, «Murad alabdullah» as M: a leading particle is not a name.
  if (parts.length > 1 && parts[0].length <= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].slice(0, 1).toUpperCase();
}

/** Whose totals the ⓘ panels explain: the picked row, else the first one on the table. */
function pickTotals(totals: Map<string, CycleTotals>, selectedId: string | null, rows: WorkspaceBid[]): CycleTotals {
  return (selectedId ? totals.get(selectedId) : null) ?? totals.get(rows[0].card.id)!;
}

/**
 * The bid those totals belong to — picked by the same rule, so the popover explains the figures it
 * is standing over. It needs the price unit: the divisor in the sentence is 6 on a weekly bid and 26
 * on a monthly one, and reading it off the totals is not possible because they are only money.
 */
function pickBid(selectedId: string | null, rows: WorkspaceBid[]): WorkspaceBid {
  return (selectedId ? rows.find((b) => b.card.id === selectedId) : null) ?? rows[0];
}

/** The word above a group of columns, and the control that folds the group away. */
function GroupBand({ label, onFold, tinted }: { label: string; onFold: () => void; tinted?: boolean }) {
  const t = useT();
  return (
    <div className={`${HEAD} flex items-center justify-center gap-1.5 px-3 ${tinted ? "bg-surface3/50" : "bg-surface2/60"}`}>
      <span className="truncate text-label font-extrabold uppercase tracking-wide text-navy-mid">{label}</span>
      <FoldButton onClick={onFold} hint={t.workspace.hideGroup} />
    </div>
  );
}

/** The «»» beside a label: press it and that group or column stands on its edge. */
function FoldButton({ onClick, hint }: { onClick: () => void; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      aria-label={hint}
      className="flex-none rounded px-1 text-label font-semibold leading-none text-muted/70 transition hover:bg-surface3 hover:text-navy-mid rtl:scale-x-[-1]"
    >
      »
    </button>
  );
}

/**
 * One money column's header.
 *
 * The LABEL is the sort control — the whole word is the target, not a 9px glyph beside it, which is
 * the difference between a sortable table and a table with arrows on it. The arrow states the current
 * direction on the sorted column and sits neutral on the others.
 */
function MoneyHead({
  col,
  sortKey,
  sortDir,
  onSort,
  onFold,
  onInfo,
  popover,
}: {
  col: MoneyCol;
  sortKey: ColKey;
  sortDir: 1 | -1;
  onSort: (k: ColKey) => void;
  onFold: () => void;
  onInfo?: () => void;
  popover?: React.ReactNode;
}) {
  const t = useT();
  const on = col.key === sortKey;
  return (
    <div
      className={`${HEAD} relative flex items-center justify-center gap-1.5 px-2`}
      aria-sort={on ? (sortDir === 1 ? "ascending" : "descending") : undefined}
    >
      <button type="button" onClick={() => onSort(col.key)} className="flex min-w-0 items-center justify-center gap-1.5">
        <span className={`truncate text-label font-semibold uppercase leading-tight tracking-wide ${on ? "text-navy" : "text-muted"}`}>
          {col.label}
        </span>
        <span aria-hidden="true" className={`flex-none text-label font-semibold ${on ? "text-brand" : "text-muted/50"}`}>
          {on ? (sortDir === 1 ? "▲" : "▼") : "↕"}
        </span>
      </button>
      {onInfo && (
        <button
          type="button"
          onClick={onInfo}
          aria-label={col.label}
          className="grid h-4 w-4 flex-none place-items-center rounded-full border border-brand/40 bg-brand-soft text-label font-extrabold text-brand"
        >
          i
        </button>
      )}
      <FoldButton onClick={onFold} hint={t.workspace.hideColumn} />
      {popover}
    </div>
  );
}

/** One figure. Winners carry the green ground; the totals carry «with VAT» under them. */
function Money({ v, win, vat, excluded, picked }: { v: number | null | undefined; win: boolean; vat?: boolean; excluded?: boolean | null; picked?: boolean }) {
  const t = useT();
  return (
    <div
      className={`${ROW} relative flex items-center justify-center overflow-hidden px-2 ${
        win ? "bg-ok-soft/70" : picked ? "bg-brand-soft/25" : ""
      }`}
    >
      {v == null ? (
        <span className="truncate text-body font-semibold text-muted">
          {excluded ? t.priceFooter.excluded : t.workspace.didntSay}
        </span>
      ) : (
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className={`truncate text-subhead font-extrabold leading-none ${win ? "text-ok" : "text-navy"}`}>
            {formatSar(v)}
          </span>
          <span className={`flex-none text-label font-semibold leading-none ${win ? "text-ok/80" : "text-muted"}`}>
            {t.priceFooter.currency}
          </span>
        </span>
      )}
      {vat && v != null && (
        <span className={`absolute bottom-1 end-2 text-label font-semibold uppercase tracking-wide ${win ? "text-ok/70" : "text-muted/70"}`}>
          {t.workspace.withVat}
        </span>
      )}
    </div>
  );
}

/**
 * One term, down the table.
 *
 * **The column speaks once when every supplier said the same thing.** Three cells reading «Included»
 * is three readings of one fact; merged, it says the fact and then says that nobody differs — which
 * is the answer a renter is actually looking for on a term he set.
 */
function TermColumn({
  label,
  keys,
  rows,
  selectedId,
  ar,
  L,
  asked,
}: {
  label: string;
  keys: string[];
  rows: WorkspaceBid[];
  selectedId: string | null;
  ar: boolean;
  L: LFn;
  /** A term the RENTER set: its header carries what he asked for, under the label. */
  asked?: boolean;
}) {
  const t = useT();
  const answers = rows.map((b) => readTerm(findTerm(b.card, keys), keys[0], ar, t, L));
  const askedFor = asked
    ? rows.map((b) => humanTerm(findTerm(b.card, keys)?.renteeValue ?? null, keys[0], t, L)).find((v): v is string => !!v) ?? null
    : null;
  const first = answers[0];
  const merged = answers.length > 1 && first.text != null && answers.every((a) => a.text === first.text && !a.against);

  return (
    <div className="flex min-w-0 flex-1 flex-col border-e border-border last:border-e-0">
      <div className={`${HEAD} flex items-center gap-1.5 bg-surface/60 px-3`}>
        <span className="flex-none text-label font-semibold uppercase leading-tight tracking-wide text-muted">{label}</span>
        {askedFor && (
          <span className="min-w-0 truncate text-label font-semibold leading-tight text-muted/80">
            {t.workspace.youAsked} · {askedFor}
          </span>
        )}
      </div>

      {merged ? (
        <div style={{ height: rows.length * ROW_PX }} className="flex flex-none flex-col items-center justify-center gap-1 bg-surface/40 px-3">
          <span className="text-center text-body font-semibold leading-snug text-muted">{first.text}</span>
          <span className="text-center text-label font-semibold leading-snug text-muted/80">
            {t.workspace.sameFromAll.replace("{n}", String(rows.length))}
          </span>
        </div>
      ) : (
        rows.map((b, i) => {
          const a = answers[i];
          const picked = b.card.id === selectedId;
          return (
            <div
              key={b.card.id}
              className={`${ROW} flex items-center gap-1.5 px-3 ${a.against ? "bg-danger-soft" : picked ? "bg-brand-soft/25" : ""}`}
            >
              <span
                className={`truncate text-body leading-snug ${
                  a.against ? "font-semibold text-danger" : a.text ? "font-semibold text-navy" : "font-semibold text-muted"
                }`}
              >
                {a.text ?? t.workspace.didntSay}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

/**
 * A term as the supplier answered it, and whether it goes against what the renter asked.
 *
 * ── The value is READ, never printed raw (owner, 2026-08-25) ────────────────────────────────────
 * The wire says `NO`, `supplier`, `net_0`; the table was printing exactly that, so a renter comparing
 * offers was reading the database. Three passes, in order: the app's own vocabularies keyed by the
 * term; the create flow's payment labels; then a last tidy for yes/no and underscores. A value none
 * of them can name comes back tidied, not invented.
 */
function readTerm(row: TermRow | null, key: string, ar: boolean, t: Dict, L: LFn): { text: string | null; against: boolean } {
  const raw = row?.value ?? (row?.detail ? (ar ? row.detail.ar : row.detail.en) : null) ?? row?.renteeValue ?? null;
  return { text: humanTerm(raw, row?.key ?? key, t, L), against: !!row && row.state === "conflict" };
}

function humanTerm(raw: string | null, key: string, t: Dict, L: LFn): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;

  const known = termValueLabel(key, v, L);
  if (known && known !== v) return known;

  const token = v.toLowerCase().replace(/[_\s]+/g, "-");
  if (/payment/.test(key)) {
    const pay = (t.options.paymentTerm as Record<string, string | undefined>)[token];
    if (pay) return pay;
  }
  if (token === "yes" || token === "true") return t.workspace.termYes;
  if (token === "no" || token === "false") return t.workspace.termNo;

  const opened = v.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return opened.charAt(0).toUpperCase() + opened.slice(1);
}

/**
 * A folded GROUP, standing on its edge — press it to bring the columns back.
 *
 * Neutral surface, as the reference draws it: these rails hold what the table itself is made of, and
 * the one coloured rail on the row is the one that leaves the page. The glyph is the group's own mark
 * so two folded rails are told apart at a glance without reading them sideways.
 */
function GroupRail({
  label,
  hint,
  onClick,
  glyph,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  glyph: "dot" | "square";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      aria-label={hint}
      className="group flex w-11 flex-none flex-col items-center justify-center gap-2.5 overflow-hidden border-s border-border bg-surface2/70 transition hover:bg-surface3"
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 flex-none bg-muted/60 transition group-hover:bg-navy-mid ${glyph === "dot" ? "rounded-full" : "rounded-sm"}`}
      />
      <span className="rotate-180 truncate text-label font-extrabold uppercase tracking-wide text-navy-mid [writing-mode:vertical-rl]">
        {label}
      </span>
    </button>
  );
}

/** A folded COLUMN, inside an open group. Narrower than a group rail, and lighter. */
function ColRail({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      aria-label={`${label} — ${hint}`}
      className="flex w-8 flex-none items-center justify-center overflow-hidden border-e border-border bg-surface2/40 transition last:border-e-0 hover:bg-surface3/70"
    >
      <span className="rotate-180 truncate text-label font-semibold uppercase tracking-wide text-muted [writing-mode:vertical-rl]">
        {label}
      </span>
    </button>
  );
}

/** The panel behind a total's ⓘ: the lines that figure was built from, and nothing else. */
function BuildPopover({
  which,
  totals,
  priceUnit,
  onClose,
}: {
  which: "first" | "after" | "duration";
  totals: CycleTotals;
  priceUnit: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const part = which === "first" ? totals.firstCycle : which === "after" ? totals.everyCycleAfter : totals.duration;
  if (!part) return null;
  const dur = totals.duration;
  const heading =
    which === "first" ? t.workspace.howFirstCycle
    : which === "after" ? t.workspace.howEveryCycle
    : t.workspace.howDuration.replace("{n}", String(dur?.days ?? 0));
  /**
   * The duration column charges billable days, so it names them — and it names the divisor it
   * actually used (owner, 2026-08-26). That number was the literal 26 in both bundles, so a weekly
   * bid read «Rental ÷ 26 × 11 billable days» over a figure built on ÷ 6. Anyone who checked the
   * sentence got 1,777 where the column said 8,855.
   *
   * A divisor of 1 or 0 has no division to explain — daily bills every billable day at its rate, and
   * a per-job price has no period at all — so those take the sentence without it rather than printing
   * «÷ 1» or «÷ 0».
   *
   * Where the rental could not be prorated at all it stays the bare rate and claims no day count,
   * because there is none to claim.
   */
  const divisor = rentalDivisor(priceUnit);
  const rentalLabel =
    which === "duration" && dur && !dur.raw
      ? divisor > 1
        ? t.workspace.rentalOverDays.replace("{d}", String(divisor)).replace("{n}", String(dur.billableDays))
        : t.workspace.rentalOverDaysFlat.replace("{n}", String(dur.billableDays))
      : t.workspace.colRate;

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute end-0 top-[34px] z-40 flex w-[250px] flex-col gap-2 rounded-lg border border-border bg-surface px-3.5 py-3 text-start">
        <div className="flex items-baseline gap-2.5">
          <span className="flex-1 text-label font-extrabold uppercase tracking-wide text-muted">{heading}</span>
          <button type="button" onClick={onClose} aria-label={t.common.cancel} className="text-body font-semibold text-muted/60">
            ✕
          </button>
        </div>
        <Line label={rentalLabel} v={part.rental} />
        <Line
          label={t.workspace.transportOnce}
          v={part.oneOff}
          // "Paid once, cycle 1" — not a zero. A zero here would read as free delivery.
          note={which === "after" ? t.workspace.paidOnce : undefined}
        />
        <Line label={t.priceFooter.subtotal} v={part.subtotal} />
        <Line label={t.priceFooter.vat} v={part.vat} />
        <div className="mt-0.5 flex items-baseline justify-between gap-3 border-t border-border pt-2">
          <span className="text-meta font-extrabold text-navy">{t.priceFooter.total}</span>
          <span className="text-body font-extrabold text-navy">{formatSar(part.total)}</span>
        </div>
        <p className="text-label font-semibold leading-snug text-muted">
          {t.workspace.vatNote}
          {which === "duration" && dur && !dur.raw && (
            <> {t.workspace.fridaysNote.replace("{days}", String(dur.days)).replace("{billable}", String(dur.billableDays))}</>
          )}
        </p>
      </div>
    </>
  );
}

function Line({ label, v, note }: { label: string; v: number; note?: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="flex-1 text-meta font-semibold leading-snug text-navy-mid">{label}</span>
      <span className="flex-none whitespace-nowrap text-meta font-semibold leading-snug text-navy">
        {note ?? formatSar(v)}
      </span>
    </div>
  );
}
