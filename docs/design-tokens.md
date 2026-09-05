> **This file is the palette, and it is the SOURCE.** Copied into the repo on 2026-09-04 at the
> owner's instruction ("use these design tokens for the web, apply them to existing, and save them
> as part of our design system"). It came from Supplier OS, where it is generated from that app's
> own `globals.css`.
>
> **How it binds this app.** Every hex below is written into `src/app/globals.css` `:root`, under
> both its OS name (`--ink`, `--text-secondary`, `--st-active`) and the name this app's 122 files
> already read (`--navy`, `--muted-dark`, `--ok`). `src/lib/ds-colors.ts` mirrors the same values as
> literals for the three surfaces that never see a stylesheet, and `tests/unit/ds-colors.test.ts`
> fails if the two ever disagree.
>
> **Changing a colour means changing it HERE first**, then in `globals.css`, then running the mirror
> test — which will tell you exactly which literal it left behind. What this file does not define —
> the brand's hover, press and tint steps — is derived from the values it does define, by a stated
> mix, and `globals.css` says so beside each one.
>
> ⚠️ **Two families in `globals.css` are deliberately NOT from this file**: the `--shop-*` storefront
> palette, matched to the storefront prototype at the owner's instruction on 2026-09-01, and
> `--gold`, which is the mark's own colour rather than a UI state.
>
> **The stylesheets read it too, since 2026-09-06.** Binding the palette in `globals.css` was only
> half the job: six prototype stylesheets — the bid map, its panel, the request cards, the deal room,
> the requests surfaces and the comparison — still carried **330 raw colours of their own**, written
> before this file existed. A different navy (`#16304f` against `#22384e`), a blue (`#2563eb`) that
> is not in this palette at all, and a bluish grey ramp where this one is neutral. That is why the app
> still did not look like the OS after the tokens landed. All 330 now read `var(--token)`;
> `tests/unit/palette-drift.test.ts` fails if a raw hex comes back.
>
> ⚠️ Two colours are exempt and stay raw: **`#25d366`**, WhatsApp's own green on the button that opens
> WhatsApp, and the Google Play mark's `#ffcd00` in the bid form. Someone else's brand is not one of
> our states. The map's **`--action` (`#1a7ec8`)** is also not from this file, and must not be folded
> into `--info`: RM3-AC-33 says the ask is blue and never navy, and this palette has no true blue.

# Supplier OS — Colors & Fonts

Source of truth: `apps/web/src/app/globals.css` (`@theme` block) and `apps/web/src/lib/fonts.ts`.

## Fonts

| Role | Font | Weights loaded | Token |
| --- | --- | --- | --- |
| English (Latin UI: titles, labels, body) | **Inter** | 400, 500 | `--font-inter` |
| Arabic (Arabic UI) | **Almarai** | 400, 700 | `--font-almarai` |
| Data codes only (IDs like REQ-00337, model numbers) | **JetBrains Mono** | 400, 500 | `--font-jetbrains-mono` |

Stacks:

```css
--font-sans:      var(--font-inter), var(--font-almarai), ui-sans-serif, system-ui, sans-serif;
--font-arabic:    var(--font-almarai), var(--font-inter), ui-sans-serif, system-ui, sans-serif;
--font-mono:      var(--font-inter), var(--font-almarai), ...;   /* resolves to TEXT faces on purpose */
--font-display:   var(--font-inter), var(--font-almarai), ...;   /* alias of the sans stack */
--font-mono-data: var(--font-jetbrains-mono), var(--font-almarai), ui-monospace, monospace; /* only .keep-mono reads it */
```

Notes:
- All three are self-hosted at build time via `next/font`, no external font requests in production.
- Almarai has no 500 weight (family is 300/400/700/800). `globals.css` maps `font-weight: 500` to 700 inside `[lang='ar']` so `font-medium` Arabic headings keep their emphasis.
- Numeric alignment comes from `tabular-nums` (Inter carries it), not from the mono face. True monospace is an explicit opt-in via `.keep-mono`.

## Core ink & brand

| Token | Hex | Use |
| --- | --- | --- |
| `--color-ink` | `#22384e` | The navy: primary ink |
| `--color-ink-deep` | `#1c2738` | Deeper navy |
| `--color-brand` | `#f97316` | The orange (fill/accent; only 2.80:1 on white, never small text) |
| `--color-brand-dark` | `#c2570f` | Orange dark: use for brand-colored TEXT (4.50:1, passes AA) |

## Reds / danger

| Token | Hex | Use |
| --- | --- | --- |
| `--color-danger` | `#c02626` | Danger text/border |
| `--color-danger-bg` | `#f7e3e3` | Danger background |
| `--color-danger-border` | `#e8c1c1` | Danger border |
| `--color-danger-wash` | `#fbeeee` | Lightest danger wash |
| `--color-led-mnt` | `#ff6b5e` | Bright red LED/pip (maintenance) |
| `--color-tick-down` | `#ff6b5e` | Ticker down |
| `--color-bad` | `#b91c1c` | Legacy alias (login screen) |

## Success / green

| Token | Hex |
| --- | --- |
| `--color-success` | `#1d9e55` |
| `--color-success-ink` | `#1d7a45` |
| `--color-success-bg` | `#e2efe7` |
| `--color-led-active` | `#38b06a` |
| `--color-tick-up` | `#38e07d` |
| `--color-ok` (legacy) | `#15803d` |

## Warn / amber

| Token | Hex | Use |
| --- | --- | --- |
| `--color-warn` | `#b98a1d` | FILL only (2.97:1, below AA for text) |
| `--color-warn-ink` | `#8a6412` | Amber that can carry TEXT |
| `--color-warn-amber` | `#e8b64c` | Bright amber |
| `--color-warn-bg` | `#f7edd8` | Background |
| `--color-warn-border` | `#e0c583` | Border |

## Info / AI / neutral

| Token | Hex | Note |
| --- | --- | --- |
| `--color-info` | `#3b556e` | Slate, deliberately not cyan; sits in the ink family |
| `--color-info-bg` | `#e7ebee` | |
| `--color-ai` | `#6d4fc4` | |
| `--color-ai-bg` | `#eee9fa` | |
| `--color-neutral` | `#8a95a0` | |
| `--color-neutral-bg` | `#eceae3` | |

## Text tiers (all clear WCAG AA 4.5:1 on every light surface)

| Token | Hex |
| --- | --- |
| `--color-text-primary` | `#22384e` |
| `--color-text-secondary` | `#444f57` |
| `--color-text-tertiary` | `#515a64` |
| `--color-text-muted` | `#59646e` |
| `--color-text-faint` | `#6f695a` |
| `--color-text-on-dark` | `#c8d4e4` |
| `--color-text-on-dark-dim` | `#8698b0` |

The band is full: a fifth grey does not fit. If another tier is needed, change the surface, not the ramp.

## Surfaces & chrome (flat neutral grey ramp)

| Token | Hex |
| --- | --- |
| `--color-desktop-base` | `#f4f4f4` |
| `--color-desktop-hi` | `#ffffff` |
| `--color-surface` | `#ffffff` |
| `--color-surface-raised` | `#ffffff` |
| `--color-surface-alt` | `#fafafa` |
| `--color-chrome` | `#f4f4f4` |
| `--color-chrome-press` | `#e8e8e8` |
| `--color-chrome-deep` | `#e0e0e0` |
| `--color-neutral-btn` | `#e0e0e0` |
| `--color-neutral-btn-hi` | `#d4d4d4` |
| `--color-map-plate` | `#dfe3e7` |

## Borders

| Token | Hex |
| --- | --- |
| `--color-border-strong` | `#c6c6c6` |
| `--color-border-mid` | `#d0d0d0` |
| `--color-border-soft` | `#dcdcdc` |
| `--color-border-hair` | `#e4e4e4` |
| `--color-border-hair2` | `#e0e0e0` |

## Machine-status tones (text/border)

| Token | Hex | State |
| --- | --- | --- |
| `--color-st-idle` | `#b98a1d` | Idle |
| `--color-st-reserved` | `#5d6b77` | Reserved |
| `--color-st-transit` | `#c2570f` | In transit |
| `--color-st-active` | `#1d7a45` | Active |
| `--color-st-mnt` | `#c02626` | Maintenance |
| `--color-st-hold` | `#8a95a0` | On hold |

## LED / pip colors (brighter than tones)

| Token | Hex |
| --- | --- |
| `--color-led-idle` | `#e8b64c` |
| `--color-led-reserved` | `#8698b0` |
| `--color-led-transit` | `#f97316` |
| `--color-led-active` | `#38b06a` |
| `--color-led-mnt` | `#ff6b5e` |
| `--color-led-hold` | `#8a95a0` |

## Dark cards (draft units / store cards)

| Token | Hex |
| --- | --- |
| `--color-dark-card` | `#1c2738` |
| `--color-dark-card-border` | `#2c3a4e` |
| `--color-dark-card-well` | `#141d2b` |
| `--color-dark-card-chip` | `#2c3a4e` |

## Terminal (Event Log window only)

| Token | Hex |
| --- | --- |
| `--color-term-bg` | `#16202c` |
| `--color-term-bar` | `#0f1722` |
| `--color-term-border` | `#2b3850` |
| `--color-term-barline` | `#223047` |
| `--color-term-text` | `#8698b0` |
| `--color-term-caret` | `#38e07d` |
| `--color-term-close` | `#4d5e75` |

## Document facsimile accents

| Token | Hex |
| --- | --- |
| `--color-doc-registration` | `#2f6b4f` |
| `--color-doc-customs` | `#2f4d8a` |
| `--color-doc-insurance` | `#4d7d74` |
| `--color-doc-inspection` | `#6a7fae` |
| `--color-doc-reference` | `#b9bdc9` |

## Legacy aliases (login screen still uses these)

| Token | Hex |
| --- | --- |
| `--color-sand` | `#e4e1d8` |
| `--color-paper` | `#faf9f6` |
| `--color-navy` | `#22384e` |
| `--color-navy-soft` | `#33506d` |
| `--color-accent` | `#f97316` |
| `--color-ok` | `#15803d` |
| `--color-bad` | `#b91c1c` |

## Rules worth remembering

- **Navy = `#22384e`** (`ink` / `navy` / `text-primary`, same hex). **Orange = `#f97316`** (`brand` / `accent`).
- Brand orange `#f97316` is a fill color only: for orange text use `--color-brand-dark` `#c2570f`.
- Same split for amber: `--color-warn` fills, `--color-warn-ink` carries text.
- Contrast pairs are enforced by `apps/web/src/app/contrast.test.ts`: adding or changing a token means re-running it.
