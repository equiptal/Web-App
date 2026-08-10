"use client";

/**
 * **V12 · the price footer** — spec 004 §6.10, revised by 004a §4a.1.
 *
 * **It shows figures and hands off. It is NOT a re-host.** What §6.10 calls a bar is `qp-foot`
 * (`DealRoom.tsx:1608`): the footer of a three-page negotiation wizard bound to that component's
 * `page` / `editable` / `canNext` / `canSubmit` / `busy` / `doSubmit`, inside 1,700 lines. It cannot
 * be embedded, and re-implementing it would put two negotiation surfaces over one room — which is
 * exactly the thing 004a §4a.2 draws the module boundary to prevent.
 *
 * So: the figures come from `computeDealTotals` (the one function the deal-room bar, the quotation
 * and the signed PDF all price from), and **negotiate/accept navigates to `/deal-room/[id]`**.
 *
 * ── التفاصيل EXPANDS THE BAR IN PLACE ────────────────────────────────────────────────────────────
 * Not a popover, not a sheet. Opening it grows the footer into the breakdown and closing it returns
 * the bar to its resting height. The panel is a fixed-width column, so the expansion takes vertical
 * space from the equipment list rather than overlaying it — which is why the list scrolls and this
 * does not.
 *
 * ── The no-room case is the COMMON one ───────────────────────────────────────────────────────────
 * Most bids have `dealRoomId === null`. Then the footer shows the **bid's own** figures, no status
 * line, and negotiating is what creates the room (004a §4.5) — never opening this surface.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ensureDealRoom } from "@/lib/chat/ensure-deal-room";
import type { BidCard } from "@/lib/contract/bids";
import { priceFooterModel } from "@/lib/contract/price-footer";
import { fmt, useLocale, useT } from "@/lib/i18n";

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const arDigits = (s: string): string => s.replace(/\d/g, (d) => ARABIC_INDIC_DIGITS[Number(d)]);

export interface PriceFooterProps {
  bid: BidCard;
  /** The request's `estimatedDurationDays` — the SAME field the deal room maps into `periods`, so the
   *  two surfaces price one room identically (RM3-AC-24). Null is legitimate: no duration means one
   *  full period, which `computeDealTotals` already handles. */
  durationDays: number | null;
  /** The request's start date — the Friday anchor for the shared rental maths. Without it the rental
   *  falls back to the raw rate, so pass it alongside `durationDays` from the same request. */
  startDate?: string | null;
}

export function PriceFooter({ bid, durationDays, startDate = null }: PriceFooterProps) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  const model = priceFooterModel(bid, durationDays, startDate);
  const { totals } = model;

  /** Money, always LTR — an Arabic reader reads the digits left-to-right like everyone else. */
  const money = (n: number): string => {
    const s = Math.round(n).toLocaleString("en-US");
    return ar ? arDigits(s) : s;
  };
  const num = (n: number): string => (ar ? arDigits(String(n)) : String(n));
  const period = ((): string => {
    switch ((totals.priceUnit || "PER_DAY").toUpperCase()) {
      case "PER_WEEK": return t.priceFooter.week;
      case "PER_MONTH": return t.priceFooter.month;
      case "PER_JOB": return t.priceFooter.job;
      default: return t.priceFooter.day;
    }
  })();

  /** Negotiate/accept — **the existing flow**, never re-implemented here. Without a room, this is one
   *  of the three acts allowed to create one. */
  async function negotiate() {
    if (busy) return;
    setBusy(true);
    try {
      const roomId = await ensureDealRoom(bid.id, bid.dealRoomId);
      router.push(`/deal-room/${encodeURIComponent(roomId)}`);
    } catch {
      setBusy(false);
    }
  }

  return (
    <footer className={`bm-foot${expanded ? " is-open" : ""}`}>
      <div className="bm-foot-bar">
        <div className="bm-foot-figs">
          <div className="bm-foot-rate" dir="ltr">
            <span className="bm-foot-amt">{money(totals.rate)}</span>
            <span className="bm-foot-unit">{fmt(t.priceFooter.perPeriod, { unit: period })}</span>
          </div>
          {/* The SOURCE of the figure, not the state of the conversation. A room whose price nothing
              has moved still reads as the opening offer. */}
          <span className="bm-foot-src">
            {model.source === "opening_offer" ? t.priceFooter.openingOffer : t.priceFooter.fromDealRoom}
          </span>
        </div>
        <button type="button" className="bm-foot-det" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {t.priceFooter.details}
          <span className="material-icons-outlined">{expanded ? "expand_more" : "expand_less"}</span>
        </button>
        {/* TWO controls, always both — the deal room's own pair (`DealRoom.tsx:676`): Negotiate is
            always available, Accept is always VISIBLE and gated. One-or-the-other hid the act the
            renter was looking for and made the surface decide for him.

            Both open `/deal-room/[id]`; the price is settled there and nowhere else (004a §4a.2). */}
        <button type="button" className="bm-foot-cta" onClick={() => void negotiate()} disabled={busy}>
          {t.priceFooter.counterPrice}
        </button>
        {/* Gated by the DEAL ROOM's rule, not by one of ours: `termsMatched && priceMatches &&
            unitsMatch`. With no room there are no counter-rounds and no terms, and that rule reduces
            to true — an untouched opening offer is acceptable, which is what the deal room does with
            one. Once a room EXISTS the rule needs its terms and its last two rounds, which this
            surface does not fetch, so the control says so rather than guessing: a button that claimed
            "acceptable" off a figure it cannot check is the one failure this pair must not have. */}
        <button
          type="button"
          className="bm-foot-cta is-confirm"
          onClick={() => void negotiate()}
          disabled={busy || model.hasRoom}
          title={model.hasRoom ? t.priceFooter.acceptInRoom : undefined}
        >
          {t.priceFooter.confirmPrice}
        </button>
      </div>

      {/* The two numbers that are both correct (004a §4a.4). The count pills describe the OFFER; this
          prices on the AGREED count — and where they differ it is said ONCE, here (RM3-AC-66). It
          never follows `lastProposedRentalUnits`: `priceFooterModel` cannot even see that field. */}
      {model.unitsDiffer && (
        <div className="bm-foot-units" role="note">
          {fmt(t.priceFooter.unitsDiffer, { agreed: num(model.pricedUnits), offered: num(model.offeredUnits) })}
        </div>
      )}

      {expanded && (
        <div className="bm-foot-break">
          <Line
            label={fmt(t.priceFooter.rentalLine, {
              rate: money(totals.rate),
              unit: period,
              n: num(totals.rentalUnits),
              periods: num(Math.round(totals.periodCount)),
            })}
            value={money(totals.rentalTotal)}
          />
          <Line
            label={t.priceFooter.mobilisation}
            value={totals.mobExcluded ? t.priceFooter.excluded : money(totals.mobTotal)}
            muted={totals.mobExcluded}
          />
          <Line
            label={t.priceFooter.demobilisation}
            value={totals.demobExcluded ? t.priceFooter.excluded : money(totals.demobTotal)}
            muted={totals.demobExcluded}
          />
          <Line label={t.priceFooter.subtotal} value={money(totals.subtotal)} strong />
          <Line label={t.priceFooter.vat} value={money(totals.vat)} />
          <Line label={t.priceFooter.total} value={money(totals.grand)} strong />
          {!totals.hasDuration && <div className="bm-foot-note">{t.priceFooter.noDuration}</div>}
        </div>
      )}
    </footer>
  );
}

function Line({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`bm-foot-row${strong ? " is-strong" : ""}${muted ? " is-muted" : ""}`}>
      <span className="bm-foot-k">{label}</span>
      {/* Every figure is a numeral run: LTR inside the RTL column, like every other number here. */}
      <span className="bm-foot-v" dir="ltr">{value}</span>
    </div>
  );
}
