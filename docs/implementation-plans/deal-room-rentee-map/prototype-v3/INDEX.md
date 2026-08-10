# The v3 prototype, decoded

`design-v3.md` is an **extract**. This directory is the **source it was extracted from**, so a reader
can check a value instead of trusting a table.

That distinction has cost real work. `design-v3.md` has been corrected four times against this file —
the palette had two tokens copied down wrong and *"everything on the panel inherited the error"* (§1);
§7 listed eleven keyframes when there are sixteen; §7a was missing entirely until 2026-08-09 and the
chat dock *"was drawn quite differently in the app as a result"*; and §9 carried a row marked
**✗ WRONG** that licensed a mis-built marker for weeks. Every one of those was a gap between the
document and the file. Keeping only the document is what let them open.

## The files

| File | What |
|---|---|
| `app-decoded.js` | The app source — **423,886 chars / 4,482 lines**. Line numbers here are the ones `design-v3.md` cites. |
| `app.css` | The inner document's last `<style>`: all sixteen `@keyframes` plus the interaction language. |
| `function-index.tsv` | `line⇥name` for all **352** methods, so a surface can be found without scanning. |
| `decode.js` | Regenerates both from the original. |

## The original

`Deal Room Map.html`, **5,086,460 bytes**, is **not** in the repo — it is 5 MB of mostly inlined React
and Leaflet, and only ~424 KB of it is the app. It lives outside the repo; `decode.js` names the path
it was read from. Verify any copy by its byte count before trusting it.

## Why decoding it is not obvious

The file **nests twice**:

```
outer .html  →  <script> "…the whole inner document, escaped…" </script>
inner doc    →  <script type="text/x-dc"> …the app source… </script>  +  a final <style>
```

`lastIndexOf("<script")` on the outer file lands on the **escaped inner tag**, not the outer one —
that is char 4,633,423, the offset `design-v3.md` records, and decoding from there yields a truncated
418,299 chars. `decode.js` finds the outer script by the shape of its body instead: the tag whose
first non-space content character is a real `"`.

Decode with `JSON.parse` on the literal, not a chain of regex unescapes — the looser approach is what
produced the wrong 424,043 / 4,488 figure an earlier pass recorded.

## Checking a decode

All five anchors must land, or the line numbers in `design-v3.md` do not apply:

| Function | Line |
|---|---|
| `siteIcon` | 262 |
| `machineArt` | 448 |
| `unitIcon` | 454 |
| `eqCard` | 3959 |
| `rEquipGroups` | 4463 |

## What the extract does not cover

`design-v3.md` records values for the map canvas, the equipment card, the list, the marker, the
project pin, the route and chip, the animations, the chat dock, the basemap, the count pills and the
list-foot ask. The panel's interior is **not** in it. These are built and were never value-checked
against the file until 2026-08-10:

| Prototype | Line | Ours | State |
|---|---|---|---|
| `rVerifiedChip` | 4045 | `.bm-verified` · `.mp-vchip` | **done** — was two geometries for one chip |
| `coDocsBody` | 4062 | `DocRowList.tsx` | **done, rows only** — alphas already exact |
| `rCompanyPanel` | 4127 | `CompanyPanel.tsx` | **done** — container + 64px header exact |
| `pChat` · `rChatPop` | 3174 · 3881 | `ChatDock.tsx` | **done** — stream, bubbles, wordings, and §7a's notice exact (kind pill · 12px/900 name · 2-line clamp · ltr ref line). **Behaviour is 004a §2.1, not a port**: refresh-timed with no socket (RM3-AC-64), and the notice hides while the panel is open |
| `rDocPanel` | 2910 | `EquipmentDocuments.tsx` | **done, rows** — `.mp-row` exact (gap 10 · 7px 10px · r12 · mb 6). Thumbnail is a **documented departure**: 46×40 landscape, not its 34×34 square, because a square crops a certificate until it stops identifying the file (2026-08-09) |
| `rEquipDetail` | 4190 | `EquipmentDetail.tsx` | section inset done; body outstanding |
| `eqDocsTab` | 4334 | `EquipmentDocuments.tsx` | outstanding |
| `rDocSelectBar` | 2812 | the batch footer | outstanding |
| `rRequestCard` · `rReplyCard` | — | `ChatCard.tsx` | outstanding — the request loop's cards |
| `rChatTabs` · `rChatPop` | — | `ChatDock.tsx` | outstanding, incl. §6.8.5: a message arriving with a panel open gives the POPUP, not the bubble |
| `eqReadinessRow` | 431 | — | outstanding |
| `rUnitPhotos` | 2398 | — | **not a port.** Its four 74×58 slots were replaced by a 196 px viewer (spec 004 §6, "A VIEWER, not a hero", 2026-08-09). Do not restore them. |

**Ask "port or redesign?" before comparing any value.** `EquipmentDetail` is the worked example: it is
a spec-004 design (viewer · two tabs · a six-cell match grid the prototype has **none** of · 76 px
footer) answering *"does this machine fit my request"* where the prototype answers *"what is this
machine"*. Making it match the prototype would DELETE the match grid.

The split that survives that question: **structure and content follow the spec; spacing, radii, sizes,
colours, durations and easing follow the prototype** (owner, 2026-08-10). A redesigned surface still
owes the prototype its visual values — which is exactly how `pChat` reached us with no stream tint,
`10px 12px` padding and no gap.

**Where the spec overrides the file, the spec wins.** Two are settled and must not be "fixed" back:
the absent chip for an unverified firm (RM3-AC-02), and `#16A34A`/`#D9362A` for the prototype's
`#12904A`/`#C62A2A` (§7 decision 1 / AC-19 / AC-168). `design-v3.md` §9 is the list.
