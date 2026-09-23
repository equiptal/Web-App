import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Dropdown } from "@/components/Dropdown";
import { LocaleProvider } from "@/lib/i18n";

/**
 * **A menu closes when the surface moves under it — not when the reader scrolls the menu itself.**
 *
 * The close-on-scroll listener is registered in the CAPTURE phase, deliberately: the list is a fixed
 * layer, so a scroll anywhere in the ancestor chain must shut it rather than leave it stranded. But
 * capture also catches scrolls that START inside the list, and the options box scrolls — so a picker with seven requests in it closed itself the moment the renter
 * dragged its own scrollbar (owner, 2026-09-06).
 */
const OPTIONS = Array.from({ length: 9 }, (_, i) => ({
  value: `r${i}`,
  label: "Crawler Excavator 20 ton",
  hint: `Request CEX0309${i}`,
}));

function open() {
  render(
    <LocaleProvider>
      {/* Nine options: past `options.length > 7`, the search box appears and the list gets a
          scrollbar of its own — the state the bug lived in. */}
      <Dropdown label="Request" placeholder="Pick a request" value="r0" options={OPTIONS} onChange={() => {}} />
    </LocaleProvider>,
  );
  fireEvent.click(screen.getByRole("combobox"));
  return screen.getByRole("listbox");
}

describe("the request picker survives its own scrollbar", () => {
  it("stays open when the scroll comes from inside the list", () => {
    const list = open();
    fireEvent.scroll(list);
    expect(screen.queryByRole("listbox")).not.toBeNull();
  });

  it("stays open when the scroll comes from a row inside it", () => {
    const list = open();
    // Capture sees the innermost target; a row is inside the menu just as the box is.
    fireEvent.scroll(list.querySelector("button")!);
    expect(screen.queryByRole("listbox")).not.toBeNull();
  });

  it("still closes when the PAGE scrolls — the surface moved under it", () => {
    open();
    fireEvent.scroll(document);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("still closes on an outside click", () => {
    open();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

/**
 * ── The list takes the room it HAS (owner, 2026-09-13: *"show all even without search"*) ─────────
 *
 * 🔴 It was `max-h-56` — a flat 224px, six rows, whatever the screen. On a catalogue of ~120
 * machines that is a sliver, and the renter had to TYPE before he could see what was in there, which
 * is the opposite of what a list is for. It is why «show me everything» read as «it only shows a
 * few»: everything was rendered and almost none of it was visible.
 *
 * ⚠️ jsdom lays out nothing, so `getBoundingClientRect` is all zeros and the measurement falls to its
 * FLOOR. That is the half worth pinning anyway: the floor must be a readable list, and the height
 * must come from the measurement rather than from a class nobody can vary.
 */
describe("how much of the list the renter can see", () => {
  it("sizes the options box from the measured room, never from a fixed class", () => {
    const list = open();
    // The class that capped it is gone, and an inline height took its place.
    expect(list.className).not.toContain("max-h-");
    expect(list.style.maxHeight).toBeTruthy();
  });

  it("never hangs off the bottom of the window — the part below the fold is unreachable", () => {
    /**
     * 🔴 A `position: fixed` layer past the viewport CANNOT be scrolled into view: the page scrolls
     * and the layer does not move with it, so the rows below the fold can only be reached by
     * searching (owner, 2026-09-13: *"it contains all, but when I search I find - not by
     * scrolling"*). It happens whenever the height FLOOR is taller than the room left below the
     * trigger, which is the ordinary case near the foot of a page.
     * The height stays at the floor there — a sliver is worse — so the POSITION gives instead.
     */
    render(
      <LocaleProvider>
        <Dropdown label="Request" placeholder="Pick a request" value="r0" options={OPTIONS} onChange={() => {}} />
      </LocaleProvider>,
    );
    const trigger = screen.getByRole("combobox");
    /* A SHORT window with the trigger in the middle of it: 130px below and 150px above, so neither
       side holds the 200px floor and flipping up cannot save it either. Without the clamp the list
       opens at -100 — above the top of the screen — and the rows at its foot are unreachable.
       ⚠️ The rect is stubbed on the node the component measures, which is the trigger's WRAPPER. */
    const rect = { top: 150, bottom: 170, left: 20, right: 240, width: 220, height: 20, x: 20, y: 150, toJSON: () => ({}) } as DOMRect;
    trigger.parentElement!.getBoundingClientRect = () => rect;
    trigger.getBoundingClientRect = () => rect;
    window.innerHeight = 300;
    fireEvent.click(trigger);

    const box = screen.getByRole("listbox").parentElement!;
    const top = parseInt(box.style.top, 10);
    const height = parseInt(screen.getByRole("listbox").style.maxHeight, 10);
    expect(top).toBeGreaterThanOrEqual(8);
    // The whole layer, its search row included (46px), sits inside the window.
    expect(top + 46 + height).toBeLessThanOrEqual(300 - 8);
  });

  it("never opens shorter than a readable list, even with no room measured", () => {
    const list = open();
    // Zero rects in jsdom → the floor. Anything less than this is worse than scrolling.
    expect(parseInt(list.style.maxHeight, 10)).toBeGreaterThanOrEqual(200);
    // And never the page: a list is a list.
    expect(parseInt(list.style.maxHeight, 10)).toBeLessThanOrEqual(420);
  });
});
