"use client";

import { useCallback, useEffect, useState } from "react";

/** Bumped with every change to the page: Amplify serves `public/` with a long max-age. */
const V = 39;

/** The rail's width, and the padding the board carries so no card hides under it. */
const RAIL_W = 404;

/**
 * The governance board: one frame in the page, one frame over it.
 *
 * ── Why two frames ─────────────────────────────────────────────────────────────────────────────
 *
 * Two requirements that one frame cannot meet together.
 *
 * The BOARD has to sit in this page's normal flow (owner, 2026-10-03: *"the dashboard itself must
 * be in the page not floating above"*). It was `position: fixed` for a few hours, which meant it
 * contributed no layout height at all and painted over everything below it on the tab.
 *
 * The RAIL has to reach the top of the SCREEN, over the app header (owner, same day: *"i want the
 * panel to be above the header and above the cta"*). Inside a frame, `position: fixed` anchors to
 * THAT frame's box — so a frame tall enough to hold the board in flow gives the rail a 5,000px
 * viewport to be "full height" of, and the rail runs off the bottom of the world.
 *
 * So the same page is loaded twice. `?embed=1` draws the board and hides the rail; `?rail=1` draws
 * the rail and hides the board. The board frame is an ordinary block in the flow, sized to the
 * height it reports; the rail frame is a fixed strip above everything.
 *
 * ── Why not a rail written in React ────────────────────────────────────────────────────────────
 *
 * The card picker's previews are live, scaled clones of the board's own sections. A React rail
 * would have to draw pictures of the cards instead, which is the thing that got rebuilt once
 * already. Loading the page twice keeps them real: each frame builds its own deck, so each has a
 * genuine set of sections to clone.
 *
 * ⚠️ **The fan-out route is still called once.** The board frame fetches and publishes the payload
 * to `sessionStorage`; the rail frame waits for it rather than asking again. The chosen cards
 * travel the other way through `localStorage` and a `storage` event, which fires in every other
 * document on the origin but never in the one that wrote — so the two cannot loop.
 */
export function GovernanceBoard({ className = "" }: { className?: string }) {
  /* A first guess, replaced by the frame's own measurement within a frame or two. Starting at
     zero collapses the tab and makes the page jump as it fills. */
  const [height, setHeight] = useState(900);
  const [railOpen, setRailOpen] = useState(true);
  /* ⚠️ The rail mounts WITH the board, not after it.
     It was gated on the board publishing its payload, which meant the picker appeared a second
     or two into the tab — so opening Governance showed a bare board and the panel arrived late,
     as if something had gone wrong. Owner, 2026-10-03: *"show the side panel opened once the
     governance clicked"*. It polls `sessionStorage` for up to ten seconds and draws its chrome
     immediately, so starting it early costs nothing and it is on screen from the first paint. */

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      /* Same-origin only. The board is served from `public/`, so anything from elsewhere
         claiming to be it is not it. */
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; px?: number; open?: boolean } | null;
      if (!d) return;
      if (d.type === "governance:height" && typeof d.px === "number" && d.px > 200) {
        /* ⚠️ Both ends damp this. Setting the frame's height reflows the document inside it,
           which changes its `scrollHeight` by a pixel or two, which reports again — and the two
           sides oscillate forever with no frame ever presented. It hung a real browser hard
           enough that `document.title` timed out. The board will not report a move under 4px;
           this will not act on one either, because one damper is a single point of failure. */
        setHeight((prev) => (Math.abs(d.px! - prev) < 4 ? prev : d.px!));
      }
      /* Only the rail frame sends this, and only to be dismissed: its ✕ and Escape ask to be
         hidden, because closing the panel inside its own frame would leave an empty strip on
         screen with no way back. */
      if (d.type === "governance:rail") setRailOpen(!!d.open);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const reopen = useCallback(() => setRailOpen(true), []);

  return (
    <>
      <iframe
        src={`/governance-dashboard.html?embed=1&v=${V}`}
        title="Governance and compliance"
        /* In the flow, sized to what it reports. `block` because an inline frame sits on the text
           baseline and leaves a few pixels of descender gap beneath it.
           The board narrows while the rail is over it, so no card sits under the panel that is
           describing it. */
        className={"block w-full " + className}
        style={{
          border: 0,
          height,
          paddingInlineEnd: railOpen ? RAIL_W : 0,
          transition: "padding 0.18s ease",
        }}
      />

      {railOpen && (
        <iframe
          src={`/governance-dashboard.html?rail=1&v=${V}`}
          title="Cards and questions"
          className="bg-surface"
          /* Fixed to the WINDOW, not to the board: that is the whole reason it is a second frame.
             The app header is `z-30`, so 40 clears it. */
          style={{
            position: "fixed",
            insetBlockStart: 0,
            insetInlineEnd: 0,
            /* ⚠️ Sized explicitly. An `<iframe>` is a REPLACED element with an intrinsic
               300x150, so `inset-block: 0` does NOT stretch it — the offsets are dropped as
               over-constrained and it renders 150px tall in the corner. Same trap that caught
               the board frame; it catches every iframe. */
            height: "100%",
            width: RAIL_W,
            maxWidth: "100vw",
            border: 0,
            zIndex: 40,
            /* A border, not a shadow. This app has none: a card is its border and a floating
               layer is separated by its scrim (`OVERLAY` / `SCRIM` in `src/lib/ds.ts`). The rail
               is a dock rather than a modal, so it takes the border. */
            borderInlineStart: "1px solid var(--border-strong)",
          }}
        />
      )}

      {!railOpen && (
        /* The way back in. The rail is the only way to put a card on the board, so a board with
           it shut and no launcher is a page the reader cannot change. */
        <button
          type="button"
          onClick={reopen}
          className="fixed bottom-6 end-6 z-40 flex items-center gap-2 rounded-full bg-navy px-5 py-3 text-body font-extrabold text-white transition hover:bg-navy-mid"
        >
          <span aria-hidden className="text-brand-light">
            ▤
          </span>{" "}
          Cards
        </button>
      )}
    </>
  );
}
