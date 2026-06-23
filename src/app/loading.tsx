/**
 * Route-transition skeleton. Next.js shows this instantly when navigating to any route while its
 * JS chunk + data load — so a click gives immediate feedback instead of a dead pause (perf: pairs
 * with <Link> prefetch in AppShell so the chunk is usually already downloading before the click).
 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-7" aria-busy="true" aria-live="polite">
      <div className="h-7 w-52 animate-pulse rounded-lg bg-surface2" />
      <div className="mt-2.5 h-4 w-72 max-w-full animate-pulse rounded bg-surface2" />
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-2xl border border-border bg-surface2" />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
