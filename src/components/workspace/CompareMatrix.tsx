"use client";

import { useMemo, useState } from "react";
import { useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { formatSar } from "@/lib/pricing/rental";
import { computeCycleTotals, type CycleTotals } from "@/lib/contract/cycle-totals";
import { buildItemComparison } from "@/lib/contract/comparison";
import { bidColumnToComputed } from "@/lib/contract/agent-bids";
import { recommendBids } from "@/lib/api/client";
import { cheapest, findTerm, type WorkspaceBid } from "@/lib/contract/workspace";
import type { TermRow } from "@/lib/contract/bids";

/**
 * The Compare tab — every bid on the selected item as a row, its figures as columns.
 *
 * **Picking a supplier focuses, it does not award.** The radio drives the dark strip above and
 * nothing else; awarding happens in the deal room, which is where the price is settled, and this
 * page never calls `acceptBid`.
 *
 * The money columns come from `computeCycleTotals`, which splits what recurs from what is paid once.
 * A single all-in figure would hide exactly the difference a renter is here to find — free delivery
 * looks dear beside a 6,500 charge until the second month arrives.
 */

/** The four column groups, in the order the matrix reads. */
type GroupKey = "cycle" | "totals" | "asked" | "offered";

/** The money columns the table can be ordered by. Terms are not among them: they are answers, not
 *  amounts, and there is no order to put "didn't say" in. */
type SortKey = "rate" | "mob" | "demob" | "firstCycle" | "everyCycle" | "duration";

export function CompareMatrix({
  bids,
  selectedId,
  durationDays,
  startDate,
  onSelect,
  benched,
  onBench,
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
   * It was local state here, which meant the export beside the tabs covered every bid the source
   * filter allowed — including ones the renter had just taken off the table in front of him. The
   * bench is also what «Select all» clears, so it has to live where the export can read it.
   */
  benched: Set<string>;
  onBench: (bidId: string, off: boolean) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";

  // Bids on the bench sit below the table and can be put back. Removing is a reading convenience —
  // it never withdraws anything; the set itself is the workspace's, so the export honours it too.
  const [collapsed, setCollapsed] = useState<Set<GroupKey>>(new Set());
  const [popover, setPopover] = useState<string | null>(null);
  const [ranking, setRanking] = useState<{ bidId: string | null; note: string | null } | null>(null);
  const [ranking_busy, setRankingBusy] = useState(false);

  /**
   * ── Which money column orders the table (owner, 2026-08-25) ──────────────────────────────────
   *
   * The default is FIRST CYCLE ascending, which is the prototype's own: every money header there
   * carries «↕» except that one, which carries «▲», and its rows follow it. It is also the honest
   * default — cheapest to start is the figure a renter reads first, and the fact that cheapest to
   * FINISH is often a different supplier is exactly what one press on another column reveals.
   *
   * Ordering is a reading convenience and nothing more: it awards nothing, moves no selection and
   * touches no bid. The bench below the table is unsorted, because a benched bid is not in the
   * comparison being ordered.
   */
  const [sortKey, setSortKey] = useState<SortKey>("firstCycle");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const sortBy = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(1); }
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
          mob: { amount: b.card.mobPrice, excluded: b.card.mobExcluded },
          demob: { amount: b.card.demobPrice, excluded: b.card.demobExcluded },
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
  const lowDuration = useMemo(() => cheapest(rows, (b) => totals.get(b.card.id)?.duration?.total ?? null), [rows, totals]);

  const toggleGroup = (k: GroupKey) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  /** Ask the agent to rank what is on the matrix. The web owns every figure it sends. */
  const rank = async () => {
    if (ranking_busy || rows.length === 0) return;
    setRankingBusy(true);
    try {
      const { columns } = buildItemComparison(rows.map((r) => r.card), { requestDurationDays: durationDays ?? undefined });
      const res = await recommendBids({ bids: columns.map(bidColumnToComputed) });
      const rec = res.result?.recommendation ?? null;
      // The agent's own pick, and its first reason in its own words — not a paraphrase.
      setRanking({
        bidId: rec?.pick_bid_id ?? res.result?.ranking?.[0]?.bid_id ?? null,
        note: rec?.reasons?.[0]?.text ?? res.result?.interpretation ?? null,
      });
    } catch {
      setRanking(null);
    } finally {
      setRankingBusy(false);
    }
  };

  if (bids.length === 0) {
    return (
      <div className="grid min-h-[220px] place-items-center px-4 py-12 text-center">
        <div>
          <Icon name="table_chart" size={30} className="text-muted" />
          <p className="mt-2 text-[13px] font-semibold text-muted">{t.workspace.noBidsYet}</p>
        </div>
      </div>
    );
  }

  const money = (v: number | null | undefined, win: boolean) =>
    v == null ? (
      <span className="text-muted">{t.workspace.didntSay}</span>
    ) : (
      <span className={win ? "font-black text-ok" : "font-extrabold text-navy"}>
        {formatSar(v)} <span className="text-[10px] font-bold text-muted">{t.priceFooter.currency}</span>
      </span>
    );

  return (
    <div className="p-3 sm:p-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            {/* Group headers. Each one collapses its columns to a labelled rail. */}
            <tr>
              <th className="sticky start-0 z-10 bg-surface" />
              <Group k="cycle" label={t.workspace.perCycle} span={3} collapsed={collapsed} onToggle={toggleGroup} />
              <Group k="totals" label={t.workspace.grandTotal} span={durationDays ? 3 : 2} collapsed={collapsed} onToggle={toggleGroup} />
              <Group k="asked" label={t.workspace.termsYouSet} span={2} collapsed={collapsed} onToggle={toggleGroup} />
              <Group k="offered" label={t.workspace.theyOffered} span={4} collapsed={collapsed} onToggle={toggleGroup} extra={
                <button
                  type="button"
                  onClick={() => void rank()}
                  disabled={ranking_busy}
                  className="ms-2 inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[10.5px] font-bold text-navy-mid disabled:opacity-50"
                >
                  <Icon name="auto_awesome" size={12} /> {t.workspace.rankWithAi}
                </button>
              } />
              {/* Delayed by decision: drawn as mocked, inert. */}
              <th className="w-[38px] border-b border-border bg-brand-soft px-1 py-2 align-bottom" title={t.workspace.notBuiltYet}>
                <Icon name="lock" size={13} className="text-brand" />
              </th>
            </tr>
            <tr className="text-[10.5px] font-extrabold uppercase tracking-wide text-muted">
              <th className="sticky start-0 z-10 min-w-[190px] border-b border-border bg-surface px-2 py-2 text-start">
                {t.workspace.supplierPickOne}
              </th>
              {!collapsed.has("cycle") && (
                <>
                  <Col label={t.workspace.colRate} sort="rate" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} />
                  <Col label={t.priceFooter.mobilisation} sort="mob" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} />
                  <Col label={t.priceFooter.demobilisation} sort="demob" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} />
                </>
              )}
              {!collapsed.has("totals") && (
                <>
                  <Col label={t.workspace.firstCycle} info onInfo={() => setPopover(popover === "first" ? null : "first")} sort="firstCycle" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} />
                  <Col label={t.workspace.everyCycleAfter} info onInfo={() => setPopover(popover === "after" ? null : "after")} sort="everyCycle" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} />
                  {durationDays ? (
                    <Col
                      label={t.workspace.overDays.replace("{n}", String(durationDays))}
                      info
                      onInfo={() => setPopover(popover === "duration" ? null : "duration")}
                      sort="duration"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={sortBy}
                    />
                  ) : null}
                </>
              )}
              {!collapsed.has("asked") && (
                <>
                  <Col label={t.workspace.termOperator} />
                  <Col label={t.workspace.termFuel} />
                </>
              )}
              {!collapsed.has("offered") && (
                <>
                  <Col label={t.workspace.termPayment} />
                  <Col label={t.workspace.termSla} />
                  <Col label={t.workspace.termOvertime} />
                  <Col label={t.workspace.termNationality} />
                </>
              )}
              <th className="border-b border-border bg-brand-soft" />
            </tr>
          </thead>

          <tbody>
            {rows.map((b) => {
              const tot = totals.get(b.card.id);
              const picked = b.card.id === selectedId;
              return (
                <tr key={b.card.id} className={picked ? "bg-brand-soft/40" : undefined}>
                  <th
                    scope="row"
                    className={`sticky start-0 z-10 border-b border-border px-2 py-2 text-start font-normal ${picked ? "bg-brand-soft" : "bg-surface"}`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="compare-pick"
                        checked={picked}
                        onChange={() => onSelect(b.card.id)}
                        aria-label={b.card.supplierName}
                        className="h-3.5 w-3.5 flex-none accent-[var(--brand)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-extrabold text-navy">{b.card.supplierName}</span>
                        <span className="block truncate text-[10.5px] font-bold text-muted">
                          {ranking?.bidId === b.card.id ? (
                            <span className="text-ok">★ {t.workspace.recommended}</span>
                          ) : b.source === "offline" ? (
                            t.workspace.sourceOfflineLong
                          ) : b.card.dealRoomId ? (
                            t.workspace.inNegotiation
                          ) : (
                            t.workspace.awaitingReply
                          )}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onBench(b.card.id, true)}
                        aria-label={t.workspace.removeColumn}
                        title={t.workspace.removeColumn}
                        className="grid h-5 w-5 flex-none place-items-center rounded-full text-muted transition hover:bg-surface2 hover:text-navy"
                      >
                        <Icon name="close" size={13} />
                      </button>
                    </div>
                  </th>

                  {!collapsed.has("cycle") && (
                    <>
                      <Cell>{money(b.card.price, lowRate.has(b.card.id))}</Cell>
                      <Cell>{b.card.mobExcluded ? <span className="text-muted">{t.priceFooter.excluded}</span> : money(b.card.mobPrice, false)}</Cell>
                      <Cell>{b.card.demobExcluded ? <span className="text-muted">{t.priceFooter.excluded}</span> : money(b.card.demobPrice, false)}</Cell>
                    </>
                  )}
                  {!collapsed.has("totals") && (
                    <>
                      <Cell>{money(tot?.firstCycle.total, lowFirst.has(b.card.id))}</Cell>
                      <Cell>{money(tot?.everyCycleAfter?.total ?? null, false)}</Cell>
                      {durationDays ? <Cell>{money(tot?.duration?.total ?? null, lowDuration.has(b.card.id))}</Cell> : null}
                    </>
                  )}
                  {!collapsed.has("asked") && (
                    <>
                      <TermCell row={findTerm(b.card, ["operator_included", "operator"])} ar={ar} />
                      <TermCell row={findTerm(b.card, ["fuel_responsibility", "fuel"])} ar={ar} />
                    </>
                  )}
                  {!collapsed.has("offered") && (
                    <>
                      <TermCell row={findTerm(b.card, ["payment_terms", "payment"])} ar={ar} />
                      <TermCell row={findTerm(b.card, ["breakdown_response_sla", "breakdown_sla"])} ar={ar} />
                      <TermCell row={findTerm(b.card, ["overtime_rate", "overtime"])} ar={ar} />
                      <TermCell row={findTerm(b.card, ["operator_nationality", "nationality"])} ar={ar} />
                    </>
                  )}
                  <td className="border-b border-border bg-brand-soft" />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* How each total is built — the same lines the figure was added from, in the same order. */}
      {popover && rows[0] && (
        <BuildPopover
          which={popover}
          totals={totals.get(selectedId ?? rows[0].card.id) ?? totals.get(rows[0].card.id)!}
          onClose={() => setPopover(null)}
        />
      )}

      {/* The bench: bids that are on this item but not on the matrix. */}
      {bench.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {bench.map((b) => (
            <button
              key={b.card.id}
              type="button"
              onClick={() => onBench(b.card.id, false)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-bold text-navy-mid transition hover:border-navy-mid"
            >
              {b.card.supplierName} <Icon name="add" size={14} />
            </button>
          ))}
        </div>
      )}

      {ranking?.note && (
        <p className="mt-3 inline-flex items-start gap-1.5 rounded-full bg-surface2 px-3 py-1.5 text-[12px] font-semibold text-navy-mid">
          <Icon name="auto_awesome" size={14} className="mt-[1px] flex-none text-brand" /> {ranking.note}
        </p>
      )}
    </div>
  );
}

function Group({
  k,
  label,
  span,
  collapsed,
  onToggle,
  extra,
}: {
  k: GroupKey;
  label: string;
  span: number;
  collapsed: Set<GroupKey>;
  onToggle: (k: GroupKey) => void;
  extra?: React.ReactNode;
}) {
  const isOn = !collapsed.has(k);
  return (
    <th
      colSpan={isOn ? span : 1}
      className="border-b border-border bg-surface2 px-2 py-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-navy-mid"
    >
      <span className="inline-flex items-center gap-1">
        <button type="button" onClick={() => onToggle(k)} className="inline-flex items-center gap-1 hover:text-navy">
          {isOn ? label : <span className="[writing-mode:vertical-rl] py-2">{label}</span>}
          <Icon name={isOn ? "unfold_less" : "unfold_more"} size={13} className="rotate-90" />
        </button>
        {isOn && extra}
      </span>
    </th>
  );
}

/**
 * One money column's header.
 *
 * `sort` makes the LABEL the control — the whole word is the target, not a 13px glyph beside it,
 * which is the difference between a sortable table and a table with arrows on it. The arrow states
 * the current direction on the sorted column and sits neutral on the others, so a reader can see at
 * a glance both that the table is ordered and what it is ordered by.
 */
function Col({
  label,
  info,
  onInfo,
  sort,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  info?: boolean;
  onInfo?: () => void;
  sort?: SortKey;
  sortKey?: SortKey;
  sortDir?: 1 | -1;
  onSort?: (k: SortKey) => void;
}) {
  const on = sort != null && sort === sortKey;
  return (
    <th
      className="min-w-[104px] border-b border-border bg-surface px-2 py-2 text-start align-bottom"
      aria-sort={on ? (sortDir === 1 ? "ascending" : "descending") : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {sort && onSort ? (
          <button
            type="button"
            onClick={() => onSort(sort)}
            className={`inline-flex items-center gap-1 ${on ? "text-navy" : "hover:text-navy"}`}
          >
            {label}
            <span aria-hidden="true" className={on ? "text-brand" : "text-muted/60"}>
              {on ? (sortDir === 1 ? "▲" : "▼") : "↕"}
            </span>
          </button>
        ) : (
          label
        )}
        {info && (
          <button type="button" onClick={onInfo} aria-label={label} className="text-brand">
            <Icon name="info" size={13} />
          </button>
        )}
      </span>
    </th>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="whitespace-nowrap border-b border-border px-2 py-2.5">{children}</td>;
}

/** A term as the supplier answered it. No answer is said out loud rather than left blank — a blank
 *  cell reads as "nothing to pay", and an unanswered term is not the same fact. */
function TermCell({ row, ar }: { row: TermRow | null; ar: boolean }) {
  const t = useT();
  const text = row?.value ?? (row?.detail ? (ar ? row.detail.ar : row.detail.en) : null) ?? row?.renteeValue ?? null;
  if (!row || !text) {
    return (
      <td className="whitespace-nowrap border-b border-border px-2 py-2.5 text-muted">{t.workspace.didntSay}</td>
    );
  }
  const against = row.state === "conflict";
  return (
    <td className={`whitespace-nowrap border-b border-border px-2 py-2.5 font-semibold ${against ? "bg-danger-soft text-danger" : "text-navy"}`}>
      {text}
    </td>
  );
}

/** The popover behind a total's ⓘ: the lines that figure was built from, and nothing else. */
function BuildPopover({ which, totals, onClose }: { which: string; totals: CycleTotals; onClose: () => void }) {
  const t = useT();
  const part = which === "first" ? totals.firstCycle : which === "after" ? totals.everyCycleAfter : totals.duration;
  if (!part) return null;
  const dur = totals.duration;
  const heading =
    which === "first" ? t.workspace.howFirstCycle
    : which === "after" ? t.workspace.howEveryCycle
    : t.workspace.howDuration.replace("{n}", String(dur?.days ?? 0));
  // The duration column charges billable days, so it names them: "Rental ÷ 26 × 154 days". Where the
  // rental could not be prorated at all — no start date, or a per-job price — it stays the bare rate
  // and claims no day count, because there is none to claim.
  const rentalLabel =
    which === "duration" && dur && !dur.raw
      ? t.workspace.rentalOverDays.replace("{n}", String(dur.billableDays))
      : t.workspace.colRate;

  return (
    <div className="relative">
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute z-40 mt-2 w-[330px] rounded-[14px] border border-border bg-surface p-4 shadow-lg">
        <div className="flex items-start justify-between gap-2">
          <b className="text-[11px] font-extrabold uppercase tracking-wide text-navy-mid">{heading}</b>
          <button type="button" onClick={onClose} aria-label={t.common.cancel} className="text-muted">
            <Icon name="close" size={16} />
          </button>
        </div>
        <dl className="mt-3 space-y-1.5 text-[13px]">
          <Line label={rentalLabel} v={part.rental} />
          <Line
            label={t.workspace.transportOnce}
            v={part.oneOff}
            // "Paid once, cycle 1" — not a zero. A zero here would read as free delivery.
            note={which === "after" ? t.workspace.paidOnce : undefined}
          />
          <Line label={t.priceFooter.subtotal} v={part.subtotal} />
          <Line label={t.priceFooter.vat} v={part.vat} />
          <div className="!mt-2.5 flex items-center justify-between border-t border-border pt-2.5 text-[14px] font-black text-navy">
            <span>{t.priceFooter.total}</span>
            <span>{formatSar(part.total)}</span>
          </div>
        </dl>
        <p className="mt-2 text-[11px] font-semibold leading-snug text-muted">
          {t.workspace.vatNote}
          {which === "duration" && dur && !dur.raw && (
            <> {t.workspace.fridaysNote.replace("{days}", String(dur.days)).replace("{billable}", String(dur.billableDays))}</>
          )}
        </p>
      </div>
    </div>
  );
}

function Line({ label, v, note }: { label: string; v: number; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-navy-mid">{label}</dt>
      <dd className="flex-none font-bold text-navy">{note ?? formatSar(v)}</dd>
    </div>
  );
}
