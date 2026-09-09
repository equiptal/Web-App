# UI change playbooks

The five notes the owner writes most often, and where each one is actually edited. Read by
`/web:change` before it touches anything.

This file exists because the cost of a small UI change in this repo is almost never the edit — it is
**finding the one block that owns the value**, and knowing which test pinned the old decision. Both
are written down here so they are not rediscovered per batch.

Two indexes sit beside it: `docs/ui-pins.md` (pin → surface → file) and `docs/ui-surface-map.md`
(file → its pins). A note that names a number resolves through the first; a batch about to edit a
file reads the second to see what else on that file is addressable.

---

## 1. "thinner" / "don't bold" / "too much space"

**Where it lives.** Never in the component. Geometry and weight are in the surface's stylesheet:

| Surface | Stylesheet | Pins |
| --- | --- | --- |
| bid map, fleet cards, chat drawer, price footer | `src/components/map/map-proto.css` | 45–49, 57 |
| machine detail + documents tab | `src/components/map/panel/panel-proto.css` | 52, 53 |
| request card (both surfaces draw it) | `src/components/map/request-card.css` | 49 |
| deal room | `src/components/deal-room/deal-room-proto.css` | 55, 56 |
| requests workspace, cards | `src/components/workspace/*.css`, `src/components/map/request-card.css` | 25–44 |
| anything Tailwind-styled | the component, through `src/lib/ds.ts` recipes | 1–9, 70–92 |

**How to read the note.** "Thinner" is height: a `height` / `min-height` on the bar, then its
`padding`. "Not bold" is `font-weight` on the exact element he named, not on its parent — the title
beside it usually stays heavy, and that contrast is the point.

**The trap.** A shared recipe in `src/lib/ds.ts` (`PAGE_BACK`, `btn`, `PAGE_Y`) changes EVERY page.
That is often what he wants ("one back control everywhere") but it must be said in the report.

**Tests that break.** `page-back.test.tsx` asserts the back bar's margin class; `dashboard-spacing`
and `rentee-map-surface` read geometry out of the stylesheets by selector — and `cssBlock()` finds a
rule by `indexOf(selector)`, so **a multi-selector rule must keep the asserted selector on the line
the brace sits on.**

---

## 2. "change this word" / "remove this sentence"

**Where it lives.** `src/lib/i18n/en.ts` and `src/lib/i18n/ar.ts`, **both in the same edit**. The
map panel directory is the exception and says so in its own header: it takes copy inline through
`L(en, ar)`.

**Rules, all enforced:** no em dash in copy; no trailing period in a UI string; Latin digits in both
locales (`latinDigits`); the Arabic brand is «معداتك» and the transliterated spelling is banned
repo-wide, docs included — `brand-spelling.test.ts` sweeps `src/`, `prototypes/` and `docs/`, which
is why this line does not quote the wrong form.

**The trap.** A string that reads like a duplicate usually is not: `postShare.noSuppliers` and
`noSuppliersYet` say the same fact in two places where one has room for a button and the other does
not. Check who else reads a key before rewording it — and if only one caller should change, add a
key rather than editing the shared one.

**Tests that break.** Any suite asserting the sentence. Prefer to assert the KEY or the accessible
name, so the copy can move again without touching the test.

---

## 3. "wrong colour" / "make it orange like our design system"

**Where it lives.** Tokens, always: `var(--brand)`, `var(--ok)`, `var(--danger)`, `var(--action)`,
`var(--warn)`. Defined once in `src/app/globals.css`, mirrored as literals in `src/lib/ds-colors.ts`
for the three surfaces that never see a stylesheet, and documented in `docs/design-tokens.md`.

**The trap.** A raw hex anywhere under `src/` fails `palette-drift.test.ts` (exempt: `globals.css`,
`ds-colors.ts`, the staging-only `UiPins` overlay, WhatsApp's `#25d366`, Google Play's `#ffcd00`).
Changing a token's VALUE moves every button in the product — that is a palette decision, needs the
three files above together, and is never a side effect of a UI note.

**Watch for an AC.** Some colours are pinned by an acceptance criterion (RM3-AC-33: the ask is blue
and never navy). If the owner overrules one, keep the half that still protects him, update the test
to the new ruling **in his words**, and mark it `🔴` in the change log. Do not delete the test.

---

## 4. "remove these two" / "move this control"

**Ask first: where else does this act live?** The owner removes a control when the same act is
already reachable elsewhere — the removal is the point, not a loss. Say in the report where the act
still is.

**Order.** Delete the markup, then its rules (leave a struck comment where the rules were), then the
state that fed it, then the props. A rule left behind is dead CSS nobody will dare touch later.

**The trap.** A modal or layer owned by a component that gets REPLACED cannot be opened from its
replacement. `EquipmentDetail` is a takeover of the panel that holds `EquipmentList`, which is why
the yard explainer had to move up to `BidMapWorkspace` on 2026-09-08. If two surfaces must open one
layer, the layer belongs to their common parent.

**Tests that break.** The suites that read component SOURCE for a rule's spelling
(`rentee-map-surface`, `availability-chip`, `machine-panel`). They are not obstacles — they are the
record of a decision, so they move to the new home with a note saying the rule did not change.

---

## 5. "this card should look like that one"

**Do not copy the CSS.** Share the rule: add the new mount to the existing selector list
(`.bidmap .mp .bm-eq-yard, .bidmap .bm-eq .bm-eq-yard { … }`) so one state cannot end up with two
looks. Two copies of a card's chrome is how the same fact starts being drawn two ways, which is the
mistake `map-proto.css` and `request-card.css` both carry a comment about.

**Width belongs to the HOST**, not the card: `.bidmap .bm-chat-card`, `.bidmap .bm-chat-draft`,
`.dlproto .thread .dl-rq-card`. A card that sets its own width is a second opinion about the column
it sits in.

**Container queries, not media queries**, for anything inside a panel or a drawer: the dock can be
300px wide on a 1600px screen (`@container (max-width: 430px)` on the request card).

---

## The gate, every time

```bash
npm run typecheck && npm run lint && npm test
npm run ui:pins      # regenerate the two pin tables if the registry moved
npm run ui:shots     # PNGs into .artifacts/ui/ — then READ them
```

`npm run build` only when a route, a config or a dependency changed.

## Specimens (the pictures)

`src/app/dev/preview/specimens.tsx` — one entry per surface, real component, invented data, no
session. Add one for any surface a batch changes that has none; the id is what `?s=` takes and what
`tests/e2e/ui-shots.spec.ts` walks. The page renders only on localhost and staging (the pin
overlay's own host allowlist).
