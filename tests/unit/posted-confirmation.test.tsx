import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";

/**
 * **The confirmation appears when there is nothing to come back from** (owner, 2026-09-08: *"when I
 * sent a request through Outlook and Moedatech it must show sent successfully with the post request
 * confirmation in the same modal and immediately after post and send the Outlook email"*).
 *
 * `ShareOnPost` holds its «Your request is posted» dialog back until this tab is visible again —
 * right for a compose tab, which steals focus, and wrong for the one channel that opens nothing at
 * all: a connected Outlook is sent by the server through Graph and the renter never leaves the page,
 * so `visibilitychange` and `focus` never fire and the dialog never came.
 *
 * These drive the real `ShareOnPost` with `ShareRequestPanel` stubbed, because what is under test is
 * the ANNOUNCEMENT rule: which outcome shows the tick at once, which one waits, and what the tick
 * says about the e-mail. The panel's own half of the contract is pinned in
 * `share-request-panel.test.tsx`.
 */

type Outcome = { handedOff: boolean; mail?: { from: string; recipients: number; inSentFolder: boolean } };

const hoisted = vi.hoisted(() => ({
  fire: null as null | ((n: number, ch: string, o?: Outcome) => void),
  /** The panel's own «post it» handler, so a test can mint the request the way Send does. */
  post: null as null | (() => Promise<string | null>),
}));

vi.mock("@/components/share/ShareRequestPanel", () => ({
  ShareRequestPanel: (props: {
    onShared?: (n: number, ch: string, o?: Outcome) => void;
    onPost?: () => Promise<string | null>;
  }) => {
    hoisted.fire = (n, ch, o) => props.onShared?.(n, ch, o);
    hoisted.post = props.onPost ?? null;
    return <div data-testid="panel" />;
  },
}));

vi.mock("@/lib/store/rfq-store", () => ({
  useRfq: () => ({
    state: { draft: null, taxonomy: null, errorDetail: null, phase: "review", readyToSend: true, shareOnPost: false },
    actions: { submit: async () => ({ requestUuids: ["r-1"] }), setShareOnPost: () => {} },
  }),
}));

vi.mock("@/lib/session", () => ({ useSession: () => ({ tier: "basic", status: "authed" }) }));

const { ShareOnPost } = await import("@/components/create/ShareOnPost");

const c = en.intake.postShare;

beforeEach(() => {
  hoisted.fire = null;
  hoisted.post = null;
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ user: { companyName: "Zahid" } }), { status: 200 }));
});
afterEach(cleanup);

const draw = () =>
  render(
    <LocaleProvider initialLocale="en">
      <ShareOnPost />
    </LocaleProvider>,
  );

describe("a send the server performed", () => {
  it("shows the confirmation at once, without waiting for focus", async () => {
    draw();
    await waitFor(() => expect(screen.getByTestId("panel")).toBeTruthy());
    hoisted.fire!(1, "email", {
      handedOff: false,
      mail: { from: "bandar@moedatech.net", recipients: 1, inSentFolder: true },
    });
    // No visibilitychange, no focus event — the renter never left, and neither did the page.
    expect(await screen.findByText(c.postedTitle)).toBeTruthy();
  });

  it("says the e-mail went, from which address", async () => {
    draw();
    await waitFor(() => expect(screen.getByTestId("panel")).toBeTruthy());
    hoisted.fire!(2, "email", {
      handedOff: false,
      mail: { from: "bandar@moedatech.net", recipients: 2, inSentFolder: true },
    });
    expect(
      await screen.findByText(c.mailSent.replace("{from}", "bandar@moedatech.net").replace("{n}", "2")),
    ).toBeTruthy();
    // A server send has no window of its own to prove it happened, so the copy in Sent is stated.
    expect(screen.getByText(c.mailInSent)).toBeTruthy();
  });

  it("still counts the suppliers it reached", async () => {
    draw();
    await waitFor(() => expect(screen.getByTestId("panel")).toBeTruthy());
    hoisted.fire!(1, "email", { handedOff: false, mail: { from: "b@m.net", recipients: 1, inSentFolder: false } });
    expect(await screen.findByText(c.postedLiveOne)).toBeTruthy();
  });
});

describe("a channel that took the browser away", () => {
  it("waits, then tells him when he comes back", async () => {
    draw();
    await waitFor(() => expect(screen.getByTestId("panel")).toBeTruthy());
    hoisted.fire!(1, "email", { handedOff: true });
    // Nothing yet: a compose tab has focus and a dialog raised now would be buried behind it.
    expect(screen.queryByText(c.postedTitle)).toBeNull();

    // The wait is an EFFECT subscribing to `focus`, so let it mount before the event is dispatched —
    // otherwise the test is faster than the listener and proves nothing.
    await act(async () => {});
    fireEvent(window, new Event("focus"));
    expect(await screen.findByText(c.postedTitle)).toBeTruthy();
    // Nothing to claim about an e-mail we did not send.
    expect(screen.queryByText(new RegExp(c.mailInSent))).toBeNull();
  });

  it("Moedatech alone still announces immediately", async () => {
    // Unchanged behaviour, kept honest: no channel, no tab, nothing to wait for.
    draw();
    await waitFor(() => expect(screen.getByTestId("panel")).toBeTruthy());
    hoisted.fire!(0, "none", { handedOff: false });
    expect(await screen.findByText(c.postedTitle)).toBeTruthy();
    expect(screen.getByText(c.postedLive)).toBeTruthy();
  });

  it("announces once — a second channel is not a second request", async () => {
    draw();
    await waitFor(() => expect(screen.getByTestId("panel")).toBeTruthy());
    hoisted.fire!(1, "email", { handedOff: false, mail: { from: "b@m.net", recipients: 1, inSentFolder: true } });
    await screen.findByText(c.postedTitle);
    fireEvent.click(screen.getByText(c.postedKeepSharing));
    await waitFor(() => expect(screen.queryByText(c.postedTitle)).toBeNull());

    hoisted.fire!(1, "whatsapp", { handedOff: true });
    await act(async () => {});
    fireEvent(window, new Event("focus"));
    // Still gone: the panel reports a second channel inline, not with the big tick again.
    await waitFor(() => expect(screen.queryByText(c.postedTitle)).toBeNull());
  });
});

/* ── The queue the page reads (owner, 2026-09-08) ────────────────────────────────── */

/**
 * *"I want the same post-to-Moedatech modal to show the e-mail too, so they are together, then the
 * project modal after them."*
 *
 * `ProjectFiled` mounts on the same phase flip as this card, so the two dialogs raced. `CreateSurface`
 * now holds the project one back while `onAnnouncing` is true — and what these pin is the SIGNAL,
 * since the signal is what decides the order.
 */
describe("what the page is told about the queue", () => {
  it("claims the screen from the post until the tick has been read", async () => {
    const owed: boolean[] = [];
    render(
      <LocaleProvider initialLocale="en">
        <ShareOnPost onAnnouncing={(v) => owed.push(v)} />
      </LocaleProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("panel")).toBeTruthy());
    // Before anything is posted there is nothing to wait for: the project dialog is free to open.
    expect(owed.at(-1)).toBe(false);

    // The post mints the request. The send lands a tick later, so the claim must start HERE — a
    // project dialog opening in that gap would be in front of a tick that has not appeared yet.
    await act(async () => {
      await hoisted.post!();
    });
    expect(owed.at(-1)).toBe(true);

    hoisted.fire!(1, "email", { handedOff: false, mail: { from: "b@m.net", recipients: 1, inSentFolder: true } });
    await screen.findByText(c.postedTitle);
    // Still ours: he is reading it.
    expect(owed.at(-1)).toBe(true);

    fireEvent.click(screen.getByText(c.postedKeepSharing));
    await waitFor(() => expect(owed.at(-1)).toBe(false));
  });

  it("releases the screen when the tick is dismissed by its close, not only by its button", async () => {
    const owed: boolean[] = [];
    render(
      <LocaleProvider initialLocale="en">
        <ShareOnPost onAnnouncing={(v) => owed.push(v)} />
      </LocaleProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("panel")).toBeTruthy());
    await act(async () => {
      await hoisted.post!();
    });
    hoisted.fire!(0, "none", { handedOff: false });
    await screen.findByText(c.postedTitle);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(owed.at(-1)).toBe(false));
  });
});
