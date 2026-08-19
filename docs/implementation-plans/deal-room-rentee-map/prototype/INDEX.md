# Prototype, split for coding

`deal-room-rentee-map-v2.html` is **1080 KB**, but React and Leaflet
are bundled inline — the app's own code is only **325 KB** of it. Split here by
surface so each file reads in one pass.

**Reference, not a source to copy.** The prototype uses `React.createElement`, inline styles and
fixture data. Read it for **structure, geometry and order**, then build with this repo's conventions.
`design.md` is the distilled version; these files are the receipts behind it.

| File | KB | Contents |
|---|---|---|
| `00-tokens-and-shell.txt` | 21 | App CSS + keyframes, the RTL shell template with its `{{slots}}`, the colour tokens (C), Arabic numeral helpers and the fixture data. |
| `01-map-pins.js` | 22 | Machine pins, the site pin, the ghost marker (DO NOT BUILD — §6.2 never draws claimed units), Leaflet wiring and pin layout maths. |
| `02-bid-panel.js` | 16 | The bid list — the entry point, visible in every state — rows, sort tabs, and the colour key hosted inside the panel. |
| `03-rail.js` | 4 | Edge tool rail: shell, buttons, badges, presence rules (T33). |
| `04-machine-panel.js` | 24 | The floating machine panel: drawer chrome, sticky identity header, three tabs, composition bar, fit grid, request rows, document lists, empty state. |
| `05-chat-and-requests.js` | 17 | Chat panel, the request cards the renter composes, and the arrival bubble anchored to the chat button. |
| `06-notices.js` | 3 | Toast and the transient arrival popup. |
| `07-off-platform.js` | 29 | Off-platform submission surfaces. All of this already exists in the app — host it, do not rebuild. |
| `08-price-bar-DO-NOT-BUILD.js` | 23 | DO NOT BUILD. The prototype bar was reworked into a "negotiation gap track" then REVERTED by decision (§6.1) — re-host the shipped DealRoom bar instead. Kept only so the dark footer shell geometry is visible. Also holds the retired unit-picker modal (§7.6). |
| `09-supplier-and-misc.js` | 26 | Supplier modal, guided tour, top bar, and the selection accessors the rest reference. |
| `10-rest.js` | 130 | state, helpers, fixtures, plumbing (241 functions) |

## Functions per file, with sizes

**`00-tokens-and-shell.txt`**
- (template + tokens + fixtures)

**`01-map-pins.js`**
- unitIcon (2.2KB)
- ghostIcon (1.1KB)
- siteIcon (0.7KB)
- layoutBids (10.0KB)
- updateLeaflet (0.5KB)
- bandColor (0.1KB)
- reqEmoji (0.1KB)
- unitReadiness (0.3KB)
- initLeaflet (1.5KB)
- rMapLayer (3.3KB)
- ensureRings (1.4KB)

**`02-bid-panel.js`**
- rBidsPanel (8.2KB)
- rColourKey (2.1KB)
- sortedBids (0.1KB)
- selectSup (1.0KB)
- bandCount (0.1KB)
- rDistFilter (1.4KB)
- rItemStrip (2.4KB)

**`03-rail.js`**
- railShell (0.3KB)
- railBtn (1.2KB)
- rRail (2.1KB)

**`04-machine-panel.js`**
- rDrawer (2.4KB)
- rMachineHeader (1.5KB)
- rMachineTabs (1.1KB)
- rOfferSummary (4.0KB)
- pEquip (0.6KB)
- pEquipFit (1.5KB)
- rFitActions (1.7KB)
- rDocPanel (3.1KB)
- rNoMachines (1.1KB)
- rUnitPhotos (0.7KB)
- eqSummary (1.0KB)
- fitGateOpen (0.1KB)
- openDrawer (0.2KB)
- rUnitSummaryCard (2.6KB)
- vfEquipDocs (1.5KB)
- vfCompanyDocs (0.5KB)

**`05-chat-and-requests.js`**
- pChat (5.7KB)
- rChatBubble (2.7KB)
- bubbleArrival (0.1KB)
- pendingArrivals (0.1KB)
- openArrival (0.2KB)
- rRequestCard (3.1KB)
- chatMsg (3.5KB)
- renderVals (1.3KB)

**`06-notices.js`**
- rToast (0.4KB)
- rNotif (2.0KB)

**`07-off-platform.js`**
- pOffEquip (5.8KB)
- pSubmission (5.5KB)
- rOffPriceBar (4.2KB)
- rSubmissionModal (10.8KB)
- isOff (0.0KB)
- subQuality (1.9KB)

**`08-price-bar-DO-NOT-BUILD.js`**
- rPriceBar (7.0KB)
- rQuoteModal (4.1KB)
- rUnitPickModal (3.6KB)
- rAgreeModal (0.1KB)
- rBidsBar (2.5KB)
- pTerms (2.1KB)
- pTermNeg (2.9KB)

**`09-supplier-and-misc.js`**
- rSupplierModal (0.1KB)
- rSupplierViewModal (10.1KB)
- rTour (2.2KB)
- rRequest (1.5KB)
- phaseChip (0.6KB)
- curSup (0.1KB)
- curUnit (0.3KB)
- curUnitRec (0.1KB)
- constructor (1.3KB)
- derivedState (1.2KB)
- pSupplier (2.2KB)
- supRoundIcon (3.6KB)
- simulateResponse (1.7KB)

## Do not build, from these files

- `08-price-bar-DO-NOT-BUILD.js` — reverted by decision (§6.1); re-host the shipped `DealRoom` bar.
- `ghostIcon` in `01-map-pins.js` — §6.2 never draws claimed units.
- `rDistFilter` in `02-bid-panel.js` — the distance filter is withdrawn (D-C).
- `rUnitPickModal` in the price-bar file — the retired `agreedUnitIds` picker (§7.6).
- `pTerms` / the `terms` drawer route — dead code; nothing opens it.
