# Design reference (D1) — extracted from `deal-room-rentee-map-v2.html`

The prototype is a 1.1 MB single file with React and Leaflet bundled inline; nobody will read it while
coding. This is its **structure, layout and component anatomy**, extracted verbatim, so S3–S6 can be
built against exact values. Where the spec and the prototype disagree, see **§Conflicts** at the end —
those are the only places the prototype is not the answer.

Prototype render functions are named in `code` so you can diff against the source when in doubt.

## 1. Screen skeleton

```
<div dir="rtl" lang="ar">                    height:100vh; flex column; overflow:hidden
│                                            background #F5F8FC; color #0F2238; font-size 14px
├── header                                   height 62px; flex-shrink 0; bg #fff
│     ├── supplierChip                       border-bottom 1px #E4EDF5; gap 18px; padding 0 22px
│     ├── divider  1×30px #E4EDF5            z-index 30; shadow 0 1px 3px rgba(15,34,56,.05)
│     ├── requestSummary   ← `rRequest()`    a button; opens the machine panel
│     └── modeToggle (pushed inline-end)
│
├── itemStrip                                only when the RFQ has >1 item
│
├── div  flex:1; position:relative; min-height:0
│     └── main #dpMap                        position:absolute; inset:0; overflow:hidden
│           │                                bg radial-gradient(120% 90% at 50% 30%, #DDE9E0, #C9DACB)
│           ├── #dpLeaflet                   inset:0; z-index 0; bg #DDE9E0
│           ├── #dpGuide      ← bid panel    top 18px; left 18px; width 392px
│           │                                max-width calc(100% - 130px); z-index 24
│           ├── #dpRail       ← `rRail()`    top 31%; right 12px; column; gap 11px; z-index 25
│           └── #dpDrawer     ← `rDrawer()`  top/bottom/right 14px; width 420px; z-index 40
│
└── footer #dpPrice                          flex-shrink 0; bg #0F2238; #fff; z-index 20
                                             ← OUTSIDE the map, not floating
```

**The bid panel is never replaced.** Prototype comment: *"the bid list is the entry point and stays
visible in every state."* The drawer overlays the map beside it; both are visible together.

**The rail hides while the drawer is open** — `opacity: open ? 0 : 1`, `pointerEvents:'none'`,
`transition: opacity .2s`. This is why §6.8.5 records that a message arriving with a panel open produces
the popup and not the bubble.

**RTL note.** The prototype uses **physical** `left` for the bid panel and `right` for the rail and
drawer on a `dir="rtl"` page. In Arabic that means: bid panel on the **visual left** (= inline-end),
rail and drawer on the **visual right** (= inline-start). Reproduce that arrangement; do not blindly
swap to logical properties, or the two panels trade places. Inside components the prototype *does* use
logical props (`insetInlineStart/End`) for badges and accents — keep those logical.

## 2. Component tree → files we build

| Prototype | Ours | Notes |
|---|---|---|
| shell + header + `modeToggleEl` | `GroupBids.tsx` (existing) + `BidMapWorkspace.tsx` | the toggle lands in the existing controls cluster (`:674`) |
| `#dpLeaflet` + `updateLeaflet()` | `MapCanvas.tsx` | `react-leaflet` `MapContainer`, custom `divIcon` pins |
| `rBidsPanel()` + `rColourKey()` | `BidListPanel.tsx` + `ColourKey.tsx` | key is **inside** the panel, collapsed |
| `rRail()` / `railShell()` / `railBtn()` | `MapRail.tsx` | **T33** |
| `rDrawer()` | `MachinePanel.tsx` | floating card, not a flush drawer |
| `rMachineHeader()` | `MachineIdentityHeader.tsx` | sticky by `flexShrink:0` |
| `rMachineTabs()` | `MachineTabs.tsx` | keys `fit` · `docs` · `co` |
| `rOfferSummary()` | `CompositionBar.tsx` | **T19** |
| `pEquipFit()` | `MachineFitTab.tsx` | photos → match grid → actions |
| `rDocPanel(docs, scope)` | `MachineDocsTab.tsx` | one component, two scopes (`equip` / `company`) |
| `rFitActions()` | `MachineRequestRows.tsx` | the two stacked request rows |
| `rNoMachines()` | `NoMachineEmptyState.tsx` | **T23** |
| `priceBarEl` | re-host the shipped `DealRoom` bar | **see Conflicts #1** |
| `rSubmissionModal()` / `pOffEquip()` | existing `SharedBidSubmissionModal` / `BidEquipmentModal` | **T30–T32** |

## 3. Three states, and what appears in each

| | Bid panel | Map | Rail | Drawer | Footer |
|---|---|---|---|---|---|
| **1 · project only** | visible, all rows neutral | project pin only | **absent entirely** — no dimmed buttons (AC-174) | — | not rendered (AC-31) |
| **2 · a bid row selected** | that row active, others `opacity .55` | that supplier's fleet pins appear | chat only (AC-175) | — | the bid's own figures (D-A) |
| **3 · a machine selected** | unchanged | selection ring on that pin | chat + equipment (AC-176) | opens, scoped to that machine | unchanged |

Switching supplier clears the machine selection (AC-177). Exactly one machine is selected at a time.

## 4. Component anatomy — exact values

### 4.1 Bid row — `rBidsPanel().card()`

```
width 100%; flex column; gap 9px; text-align start; radius 14px
padding 12px 13px 12px 17px          ← asymmetric: room for the accent bar
border 1.5px  selected → #2563EB · cheapest → rgba(22,163,74,.25) · else #E4EDF5
background    selected → rgba(37,99,235,.08) · else #fff
shadow        selected → 0 4px 14px rgba(37,99,235,.18) · else 0 2px 6px rgba(15,34,56,.05)
non-selected rows while something IS selected → opacity .55 ; transition .15s
```

- **Selection is row state, never a "select" button:** a **4 px** accent bar on the inline-start edge,
  full height, plus a **20 px** blue circle tick at `top:10px; insetInlineStart:10px`.
- **Just-arrived pill** «وصل الآن»: `top:10px; insetInlineEnd:12px`, 8.5 px/800, white on green,
  radius 20px, padding 2px 8px.
- **Flash on reveal:** `animation: dpPing 1.2s ease-out 2` plus a blue border while flashing.
- **Avatar** 36 px circle, `verified ? green : amber`, initials 12.5 px/700.
- **Hover** sets `hoverSup` and re-renders the map — hovering a row highlights its pins.
- **Sort tabs:** exactly two — `['price','الأقل سعراً']`, `['dist','الأقرب']`. Matches D-D.

### 4.2 Machine pin — `unitIcon()`

`L.divIcon({ iconSize:[132,86], iconAnchor:[66,86] })`, column, centred, 132 px wide.

```
circle        44×44; radius 50%
  in offer    background = confirmed ? #16A34A : #D9362A ; border 3px SOLID #fff
  not offered background #fff ; border 3px DASHED <ring colour> ; content is a “+” in the ring colour
  content     ⚠ the prototype draws the taxonomy EMOJI here. DO NOT — decision 4 (§7): AC-80 wants the
              request item's taxonomy IMAGE → category image → generic icon, never a broken image.
              Built as: the icon glyph is always present and the image paints OVER it, so a 404 simply
              never paints and no broken state exists (a divIcon is an HTML string — no onError).
halo          selected → 0 0 0 4px rgba(37,99,235,.35), 0 6px 16px rgba(15,34,56,.32)
              else     → 0 5px 14px rgba(15,34,56,.3)
tick          selected only: 18px blue circle, top:-7px, insetInlineEnd:-7px, 2px white border
index badge   ⚠ DROPPED — decision 3 (§7). The prototype puts ١ ٢ ٣ on in-offer pins; §6.3.3 bans that
              invented per-unit index, and the ban applies identically here. Values kept only so the
              prototype diff reads clean: min-width 17px, h 17px, bg #0F2238, bottom/insetInlineStart -6px
readiness bar margin-top 7px; width 66px; gap 2px; one segment per required document
              segment h 4px, radius 2px; filled = band colour; empty = rgba(15,34,56,.14)
label chip    margin-top 5px; bg #fff; border 1px (dashed when not offered) ring colour; radius 8px
              padding 2px 8px; 9px/800; colour #0F2238; shadow 0 2px 8px rgba(15,34,56,.18)
              text: «يمكنك طلبها» (not offered) · «متاحة» (confirmed) · «غير مؤكّدة»  +  « · N/M مستند»
```

### 4.3 Rail — `railShell()` / `railBtn()`

```
shell   position absolute; top 31%; right 12px; column; gap 11px; z-index 25
button  52×52; radius 17px; bg #fff; no border; shadow 0 5px 16px rgba(15,34,56,.18)
        font-size 21px (the emoji); transition transform .13s; dormant → opacity .55
badge   top:-5px; insetInlineStart:-5px; min-width 19px; h 19px; padding 0 5px; radius 10px
        white text; 10px (9px when the label is “✓”); weight 700
        pulsing badge → animation dpVbadge 1.8s ease-in-out infinite
ring    inset -4px; radius 20px; border 2px rgba(37,99,235,.55); animation dpRing 2.6s ease-out infinite
dot     14px circle; green; 2.5px white border; top/insetInlineStart -4px
```

Buttons: 🏗️ «المعدّة والمستندات» and 💬 «المحادثة» for a platform bid; 🏗️ + 🧾 «عرض العرض المُقدَّم»
for off-platform. Never more.

### 4.4 Machine panel — `rDrawer()`

```
position absolute; top/bottom/right 14px; z-index 40
width    420px  →  min(760px, calc(100% - 40px))  when maximised (`drawerMax`)
bg #fff; border 1px #E4EDF5; radius 18px; overflow hidden
shadow 0 18px 48px rgba(15,34,56,.22); animation dpFade .18s ease
header   flex-shrink 0; gap 11px; padding 13px 15px; border-bottom 1px #E4EDF5; bg #F8FAFC
         icon tile 36×36; radius 11px; bg rgba(37,99,235,.08); border 1px rgba(37,99,235,.22)
body     padding 16px
```

**Body order per tab** (`pEquip()` → `eqTab`):

| tab | contents, in order |
|---|---|
| `fit` | identity header · tabs · **photos card** («صور المعدّة») · **match grid** («ملخّص المطابقة مع طلبك») · request rows |
| `docs` | identity header · tabs · `rDocPanel(equipmentDocs,'equip')` |
| `co` | identity header · tabs · `rDocPanel(companyDocs,'company')` |
| no machine at all | tabs · composition summary · `rNoMachines()` — **no header, no photos, no grid** |

**Match grid:** `display:grid; gridTemplateColumns:1fr 1fr; gap:8px`, a full-width cell via
`gridColumn:'1 / -1'`. Per cell: `border 1px`, tinted background, radius 10px, padding 9px 11px; key
line 9.5 px/600 muted; value 12.5 px/700; status glyph 14 px/700.

Status palette — four states, not two:

| state | glyph | text | bg | border |
|---|---|---|---|---|
| `ok` | ✓ | #1C3550 | rgba(22,163,74,.09) | rgba(22,163,74,.25) |
| `bad` | ⚠ | #D9362A | rgba(217,54,42,.09) | rgba(217,54,42,.22) |
| `claim` | ? | #8a4f08 | rgba(212,120,10,.10) | rgba(212,120,10,.25) |
| `na` | — | #6B8FA8 | #F8FAFC | #C8D8E8 |

`claim` = the supplier declared it but nothing evidences it. `na` = the field does not exist (the
em-dash rule).

## 5. Tokens

```
bg #F5F8FC   white #fff    surface #EFF4F9   s2 #F8FAFC   page-behind #BFD0E0
navy #1C3550 deep #0F2238  muted #6B8FA8     border #C8D8E8  blt #E4EDF5
blue  #2563EB  + Lt rgba(37,99,235,.08)  Bd rgba(37,99,235,.22)
green #16A34A  + Lt rgba(22,163,74,.09)  Bd rgba(22,163,74,.25)
red   #D9362A  + Lt rgba(217,54,42,.09)  Bd rgba(217,54,42,.22)
amber #D4780A  + Lt rgba(212,120,10,.10) Bd rgba(212,120,10,.25)
font  'IBM Plex Sans Arabic', system-ui, sans-serif
```

Keyframes, all defined in the prototype and **all disabled under `prefers-reduced-motion`**:
`dpPulse` (site-pin ping) · `dpRing` (rail attention ring) · `dpVbadge` (badge heartbeat) · `dpFade`
(panel entry) · `dpModal` · `dpToast` · `dpPing` (row flash).

## 6. Do NOT copy — the prototype contains elements the spec removed

| Prototype element | Why not |
|---|---|
| its **price bar** (`rPriceBar`) | §6.1: reworked into a "negotiation gap track", then **reverted by decision**. Re-host the shipped `DealRoom` bar. The footer *shell* (dark, full width, outside the map) is fine to reuse |
| `rDistFilter()` | the distance filter is withdrawn (D-C, §6.10) |
| `ghostIcon()` | draws the unregistered remainder on the map; §6.2 says claimed units are **never** drawn |
| `rUnitPickModal()` / `unitPick` | the retired `agreedUnitIds` picker (§7.6) |
| `pTerms()` + the `terms` drawer route | dead code — nothing in the prototype opens it, and the spec's rail has no terms button |
| `mapLegend` | already `null`; the colour key lives in the bid panel (§6.9.2) |

## 7. Conflicts — **all settled 2026-08-06**

| # | Decision |
|---|---|
| 1 | **The prototype's palette wins: green `#16A34A`, red `#D9362A`**, used by the pin, the machine chip, the panel header chip and the composition bar. §6.3.1's `#12904A`/`#C62A2A` are superseded — AC-168 requires all four surfaces to be the *same* red, so there is exactly one pair |
| 2 | **Both wordings stand:** the pin says «متاحة» / «غير مؤكّدة» / «يمكنك طلبها» (9 px inside a 132 px marker), the panel chip says «التوفّر مؤكّد» / «التوفّر غير مؤكّد». One fact, two lengths |
| 3 | **The pin's numeric index badge is dropped.** §6.3.3 banned the invented per-unit index on chips for the reason that applies here too — nothing links a bid to a numbered unit, so a renter asking "what about unit 2?" names something the supplier cannot resolve. If a per-pin identifier is wanted later, use the serial's last 4 characters |
| 4 | **The spec wins on pin content: taxonomy image, not emoji** — the request item's image, falling back to the category image, then a generic icon, never a broken image (AC-80). This is the one place the prototype is not the answer |
| 5 | **«المؤجّر»** is the word, matching the shipped app (79 uses against 21). The spec and the prototype both say «المورد» and are superseded; §6 needs a terminology sweep (T42) |
| 6 | **`contact_info` becomes renter-visible** — a one-line projection in the agents handler (`getRequestSubmissions.ts:208`). The web already renders it (`SharedBidSubmissionModal.tsx:472`), so the row simply stops showing an em-dash. **Recorded reason it was withheld:** the `rentee-negotiate-relay` design kept off-platform contact behind the platform; returning the phone number lets a renter take the deal off-platform. Accepted deliberately by the product owner |

### The original conflicts, for the record

1. **Availability hexes.** §6.3.1 mandates solid green **#12904A** and red **#C62A2A** for the header
   chip; the prototype uses **#16A34A / #D9362A** for pins and everything else. Following the prototype
   exactly means adopting its pair everywhere and treating the spec's hexes as superseded. **Recommended:
   the prototype's tokens are the single palette** — one pair of hexes, used by pin, chip, chip-dot and
   composition bar, so AC-168 ("all four surfaces are the same red") is satisfiable at all.
2. **Pin label wording** — the pin says «متاحة» / «غير مؤكّدة»; §6.3.1's chip says «التوفّر مؤكّد» /
   «التوفّر غير مؤكّد». Both can coexist (short on a pin, explicit on a chip), but it should be a choice.
3. **The pin's numeric index badge** (١ ٢ ٣) is exactly the invented per-unit index §6.3.3 banned on
   chips ("never `وحدة ١`"). On a pin it reads as a counter rather than an identity, but it is the same
   idea. **Recommended:** drop it, or replace it with the serial's last 4 characters.
4. **«المؤجّر» vs «المورد»** — unresolved (F-8b). The prototype uses «المورد»; the shipped app uses
   «المؤجّر» 79 times against 21. This decides every string in S3–S6.
