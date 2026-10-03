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
 * header actually measures (52px, plus a banner and a tab row that both wrap on a narrow window),
 * so the rail stopped short of the bottom of the screen by whatever the guess was out by. And a
 * guess cannot follow chrome that changes height, which is exactly what happens at the width where
 * the tabs wrap.
 *
 * So the frame runs from the bottom of whatever sits above it to the bottom of the window, and
 * that distance is MEASURED off a zero-height anchor left in the normal flow.
 *
 * ── Why the frame grows over the host's own header while the rail is open ───────────────────────
 *
 * Owner, 2026-10-03: *"the side panel still doesnt open on full height on top … i want the panel
 * to be above the header and above the cta"*. The rail cannot paint outside its frame, so the only
 * way it reaches the top of the SCREEN is for the frame to reach the top of the screen. While the
 * rail is open the frame therefore covers the window entirely and sits above the app header; the
 * board page holds its content still by padding itself by the same offset, and its top strip is
 * transparent, so the header and the banner show through exactly where they were.
 *
 * ⚠️ **The whole window belongs to the frame while the rail is open, so the header, the banner and
 * the tab row are visible but not clickable.** That is the cost of a panel that covers them, and
 * it is why the rail now closes on Escape as well as on its ✕ (`2026-10-03.17`): a renter who
 * opened the tab and found the picker over his navigation must always have a way back out. The
 * moment it closes the frame drops below the header again and everything is live.
 *
 * ── Why the rail is still inside the frame ──────────────────────────────────────────────────────
 *
 * Moving it into React is the only way to have it cover the header AND leave the header clickable.
 * It would cost the card picker its previews: those are live, scaled clones of the board's own
 * sections, so they exist only in the document the board is in. A picker that showed drawings of
 * the cards instead of the cards is the thing that got rebuilt once already.
 */
export function GovernanceBoard({ className = "" }: { className?: string }) {
  const anchor = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  /* The initial value is the old guess, used for exactly one frame before the measurement lands.
     Starting at 0 would flash a full-height board up behind the header. */
  const [top, setTop] = useState(96);
  const [railOpen, setRailOpen] = useState(false);

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

  /* How much of the frame is now sitting over the host's chrome. The board pads itself by it so
     the cards stay where the reader last saw them instead of jumping up under the header. */
  const overlap = railOpen ? top : 0;
  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      { type: "governance:offset", px: overlap },
      window.location.origin,
    );
  }, [overlap]);

  return (
    <>
      {/* Zero height, in the flow, purely to be measured. */}
      <div ref={anchor} aria-hidden className="h-0" />
      <iframe
        ref={frame}
        /* Bumped with every change to the page. Amplify serves `public/` with a long max-age, so a
           stale `v` is not a cosmetic slip: the browser keeps the old board and the new route's
           payload is read by code that predates it. */
        src="/governance-dashboard.html?embed=1&v=22"
        title="Governance and compliance"
        className={"block " + className}
        /* ⚠️ Sized explicitly, never by `inset`. An `<iframe>` is a REPLACED element with an
           intrinsic 300x150, so on an absolutely positioned one `width: auto` resolves to 300px
           and the `right`/`bottom` offsets are simply dropped as over-constrained. It rendered as
           a 300px box in the corner with the rail squeezed inside it. The containing block of a
           fixed element is the viewport, so these percentages are of the window.
           The app header is `z-30`; 40 clears it, and only while the rail is open. */
        style={{
          position: "fixed",
          insetInlineStart: 0,
          top: railOpen ? 0 : top,
          width: "100%",
          height: railOpen ? "100%" : `calc(100% - ${top}px)`,
          zIndex: railOpen ? 40 : 0,
          border: 0,
        }}
      />
    </>
  );
}
