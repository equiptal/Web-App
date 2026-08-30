/**
 * The design system's class recipes.
 *
 * `globals.css` holds the values; this file holds the combinations. A button is not "orange
 * background, white text, 34 pixels tall" written out on each screen — it is `btn("primary")`, once,
 * so that changing what a primary button looks like is one edit rather than thirty-eight.
 *
 * Everything here is a plain string or a function returning one, with no React in it, so a server
 * component, a primitive in `components/ui.tsx` and a one-off element in a feature file can all
 * reach for the same recipe. `DESIGN.md` explains when to use which.
 *
 * The rule this file exists to enforce: no screen writes a colour, a size, a radius or a state
 * treatment inline. If something you need is missing, add it here.
 */

/* ══════════════════════════════════════ Buttons ══════════════════════════════════════════════
   Six variants, because the app was already using six shapes — a solid brand CTA, a bordered
   secondary, a filled-but-borderless tertiary, a bare ghost, a destructive one, and a text link.
   Four hundred and fifty-six hand-rolled `<button>` elements were reproducing them by eye.

   Hover and press are colours, never filters. `brightness()` was in use in thirty-five places and
   does nothing at all to a white or transparent element, which is what most of these buttons are.
   Nothing lifts and nothing casts a shadow: this app has no shadows. */

export type ButtonVariant = "primary" | "secondary" | "tinted" | "ghost" | "danger" | "link";
export type ControlSize = "sm" | "md" | "lg";

/** Shared by every button: the box, the type, the transition, and the disabled state. */
/* `font-bold`, not `semibold` (owner, 2026-08-30). Checked against the reference CTA in the other
   product: the family already matches — both sit on the same `--font-sans` system stack — but the
   weight did not, and a 13px label at 600 on a saturated orange reads thinner than the same label on
   a white ground. The size stays on `--text-body`: the scale has six sizes and no others, and a
   button is not the place to add a seventh. */
const BTN_BASE =
  "inline-flex items-center justify-center gap-2 rounded-md text-body font-bold " +
  "transition-colors select-none " +
  "disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-fg " +
  "disabled:border-disabled-border disabled:pointer-events-none";

const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: "border border-transparent bg-brand text-brand-fg hover:bg-brand-hover active:bg-brand-press",
  secondary: "border border-border bg-surface text-navy hover:border-border-strong hover:bg-surface2 active:bg-surface3",
  tinted: "border border-transparent bg-surface2 text-navy hover:bg-surface3 active:bg-border",
  ghost: "border border-transparent bg-transparent text-navy hover:bg-surface2 active:bg-surface3",
  danger: "border border-transparent bg-danger text-white hover:bg-danger-hover active:bg-danger-press",
  link: "border-0 bg-transparent px-0 text-brand underline underline-offset-2 hover:text-brand-hover active:text-brand-press",
};

/**
 * A button's classes.
 *
 * @param variant  which of the six shapes — see `ButtonVariant`.
 * @param size     `sm` 30px, `md` 34px (the default, matching the top bar), `lg` 44px (the touch
 *                 minimum: a primary CTA, and anything a thumb has to hit on a phone).
 * @param opts     `icon` squares the button off for a lone glyph; `full` stretches it to its row;
 *                 `pill` rounds it completely, which the app uses for a CTA that floats free of a
 *                 form rather than sitting in one.
 */
export function btn(
  variant: ButtonVariant = "primary",
  size: ControlSize = "md",
  opts: { icon?: boolean; full?: boolean; pill?: boolean; className?: string } = {},
): string {
  const parts = [BTN_BASE, BTN_VARIANT[variant]];
  // A link is text in a line of text; it takes neither a control height nor horizontal padding.
  if (variant !== "link") {
    parts.push(`control-${size}`);
    if (opts.icon) parts.push("control-icon");
  }
  if (opts.pill) parts.push("!rounded-full");
  if (opts.full) parts.push("w-full");
  if (opts.className) parts.push(opts.className);
  return parts.join(" ");
}

/* ══════════════════════════════════════ Surfaces ═════════════════════════════════════════════
   Nothing casts a shadow, so a card is its border and its fill. A floating layer is separated from
   the page by the page dimming behind it, not by depth. */

/** The card skin — a bordered white box at the large radius. Padding is the caller's, from `PAD`. */
export const CARD = "rounded-lg border border-border bg-surface";

/** A card whose content is worth more attention than its neighbours'. Still no shadow. */
export const CARD_RAISED = "rounded-lg border border-border-strong bg-surface";

/** An inset panel — something set *into* a card rather than sitting on the page. */
export const PANEL = "rounded-md bg-surface2";

/** The navy block a page opens with. */
export const MASTHEAD = "rounded-lg bg-navy text-white";

/** Card padding, in three sizes. The 4px grid, so a card's inside matches the page's rhythm. */
export const PAD = {
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
} as const;

/* ── Floating layers ────────────────────────────────────────────────────────────────────────── */

/** The dimmed page behind a modal or a sheet. The dim is what separates the layer, not a shadow. */
export const SCRIM = "fixed inset-0 z-40 bg-[var(--scrim)]";

/** A modal or a sheet: white, bordered, large radius. */
export const OVERLAY = "z-50 rounded-lg border border-border bg-surface";

/** A dropdown or popover — the same treatment at the control radius. */
export const POPOVER = "z-50 rounded-md border border-border bg-surface p-2";

/** A tooltip inverts instead of bordering: navy ground, white text, no border. */
export const TOOLTIP = "z-50 rounded-sm bg-navy px-2 py-1 text-label font-semibold text-white";

/* ══════════════════════════════════════ Type roles ═══════════════════════════════════════════
   Six sizes, each with the weight and colour it is normally worn with. A screen can still set
   these separately; these exist so it usually does not have to. */

export const TYPE = {
  /** An uppercase section label above a group of fields. */
  label: "text-label font-semibold uppercase tracking-[0.05em] text-muted",
  /** The muted sentence under a value. */
  meta: "text-meta text-muted",
  /** The answer, a list row, the default. */
  body: "text-body text-navy",
  /** A card heading. */
  subhead: "text-subhead font-extrabold text-navy",
  /** A page or masthead name. */
  title: "text-title font-extrabold text-navy",
  /** A number worth shouting. Tabular so a column of them lines up. */
  display: "text-display font-extrabold text-navy tabular",
} as const;

/* ══════════════════════════════════════ Fields ═══════════════════════════════════════════════
   The focus ring is the one in `globals.css` and applies to every focusable thing on the page, so
   an input does not carry its own. What an input carries is its resting border and its error state. */

export const INPUT =
  "w-full rounded-md border border-border bg-surface px-3 text-body text-navy control-md " +
  "placeholder:text-muted-light " +
  "disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-fg";

/** A textarea is an input that grows, so it sets its own padding rather than a control height. */
export const TEXTAREA =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-navy " +
  "placeholder:text-muted-light " +
  "disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-fg";

/** A field whose required value is missing. Deep red on the border, not a ring — rings mean focus. */
export const INPUT_ERROR = "border-danger";

/** A field the AI agent filled in. Coral, the caution colour, because it is an assumption. */
export const INPUT_AGENT = "border-warn";

/* ══════════════════════════════════════ Selection ════════════════════════════════════════════
   Two rules, because the two shapes genuinely read differently (owner, 2026-08-26).

   A tab strip or a segmented control has a *track*: the selected item is a white panel lifted out
   of a tinted groove, and the groove is what does the separating — no shadow needed.

   A chip, a toggle or a selectable card has no track, so it marks itself with a brand tint.

   Before this there were six competing answers, including a navy fill, a white fill, a brand tint
   and a blue double ring. */

/** The groove a segmented control or tab strip sits in. */
export const TRACK = "inline-flex rounded-md border border-border bg-surface2 p-[3px]";

export const SEGMENT = {
  /** The chosen segment: a white panel lifted out of the groove. */
  on: "rounded-sm bg-surface px-4 text-body font-extrabold text-navy control-sm",
  /** The rest. Hover tints toward the surface so the strip answers the pointer. */
  off: "rounded-sm px-4 text-body font-semibold text-muted control-sm transition-colors hover:text-navy",
} as const;

export const CHIP = {
  /** A chosen chip, toggle or selectable card. */
  on: "border border-brand bg-brand-soft text-brand-deep font-semibold transition-colors",
  /** An unchosen one. */
  off: "border border-border bg-surface text-navy-mid font-semibold transition-colors hover:border-border-strong hover:bg-surface2",
} as const;

/** A chip's own box: pill-shaped, at the small control height. */
export const CHIP_BOX = "inline-flex items-center gap-2 rounded-full px-3.5 text-meta control-sm";

/** A selectable card is a chip that happens to be large — same colours, card geometry. */
export const CARD_SELECTABLE = {
  on: "rounded-lg border border-brand bg-brand-soft text-left transition-colors",
  off: "rounded-lg border border-border bg-surface text-left transition-colors hover:border-border-strong hover:bg-surface2",
} as const;

/* ══════════════════════════════════════ Status ═══════════════════════════════════════════════
   Each status has three tiers: the colour itself, a background you can lay it on, and the text
   colour that stays readable on that background. A badge uses all three at once. */

export type Tone = "neutral" | "ok" | "warn" | "danger" | "info" | "brand";

export const BADGE_BASE = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label font-semibold";

export const BADGE_TONE: Record<Tone, string> = {
  neutral: "bg-surface2 text-muted-dark",
  ok: "bg-ok-soft text-ok-deep",
  warn: "bg-warn-soft text-warn-deep",
  danger: "bg-danger-soft text-danger-deep",
  info: "bg-info-soft text-info-deep",
  brand: "bg-brand-soft text-brand-deep",
};

/** A full-width notice — the panel form of a status, for a caution or an error above a form. */
export const NOTICE_BASE = "flex items-start gap-2 rounded-md border p-3 text-meta";

export const NOTICE_TONE: Record<Tone, string> = {
  neutral: "border-border bg-surface2 text-navy",
  ok: "border-ok/40 bg-ok-soft text-ok-deep",
  warn: "border-warn/40 bg-warn-soft text-warn-deep",
  danger: "border-danger/40 bg-danger-soft text-danger-deep",
  info: "border-info/40 bg-info-soft text-info-deep",
  brand: "border-brand/40 bg-brand-soft text-brand-deep",
};

/* ══════════════════════════════════════ Rows and dividers ════════════════════════════════════ */

/** A tappable row in a list. Hover tints; press goes one step further. */
export const ROW =
  "flex w-full items-center gap-3 rounded-md px-3 text-start transition-colors control-lg " +
  "hover:bg-surface2 active:bg-surface3";

/** The line between rows. */
export const DIVIDER = "border-t border-border";

/* ══════════════════════════════════════ Page layout ══════════════════════════════════════════
   Where things sit, so that a page does not decide it for itself. These were spread across
   `AppShell` and copied into feature files; they are named here because placement is as much a part
   of the system as colour, and two pages agreeing on a gutter by coincidence is not a rule. */

/**
 * **The side gutter. One scale, every page** (owner, 2026-08-30).
 *
 * ~~Three of them: a `READING` gutter for forms and account pages (24/48/80/112), a `WORKING` one
 * for the map and the workspace (16/24/32/40), and a `BLEED` one for a viewport-pinned surface
 * (16/24). The argument was that a column of text wants space around it and a dense surface wants
 * that space back.~~ Withdrawn on the owner's audit: *"check the margin between the content and the
 * edge of the screen in the dashboard, requests, create request, profile, organization — all are
 * different, I want to unify it across all web pages."*
 *
 * They were different by 88px at `xl` between two pages a renter moves between in one errand, and
 * the reading argument had stopped being true anyway: the account pages are two columns of fields
 * now, and the home dashboard is a table beside a rail. None of them is a column of prose.
 *
 * So: one scale, and it is the tighter one. A page that wants a narrow measure gets it from a
 * `max-w` on its own content, which is a decision about the CONTENT — not from a gutter that also
 * moves every band and every full-width card on the page with it.
 */
export const PAGE_X = "px-4 sm:px-6 lg:px-8 xl:px-10";

/** The same step as a margin, for a band that insets a card rather than padding a row. */
export const PAGE_MX = "mx-4 sm:mx-6 lg:mx-8 xl:mx-10";

/**
 * **The content cap, every page** — the other half of "one margin".
 *
 * A gutter alone does not settle it: on a 1920 screen a capped page showed 352px of background
 * beside an uncapped one showing 40, which is the same complaint by another road. Full-bleed
 * surfaces are capped too; `fullBleed` means "pinned to the viewport's HEIGHT and owning its own
 * bands", which is a different claim from "as wide as the monitor happens to be".
 */
export const PAGE_MAX = "max-w-[1440px]";

/** The vertical rhythm of a page, which is one rule for all of them. */
export const PAGE_Y = "py-6 sm:py-7";

/**
 * The back control (owner, 2026-08-26: it belongs on the screen, not on the nav bar).
 *
 * It used to be a white circle inside the navy bar, which made "leave this page" look like part of
 * the app's frame — the one row that is the same everywhere. On the page, aligned to the content's
 * own leading edge, it reads as belonging to what it leaves.
 *
 * `AppShell` renders this itself for any page that registered a handler, so no page positions it.
 */
export const PAGE_BACK = "mb-4 inline-flex";

/**
 * A row of buttons.
 *
 * The primary action is LAST, on the row's trailing edge, which is where the Dialog footer and the
 * create wizard already put it. Written with `justify-end` rather than a margin so Arabic mirrors it
 * without a second rule.
 */
export const ACTIONS = "flex flex-wrap items-center justify-end gap-2.5";

/**
 * The same row when one of the actions destroys something. The destructive one goes to the OPPOSITE
 * edge, so Delete cannot be reached for while aiming at Save.
 */
export const ACTIONS_SPLIT = "flex flex-wrap items-center justify-between gap-2.5";

/**
 * The foot of a card, where that card's actions live — the action belongs to the thing it acts on.
 * Same geometry as the Dialog footer, because they are the same row in two containers.
 */
export const CARD_FOOTER =
  "flex flex-wrap items-center justify-end gap-2.5 border-t border-border px-5 py-3.5";

/** The gap between a page's stacked sections. */
export const SECTION_GAP = "space-y-4";

/* ══════════════════════════════════════ Helper ═══════════════════════════════════════════════ */

/** Joins class names, dropping anything falsy — so a conditional class needs no ternary-to-"". */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
