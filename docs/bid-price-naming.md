# Bid Price Naming — Delivered Cost vs Running Rate

Two ways to read the same bid. A supplier quoting a low rental with high
mobilization looks cheapest on one and expensive on the other, and which one
wins flips with the rental duration.

## The two names

| English | Arabic | What it contains |
|---|---|---|
| **Delivered Cost** | **التكلفة الشاملة** | Rental + mobilization + demobilization, for the stated duration |
| **Running Rate** | **الإيجار الدوري** | Rental only, per cycle, after the equipment is on site |

### Subtitles (show under each, so nobody guesses)

- **Delivered Cost** — rental + mobilization + demobilization
- **Running Rate** — rental value only, per cycle

- **التكلفة الشاملة** — الإيجار + التوصيل + الاسترجاع
- **الإيجار الدوري** — قيمة الإيجار فقط لكل دورة

## Worked example

| Supplier | Rental | Mob | Demob | Delivered Cost (1 cycle) | Running Rate |
|---|---|---|---|---|---|
| A | 100 | 200 | 200 | 500 | 100 |
| B | 600 | 0 | 0 | 600 | 600 |

A wins on Delivered Cost. B never does — until the second cycle, where A costs
another 100 and B another 600. Cheapest supplier depends on how long he keeps it,
which is exactly why both numbers are shown and neither is hidden behind a toggle.

## Rules

- Show both columns always. A toggle hides the flip, and the flip is the point.
- Delivered Cost is always stated **for a duration**. "Delivered Cost" with no
  cycle count attached is meaningless.
- Sort defaults to Delivered Cost. It is the number he pays first.

## Arabic alternatives considered

| Pair | Why not |
|---|---|
| السعر الواصل / سعر الإيجار الصافي | واصل is good Gulf trade language, but صافي also reads as net-of-VAT |
| التكلفة شاملة النقل والاسترجاع / سعر الإيجار الشهري | No ambiguity, too long for a column header |
| إجمالي التعاقد / أجرة التشغيل | إجمالي التعاقد hints at contract terms not yet agreed |
