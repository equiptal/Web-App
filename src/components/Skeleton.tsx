import { cx } from "@/lib/ds";
import { CARD } from "@/components/PageSection";

/**
 * **The one loading shape** (owner, 2026-08-31: *"I want skeleton loadings in pages"*).
 *
 * Every page that waits on a fetch used to draw a centred `…`, and a few drew nothing. Both say the
 * same wrong thing: an ellipsis in the middle of an empty frame is indistinguishable from a renter
 * who has no requests, no company and no sites — so the first answer a page gave was the wrong one,
 * and then it changed its mind. A skeleton says *this is arriving* in a way an empty state cannot be
 * mistaken for.
 *
 * ── Two rules it follows ────────────────────────────────────────────────────────────────────────
 *  · **It is the shape of the content, not a spinner.** The blocks below are laid out where the real
 *    rows and fields will be, at their real heights, so nothing jumps when the data lands. A page
 *    that reflows on arrival is a page the reader has to re-find their place in.
 *  · **It is `--surface2`, and it pulses.** One neutral, the same the rest of the app uses for an
 *    inert ground, and `motion-safe:` on the animation — a reader who has asked for less motion gets
 *    a static block, which still says "not yet" by being blank.
 *
 * NO `aria-busy` and no live region: the container that owns the fetch says what is happening if
 * anything needs to. These are decoration, and they are `aria-hidden` for that reason — a screen
 * reader announcing eight empty boxes is worse than silence.
 */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cx("block rounded-sm bg-surface2 motion-safe:animate-pulse", className)} />;
}

/**
 * A stack of lines, for a block of text whose length is not known yet — a legal document, a note.
 *
 * The last line is short. Every paragraph ends mid-line, and a stack of equal bars reads as a table.
 */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cx("flex flex-col gap-2.5", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cx("h-3", i === lines - 1 ? "w-1/2" : "w-full")} />
      ))}
    </div>
  );
}

/**
 * A card of label/value pairs — the shape `FieldGrid` draws, at the same two columns.
 *
 * `rows` counts PAIRS, not cells, because that is how the real grid is written: a caller asking for
 * three fields should not have to know the grid fills in rows of two.
 */
export function SkeletonFields({ rows = 3 }: { rows?: number }) {
  return (
    <div className={cx(CARD, "p-4")}>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        {Array.from({ length: rows * 2 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-8 flex-none rounded-sm" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="mt-1.5 h-3 w-28" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * A card of rows — the shape `RowList` draws: a mark, a label over a hint, a chevron's worth of space.
 *
 * `divide-y` rather than a border on each child, so the last row has no rule under it and the card's
 * own edge does that job — which is what the real list does.
 */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className={cx(CARD, "divide-y divide-border")}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="size-8 flex-none rounded-sm" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-1.5 h-2.5 w-48" />
          </div>
          <Skeleton className="size-4 flex-none rounded-sm" />
        </div>
      ))}
    </div>
  );
}

/**
 * The label above a card, so a section's heading does not pop in after its body.
 *
 * `Section` draws its title at `text-label` in a row with a `min-h-[24px]`; this matches that height
 * so the card below starts on the same line either way.
 */
export function SkeletonSection({ children }: { children: React.ReactNode }) {
  return (
    <section className="mt-5 first:mt-0">
      <div className="mb-2 flex min-h-[24px] items-end px-1">
        <Skeleton className="h-2.5 w-24" />
      </div>
      {children}
    </section>
  );
}
