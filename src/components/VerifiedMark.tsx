/**
 * **The verified mark** — one glyph, everywhere something is vetted (owner, 2026-09-02).
 *
 * His own artwork: a green scalloped rosette with a white tick inside it. It replaces three marks
 * that were all saying "verified" in different shapes —
 *
 *   · Material's `verified` rosette, in the app's ink, at 13/14/18/22px on five surfaces
 *   · Material's `verified_user` shield, on three more
 *   · a bare stroked check drawn inline in the bid map's chip, at 11px and a 2.6 stroke
 *
 * — so the same claim looked like three claims, and on the supplier profile two of them appeared in
 * one dialog. A badge is a thing a reader learns ONCE and then recognises; three drawings of it is
 * three things to learn.
 *
 * ── It carries its own colour ────────────────────────────────────────────────────────────────────
 *
 * Green is not decoration here, it is the state — so the mark does not inherit `currentColor` the
 * way an `Icon` does. Dropped into a green chip, an amber row or a navy bar, it is the same badge,
 * which is the whole point of having one.
 *
 * `mono` is the exception, for a place where the two-tone rosette would be lost: an avatar's 15px
 * corner dot, where the tick is already sitting on its own green disc.
 */

export function VerifiedMark({
  size = 14,
  className = "",
  title,
  mono = false,
}: {
  size?: number;
  className?: string;
  /** A tooltip AND the accessible name. Without it the mark is decorative and hidden, which is right
   *  when the word «verified» is already printed beside it. */
  title?: string;
  /** Draw it in `currentColor` — for a mark already inside its own coloured disc. */
  mono?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 122.88 116.87"
      className={`flex-none ${className}`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {/* `--verified`, a token of its own: the artwork's green is the owner's, not `--ok` (#1daf58,
          the app's «this went well»), and a badge that drifted with a status colour would stop being
          a badge. Declared once in `globals.css` so a hex never appears in a component. */}
      <polygon
        fill={mono ? "currentColor" : "var(--verified)"}
        fillRule="evenodd"
        points="61.37 8.24 80.43 0 90.88 17.79 111.15 22.32 109.15 42.85 122.88 58.43 109.2 73.87 111.15 94.55 91 99 80.43 116.87 61.51 108.62 42.45 116.87 32 99.08 11.73 94.55 13.73 74.01 0 58.43 13.68 42.99 11.73 22.32 31.88 17.87 42.45 0 61.37 8.24 61.37 8.24"
      />
      <path
        /* The tick is the ground showing through the rosette, in both tones. */
        fill="var(--surface)"
        d="M37.92,65c-6.07-6.53,3.25-16.26,10-10.1,2.38,2.17,5.84,5.34,8.24,7.49L74.66,39.66C81.1,33,91.27,42.78,84.91,49.48L61.67,77.2a7.13,7.13,0,0,1-9.9.44C47.83,73.89,42.05,68.5,37.92,65Z"
      />
    </svg>
  );
}
