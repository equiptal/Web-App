"use client";

/**
 * The governance board, as a viewport-height frame.
 *
 * ── Why the frame is the viewport, and not its own content height ───────────────────────────────
 *
 * It was sized to its own content for a while, so the browser did the only scrolling and there was
 * no nested scrollbar. That part worked. What it cost was the Cards rail: inside a frame as tall as
 * its content, `position: fixed` anchors to the whole document, so the rail had to be placed from
 * host-reported coordinates — and it ended up floating as a card with a margin round it instead of
 * meeting the screen edges, which is the opposite of what it is for.
 *
 * So the frame IS the viewport now. `position: fixed` inside it means what it says, the rail is
 * flush and full height exactly as the prototype draws it, and the board scrolls beneath it.
 *
 * The cost, stated plainly: the board scrolls inside the frame rather than the page scrolling. On
 * this tab the board is the whole content, with nothing above or below it to scroll past, so the
 * two are the same gesture. That is the trade, and it was taken deliberately.
 */
export function GovernanceBoard({ className = "" }: { className?: string }) {
  return (
    <iframe
      src="/governance-dashboard.html?embed=1&v=10"
      title="Governance and compliance"
      /* Tall enough to be the screen, short enough to leave the tab row above it in view. */
      className={"block w-full " + className}
      style={{ border: 0, height: "calc(100vh - 150px)", minHeight: 520 }}
    />
  );
}
