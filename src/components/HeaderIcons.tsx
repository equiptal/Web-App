/**
 * The top bar's own icons and count badge, traced from the header prototype (owner, 2026-08-25:
 * "u didnt match the prorotype toggle or the icons").
 *
 * ── Why these are not `Icon` ────────────────────────────────────────────────────────────────────
 * Everything else in the app draws from Material Icons Outlined, which is a heavier, rounder family
 * than the prototype's — its envelope is a filled-looking glyph where the prototype's is a 1.7px
 * hairline. No size or colour makes one look like the other, so the bar carries the prototype's own
 * paths verbatim. This is the only surface that does; anywhere else, use `Icon`.
 *
 * ── The hexes are the prototype's, not the app's tokens ─────────────────────────────────────────
 * `#5b6672` is a cool grey where `--muted` is blue-tinted (`#6b8fa8`), and `#e2891a` is a half-step
 * darker than `--brand` (`#f79009`). They are literals rather than tokens because they describe THIS
 * bar and the owner asked for this bar; promoting them would spread a second palette through the app.
 */
/**
 * ── Why Back, the hamburger and the close are here too ──────────────────────────────────────────
 * The prototype has none of the three — it draws one signed-in desktop state. But leaving them as
 * Material glyphs put two icon families in one bar, four hairline paths beside two heavier ones,
 * and that reads as a mistake whatever the sizes say. They are drawn to the same rule the prototype
 * sets for its own: 24 box, 1.7 stroke, round caps and joins.
 *
 * ── One arrow, mirrored ─────────────────────────────────────────────────────────────────────────
 * `ArrowBackIcon` points at the inline start and takes `rtl:-scale-x-100` from its caller, which is
 * how every other reversible arrow in this codebase turns round. It replaced a locale conditional
 * choosing between two Material glyph names.
 */
type IconProps = { size?: number; className?: string };

export function ArrowBackIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M19 12H5M5 12L11 6M5 12L11 18"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MenuIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M4 7H20M4 12H20M4 17H20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function MailIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 8L10.9 13.5C11.5 13.9 12.5 13.9 13.1 13.5L21 8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function BellIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18.5 8.8C18.5 6.9 17.7 5.1 16.4 3.8C15 2.5 13.2 1.8 11.3 1.9C7.7 2.1 5 5.3 5 9V11.7C5 12.4 4.7 13.5 4.3 14.1L2.9 16.2C2 17.5 2.6 19 4.1 19.5C8.9 21.1 14.1 21.1 18.9 19.5C20.3 19 20.9 17.4 20 16.2L18.6 14.1C18.2 13.5 17.9 12.4 17.9 11.7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.4 21.9C13.9 22.8 12.9 23.4 11.8 23.4C10.7 23.4 9.7 22.8 9.2 21.9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The count over an icon. 15px tall, growing sideways on padding so «2» is a circle and «99+» is a
 * lozenge — the prototype's `min-width:15px;padding:0 3px`.
 *
 * It hangs OUTSIDE the icon's box (`-6px` / `-8px`) and carries no ring: the prototype puts it on
 * bare white and lets the corner overhang read as depth. `end` rather than `right`, so it stays on
 * the outer corner when the bar mirrors.
 */
export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-1.5 -end-2 flex h-[15px] min-w-[15px] items-center justify-center rounded-lg bg-[#e2891a] px-[3px] text-[9.5px] font-bold leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}
