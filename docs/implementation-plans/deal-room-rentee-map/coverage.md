# AC coverage audit (D2) — RMAP

Spec revision audited: `001-deal-room-rentee-map.md`, 2026-08-06 (**208 live AC rows**, 33 struck).
Every live row lands in exactly one ticket, one exclusion, or one finding below.

## Coverage by ticket

| Ticket | ACs |
|---|---|
| **T1** per-unit location | 01, 02, 03, 04, 05, 06, 07, 08, 10 |
| **T2** `unitsOffered` ownership | 08b, 183, 184, 185 |
| **T3** bid coordinates + characterization | 09 |
| **T4** ownership docs unfiltered | 101, 102 |
| **T5** fleet endpoint | 94, 95, 96, **232, 233, 234** |
| **T6** `rentee_request` backend | 91, 92, 93, 104, 105, 106, 107, 108, 110, 111, 112, 182, 205 |
| **T7** agents `SELECT` | 193 |
| **T8** contract types | 191 |
| **T9** pure selectors | 18, 19, 24, 37, 55, 56, 57, 58, 59, 146 |
| **T10** selector tests | (covers T9's set) |
| **T11** view toggle | 22, 23 |
| **T12** map canvas | 21, 29, 30, 72, 98, 99 |
| **T13** bid list | 73, 74, 169, 170, 171, 172, 173, 190, 229, 230 |
| **T15** colour key | 129, 130, 131, 132, 167, 168 |
| **T16** fleet pins | 75, 76, 77, 78, 79, 80, 81, 100 |
| **T17** footer | 31, 32, 32b, 32c, 32d, 33, 34, 35, 36, 137, 138, 139 |
| **T18** panel shell + header | 43, 83, 84, 140, 192 |
| **T19** composition bar | 143, 144, 145, 198 |
| **T20** machine chips | 147, 148 |
| **T21** availability & fit tab | 40, 42, 85, 86, 87, 119, 133, 134, 135, 136, 141, 142, 149, 150, 151 |
| **T22** document tabs | 60, 61, 61b, 62, 64, 65, 88, 103, 120, 152, 153, 154, 155, 156, 157, 158, 208, 209, 210 |
| **T23** offer with no registered machine | 178, 179, 180, 181 |
| **T24** request composition | 63, 89, 90, 113, 116, 117, 118, 159 |
| **T25** derived status | 114, 115, 121, 122 |
| **T26** notices | 124, 125, 126, 127, 128, 160, 161, 162, 163, 164, 165, 166 |
| **T27** chat tabs | 66, 67, 68, 69, 70, 71, **231** |
| **T28** supplier reply echo | (reader for 112/127; no AC of its own) |
| **T29** off-platform rows | 194, 203, 206 |
| **T30** off-platform rail + equipment panel | 197, 199, 211, 212, 213, 214 |
| **T31** off-platform read-only bar | 202, 207, 215, 216, 222, 223 |
| **T32** wire existing components | 196, 200, 201, 217, 218, 219, 220, 221, 224 |
| **T33** *(new — see F-3)* rail presence rules | 82, 174, 175, 176, 177 |
| **T34** submission VAT sum | 216 *(defect — shipped code violated it)* |
| **T35** absent company rows | 218 *(defect — bare em-dash in a key/value row)* |
| **T36** the shipped 50 km refine | — *(removal; the last surviving distance filter after D-C)* |
| **T37** per-unit `yardId` ownership | — *(security; the attack §7.2 names at bid level, unguarded per unit)* |
| **T38–T43** verification | — *(gates, run per module: FE tests · BE tests · integration · visual · spec · regression)* |
| **T44** trial-request fleet 404 | — *(defect found while building T5)* |

## Ticket status — 2026-08-06

| | Tickets |
|---|---|
| **Done, verified** | T1, T2, T3, T4, T5, T7, T8, T9, T10, T34, T35, T37, T44 |
| **In flight** | T6 (backend) · T16, T17 (web) |
| **Open** | T11–T15 *(landed, pending the T41 visual pass)* · T18–T23 · T24–T28 · T29–T33 · T36 · T38–T43 |

**T42 first pass applied to the spec (2026-08-06):** the «المورد» → «المؤجّر» sweep (14 occurrences),
§7.2's `ownershipDocs` residue struck, TC-17's sort key corrected to `'nearest'`, AC-73 reworded to the
floating panel, and all six UI decisions recorded in §11. T42 runs again per module.

## Findings

### F-1 · Five rows survive a decision that removed them — **remove**
`AC-225, AC-226, AC-227, AC-228` (distance-band filter) and **`AC-204`** (off-platform exempt from that
filter) are still live, but the filter was dropped entirely (D-C). Also drop `TC-125` and `TC-117`.

### F-2 · Two rows reference a mechanism that no longer exists — **remove**
`AC-12` and `AC-13` require `FORBIDDEN` / grant behaviour when *"they request a **bid-events token** for
that request."* Bid events were withdrawn with §7.5 — there is no token endpoint, so there is nothing to
authorize. `TC-09` goes with them. (The underlying `canAccessRequest` / T6 company-member rule is still
enforced by `getBidList` and is already covered by existing behaviour.)

### F-3 · The rail had no ticket — **new T33**
`AC-82` (chat unavailable until a supplier is selected), `AC-174` (rail absent entirely when nothing is
selected and nothing pending — no dimmed buttons), `AC-175` (supplier but no machine → chat only),
`AC-176` (machine → equipment button appears), `AC-177` (switching supplier clears the machine
selection). Verified against the prototype's `rRail()`, which matches: two buttons for a platform bid,
two different ones for off-platform, and an unread badge on chat.

### F-4 · Stale wording from the bid-pin era — **reword**
- **`AC-37`** — *"its **pin** and card render"*. Bids are no longer pinned (§4 retirement). The
  offered-vs-identified split now lives on the **row** and in the **composition bar**.
- **`AC-55`** — *"renders on the pin, the panel and **the list card**"*. Units don't render on rows;
  rows are bids. Pin + panel are correct.

### F-5 · Duplicates — harmless, but worth collapsing
`AC-129` and `AC-167` now say the same thing (exactly one colour scale, no aggregate). `AC-30` and
`AC-98` are both the RTL rule. `AC-19` overlaps `AC-197` for off-platform pins.

### F-6 · `AC-128` costs more than it looks — implementation note
*"The supplier confirms a yard and sends no message → the pin recolours … and the notification **still
fires**, triggered by the state change."* With no socket (D-B), "the state change" must be detected by
**diffing the fleet payload between two refetches** (was red, now green) and holding that diff in memory.
That is a real mechanism, not a free consequence — and it is O-1-blocked anyway, since the yard cannot be
confirmed while a deal room exists. **Recommendation:** ship the recolour (free — it just re-renders) and
defer the *notification* half with the rest of O-1, rather than building payload diffing for a state
change that cannot currently occur.

### F-7 · `AC-192` is a recorded approximation, not a testable behaviour
It documents that a confirmed yard shows as available even when the machine is booked. Assigned to T18 as
**manual-verify / documentation only** — nothing to assert.

### F-8 · §6.13 off-platform — **audited 2026-08-06.** S6 is assembly plus three real fixes

Read `link-bids.ts` (mappers) and `SharedBidSubmissionModal.tsx` against §6.13.10.

**Already built and matching the spec** — QualityRing (`:244`), reference strip (`:272-277`), photo strips
(`:423-430`), company documents (`:478`), incl-VAT grand total (`:459`), the VAT-inclusive note
(`:450-454`, matching AC-222/223), the terms grid pairing the renter's requirement against the supplier's
answer (`:337-377`), download/print footer (`:497`). AC-200's section list is largely satisfied.

**Three genuine defects / gaps:**

| # | Finding |
|---|---|
| **F-8a** | **AC-216 is violated in shipped code.** `SharedBidSubmissionModal.tsx:415` renders VAT as `sub * 0.15`. AC-216 requires **`total − subtotal`**, precisely so the lines always sum to the stored (already-rounded) total. A real fix inside T31/T32, not new work. |
| **F-8b** | **Terminology conflict across the whole feature.** The shipped web app says **«المؤجّر»** (79 occurrences vs 21 for «المورد»), and the terms grid at `:377` reads «اختيار المؤجّر». The spec writes **«المورد»** everywhere — §6.13.8, §6.3, §6.7, §6.9. This is not an off-platform detail: it decides **every new Arabic string in S3–S6.** Needs a product ruling before copy is written. |
| **F-8c** | **AC-218 is half-done.** `RoField:524` renders `value \|\| "—"`, so an absent company field shows a bare em-dash. §6.13.7's normative convention is em-dash **in a tile**, «— غير مُدخل» **in a key/value row** — and these are rows. A copy change, not new work. |

**Three spec claims confirmed against the code, no action:**

- **No message thread** (§6.13.8) is already true: `renteeMessages` is mapped (`link-bids.ts:242`) but
  rendered nowhere.
- **Submissions carry no measurement or year** — only `label` — confirming §6.13.7's rule that those two
  tiles are the **renter's own requirement** and must be labelled so (AC-212).
- **`city` and `contactInfo` are mapped client-side** (`link-bids.ts:240-241`) but never returned by the
  agents `SELECT`, so both are null in production until T7 ships. AC-193 is correct as written.

**Estimate unblocked:** S6 = hosting the existing components on the new surface, plus F-8a, F-8c and
whatever F-8b decides.

## Two areas that resolved themselves in the latest revision

- **The already-provided document interception** (§6.7.2, AC-154→157) needs each machine's document
  status. `AC-234` now makes the fleet endpoint return the full `offeredUnitsDetail` shape, so the data is
  there for offered **and** non-offered machines.
- **The spec-match grid scoped per unit** (§6.3.5, AC-119) needs per-unit `year`, certs and `fuelType`.
  Same payload, same AC. `getMatchedFleet` already selects them.
