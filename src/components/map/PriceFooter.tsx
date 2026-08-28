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
import { bucketBidTerms, type BidCard } from "@/lib/contract/bids";
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
   * Is there anything left to settle? — the halves of the room's `canAccept` this surface can see.
   *
   * `bucketBidTerms` is the same tally the bid card prints ("Conflict N · Matched N"), so a bid the
   * card calls conflicted cannot show an Accept here. The price half belongs to the room, which
   * compares the last two rounds; this gate is therefore never stricter than the room's.
   */
  const termConflicts = bucketBidTerms(bid.terms, bid.negotiableTerms).counts.conflict;
  /** RM3-AC-66 — read ONCE here. The gate below and the sentence in the breakdown share this one
   *  binding, so the difference still has a single reader in this file. */
  const unitsDiffer = model.unitsDiffer;
  const canAccept = termConflicts === 0 && !unitsDiffer;

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
      {/* ── The breakdown opens BELOW the bar, inside this footer (owner, 2026-08-28) ────────────
          It has been a growing bar, then a popover over the equipment list, and is now what the bid
          card and the deal room both do: the rate stays put and the arithmetic unfolds under it, in
          the same slab. The popover's machinery — the fixed scrim, the `bottom: 100%` anchor, the
          62vh cap — is gone with it; the footer simply gets taller, which is what `min-height`
          (never `height`) has always allowed for.

          The lines are the BID CARD's, per machine with the count applied once at the foot, and the
          note under the overall total is the bid card's own sentence. Three surfaces, one reading. */}
      <div className="bm-foot-bar">
        <div className="bm-foot-figs">
          <div className="bm-foot-rate">
            {/* The numeral run is LTR inside an RTL bar; the unit follows it in reading order, so in
                Arabic «ر.س / يوم» lands to the left of the figure exactly as the app prints it. */}
            <span className="bm-foot-amt" dir="ltr">{money(totals.rate)}</span>
            <span className="bm-foot-unit">{fmt(t.priceFooter.perPeriod, { unit: periodWord(false) })}</span>
          </div>
          {/* The way into the arithmetic, and nothing else. «From the deal room» / «Opening offer»
              named where the figure came from, which is not a thing the renter is deciding about —
              and it sat where the breakdown's own control belongs (owner, 2026-08-28). */}
          <div className="bm-foot-meta">
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
        {/* COUNTER is always available. ACCEPT appears only when there is nothing left to settle —
            the app's own rule (`DealRoom.tsx:655`, `canAccept = termsMatched && priceMatches &&
            unitsMatch`), applied here with the two halves this surface can actually see:

              · no term is in CONFLICT — `bucketBidTerms`, the same tally the bid card prints
              · the priced count and the offered count agree — the `unitsDiffer` flag

            The price half stays the room's: it compares the last two rounds, which this footer does
            not fetch. So the gate here is never STRICTER than the room's, only earlier — and the
            room still evaluates its own `canAccept` on arrival, which is what the deep link is for.

            Hidden rather than disabled, per the owner: a greyed Accept invites a press that cannot
            land, and the reason lives two screens away. Counter is the act that resolves the block. */}
        <button type="button" className="bm-foot-cta" onClick={() => void handOff("counter")} disabled={busy}>
          {t.priceFooter.counterPrice}
        </button>
        {canAccept && (
          <button type="button" className="bm-foot-cta is-confirm" onClick={() => void handOff("accept")} disabled={busy}>
            {t.priceFooter.confirmPrice}
          </button>
        )}
      </div>

      {expanded && (
        <div className="bm-foot-break" role="group" aria-label={t.priceFooter.showDetails}>
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
          {/* ── The two counts, reconciled where the multiplication happens (RM3-AC-66) ───────────
              UNDER the overall total, in the BID CARD's own sentence — `countPricedBelow` /
              `countPricedAbove`, the strings `BidCards.tsx` prints under its own totals box. It used
              to sit outside the footer's figures in wording of its own («Priced on 2 agreed units —
              the offer was made of 4»), which said the same thing twice over in two voices and read
              as a remark about the bid rather than a footnote to the figure above it. */}
          {unitsDiffer && (
            <div className="bm-foot-priced" role="note">
              {fmt(
                model.pricedUnits > model.offeredUnits
                  ? t.workspace.countPricedAbove
                  : t.workspace.countPricedBelow,
                { priced: num(model.pricedUnits), offered: num(model.offeredUnits) },
              )}
            </div>
          )}
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
