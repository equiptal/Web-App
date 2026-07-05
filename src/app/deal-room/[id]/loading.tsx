/** Deal-room skeleton — this route eagerly loads the large stream-chat SDK, so its first-load chunk
 *  is the biggest; show a chat-shaped placeholder instantly while it loads. */
export default function Loading() {
  return (
    <div className="mx-auto flex h-[calc(100vh-62px)] w-full max-w-4xl flex-col px-4 py-6 sm:px-7" aria-busy="true" aria-live="polite">
      <div className="h-6 w-48 animate-pulse rounded-lg bg-surface2" />
      <div className="mt-6 flex flex-1 flex-col gap-4">
        {[["start", "60%"], ["end", "45%"], ["start", "72%"], ["end", "38%"], ["start", "55%"]].map(([side, w], i) => (
          <div key={i} className={`flex ${side === "end" ? "justify-end" : "justify-start"}`}>
            <div className="h-14 animate-pulse rounded-2xl bg-surface2" style={{ width: w }} />
          </div>
        ))}
      </div>
      <div className="mt-4 h-11 w-full animate-pulse rounded-xl bg-surface2" />
      <span className="sr-only">Loading deal room…</span>
    </div>
  );
}
