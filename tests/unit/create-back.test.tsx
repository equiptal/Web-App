import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppShell } from "@/components/AppShell";
import { CreateBack } from "@/components/create/CreateBack";
import { LocaleProvider } from "@/lib/i18n";
import { SessionProvider } from "@/lib/session";
import { RfqProvider, useRfq } from "@/lib/store/rfq-store";
import { en } from "@/lib/i18n/en";
import { recordTrail, resetTrail } from "@/lib/nav-trail";
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

const draw = () =>
  render(
    <LocaleProvider initialLocale="en">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <SessionProvider initialUser={{ id: 7, phone: "+966501112233", tier: "basic" } as any}>
        <RfqProvider>
          <AppShell>
            <Probe />
            <CreateBack />
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

  it("then steps from the canvas back to «Your request»", async () => {
    draw();
    await toCanvas();

    fireEvent.click(back()!);

    expect(store.state.phase).toBe("intake");
    expect(nav.pushed).toEqual([]);
    // The draft is not thrown away by stepping back — it is the same request.
    expect(store.state.draft).toBeTruthy();
  });

  it("only leaves the page at the bottom of the chain, and leaves for where he came FROM", async () => {
    draw();
    // Intake, with nothing to step back to: the control becomes an ordinary page Back.
    fireEvent.click(back()!);
    expect(nav.pushed).toEqual(["/requests?r=r1&tab=compare"]);
  });

});
