import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Dropdown } from "@/components/Dropdown";
import { LocaleProvider } from "@/lib/i18n";

/**
 * **A menu closes when the surface moves under it — not when the reader scrolls the menu itself.**
 *
 * The close-on-scroll listener is registered in the CAPTURE phase, deliberately: the list is a fixed
 * layer, so a scroll anywhere in the ancestor chain must shut it rather than leave it stranded. But
 * capture also catches scrolls that START inside the list, and the options box is `max-h-56
 * overflow-auto` — so a picker with seven requests in it closed itself the moment the renter dragged
 * its own scrollbar (owner, 2026-09-06).
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
