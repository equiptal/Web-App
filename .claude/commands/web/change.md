---
description: Apply a BATCH of UI/behaviour notes (screenshots + free text) to the renter web app — read them back as a numbered worklist, ask only the questions that change the work, edit, prove it with pictures, then report per item.
---

# /web:change — a batch of notes, applied

You are applying a batch of change notes to the **Moedatech renter web app** (Next.js 15 App Router,
TypeScript, vitest, Playwright). The owner writes in batches: several screenshots and a paragraph
mixing surfaces, wording, spacing and behaviour. This command is how that batch becomes edits without
losing an item and without a round of "which element did you mean".

**It is not for features.** A new screen or a new contract goes through `/web:spec` then
`/web:feature`. This is for the day-to-day: thinner, not bold, wrong colour, wrong word, remove that,
move that, this reads wrong, this is the wrong name.

## Step 0 — He announced a change but sent no notes? Send the template and WAIT

Standing instruction (owner, 2026-09-08): *"whenever i told u i want to make a change or fix or
something reply with the template i must follow"*, and *"make the pins at top then one template with
screenshot below"*.

So when the message is «i want to make some changes on the create request flow», «there is an issue
in the map», «i want to fix the share step» — with no notes and no screenshots attached — do NOT
explore the code, do NOT guess, and do NOT ask an open question. Reply with **the pins first, then
ONE template**, scoped to the flow he named, and stop.

### 1. The pins, at the top

The block for HIS flow only, read out of `docs/ui-pins.md` — never the whole registry. Surface
numbers with their parts on one row each, e.g. for create (15–24):

| # | What |
|---|---|
| **15** | Intake screen |
| **16** | The canvas, three columns |
| **17** · 17.1 · 17.2 · 17.3 | Machine card · head row · body grid · image well |
| … | … |

Then one line: the overlay is `?pins=1` or `Ctrl+Shift+U`, on staging and localhost only.

### 2. ONE template, with the screenshot line in it

A single block. Not three forms — one, whose optional lines are `why:` and `copy:`, and whose
screenshot row is a row like any other:

> ```
> create flow · beta                                   ← the flow, and where you were looking
>
> 15    remove the example sentence under the box
> 17.1  align the year pill with the certificate pill
> 21    «Review & send» → «Send the request»
> 19.2  hide the days-per-week stepper when he picks a single day
>       why: it prices nothing on a one-day rental        ← optional, and it goes in the change log
>       copy: EN «Days per week» → gone, AR too           ← optional, when the words must be exact
> [screenshot] the «Not confirmed yet» pill — remove it   ← paste the image, then point by its
>                                                            VISIBLE TEXT; add the pin if you have it
> ```

Under the block, three short lines and nothing more:

- **Worth saying if true:** «same in the app» (the Flutter side gets flagged, not silently fixed) ·
  «this reverses what we agreed» (the old decision is struck in place and marked 🔴) · «don't touch
  anything else» (nothing adjacent gets flagged).
- **Never needed:** the file, the CSS class, the component, how to do it, or which test breaks.
- **The environment matters**, because twice a reported regression was a stale deploy.

### 3. Say whether the flow can be photographed

One sentence: does that flow have a specimen in `src/app/dev/preview/specimens.tsx`? If not, offer
the two ways out — he starts `npm run dev:preview -- --port 3100` and the real screens get checked,
or the report names which items went unverified.

He is free to ignore the shape and write prose; the flow below reads either. The template saves the
round trip, it is not a form.

## What you are given

`$ARGUMENTS` is usually empty — the notes are in the message, with images. Read every image with the
Read tool before writing anything. If the owner pasted pin numbers (`47.3`, `48.2`), those resolve
through `docs/ui-pins.md`; if he pasted screenshots, resolve by the visible TEXT in them.

## Step 1 — Read the batch back as a worklist. Do not ask anything yet

One table, one row per item, before any edit:

| # | pin | files | his words | your reading | risk |
|---|---|---|---|---|---|
| 1 | 52.3 | `EquipmentDetail.tsx` + `panel-proto.css` | "red yard and distance like the fleets cards" | replace the chip + explainer with the fleet card's own yard control | shared rule — reaches 47.3 too |

Rules for the table:

- **Resolve every item to a pin.** `docs/ui-surface-map.md` is file → pins; `docs/ui-pins.md` is
  pin → file. A surface with no pin gets one in this batch (Step 5).
- **Quote him.** His words, not a paraphrase — the change log will need them and a paraphrase is
  where a misreading hides.
- **One line of reading.** What you will actually do. If you cannot say it in one line, the item is
  two items.
- **Name the risk**: a shared component, a global token, a rule an AC pins, a test that will break.
- **Count the items out loud** at the end ("8 items, 6 clear, 2 need an answer"). A batch of eight
  notes that comes back with seven changes is the failure this step exists to prevent.

## Step 2 — Ask once, batched, only where it changes the work

Use `AskUserQuestion`, at most four questions, only for items where two readings lead to genuinely
different work or where being wrong is expensive (an asset, a migration, a global token, an AC
reversal). Everything else: **decide, state the assumption in the table, and proceed.**

Never ask him to repeat what a screenshot already shows. Never ask which file something is in.

## Step 3 — Order the work by FILE, not by note

Group the worklist by the file each item lands in and edit each file once. Two notes about the same
stylesheet edited separately is two chances to leave the block half-changed.

Within a file: strings → model → component → stylesheet. A copy change that also moves an element is
two edits in one pass, not two passes.

## Step 4 — Apply, to this repo's rules

Read `docs/ui-change-playbooks.md` first — it names the edit sites for the recurring change types
(thinner / not bold, copy, colour, remove a control, shared component) and the tests each one breaks.

Non-negotiables, all of them already written down in `CLAUDE.md`:

- **The smallest change that solves it.** No refactors riding along.
- **Both dictionaries together** (`src/lib/i18n/en.ts` + `ar.ts`), no em dash in copy, no trailing
  period in a UI string, Latin digits in both locales.
- **Tokens only** — a raw hex fails `palette-drift.test.ts`, and moving a token itself is a
  `globals.css` + `ds-colors.ts` + `docs/design-tokens.md` decision, not a component one.
- **A withdrawn decision is struck, not deleted**: `~~the old rule~~` plus who withdrew it and when,
  in the comment where it lived. That is how the next reader knows it was considered.
- **Update what you invalidate** in the same pass: the comment above the code, the doc, the test that
  pinned the old behaviour.

## Step 5 — Pins: every new element gets one

The owner's standing rule (2026-09-08): *"make sure the pins are detailed and fined not general and
make sure all new elements created on web are added with pins"*.

So, in the same batch:

1. A new component, a new panel, a new modal, a new card → an entry in `PIN_REGISTRY`
   (`src/lib/uiPins.ts`) and `{...pin("id")}` on its root.
2. A part a note could plausibly land on — a head row, a footer, a badge, a CTA, a status line —
   gets its own second-level number. Prefer **fine** over general: `48.2` is the «Show details» link,
   not "the price footer".
3. Two levels only. Level 3 is found by walking the DOM at read time.
4. `node scripts/ui-pins-doc.mjs` regenerates `docs/ui-pins.md` and `docs/ui-surface-map.md`.
5. `tests/unit/ui-pins.test.ts` fails if a registry row names the wrong file, a number is reused, a
   part has no parent, or either table is stale. Run it.

A component whose root is a fragment cannot carry the attribute — pin a real child (that is what
`47` and `57` are), and a Leaflet `divIcon` writes `data-pin` by hand from the registry.

## Step 6 — Prove it: the gate, then the pictures

```bash
npm run typecheck && npm run lint && npm test
npm run ui:shots            # PNGs into .artifacts/ui/ — read them, then attach them to the report
```

`npm run ui:shots` drives `/dev/preview`, which renders each surface on invented data with no
session (`src/app/dev/preview/specimens.tsx`). **A surface you changed that has no specimen gets
one in this batch** — that is the only way the next change to it can be seen.

Then LOOK at the PNGs (Read them). What they catch and nothing else does: a row that wraps, a badge
that overflows, an Arabic mirror that breaks, a dark slab that lost its contrast. Say in the report
what the pictures showed, not that you ran the command.

Two things the pictures cannot prove: real content fitting real data, and anything behind auth. If
the owner is at the keyboard, ask him to run `! npm run dev` and sign in, then check the real screen
in Chrome. If he is not, say plainly which items are layout-verified and which are unverified.

`npm run build` last, and only if a route, a config or a dependency changed — it is slow on this
machine and a CSS-only batch does not need it.

## Step 7 — Report, per item, and write the change log

Report as a table mirroring Step 1: `#`, what changed, files, verdict (`done` / `skipped — his
word` / `blocked — why`), and one line of evidence (the test that pins it, the picture that shows
it). Then:

- The `CLAUDE.md` **Change log** entry — newest first, in the house format, with his quotes, the
  traps (`⚠️`) and anything reversed (`🔴`). One entry for the batch, not one per item.
- **Backend work as its own line**, if the batch touched something the web cannot fix alone.
- **Never commit.** Leave it in the working tree and say what is ready.

## The failure modes this command exists to prevent

1. **A dropped item.** Eight notes in, seven out. Step 1's count and Step 7's table are the guard.
2. **"Which element?"** A round trip that costs a day. Pins are the answer, and Step 5 keeps them
   worth quoting.
3. **"Not verified visually."** Step 6's pictures.
4. **A test that pinned the old decision, left failing or quietly weakened.** Never weaken one:
   update it to the new ruling, in the owner's words, and say so in the report.
5. **A silent widening.** A shared component or a global token touched without saying whom else it
   reaches. Name it in the risk column before, and in the report after.
