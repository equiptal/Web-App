"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The governance board, embedded so it reads as part of the page rather than as a box on it.
 *
 * ── Why an iframe at all ────────────────────────────────────────────────────────────────────────
 *
 * The board is one self-contained page whose cards, figures and drill-downs all derive from a
 * single fetch. Rebuilding it as components would mean splitting that fold across a component tree
 * and re-deriving the totals in several places, which is the exact failure the fold was pulled out
 * to prevent. So it stays one document, and this makes the frame behave like content.
 *
 * ── The two scrollbars, and how they go away ────────────────────────────────────────────────────
 *
 * A fixed-height iframe scrolls inside a page that also scrolls, which is the thing nobody wants.
 * The document inside reports its own height on every change and the frame is set to match, so it
 * never scrolls and the browser does the only scrolling there is.
 *
 * That has a consequence worth knowing: once the frame is as tall as its content, the frame's
 * viewport IS the whole document, so anything `position: fixed` inside it anchors to the full
 * height and scrolls away — the Cards panel would sit somewhere up in the first screenful and
 * never be seen again. So this also tells the document which slice of it is actually on screen,
 * and the document positions its panel and launcher against that.
 */
export function GovernanceBoard({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  /* A first height that is tall enough not to flash a squashed board, and short enough not to
     leave a hole under it if the real answer is smaller. */
  const [height, setHeight] = useState(900);

  /** Tell the document which part of itself the reader can currently see. */
  const report = useCallback(() => {
    const el = ref.current;
    const win = el?.contentWindow;
    if (!el || !win) return;
    const r = el.getBoundingClientRect();
    const top = Math.max(0, -r.top);
    const visible = Math.max(0, Math.min(window.innerHeight, r.bottom) - Math.max(0, r.top));
    win.postMessage({ t: "gov:view", top, h: visible }, window.location.origin);
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      /* Same-origin only. The frame is our own file, so anything from elsewhere is not ours to
         act on, and resizing on a stranger's say-so is a free way to break the page. */
      if (e.origin !== window.location.origin) return;
      const d = e.data as { t?: string; h?: number } | null;
      if (!d || d.t !== "gov:h" || typeof d.h !== "number") return;
      /* Rounded up a little: a height that lands a pixel short brings the inner scrollbar back,
         which is the whole thing this component exists to avoid. */
      setHeight(Math.max(400, Math.ceil(d.h) + 2));
      report();
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("scroll", report, { passive: true });
    window.addEventListener("resize", report);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("scroll", report);
      window.removeEventListener("resize", report);
    };
  }, [report]);

  return (
    <iframe
      ref={ref}
      src="/governance-dashboard.html?embed=1&v=8"
      title="Governance and compliance"
      onLoad={report}
      scrolling="no"
      className={"block w-full " + className}
      style={{ border: 0, height, overflow: "hidden" }}
    />
  );
}
