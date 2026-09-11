import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import type { ProjectSummary } from "@/lib/contract/project";

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

/**
 * The tick's title, which since 2026-09-08 states the send as well as the post.
 *
 * ⚠️ It is one of THREE titles: with a server send it names the mailbox, on an off-catalogue
 * request it names no marketplace, and with no send at all it is the bare line.
 */
/**
 * 🔴 **~~The title carried the address.~~** (owner, 2026-09-10: *"even when sent, the successful
 * modal must be clear"*). One 17px sentence held both facts and wrapped to three lines. The title
 * says one thing now, and the destinations are ticked blocks under it, the same two rows he approved
 * in the confirmation a moment earlier.
 */
const titleFrom = (_from: string) => c.postedTitle;

/** The Outlook row of the tick, with the address and the count it really sent to. */
const sentLine = (from: string, n: number) =>
  (n === 1 ? c.mailSentOne : c.mailSent).replace("{from}", from).replace("{n}", String(n));

/** A site the request was filed under, as `ProjectFiled` hands it up. */
const SITE = {
  id: "p-1",
  title: "RGRA",
  location: { label: "RGRA, Riyadh", lat: null, lng: null },
  version: 1,
} as unknown as ProjectSummary;

const draw = (filed: ProjectSummary | null = null) =>
  render(
    <LocaleProvider initialLocale="en">
      <ShareOnPost filed={filed} />
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
    expect(await screen.findByText(titleFrom("bandar@moedatech.net"))).toBeTruthy();
  });

  it("says the e-mail went, from which address", async () => {
    draw();
    await waitFor(() => expect(screen.getByTestId("panel")).toBeTruthy());
    hoisted.fire!(2, "email", {
      handedOff: false,
      mail: { from: "bandar@moedatech.net", recipients: 2, inSentFolder: true },
    });
    /**
     * 🔴 **The title says ONE thing; the destinations are blocks** (owner, 2026-09-10: *"even when
     * sent, the successful modal must be clear"*).
     *
     * This keeps the half of 2026-09-08 that still holds (*"reduce the text, just keep the title"*):
     * there is no paragraph, and the title does not wrap. What it drops is the trick of packing the
     * post AND the send into one 17px sentence, which was read once and skimmed after that.
     */
    expect(await screen.findByText(c.postedTitle)).toBeTruthy();
    // The two places it reached, each as its own ticked row.
    expect(screen.getByText(c.destMoedatech)).toBeTruthy();
    expect(screen.getByText(c.destOutlook)).toBeTruthy();
    // ⚠️ The address and the count ride the Outlook row, with the Sent-folder copy as a clause.
    expect(screen.getByText(new RegExp(sentLine("bandar@moedatech.net", 2)))).toBeTruthy();
    expect(screen.getByText(new RegExp(c.mailInSent))).toBeTruthy();
  });

  it("says nothing under the title but the next step", async () => {
    draw();
    await waitFor(() => expect(screen.getByTestId("panel")).toBeTruthy());
    hoisted.fire!(1, "email", { handedOff: false, mail: { from: "b@m.net", recipients: 1, inSentFolder: false } });
    /* ⚠️ **The count survives only where it is the ONLY thing said** — a channel we did not send
       through. With a server send the title states the address and the count is not worth a line of
       its own; with WhatsApp there is no title to carry it. */
    expect(await screen.findByText(titleFrom("b@m.net"))).toBeTruthy();
    expect(screen.queryByText(c.postedLiveOne)).toBeNull();
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

  it("Given the window was BLOCKED, Then it announces anyway rather than waiting forever", async () => {
    /**
     * 🔴 **A hand-off can be a lie** (owner, 2026-09-08: *"it is showing like nothing happened,
     * even the modal confirming the post didn't appear"*).
     *
     * `openEmailCompose` opens the compose window with `noopener`, which returns NO handle — so a
     * pop-up the browser silently blocked is indistinguishable from one that opened, and the panel
     * reports `handedOff: true` either way. Nothing took focus, this tab never lost visibility, and
     * neither `focus` nor `visibilitychange` ever fired: a live request and no tick.
     */
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      draw();
      await waitFor(() => expect(screen.getByTestId("panel")).toBeTruthy());
      hoisted.fire!(1, "email", { handedOff: true });
      /* ⚠️ The wait is an EFFECT, so let it mount before the clock is moved — otherwise the test
         advances past a timer that has not been set yet and proves nothing. */
      await act(async () => {});
      expect(screen.queryByText(c.postedTitle)).toBeNull();

      // No event, ever. The tab was visible the whole time, because nothing opened.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      expect(screen.getByText(c.postedTitle)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Given the window DID open, Then the floor does not fire under it", async () => {
    /**
     * ⚠️ Not a race with the compose tab. The announcement still refuses while this tab is
     * HIDDEN, and a window that really opened takes focus long before the grace is up — so the only
     * case the floor catches is the one where nothing opened.
     */
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const hidden = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    try {
      draw();
      await waitFor(() => expect(screen.getByTestId("panel")).toBeTruthy());
      hoisted.fire!(1, "email", { handedOff: true });
      await act(async () => {});

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      // He is still in the compose tab. The tick waits for him, as it always did.
      expect(screen.queryByText(c.postedTitle)).toBeNull();

      hidden.mockReturnValue("visible");
      fireEvent(window, new Event("focus"));
      expect(await screen.findByText(c.postedTitle)).toBeTruthy();
    } finally {
      hidden.mockRestore();
      vi.useRealTimers();
    }
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
    await screen.findByText(titleFrom("b@m.net"));
    fireEvent.click(screen.getByText(c.postedKeepSharing));
    await waitFor(() => expect(screen.queryByText(titleFrom("b@m.net"))).toBeNull());

    hoisted.fire!(1, "whatsapp", { handedOff: true });
    await act(async () => {});
    fireEvent(window, new Event("focus"));
    // Still gone: the panel reports a second channel inline, not with the big tick again.
    await waitFor(() => expect(screen.queryByText(c.postedTitle)).toBeNull());
  });
});

/**
 * -- The project, inside the tick (owner, 2026-09-08) -------------------------------------------
 *
 * *"But we have now 2 competing modals... I don't know how to show the 2 modals without distracting
 * or overwhelming him."*
 *
 * 🔴 ~~`ProjectFiled` drew a dialog of its own, queued behind this one with a `hold` flag.~~ One
 * press, two dialogs, and the second arrived after the renter believed he had finished. The filing
 * is a CONSEQUENCE of the post, so it sits under the sentence that announces the post.
 */
describe("the project the request was filed under", () => {
  const o = en.projects.offer;

  it("names the site inside the tick, with the way to open it", async () => {
    draw(SITE);
    await waitFor(() => expect(screen.getByTestId("panel")).toBeTruthy());
    hoisted.fire!(1, "email", { handedOff: false, mail: { from: "b@m.net", recipients: 1, inSentFolder: true } });

    await screen.findByText(titleFrom("b@m.net"));
    expect(screen.getByText(o.filedTitle.replace("{site}", "RGRA"))).toBeTruthy();
    expect(screen.getByText(o.viewAction)).toBeTruthy();
  });

  it("says nothing about a project when there is none", async () => {
    // ⚠️ A request the renter had already filed himself, or a filing that failed. Both are silent
    // by design: the first needs no telling, and the second is a convenience nobody can act on.
    draw(null);
    await waitFor(() => expect(screen.getByTestId("panel")).toBeTruthy());
    hoisted.fire!(0, "none", { handedOff: false });

    await screen.findByText(c.postedTitle);
    expect(screen.queryByText(o.viewAction)).toBeNull();
  });

  it("appears when the write lands, even after the tick is already open", async () => {
    /**
     * ⚠️ The filing is two round trips and the tick opens as soon as the share is handed off, so
     * the block arrives INTO a dialog he is reading. That is the trade for one dialog instead of
     * two, and it is the right way round: the tick answers the button he pressed.
     */
    const { rerender } = draw(null);
    await waitFor(() => expect(screen.getByTestId("panel")).toBeTruthy());
    hoisted.fire!(0, "none", { handedOff: false });
    await screen.findByText(c.postedTitle);
    expect(screen.queryByText(o.viewAction)).toBeNull();

    rerender(
      <LocaleProvider initialLocale="en">
        <ShareOnPost filed={SITE} />
      </LocaleProvider>,
    );
    expect(await screen.findByText(o.viewAction)).toBeTruthy();
  });
});
