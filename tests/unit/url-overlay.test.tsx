// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useUrlOverlay } from "@/lib/nav/useUrlOverlay";

/**
 * **An open modal is a step, and Back must return to it** (owner, 2026-09-07: *"he was on home page
 * and opened a modal then inside the modal he clicked on a row or something took him somewhere else,
 * so when back he will be back on the home with the modal"*).
 *
 * The fix moves the overlay's identity into the URL, which makes the claim testable: these drive the
 * hook through the four motions a renter actually performs — open, leave and come back, close, and
 * arrive on a link that already carries the parameter — and assert on the history stack, because the
 * stack is what the browser's own Back button reads.
 *
 * jsdom implements `pushState`/`replaceState` and the length of the stack, but it does NOT fire
 * `popstate` for `history.back()`. So the tests that need a real back-and-forward dispatch the event
 * themselves after moving the URL, which is exactly what a browser does.
 */

function Probe({ k = "req" }: { k?: string }) {
  const o = useUrlOverlay(k);
  return (
    <div>
      <span data-testid="value">{o.value ?? "none"}</span>
      <button data-testid="open-a" onClick={() => o.open("a")} />
      <button data-testid="open-b" onClick={() => o.open("b")} />
      <button data-testid="close" onClick={o.close} />
    </div>
  );
}

const value = () => document.querySelector('[data-testid="value"]')!.textContent;
const press = (id: string) => act(() => void (document.querySelector(`[data-testid="${id}"]`) as HTMLElement).click());

beforeEach(() => {
  // One clean entry to start from, so `history.length` deltas below mean what they say.
  window.history.replaceState({}, "", "/");
});
afterEach(cleanup);

describe("opening an overlay", () => {
  it("puts the id in the URL and adds exactly one history entry", () => {
    render(<Probe />);
    const before = window.history.length;
    press("open-a");
    expect(value()).toBe("a");
    expect(new URLSearchParams(window.location.search).get("req")).toBe("a");
    expect(window.history.length).toBe(before + 1);
  });

  it("marks the entry as ours, so close knows there is something to walk back to", () => {
    render(<Probe />);
    press("open-a");
    expect((window.history.state as { overlay?: string }).overlay).toBe("req");
  });

  it("does not stack a second entry when the renter opens another one from the same page", () => {
    // A lateral move inside the overlay. Stacking here would mean pressing Back twice to leave.
    render(<Probe />);
    press("open-a");
    const after = window.history.length;
    press("open-b");
    expect(value()).toBe("b");
    expect(new URLSearchParams(window.location.search).get("req")).toBe("b");
    expect(window.history.length).toBe(after);
  });
});

describe("coming back to the step", () => {
  it("reopens from the URL when the browser returns to that entry", () => {
    // The renter's whole complaint, in three lines: open the modal, navigate away, press Back.
    render(<Probe />);
    press("open-a");
    window.history.pushState({}, "", "/bids/42/equipment");
    act(() => void window.dispatchEvent(new PopStateEvent("popstate")));

    window.history.replaceState({ overlay: "req" }, "", "/?req=a"); // what Back lands on
    act(() => void window.dispatchEvent(new PopStateEvent("popstate")));
    expect(value()).toBe("a");
  });

  it("opens straight onto the overlay when the page loads with the parameter", () => {
    // A reload, or a copied link — the property component state could never have.
    window.history.replaceState({}, "", "/?req=zed");
    render(<Probe />);
    expect(value()).toBe("zed");
  });

  it("stays shut when the parameter is not there", () => {
    render(<Probe />);
    expect(value()).toBe("none");
  });
});

describe("closing it", () => {
  it("strips the parameter in place when we did not push the entry", () => {
    // Arrived on a link: there is no entry of ours behind this one, so Back would leave the app.
    window.history.replaceState({}, "", "/?req=a&tab=compare");
    render(<Probe />);
    expect(value()).toBe("a");
    press("close");
    expect(value()).toBe("none");
    expect(new URLSearchParams(window.location.search).get("req")).toBeNull();
    // Everything else in the URL is somebody else's state and must survive.
    expect(new URLSearchParams(window.location.search).get("tab")).toBe("compare");
  });

  it("walks the entry back when we own it, so closing and Back are one motion", () => {
    render(<Probe />);
    press("open-a");
    const len = window.history.length;
    press("close");
    // `history.back()` is asynchronous in jsdom and fires no event; what this pins is that close did
    // NOT strip the parameter itself, because doing both would orphan our entry in the stack.
    expect(window.history.length).toBe(len);
  });
});

describe("two overlays on one page", () => {
  it("keeps to its own key", () => {
    window.history.replaceState({}, "", "/?req=a");
    render(<Probe k="offer" />);
    expect(value()).toBe("none");
  });
});
