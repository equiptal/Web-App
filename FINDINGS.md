# FINDINGS.md — open fix queue

Produced by `/web:test`. Open entries only. When a fix lands, strike the entry through with the commit that closed it rather than deleting it — a defect that comes back should read as a regression, not a fresh discovery.

**Run:** 2026-08-29 · local (mocked) + unit layer
**Totals:** 4 fixes — 2 blocker · 1 major · 1 minor

Severity, first match wins: **blocker** = money wrong, contract term wrong, data lost, cross-tenant leak · **major** = journey broken, or two surfaces stating different facts · **minor** = cosmetic or copy.

---

## CREATE · agent ranking

### FIX-CREATE-1 — the comparison prices Fridays that nobody bills

| | |
|---|---|
| **Case** | COMPARE-02, and every case reading `buildItemComparison` |
| **Severity** | **blocker** |
| **Where** | `src/lib/contract/comparison.ts:80` (`computeRental`) |
| **Expected** | 81,000 |
| **Actual** | 93,000 |
| **Ruling** | R-03b |

**Cause.** `computeRental` is the last of the three hand-rolled divisor paths `src/lib/pricing/rental.ts` was written to replace — its header names `comparison.ts` explicitly. It was half-repaired: `daysPerPeriod` now delegates to `rentalDivisor`, so the old 7-day-week error is gone. But it never calls `computeRentalTotal`, takes **no start date**, and therefore cannot locate the Fridays. It prorates over calendar days while the card, the deal room and the quotation prorate over billable ones.

```ts
const days = num(bid.duration) ?? (fb != null && fb > 0 ? fb : null);
if (days == null) return { value: 0, stated: false };
return { value: (rate / dpp) * days * units, stated: true };
```

3,000 PER_WEEK × 3 units over 15 Aug → 15 Oct: `(3,000 ÷ 6) × 62 × 3` = 93,000, against `(3,000 ÷ 6) × 54 × 3` = 81,000 everywhere else. A 12,000 gap on one bid.

**Why it is a blocker rather than a display bug.** `buildItemComparison` is live at `RequestsWorkspace.tsx:236`, and its output goes to `recommendBids`. The comment above the call reads *"The web owns every figure it sends."* So Mansour ranks suppliers on Friday-blind money while the renter reads Friday-excluded money — the recommendation is computed on figures that appear on no screen.

**Fix.** `computeRental` calls `computeRentalTotal({ rate, priceUnit, startDate, durationDays })` and multiplies by units, like every other caller.

**Risk.** `buildItemComparison` currently receives only `requestDurationDays`, so this is a signature change: it must take and thread the request's start date. `computeRentalTotal`'s own comment warns that *"a NEW call site that forgets it will understate silently"* — so every caller needs checking, not just the one that surfaced this.

---

## BIDVIEW · totals

### FIX-BIDVIEW-1 — rounding mid-computation, the bug the app already removed

| | |
|---|---|
| **Case** | BIDVIEW-03, COMPARE-03 |
| **Severity** | **blocker** |
| **Where** | `src/lib/contract/cycle-totals.ts:88` (`money`, `withVat`) |
| **Expected** | 38,215.38 |
| **Actual** | 38,215.39 |
| **Ruling** | R-02 |

**Cause.** Every component is rounded to 2 dp during the computation and then summed:

```ts
const money = (v: number) => Math.round(v * 100) / 100;
const subtotal = money(rental + oneOff);
const vat = money(subtotal * VAT_RATE);
```

The app states the opposite rule and the reason it exists (`core/utils/rental_pricing.dart:16`):

> **Deliberately NOT rounded.** The bid card is the reference every price surface is matched to and it has always carried the raw product, **rounding only when it prints**. `deal_room_pricing.dart` used to round here instead, **so the same deal could read a riyal apart between the room and the card that opened it.**

The web has reintroduced exactly what the app removed.

**Why the agreement matrix cannot catch this.** Every web surface routes through `computeCycleTotals` and rounds identically, so they agree with each other while disagreeing with the app. Only a comparison against the app or an independently computed value exposes it — which is what `golden-pricing.test.ts` does.

**Fix.** `money()` leaves the computation and moves to the formatter. Carry full precision through `withVat` and round only at print.

**Risk.** Any snapshot or assertion pinning a rounded intermediate will move by a halala. Those are the assertions to re-derive from the ruling, not to re-record from the new output.

---

## BIDIN · VAT

### FIX-BIDIN-1 — `vatLines` derives VAT where the ruling says multiply

| | |
|---|---|
| **Case** | BIDIN-07, BIDVIEW-04 |
| **Severity** | major |
| **Where** | `src/lib/contract/vat-inclusive.ts:68` (`vatLines`) |
| **Expected** | VAT 600.00, total 4,600.00 |
| **Actual** | VAT 600.01, total 4,600.01 |
| **Ruling** | R-01b — ruled by the owner |

**Cause.** `vatLines` derives VAT as `total − subtotal` from the stored gross:

```ts
const total = storedGross ?? subtotal * (1 + VAT_RATE);
return { subtotal, vat: total - subtotal, total };
```

Its comment forbids the multiply and gives a real reason — rows should reconcile with the gross the supplier actually sent. But the app multiplies at all five of its call sites (`vatOn(num subtotal) => subtotal * kVatRate`), and the owner ruled one rule across the platform, accepting the riyal of drift.

**Fix.** `vatLines` multiplies: `vat = subtotal * VAT_RATE`, `total = subtotal + vat`. `storedGross` stops deciding the arithmetic. Decide deliberately whether it stays as a display-only reference or is dropped — leaving it as an unused parameter invites the derivation back.

**Risk.** The submission breakdown and the read-only bottom bar (§6.13.9) share this function and must stay identical to each other. Their rows will now sit a riyal off the supplier's stored gross on unevenly-rounded submissions — the accepted cost of the ruling, and worth a note in the UI copy if renters query it.

---

## AUTH · flags

### FIX-AUTH-1 — a comment that contradicts the line below it

| | |
|---|---|
| **Case** | AUTH-03 |
| **Severity** | minor |
| **Where** | `src/lib/flags.ts` (the `EMAIL_FIRST_AUTH_ENABLED` block) |
| **Expected** | comment agrees with the value |
| **Actual** | comment says the flag *"stays `false`"*; the value is `true` |
| **Ruling** | R-06 |

**Cause.** The comment was written at `fd0c541` (*"gate email-first behind a flag (default off) until backend accepts it"*) and never updated when `be92f79` (*"enable email-first (backend now accepts email-only login)"*) flipped the value hours later. The backend widened the same day: `auth.schema.ts` now takes `phone` **or** `otpEmail` via `.refine((v) => !!v.phone || !!v.otpEmail)`.

**Fix.** Delete the stale paragraph. The flag and the backend are correct; only the comment is wrong.

**Risk.** None known. No behaviour changes.

---

## Closed this session

### ~~FIX-REQ-1 — the CLOSES column read two fields that are always empty~~ · fixed 2026-08-30

| | |
|---|---|
| **Severity** | major — every row of the home hub showed `—` |
| **Where** | `request-expiry.ts` · `requests.ts` · `HomeRequests.tsx` |

**Cause.** The column resolved a deadline from `bidDeadline` (which the module's own comment says "most never" set) and, failing that, a window built from `offerDuration` + `createdAt`. On staging `offerDuration` is **absent from the list payload entirely** and null on every request, so the fallback could never fire. Meanwhile `expiresAt` — a real date 15 to 26 days out — sat on **20 of 20** list rows, unread.

**Fix.** `expiresAt` is now a source in its own right, ranked between the link deadline and the creation window, and is carried through `RequestListItem` and `RequestGroup` (a group takes its earliest item expiry — it can only take bids for as long as its soonest-closing item can).

**Bonus.** Because the field is on the list, the column now fills with **no network call at all**. The old per-row lookup (up to two calls per visible row) is reduced to a refinement on top of an answer that is already correct — which matters much more now that expanding shows every row rather than five.

Pinned by `tests/unit/request-expiry-source.test.ts` (9 tests). The regression it guards is not "wrong dates" but the column going quiet again because the one populated field stopped being read.

### Both home-hub cards expand in place · 2026-08-30

"15 more requests" called `router.push("/requests")` — it navigated away rather than expanding, and the bids footer was an inert scroll hint. Both are now toggles that grow their card to show every row, with a "Show fewer" return. Owner chose growth over an inner scrollbar: a list you have to scroll inside a box you already scrolled to reach is two scrollbars for one list. The Arabic and English copy dropped "— scroll", which stopped being true.

---

## Not defects — recorded so they are not "found" again

**`comparison.ts:85` — PER_JOB shows a flat rate against a prorated one elsewhere.** Real, and left deliberately: PER_JOB is unreachable from either UI (`RentalBasis` offers daily/weekly/monthly only; the supplier never picks a unit), the app retired it 2026-08-05, and only the backend enum still admits it. Owner ruled: leave it. Affects legacy rows only. Revisit only if PER_JOB is revived — `RULINGS.md` R-03c records the `divisor === 0` overloading hazard that a revival would hit.

**The app's quotation treats PER_JOB as flat** (`live_quotation_document.dart:110`) while the app's own pricing core prorates it. Their side, not this repo's. Worth passing to the app team; the owner's ruling makes the quotation the wrong half.

**A forged `mt_gq` cookie grants a fresh allowance rather than blocking.** Deliberate fail-open, documented in `guest-quota-server.ts`. `tests/unit/guest-quota.test.ts` now pins the intended behaviour so nobody "fixes" it into an over-block.

---

## Environment evidence (added 2026-08-29)

### Prod — read-only, 6 unauthenticated GETs, nothing written

No `/auth/login` was ever sent to prod, so no SMS and no account touched.

| Path | Status |
|---|---|
| `/health` | 200 |
| `/master-data/cities` | 401 |
| `/notifications/me` | 401 |
| `/marketplace/received-bids` | 401 |
| `/users/me` | 401 |
| `/taxonomy` | 404 (path does not exist) |

**Access control holds on prod.** Every renter endpoint refuses an unauthenticated call.

### Staging — authenticated as the test account, read-only

Session via the staging OTP bypass, which skips Unifonic entirely (`auth.service.ts:204`: *"Staging bypass: skip Unifonic to avoid sending SMS to real prod-snapshot phone numbers"*), so no message was sent.

Live reads: 20 notifications, 18 received bids, 27 cities — all `200`.

### The backend excludes Fridays — confirmed against real bids

The strongest result of the run. Seven staging bids carry enough data to price independently:

| | Count |
|---|---|
| Match the ruled arithmetic **exactly** | **4** |
| Friday-blind (would match `rate × calendar days`) | **0** |
| Differ on unit or day count — needs per-bid investigation | 3 |

Worked example, bid #11: 255/day, 8-day window containing 1 Friday. Ruled `255 × 7 = 1,785`. Backend `estimatedTotal` = **1,785.00**. Friday-blind would be 2,040.

**This raises the severity of FIX-CREATE-1.** The Friday-blind comparison was already inconsistent with the card, the deal room and the quotation. It is now also confirmed inconsistent with the **backend's own** total. Four independent sources agree on the rule; `computeRental` is alone.

### R-03 validated on real data

**Zero `PER_JOB` rows** in staging's bid population (17 `PER_DAY`, 1 `PER_WEEK`). The decision to leave that branch alone stands on evidence rather than assumption.

### Live exposure to S-08

**7 of 18 bids (39%)** carry a transport leg whose count differs from the rental count. The "legs at their own count" rule is not a theoretical edge case — it governs more than a third of real bids.

### Open — not claimed as a defect

Three of the seven comparable bids do not match on my derived inputs rather than on the rule:

- two differ by exactly 2× the unit count I derived, so the backend prices on a different count than `currentRentalUnits → agreedUnits → unitsOffered`
- one bills 9 days on a 10-day window where I counted 2 Fridays, suggesting a different inclusive-end or Friday-count boundary

`unitsOffered` also arrives as a **list**, not a number — its length is the count, exactly as S-10 defines "offered". Any code reading it as a scalar is wrong.

These need a per-bid trace against `bid.service.ts` before anything is called a defect. Recorded as a question, not a finding.

## What this run could not reach

- **Every authenticated case.** Auth has no local mock (`appApiUrl`), and no staging or prod URL is set. All authenticated journeys are `BLOCKED (no session)`, not passing.
- **The API layer entirely.** 46 cases need a base URL and a session.
- **The document-status agreement matrix.** Four paths decide whether a document counts as present (`companyPanelSource`, `mapDealRoomDocuments`, `submissionToBidDocuments`, `documentAskSatisfied`); comparing them needs fixtures from a real bid.
- **`hidden-requests.ts`** — still imported by no test. REQ-09 has no coverage.
