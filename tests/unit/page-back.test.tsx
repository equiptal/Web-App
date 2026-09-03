import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ACTIONS, ACTIONS_SPLIT, CARD_FOOTER, PAGE_BACK, btn } from "@/lib/ds";

/**
 * **The back control is on the PAGE, not on the nav bar** (owner, 2026-08-26).
 *
 * It was a white circle inside the navy header, which put "leave this page" in the one row that is
 * identical on every route — beside the logo and the tabs, which say what the app IS. Back says
 * something about this page alone.
 *
 * This is asserted rather than left to a screenshot because the failure mode is quiet: the shell
 * renders either way, the control still works, and nothing type-checks differently. It would simply
 * be in the wrong place again, on every screen at once.
 *
 * `AppShell` itself pulls in the session, the router and the app-backend, so this mounts the two
 * elements the rule is actually about — a header and a main — around the same recipe the shell uses,
 * and checks the shell's source for the structure it cannot mount.
 */

function ArrowBackIcon() {
  return <span data-testid="arrow" />;
}

/** The shell's own arrangement: a bar, then the page, with back at the top of the page. */
function Shell({ back }: { back?: () => void }) {
  return (
    <div>
      <header data-testid="bar">
        <span>logo</span>
      </header>
      <main data-testid="page">
        {back && (
          <div className={PAGE_BACK}>
            <button onClick={back} aria-label="Back" className={btn("secondary", "md", { icon: true, pill: true })}>
              <ArrowBackIcon />
            </button>
          </div>
        )}
        <p>page content</p>
      </main>
    </div>
  );
}

describe("the back control sits on the page, under the bar", () => {
  it("renders inside <main> and nowhere inside the bar", () => {
    render(<Shell back={() => {}} />);
    const button = screen.getByRole("button", { name: "Back" });
    expect(screen.getByTestId("page").contains(button)).toBe(true);
    expect(screen.getByTestId("bar").contains(button)).toBe(false);
  });

  it("is absent when the page registered no handler — the positive control", () => {
    // Without this the assertion above would pass on a shell that never draws the control at all.
    render(<Shell />);
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("wears the app's own control, not a one-off", () => {
    render(<Shell back={() => {}} />);
    const cls = screen.getByRole("button", { name: "Back" }).className;
    // A bordered 34px circle: the secondary variant at the default control height, squared and
    // rounded. If it stops coming from btn(), it stops moving when the button does.
    expect(cls).toContain("control-md");
    expect(cls).toContain("control-icon");
    expect(cls).toContain("!rounded-full");
    expect(cls).toContain("border-border");
  });

  it("leaves 16px between itself and the page's first row", () => {
    render(<Shell back={() => {}} />);
    expect(screen.getByRole("button", { name: "Back" }).parentElement?.className).toContain("mb-4");
  });
});

describe("AppShell places it, so no page has to", () => {
  const shell = readFileSync(resolve(process.cwd(), "src/components/AppShell.tsx"), "utf8");
  const header = shell.slice(shell.indexOf("<header"), shell.indexOf("</header>"));
  const main = shell.slice(shell.indexOf("<main"), shell.indexOf("</main>"));

  it("draws the arrow in <main> and not in <header>", () => {
    expect(main).toContain("ArrowBackIcon");
    expect(header).not.toContain("ArrowBackIcon");
  });

  it("gives it the shared recipe rather than a hand-written class", () => {
    expect(main).toContain("PAGE_BACK");
    /* ~~`{ icon: true, pill: true }` — a bare arrow in a round pill.~~ It NAMES its destination now
       (owner, 2026-09-03), so it is an ordinary secondary button with a label beside the arrow. An
       arrow alone says "leave" and not "leave to where", which on a page reachable from four places
       is the only thing worth knowing before pressing it. Still the shared recipe, still one place. */
    expect(main).toMatch(/btn\("secondary", "md", \{ className: "gap-1\.5" \}\)/);
  });

  it("labels it from the trail, so the word is the place he came from", () => {
    // The rule itself is `back-nav.ts` and is tested there. This pins that the shell USES it rather
    // than writing a label of its own, which is how the two would drift.
    expect(main).toContain("backTarget(");
    expect(main).toMatch(/t\.shell\.backTo/);
    // And that a route it cannot name still draws a working control.
    expect(main).toContain("t.shell.back;");
  });

  it("still registers through the hook, under both its names", () => {
    expect(shell).toMatch(/export function usePageBack/);
    expect(shell).toMatch(/export const useHeaderBack = usePageBack/);
  });
});

describe("an action row is one recipe, and the primary action is last", () => {
  it("ends its children rather than starting them, so Arabic mirrors it", () => {
    // `justify-end` flips with `dir`; a margin on the first child would not.
    expect(ACTIONS).toContain("justify-end");
    expect(ACTIONS).not.toMatch(/\bm[sl]-auto\b/);
  });

  it("splits to opposite edges only when something is destroyed", () => {
    expect(ACTIONS_SPLIT).toContain("justify-between");
  });

  it("wears the same row at the foot of a card, plus the rule above it", () => {
    expect(CARD_FOOTER).toContain("justify-end");
    expect(CARD_FOOTER).toContain("border-t");
    expect(CARD_FOOTER).toContain("border-border");
  });

  it("uses one gap everywhere — the app had gap-1.5, 2, 2.5, 3 and 4", () => {
    expect(ACTIONS).toContain("gap-2.5");
    expect(ACTIONS_SPLIT).toContain("gap-2.5");
    expect(CARD_FOOTER).toContain("gap-2.5");
  });
});
