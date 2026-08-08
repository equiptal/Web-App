# Design — extracted from the **v3** prototype, `Deal Room Map.html`

**Source of truth for layout of V5 / V6 / V10.** `design.md` in this directory describes the **v2**
prototype and is *not* this file's source: the two differ structurally (v2 had an offers list, a
composition bar and a 3-tab panel; v3 has one bid, count pills and a 2-tab detail).

## How the file was opened

`Deal Room Map.html` is 5,086,460 bytes on 394 lines. The app is **not** in the last `<style>` block —
it is an **escaped JS string** inside the final `<script>`, which starts at byte **4,633,495** and runs
to EOF: 452,965 escaped bytes → **424,043 chars / 4,488 lines** once `\n`, `\"`, `\'`, `\uXXXX` and the
HTML entities are decoded. It is a **class** with methods (`eqCard`, `unitIcon`, `siteIcon`,
`rEquipGroups`, `coDocsBody`, `rCompanyPanel`), not the plain `function` declarations the ticket
predicted — `React.createElement` aliased to `h`, no JSX. The static CSS (all `@keyframes`) is in the
**last `<style>` block at byte 4,627,210**, which is separate from the app string.

Line numbers below are into the decoded app text.

---

## 1 · Palette (`const C`, decoded line 4)

```
bg      #EDF2F7   white  #fff
blue    #16304F   blueLt rgba(22,48,79,.07)    blueBd rgba(22,48,79,.22)
orange  #E8890C   orangeLt rgba(232,137,12,.10) orangeBd rgba(232,137,12,.32)
green   #16A34A   greenLt rgba(22,163,74,.09)   greenBd rgba(22,163,74,.25)
red     #D9362A   redLt  rgba(217,54,42,.09)    redBd  rgba(217,54,42,.22)
amber   #D4780A   amberLt rgba(212,120,10,.10)  amberBd rgba(212,120,10,.25)
navy    #1C3550   deep   #16304F   muted  #6B8FA8
border  #C8D8E8   blt    #E1E9F1   surface #EFF4F9   s2 #EDF2F7
```

`C.green`/`C.red` are **`#16A34A` / `#D9362A`** — the same pair `design.md` §7 decision 1 settled and
`AVAILABILITY_COLOUR` already ships. **But the equipment card and the machine pin do not use `C.green`
/ `C.red`**: they hard-code **`#12904A`** and **`#C62A2A`** inline (lines 3997, 4014–4020, 456, 468).
**Spec §7 wins** — `#16A34A` / `#D9362A` everywhere, from `AVAILABILITY_COLOUR`, because AC-19 requires
the pin and the chip to be one derivation and AC-168 requires one red.

## 2 · The equipment card — `eqCard(s,u,oi,offeredLen)`, lines 3959–4037

Container (3971–3973):

| | |
|---|---|
| background | `#fff`, selected `#F2F6FA` |
| border | `1.5px solid #E1E9F1`, selected `1.5px solid #1C3550` |
| border-radius | `14px` |
| overflow | `hidden` |
| box-shadow (rest) | `0 1px 4px rgba(15,34,56,.05)` |
| box-shadow (selected) | `0 4px 14px rgba(15,34,56,.14)` |
| box-shadow (hover) | `0 8px 20px rgba(15,34,56,.14)`, border `#B9C9D8` (3969) |
| transition | `.15s` |
| entry animation | `dpCardIn .34s cubic-bezier(.22,.9,.3,1)`, **delay `0.05 + index·0.07` s**, `both` |

Selection accent (3974): `position:absolute; inset-inline-start:0; top:0; bottom:0; width:4px;
background:linear-gradient(180deg,#1C3550,#16304F); animation:dpCardIn .22s ease both`.
The comment at 3967 is explicit: *"Selection is neutral slate, not blue… Selection is UI, so it stays
achromatic."*

Photo cell (3988–3997): `width:104px; align-self:stretch; min-height:112px; overflow:hidden;
background:#EFF4F9; border-inline-end:1px solid #E1E9F1`, shimmering
`linear-gradient(90deg,#E8EFF6 20%,#F4F8FC 40%,#E8EFF6 60%)` at `background-size:220% 100%` with
`dpShimmer 1.25s linear infinite` until the `<img>` (`object-fit:cover`, class `dpArt`) decodes. A
**3 px availability hairline** runs down the photo's inner edge: `inset-inline-end:0; top:0; bottom:0;
width:3px; opacity:.85`.

Text column (4001): `flex:1; min-width:0; padding:11px 13px; display:flex; flex-direction:column;
gap:7px`. **Four fixed rows, none conditional on data** — the comment at 3998 states the rule: *"EVERY
card is the same height: three fixed rows — state · title · distance — and no row that appears or
disappears with the data."*

1. **title row** (4004–4011) — `font-size:14px; font-weight:800; line-height:1.35`, ellipsised, colour
   `#16304F`, text is `model + ' · ' + year`. Optional 15 px green ✓ disc for a verified machine.
   Trailing **التفاصيل** pill: `border-radius:20px; padding:3px 9px; font-size:10px; font-weight:800`,
   resting `#fff` / `1px solid #C8D8E8` / text `#16304F`, selected filled `#1C3550` with white text.
   Chevron is **`‹`** (RTL-forward).
2. **state row** (4013–4026) — `min-height:19px` so it holds its line when empty.
   - confirmed chip: `font-size:10.5px; font-weight:700; border-radius:7px; padding:2px 8px`,
     `#12904A` on `rgba(18,144,74,.12)` / border `rgba(18,144,74,.34)`, text **«✓ مؤكد توفرها»**.
   - unconfirmed chip: `border-radius:999px; padding:3px 9px; font-size:10.5px; font-weight:800`,
     `#C62A2A` on `rgba(198,42,42,.10)` / border `rgba(198,42,42,.30)`, text **«لم يوكد توفرها بعد»**,
     preceded by a **6 px breathing dot** — `dpDot 1.7s ease-in-out infinite` (4019). Comment: *"the dot
     breathes: an unanswered question is live, not a closed verdict."*
   - **اطلب التأكيد** beside it (4021–4025): **not a button** — `font-size:10.5px; font-weight:800;
     color:#16304F (C.blue); border-bottom:1px solid rgba(22,48,79,.22); cursor:pointer`.
     ⚠ In the prototype `C.blue` **is** the navy `#16304F`. **AC-33 overrides this**: the action is
     `#2563EB`.
3. **distance row** (4027–4029) — numeral `font-family:ui-monospace,monospace; direction:ltr;
   font-size:17px; font-weight:700; letter-spacing:-.4px; color:#1C3550`, then
   `font-size:11.5px; font-weight:700; color:#6B8FA8` reading **«كم من مشروعك»**.
4. **certificate row** (4033–4035) — `min-height:19px; overflow:hidden; gap:5px`, always occupies its
   line. Chips take the **orange** treatment: `#8a4f08` on `rgba(232,137,12,.10)` / border
   `rgba(232,137,12,.32)`, `font-size:10.5px; font-weight:700; border-radius:7px; padding:2px 8px`.
   Empty → `font-size:10.5px; font-weight:700; color:#6B8FA8; opacity:.7` reading
   **«لا شهادات على المعدّة»**. Comment at 4030: *"a machine with no certificates is a shorter LINE and
   not a shorter CARD."*

Card `id` is `eqcard-<id|serial>`; opening the detail scrolls the **list box's `scrollTop`** to
`el.offsetTop - box.offsetTop - 6` after 40 ms — the comment at 3981 says `scrollIntoView` is refused
because *"it moves the app."*

**Not on the card:** no serial number, no load capacity, no readiness bar, no numeric index.

## 3 · The list container — `rEquipGroups()` (4463–4479) and its host (2638)

`flex:1; overflow-y:auto; min-height:160px; padding:14px; display:flex; flex-direction:column;
gap:10px; background:#EDF2F7`.

Sort and filter, verbatim from 4478:
`offered.slice().sort((a,b)=>a.km-b.km)` — **flat, nearest first, `offered` only**. The empty state
(4474) is a centred `font-size:12px; color:#6B8FA8; line-height:1.8` line, **no card furniture**:
«لا توجد معدّة مسجّلة في هذا العرض — قدّم المورد سعراً وعدداً فقط.»

## 4 · The map marker — `unitIcon(s,u,idx,total,selected)`, lines 454–493

`L.divIcon({ className:'', iconSize:[132,124], iconAnchor:[66,124] })` — **132 × 124**, anchored at the
bottom centre (v2's was 132 × 86).

Stack, bottom-up, inside a `96 × 78` relative box:

| Layer | Values |
|---|---|
| halo (selected only) | `bottom:4px; left:50%; width:62px; height:62px; border-radius:50%; border:2px solid <ring>; animation:dpHalo 1.9s ease-out infinite` |
| ground disc | `bottom:4px; left:50%; transform:translateX(-50%) scaleY(.32); width:62px; height:62px; border-radius:50%`; confirmed `background:rgba(18,144,74,.34); border:2.5px solid #12904A`; unconfirmed `background:rgba(198,42,42,.32); border:2.5px solid #C62A2A`; **selected adds `box-shadow:0 0 0 3px rgba(37,99,235,.55)`** |
| contact shadow | `bottom:7px; transform:translateX(-50%) scaleY(.26); width:44px; height:44px; radial-gradient(closest-side,rgba(15,34,56,.42),transparent); filter:blur(1px)` |
| machine art | `width:94px; height:74px; object-fit:contain`; resting `transform:translateY(-4px)` + `drop-shadow(0 7px 7px rgba(15,34,56,.30))`; selected `animation:dpLift .55s cubic-bezier(.34,1.4,.64,1) forwards` + `drop-shadow(0 14px 12px rgba(15,34,56,.34))` |
| selected tick | `top:-2px; inset-inline-end:0; 18×18; border-radius:50%; background:#16304F; color:#fff; font-size:10px; font-weight:900; border:2px solid #fff` — glyph `✓` |
| index badge | `bottom:0; inset-inline-start:0; min-width:17px; height:17px; background:<ring>; border:2px solid #fff` — **dropped by spec §7 decision 3** |
| availability label | `margin-top:6px; background:<ring>; border:1px solid <ring>; border-radius:20px; padding:3px 10px; font-size:10px; font-weight:800; color:#fff; box-shadow:0 3px 10px rgba(15,34,56,.20)`; selected adds `transform:scale(1.06)` |
| selected name tag | `margin-top:5px; background:#fff; border:1px solid #E1E9F1; border-radius:8px; padding:2px 8px; font-size:9.5px; font-weight:800; color:#16304F; box-shadow:0 3px 10px rgba(15,34,56,.18); animation:dpTagIn .3s ease .1s both` |

Label copy (488): confirmed **«مؤكد توفرها»**, unconfirmed **«لم يوكد توفرها بعد»**, not-in-offer
«يمكنك طلبها». The selected tag (491) reads «معروضة في اللوحة» — *"shown in the panel"*, which is about
the UI, not the offer. Spec §6.4 asks for an **"in the offer" tag**, so the copy taken is
«في هذا العرض» / *In this offer*.

Comment at 484: *"One label, one fact. The readiness bar and the document count moved into the
machine's detail — a pin on a simple map says what it is and nothing else."* — v3 **has no readiness
bar on the pin**. (`bar` is still built at 457–462 as `flex:1; height:4px; border-radius:2px` segments
in `rgba(15,34,56,.55)` / `rgba(15,34,56,.14)`, but it is never interpolated into the html.)

**Not-in-offer variant** (`alt`, 467/479/481/486): grey disc `rgba(107,143,168,.22)` / border
`rgba(107,143,168,.5)`, art `grayscale(.75) opacity(.75)`, a dashed `+` badge, a white dashed label.
**Dropped** — V10 draws offered machines only.

## 5 · Project pin — `siteIcon()`, lines 262–265

`iconSize:[40,52]; iconAnchor:[20,40]`. A teardrop: `32×32; border-radius:50% 50% 50% 0;
transform:rotate(-45deg); background:#16304F; border:2px solid #fff; box-shadow:0 3px 10px
rgba(37,99,235,.5)`, with the glyph counter-rotated `45deg`. Label: `margin-top:6px; background:#fff;
border-radius:8px; padding:2px 8px; font-size:10px; font-weight:700; color:#0F2238;
box-shadow:0 2px 6px rgba(15,34,56,.2)` reading **«مشروعك»**.

## 6 · The route and the distance chip — lines 665–707

**Route (672–682).** One line per machine, **site → machine**, drawn as a **quadratic Bézier bowed
perpendicular to the chord**:

```
bow = min(56, hypot(v)) * 0.16 * (index % 2 ? -1 : 1)     // alternates side
control = midpoint + unit-normal * bow
```

sampled at 11 points per segment and drawn as **three polylines** with falling opacity —
`t ∈ [0,.42] @ .8`, `[.42,.76] @ .55`, `[.76,1] @ .3` — each
`className:'dpFlow'; color:#6E869C; weight:3; dashArray:'1 9'; lineCap:'round'; interactive:false`.
`.dpFlow` carries `animation:dpDash 2.4s linear infinite` (`@keyframes dpDash{to{stroke-dashoffset:-40}}`).
Comment at 670: *"A shallow arc, drawn as round dots that fade toward the machine: a route, not a
ruler."*

**Distance chip (683–706).** A non-interactive `iconSize:[150,26]; iconAnchor:[75,13]` divIcon riding
the line. Placement walks **from t = 0.62 backwards in 0.07 steps** until the point clears the pin box
— `clearsPin(x,y) = |x−bx| ≥ 86 || (by−y) ≥ 136 || (y−by) ≥ 26` — floor 0.18, then a 30 px
perpendicular nudge if it still does not clear, then up to 6 perpendicular offsets of
`(g%2?−1:1)·(26+13·⌊g/2⌋)` px while it sits within 58 × 24 px of a chip already placed.
Chip: `direction:rtl; background:#fff; border:1px solid #C8D8E8; border-radius:20px; padding:2px 9px;
font-size:10px; font-weight:800; color:#16304F; box-shadow:0 2px 8px rgba(15,34,56,.16)` reading
`<arabic-indic km> كم`. An out-of-city flag rides beside it in `#FFF6E8` / border
`rgba(212,120,10,.25)` / `#8a4f08`.

**Leader line (709).** When de-collision moved a pin off its yard:
`color:#A9BCCC; weight:1; opacity:.8; interactive:false`.

## 7 · Animations — the last `<style>` block, byte 4,627,210

```css
@keyframes dpCardIn { from{opacity:0;transform:translateY(9px)} to{opacity:1;transform:translateY(0)} }
@keyframes dpShimmer{ 0%{background-position:120% 0} 100%{background-position:-120% 0} }
@keyframes dpDot   { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.45;transform:scale(.72)} }
@keyframes dpLift  { 0%{translateY(0)} 45%{translateY(-13px)} 70%{translateY(-4px)} 100%{translateY(-7px)} }
@keyframes dpHalo  { 0%  {translateX(-50%) scaleY(.32) scale(1)   ;opacity:.55}
                     70% {translateX(-50%) scaleY(.32) scale(1.75);opacity:0}
                     100%{translateX(-50%) scaleY(.32) scale(1.75);opacity:0} }
@keyframes dpTagIn { from{opacity:0;transform:translateY(-5px) scale(.9)} to{opacity:1;transform:translateY(0) scale(1)} }
@keyframes dpDash  { to{stroke-dashoffset:-40} }
@keyframes dpPulse { 0%{translateX(-50%) scale(.55);opacity:.9} 70%{translateX(-50%) scale(1.3);opacity:0} 100%{opacity:0} }
@keyframes dpPing  { 0%{box-shadow:0 0 0 0 rgba(243,167,122,.5)} 70%{box-shadow:0 0 0 8px rgba(243,167,122,0)} 100%{box-shadow:0 0 0 0 rgba(243,167,122,0)} }
@keyframes dpVbadge{ 0%,100%{transform:scale(1)} 50%{transform:scale(1.16)} }
@keyframes dpFade  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
```

Interaction language, written once (not per control):

```css
button{transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,transform .09s ease,color .14s ease}
button:not(:disabled):hover {filter:brightness(.975)}
button:not(:disabled):active{transform:translateY(1px) scale(.995)}
button:focus-visible{outline:2px solid #16304F;outline-offset:2px}
.dpRow:hover{box-shadow:0 4px 14px rgba(15,34,56,.10);transform:translateY(-1px)}
.dpArt{transition:transform .35s cubic-bezier(.22,.9,.3,1)}
.dpCard:hover .dpArt{transform:scale(1.06)}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
```

## 8 · What the prototype does NOT have — the landing pulse (V6 / AC-35)

**There is no finite attention cue anywhere in the v3 file.** Every pulse in it is `infinite`
(`dpHalo`, `dpDot`, `dpPing`, `dpPulse`) or a hard-coded short count used for something else
(`dpVbadge 1.6s ease-in-out 3` at 1717, `dpPing 1.2s ease-out 2` at 1442). AC-35 — *"roughly six times
over about nine seconds and then rests, preserving its resting shadow"* — is **spec-only**, so it is
built rather than ported:

```
1.5s × 6 iterations = 9s;  the resting shadow is the FIRST shadow in a two-shadow list and never
animates, so only the ring after it grows and fades — the card cannot appear to shift.
```

## 9 · Where the spec overrides the prototype

| The prototype draws | We draw | Why |
|---|---|---|
| `#12904A` / `#C62A2A` on the card and pin | `#16A34A` / `#D9362A` (`AVAILABILITY_COLOUR`) | §7 decision 1; AC-19/168 need one derivation and one red |
| `اطلب التأكيد` in navy `#16304F` | `#2563EB` | AC-33 — beside a red chip, navy reads as disabled |
| numeric index badge on the pin | nothing | §7 decision 3 / §6.3.3 — an invented per-unit index the supplier cannot resolve |
| taxonomy emoji in the pin | the request item's taxonomy **image** → category image → glyph | §7 decision 4, AC-80 |
| «معروضة في اللوحة» on the selected pin | «في هذا العرض» / *In this offer* | §6.4 asks for an **in-offer** tag; the prototype's copy is about the panel |
| «المورد» | **«المؤجّر»** | repo-wide convention |
| hollow/dashed not-in-offer marker | nothing | V10 — offered machines only |
