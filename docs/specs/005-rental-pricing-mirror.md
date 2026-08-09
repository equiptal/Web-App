# 005 — Rental pricing: one formula on every surface

**Status:** implemented in the web, unshipped
**Branch:** `web/deal-room-rentee-map`
**Backend change required:** none

---

## 1. What was wrong

The same bid showed different money depending on where you looked at it.

A supplier quotes **4,200 / week** on a 13-day job starting Sunday:

| Surface | Showed | Why |
| --- | --- | --- |
| Supplier's bid form (`/bid/{token}`) | 4,200 | `rate × units` — never looked at the calendar |
| Renter's off-platform card | 4,200 | same |
| Renter's comparison | 7,800 | prorated, but `÷ 7` and Fridays charged |
| Deal-room price bar | 7,700 | correct |
| Deal-room counter-offer editor | 7,800 | its own table with a 7-day week |
| Cross-quotation basket (`CompareBids`) | **54,600** | `rate × days × units` — no divisor at all |

Six surfaces, four answers. The correct figure is **7,700**.

The cause was five hand-rolled copies of the divisor table, three of which
disagreed with the mobile app, plus one surface that had no divisor at all.

## 2. The formula

Mirrors the app's `computeRentalTotal()` (`core/utils/rental_pricing.dart`) exactly.

```
billableDays = durationDays − (Fridays in the window)
perUnitRental = (rate ÷ divisor) × billableDays
```

| Basis | Divisor | Meaning |
| --- | --- | --- |
| `PER_DAY` | 1 | |
| `PER_WEEK` | **6** | Friday is the weekend |
| `PER_MONTH` | 26 | working days |
| `PER_JOB` | — | flat, never prorated |

The supplier's entered number is **not** a daily rate. It is whatever the Unit
column says. The divisor converts it to a day rate so any duration can be
priced; the two operations only cancel when the job is exactly one period.

**Fallbacks** — return the bare quoted rate, never 0 and never an error, when:
no duration (open-ended request), no start date (Fridays can't be located), a
billable window that collapses to ≤ 0 (a one-day booking landing on a Friday),
or `PER_JOB`. An unset duration must **never** default to one day: on a weekly
bid that reads as a near-zero total.

**Headline rule** — `PER_WEEK`/`PER_MONTH` cards show the **raw quoted rate** so
suppliers compare like-for-like on what was actually quoted; the prorated figure
appears in the expanded breakdown. `PER_DAY` shows the prorated total. (The
supplier's own form has no headline — it's a quotation, so it shows the money
that will be invoiced.)

**Totals** — the all-units total is *not* per-unit × units: mobilization and
demobilization carry their own counts, which merely default to the rental count.
An excluded leg contributes zero however much price is stored against it.
VAT is 15%.

## 3. What changed

Everything now routes through `src/lib/pricing/rental.ts`.

| File | Change |
| --- | --- |
| `src/lib/pricing/rental.ts` | The module. Divisors, Friday counting, `computeRentalTotal`, `computeQuoteTotals`, `durationDaysBetween`, `headlineAmount`, `formatSar` |
| `src/app/bid/[token]/BidFormClient.tsx` | Supplier form prorates; derives duration from `projectTerms.startDate`/`endDate` |
| `src/components/requests/SharedLinkBidCard.tsx` | New `startDate`/`durationDays` props; prices through the module |
| `src/components/requests/RequestBids.tsx`, `GroupBids.tsx` | Thread the request's period into the card |
| `src/components/compare/CompareBids.tsx` | `lineTotal` → `computeBidQuote` (was the 54,600 bug) |
| `src/lib/contract/comparison.ts` | `displayQuote` prorates + honours excluded legs |
| `src/components/compare/BidComparisonWorkspace.tsx` | Threads `startDate`; second `0.15` literal → `VAT_RATE` |
| `src/components/deal-room/DealRoom.tsx` | Counter-offer editor's 7-day table removed |
| `src/components/requests/SharedBidSubmissionModal.tsx` | Read-only viewer re-prices from stored rates; stops reading the backend's rate-based total |
| `src/lib/contract/requests.ts` | `durationDaysBetween` imported, not duplicated |

## 4. What the supplier sees

Worked example: monthly request, **15 Aug → 15 Oct** (61 days, 8 Fridays →
**53 billable**), supplier quotes **30,000/month**, offers **2 units**,
delivery **1,500**, return handled by the renter.

**Before**

| Item | Unit | Qty | Price | Total |
| --- | --- | --- | --- | --- |
| Rental | month | 2 | 30000 | 60,000 |
| Delivery to site | Trip | 2 | 1500 | 3,000 |

Subtotal 63,000 · VAT 9,450 · **Item total 72,450**

**After**

| Item | Unit | Qty | Price | Total |
| --- | --- | --- | --- | --- |
| Rental — *53 billable days · 26 working days/month* | month | 2 | 30000 | **122,308** |
| Delivery to site | Trip | 2 | 1500 | 3,000 |

Subtotal 125,308 · VAT 18,796 · **Item total 144,104**

Plus a line under the table: *"15 Aug – 15 Oct · 61 days, Fridays excluded → 53
billable days. Your price per month is charged pro rata over them."*

The supplier types the **same number**. Only the computed totals change.

**Unchanged:** what they enter; the Qty column; the Incl./Excl. VAT toggle;
delivery and return (flat per unit — a trip is not a period); `PER_JOB` items;
open-ended requests with no end date.

**Largest jump:** `PER_DAY`. A supplier quoting 600/day for this job saw **600**
and will now see **600 × 53 = 31,800**. That is the correct number and is what
the renter's card and comparison already showed — the form was the surface
disagreeing. It is still a big visible change on a public page suppliers have
used, so **tell ops before this reaches prod**.

## 5. Why no backend change

The backend computes and stores `total` / `grandTotal` rate-based, and the
submit payload carries only rates — there is no total field to send a corrected
figure through. That leaves two options:

1. **Add a total to the payload / prorate in the backend.** Puts a second copy
   of the formula in a second language. That duplication is the exact thing this
   spec removes; it also fixes nothing for the bids already submitted.
2. **Stop reading the stored total.** ← chosen

The web already holds everything the formula needs: the stored `rentalRate`,
`priceUnit` and `offeredUnits` on the submission, plus `startDate`/`endDate` on
the request. `total` becomes a legacy field the renter UI ignores. One formula,
one language, and it corrects historical bids retroactively.

The rule applied in both places that read a stored total:

- **`SharedLinkBidCard`** — `bid.quotedTotal` is honoured **only** when there is
  nothing to prorate over (open-ended request), otherwise it contradicts the
  breakdown printed directly above it.
- **`SharedBidSubmissionModal`** (the read-only "what the supplier sent" viewer)
  — same rule, per line and for the grand total. It fetches the bid-form payload
  already, so `projectTerms.startDate`/`endDate` were in scope: no new props, no
  new endpoint.

### The AC-216 trade

RMAP **AC-216** derives VAT as `total − subtotal` rather than `subtotal × 0.15`,
so a supplier who quoted a gross sees their exact number back instead of a
re-rounded one. Recomputing gives that up — ±1 riyal.

Taken deliberately. The stored total is wrong by ~4× on a two-month job, so
there is no fidelity left to preserve; AC-216's exactness is only worth having
while the number it protects is right. The stored gross is still used verbatim
whenever nothing was prorated (open-ended requests, `PER_JOB`), which is where
AC-216 was actually aimed.

## 6. Verification

- `tsc --noEmit` clean; lint clean on every changed file.
- **1,002 tests pass** (49 files). 21 added, covering: the form's worked example
  end-to-end; `durationDaysBetween` edge cases (plain difference not inclusive
  count, UTC, same-day clamp, null); that stripping VAT before vs. after
  proration agrees to the riyal; that a duration with **no** start date hides
  the duration row rather than charging Fridays; that an excluded leg
  contributes nothing.
- The old wrong answers are pinned as negative assertions (`not.toBe(7800)`,
  `not.toBe(700)`) so a revert fails loudly.

Excluded from those counts: `cert-rule.test.ts` (19 failures) and two type
errors in `rfq-store.tsx` — unrelated in-flight equipment-cert work.

## 7. Ship checklist

- [ ] Tell ops the supplier-facing totals rise, `PER_DAY` most of all
- [ ] Land the in-flight cert-rule work first (or exclude those files)
- [ ] Spot-check one live off-platform bid: form == card == comparison == submission viewer

Historical off-platform bids re-price on read, so the correction lands on
existing rows the moment this deploys — no migration, no backfill.
