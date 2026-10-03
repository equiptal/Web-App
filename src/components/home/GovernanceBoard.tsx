"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * The governance board, pinned to the window rather than sized by a guess.
 *
 * ── Why it is fixed, and measured ───────────────────────────────────────────────────────────────
 *
 * The rail lives inside the frame and is `position: fixed`, so it reaches the frame's edges and no
 * further. The frame was `calc(100vh - 96px)` — a typed guess at the height of the app header plus
 * the tab row above it. Two things were wrong with that. The 96 was never checked against what the
 * header actually measures (52px, plus a tab row that wraps to two lines on a narrow window), so
 * the rail stopped short of the bottom of the screen by whatever the guess was out by. And a guess
 * cannot follow a tab row that changes height, which is exactly what happens at the width where
 * the tabs wrap.
 *
 * So the frame is `position: fixed` from the bottom of whatever sits above it to the bottom of the
 * window, and that distance is MEASURED off a zero-height anchor left in the normal flow. The rail
 * then genuinely reaches both edges, the board is the full width of the window, and the frame's is
 * the only scrollbar on the tab.
 *
 * ── Why the rail is still inside the frame ──────────────────────────────────────────────────────
 *
 * Moving it out into React would let it cover the app header too. It would also cost the card
 * picker its previews: those are live, scaled clones of the board's own sections, so they only
 * exist in the document the board is in. A picker that showed drawings of the cards instead of the
 * cards was the thing that got rebuilt once already. The header stays.
 */
export function GovernanceBoard({ className = "" }: { className?: string }) {
  const anchor = useRef<HTMLDivElement>(null);
  /* The initial value is the old guess, used for exactly one frame before the measurement lands.
     Starting at 0 would flash a full-height board up behind the header. */
  const [top, setTop] = useState(96);

  useLayoutEffect(() => {
    const el = anchor.current;
    if (!el) return;
    const measure = () => {
      const t = el.getBoundingClientRect().top;
      /* `display: none` on the hidden tab reports 0 for everything. Keeping the last good value
         rather than collapsing to the top of the window means switching away and back does not
         flash the board over the header. */
      if (t > 0) setTop(Math.round(t));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener("resize", measure);
    /* Nothing scrolls on this tab — the frame holds the only scrollbar — but a browser that
       restores a scroll position on load would otherwise leave the measurement stale. */
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, []);

  /* The board reports when the picker opens. Nothing acts on it yet; it is here because the frame
     is the only thing that knows, and a listener added later cannot ask it after the fact. */
  const [railOpen, setRailOpen] = useState(false);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      /* Same-origin only. The board is served from `public/`, so anything from elsewhere claiming
         to be it is not it. */
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; open?: boolean } | null;
      if (d && d.type === "governance:rail") setRailOpen(!!d.open);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  void railOpen;

  return (
    <>
      {/* Zero height, in the flow, purely to be measured. */}
      <div ref={anchor} aria-hidden className="h-0" />
      <iframe
        /* Bumped with every change to the page. Amplify serves `public/` with a long max-age, so a
           stale `v` is not a cosmetic slip: the browser keeps the old board and the new route's
           payload is read by code that predates it. */
        src="/governance-dashboard.html?embed=1&v=16"
        title="Governance and compliance"
        className={"block " + className}
        /* ⚠️ Sized explicitly, never by `inset`. An `<iframe>` is a REPLACED element with an
           intrinsic 300x150, so on an absolutely positioned one `width: auto` resolves to 300px
           and the `right`/`bottom` offsets are simply dropped as over-constrained. It rendered as
           a 300px box in the corner with the rail squeezed inside it. The containing block of a
           fixed element is the viewport, so these percentages are of the window. */
        style={{ position: "fixed", insetInlineStart: 0, top, width: "100%", height: `calc(100% - ${top}px)`, border: 0 }}
      />
    </>
  );
}
