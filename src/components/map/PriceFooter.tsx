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
 * ── SHAPE: the v3 prototype's own footer (owner, 2026-08-19) ─────────────────────────────────────
 * ONE fixed 76px slab: the rate at hero size with its unit, the negotiation state under it, and the
 * two acts on the trailing edge. Nothing here opens, nothing here grows, and there is no scroller.
 *
 * ~~A breakdown above the rate, behind «عرض التفاصيل» (owner's app screenshot, 2026-08-11).~~
 * Withdrawn. It priced six lines — rental with its basis, mobilisation, demobilisation, subtotal, VAT,
 * total — inside a 392px column, which meant the footer had to be capped, given its own scroller and
 * `overscroll-behavior`, and re-measured whenever the renter dragged the panel grip. All of that
 * machinery existed to keep the rate on screen while the breakdown was open; with no breakdown the
 * rate simply never leaves.
 *
 * **Nothing was lost with it.** The six figures are `computeDealTotals`', and TWO surfaces the renter
 * has already passed through print them in full: the **bid card** he opened this panel from breaks the
 * price down per unit — rental, the transport legs, subtotal before VAT, VAT at 15%, the grand total,
 * and an overall total besides when the bid is multi-unit (`RequestBids.tsx:535`) — and the deal room's
 * own `qp-foot` prices the same lines for a reader who came to negotiate them.
 *
 * So this footer was the THIRD place the same arithmetic was drawn, and the only one where it had to be
 * folded behind a control and given a scroller to fit. `priceFooterModel` is untouched and still returns
 * the full `totals`; this component now reads `rate`, `priceUnit` and the two counts off it.
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
  const [busy, setBusy] = useState(false);

  const model = priceFooterModel(bid, durationDays, startDate);
  const { totals } = model;

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
  /**
   * The billing period the rate is quoted over — «ر.س / يوم».
   *
   * Singular only. The plural half served the breakdown's basis line («× ١٤ يوم»), which this footer
   * no longer prints; the dictionary keeps both words because the deal room's own bar still needs the
   * pair. Kept as a parameterised helper rather than inlined so the two surfaces stay one lookup.
   */
  const periodWord = (plural: boolean): string => {
    switch ((totals.priceUnit || "PER_DAY").toUpperCase()) {
      case "PER_WEEK": return plural ? t.priceFooter.weeks : t.priceFooter.week;
      case "PER_MONTH": return plural ? t.priceFooter.months : t.priceFooter.month;
      case "PER_JOB": return plural ? t.priceFooter.jobs : t.priceFooter.job;
      default: return plural ? t.priceFooter.days : t.priceFooter.day;
    }
  };

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
    <footer className="bm-foot">
      {/* ONE bar, 76px, nothing above it (owner, 2026-08-19). The breakdown that used to sit here —
          six figures behind «عرض التفاصيل» — is gone; see the file header for what moved and what a
          renter loses. What is left is the prototype's own footer: the figure, its state, the acts. */}
      <div className="bm-foot-bar">
        <div className="bm-foot-figs">
          <div className="bm-foot-rate">
            {/* The numeral run is LTR inside an RTL bar; the unit follows it in reading order, so in
                Arabic «ر.س / يوم» lands to the left of the figure exactly as the app prints it. */}
            <span className="bm-foot-amt" dir="ltr">{money(totals.rate)}</span>
            <span className="bm-foot-unit">{fmt(t.priceFooter.perPeriod, { unit: periodWord(false) })}</span>
          </div>
          {/* The SOURCE of the figure, not the state of the conversation. A room whose price nothing
              has moved still reads as the opening offer.

              It is a plain line now, not a row: «عرض التفاصيل» was the only other thing on it, and a
              flex row holding one span is a wrapper for nothing. */}
          <div className="bm-foot-src">
            {model.source === "opening_offer" ? t.priceFooter.openingOffer : t.priceFooter.fromDealRoom}
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
