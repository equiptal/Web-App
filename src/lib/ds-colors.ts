/**
 * The palette as literal values, for the places that have no stylesheet.
 *
 * Most of the app reads colour through `var(--navy)` and friends, which `globals.css` defines on
 * `:root`. Three things this app produces never see that file:
 *
 *   - **the OG image** (`app/bid/[token]/og/route.tsx`) — Satori rasterises a tree of inline styles
 *     with no document and no cascade, so a custom property resolves to nothing
 *   - **the clipboard card** (`bidCardHtml.ts`) — pasted into Gmail, Outlook or Word, which supply
 *     their own document and none of ours
 *   - **the quotation** (`quotation/render.ts`) — a standalone HTML file that is printed or saved
 *
 * The first two need literals. The third builds its own document, so it takes `DS_ROOT_CSS` and
 * keeps writing `var(--navy)` like every other surface.
 *
 * ── This file and globals.css must agree ────────────────────────────────────────────────────────
 * They hold the same numbers twice, which is a thing worth being nervous about. `ds-colors.test.ts`
 * parses `globals.css` and fails if any value here has drifted from it, so the duplication cannot
 * quietly rot — change one and the test names the other.
 */

export const COLORS = {
  // Navy / neutral ramp
  navyDeep: "#161c2c",
  navy: "#1c2738",
  navyMid: "#2a3a50",
  mutedDark: "#5a6b82",
  muted: "#6b8fa8",
  mutedLight: "#9aa7b8",
  borderStrong: "#c3d2e0",
  border: "#d4e0ec",
  surface3: "#e4edf5",
  surface2: "#eff4f9",
  background: "#f5f8fc",
  surface: "#ffffff",
  /** The default text colour. Deliberately the same value as `navy`, and named separately because
      a page sets its text colour without deciding it is drawing a navy block. */
  foreground: "#1c2738",

  // Brand
  brandDeep: "#b45309",
  brand: "#f79009",
  brandHover: "#e58108",
  brandPress: "#cc7207",
  brandLight: "#fbbf6b",
  brandPale: "#fde8cc",
  brandSoft: "#fff4e5",
  brandFg: "#ffffff",
  gold: "#b8860b",

  // Status
  ok: "#1daf58",
  okSoft: "#e7f7ee",
  okDeep: "#15803d",
  warn: "#d4780a",
  warnSoft: "#fff3e0",
  warnDeep: "#8a4f08",
  danger: "#d9362a",
  dangerSoft: "#fcebea",
  dangerDeep: "#b03636",
  dangerHover: "#c22e23",
  dangerPress: "#a8281e",
  info: "#1a7ec8",
  infoSoft: "#e6f2fb",
  infoDeep: "#0e4f7e",

  // Storefront — the supplier-facing three, matched to the approved prototype. A second neutral
  // family (warm grey on white) rather than a re-tint of the ramp above; see the note in
  // `globals.css`. Carried here for the same reason as everything else in this file: the three
  // surfaces with no stylesheet cannot read a `var()`.
  shopInk: "#1f2d3a",
  shopInk2: "#3a4552",
  shopInk3: "#5b6672",
  shopInk4: "#8a929b",
  shopLine: "#e3e6e9",
  shopLineSoft: "#eceef0",
  shopFill: "#f2f4f5",
  shopOk: "#2f9e5c",
  shopOkSoft: "#e9f7ee",
  shopAmber: "#eda153",
  shopAmberDeep: "#b5761a",
  shopAmberSoft: "#fdf1e0",
} as const;

/**
 * The radius scale, as literals, for the same three surfaces.
 *
 * A clipboard card pasted into Gmail carries no stylesheet, so `border-radius: var(--radius-md)`
 * there resolves to nothing and the card renders with square corners. Same reasoning as the colours
 * above; `ds-colors.test.ts` checks these against globals.css too, so the two cannot drift.
 */
export const RADII = {
  sm: "2px",
  md: "4px",
  lg: "6px",
} as const;

/** The CSS custom-property name each key maps to, so the test can check them pair by pair. */
export const CSS_VAR_NAME: Record<keyof typeof COLORS, string> = {
  navyDeep: "--navy-deep",
  navy: "--navy",
  navyMid: "--navy-mid",
  mutedDark: "--muted-dark",
  muted: "--muted",
  mutedLight: "--muted-light",
  borderStrong: "--border-strong",
  border: "--border",
  surface3: "--surface3",
  surface2: "--surface2",
  background: "--background",
  surface: "--surface",
  foreground: "--foreground",
  brandDeep: "--brand-deep",
  brand: "--brand",
  brandHover: "--brand-hover",
  brandPress: "--brand-press",
  brandLight: "--brand-light",
  brandPale: "--brand-pale",
  brandSoft: "--brand-soft",
  brandFg: "--brand-fg",
  gold: "--gold",
  ok: "--ok",
  okSoft: "--ok-soft",
  okDeep: "--ok-deep",
  warn: "--warn",
  warnSoft: "--warn-soft",
  warnDeep: "--warn-deep",
  danger: "--danger",
  dangerSoft: "--danger-soft",
  dangerDeep: "--danger-deep",
  dangerHover: "--danger-hover",
  dangerPress: "--danger-press",
  info: "--info",
  infoSoft: "--info-soft",
  infoDeep: "--info-deep",
  shopInk: "--shop-ink",
  shopInk2: "--shop-ink-2",
  shopInk3: "--shop-ink-3",
  shopInk4: "--shop-ink-4",
  shopLine: "--shop-line",
  shopLineSoft: "--shop-line-soft",
  shopFill: "--shop-fill",
  shopOk: "--shop-ok",
  shopOkSoft: "--shop-ok-soft",
  shopAmber: "--shop-amber",
  shopAmberDeep: "--shop-amber-deep",
  shopAmberSoft: "--shop-amber-soft",
};

/**
 * A `:root` block carrying the whole palette, for a standalone document that builds its own
 * stylesheet. Prepend it and every `var(--token)` in that document resolves the way it does in the
 * app, rather than to nothing at all.
 */
export const DS_ROOT_CSS = `:root{${(Object.keys(COLORS) as (keyof typeof COLORS)[])
  .map((k) => `${CSS_VAR_NAME[k]}:${COLORS[k]};`)
  .join("")}}`;
