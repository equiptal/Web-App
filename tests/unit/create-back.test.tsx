import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppShell } from "@/components/AppShell";
import { CreateBack, IntakeBack } from "@/components/create/CreateBack";
import { LocaleProvider } from "@/lib/i18n";
import { SessionProvider } from "@/lib/session";
import { RfqProvider, useRfq } from "@/lib/store/rfq-store";
import { en } from "@/lib/i18n/en";
import { recordTrail, resetTrail } from "@/lib/nav-trail";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { confirmedProject, makeAgentDraft, makeItem, stubFetch } from "../setup/canvas";

/**
 * Back, on the create flow, walks the FLOW before it leaves it (owner, 2026-09-06: *"even back on
 * the review and summary, or any request page, must be back to the previous page, not to the
 * requests page"*).
 *
 * The review screen is not somewhere the renter navigated TO — it is the last step of the page he is
 * standing on. Back there meant «off this page, to whatever I visited before», which for most people
 * is the requests workspace, because that is where a request is usually started from. It means «back
 * to the canvas» now, and only the bottom of the chain leaves the page.
 */

const nav = vi.hoisted(() => ({ pushed: [] as string[] }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/create",
  useRouter: () => ({ push: (h: string) => nav.pushed.push(h), replace: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

let store: ReturnType<typeof useRfq>;
function Probe() {
  store = useRfq();
  return null;
}

/** What `Intake` does: the control is drawn by the work column, on that screen alone. */
function OnlyOnIntake() {
  const { state } = useRfq();
  return state.phase === "intake" ? <IntakeBack /> : null;
}

const draw = () =>
  render(
    <LocaleProvider initialLocale="en">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <SessionProvider initialUser={{ id: 7, phone: "+966501112233", tier: "basic" } as any}>
        <RfqProvider>
          <AppShell>
            <Probe />
            <CreateBack />
            {/* \u{1F534} On the INTAKE the shell registers nothing and the work column draws the control
                itself (owner, 2026-09-19), because the rail is a band of the screen and the shell's
                Back row runs underneath it. `Intake` renders this; the harness stands in for it, so
                the chain below can still be walked from the bottom step. */}
            <OnlyOnIntake />
          </AppShell>
        </RfqProvider>
      </SessionProvider>
    </LocaleProvider>,
  );

/** The one Back control the shell draws, wherever the page registered it. */
const back = () => screen.queryByText(en.shell.back)?.closest("button") ?? null;
const run = async (fn: () => void | Promise<void>) => {
  await act(async () => {
    await fn();
  });
};

/** Reach the canvas the way the flow does: type, let the agent answer, enter the wizard. */
const toCanvas = async () => {
  await run(() => store.actions.setText("1 x 30 ton digger, King Khalid Airport, 6 months"));
  await run(() => store.actions.process());
  await run(() => store.actions.enterWizard());
};

beforeEach(() => {
  nav.pushed = [];
  resetTrail();
  // He came from the workspace, which is exactly the page Back used to jump to from the review.
  recordTrail("/requests?r=r1&tab=compare");
  recordTrail("/create");
  // The agent's two calls, the taxonomy and the session — the same stub the canvas tests use, so the
  // draft this flow walks back through is the one the real PROCESS_SUCCESS path produces.
  stubFetch([], makeAgentDraft({ items: [makeItem()], project: confirmedProject() }));
});
afterEach(cleanup);

describe("the review screen steps back to the canvas", () => {
  it("returns to the canvas rather than leaving the page", async () => {
    draw();
    await toCanvas();
    await run(() => store.actions.setReadyToSend(true));

    fireEvent.click(back()!);

    expect(store.state.readyToSend).toBe(false);
    expect(store.state.phase).toBe("wizard");
    // The thing he reported: it must not go to the workspace he happened to come from.
    expect(nav.pushed).toEqual([]);
  });

  it("ASKS before stepping from the canvas back to «Your request»", async () => {
    /* ~~It stepped straight back.~~ Withdrawn (owner, 2026-09-09): *"if clicked while user is on the
       request page and back taking him to the intake again then show short simple confirm modal
       asking do you want to leave this request?"*. That press replaces the whole drafted request
       with the typing box, so it is the one step of the chain that earns a question. */
    draw();
    await toCanvas();

    fireEvent.click(back()!);

    // Nothing has moved yet — the question is the whole of what the press did.
    expect(store.state.phase).toBe("wizard");
    expect(screen.getByText("Leave this request and go back?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Leave" }));

    expect(store.state.phase).toBe("intake");
    expect(nav.pushed).toEqual([]);
    // The draft is not thrown away by stepping back — it is the same request.
    expect(store.state.draft).toBeTruthy();
  });

  it("«Stay» leaves him exactly where he was", async () => {
    // The mutation this catches: a confirm whose second button also navigates, which would make the
    // question decorative.
    draw();
    await toCanvas();

    fireEvent.click(back()!);
    fireEvent.click(screen.getByRole("button", { name: "Stay" }));

    expect(store.state.phase).toBe("wizard");
    expect(store.state.readyToSend).toBe(false);
    expect(nav.pushed).toEqual([]);
    expect(store.state.draft).toBeTruthy();
  });

  it("does NOT ask on the review step — that press keeps the draft whole", async () => {
    // The confirm guards ONE step. Asking on every step would put a dialog between the renter and
    // the panel he was going back to look at.
    draw();
    await toCanvas();
    await run(() => store.actions.setReadyToSend(true));

    fireEvent.click(back()!);

    expect(screen.queryByText("Leave this request and go back?")).toBeNull();
    expect(store.state.readyToSend).toBe(false);
  });

  it("only leaves the page at the bottom of the chain, and leaves for where he came FROM", async () => {
    draw();
    // Intake, with nothing to step back to: the control becomes an ordinary page Back - drawn by
    // the COLUMN here rather than by the shell, and landing in the same place either way.
    fireEvent.click(back()!);
    expect(nav.pushed).toEqual(["/requests?r=r1&tab=compare"]);
  });

  it("registers NOTHING with the shell on the intake, so the rail cannot cover it", () => {
    /**
     * The panel runs from under the 52px bar to the foot of the window and breaks out to the
     * window's own edges; the shell draws its Back row across the page gutter, first in `<main>`.
     * One of them has to move, and it is the control (owner, 2026-09-19: *"the panel must fit the
     * whole page from the header till the end and dont overlap it with the back button"*).
     *
     * \u26a0\ufe0f Read off the SOURCE: what is under test is which component registers, and two Back
     * controls in one render tree is exactly the state this rule exists to prevent.
     */
    const src = readFileSync(resolve(__dirname, "../../src/components/create/CreateBack.tsx"), "utf8");
    const spec = src.slice(src.indexOf("const spec ="), src.indexOf("usePageBack(spec)"));
    expect(spec).toContain('phase === "confirmation" || phase === "intake"');
    // The inline control never registers - that is what makes the pair safe (2026-09-09's trap).
    const inline = src.slice(src.indexOf("export function IntakeBack"), src.indexOf("export function CreateBack"));
    expect(inline).not.toContain("usePageBack");
    expect(readFileSync(resolve(__dirname, "../../src/components/screens/Intake.tsx"), "utf8")).toContain("<IntakeBack />");
  });

});
