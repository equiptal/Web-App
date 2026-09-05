"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { formatSar, rentalDivisor } from "@/lib/pricing/rental";
import { computeCycleTotals, type CycleTotals } from "@/lib/contract/cycle-totals";
import { cheapest, findTerm, type WorkspaceBid } from "@/lib/contract/workspace";
import { partyToken, termValueLabel } from "@/lib/contract/labels";
import type { TermRow } from "@/lib/contract/bids";
import { btn } from "@/lib/ds";
import { pin } from "@/lib/uiPins";

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

/**
 * ── Every term on the table, not five of them (owner, 2026-09-05) ───────────────────────────────
 * *"Make sure all terms are rendered correctly without stripping in the table, and include
 * everything mentioned."*
 *
 * ~~Five hard-coded columns — operator, fuel, payment, breakdown, nationality.~~ A request that asked
 * for a manufacture year, a TÜV certificate, operator food, accommodation or a maintenance side got
 * every one of those answers dropped on the floor: the bids carried them, the matrix knew only five
 * keys, and nothing on the screen said a column was missing.
 *
 * The columns are the UNION of what the bids on this table actually carry now. Two things make that
 * safe rather than chaotic:
 *
 *  · **`TERM_CANON`** folds the two vocabularies together. An in-app bid says `operator_included`
 *    and an off-platform one says `operator`; they are one column, or the same fact renders twice
 *    with half the suppliers blank in each.
 *  · **`TERM_ORDER`** fixes the reading order for the terms we know, so the table does not reshuffle
 *    itself when a supplier answers something new. Anything unknown lands after them, alphabetically,
 *    labelled by the row's own `labelEn`/`labelAr` — a term the backend adds names itself here
 *    instead of appearing as `breakdown_response_sla`.
 */
const TERM_CANON: Record<string, string> = {
  operator: "operator", operator_included: "operator",
  nationality: "nationality", operator_nationality: "nationality",
  fuel_responsibility: "fuel_responsibility",
  payment: "payment", payment_terms: "payment",
  breakdown_sla: "breakdown", breakdown_response_sla: "breakdown",
  maintenance: "maintenance", maintenance_responsibility: "maintenance",
  fat_food: "food", operator_food: "food",
  fat_transport: "transport", operator_transport_accommodation: "transport",
  certs: "equipment_cert", equipment_cert: "equipment_cert", safety_certifications: "equipment_cert",
  operator_cert: "operator_cert",
  year: "year",
  night_shift: "night_shift", nightShift: "night_shift",
};
/** The order the known terms read in. Unknown ones follow, alphabetically by label. */
const TERM_ORDER = [
  "operator", "nationality", "operator_cert", "food", "transport",
  "fuel_responsibility", "maintenance", "year", "equipment_cert", "night_shift",
  "payment", "breakdown", "night",
];
/**
 * Terms that stay off this table even when a bid carries one.
 *
 * · `overtime` — the app retired it on 2026-09-04 and the web hid it on nine surfaces, this one
 *   included. Neither side is asked for a rate any more, and older bids carry the string `'0'`,
 *   which is truthy: showing it would print «Overtime 0» and raise a phantom conflict.
 * · `fuel_type`, and the bare `fuel` — the SAME retired term under two spellings. An off-platform
 *   bid calls it `fuel_type`; an in-app bid's equipment bucket calls it `fuel` and labels it «Fuel
 *   type» (`bids.ts`). The bid form stopped asking on 2026-09-04 (app parity): it is the renter's own
 *   prefilled preference, and a stale answer reads as a conflict nobody set.
 *   ⚠️ `fuel` must NOT be folded into the `fuel` responsibility group. Responsibility arrives as
 *   `fuel_responsibility` from both vocabularies; the bare key is the type, and merging them put a
 *   retired «Diesel» answer under a «Fuel» column that means who pays for it.
 * · `cr` / `vat` — company details, not terms. They belong to the equipment-and-docs check, and
 *   `bucketBidTerms` already excludes them from the card's own tally for the same reason.
 */
const TERM_HIDDEN = new Set(["overtime", "overtime_rate", "fuel_type", "fuel", "cr", "vat"]);

/**
 * -- A responsibility says WHO IT LANDS ON (owner, 2026-09-05) -----------------------------------
 * *"For terms make the wording clear: on rentee or on supplier, like this, for responsibilities."*
 *
 * The cells printed the bare party - «Supplier», «Rentee» - under a column headed «Fuel», so a
 * renter read «Fuel: Supplier» and had to supply the preposition himself. Worse, the same bare word
 * reads as an ANSWER on a column like «Operator», where the values are «Included» / «Not included»:
 * two columns, two grammars, one vocabulary.
 *
 * «On supplier» / «On rentee» is also the spelling the backend itself moved to on 2026-09-02
 * (`getBidForm.ts`, app `c304828a`), so the table now says what the wire says.
 *
 * Only the terms that ARE a party assignment take this. `TERM_PARTY` is that set; `operator`,
 * `year`, `payment` and the certificates keep their own vocabularies.
 */
const TERM_PARTY = new Set(["fuel_responsibility", "maintenance", "food", "transport"]);
/** The party a term lands on. The two common answers are dictionary keys, because the DELIVERY and
 *  RETURN columns say the same two things and the table must not word them twice. */
const PARTY_PHRASE = (token: string, t: Dict, L: LFn): string | null => {
  switch (token) {
    case "supplier": return t.workspace.onSupplier;
    case "rentee": case "renter": case "me": return t.workspace.onRentee;
    case "shared": return L("Shared", "مشتركة");
    case "either": return L("Either party", "أيّ الطرفين");
    default: return null;
  }
};

/**
 * Does this row have anything to SAY? (owner, 2026-09-05: *"if not mentioned in the request it will
 * not be shown, right"* — it was not, so now it is.)
 *
 * An in-app bid does not carry only the terms its request asked about: `bidTerms` builds a FIXED set
 * of rows on every bid - measurement, certificates, year, attachments, operator, the FAT pair, fuel
 * responsibility, the three negotiables, the two mobilization-pricing placeholders - and marks the
 * ones nobody asked about `grey`. Read naively, the union of those rows is a table of fourteen
 * columns on a request that set two terms, most of them empty.
 *
 * `grey` means «the renter never stated this» (`contractState` returns it on a null request value).
 * So a grey row with nothing else on it is dropped. A grey row that still carries the renter's own
 * value, the supplier's declared value or a conflict detail is KEPT: the negotiables (payment,
 * breakdown response) sit at grey until they are settled in the deal room, and those are exactly the
 * terms the «They offered on their own» half exists to show.
 */
function saysSomething(r: TermRow): boolean {
  return r.state !== "grey" || r.renteeValue != null || r.value != null || r.detail != null;
}

type Dict = ReturnType<typeof useT>;
type LFn = (en: string, arr: string) => string;

const ROW_PX = 52;
const ROW = "h-[52px] flex-none box-border border-b border-border";
const HEAD = "h-[36px] flex-none box-border border-b border-border";

export function CompareMatrix({
  bids,
  durationDays,
  startDate,
  mobByRentee = null,
  demobByRentee = null,
  benched,
  onBench,
  ranking,
  rankBusy,
  onRank,
}: {
  bids: WorkspaceBid[];
  /** The request's duration — what the third total column is measured over, and named after. */
  durationDays: number | null;
  /** The request's start date. Without it the Fridays cannot be located, so the duration column
   *  falls back to the bare rate and says so rather than claiming a day count. */
  startDate: string | null;
  /**
   * Whose legs these are, off the renter's OWN request (`RequestListItem.mobByRentee`, mapped from
   * `equipmentItems[0].mobilizationByRentee`).
   *
   * `true` = the renter moves the machine himself, so the supplier was never asked for a price and
   * the column must say so instead of printing his silence as «Not quoted» - or, on an off-platform
   * bid, as «0 SAR», which reads as free delivery. `false` = the supplier's leg, and the backend
   * refuses a bid that omits the price. `null` = an older request that never stated it.
   */
  mobByRentee?: boolean | null;
  demobByRentee?: boolean | null;
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

  /**
   * -- One side of the table at a time (owner, 2026-09-05) ---------------------------------------
   * *"When terms open it will collapse the price etc."*
   *
   * The money and the terms are two readings of the same offers, and a renter is doing one of them
   * at a time. Opening the terms folds both money groups to their rails; opening either money group
   * folds the terms back. Nothing is lost - a rail is one press from being a group again - and the
   * half that is open gets the whole width, which is what stops the answers being truncated.
   *
   * Folding is still only folding: shutting a group opens nothing.
   */
  const toggleGroup = (k: GroupKey) =>
    setShut((s) => {
      const next = new Set(s);
      if (!next.has(k)) {
        next.add(k);
        return next;
      }
      next.delete(k);
      if (k === "terms") {
        next.add("cycle");
        next.add("totals");
      } else {
        next.add("terms");
      }
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

  /**
   * The term columns this table actually needs: one per term ANY bid on it answers.
   *
   * `asked` is what puts a column under «You set» rather than «They offered» — a term is the
   * renter's when at least one bid carries his `renteeValue` for it, which is exactly what the two
   * headings claim. A term nobody was asked for and nobody answered produces no column at all, so a
   * simple request still draws a simple table.
   */
  const termCols = useMemo(() => {
    const byGroup = new Map<string, { group: string; keys: string[]; labelEn: string; labelAr: string; asked: boolean }>();
    for (const b of rows) {
      // `supplier` is deliberately absent: CR and VAT are company details (see TERM_HIDDEN).
      for (const r of [...(b.card.negotiableTerms ?? []), ...b.card.terms.contract, ...b.card.terms.equipment]) {
        if (TERM_HIDDEN.has(r.key)) continue;
        if (!saysSomething(r)) continue;
        const group = TERM_CANON[r.key] ?? r.key;
        if (TERM_HIDDEN.has(group)) continue;
        const at = byGroup.get(group);
        if (at) {
          if (!at.keys.includes(r.key)) at.keys.push(r.key);
          at.asked = at.asked || r.renteeValue != null;
        } else {
          byGroup.set(group, { group, keys: [r.key], labelEn: r.labelEn, labelAr: r.labelAr, asked: r.renteeValue != null });
        }
      }
    }
    const known = (g: string) => { const i = TERM_ORDER.indexOf(g); return i === -1 ? Number.MAX_SAFE_INTEGER : i; };
    return [...byGroup.values()].sort((a, b) => known(a.group) - known(b.group) || a.labelEn.localeCompare(b.labelEn));
  }, [rows]);
  const youSet = termCols.filter((c) => c.asked);
  const theyOffered = termCols.filter((c) => !c.asked);

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
  /**
   * The map opens on the WHOLE request, not on a chosen supplier (owner, 2026-09-04).
   *
   * The surface it opens is keyed on a bid — `/bids/[bidId]/equipment` — so one of them has to be
   * the door, and the door is the table's FIRST ROW: whatever the renter's own sort has put at the
   * top, which is the offer he is most likely reading. Every other offer on the request is in that
   * map's header, so where he lands is a starting point rather than a choice made for him.
   *
   * The recommendation wins the door when there is one: an agent that has ranked these bids has said
   * something about where to start, and a silent first-row default would ignore it.
   */
  const equipmentTarget = (ranking ? rows.find((b) => b.card.id === ranking.bidId) : null) ?? rows[0] ?? null;
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
    { key: "mob", label: t.priceFooter.mobilisation, value: (b) => (b.card.mobExcluded ? null : b.card.mobPrice), excluded: (b) => !!b.card.mobExcluded, onRentee: mobByRentee === true },
    { key: "demob", label: t.priceFooter.demobilisation, value: (b) => (b.card.demobExcluded ? null : b.card.demobPrice), excluded: (b) => !!b.card.demobExcluded, onRentee: demobByRentee === true },
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
                  c.info && popover === c.info
                    ? (anchor) => (
                        <BuildPopover
                          which={c.info!}
                          anchor={anchor}
                          totals={pickTotals(totals, rows)}
                          priceUnit={rows[0].card.priceUnit}
                          onClose={() => setPopover(null)}
                        />
                      )
                    : undefined
                }
              />
              {rows.map((b) => (
                <Money
                  key={b.card.id}
                  v={c.value(b)}
                  win={!!c.win?.has(b.card.id)}
                  vat={c.vat}
                  excluded={c.excluded?.(b)}
                  onRentee={c.onRentee}
                />
              ))}
            </div>
          ),
        )}
      </div>
    </div>
  );

  return (
    /* ── The table does NOT scroll itself; the PAGE scrolls (owner, 2026-09-04) ────────────────────
       ~~"a table that outgrows its pane scrolls itself" (owner, 2026-08-25)~~ — withdrawn. A scroller
       inside a scroller is two bars for one list: the renter drags the outer one, the rows do not
       move, and the figures he is comparing sit below a fold he cannot see the edge of. The matrix
       now renders at its full height and the page carries it.

       The HORIZONTAL scroller below stays. It is a different problem with a different answer: the
       columns are a fixed set the renter reads left to right, and removing that one would clip the
       last money column rather than reveal it. */
    <div {...pin("compare-matrix")} className="flex-none">
      {/* ── Both axes stated, and only one of them scrolls ───────────────────────────────────────
          `overflow-x-auto` alone is not "scrolls sideways": CSS computes the OTHER axis from
          `visible` to **auto** the moment one axis scrolls, so this strip quietly grew a vertical
          scrollbar of its own whenever any child overhung it — the breakdown panel did, and the
          renter got a 130px scroller inside a table with half a screen of empty page under it
          (owner, 2026-09-05, after he had already stopped the table scrolling itself the day before).

          `clip` rather than `hidden`: it says the same thing without making this a scroll container,
          so nothing here can be scrolled programmatically into a place the renter cannot see. What
          genuinely needs to overhang the strip — the breakdown — is drawn in a portal instead. */}
      <div {...pin("matrix-scroller")} className="flex items-stretch overflow-x-auto overflow-y-clip">
        {/* ── The suppliers, on the inline-start edge ── */}
        <div {...pin("matrix-supplier-col")} className="w-[185px] flex-none border-e border-border">
          <div className="box-border flex h-[72px] items-end border-b border-border bg-surface2/60 px-3 pb-2">
            {/* «Supplier», and nothing after it: the «pick one» that stood here was an instruction
                for a choice this table no longer asks for (owner, 2026-09-04). */}
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="flex-none text-label font-extrabold uppercase tracking-wide text-muted">
                {t.workspace.supplier}
              </span>
            </span>
          </div>

          {/* ── No supplier is PICKED here any more (owner, 2026-09-04) ─────────────────────────
              *"I don't want an option to select the supplier in the bid comparison table. He clicks
              the orange panel and it just takes him to the map with all bids instead of the selected
              one."*

              ~~Each row was a button that set the comparison's chosen bid, and the choice then
              decided one thing only: whose yard the equipment rail opened.~~ Withdrawn. The map
              carries every offer on the request in its own header now, so choosing one before
              leaving decided nothing except which supplier the renter happened to land on first —
              a decision the table asked him to make and then did not use.

              A row is a LABEL again: who the column belongs to and where he stands with them. The ✕
              stays, because removing a column is a statement about the comparison rather than a
              choice of supplier, and the bench under the table is how it comes back. */}
          {rows.map((b) => {
            const recommended = ranking?.bidId === b.card.id;
            return (
              <div
                key={b.card.id}
                className={`${ROW} group relative flex w-full items-center gap-2.5 px-3 text-start`}
              >
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
                <button
                  type="button"
                  // A real button now that the row around it is not one — it was a `span[role]` only
                  // because a button cannot be nested inside a button.
                  onClick={() => onBench(b.card.id, true)}
                  aria-label={t.workspace.removeColumn}
                  title={t.workspace.removeColumn}
                  className="flex-none rounded px-1 py-0.5 text-body font-semibold text-muted/50 transition hover:bg-danger-soft hover:text-danger"
                >
                  ✕
                </button>
              </div>
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
          /* -- The terms take the table (owner, 2026-09-05) ---------------------------------
             Open, this group is the widest thing on the row and the money is folded to two rails
             beside it, because a term column sharing the width with six money columns truncates
             every answer in it.

             Each half is its own section, holding its own heading band AND its columns, so the
             «You set» / «They offered» boundary lands exactly on the column boundary whatever
             the counts are. The bands were `flex-[2]` and `flex-[4]` against a hard-coded 2 and 4;
             with a dynamic column list that arithmetic silently stops matching. */
          <div className="flex min-w-0 flex-[9_1_0] items-stretch border-s border-border">
            {youSet.length > 0 && (
              <div className="flex min-w-0 flex-col" style={{ flex: `${youSet.length} 1 0` }}>
                <div className={`${HEAD} flex items-center gap-1.5 bg-surface2/60 px-3`}>
                  <span className="truncate text-label font-extrabold uppercase tracking-wide text-navy-mid">
                    {t.workspace.termsYouSet}
                  </span>
                  <FoldButton onClick={() => toggleGroup("terms")} hint={t.workspace.hideGroup} />
                </div>
                <div className="flex flex-1">
                  {youSet.map((col) => (
                    <TermColumn key={col.group} label={ar ? col.labelAr : col.labelEn} keys={col.keys} rows={rows} ar={ar} L={L} asked />
                  ))}
                </div>
              </div>
            )}
            <div className="flex min-w-0 flex-col border-s border-border" style={{ flex: `${Math.max(theyOffered.length, 1)} 1 0` }}>
              <div className={`${HEAD} flex items-center justify-center gap-2.5 bg-surface3/50 px-3`}>
                <span className="flex-none text-label font-extrabold uppercase tracking-wide text-navy-mid">
                  {t.workspace.theyOffered}
                </span>
                {/* The fold lives here when nothing was «set», or the renter has no way to shut the
                    group he just opened. */}
                {youSet.length === 0 && <FoldButton onClick={() => toggleGroup("terms")} hint={t.workspace.hideGroup} />}
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
              <div className="flex flex-1">
                {theyOffered.map((col) => (
                  <TermColumn key={col.group} label={ar ? col.labelAr : col.labelEn} keys={col.keys} rows={rows} ar={ar} L={L} />
                ))}
                {theyOffered.length === 0 && (
                  <div className="flex flex-1 items-center justify-center px-3 py-4 text-center text-label font-semibold text-muted">
                    {t.workspace.noVolunteeredTerms}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Equipment: the one rail that leaves the page ── */}
        <button
          type="button"
          onClick={openEquipment}
          disabled={!equipmentTarget}
          // What the press DOES, said plainly: it leaves the table for the map, and the map has every
          // offer on it (owner, 2026-09-04). «Check availability» described one supplier's yard.
          title={t.workspace.mapAllOffers}
          aria-label={t.workspace.mapAllOffers}
          className="flex w-11 flex-none flex-col items-center justify-center gap-2.5 overflow-hidden border-s border-brand/25 bg-brand-soft transition hover:bg-brand/15 disabled:cursor-default disabled:bg-disabled-bg disabled:text-disabled-fg"
        >
          {/* ~~A padlock in a ring.~~ Removed (owner, 2026-09-05). It was drawn when this rail led
              to a gated surface; it leads to the equipment map, which is not locked, and a padlock
              over an orange control reads as "you may not press this". */}
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
  /** The renter's request put this leg on HIM, so no supplier was ever asked to price it. */
  onRentee?: boolean;
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

/** Whose totals the ⓘ panels explain: the FIRST row on the table.
 *
 *  It read the picked row first, and since 2026-09-04 there is no picked row — the table stopped
 *  asking the renter to choose a supplier, so the only ordering left is his own sort, and the top of
 *  it is what the popover stands over. */
function pickTotals(totals: Map<string, CycleTotals>, rows: WorkspaceBid[]): CycleTotals {
  return totals.get(rows[0].card.id)!;
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
  /** Given this header's own box, draw the breakdown against it (in a portal). */
  popover?: (anchor: React.RefObject<HTMLDivElement | null>) => React.ReactNode;
}) {
  const t = useT();
  const on = col.key === sortKey;
  /* The popover is drawn in a PORTAL and placed against this cell — see `BuildPopover`. The ref is
     the whole of what this header contributes to that. */
  const head = useRef<HTMLDivElement | null>(null);
  return (
    <div
      ref={head}
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
      {popover?.(head)}
    </div>
  );
}

/** One figure. Winners carry the green ground; the totals carry «with VAT» under them. */
function Money({ v, win, vat, excluded, onRentee }: { v: number | null | undefined; win: boolean; vat?: boolean; excluded?: boolean | null; onRentee?: boolean }) {
  const t = useT();
  return (
    <div
      className={`${ROW} relative flex items-center justify-center overflow-hidden px-2 ${
        win ? "bg-ok-soft/70" : ""
      }`}
    >
      {onRentee ? (
        /* -- The leg is the RENTER's, so there is nothing for a supplier to have said ------------
           Before this, the same fact printed two different ways and neither was true: an app bid
           left `mobPrice` null and the cell read «Not quoted», as though the supplier had ducked a
           mandatory answer (the backend rejects a bid that omits a price for a leg that IS his);
           an off-platform bid stored the empty input as 0 and the cell read «0 SAR», as though he
           delivered free. It outranks both the excluded flag and any stray figure: whose leg it is
           was settled by the request, not by the offer. */
        <span className="truncate text-body font-semibold text-muted">{t.workspace.onRentee}</span>
      ) : v == null ? (
        /* -- «Not quoted», not «Didn't say» (owner, 2026-09-05) -------------------------------
           «Didn't say» is the terms table's phrase for an unanswered QUESTION, and it was
           appearing in the delivery and return columns too, where the fact is different: the
           supplier put no figure against a leg. «Not charged» stays for a leg he explicitly
           excluded - the two must not read alike, because one is a gap and the other is a price
           of zero. */
        <span className="truncate text-body font-semibold text-muted">
          {excluded ? t.priceFooter.excluded : t.workspace.notQuoted}
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
/** The narrowest a term column may be. Below this an answer cannot read on two lines either, and
 *  the table's own horizontal scroller is the honest answer to «more terms than width». */
const TERM_MIN_PX = 118;

function TermColumn({
  label,
  keys,
  rows,
  ar,
  L,
  asked,
}: {
  label: string;
  keys: string[];
  rows: WorkspaceBid[];
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
    <div className="flex min-w-0 flex-1 flex-col border-e border-border last:border-e-0" style={{ minWidth: TERM_MIN_PX }}>
      {/* The head keeps its 36px, so it truncates where it must - but it now carries the whole
          string on `title`, which is what a renter checking «Net 30 on delivery» actually needs. */}
      <div className={`${HEAD} flex items-center gap-1.5 bg-surface/60 px-2.5`} title={askedFor ? `${label} — ${t.workspace.youAsked}: ${askedFor}` : label}>
        <span className="flex-none text-label font-semibold uppercase leading-tight tracking-wide text-muted">{label}</span>
        {askedFor && (
          <span className="min-w-0 truncate text-label font-semibold leading-tight text-muted/80">
            {t.workspace.youAsked} · {askedFor}
          </span>
        )}
      </div>

      {merged ? (
        <div style={{ height: rows.length * ROW_PX }} className="flex flex-none flex-col items-center justify-center gap-1 bg-surface/40 px-3">
          <span className="text-center text-meta font-semibold leading-[1.35] text-muted">{first.text}</span>
          <span className="text-center text-label font-semibold leading-snug text-muted/80">
            {t.workspace.sameFromAll.replace("{n}", String(rows.length))}
          </span>
        </div>
      ) : (
        rows.map((b, i) => {
          const a = answers[i];
          return (
            <div
              key={b.card.id}
              className={`${ROW} flex items-center gap-1.5 px-2.5 ${a.against ? "bg-danger-soft" : ""}`}
              title={a.text ?? undefined}
            >
              {/* -- The answer is READ, not cut (owner, 2026-09-05) ------------------------------
                  ~~`truncate`~~: one line, clipped at the column edge, so «Net 30 after invoice»
                  read as «Net 30 aft…» and «Supplier provides diesel» as «Supplier prov…». The row
                  is a fixed 52px because every column on this table shares it, so the answer wraps
                  to TWO lines inside that height instead of being cut on one - which fits the
                  longest value the vocabularies produce - and the full string is on `title` for the
                  rare one that does not. `break-words` so a single long token breaks rather than
                  widening the column and pushing the money off the screen. */}
              <span
                className={`line-clamp-2 break-words text-meta leading-[1.3] ${
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

  // A party assignment reads as a sentence, not as a noun: «On supplier», never «Supplier». The
  // wire says `supplier`, `me`, `RENTEE` or the newer `On Supplier`; `partyToken` strips the
  // prefix so both spellings land on the same row of the table below.
  if (TERM_PARTY.has(TERM_CANON[key] ?? key)) {
    const phrase = PARTY_PHRASE(partyToken(v).toLowerCase(), t, L);
    if (phrase) return phrase;
  }

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
  anchor,
  totals,
  priceUnit,
  onClose,
}: {
  which: "first" | "after" | "duration";
  /** The column header this breakdown explains — it is placed against that box. */
  anchor: React.RefObject<HTMLDivElement | null>;
  totals: CycleTotals;
  priceUnit: string | null;
  onClose: () => void;
}) {
  const t = useT();
  /* ── Where it sits: measured against the header, re-measured while it is open ─────────────────
     The panel hangs from the header's trailing edge, as it did when it was `absolute end-0`, and is
     then pulled back inside the viewport — the last money column sits within a few pixels of the
     card's edge, and a panel half off the screen is worse than one a little off its anchor.

     Re-measured on scroll and resize because BOTH can move the header under it: the page scrolls the
     matrix, and the strip scrolls the columns sideways. `capture: true` on scroll, so the strip's own
     scrolling is heard as well as the page's. */
  const box = useRef<HTMLDivElement | null>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const place = useCallback(() => {
    const a = anchor.current;
    if (!a) return;
    const r = a.getBoundingClientRect();
    const width = box.current?.offsetWidth ?? 250;
    const rtl = document.documentElement.dir === "rtl";
    const wanted = rtl ? r.left : r.right - width;
    setAt({
      top: r.bottom + 4,
      left: Math.max(8, Math.min(wanted, window.innerWidth - width - 8)),
    });
  }, [anchor]);
  useLayoutEffect(() => {
    place();
  }, [place]);
  useEffect(() => {
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [place]);

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

  const panel = (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div
        ref={box}
        style={at ? { top: at.top, left: at.left } : { top: -9999, left: -9999 }}
        className="fixed z-40 flex w-[250px] flex-col gap-2 rounded-lg border border-border bg-surface px-3.5 py-3 text-start"
      >
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
  /* ── Drawn OUTSIDE the matrix, over the page (owner, 2026-09-05) ───────────────────────────────
     *"I want the compare table to not have this weird scroll inside the table while we have all this
     empty space in the screen."* He had already stopped the table scrolling itself on 2026-09-04 —
     the matrix renders at full height and the page carries it — and a bar came back anyway.

     It was this popover, through a CSS rule rather than a layout one: the column strip is
     `overflow-x-auto`, and when one axis scrolls the other computes from `visible` to **auto**. So
     an absolutely-placed panel 200px tall hanging out of a 144px strip gave the table a vertical
     scrollbar of its own — over a screen with 500px of empty page under it.

     A portal takes the panel out of that box entirely: nothing overflows the strip, so nothing asks
     it to scroll. It also fixes the second half of the same bug, which nobody had reported yet — on
     the last money column the panel was CLIPPED by the horizontal scroller instead of overhanging
     it. */
  return typeof document === "undefined" ? panel : createPortal(panel, document.body);
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
