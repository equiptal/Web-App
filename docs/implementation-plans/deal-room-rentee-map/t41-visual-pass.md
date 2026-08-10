# T41 · The visual pass

**Surface:** `/bids/{bidId}/equipment` — `BidMapWorkspace` and everything it mounts.
**Reference:** `design-v3.md` (the prototype's real values, extracted from `Deal Room Map.html`).

## What this list is, and is not

The fidelity work is done. `design-v3.md` records the prototype's tokens, marker, pin, basemap, card,
list, dock, interaction language and panel value by value, and the code carries them. **This list is
therefore not "compare everything".** It is only the things a value-by-value comparison cannot settle:

- text wrapping and overflow at the real panel width (**392 px**, capped at 62 %);
- RTL as it actually paints — especially inside Leaflet's LTR canvas, where every marker sets its own
  direction rather than inheriting the shell's;
- whether two adjacent shadows muddy;
- whether a 45 %-dimmed row reads as *out of scope* or as *broken*;
- real font metrics — several sizes on this surface sit within 1 px of each other (9.5 · 10 · 10.5 ·
  11 · 11.5 · 12 · 12.5 all appear on one column);
- whether an animation reads as intended, or as a flicker.

Plus every check that a spec, a ticket or a test suite already decided a human must do. Those carry
their source.

## How to run it

- **Viewport ≥ 1280 px wide.** Below that the panel hits its `max-width: 62%` cap and is no longer the
  392 px everything here is judged at.
- **Arabic first** — it is the default and the direction the prototype was drawn in. Then repeat every
  line marked **⇄** in English.
- **Pass/fail only.** "Close enough" is a fail with a note.
- Lines marked **🔒** cannot be closed until T40's staging integration lands. Record them **BLOCKED**,
  never as passes and never as fails.

**AC prefixes.** `RM3-AC-*` is the live prefix for spec `004`. `RMAP-AC-*` is spec `001`/v2 and
`DRCARD-AC-*` is spec `002` — both still govern surfaces that survived into v3. Bare `AC-nn` in code
comments is a v2 number and is *not* a live id; the spec's own boxed note above §8 says so.

⚠ **Do not run T41's own ticket body** (`archive-tickets-v2.md:401–418`). It is stale: it references
`design.md` (the **v2** prototype) and sends the runner at surfaces v3 deleted — the bid list panel,
the edge rail, the composition bar, the colour key, the three-tab drawer and the not-in-offer pin.
`tickets.md:485` re-points it at `Deal Room Map.html`, i.e. `design-v3.md`. This file is that
re-pointing, worked out.

---

## A · Test data to line up before you start

Discovering you need one of these mid-pass costs the sitting. Get them queued first.

| | Shape | Feeds |
|---|---|---|
| **D1** | A lessor with **no registered machines** in the offer — a price-and-count-only bid | Z1 |
| **D2** | A machine with **no photo** | C14, E3 |
| **D3** | A request asking for **no certificates**, and one whose machines all fall in one distance band | F1 |
| **D4** | **Two machines within ~100 m** of each other | M4, M5 |
| **D5** | A **long Arabic manufacturer + model** name (≥ 35 chars) and a long firm name | H1, C2, E8, K9 |
| **D6** | A firm with **two colleagues bidding on the same request** | K4 |
| **D7** | A **shortfall** bid — offered count > registered machines | H4, H6 |
| **D7b** | Offers of **one**, **two** and **more than ten** units — for the Arabic number agreement | H5 |
| **D8** | A machine holding **two ownership documents** and **missing** at least one required paper | G3, G4 |
| **D9** | A request with **no project location** | Z2 |
| **D10** | A **refusal** reply in the chat (`resolution ≠ provided`) | K6 |
| **D11** | An **off-platform** bid (`viaSharedLink`) — routing refuses it, so reach it by pasting the URL | Z5 |
| **D12** | A yard **more than 45 km** from the project, and one inside it | C3, M9 |
| **D13** | One offer holding a machine with **3 certificates**, one with **none**, one with a **long title** and one with **no photo** | C1 |

## B · 🔒 Blocked on T40

Do not attempt these until the backend is deployed and the surface is pointed at staging.

- **Presigned URLs actually opening** — the company panel's rows, the equipment document rows,
  «تكبير» and «تحميل» on the detail's viewer. Locally they are absent or dead.
- **The batch download's CORS.** «تنزيل (n)» fetches each file and saves it through an object URL; a
  missing `Access-Control-Allow-Origin` on the S3 response kills every file. Check the button's count
  equals the number of files that land (P4).
- **Real fleet data** — real distances, real yard names, real taxonomy PNGs, real photo aspect ratios.
  M2, C1 and C14 are only meaningful against real assets.
- **The arrival notice** (K5, K6) needs a real reply and a real refusal in a room.
- **The company panel's local-content and SASO rows** — without the deployed dual read (RM3-AC-70) they
  are structurally always "no document yet", which is indistinguishable from a genuine absence. P2's
  row inventory is only meaningful after T40.

⚠ A row that carries no url exposes **no control** (RM3-AC-69). Against an undeployed or unsigned
backend that is exactly what a *present but unsigned* paper looks like — so before T40, "no control on
this row" is not evidence of anything. Do not log P2/P4/G3 as failures locally.

⚠ T40's own "expected to FAIL" list — `AC-64, AC-97, AC-114, AC-115, AC-121` — is written in bare
`AC-nn`, which are **`RMAP-*` v2 numbers**, not `RM3-*`. Do not carry them into an `RM3` report without
re-mapping (`tickets.md:503–537`, ticket T44).

---

## M · The map and its markers

The map settles at **zoom 11** (`SITE_ZOOM`) when a site is known — that is "the zoom the map actually
settles on" for every line below unless one says otherwise.

**M1 · The marker's ground anchor against the true point.**
*Do:* select a machine whose yard you can identify on the basemap. Read the marker at zoom 11, then
zoom in step by step to 16.
*Pass:* the **bottom centre of the ground disc** sits on the yard and stays on it through every zoom
step. The machine art floating above it is not what marks the point.
*Fail:* the art's centre is on the point, or the marker slides off as you zoom.
*Ref:* `iconAnchor: [66, 124]`, `design-v3.md` §4.

**M2 · The taxonomy image at marker size.**
*Do:* look at the machine art at zoom 11, without zooming, on several taxonomies.
*Pass:* you can tell what kind of machine it is at 94 × 74, and the slate Material glyph behind it is
not visible through it.
*Fail:* the glyph reads as a watermark behind a transparent PNG, or the picture is unreadable.
*Ref:* AC-80 / decision 4. `map-proto.css` records the watermark as an *accepted residual* — your job
is to decide whether it is acceptable for **this taxonomy's actual PNGs**.

**M3 · The route's bow at the zoom the map settles on.**
*Do:* three or more machines in different directions, at zoom 11.
*Pass:* each dotted line reads as a shallow arc, and two machines in roughly the same direction bow to
**opposite** sides so both lines stay separately traceable.
*Fail:* a line is straight enough to read as a ruler, or two lines lie on each other.
*Ref:* `design-v3.md` §6 — `bow = min(56, |v|)·0.16`, alternating by index.

**M4 · The distance chip's collision-avoidance.**
*Do:* the same view, then D4.
*Pass:* no chip overlaps a marker box, no two chips overlap each other, and each chip is unambiguously
on one route.
*Fail:* a chip sits over a machine's art or its availability label, or two chips touch.

**M5 · De-collision and the leader line.**
*Do:* D4, at zoom 11 and again at 14.
*Pass:* the two markers separate, and a thin `#A9BCCC` line runs from the moved marker back to its
true yard. At 14 they no longer need separating and the leader line is gone.
*Fail:* they overlap, or a marker moves with no leader line.

**M6 · Two adjacent shadows under one marker.**
*Do:* select a machine so the availability label **and** the name tag both render. Look at it over a
pale ground, then pan so it sits over water or a park.
*Pass:* the label's shadow and the tag's shadow read as two separate cards with a clean gap.
*Fail:* they merge into one grey smear.

**M7 · The lift reads as a lift, not a flicker.**
*Do:* press a marker.
*Pass:* the machine rises once, overshoots slightly and settles. The ground disc, the contact shadow
and the ✓ tick do **not** travel with it.
*Fail:* it reads as a jump or a flicker, or the tick rides up with the art.

**M8 · The halo reads as light on the ground.**
*Do:* keep a marker selected for ~10 s.
*Pass:* the ring grows out of the disc **flattened** (the same 0.32 Y-scale as the disc) and fades.
*Fail:* it reads as a circle standing in the air, or as a flicker.

**M9 · ⇄ Marker content in English.**
*Do:* switch to English and read a selected marker and a distance chip, one of them out-of-city (D12).
*Pass:* the availability label and the name tag are centred and legible; the chip reads
`12 km` in that order; the out-of-city flag sits beside it on the correct side.
*Fail:* the unit precedes the number, or the flag jumps sides.
⚠ **This is the line most likely to fail.** Markers hard-code `dir="rtl"` (`MapCanvas.tsx:425`) and
`.bm-distchip` sets `direction: rtl` unconditionally (`map-proto.css:314`).
*Ref:* RMAP-AC-30 / RMAP-AC-98 — RMAP-TC-68 and RMAP-TC-39 are both marked **manual** in spec 001.

**M10 · The project pin's point.**
*Pass:* the teardrop's **point** touches the project location — not the circle's centre — and «مشروعك»
sits under it without covering the point.

**M11 · ⇄ The zoom control's side.**
*Pass:* top-**left** in Arabic, top-**right** in English, and never underneath the panel.
⚠ **Reversed 2026-08-10**, and this line used to read the other way round. The panel moved to the
inline-START edge by owner decision (`design-v3.md` §9), so the corner that is *opposite the panel* —
which is the actual rule; the second clause here is the whole point — is now the other one. Judge it by
whether the buttons clear the panel, not by the words left and right.

## H · The panel header, the counts and the shortfall

**H1 · A long company name at 392 px.**
*Do:* D5.
*Pass:* the name ellipsises on one line and the verified chip stays whole on the same row.
*Fail:* the chip wraps to its own line or is pushed past the panel edge.

**H2 · The two count pills are one shape, twice.**
*Pass:* both pills are white on the same border; neither is tinted. The number is heavy enough
(13 px / 800 against a 10.5 px / 700 label) that **you can read both numbers without reading either
label**.
*Fail:* one pill is tinted, or the numbers do not carry.
*Ref:* `design-v3.md` §7c — a run-on sentence made both numbers invisible, which is why the pills exist.

**H3 · The pills with a long type word.**
*Do:* a request whose Arabic taxonomy word is long.
*Pass:* the pills stay on one row, or wrap cleanly as **whole pills**.
*Fail:* a pill breaks internally, or the number separates from its label.

**H4 · The shortfall alert's colour, next to the availability red.**
*Do:* D7, with an unconfirmed machine visible in the list below it.
*Pass:* the alert reads as *attention*, the chip below it reads as *unavailable* — the amber and the red
are not competing for the same meaning.
*Ref:* RM3-AC-06 (the token itself is asserted in `bid-map.test.ts`; this is the reading, not the value).

**H5 · ⚠ The type word agrees in number, in Arabic.**
*Do:* find an offer with **one** unit, **two** units, and **more than ten**. Read the pill's sentence
aloud.
*Pass:* singular, **dual** and plural all read naturally to an Arabic reader. This needs an Arabic
speaker, not a comparison.
*Ref:* RM3-AC-08.

**H6 · The two asks share one acknowledgement.**
*Do:* press «اطلب إضافتها» on the shortfall alert.
*Pass:* it changes to its sent wording **and** the dashed list-foot ask at the bottom of the list goes
disabled and sent too.
*Fail:* only one of the two changes.

## C · The equipment list card

**C1 · Equal card height.**
*Do:* D13 — four cards of deliberately different content in one list.
*Pass:* every card is **exactly** the same height. Hold a straight edge, or screenshot and measure the
card borders.
*Ref:* RM3-AC-32. The spec strikes the equal-height clause out of the assertable criterion and labels
it **manual** in as many words: *"Equal height stays a manual check."*

**C2 · A long title at the real width.**
*Do:* D5.
*Pass:* the title ellipsises, the ✓ disc stays glued to the end of the name, and «التفاصيل ‹» stays
whole on the row.
*Fail:* the details pill is pushed off the row, wraps, or shrinks.

**C3 · The state row holds its line.**
*Do:* compare a confirmed machine inside the city against an unconfirmed one out of it (D12).
*Pass:* the confirmed card's state row — with no ask control and no «خارج المدينة» — still occupies its
19 px, and the distance row below it does not move up.

**C4 · Two states, two shapes.**
*Do:* view the list in greyscale (DevTools → Rendering → emulate `achromatopsia`), or squint.
*Pass:* you can still tell confirmed from unconfirmed — a small squared label with a ✓ against a capsule
with a dot.
*Fail:* they differ only by hue.

**C4b · The unconfirmed machine reads as *unanswered*, not as *refused*.**
*Do:* read an unconfirmed card whole — red chip, breathing dot, «لم يوكد توفرها بعد», and the ask
beside it — as a renter deciding between two lessors would.
*Pass:* it reads as *the lessor has not answered yet*.
*Fail:* it reads as *this machine is unavailable* or *the lessor refused*. Red on this surface is the
one colour that can slip into a verdict.
*Ref:* RM3-AC-20 — a tone judgement, and there is nothing behind it but this reading.

**C5 · The breathing dot reads as live, not as a blink.**
*Pass:* the 6 px dot fades and shrinks over 1.7 s — it reads as an unanswered question still open.
*Fail:* it flickers, or it is distracting enough that you cannot read the card below it.

**C6 · «اطلب التأكيد» reads as pressable.**
*Do:* look at it beside the red chip it always sits beside.
*Pass:* blue `#2563EB` with its 1 px underline — it invites a press.
*Fail:* it reads as disabled. That failure is the entire reason for the override.
*Ref:* RM3-AC-33.

**C7 · The empty certificate row reads as a stated absence.**
*Pass:* «لا شهادات على المعدّة» at 70 % opacity reads as *this machine has none*.
*Fail:* it reads as a row that failed to load.
*Ref:* RM3-AC-11.

**C8 · The near-identical sizes on one card.**
*Do:* look at the state chip (10.5), the certificate chip (10.5) and the distance unit (11.5) together.
*Pass:* the two chips match each other exactly, and the distance unit is visibly the larger.
*Fail:* the two chips do not match, or the 1 px step is invisible where it is meant to read as
hierarchy.

**C9 · The distance numeral in an RTL run.**
*Pass:* 17 px monospace, Arabic-Indic digits, still reading left to right, with «كم من مشروعك» after
them. A two-digit and a three-digit distance align down the column.

**C10 · The staggered arrival reads as assembly.**
*Do:* reload with six or more machines.
*Pass:* cards arrive nearest-first, ~70 ms apart, each rising 9 px — the list reads as being built in
distance order.
*Fail:* it reads as a stutter, or the last card arrives late enough to look broken.

**C11 · The landing cue: six pulses, not a flicker.**
*Do:* reload and watch the pre-selected card for 10 s **without touching anything**. Screen-record it
if you cannot count six by eye.
*Pass:* exactly **six** blue rings grow and fade over ~9 s, then it rests. Throughout, **the card's own
resting shadow stays visible and the card never appears to shift, resize or nudge.**
*Fail:* you count more or fewer than six; the resting shadow blinks off between pulses; the card
appears to move.
*Ref:* RM3-AC-35. The spec labels the resting-shadow clause **Manual**;
`tests/unit/rentee-map-surface.test.ts:276` defers it here by name: *"the perceptual claim itself stays
a visual check in T41."*

**C12 · The cue over a hover.**
*Do:* hover the cueing card mid-cue.
*Pass:* it keeps its hover elevation; the cue does not flatten it back to the resting one.

**C13 · Selection from the map does not move the page.**
*Do:* press a marker whose card is far down the list.
*Pass:* the **panel's list** scrolls smoothly to it; the page behind stays exactly where it was.
*Fail:* the whole page scrolls. (`scrollIntoView` is refused for precisely this — it moves the app.)

**C14 · The photo cell's shimmer stops when nothing is arriving.**
*Do:* D2.
*Pass:* the cell reads «لا صورة» and does **not** shimmer.
*Fail:* a placeholder travels forever on a machine that has no photo.

**C15 · The availability hairline is on the inner edge.**
*Pass:* the 3 px line of the machine's own colour runs down the photo's edge **facing the text**, in
both directions.

**C16 · ⇄ The chevron flips.**
*Pass:* «التفاصيل ‹» in Arabic, "Details ›" in English.
*Ref:* owner decision 2026-08-09, `design-v3.md` §9.

**C17 · Card hover.**
*Pass:* the card lifts 1 px and its shadow deepens; the photo scales to 1.06 **inside** its cell without
spilling past the rounded corner.

## F · The filter bar

**F1 · Absent when it should be absent.**
*Do:* D3 — a request asking for no certificates, and a lessor whose machines all fall in one band.
*Pass:* **no filter bar at all** — not an empty control row, not a bare count line.
*Ref:* RM3-AC-28a / 28b.

**F2 · Chip wrapping at 392 px.**
*Do:* a request with several certificates and three distance bands.
*Pass:* each row's chips wrap under the 44 px label without the label moving, and no chip is clipped by
the panel's edge.

**F3 · A pressed chip reads as pressed.**
*Pass:* fill and border together say it at a glance, and the match count stays legible at 62 % opacity.
*Fail:* pressed and unpressed differ only by a border you have to hunt for.

**F4 · The filtered empty state is not mistakable for the no-machines one.**
*Do:* filter everything out, then look at Z1 side by side.
*Pass:* this one names the active filters, gives the offer's total, and carries a way out. It reads as
a statement about **the chips**; Z1 reads as a statement about **the lessor**.
*Ref:* RM3-AC-28e against RM3-AC-26.

## E · The machine detail

**E1 · The takeover replaces the whole panel.**
*Pass:* the header, the count pills and the shortfall are **gone** — not squeezed above the detail.
*Ref:* RM3-AC-36.

**E1b · The five parts, in that order.**
*Do:* scroll the machine tab top to bottom.
*Pass:* viewer → two tabs → the `availability · distance · yard` line → the six-cell match grid → the
ask footer. Nothing else between them, and no specification dump.
*Ref:* RM3-AC-14 — the criterion says *"in order"*, which is a look-at-it check.

**E2 · A viewer, not a hero.**
*Pass:* a 196 px photo; a circular back control on the leading corner; «تكبير» and «تحميل» on the
opposite one; and a **white caption strip under the image** — no gradient scrim written over the
photograph.
*Ref:* the prototype's frame and the owner's screenshot, 2026-08-09.

**E3 · No photo, same geometry.**
*Do:* D2.
*Pass:* the empty viewer states it in words and still holds its 196 px, so the tabs below do not move up.

**E4 · Underline tabs, not pills.**
*Pass:* a full-width strip of two flush halves; the live one carries a 2 px navy rule **and nothing
else**; the strip sits hard against the viewer's bottom edge with no seam of panel background between
them.
*Fail:* bordered pills floating in their own padding — a different genus of control.
*Ref:* 2026-08-09, prototype + owner's screenshot.

**E5 · The tab badge equals what is inside.**
*Do:* open the documents tab and count the rows that actually need action.
*Pass:* the badge equals that count. The operator group contributes nothing to it.
*Ref:* RM3-AC-42.

**E6 · The availability line reads as a state, not a reason.**
*Do:* an unconfirmed machine.
*Pass:* reading `availability · distance · yard` as a renter would, the yard name beside the chip does
**not** read as *the reason* availability is unconfirmed.
*Ref:* RM3-AC-30. `tests/unit/availability-chip.test.ts:27` marks this the one deliberate exclusion in
the file — a reading-level judgement no assertion can make.

**E7 · The match grid without colour.**
*Do:* view the six cells in greyscale.
*Pass:* met / not-required / missing are still distinguishable by their mark (`✓` · `—` · `!`).
*Fail:* the three cells are only hue.

**E8 · A long model name in the detail header.**
*Do:* D5.
*Pass:* it wraps or ellipsises without pushing the availability chip off its corner.

**E9 · The footer belongs to one tab.**
*Pass:* the 76 px ask footer is present on the machine tab and absent on the documents tab, and its two
asks are whole and do not wrap.

## G · The documents tab

**G1 · The operator rows line up with the rest.**
*Pass:* they carry no checkbox, no view control and no ask — but a **held spacer** where the tick would
be, so the row still lines up with the rows above and below it.
*Fail:* the operator rows are visibly a differently-shaped thing that got in by mistake.
*Ref:* RM3-AC-75.

**G2 · A missing row's red is a tint and a hairline.**
*Pass:* `rgba(198,42,42,.045)` fill inside a `.22` border with a `#C62A2A` status line. The **only**
filled red on this surface is the availability chip.
*Fail:* a filled red block.

**G3 · ⚠ The 45 % dim reads as *out of scope*, not as *broken*.**
*Do:* D8. Tick a **held** row first, and look at what happens to the missing rows. Then clear and tick a
**missing** row first, and look at the held ones.
*Pass:* the other mode's rows drop to 45 %. **You can still read the name and the status**, and the row
reads as *not for this selection* — it has not gone away, it is out of scope.
*Fail:* a dimmed row reads as a failed load, a half-rendered row, or an error.
*Ref:* RM3-AC-77; the 45 % is the owner's number (2026-08-08).

**G4 · The dimmed row's tick is visibly inert.**
*Pass:* the checkbox shows a not-allowed cursor, cannot be clicked, and is skipped by <kbd>Tab</kbd>.
*Fail:* it looks dead but still takes a click — which is worse than one that looks alive.

**G4b · The disabled footer button reads as disabled, and keeps its shape.**
*Do:* with nothing ticked, both footer buttons are disabled; tick a held row and watch the pair.
*Pass:* **both buttons stay visible**; only the supported one goes live, in navy `#1C3550`. The dead one
is greyed with a paler border, muted text, ~70 % opacity and a `not-allowed` cursor — and it does **not
shrink or move**. A control that changes size when it goes dead moves the one beside it.
*Fail:* a button disappears, or the disabled one is indistinguishable from the live one at a glance.
*Ref:* RM3-AC-38, RM3-AC-77, V17's treatment.

**G4c · Exactly one select-all link, and it is the right one.**
*Do:* at **neutral** (nothing ticked), look at each group's bar. Then tick a held row, then a missing one.
*Pass:* **one** link on screen per group, never two. At neutral it is the one the majority of that
group's tickable rows would answer; an exact tie shows «حدّد كل المتاح».
*Fail:* two links side by side — which says nothing about which governs the ticks below.
*Ref:* RM3-AC-78.

**G4d · The photo group counts what it drew.**
*Do:* a machine with a front photo and no meter or side photo.
*Pass:* `front` and the serial/plate row render whether uploaded or not and go red when absent; `meter`
and `side` do **not** render at all; the group's count is over the rows on screen — never "of 4".
*Ref:* RM3-AC-74 (corrected 2026-08-09 to a denominator of 2).

**G5 · The select-all bar is one checkbox at the head of a column.**
*Pass:* a real 22 × 22 tick — the **same** control the rows carry — at the head of the rows' column,
with «إلغاء التحديد (n)» on the far edge.
*Fail:* two adjacent text links, which say nothing about which of them governs the ticks beneath.

**G6 · Text before thumbnail.**
*Pass:* the row's name and status come before its thumbnail in reading order, in **both** directions.

**G6b · ⚠ The select-all bar and the footer survive a scroll.**
*Do:* a machine whose document list is longer than the panel. Scroll it to the bottom.
*Pass:* the select-all bar and the request/download footer stay visible throughout.
*Fail:* either scrolls out of reach, leaving a ticked selection with nothing to answer it.
*Ref:* RMAP-AC-120 / RMAP-AC-158 (v2), **which no `RM3-AC-*` restates**. Treat a failure here as a spec
gap to raise, not only as a defect.

**G7 · Side by side with the owner's screenshot.**
*Do:* open the owner's screenshot of the documents tab and the built tab at the **same width**, next to
each other.
*Pass:* the attention pill's wording («١ يحتاج انتباه»), the tab underline, the select-all bar's shape,
the row order and the red treatment all match. Every deliberate difference is listed with the decision
that authorises it.
*Fail:* an unexplained difference. That is a defect, not a variation.
*Ref:* the original T41 standard, `archive-tickets-v2.md:416`.

## P · The company panel

**P1 · It opens over the panel, not as a modal.**
*Pass:* the map stays visible and un-dimmed; closing returns you to exactly the list or the detail you
left, scrolled where you left it.
*Ref:* spec 004 §6.1.

**P2 · A row with no file is listed but not tickable.**
*Pass:* it shows its status and carries no live tick — never a tick that does nothing.
*Ref:* RM3-AC-69 / RM3-TC-25.

**P3 · The download control is navy.**
*Pass:* «تنزيل (n)» is the panel's dark control, not the blue one.
*Ref:* owner, 2026-08-08, from his own prototype screenshot.

**P4 · 🔒 The batch's count is the number of files that land.**
*Do:* after T40. Tick n rows, press «تنزيل (n)», count the saved files.
*Pass:* n files land, each named after the row the renter read.
*Ref:* RM3-TC-25. Also the CORS check in §B.

**P5 · The firm is named the same way twice.**
*Pass:* the name in the panel is the same string as in the header two lines above it.

## K · The chat dock and its notice

**K1 · It floats, and there is no rail.**
*Pass:* one pill over the map at the inline-start bottom corner. **No edge rail anywhere on the
surface.**
*Ref:* RM3-AC-23; RM3-TC-11 is marked **manual** in the spec's test plan and
`tests/unit/chat-dock.test.ts:18` repeats it.

**K2 · The white ring earns its keep.**
*Do:* pan the map so the dock sits over water, a park, and a dense dark block.
*Pass:* the 2 px white ring keeps the dark pill legible over all three.
*Fail:* the pill disappears into the tiles — the failure the ring exists for.

**K3 · The unread badge pings without smearing.**
*Pass:* a **warm** ring expands from the red disc and fades; the ring is visibly not the same red as
the disc.
*Fail:* it reads as a smear, or as a flicker.

**K4 · The tab strip is absent, not empty.**
*Do:* a bid with exactly one counterparty. Then D6.
*Pass:* with one, there is no strip **and no reserved blank row** above the message list — inspect the
DOM if in doubt. With two, the strip appears.
*Ref:* RM3-AC-44. `tests/unit/chat-dock.test.ts:281` leaves the painted result here in as many words:
*"what stays UNPROVEN here is the PAINTED result… That needs a component harness (RM3-TC-11,
manual-verify)."*

**K4b · Switching tab does not disturb the map.**
*Do:* D6 — select a machine, open the dock, switch to the sibling tab and back.
*Pass:* the map, the selection ring and the panel's scroll position are **exactly** where you left them
— no flicker, no re-fit, no re-land of the cue.
*Ref:* RM3-AC-49.

**K5 · 🔒 The arrival bubble is filled, not outlined.**
*Pass:* solid `#1D4ED8` behind a 2 px white border. Against a full map, it wins.
*Fail:* an outlined or tinted card — which is what it competes against and loses to.
*Ref:* 004a §2.1.

**K6 · 🔒 The refusal is a different arrival before it is read.**
*Do:* D10.
*Pass:* the warm `#B26206` fill is recognisable as *not the blue one* at a glance.

**K7 · The tail points at the dock.**
*Pass:* the white-edged tail sits under the bubble and points down at the pill it belongs to, **in both
directions**.

**K8 · The body clamps to two lines.**
*Do:* a long message.
*Pass:* exactly two lines, then it stops. Nothing overflows the bubble.

**K9 · The counterparty name at 296 px.**
*Do:* D5.
*Pass:* it ellipsises on one line and the ✕ stays on the head row.

**K10 · The `↩ ref · serial` line.**
*Pass:* monospace, LTR, on one line, inside an RTL bubble.

**K11 · ⇄ The dock's side.**
*Pass:* inline-start bottom — the map's right in Arabic, its left in English — and never under the
panel.

**K11b · 🔒 No arrival copy implies immediacy.**
*Do:* read every string on the bubble and in the dock's list.
*Pass:* it says *you have a reply* — never *just arrived*, *now*, or *live*. The mechanism behind it is
a refresh on a timer, not a push, and the copy must not out-claim it.
*Ref:* RM3-AC-64 — a pure copy judgement, with nothing assertable behind it.

**K12 · RTL numerals inside a chat card.**
*Do:* an Arabic deal room holding a counter-offer card.
*Pass:* the card text flows RTL, the numeric run stays LTR and un-mirrored, the old→new arrow points the
right way, and the translate affordance is present.
*Ref:* DRCARD-AC-15 / DRCARD-AC-17 — DRCARD-TC-10 is marked **manual** in spec 002 and
`tests/unit/deal-room-cards.test.ts:12` repeats it.

## R · The price footer

**R1 · It closes the column.**
*Pass:* it sits at the bottom of the panel and does not scroll with the list.

**R2 · التفاصيل expands in place.**
*Pass:* the footer grows and the **list above it shortens**.
*Fail:* it overlays the list, or opens as a popover or a sheet.

**R3 · The figures are LTR runs inside an RTL column.**
*Pass:* the rate, every breakdown line and the total are LTR; Arabic-Indic digits in Arabic; the decimal
grouping does not reverse.

**R4 · The rate and the total do not fight.**
*Pass:* both are 17 px — check that the bar's rate still reads as the headline and the source line
(«العرض الافتتاحي» / from the deal room) reads as subordinate to it.

**R5 · An excluded mobilisation.**
*Pass:* the row reads «مستثناة» in the muted treatment — **never `0`**, which is a different claim.

**R6 · The units-differ note is said once.**
*Do:* a bid whose agreed count ≠ its offered count.
*Pass:* the sentence appears **only** in the footer. The count pills upstairs still describe the offer
and say nothing about it.
*Ref:* RM3-AC-66.

**R7 · The CTA's two labels do not move the control beside them.**
*Pass:* «تفاوض» and «متابعة التفاوض» — the width change does not shift التفاصيل out of place.

## Z · Empty and degraded states

**Z1 · No registered machines: no card furniture.**
*Do:* D1.
*Pass:* two centred lines of text. **No `<ul>`, no card outline, no chip, no photo cell.**
*Fail:* anything that resembles a greyed-out card — which would read as a machine that failed to load.
*Ref:* RM3-AC-26; RMAP-TC-39 is marked **manual**.

**Z2 · No project location.**
*Do:* D9.
*Pass:* the canvas still renders and says so, and every card's distance reads «المسافة غير معروفة».
*Fail:* any card shows `0` km.
*Ref:* RM3-AC-21.

**Z3 · Nothing plottable.**
*Do:* a lessor whose offered machines all lack coordinates.
*Pass:* the map states it over the canvas, **and the list still shows every card**.
*Fail:* an empty map with no sentence, which reads as *this lessor has no machines*.

**Z4 · A failed fleet fetch.**
*Do:* block the fleet request in DevTools and reload.
*Pass:* the failure is stated as **ours**, the count pills do **not** render, and the list is empty
rather than claiming anything.
*Fail:* «٠ لدى المؤجّر» anywhere on screen.

**Z5 · An off-platform bid.**
*Do:* D11.
*Pass:* the pin-less explanation over the canvas, no chat dock, and no count pills.

**Z6 · Only one info card at a time.**
*Pass:* the loading spinner, the off-platform line, the fetch-failure line and the nothing-plottable
line never stack over the canvas together.

**Z7 · Reduced motion.**
*Do:* turn on the OS "reduce motion" setting and reload.
*Pass:* nothing animates — no landing cue, no shimmer, no ping, no dashed route, no lift — **but a
button still answers a press with a colour change**.
*Fail:* the surface goes completely inert on press. A control that stops answering is worse for the
reader that setting exists for than one that answers quietly.
*Ref:* `design-v3.md` §7 — the prototype's own switch names `animation` only; ours deliberately extends
it and keeps the colour.

## N · What must NOT be on screen

`design-v3.md` §9 lists the seven places where *matching the prototype* is **wrong**. These are the
lines where a faithful copy is the defect. Sweep the whole surface once for all of them.

**N1 · No numeric index badge on any pin.** The prototype draws one; it is an invented per-unit index
the lessor cannot resolve. *Ref:* §7 decision 3.

**N2 · No hollow or dashed "not-in-offer" marker.** V10 draws offered machines only — a grey disc,
greyscaled art or a dashed `+` badge anywhere on the canvas is a fail.

**N3 · The selected pin's tag reads «في هذا العرض»**, never the prototype's «معروضة في اللوحة» (which
is about the panel, not the offer). *Ref:* §6.4.

**N4 · «المؤجّر» everywhere, «المورد» nowhere.** Check the list's empty state, the list-foot ask and
the documents tab's ask — all three are places the prototype (and one owner note) wrote «المورد».

**N5 · One green and one red.** `#16A34A` / `#D9362A` on every chip, hairline and pin. The prototype's
`#12904A` / `#C62A2A` must not survive anywhere. *Ref:* §7 decision 1, RM3-AC-19 / AC-168.

**N6 · No bid-quality score, ring or percentage** anywhere on the surface — panel, card, marker,
detail, documents, company panel or footer. *Ref:* RM3-AC-29; the model half is asserted, the
"anywhere on screen" half is this sweep.

**N7 · The unconfirmed chip states no reason.** No cause, no location-source explanation, no "the
lessor has not shared a yard" — only that availability is not confirmed, and the ask as the next step.
*Ref:* RM3-AC-30.

**N8 · The view is one bid.** No offer list, no supplier switcher, no item strip, no edge rail.
*Ref:* RM3-AC-01, RM3-AC-23.

---

## Recording the result

Per the standard the original T41 set (`archive-tickets-v2.md:401–418`): screenshot both sides for
anything that fails, and **list every deliberate difference with the AC or decision that authorises
it**. An unexplained difference is a defect, not a variation.

Three lines carry a heavier obligation because a suite named them and stopped: **C1** (RM3-AC-32),
**C11** (RM3-AC-35) and **K4** (RM3-AC-44). Their coverage is the visual pass — there is no test behind
them to catch a regression later.
