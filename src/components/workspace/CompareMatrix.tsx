"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { formatSar } from "@/lib/pricing/rental";
import { computeCycleTotals, type CycleTotals } from "@/lib/contract/cycle-totals";
import { cheapest, findTerm, type WorkspaceBid } from "@/lib/contract/workspace";
import type { TermRow } from "@/lib/contract/bids";

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
 * ── The shape is the prototype's (owner, 2026-08-25: "match the prototype exactly") ──────────────
 * A fixed 180px supplier column on the inline-start edge, then ONE group of columns open at a time;
 * the others stand as 52px vertical rails you press to swap to. It replaced a single wide HTML table
 * whose fourteen columns had to be scrolled past each other — the rails are what let a renter read
 * the money and the terms at the same width, and a rail can carry a full-height merged cell and a
 * lock, neither of which a `<table>` can span across its own header.
 *
 * Geometry is fixed and shared: the supplier header and every group header are 70px, every data row
 * is 49px including its hairline. That is what keeps a row's name in line with its figures when the
 * groups have different numbers of header rows.
 */

/** The three column groups. Exactly one of the first two is open; equipment is always a locked rail. */
type GroupKey = "cost" | "terms" | "equipment";

/** The money columns the table can be ordered by. Terms are not among them: they are answers, not
 *  amounts, and there is no order to put "didn't say" in. */
type SortKey = "rate" | "mob" | "demob" | "firstCycle" | "everyCycle" | "duration";

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

/** Row height, and the header block above it. Both are shared by every group, so the rows line up. */
const ROW = "h-[49px] flex-none box-border border-b border-border/70";
const HEAD = "h-[35px] flex-none box-border border-b border-border/70";

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
  const router = useRouter();

  /** Which group of columns is open. Cost first: it is the question the renter came with. */
  const [section, setSection] = useState<Exclude<GroupKey, "equipment">>("cost");
  const [popover, setPopover] = useState<"first" | "after" | "duration" | null>(null);

  /**
   * ── Which money column orders the table (owner, 2026-08-25) ──────────────────────────────────
   *
   * The default is FIRST CYCLE ascending, which is the prototype's own: every money header there
   * carries «↕» except that one, which carries «▲», and its rows follow it. It is also the honest
   * default — cheapest to start is the figure a renter reads first, and the fact that cheapest to
   * FINISH is often a different supplier is exactly what one press on another column reveals.
   */
  const [sortKey, setSortKey] = useState<SortKey>("firstCycle");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const sortBy = (k: SortKey) => {
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
  const lowAfter = useMemo(() => cheapest(rows, (b) => totals.get(b.card.id)?.everyCycleAfter?.total ?? null), [rows, totals]);
  const lowDuration = useMemo(() => cheapest(rows, (b) => totals.get(b.card.id)?.duration?.total ?? null), [rows, totals]);

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

  /**
   * Where the locked EQUIPMENT rail goes (owner, 2026-08-25).
   *
   * Availability is not a column here: it is a machine-by-machine question, and the map already
   * answers it in full — pins, papers, the yard a lessor confirmed. So the rail is a door rather
   * than a group, and it opens on the row the renter is reading; with nothing picked it opens on the
   * first row, which is the one the ordering put in front of him.
   */
  const equipmentTarget = rows.find((b) => b.card.id === selectedId) ?? rows[0] ?? null;
  const openEquipment = () => {
    if (!equipmentTarget) return;
    router.push(`/bids/${encodeURIComponent(equipmentTarget.card.id)}/equipment`);
  };

  return (
    <div>
      <div className="flex items-stretch">
        {/* ── The suppliers, fixed on the inline-start edge ── */}
        <div className="w-[180px] flex-none border-e border-border/70">
          <div className="box-border flex h-[70px] items-end border-b border-border/70 bg-surface2/60 px-3 pb-2.5">
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="flex-none text-[9px] font-bold uppercase tracking-[.06em] text-muted">
                {t.workspace.supplier}
              </span>
              <span className="min-w-0 truncate text-[8px] font-bold uppercase tracking-[.04em] text-brand">
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
                <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-navy text-[9.5px] font-bold text-white">
                  {initials(b.card.supplierName)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="truncate text-[12.5px] font-extrabold leading-[1.15] text-navy">{b.card.supplierName}</span>
                  <span className={`truncate text-[9px] font-semibold leading-none ${recommended ? "text-ok" : "text-muted"}`}>
                    {recommended
                      ? `★ ${t.workspace.recommended}`
                      : b.source === "offline"
                        ? t.workspace.sourceOfflineLong
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
                  className="flex-none rounded px-[3px] py-[2px] text-[11px] font-semibold text-border transition hover:bg-danger-soft hover:text-danger"
                >
                  ✕
                </span>
              </button>
            );
          })}
        </div>

        {/* ── The money ── */}
        {section === "cost" ? (
          <div className="flex min-w-0 flex-[6_1_0] flex-col">
            <div className={`${HEAD} flex items-stretch bg-surface2/60`}>
              <Band label={t.workspace.perCycle} grow={3} />
              <Band label={t.workspace.grandTotal} grow={durationDays ? 3 : 2} tinted />
            </div>
            <div className={`${HEAD} relative flex bg-surface/60`}>
              <MoneyHead label={t.workspace.colRate} sort="rate" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} />
              <MoneyHead label={t.priceFooter.mobilisation} sort="mob" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} />
              <MoneyHead label={t.priceFooter.demobilisation} sort="demob" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} />
              <MoneyHead
                label={t.workspace.firstCycle}
                sort="firstCycle"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={sortBy}
                info
                onInfo={() => setPopover((p) => (p === "first" ? null : "first"))}
                popover={
                  popover === "first" ? (
                    <BuildPopover which="first" totals={pickTotals(totals, selectedId, rows)} onClose={() => setPopover(null)} />
                  ) : null
                }
              />
              <MoneyHead
                label={t.workspace.everyCycleAfter}
                sort="everyCycle"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={sortBy}
                info
                onInfo={() => setPopover((p) => (p === "after" ? null : "after"))}
                popover={
                  popover === "after" ? (
                    <BuildPopover which="after" totals={pickTotals(totals, selectedId, rows)} onClose={() => setPopover(null)} />
                  ) : null
                }
              />
              {durationDays ? (
                <MoneyHead
                  label={t.workspace.overDays.replace("{n}", String(durationDays))}
                  sort="duration"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={sortBy}
                  info
                  onInfo={() => setPopover((p) => (p === "duration" ? null : "duration"))}
                  popover={
                    popover === "duration" ? (
                      <BuildPopover which="duration" totals={pickTotals(totals, selectedId, rows)} onClose={() => setPopover(null)} />
                    ) : null
                  }
                />
              ) : null}
            </div>

            {rows.map((b) => {
              const tot = totals.get(b.card.id);
              const picked = b.card.id === selectedId;
              return (
                <div key={b.card.id} className={`${ROW} flex ${picked ? "bg-brand-soft/25" : ""}`}>
                  <Money v={b.card.price} win={lowRate.has(b.card.id)} />
                  <Money v={b.card.mobExcluded ? null : b.card.mobPrice} excluded={b.card.mobExcluded} win={false} />
                  <Money v={b.card.demobExcluded ? null : b.card.demobPrice} excluded={b.card.demobExcluded} win={false} />
                  <Money v={tot?.firstCycle.total ?? null} win={lowFirst.has(b.card.id)} vat />
                  <Money v={tot?.everyCycleAfter?.total ?? null} win={lowAfter.has(b.card.id)} vat />
                  {durationDays ? <Money v={tot?.duration?.total ?? null} win={lowDuration.has(b.card.id)} vat /> : null}
                </div>
              );
            })}
          </div>
        ) : (
          <Rail label={t.workspace.groupCost} onClick={() => setSection("cost")} />
        )}

        {/* ── The terms: what the renter asked for, then what suppliers volunteered ── */}
        {section === "terms" ? (
          <div className="flex min-w-0 flex-[6_1_0] flex-col overflow-hidden">
            <div className={`${HEAD} flex items-stretch bg-surface2/60`}>
              <div className="flex min-w-0 flex-[2] items-center px-3">
                <span className="truncate text-[9.5px] font-extrabold uppercase tracking-[.1em] text-navy">
                  {t.workspace.termsYouSet}
                </span>
              </div>
              <div className="flex min-w-0 flex-[4] items-center justify-center gap-2.5 border-s border-border/70 bg-surface3/50 px-3">
                <span className="flex-none text-[9.5px] font-extrabold uppercase tracking-[.1em] text-navy">
                  {t.workspace.theyOffered}
                </span>
                <button
                  type="button"
                  onClick={() => onRank(rows)}
                  disabled={rankBusy || rows.length === 0}
                  className={`flex-none whitespace-nowrap rounded-full border px-2 py-1 text-[8.5px] font-bold tracking-[.03em] transition disabled:opacity-50 ${
                    ranking ? "border-ok/40 bg-ok-soft text-ok" : "border-border bg-surface text-navy-mid"
                  }`}
                >
                  ✦ {ranking ? t.workspace.aiRanked : t.workspace.rankWithAi}
                </button>
              </div>
            </div>
            <div className="flex flex-1">
              {YOU_SET.map((col) => (
                <TermColumn key={col.keys[0]} label={col.label(t)} keys={col.keys} rows={rows} selectedId={selectedId} ar={ar} asked />
              ))}
              {THEY_OFFERED.map((col) => (
                <TermColumn key={col.keys[0]} label={col.label(t)} keys={col.keys} rows={rows} selectedId={selectedId} ar={ar} />
              ))}
            </div>
          </div>
        ) : (
          <Rail label={t.workspace.groupTerms} onClick={() => setSection("terms")} />
        )}

        {/* ── Equipment: a door to the map, not a column (owner, 2026-08-25) ── */}
        <button
          type="button"
          onClick={openEquipment}
          disabled={!equipmentTarget}
          title={t.workspace.checkAvailability}
          className="flex w-[52px] flex-none flex-col items-center justify-center gap-3 border-s-2 border-brand/30 bg-brand-soft transition hover:brightness-[.97] disabled:opacity-50"
        >
          <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-full border border-brand/30 bg-surface text-brand">
            <Icon name="lock" size={11} />
          </span>
          <span className="rotate-180 text-[10px] font-extrabold uppercase tracking-[.18em] text-brand [writing-mode:vertical-rl]">
            {t.workspace.groupEquipment} · {t.workspace.checkAvailability} →
          </span>
        </button>
      </div>

      {/* The bench: bids that are on this item but not on the comparison. */}
      {bench.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 border-t border-border/70 bg-surface2/40 px-3.5 py-2.5">
          {bench.map((b) => (
            <button
              key={b.card.id}
              type="button"
              onClick={() => onBench(b.card.id, false)}
              className="flex flex-none items-center gap-2 rounded-full border border-dashed border-border bg-surface py-[5px] pe-3 ps-[5px] transition hover:border-navy-mid hover:bg-surface2/60"
            >
              <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-surface3 text-[8.5px] font-bold text-muted">
                {initials(b.card.supplierName)}
              </span>
              <span className="text-[11.5px] font-bold text-navy-mid">{b.card.supplierName}</span>
              <span className="text-[12px] font-bold text-brand">+</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Two initials at most — the avatar is 26px, and a third letter turns it into a word. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Whose totals the ⓘ panels explain: the picked row, else the first one on the table. */
function pickTotals(totals: Map<string, CycleTotals>, selectedId: string | null, rows: WorkspaceBid[]): CycleTotals {
  return (selectedId ? totals.get(selectedId) : null) ?? totals.get(rows[0].card.id)!;
}

/** A group band — the word above a run of columns. */
function Band({ label, grow, tinted }: { label: string; grow: number; tinted?: boolean }) {
  return (
    <div
      style={{ flexGrow: grow, flexBasis: 0 }}
      className={`flex min-w-0 items-center justify-center px-3 ${tinted ? "border-s border-border/70 bg-surface3/50" : ""}`}
    >
      <span className="truncate text-[9.5px] font-extrabold uppercase tracking-[.1em] text-navy">{label}</span>
    </div>
  );
}

/**
 * One money column's header.
 *
 * The LABEL is the control — the whole word is the target, not a 13px glyph beside it, which is the
 * difference between a sortable table and a table with arrows on it. The arrow states the current
 * direction on the sorted column and sits neutral on the others, so a reader can see at a glance
 * both that the table is ordered and what it is ordered by.
 */
function MoneyHead({
  label,
  sort,
  sortKey,
  sortDir,
  onSort,
  info,
  onInfo,
  popover,
}: {
  label: string;
  sort: SortKey;
  sortKey: SortKey;
  sortDir: 1 | -1;
  onSort: (k: SortKey) => void;
  info?: boolean;
  onInfo?: () => void;
  popover?: React.ReactNode;
}) {
  const on = sort === sortKey;
  return (
    <div
      className="relative flex min-w-0 flex-1 items-center justify-center gap-1.5 border-e border-border/70 px-2.5 last:border-e-0"
      aria-sort={on ? (sortDir === 1 ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(sort)}
        className="flex min-w-0 items-center justify-center gap-1.5"
      >
        <span
          className={`truncate text-[9px] font-bold uppercase leading-[1.2] tracking-[.06em] ${on ? "text-navy" : "text-muted"}`}
        >
          {label}
        </span>
        <span aria-hidden="true" className={`flex-none text-[7px] font-bold ${on ? "text-brand" : "text-border"}`}>
          {on ? (sortDir === 1 ? "▲" : "▼") : "↕"}
        </span>
      </button>
      {info && (
        <button
          type="button"
          onClick={onInfo}
          aria-label={label}
          className="grid h-[15px] w-[15px] flex-none place-items-center rounded-full border border-brand/40 bg-brand-soft text-[9px] font-extrabold text-brand"
        >
          i
        </button>
      )}
      {popover}
    </div>
  );
}

/** One figure. Winners carry the green ground; the three totals carry «with VAT» under them. */
function Money({ v, win, vat, excluded }: { v: number | null | undefined; win: boolean; vat?: boolean; excluded?: boolean | null }) {
  const t = useT();
  return (
    <div
      className={`relative flex min-w-0 flex-1 items-center justify-center overflow-hidden border-e border-border/70 px-2.5 last:border-e-0 ${
        win ? "bg-ok-soft/70" : ""
      }`}
    >
      {v == null ? (
        <span className="truncate text-[11.5px] font-semibold text-muted">
          {excluded ? t.priceFooter.excluded : t.workspace.didntSay}
        </span>
      ) : (
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className={`truncate text-[16px] font-extrabold leading-none ${win ? "text-ok" : "text-navy"}`}>
            {formatSar(v)}
          </span>
          <span className={`flex-none text-[9px] font-bold leading-none ${win ? "text-ok/80" : "text-muted"}`}>
            {t.priceFooter.currency}
          </span>
        </span>
      )}
      {vat && v != null && (
        <span
          className={`absolute bottom-[5px] end-2 text-[6.5px] font-semibold uppercase tracking-[.06em] ${
            win ? "text-ok/60" : "text-muted/60"
          }`}
        >
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
 *
 * A term nobody answered is said out loud rather than left blank: a blank cell reads as "nothing to
 * pay", and an unanswered term is not the same fact.
 */
function TermColumn({
  label,
  keys,
  rows,
  selectedId,
  ar,
  asked,
}: {
  label: string;
  keys: string[];
  rows: WorkspaceBid[];
  selectedId: string | null;
  ar: boolean;
  /** A term the RENTER set: its header carries what he asked for, under the label. */
  asked?: boolean;
}) {
  const t = useT();
  const answers = rows.map((b) => read(findTerm(b.card, keys), ar));
  const askedFor = asked
    ? rows.map((b) => findTerm(b.card, keys)?.renteeValue ?? null).find((v): v is string => !!v) ?? null
    : null;
  const first = answers[0];
  const merged =
    answers.length > 1 && first.text != null && answers.every((a) => a.text === first.text && !a.against);

  return (
    <div className="flex min-w-0 flex-1 flex-col border-e border-border/70 last:border-e-0">
      <div className={`${HEAD} flex items-baseline gap-1.5 bg-surface/60 px-3`}>
        <span className="flex-none text-[9px] font-bold uppercase leading-[1.2] tracking-[.06em] text-muted">{label}</span>
        {askedFor && (
          <span className="min-w-0 truncate text-[8.5px] font-semibold leading-[1.2] text-muted/70">
            {t.workspace.youAsked} · {askedFor}
          </span>
        )}
      </div>

      {merged ? (
        <div
          style={{ height: rows.length * 49 }}
          className="flex flex-none flex-col items-center justify-center gap-1 bg-surface/40 px-3"
        >
          <span className="text-center text-[12.5px] font-semibold leading-[1.3] text-muted">{first.text}</span>
          <span className="text-center text-[10px] font-medium leading-[1.3] text-muted/70">
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
              className={`${ROW} flex items-center gap-1.5 px-3 ${
                a.against ? "bg-danger-soft" : picked ? "bg-brand-soft/25" : ""
              }`}
            >
              <span
                className={`truncate text-[12.5px] leading-[1.3] ${
                  a.against ? "font-bold text-danger" : a.text ? "font-semibold text-navy" : "font-semibold text-muted"
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

/** A term as the supplier answered it, and whether it goes against what the renter asked. */
function read(row: TermRow | null, ar: boolean): { text: string | null; against: boolean } {
  const text = row?.value ?? (row?.detail ? (ar ? row.detail.ar : row.detail.en) : null) ?? row?.renteeValue ?? null;
  return { text: text || null, against: !!row && row.state === "conflict" };
}

/** A closed group, standing on its edge. Pressing it swaps the open group for this one. */
function Rail({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-[52px] flex-none items-center justify-center border-s-2 border-border bg-surface2/70 transition hover:bg-surface3/70"
    >
      <span className="rotate-180 text-[10px] font-extrabold uppercase tracking-[.18em] text-navy-mid [writing-mode:vertical-rl]">
        {label}
      </span>
    </button>
  );
}

/** The panel behind a total's ⓘ: the lines that figure was built from, and nothing else. */
function BuildPopover({ which, totals, onClose }: { which: "first" | "after" | "duration"; totals: CycleTotals; onClose: () => void }) {
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
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute end-0 top-[34px] z-40 flex w-[246px] flex-col gap-2 rounded-[11px] border border-border bg-surface px-3.5 py-3 text-start shadow-[0_14px_34px_rgba(19,44,74,.16)]">
        <div className="flex items-baseline gap-2.5">
          <span className="flex-1 text-[9px] font-extrabold uppercase tracking-[.09em] text-muted">{heading}</span>
          <button type="button" onClick={onClose} aria-label={t.common.cancel} className="text-[11px] font-bold text-border">
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
          <span className="text-[11px] font-extrabold text-navy">{t.priceFooter.total}</span>
          <span className="text-[13px] font-extrabold text-navy">{formatSar(part.total)}</span>
        </div>
        <p className="text-[9.5px] font-semibold leading-snug text-muted">
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
      <span className="flex-1 text-[11px] font-medium leading-[1.3] text-navy-mid">{label}</span>
      <span className="flex-none whitespace-nowrap text-[11.5px] font-semibold leading-[1.3] text-navy">
        {note ?? formatSar(v)}
      </span>
    </div>
  );
}
