"use client";

/**
 * **V12 · the price footer** — spec 004 §6.10, revised by 004a §4a.1.
 *
 * **It shows figures and hands off. It is NOT a re-host.** What §6.10 calls a bar is `qp-foot`
 * (`DealRoom.tsx:1608`): the footer of a three-page negotiation wizard bound to that component's
 * `page` / `editable` / `canNext` / `canSubmit` / `busy` / `doSubmit`, inside 1,700 lines. It cannot
 * be embedded, and re-implementing it would put two negotiation surfaces over one room — which is
 * exactly the thing 004a §4a.2 draws the module boundary to prevent. **That reasoning still holds.**
 *
 * So the figures come from `computeDealTotals` (the one function the deal-room bar, the quotation and
 * the signed PDF all price from), and the two buttons hand off to the deal room.
 *
 * ── WHAT CHANGED: the hand-off now carries the INTENT (owner, 2026-08-11) ────────────────────────
 * *"it is just new buttons wired so they must open the 3 style sheets directly using same logic not
 * change it just wire to new buttons."*
 *
 * Pressing «اطلب سعراً أقل» used to `push('/deal-room/[id]')` and leave the renter looking at a room
 * he had not asked to read, with the act he *had* asked for one more press away. It now pushes
 * `?act=counter` / `?act=accept`, which the deal-room page feeds to `DealRoom` as `initialFlow` and
 * which seeds **the room's own `openFlow(mode)`** — the same function its own two buttons call, with
 * its own guards intact (nothing opens while `busy` or before the room loads, and Accept still needs
 * the room's `canAccept`; blocked, the renter simply lands on the room and its existing strip says
 * why). Not one line of the flow is copied or re-implemented here: this file only names the mode.
 *
 * ── SHAPE: the v3 prototype's footer, plus a breakdown that opens OVER it ────────────────────────
 * A fixed 76px slab: the rate at hero size with its unit, the negotiation state under it, «عرض
 * التفاصيل» beside that, and the two acts on the trailing edge. The slab itself never grows.
 *
 * The breakdown has been here, withdrawn, and asked for again in one day (owner, 2026-08-19), and the
 * shape it came back in is the whole point of the round trip. It used to EXPAND THE BAR, which is why
 * the footer needed a `max-height` cap, an inner scroller and `overscroll-behavior` merely to keep the
 * rate on screen on a short viewport — the figure the bar exists for could be pushed off by its own
 * explanation. It is now a POPOVER above the slab, over the equipment list, the way the deal room's
 * `.pb-breakdown` opens below its bar. The floor never moves and none of that machinery is back.
 *
 * ITS LINES ARE THE BID CARD'S — per machine, with the count applied once at the foot, through the bid
 * card's own `computeQuoteTotals`. That is the arrangement the deal room took on the same day, so the
 * three surfaces that price one offer now read alike (owner: *"use bid card in all prices surface"*).
 *
 * The overall row is `computeDealTotals`' own `grand` and never the per-unit block multiplied: the
 * transport legs carry their own negotiated counts, so a room billing five delivery runs against three
 * rented machines does not reconcile by multiplication.
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
import { computeQuoteTotals } from "@/lib/pricing/rental";
import { fmt, useLocale, useT } from "@/lib/i18n";
import { pin } from "@/lib/uiPins";

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
  const [busy, setBusy] = useState(false);
  /** The breakdown popover. Closed on every mount: it explains the figure, it is not the figure. */
  const [expanded, setExpanded] = useState(false);

  const model = priceFooterModel(bid, durationDays, startDate);
  const { totals } = model;

  /**
   * The breakdown's lines, PER MACHINE — the bid card's shape, reached through the bid card's own
   * function (owner, 2026-08-19).
   *
   * Fed `computeDealTotals`' `perUnitRental`, so nothing is derived twice and nothing is divided back
   * out of a total. `computeQuoteTotals`' `overall` block is `computeDealTotals`' to the riyal
   * (`rental-pricing.test.ts` pins it across all four price units), which is why the OVERALL row below
   * still reads `totals.grand` while the per-unit block comes from here.
   */
  const perUnit = computeQuoteTotals({
    perUnitRental: totals.perUnitRental,
    rentalUnits: totals.rentalUnits,
    mob: { amount: totals.mobPrice, units: totals.mobUnitsN, excluded: totals.mobExcluded },
    demob: { amount: totals.demobPrice, units: totals.demobUnitsN, excluded: totals.demobExcluded },
  }).perUnit;
  /** Multi-unit is the only case where the two blocks differ, so the only case that draws both. */
  const multi = totals.rentalUnits > 1;

  /**
   * Money — **Latin digits, in both locales** (`formatSar`, `rental.ts:290`).
   *
   * This converted to Arabic-Indic under `ar` and printed «٣٬٠٠٠», which disagreed with every other
   * price the renter had already seen. The rule is not this file's to make: mobile inserts an ASCII
   * comma by hand and shows the figure unchanged in the Arabic UI, so the bid card, the comparison,
   * the quotation and the signed PDF all print `3,000` — and the v3 prototype's own footer calls
   * `fmtEN(rate)` for exactly this reason. One bid was reading as two different prices depending on
   * which screen you were standing on.
   *
   * COUNTS are the other way round and stay so: `num` below still renders «٣» / «٥», which is what
   * the count pills, the distance and the prototype's `AR()` all do. Money is Latin, counts are not.
   */
  const money = (n: number): string => Math.round(n).toLocaleString("en-US");
  const num = (n: number): string => (ar ? arDigits(String(n)) : String(n));
  /** The billing period the rate is quoted over — «ر.س / يوم» for the rate, and the plural for the
   *  breakdown's basis line («× ١٤ يوم»). */
  const periodWord = (plural: boolean): string => {
    switch ((totals.priceUnit || "PER_DAY").toUpperCase()) {
      case "PER_WEEK": return plural ? t.priceFooter.weeks : t.priceFooter.week;
      case "PER_MONTH": return plural ? t.priceFooter.months : t.priceFooter.month;
      case "PER_JOB": return plural ? t.priceFooter.jobs : t.priceFooter.job;
      default: return plural ? t.priceFooter.days : t.priceFooter.day;
    }
  };

  /** The fixed divisor behind a weekly/monthly rate, in the bid card's words. */
  const divisorText = ((): string | null => {
    switch ((totals.priceUnit || "PER_DAY").toUpperCase()) {
      case "PER_WEEK": return t.priceFooter.divisorWeek;
      case "PER_MONTH": return t.priceFooter.divisorMonth;
      default: return null;
    }
  })();
  /**
   * The rental line's basis, as the bid card states it: the quoted rate over its own period, and the
   * BILLABLE days it is charged across — never the calendar span, which counts the Fridays the total
   * excludes and would state an arithmetic its own figure contradicts.
   *
   * Per machine, like the line it sits under, so the unit count is absent here and applied once at the
   * foot. Nothing prorated (PER_JOB, open-ended, no start date) keeps the bare rate: there is no day
   * count to explain.
   */
  const rentalBasis = totals.rentalRaw
    ? fmt(t.priceFooter.rentalBasisUnit, { rate: money(totals.rate), unit: periodWord(false) })
    : fmt(t.priceFooter.rentalBasisDays, {
        rate: money(totals.rate),
        unit: periodWord(false),
        days: num(totals.billableDays),
      }) + (divisorText ? ` · ${divisorText}` : "");

  /**
   * Hand off to the deal room **with the act attached**.
   *
   * Without a room this is one of exactly three acts allowed to create one (004a §4.5) — which is
   * why the id is resolved here and not left to the destination: `?act=` is meaningless until the
   * room it addresses exists.
   */
  async function handOff(act: "counter" | "accept") {
    if (busy) return;
    setBusy(true);
    try {
      const roomId = await ensureDealRoom(bid.id, bid.dealRoomId);
      router.push(`/deal-room/${encodeURIComponent(roomId)}?act=${act}`);
    } catch {
      setBusy(false);
    }
  }


  return (
    <footer {...pin("price-footer")} className="bm-foot">
      {/* ── The breakdown, back — and as a POPOVER, not a growing bar (owner, 2026-08-19) ──────────
          It was withdrawn this morning and is asked for again. What returns is not what left: the old
          one expanded the footer itself, which is why the bar needed a `max-height` cap, an inner
          scroller and `overscroll-behavior` just to keep the rate on screen on a short viewport.

          This opens ABOVE the slab and over the equipment list, the way the deal room's own
          `.pb-breakdown` opens below its bar — so the 76px floor never moves, the rate never leaves,
          and none of that machinery comes back with it. A scrim closes it, because a popover whose
          only exit is the control that opened it is one the renter has to aim at twice.

          The lines are the BID CARD's shape, per machine with the count applied once at the foot,
          which is the arrangement the deal room took on this morning. Three surfaces, one reading. */}
      {expanded && (
        <>
          <div className="bm-foot-scrim" onClick={() => setExpanded(false)} />
          <div className="bm-foot-break" role="dialog" aria-label={t.priceFooter.showDetails}>
            {multi && <div className="bm-foot-bhead">{t.priceFooter.perUnitHead}</div>}
            <Line
              label={t.priceFooter.rental}
              sub={rentalBasis}
              value={money(perUnit.rental)}
              currency={t.priceFooter.currency}
            />
            <Line
              label={t.priceFooter.mobilisation}
              value={totals.mobExcluded ? t.priceFooter.excluded : money(perUnit.mob)}
              currency={totals.mobExcluded ? undefined : t.priceFooter.currency}
              muted={totals.mobExcluded}
            />
            <Line
              label={t.priceFooter.demobilisation}
              value={totals.demobExcluded ? t.priceFooter.excluded : money(perUnit.demob)}
              currency={totals.demobExcluded ? undefined : t.priceFooter.currency}
              muted={totals.demobExcluded}
            />
            <Line label={t.priceFooter.subtotal} value={money(perUnit.subtotal)} currency={t.priceFooter.currency} />
            <Line label={t.priceFooter.vat} value={money(perUnit.vat)} currency={t.priceFooter.currency} />
            <Line label={t.priceFooter.total} value={money(perUnit.total)} currency={t.priceFooter.currency} total />
            {/* NOT per-unit × units: the transport legs carry their own negotiated counts, so the
                overall figure is `computeDealTotals`' own and never a multiplication of the block
                above it. The same rule, and the same wording, the deal room states. */}
            {multi && (
              <Line
                label={t.priceFooter.overallTotal}
                sub={fmt(t.priceFooter.unitsCount, { n: num(model.pricedUnits) })}
                value={money(totals.grand)}
                currency={t.priceFooter.currency}
                total
                overall
              />
            )}
            {!totals.hasDuration && <div className="bm-foot-note">{t.priceFooter.noDuration}</div>}
          </div>
        </>
      )}

      <div className="bm-foot-bar">
        <div className="bm-foot-figs">
          <div className="bm-foot-rate">
            {/* The numeral run is LTR inside an RTL bar; the unit follows it in reading order, so in
                Arabic «ر.س / يوم» lands to the left of the figure exactly as the app prints it. */}
            <span className="bm-foot-amt" dir="ltr">{money(totals.rate)}</span>
            <span className="bm-foot-unit">{fmt(t.priceFooter.perPeriod, { unit: periodWord(false) })}</span>
          </div>
          {/* The SOURCE of the figure, not the state of the conversation. A room whose price nothing
              has moved still reads as the opening offer — and beside it, the way into the arithmetic.

              A text LINK naming the state it moves to, not a button with a chevron: it sits inches
              from two real acts and must not carry a control's weight next to them. */}
          <div className="bm-foot-meta">
            <span className="bm-foot-src">
              {model.source === "opening_offer" ? t.priceFooter.openingOffer : t.priceFooter.fromDealRoom}
            </span>
            <button
              type="button"
              className="bm-foot-det"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? t.priceFooter.hideDetails : t.priceFooter.showDetails}
            </button>
          </div>
        </div>
        {/* TWO controls, always both — the deal room's own pair (`DealRoom.tsx:648`): Negotiate is
            always available, Accept is always VISIBLE. One-or-the-other hid the act the renter was
            looking for and made the surface decide for him.

            Neither is gated HERE any more, and that is the point of the deep link. This surface never
            could evaluate `termsMatched && priceMatches && unitsMatch` — it fetches neither the terms
            nor the last two rounds — so it used to disable Accept the moment a room existed. Now the
            room evaluates its own rule on arrival: allowed, the sheet opens; blocked, the renter lands
            on the room under the strip that names what is still unmatched. The rule never moved. */}
        <button type="button" className="bm-foot-cta" onClick={() => void handOff("counter")} disabled={busy}>
          {t.priceFooter.counterPrice}
        </button>
        <button type="button" className="bm-foot-cta is-confirm" onClick={() => void handOff("accept")} disabled={busy}>
          {t.priceFooter.confirmPrice}
        </button>
      </div>

      {/* The two numbers that are both correct (004a §4a.4). The count pills describe the OFFER; this
          prices on the AGREED count — and where they differ it is said ONCE, here (RM3-AC-66). It
          never follows `lastProposedRentalUnits`: `priceFooterModel` cannot even see that field.

          **This is the one thing that can make the footer taller than 76px**, which is why `.bm-foot`
          carries a `min-height` and not a `height`. A renegotiated count is rare and the sentence is
          the only place the two figures are reconciled; clipping it to hold a number would be the
          geometry deciding what the renter is allowed to know. */}
      {model.unitsDiffer && (
        <div className="bm-foot-units" role="note">
          {fmt(t.priceFooter.unitsDiffer, { agreed: num(model.pricedUnits), offered: num(model.offeredUnits) })}
        </div>
      )}
    </footer>
  );
}

/**
 * One breakdown line: what it is, on what basis, and how much.
 *
 * `sub` rides INSIDE the label rather than on its own row — the bid card keeps the basis beside the
 * thing it is the basis of, and a second row would read as another figure.
 */
function Line({
  label, sub, value, currency, total, overall, muted,
}: {
  label: string; sub?: string; value: string; currency?: string; total?: boolean; overall?: boolean; muted?: boolean;
}) {
  return (
    <div className={`bm-foot-row${total ? " is-total" : ""}${overall ? " is-overall" : ""}${muted ? " is-muted" : ""}`}>
      <span className="bm-foot-k">
        {label}
        {sub && <span className="bm-foot-sub">{sub}</span>}
      </span>
      {/* Every figure is a numeral run: LTR inside the RTL column, like every other number here. The
          currency follows it in reading order, so it sits on the far side in Arabic. */}
      <span className="bm-foot-v">
        <span dir="ltr">{value}</span>
        {currency && <span className="bm-foot-cur">{currency}</span>}
      </span>
    </div>
  );
}
