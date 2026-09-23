// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Dialog } from "@/components/Dialog";

/**
 * Two dialogs open at once, and which one the renter is looking at.
 *
 * Owner, 2026-09-12, on a shot of *Add suppliers* standing over *Share for bids*: *"fix the ui, how
 * can i open 2 modals above each other?"*
 *
 * 🔴 **The stack itself is deliberate and stays.** `ShareRequestPanel` opens the add dialog OVER
 * the share panel rather than replacing it, because the list reloads on success and the firm he has
 * just typed in arrives with the picks he had already made still ticked. What was broken is that the
 * second dialog was given NO ground of its own, so the first one read at full strength around it.
 */

afterEach(cleanup);

/** The share panel, with the add dialog opening out of it — the real shape, not two siblings. */
function Stack() {
  const [inner, setInner] = useState(false);
  return (
    <Dialog open onClose={() => {}} title="Share for bids">
      <button onClick={() => setInner(true)}>Add a supplier</button>
      <Dialog open={inner} onClose={() => setInner(false)} title="Add suppliers">
        <p>rows</p>
      </Dialog>
    </Dialog>
  );
}

const scrims = () => [...document.querySelectorAll<HTMLElement>("[data-dialog-scrim]")];

describe("a dialog opened over a dialog", () => {
  it("Given only one open, Then it draws the full scrim", () => {
    render(<Stack />);
    expect(scrims()).toHaveLength(1);
    expect(scrims()[0].className).toContain("bg-black/55");
  });

  it("Given a second one opened, Then it draws a ground of its own", () => {
    /**
     * 🔴 It used to be `fixed inset-0 z-[60]` and nothing else — a transparent click-catcher. With
     * no tone and no shadow in this design system, the panel underneath went on reading at full
     * strength above and below the new one, which is what made it look like an inline block rather
     * than a layer.
     */
    render(<Stack />);
    fireEvent.click(screen.getByText("Add a supplier"));

    const [outer, inner] = scrims();
    expect(inner.className).toContain("bg-black/25");
    // ⚠️ Lighter than the first, never a second curtain: two full scrims composite to mud, which
    // is the fault the nesting rule was written for in the first place.
    expect(inner.className).not.toContain("bg-black/55");
    expect(inner.className).not.toContain("backdrop-blur");
    expect(outer.className).toContain("bg-black/55");
  });

  it("Given the second one, Then it stays at z-[60] and later in the document", () => {
    /**
     * ⚠️ `Dropdown` portals its list at `z-[70]` on the stated promise of clearing this shell's
     * `z-[60]`. Raising the nested dialog would put it over its own dropdowns; being a DESCENDANT of
     * the dialog that opened it is what already paints it on top.
     */
    render(<Stack />);
    fireEvent.click(screen.getByText("Add a supplier"));

    const [outer, inner] = scrims();
    expect(inner.className).toContain("z-[60]");
    // eslint-disable-next-line no-bitwise
    expect(outer.compareDocumentPosition(inner) & Node.DOCUMENT_POSITION_CONTAINED_BY).toBeTruthy();
  });

  it("Given the second one closed again, Then the next nesting still reads as nested", () => {
    // ⚠️ The counter is a module-level number; an unbalanced mount would leak and the THIRD
    // dialog of a session would draw the wrong scrim with nothing failing.
    render(<Stack />);
    fireEvent.click(screen.getByText("Add a supplier"));
    fireEvent.click(screen.getAllByLabelText(/close/i)[1] ?? screen.getAllByRole("button").at(-1)!);

    fireEvent.click(screen.getByText("Add a supplier"));
    expect(scrims()[1].className).toContain("bg-black/25");
  });
});
