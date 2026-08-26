# The design system

Four files hold it, and they are the only four:

| | |
|---|---|
| `src/app/globals.css` | every **value** a screen may use |
| `src/lib/ds.ts` | every **combination** of those values |
| `src/lib/ds-colors.ts` | the same palette as **literals**, for the surfaces with no stylesheet |
| `eslint.config.mjs` | what happens when a screen writes its own |

Nothing else decides what the app looks like. If you need something these do not
have, change these — do not write the value where you need it.

### The three surfaces that never see `globals.css`

Most of the app reads colour through `var(--navy)`. Three things it produces do
not, because nothing gives them a `:root`:

- **the OG image** (`app/bid/[token]/og/route.tsx`) — Satori rasterises a tree of
  inline styles with no document and no cascade
- **the clipboard card** (`bidCardHtml.ts`) — pasted into Gmail or Outlook, which
  supply their own document and none of ours
- **the quotation** (`quotation/render.ts`) — a standalone file that is printed or
  saved, and the one document a renter keeps

The first two take literals from `COLORS`. The third builds its own stylesheet,
so it prepends `DS_ROOT_CSS` and goes on writing `var(--navy)` like everywhere
else. `ds-colors.ts` duplicates `globals.css` on purpose, and
`tests/unit/ds-colors.test.ts` parses that file and fails if either drifts.

---

## Why it exists

The app had a token file and 122 files ignoring it. Counted on 2026-08-26:

- **171** distinct hex colours, in 888 places, against 10 defined tokens
- **20** font sizes, including 13.5px, 12.5px, 11.5px and 10.5px — sizes no
  reader can tell apart, but which guarantee two screens never quite match
- **10** arbitrary radii plus 5 named ones
- **~30** shadows, every one of them unique
- **456** hand-rolled `<button>` elements, and a `Card` component with **zero**
  call sites
- **6** competing treatments for a selected chip, and **30** for a hover

`PageSection.tsx` already said this out loud, in a comment above the code:

> Two pages agreeing by coincidence is not a theme — it is two pages that will
> disagree at the next edit.

The scale below was taken from the app itself: the sizes and colours it already
used most, named rather than reinvented. Almost nothing moved. What did is at
the end, under [What changed](#what-changed).

---

## Colour

### Navy — the neutral ramp

Twelve steps, dark to light. Eighty-seven distinct blues used to do this work.

| Token | Value | For |
|---|---|---|
| `navy-deep` | `#16263f` | dark headers, overlay grounds |
| `navy` | `#1c3550` | foreground text, navy blocks |
| `navy-mid` | `#2a4f72` | the navy gradient's partner |
| `muted-dark` | `#5a6b82` | secondary text that still carries weight |
| `muted` | `#6b8fa8` | secondary text |
| `muted-light` | `#9aa7b8` | tertiary text, placeholders, disabled |
| `border-strong` | `#c3d2e0` | a divider that has to be seen |
| `border` | `#d4e0ec` | the default border |
| `surface3` | `#e4edf5` | pressed, selected |
| `surface2` | `#eff4f9` | inset panels, tinted fills, hover |
| `background` | `#f5f8fc` | the page ground |
| `surface` | `#ffffff` | cards, floating layers |

### Brand

`#f79009`, checked against the mobile app's `action` token in
`apps/mobile/lib/core/theme/app_colors.dart`. The mobile standards document at
`agent-os/standards/mobile/design-system.md:24` still names `#E8650A`; neither
product's code agrees with it, so the document is the thing that is wrong.

| Token | Value | For |
|---|---|---|
| `brand-deep` | `#b45309` | brand text on a light ground |
| `brand` | `#f79009` | the primary CTA |
| `brand-hover` | `#e58108` | |
| `brand-press` | `#cc7207` | |
| `brand-light` | `#fbbf6b` | accents, dots |
| `brand-pale` | `#fde8cc` | fills, progress tracks |
| `brand-soft` | `#fff4e5` | tinted backgrounds, selected chips |

`gold` `#b8860b` is the mark's own colour. It is not a UI state and does not
belong on a control.

### Status

Three tiers each. **base** is the colour, **soft** is a background you may lay it
on, and **deep** is the text colour that stays readable on that background. The
base colour alone is not readable at 11px on its own tint — that is what `deep`
is for.

| | base | soft | deep |
|---|---|---|---|
| ok | `#1daf58` | `#e7f7ee` | `#15803d` |
| warn | `#d4780a` | `#fff3e0` | `#8a4f08` |
| danger | `#d9362a` | `#fcebea` | `#b03636` |
| info | `#1a7ec8` | `#e6f2fb` | `#0e4f7e` |

These are the app's own colours and always have been. ~~Warning was moved to a
coral and danger deepened to keep clear of it.~~ **Withdrawn the same day**
(owner, 2026-08-26): he did not like the coral or the grey-red tint under it.

The objection those changes answered is still true, and is worth keeping written
down rather than losing with them: `--warn` `#d4780a` is an orange one shade off
`--brand` `#f79009`, so a caution and a button meant to be pressed are told apart
by darkness alone. The clearest case is the "you wrote" block in
`create/Canvas.tsx`, which uses one orange for its warning label and for the link
inside it, thirteen pixels apart.

If it is ever worth solving again, the answer is **not** a redder warning. Either
stop `--warn` being an orange at all, or leave the hue to the CTA and let the
icon and the wording carry the caution.

### What is not a token

White and black are exempt: a grid line at 4% white over a navy block, or a mask
gradient in black, is not a palette colour, and a token for it would only ever
mean "white" or "black".

Five colours are kept raw on purpose, because they belong to someone else:
WhatsApp's green on the "message on WhatsApp" control, Google Play's yellow
inside its own four-colour glyph, the mobile app's cream, and two one-offs.

---

## Type

Six sizes. There is no seventh for UI.

| Token | Size | For |
|---|---|---|
| `text-label` | 11px | UPPERCASE SECTION LABEL |
| `text-meta` | 12.5px | the muted sentence under a value |
| `text-body` | 13px | the answer, list rows, buttons — **the default** |
| `text-subhead` | 15px | card headings |
| `text-title` | 17px | a page or masthead name |
| `text-display` | 22px | a number worth shouting |

`text-hero` (32px) exists for display copy — the auth headline and the home
banner, and nothing else. It is a seventh step in a six-step scale, which is a
debt, not a feature; the alternative was leaving those two headlines hardcoded
at 36px and 29px, which is the same debt with no name on it.

Tailwind's own sizes (`text-xs` … `text-9xl`) are **cleared from the theme**, so
writing one produces no CSS at all rather than a value nobody chose.

### Weight

Three: `font-normal` 400, `font-semibold` 600, `font-extrabold` 800.
`font-medium`, `font-bold`, `font-black`, `font-thin` and `font-light` are
cleared. Five weights is not a hierarchy; it is one guess repeated across files.

---

## Radius

Four. Tailwind's `rounded-xl`, `rounded-2xl` and up are cleared.

| Token | Size | For |
|---|---|---|
| `rounded-sm` | 8px | chips, tags, tight controls |
| `rounded-md` | 10px | inputs, buttons, list rows — **the default** |
| `rounded-lg` | 14px | cards, panels, sheets |
| `rounded-full` | — | pills, avatars, dots |

---

## Spacing

The 4px grid, which is Tailwind's default and the mobile app's: `p-1` is 4px,
`gap-2` is 8px, `px-3` is 12px. Nine steps are in use — 4, 8, 12, 16, 20, 24,
32, 40, 48. Off-grid values (`gap-1.5`, `mt-[11px]`, `py-[10px]`) are not.

---

## Controls

Three heights, as classes, so a control's height and its horizontal padding move
together and no screen can set one without the other.

| Class | Height | For |
|---|---|---|
| `control-sm` | 30px | chips, icon buttons, table controls |
| `control-md` | 34px | inputs, buttons, selects — **the default**, and the top bar's |
| `control-lg` | 44px | primary CTA, mobile list rows — the touch minimum |

Add `control-icon` to square one off for a lone glyph.

---

## Shadows

**There are none.** The whole `shadow-*` namespace is cleared from the theme, so
`shadow-sm` and its relatives resolve to nothing.

Separation is carried three other ways:

- a **card** is its border and its fill; one that needs more weight takes
  `border-border-strong`, which darkens the edge rather than lifting the box
- a **floating layer** — modal, sheet, dropdown — has a 1px border, and the page
  behind it dims under `SCRIM`
- a **tooltip** inverts instead: navy ground, white text, no border

A ring is not a shadow. `0 0 0 3px <colour>` written as a `box-shadow` is an
outline that happened to be drawn with the wrong tool; those are `outline` now,
which looks the same and costs no layout.

The one shadow with a case for itself was the map markers' `drop-shadow` — a
marker on a map has terrain under it, and the shadow is what said so. It went
with the rest; `MapCanvas.tsx` carries the two lines to put it back if the
machines stop reading against a busy map.

### Focus

A solid outline, applied once in `globals.css` to everything focusable:

```css
:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
```

Not a shadow, and not optional — a keyboard user has no other way to know where
they are. Because a ring means focus and only focus, an input's error and agent
states sit on its **border** instead, so nobody is left guessing which of two
rings they are looking at.

---

## States

### Hover and press

Colours, never filters. `brightness()` was in use in 35 places and does nothing
at all to a white or transparent element, which is what most of the app's
buttons are. Nothing lifts, and nothing casts a shadow.

| | hover | press |
|---|---|---|
| ghost, secondary | `bg-surface2` | `bg-surface3` |
| tinted | `bg-surface3` | `bg-border` |
| primary | `brand-hover` | `brand-press` |
| danger | `danger-hover` | `danger-press` |

### Disabled

Its own colours, not a faded copy: `bg-disabled-bg`, `text-disabled-fg`,
`border-disabled-border`. `opacity-.5` over an orange fill produced a muddy tint
nobody chose and landed near 2.1:1 against white — under the 3:1 floor WCAG
1.4.11 sets for a control.

### Selected

Two rules, because the two shapes genuinely read differently. There were six.

**A tab strip or segmented control has a track.** The chosen item is a white
panel lifted out of a tinted groove, and the groove does the separating — no
shadow needed. Use `TRACK` and `SEGMENT.on` / `SEGMENT.off`.

**A chip, toggle or selectable card has no track**, so it marks itself with a
brand tint: `bg-brand-soft`, `border-brand`, `text-brand-deep`. Use
`CHIP.on` / `CHIP.off`, or `CARD_SELECTABLE` at card scale.

---

## Buttons

Six variants, three heights. `btn(variant, size, opts)` returns the classes;
`<Button>` in `components/ui.tsx` wraps it.

| Variant | |
|---|---|
| `primary` | the one orange thing on a screen. Two visible at once means one is wrong |
| `secondary` | the bordered alternative beside it |
| `tinted` | filled but quieter |
| `ghost` | a bare icon, a toolbar action |
| `danger` | a destructive confirm |
| `link` | a word in a sentence — no control height, no padding |

`opts`: `icon` squares it for a lone glyph, `full` stretches it to its row,
`pill` rounds it completely for a CTA that floats free of a form.

```tsx
<Button variant="primary" size="lg" full>Send request</Button>

// Or, where the element cannot be the component:
<a href={url} className={btn("secondary", "sm")}>Open</a>
```

**89 of the app's 449 buttons are on this.** The rest are honest exceptions and
are documented as such in the commit: 175 ghosts and links whose geometry is
load-bearing, 127 with a computed className, 45 that are cards or rows rather
than buttons, and 5 with no chassis at all. Their colours, sizes and radii are
already on the system; what remains is composition, and that needs eyes.

---

## Placement

Where a thing sits is as much a rule as what colour it is. These live in `ds.ts`
with everything else, because a gutter declared inside `AppShell` was a gutter no
other file could find.

### Page gutters

Two widths, and they are roles rather than accidents.

| | |
|---|---|
| `PAGE_X_READING` | `px-6 sm:px-12 lg:px-20 xl:px-28` — a form, an account page, the deal room |
| `PAGE_X_WORKING` | `px-4 sm:px-6 lg:px-8 xl:px-10` — the map, the requests workspace, compare |
| `PAGE_X_BLEED` | `px-4 sm:px-6` — a band inside a full-bleed surface |
| `PAGE_MX_BLEED` | `mx-4 sm:mx-6` — the same step as a margin |
| `PAGE_Y` | `py-6 sm:py-7` — one vertical rule for all of them |

A **reading** page is a column of text and wants space around it. A **working**
surface is trying to fit things on screen and wants that space back. `AppShell`
picks between them from the `wide` prop; a page never sets its own.

### The back control

**It is on the page, under the bar — never in it.** It used to be a white circle
inside the navy header, which put "leave this page" in the one row that is
identical on every route, beside the logo and the tabs. Those say what the app
is; back says something about this page alone.

A page registers a handler with `usePageBack(fn)` and places nothing. `AppShell`
draws the control as the first thing inside `<main>`, so every screen that has
one has it in the same spot, at the same size, with the same 16px under it.

```tsx
usePageBack(() => router.push("/inbox"));
```

It is a `btn("secondary", "md", { icon: true, pill: true })` — a 34px bordered
circle on the content's own leading edge, which mirrors in Arabic like everything
else.

### Where an action sits

**At the foot of the thing it acts on.** A card's actions go in that card's
footer, behind a `border-t`; a dialog's go in the dialog's. The action and the
fields it submits stay in one box, so a long form cannot separate them.

**The primary action is last, on the trailing edge.** `justify-end` rather than a
margin, so Arabic mirrors it without a second rule.

```
English (LTR)              العربية (RTL)
   [ Cancel ]  [ Send ]    [ إرسال ]  [ إلغاء ]
```

| Recipe | |
|---|---|
| `ACTIONS` | `flex flex-wrap items-center justify-end gap-2.5` — a bare row |
| `CARD_FOOTER` | the same row with `border-t border-border px-5 py-3.5` |
| `ACTIONS_SPLIT` | `justify-between`, for when one action destroys something |

A destructive action goes to the **opposite** edge, so Delete cannot be reached
for while aiming at Save:

```
[ Delete ]              [ Cancel ]  [ Save ]
```

### Spacing between things

`SECTION_GAP` (`space-y-4`) between a page's stacked sections. Card padding is
`PAD.sm` / `PAD.md` / `PAD.lg` — 12, 16, 20. Everything else is the 4px grid.

---

## What to reach for

Everything below is exported from `@/lib/ds`.

| Need | Use |
|---|---|
| a button | `btn()` or `<Button>` |
| a card | `CARD` + `PAD.md`, or `<Card>` |
| a card with more weight | `CARD_RAISED` |
| a panel set into a card | `PANEL` |
| the navy block a page opens with | `MASTHEAD` |
| a modal or sheet | `OVERLAY` + `SCRIM` |
| a dropdown | `POPOVER` |
| a tooltip | `TOOLTIP` |
| a text role | `TYPE.label` … `TYPE.display` |
| an input | `INPUT`, `TEXTAREA`, `INPUT_ERROR`, `INPUT_AGENT` |
| a tab strip | `TRACK` + `SEGMENT` |
| a chip | `CHIP_BOX` + `CHIP` |
| a selectable card | `CARD_SELECTABLE` |
| a status pill | `BADGE_BASE` + `BADGE_TONE[tone]`, or `<Badge>` |
| a status panel | `NOTICE_BASE` + `NOTICE_TONE[tone]`, or `<Notice>` |
| a tappable list row | `ROW` |
| a divider | `DIVIDER` |
| a row of buttons | `ACTIONS`, or `ACTIONS_SPLIT` with a destructive one |
| a card's action row | `CARD_FOOTER` |
| a page gutter | `PAGE_X_READING` / `PAGE_X_WORKING` / `PAGE_X_BLEED` |
| a back control | `usePageBack(fn)` — the shell places it |
| space between sections | `SECTION_GAP` |
| joining classes | `cx()` |

---

## What the linter blocks

Each rule names its replacement, because a rule that only says no gets switched
off.

| Blocked | Instead |
|---|---|
| a raw hex colour | a token, or `var(--token)` in a style |
| `rgba(…)` | `color-mix(in srgb, var(--brand) 12%, transparent)`, or `border-warn/40` |
| `text-[14px]` | the six-step scale |
| `rounded-[12px]` | the four-step scale |
| any `shadow-*`, any `boxShadow` | a border, a surface step, or `SCRIM` |
| `hover:brightness-*`, `hover:opacity-*`, `hover:-translate-*` | a hover colour |
| `disabled:opacity-*` | the disabled colours |
| `font-medium`, `font-bold`, `font-black` | the three weights |

---

## What changed

Nothing moved that did not have to. What did:

- **No colour changed value.** Warning was moved to a coral and danger deepened,
  and both were withdrawn the same day (owner, 2026-08-26). Every token holds the
  value the app already used — the sweep named them, it did not repaint them.
- **Every shadow disappeared.** 86 in the components, 88 in the stylesheets.
  Cards, modals and dropdowns now separate by border, surface step and scrim.
- **Half-pixel type snapped.** 13.5px and 14px to 13, 11.5px to 11, 10.5px to 11.
  12.5px stayed, because 114 uses of it carry the muted-meta role.
- **`font-bold` split by role.** On a title-sized element it became extrabold; on
  everything else, semibold. 303 places.
- **43 classes reached for `var(--action)` and `var(--surface1)`** — the *mobile*
  app's token names, defined nowhere in the web app. Every one of them was
  resolving to nothing. Fixed, not tokenised.
- **34 custom properties referenced themselves** after the sweep tokenised their
  hex (`--navy: var(--navy)`), which makes a property invalid at computed-value
  time and takes everything reading it down with it. Deleted, so the scope
  inherits `:root` — which was always the intent.

## Two things worth knowing before you touch the sweep again

Both of these cost real time, and both are the kind of thing that looks fine
until something renders.

**Placing a colour by lightness is not placing it by colour.** The first pass put
every unlisted hex on its ramp by an index into that ramp's steps. It sent
`#c8d8e8` — a border — to `surface2`, which is a fill, and `#e8890c`, the brand
orange, to `brand-light`. Nearest colour *within the chosen ramp* gets all of
them right. The ramp still has to be chosen by hue rather than by distance: an
orange caution and an orange CTA are near neighbours in RGB and opposite in
meaning, so distance alone would fold `--warn` into the brand ramp.

**A lone `\r` is a line terminator in a JavaScript regex.** `^` in a multiline
pattern matches *inside* a CRLF pair, so a rule meant to drop blank lines before
a `}` dropped the `\n` and joined 286 pairs of code lines. If a codemod here
touches whole lines, match `\r?\n` explicitly and never anchor on `^`.

---

## Adding to it

1. Add the **value** to `globals.css`, in the ramp it belongs to, with a comment
   saying what it is for.
2. Add the **combination** to `ds.ts` if more than one screen will want it.
3. Use it.

If step 1 feels like it needs a thirteenth blue, it usually needs one of the
twelve instead.
