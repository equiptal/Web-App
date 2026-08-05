"use client";

/**
 * RMAP T13 — the bid list. **The entry point, and it stays visible in every state** (the prototype's
 * own comment): the machine panel and the rail overlay the map *beside* it, they never replace it.
 *
 * Three rules that are easy to lose and expensive to get wrong:
 *
 *  1. **Selection is row state, not navigation.** A row's accent bar + tick is the whole affordance;
 *     selecting must NOT create a deal room (D-A). Creating one freezes the supplier's offered-unit
 *     count (`BID_OFFER_LOCKED`), so it can never be a side effect of looking around. `onSelectBid`
 *     lifts the id so T16 can plot that supplier's fleet — nothing here routes.
 *  2. **Two sorts, cheapest first by default** (AC-24, AC-73, D-D). Rating is retired and there is no
 *     distance band (D-C, §6.10 withdrawn). Both orders come from `sortBids` in `bid-map.ts`, so nulls
 *     sort last here exactly as they do in the tests.
 *  3. **Freshness is refetch, not push** (§7.5.1). This panel owns the *manual* trigger (AC-229) and
 *     the just-arrived marker (AC-171); the fetch itself lives in `GroupBids`. No copy on this surface
 *     may imply that offers update on their own (AC-230).
 */

import { useEffect, useMemo, useState } from "react";
import { sortBids, unitCountLabel, unitCounts, type BidSortKey } from "@/lib/contract/bid-map";
import type { BidCard } from "@/lib/contract/bids";
import { fmt, useLocale, useT } from "@/lib/i18n";
import { ColourKey } from "@/components/map/ColourKey";

/** A bid as this surface needs it: the contract card, plus the item labels `GroupBids` tags on. */
export type MapBid = BidCard & { itemLabel?: string; itemLabelAr?: string };

export interface BidListPanelProps {
  /** Already scoped to the active item by `GroupBids` (AC-22) — this panel never filters. */
  bids: MapBid[];
  selectedBidId: string | null;
  onSelectBid: (bidId: string) => void;
  /** Hovering a row highlights its pins (prototype `hoverSup`). Consumed by T16; wired now so the
   *  panel does not have to be re-opened later. */
  onHoverBid: (bidId: string | null) => void;
  /** Ids that were not in the previous fetch — marked «وصل الآن» for ~9s (§6.11, AC-171). */
  freshBidIds: ReadonlySet<string>;
  /** The request has `projectLat/Lng`. False → every distance reads «—» and the nearest sort is
   *  DISABLED rather than ordering arbitrarily (AC-21). */
  hasSite: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}

/** Western digits, per the existing app convention (`RequestsList`); the run is wrapped `dir="ltr"`. */
const nf = (n: number) => Math.round(n).toLocaleString("en-US");

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "—";
  return words.slice(0, 2).map((w) => [...w][0]).join("");
}

export function BidListPanel({
  bids,
  selectedBidId,
  onSelectBid,
  onHoverBid,
  freshBidIds,
  hasSite,
  onRefresh,
  refreshing,
}: BidListPanelProps) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [sort, setSort] = useState<BidSortKey>("price"); // cheapest-rate first by default (AC-73)

  // A request can lose its site only by switching item scope, but leaving `nearest` selected there
  // would order by an all-null key — visually an arbitrary order the renter would read as meaningful.
  useEffect(() => {
    if (!hasSite) setSort("price");
  }, [hasSite]);

  // Re-SORT, never append (AC-170): a refetch produces a new array and the whole list is ordered
  // again, so a cheaper arrival lands in price order instead of at the bottom of a cheapest-first list.
  const rows = useMemo(() => sortBids(bids, sort), [bids, sort]);

  const rates = bids.map((b) => b.price).filter((p): p is number => typeof p === "number");
  const best = rates.length ? Math.min(...rates) : null;

  const periodOf = (u: string | null): string => {
    switch ((u ?? "PER_DAY").toUpperCase()) {
      case "PER_WEEK": return t.bidMap.perWeek;
      case "PER_MONTH": return t.bidMap.perMonth;
      case "PER_JOB": return t.bidMap.perJob;
      default: return t.bidMap.perDay;
    }
  };
  // `unitCountLabel` is the one literal Arabic form (AC-146) and carries «وحدة» itself; English has no
  // such rule, so it prints the plain count and the noun comes from the line's own copy.
  const unitsLabel = (n: number) => (ar ? unitCountLabel(n) : `${n} ${n === 1 ? "unit" : "units"}`);

  return (
    <div className="bm-panel">
      <div className="bm-head">
        <div className="bm-head-row">
          <div className="bm-title">{t.bidMap.title}</div>
          <span className="bm-count" dir="ltr">{rows.length}</span>
          <div className="bm-spacer" />
          <button type="button" className="bm-refresh" onClick={onRefresh} disabled={refreshing}>
            <span className="material-icons-outlined">refresh</span>
            {refreshing ? t.bidMap.refreshing : t.bidMap.refresh}
          </button>
        </div>
        <div className="bm-sub">{t.bidMap.pickSupplier}</div>
        {/* AC-230: states the three triggers, so nothing implies instant updating. */}
        <div className="bm-note">{t.bidMap.freshnessNote}</div>
        <div className="bm-sorts">
          {/* The prototype's tabs are `price` / `dist`; `sortBids`' keys are `price` / `nearest`. Same
              two sorts, one name each — the label is mapped here rather than aliasing the contract. */}
          <button type="button" className={`bm-sort${sort === "price" ? " on" : ""}`} onClick={() => setSort("price")}>
            {t.bidMap.sortPrice}
          </button>
          <button
            type="button"
            className={`bm-sort${sort === "nearest" ? " on" : ""}`}
            onClick={() => setSort("nearest")}
            disabled={!hasSite}
            title={hasSite ? undefined : t.bidMap.sortNearestOff}
          >
            {hasSite ? t.bidMap.sortNearest : t.bidMap.sortNearestOff}
          </button>
        </div>
      </div>

      <div className="bm-list">
        {rows.map((b) => {
          const on = selectedBidId === b.id;
          const dim = selectedBidId != null && !on;
          const cheapest = best != null && b.price === best;
          const fresh = freshBidIds.has(b.id);
          const counts = unitCounts(b);
          const off = b.viaSharedLink === true;
          const item = (ar ? b.itemLabelAr : b.itemLabel) ?? null;
          const cls = ["bm-row", on ? "on" : "", dim ? "dim" : "", cheapest ? "cheap" : "", fresh ? "flash" : ""]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={b.id}
              id={`bm-row-${b.id}`}
              type="button"
              className={cls}
              onClick={() => onSelectBid(b.id)}
              onMouseEnter={() => onHoverBid(b.id)}
              onMouseLeave={() => onHoverBid(null)}
            >
              {fresh && <span className="bm-fresh">{t.bidMap.justArrived}</span>}
              {on && <span className="bm-acc" />}
              {on && <span className="bm-tick">✓</span>}

              <div className="bm-idline">
                <div className="bm-avatar" style={{ background: b.verified ? "#16A34A" : "#D4780A" }}>
                  {initialsOf(b.supplierName)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="bm-supname">
                    {b.supplierName}
                    {b.verified && <span style={{ color: "#16A34A", fontSize: 10 }}>✓</span>}
                  </div>
                  {item && <div className="bm-supsub">{item}</div>}
                </div>
                {/* Off-platform rows stay LISTED and tagged; their full treatment is T29. */}
                {off && <span className="bm-offbadge">{t.bidMap.offPlatform}</span>}
              </div>

              <div className="bm-figs">
                <div style={{ minWidth: 0 }}>
                  <div className="bm-flab">{t.bidMap.rate}</div>
                  <div className="bm-rate">
                    <span dir="ltr">{b.price != null ? nf(b.price) : "—"}</span>
                    <span className="bm-rateunit">{fmt(t.bidMap.ratePer, { unit: periodOf(b.priceUnit) })}</span>
                  </div>
                  {/* Cheapest is measured on the RATE, never a grand total (AC-206). */}
                  {cheapest && <div className="bm-cheapest">{t.bidMap.cheapest}</div>}
                </div>
                <div style={{ flex: 1 }} />
                <div className="bm-dist">
                  <div className="bm-flab">{t.bidMap.distance}</div>
                  {!hasSite ? (
                    // No project location → «—», never 0 (AC-21).
                    <div className="bm-distval">—</div>
                  ) : b.distanceKm == null ? (
                    // Listed, not hidden — the distance is unknown, not far (AC-19, AC-24).
                    <div className="bm-distnote">{t.bidMap.noLocation}</div>
                  ) : (
                    <div className="bm-distval">
                      <span dir="ltr">{nf(b.distanceKm)}</span> {t.bidMap.km}
                    </div>
                  )}
                </div>
              </div>

              {/* Offered vs identified — deliberately NOT reconciled (§6.12, AC-37). One is commercial
                  coverage, the other is what the renter can actually inspect. */}
              {(counts.offered > 1 || counts.unidentified > 0) && (
                <div className="bm-units">
                  <div className="u-off">{fmt(t.bidMap.unitsOfferedLine, { n: unitsLabel(counts.offered) })}</div>
                  {counts.identified > 0 && (
                    <div className="u-id">
                      <span>✓</span>
                      <span>{fmt(t.bidMap.unitsIdentifiedLine, { n: unitsLabel(counts.identified) })}</span>
                    </div>
                  )}
                  {counts.unidentified > 0 && (
                    <div className="u-un">
                      <span>{ar ? "؟" : "?"}</span>
                      <span>{fmt(t.bidMap.unitsUnidentifiedLine, { n: unitsLabel(counts.unidentified) })}</span>
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Inside the panel, collapsed — never floating (AC-131). */}
      <ColourKey />
    </div>
  );
}
