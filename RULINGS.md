# RULINGS.md — the answers automation cannot derive

A test written by reading the implementation asserts what the code already does. If the code is wrong, the test pins the bug and the suite turns green over it. To catch a value that is wrong *everywhere consistently*, the expected answer has to come from outside the code.

This file is that outside. Every ruling here becomes a golden fixture in `tests/fixtures/golden.ts`, and the specs assert against the ruling — not against the implementation.

Two sections:

- **Settled** — already ruled, with a date, an owner, or an app citation in the source. Recorded here so a future change cannot quietly reverse one. No action needed unless a ruling has gone stale.
- **Open** — genuinely undecided, self-contradictory, or explicitly flagged for revisit. These block the golden fixtures.

---

## Open rulings

### R-P1 · An award may name an unregistered supplier — **spec and code disagree**

`PROJ-AC-15` says *an award requires a vendor-registered supplier. Same rule for work orders and requests.*

The code does the opposite, deliberately. `AwardDialog.tsx:123`:

```tsx
{/* Vendor registration is the renter's own gate, shown rather than enforced. */}
{s.vendorRegistered ? "" : ` · ${a.notRegistered}`}
```

An unregistered supplier is labelled and still selectable.

**Why this is not obviously wrong.** `GET /agents/renter-suppliers` does not exist yet, so today the picker falls back to a free-text name and there is no registration state to enforce against — enforcing AC-15 now would block every award. And AC-20 says the list *builds itself from real use* when a marketplace bid is accepted, which reads as registration following the work rather than gating it.

**Why it cannot just be left.** The two say different things, and nothing records which is intended. A renter awarding to a supplier they have not registered is either a normal Tuesday or a violation of the feature's own rule, and the code and the spec each answer confidently.

**What is needed:** either AC-15 is amended to *shown, not enforced*, or the picker gates on `vendorRegistered` once the endpoint ships. This is a product call about how much friction registration should add, not something the code can settle.

Related: `docs/specs/007-renter-projects-audit.md`.


### R-01 · VAT is computed two different ways — **app checked**

**The app computes VAT one way only: `subtotal × kVatRate`.** `core/utils/rental_pricing.dart:21`:

```dart
/// VAT on a subtotal.
///
/// **Deliberately NOT rounded.** The bid card is the reference every price
/// surface is matched to and it has always carried the raw product, rounding
/// only when it prints. `deal_room_pricing.dart` used to round here instead, so
/// the same deal could read a riyal apart between the room and the card that
/// opened it. One function, one answer.
double vatOn(num subtotal) => subtotal * kVatRate;
```

Five call sites, every one a multiply. Nothing in the app derives VAT from a stored gross.

So under S-14 the multiply wins, and `cycle-totals.withVat` is already right. `vatLines`' "NEVER recompute" is a web-only rule.

**What remains open** is narrower: `vatLines` exists for the shared-link off-platform submission, which the app **does not have** — so the app has never had to rule on it. Its reason is real: a stored gross the supplier actually sent, which the rows should reconcile against. See R-01b.

_Answer: recompute — `subtotal × 0.15`, per the app. Settled by S-14._

### R-01b · Does the app's rule extend to the case the app doesn't have? — **RULED**

`vatLines` exists for the shared-link off-platform submission, which the app does not have. That case stores a gross the supplier actually sent, already rounded, so deriving `total − subtotal` would make the rows reconcile with the supplier's own figure.

**Ruled: multiply everywhere, no exception.** One rule across the platform, matching the app. Where a stored gross was rounded differently, the renter sees the multiplied figure and the breakdown may sit a riyal off what the supplier sent. `vatLines` loses its derived path.

Consequence to test: a submission whose stored gross is 4,600.01 against net components of 4,000.00 shows subtotal 4,000.00, VAT 600.00, total 4,600.00.

_Answer: multiply. `subtotal × 0.15`, every surface, stored gross or not._

`vat-inclusive.ts:60` states the rule and the reason:

> **VAT is derived as `total − subtotal`, never recomputed as `subtotal × 0.15`.** A submission stores an already-rounded gross total; recomputing the tax from the net components produces a breakdown whose rows do not add up to the figure the supplier actually sent — off by a riyal on the exact screen the renter uses to decide.

`cycle-totals.ts:89` does the forbidden thing:

```ts
const vat = money(subtotal * VAT_RATE);
```

Each is defensible in isolation — `vatLines` has a stored gross to reconcile against, `withVat` is computing a fresh total and has none. The collision is a shared-link submission, which **has** a stored gross and **also** flows into the comparison matrix through `computeCycleTotals`.

**Question:** on a shared-link bid with a stored gross, does the comparison show the derived VAT (rows reconcile with what the supplier sent) or the recomputed VAT (matches every other column)?

_Answer:_

### R-02 · Rounding order — **app checked, and the web diverges**

The app is explicit, in the doc comment above `vatOn`:

> **Deliberately NOT rounded.** The bid card is the reference every price surface is matched to and it has always carried the raw product, **rounding only when it prints**. `deal_room_pricing.dart` used to round here instead, **so the same deal could read a riyal apart between the room and the card that opened it.**

The web does what the app removed. `cycle-totals.ts:88`:

```ts
const money = (v: number) => Math.round(v * 100) / 100;
const subtotal = money(rental + oneOff);
const vat = money(subtotal * VAT_RATE);
```

Every component is rounded mid-computation, then summed.

**This is the exact bug the app fixed, reintroduced on the web.** The app names the symptom: the same deal reading a riyal apart between two surfaces. That is Class A — and no agreement test would have caught it, because every web surface routes through `computeCycleTotals` and would round identically. Only the app comparison exposes it.

_Answer: carry full precision, round only at print. Per the app, and per S-14. **The web needs changing** — `money()` comes out of the computation and moves to the formatter._

### R-03 · PER_JOB — **app checked; the app contradicts itself, and so does the web**

The app's divisor map has **no `PER_JOB` key** (`rental_pricing.dart:126`):

```dart
const divisors = {'PER_DAY': kDailyBillableDays, 'PER_WEEK': kWeeklyBillableDays, 'PER_MONTH': kMonthlyBillableDays};
final divisor = divisors[priceUnit];
if (divisor == null) return rate * durationDays; // unrecognized unit — same fallback as before
```

So the app's pricing core **prorates** a PER_JOB bid. The web's override is a faithful port.

But the app's quotation does not agree with the app's own core (`live_quotation_document.dart:110`):

```dart
// PER_JOB — rate IS the line total; no prorate.
rentalSubtotal = ratePerPeriod;
```

and `quotation_document.dart:107` sets `daysPerPeriod` to `0` for PER_JOB, which "disables prorate math" and renders qty as `1`.

**In the app, a PER_JOB bid prorates on the card and is flat on the quotation.** The web inherited the same split, inverted:

| Surface | Path | 7,700 job, 62-day window |
|---|---|---|
| Comparison / agent ranking | `comparison.ts:85` — `dpp === 0 ⇒ rate × units` | **7,700** |
| Quotation | `bid-quotation.ts:234` — `rental.total × units` | **477,400** |
| Cycle totals | `computeRentalTotal` | **477,400** |

`bid-quotation.ts:235` even states the position out loud: *"Not 'flat': the app charges every calendar day of the window here."* — which is true of the app's core and false of the app's quotation.

**RULED (owner):** *"7700 is the base rental then multiplied by duration for total."*

A PER_JOB rate is a **base rental**, not a flat job price. It prorates like every other unit. So:

- The pricing core is **correct**. `rate × duration` stands, and 477,400 is the ruled figure for a 7,700 bid over a 62-day window.
- The quotation is **correct** — `bid-quotation.ts:234` already does this.
- **`comparison.ts:85` is the bug.** `if (dpp === 0) return { value: rate * units, stated: true }` shows a flat 7,700 and must go.
- **The app's quotation is wrong too** — `live_quotation_document.dart:110` (`// PER_JOB — rate IS the line total; no prorate`) and the `daysPerPeriod = 0` branch in `quotation_document.dart`. Report to the app side; do not silently match it.
- Spec 005 §2 ("flat, never prorated") is **superseded**. The owner's override was right and is now confirmed directly.

_Answer: prorates. Base rental × duration. `comparison.ts:85` is the defect; the app's quotation is a defect on their side._

### R-03c · Does PER_JOB exclude Fridays?

The ruling settles that PER_JOB multiplies by duration. It does not say **which** duration.

PER_JOB reaches the pricing core through the *unrecognised unit* branch, which returns `rate * durationDays` — **every calendar day, no Friday exclusion**:

```ts
if (divisor === 0 || !isKnownRentalUnit(args.priceUnit)) {
  return hasDuration ? { total: rate * duration, billable: duration, ... } : bare;
}
```

Every other price unit excludes Fridays (S-02: *"Friday-off applies to EVERY frequency, including daily"*). PER_JOB is the one unit that does not, and only because it falls down the unrecognised-unit path rather than being handled deliberately.

7,700 over a 15 Aug → 15 Oct window (62 days, 9 Fridays):

| | Days | Total |
|---|---|---|
| Calendar days (today) | 62 | 477,400 |
| Billable days (every other unit) | 53 | **408,100** |

**RULED: billable days. Fridays are excluded for PER_JOB too.**

No unit is an exception to S-02. PER_JOB gets a real divisor of `1` and takes the normal path, instead of falling through the unrecognised-unit branch. The unrecognised-unit fallback stays as it is, for units that genuinely are unrecognised.

Ruled figure: **7,700 base rental over 15 Aug → 15 Oct = 408,100** (53 billable days).

Note this supersedes the number in R-03 above: 477,400 was right about *prorating* and wrong about *which days*. The golden fixture takes 408,100.

_Answer: billable days. `RENTAL_DIVISOR.PER_JOB` becomes 1; the `divisor === 0` branch goes._

**RULED (owner, superseding the above): leave PER_JOB alone. Do not change it.**

PER_JOB is unreachable from either UI. The renter picks the basis and there are only three (`RentalBasis = "daily" | "weekly" | "monthly"`); the supplier never picks a unit at all — the bid form reads `it.priceUnit` off the request item. The app removed it 2026-08-05. Only the backend `PriceUnit` enum still lists it, so only pre-2026-08-05 rows can carry it.

The ruling also collapses PER_JOB into PER_DAY — `base rental × billable days` **is** `(rate ÷ 1) × billable days` — so it would gain no behaviour of its own.

**Scope of what stays broken, and why it is acceptable:** `comparison.ts:85` fires only when `dpp === 0`, which is PER_JOB alone. No daily, weekly or monthly bid reaches it. Leaving it affects legacy PER_JOB rows only.

**Not covered by this decision:** R-02 (rounding) and R-03b (`computeRental` excludes no Fridays) hit **every** price unit including daily, weekly and monthly. They remain open defects.

**Implementation hazard, recorded in case PER_JOB is ever revived — `divisor === 0` is overloaded.** It is currently the sentinel for three unrelated things, and only the first is a divisor question:

| Call site | What it uses `0` to mean |
|---|---|
| `computeRentalTotal` | "do not prorate" — the one this ruling changes |
| `hasRecurringCycle` (`rentalDivisor(unit) > 0`) | "a job is billed once, so there is no second cycle to describe" |
| `comparison.displayQuote:454` (`dppBid === 0 ? rate : …`) | "show the flat rate, no period conversion" |

Setting `PER_JOB` to `1` fixes proration and **silently breaks the other two** — a job would grow an "every cycle after" column it must not have. The change is therefore: give PER_JOB a divisor of 1, and replace the two non-pricing uses with their own named predicate (`isFlatUnit` or equivalent) rather than reading the divisor. Any test for this ruling must assert the recurring-cycle column stays null.

### R-03b · `computeRental` is a fourth divisor path, and it does not exclude Fridays

Found while resolving R-03. `rental.ts`'s own header says the module exists to end this:

> Before this module the web had three hand-rolled copies of the divisor table (`comparison.ts`, `deal-room.ts`, `GroupBids.tsx`), two of which used a 7-day week where mobile uses 6, **and none of which excluded Fridays** — so the same bid showed a different total in the app and on the web.

`comparison.ts:80` still has one. It was half-fixed: `daysPerPeriod` now delegates to `rentalDivisor`, so the 6-vs-7 error is gone. But it never calls `computeRentalTotal`:

```ts
function computeRental(bid: BidCard, fallbackDays?: number | null): Money {
  ...
  const days = num(bid.duration) ?? (fb != null && fb > 0 ? fb : null);
  if (days == null) return { value: 0, stated: false };
  return { value: (rate / dpp) * days * units, stated: true };
}
```

It takes **no start date**, so it cannot locate the Fridays, so it prorates over **calendar** days. Everything else on the platform prorates over **billable** days.

A PER_MONTH bid at 16,000 over a 62-day window:

| Path | Days used | Rental |
|---|---|---|
| `computeRental` | 62 calendar | **38,153.85** |
| `computeRentalTotal` | 53 billable (62 − 9 Fridays) | **32,615.38** |

A gap of 5,538 — not a rounding riyal.

**Where it runs.** `buildItemComparison` is live at `RequestsWorkspace.tsx:236`, and its output feeds `recommendBids` — the agent's ranking. The comment above it reads *"The web owns every figure it sends."* So **Mansour ranks bids on Friday-blind totals while the renter reads Friday-excluded ones.** The recommendation is computed on different money than the screen shows.

**RULED (owner): bug. Route it through the shared module.**

`computeRental` calls `computeRentalTotal` with the start date, like every other surface. The agent then ranks on the same money the renter reads.

Worked figure for the fixture — 16,000 PER_MONTH, 15 Aug → 15 Oct 2026 (62 days, 8 Fridays, 54 billable):

| | Days | Rental |
|---|---|---|
| `computeRental` today | 62 calendar | 38,153.85 |
| **Ruled** | 54 billable | **33,230.77** |

Gap closed: 4,923.08.

This restores what `rental.ts`'s header says the module exists for — it names `comparison.ts` as one of the three hand-rolled copies it replaced, and this is the last one still standing.

**Test must cover:** `buildItemComparison` needs the request's start date threaded in. It currently receives only `requestDurationDays`, so the fix is a signature change, and a caller that forgets the date will silently understate again (the same trap `computeRentalTotal`'s own comment warns about: *"a NEW call site that forgets it will understate silently"*).

_Answer: bug. `computeRental` routes through `computeRentalTotal`; `buildItemComparison` takes and threads the start date._

`rental.ts:135` overrides the spec on instruction:

> ⚠ This is NOT "flat, never prorated" — spec 005 §2 says that, and this deliberately overrides it on the owner's instruction to match the app in every case. A 7,700 job price over a 62-day window now reads **477,400**, per unit. There is no PER_JOB data path left in the app, so this only reaches legacy rows; **if those exist in prod, this is the line to revisit.**

**Question:** do legacy `PER_JOB` rows exist in production? If yes, 7,700 × 62 = 477,400 is what a renter sees for a job quoted at 7,700.

_Answer:_

### R-04 · Equipment verified — the web disagrees with the backend on purpose

`equipment-verification.ts` accepts `VERIFIED` only. The backend's `equipment-where.ts` folds `VERIFIED` **and** `ACCEPTED` together into `ACCEPTED_STATUSES`. So a machine at `ACCEPTED` is verified to the backend and unverified to the web.

The web follows the app's Dart twin, which is the standing ruling (the app is the reference for shared logic). But the divergence from the backend is real and undocumented as a decision.

**RESOLVED by investigation — no conflict. No ruling needed.**

The two are different states, and the backend grouping answers a different question.

`ACCEPTED` is set by exactly one path (`equipment.repository.ts:582`), and its own comment says what it means:

> the supplier 4-step wizard is the only caller of this path. Items auto-land at ACCEPTED (**active, no admin review required**) and are tagged WIZARD so the admin Equipment Submissions surface routes them to the Accepted tab. **Admin can later promote to verified** or move to rejected.

So `ACCEPTED` = live and biddable, **nobody checked it**. `VERIFIED` = an admin reviewed it.

The backend's grouping is scoped to visibility, not trust (`equipment-where.ts:37`):

```ts
/** The two verification states an admin can then activate. */
const ACCEPTED_STATUSES: EquipmentVerificationStatus[] = ['VERIFIED', 'ACCEPTED'];
const APPROVED = { adminActivated: true, verificationStatus: { in: ACCEPTED_STATUSES } };
```

That predicate answers "may this machine go live and be matched". `isEquipmentVerified` answers "may the renter be told it was checked". Different questions, correctly different answers.

**The web and the app are right**, and showing the green tick for `ACCEPTED` would tell a renter a wizard-uploaded machine had been reviewed when it had not.

_Answer: not a conflict. `VERIFIED` only. Test asserts `ACCEPTED` does **not** render the tick — that is the regression this guards._

### R-05 · Does the headline rule match what is deployed?

`rental.ts:170` — every price unit headlines the supplier's **raw quoted rate**, daily included, matching the app.

> The web used to answer false for daily and headline the prorated total instead, **which is still what prod does.**

**RESOLVED by git — prod is still on the old rule.**

The fix is `56f1b9b` (2026-08-26), *"fix(bid-card): the card the app and prod already agree on"*, and it is **not an ancestor of `origin/main`**. Staging has it; prod does not.

The commit says so itself:

> The web answered false for daily and headlined the period total, **which is still what prod does** — so a daily bid showed a TOTAL in the same column where weekly and monthly bids show a RATE... **That divergence is live in prod and this is the fix for it.**

So for a daily bid:

| Environment | Headline shows |
|---|---|
| staging (has `56f1b9b`) | the raw rate — 500 |
| prod (lacks it) | the period total — 27,000 |

_Answer: known divergence, resolved by the next prod deploy. A prod run asserts the **old** behaviour and reports it as expected-divergence, not a failure; a staging run asserts the raw rate. Once `56f1b9b` reaches main this whole entry collapses to one rule and the environment split in the test goes with it._

### R-06 · Email-first auth — the flag contradicts its own comment

`flags.ts` documents that the deployed `/auth/login` rejects a phone-less email login with `VALIDATION_ERROR 400`, and that the flag therefore *"stays `false`"*. The next line reads:

```ts
export const EMAIL_FIRST_AUTH_ENABLED: boolean = true;
```

**RESOLVED by reading the backend — the comment is stale. The flag is correct.**

`apps/backend/src/validators/auth.schema.ts` accepts phone **or** email:

```ts
phone: saudiPhoneValidator.optional(),
otpEmail: z.string().email().optional(),
...
}).refine((v) => !!v.phone || !!v.otpEmail, {
  message: 'Phone or email is required / رقم الهاتف أو البريد الإلكتروني مطلوب',
```

The schema comment records the widening as deliberate: *"WIDENING ONLY — a request with a phone (what the mobile app always sends) still validates identically."*

Git tells the rest, all on 2026-07-07:

| Commit | |
|---|---|
| `fd0c541` | "gate email-first behind a flag (default off) **until backend accepts it**" — the stale comment was written here |
| `be92f79` | "enable email-first (**backend now accepts email-only login**)" — flag flipped to `true`, comment left behind |
| backend `b791bc0e`, `f5ebf947` | the widening, same day |

The comment describes the world before `be92f79` and was never updated.

_Answer: backend caught up. `EMAIL_FIRST_AUTH_ENABLED = true` is right, AUTH-03 is a passing case, and the stale paragraph in `flags.ts` should be deleted so it stops contradicting the line below it._

### R-07 · Golden scenarios

The fixtures the whole suite asserts against. I can compute these from the app and present them for your check, or you supply them.

| # | Scenario | Needed |
|---|---|---|
| G-1 | Single unit, PER_DAY, short window | total, billable days |
| G-2 | Single unit, PER_MONTH, 180-day window | total (the 475,090 case) |
| G-3 | Multi-unit, 3 machines, PER_WEEK | total |
| G-4 | Multi-unit with legs at their own counts — 3 rented, 5 mob trips | total |
| G-5 | Multi-item — 2 excavators + 1 loader | per-item and grand total |
| G-6 | Negotiated down — priced below offered | total, and which count prices |
| G-7 | Mob excluded in the deal room | total on card, deal room and quotation |
| G-8 | VAT-inclusive shared-link submission | subtotal, VAT, total on every surface |

_Answer:_

---

## Settled rulings

Recorded so a future change cannot silently reverse one. Each becomes an assertion.

| # | Ruling | Source |
|---|---|---|
| S-01 | Divisors: `PER_DAY 1 · PER_WEEK 6 · PER_MONTH 26`. A week is six days — Friday is the weekend. | `rental.ts`, ported from `rental_pricing.dart` |
| S-02 | Fridays are excluded for **every** price unit, including PER_DAY. This platform does not bill Fridays. | `rental.ts`, `charged-days.ts` |
| S-03 | The rental window is **inclusive of both ends** — 15 Aug → 15 Oct is 62 days. Matches the backend's `inclusiveDurationDays` and the app's `_computeDurationDays`. | `durationDaysBetween` |
| S-04 | Dates are calendar days in **UTC**. Reading them locally shifts the weekday west of UTC and changes which days are Fridays. | `countFridays`, `durationDaysBetween` |
| S-05 | Per-unit rental is `(rate ÷ divisor) × billable days`. Falls back to the bare rate — never 0 — when duration or start date is unknown. | `computeRentalTotal` |
| S-06 | An unset duration must **not** default to one day. Under proration that shows a near-zero total for an open-ended weekly or monthly bid. | `computeRentalTotal`, mobile §3 |
| S-07 | The duration column is the pricing equation, **not whole cycles**. A 180-day request is 475,090, not 481,260 — 180 days holds 26 Fridays, so 154 billable days at `rate ÷ 26`. | Ruled 2026-08-12, `cycle-totals.ts` |
| S-08 | Each transport leg is charged at **its own count**, not the rental count, and is not capped by it — 5 mobilization trips against 3 rented machines charges 5. | Ruled 2026-08-26, owner |
| S-09 | The "every cycle after" column omits the legs entirely. Showing them as zero would read as "this supplier delivers free". | `cycle-totals.ts` |
| S-10 | Three counts: **machines named** (distinct equipment ids) · **offered** (`unitsOffered.length`) · **priced** (`agreedUnits ?? currentRentalUnits ?? offered`). **Only priced prices anything.** | `unit-count-notes.ts`, ported from `unit_count_notes.dart` |
| S-11 | A counter may step the unit count **up**, capped at the requested count — not at the offer. Legal for both parties. | `unit-count-notes.ts` |
| S-12 | Readiness scores proof of ownership **by caller, never by constant**. Bid-backed input excludes it (the backend strips those doc types from the renter's projection); fleet-backed input scores it. | Ruled 2026-08-12, owner |
| S-13 | Every stored submission is VAT-**exclusive**. A VAT-inclusive quote is stripped back to net on submit; the fact is carried as a tagged line in `notes`. | `vat-inclusive.ts` |
| S-14 | The app is the reference for shared logic. Where web and app disagree, **the web changes.** | Owner's standing ruling |

---

## Status

7 open · 14 settled. The open ones block `tests/fixtures/golden.ts` and therefore the Class-B suite. The Class-A agreement matrices need none of them and can be built now.
