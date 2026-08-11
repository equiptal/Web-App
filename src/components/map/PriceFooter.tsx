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
 * ── SHAPE: the app's bid footer, top to bottom (owner's screenshot, 2026-08-11) ──────────────────
 * Breakdown first, then a rule, then the rate + the two acts. Opening the breakdown grows the footer
 * upward into the panel column and closing it returns the bar to its resting height — a fixed-width
 * column has nowhere to overlay to, which is why the equipment list scrolls and this does not. The
 * details control is an underlined TEXT LINK naming the next state («إخفاء التفاصيل»), not a button
 * with a chevron the reader has to decode.
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
  /** The billing period, singular for the rate («ر.س / يوم») and plural for the basis line («× ١٤
   *  يوم»). Arabic spells both the same on purpose — see the dictionary. */
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
   * The rental line's basis, as the bid card states it: the raw quoted rate over its own period, the
   * BILLABLE days it is charged across, and the unit count. It used to read "{rate} × N {periods}" off
   * the calendar duration — which counts the Fridays `rentalTotal` excludes, so the arithmetic on offer
   * never quite reached the figure beside it.
   */
  const rentalBasis =
    totals.rentalRaw
      ? fmt(t.priceFooter.rentalBasisFlat, {
          rate: money(totals.rate),
          unit: periodWord(false),
          n: num(totals.rentalUnits),
          units: totals.rentalUnits === 1 ? t.priceFooter.unitOne : t.priceFooter.unitMany,
        })
      : fmt(t.priceFooter.rentalBasis, {
          rate: money(totals.rate),
          unit: periodWord(false),
          days: num(totals.billableDays),
          n: num(totals.rentalUnits),
          units: totals.rentalUnits === 1 ? t.priceFooter.unitOne : t.priceFooter.unitMany,
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
    <footer className={`bm-foot${expanded ? " is-open" : ""}`}>
      {/* The breakdown sits ABOVE the rate, as it does in the app: the reader who opened it is reading
          the arithmetic, and the total it builds to should land next to the rate it explains. */}
      {expanded && (
        <div className="bm-foot-break">
          <Line
            label={t.priceFooter.rental}
            sub={rentalBasis}
            value={money(totals.rentalTotal)}
            currency={t.priceFooter.currency}
          />
          <Line
            label={t.priceFooter.mobilisation}
            value={totals.mobExcluded ? t.priceFooter.excluded : money(totals.mobTotal)}
            currency={totals.mobExcluded ? undefined : t.priceFooter.currency}
            muted={totals.mobExcluded}
          />
          <Line
            label={t.priceFooter.demobilisation}
            value={totals.demobExcluded ? t.priceFooter.excluded : money(totals.demobTotal)}
            currency={totals.demobExcluded ? undefined : t.priceFooter.currency}
            muted={totals.demobExcluded}
          />
          <Line label={t.priceFooter.subtotal} value={money(totals.subtotal)} currency={t.priceFooter.currency} />
          <Line label={t.priceFooter.vat} value={money(totals.vat)} currency={t.priceFooter.currency} />
          <Line label={t.priceFooter.total} value={money(totals.grand)} currency={t.priceFooter.currency} total />
          {!totals.hasDuration && <div className="bm-foot-note">{t.priceFooter.noDuration}</div>}
        </div>
      )}

      <div className="bm-foot-bar">
        <div className="bm-foot-figs">
          <div className="bm-foot-rate">
            {/* The numeral run is LTR inside an RTL bar; the unit follows it in reading order, so in
                Arabic «ر.س / يوم» lands to the left of the figure exactly as the app prints it. */}
            <span className="bm-foot-amt" dir="ltr">{money(totals.rate)}</span>
            <span className="bm-foot-unit">{fmt(t.priceFooter.perPeriod, { unit: periodWord(false) })}</span>
          </div>
          <div className="bm-foot-meta">
            {/* The SOURCE of the figure, not the state of the conversation. A room whose price nothing
                has moved still reads as the opening offer. */}
            <span className="bm-foot-src">
              {model.source === "opening_offer" ? t.priceFooter.openingOffer : t.priceFooter.fromDealRoom}
            </span>
            <button type="button" className="bm-foot-det" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
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
          never follows `lastProposedRentalUnits`: `priceFooterModel` cannot even see that field. */}
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
 * `sub` rides INSIDE the label rather than on its own row — the app keeps the basis beside the thing
 * it is the basis of, and a second row would read as a seventh figure.
 */
function Line({
  label, sub, value, currency, total, muted,
}: {
  label: string; sub?: string; value: string; currency?: string; total?: boolean; muted?: boolean;
}) {
  return (
    <div className={`bm-foot-row${total ? " is-total" : ""}${muted ? " is-muted" : ""}`}>
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
