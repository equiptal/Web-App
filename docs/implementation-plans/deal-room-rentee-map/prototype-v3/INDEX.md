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

| Prototype | Line | Ours |
|---|---|---|
| `rVerifiedChip` | 4045 | `.bm-verified` · `.mp-vchip` — **audited** |
| `coDocsBody` | 4062 | `DocRowList.tsx` — **audited** (rows only) |
| `rCompanyPanel` | 4127 | `CompanyPanel.tsx` — **audited** |
| `rEquipDetail` | 4190 | `EquipmentDetail.tsx` — section inset audited; body outstanding |
| `rDocPanel` | 2910 | `EquipmentDocuments.tsx` — outstanding |
| `eqDocsTab` | 4334 | `EquipmentDocuments.tsx` — outstanding |
| `rDocSelectBar` | 2812 | the batch footer — outstanding |
| `pChat` | 3174 | `ChatDock.tsx` — outstanding |
| `rUnitPhotos` | 2398 | the detail's photo strip — outstanding |
| `eqReadinessRow` | 431 | — outstanding |

**Where the spec overrides the file, the spec wins.** Two are settled and must not be "fixed" back:
the absent chip for an unverified firm (RM3-AC-02), and `#16A34A`/`#D9362A` for the prototype's
`#12904A`/`#C62A2A` (§7 decision 1 / AC-19 / AC-168). `design-v3.md` §9 is the list.
