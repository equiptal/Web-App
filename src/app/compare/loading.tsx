/** Compare-route skeleton — the comparison matrix is the heaviest client screen, so show a
 *  column-grid placeholder instantly while its chunk + bid data load. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-7" aria-busy="true" aria-live="polite">
      <div className="h-7 w-56 animate-pulse rounded-lg bg-surface2" />
      <div className="mt-2.5 h-4 w-80 max-w-full animate-pulse rounded bg-surface2" />
      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-border p-4">
            <div className="h-5 w-2/3 animate-pulse rounded bg-surface2" />
            <div className="h-9 w-full animate-pulse rounded-lg bg-surface2" />
            {Array.from({ length: 5 }).map((_, r) => (
              <div key={r} className="h-4 w-full animate-pulse rounded bg-surface2" />
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only">Loading comparison…</span>
    </div>
  );
}
