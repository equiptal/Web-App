import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { LocaleProvider } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { ar } from "@/lib/i18n/ar";
import { reducer, initialState } from "@/lib/store/rfq-store";
import type { RfqState } from "@/lib/store/rfq-store";
import { defaultProjectDetails, defaultPreferences, newManualItem } from "@/lib/contract";
import type { RfqDraft } from "@/lib/contract";
import { ShareRequestPanel } from "@/components/share/ShareRequestPanel";

/**
 * «Send to this store, or broadcast instead?» — the question the app asks and the web did not.
 *
 * Owner, 2026-09-22: *"check the app when i wanted a direct request, it asks me are u sure direct or
 * broadcast. check it in the app and add it on the web direct request before posting"*.
 *
 * The app (`submit_confirmation_sheet.dart`, opened from `create_request_page._handleSubmit`) raises
 * a sheet on Submit whenever `state.isDirect`: two cards, the store pre-picked, «Broadcast instead»
 * beside it, no Cancel — dismissal posts nothing — and the switch is ONE-WAY
 * (`_onSwitchedToBroadcast` nulls `supplierId`/`supplierName`, flips the type and submits).
 *
 * The web asks the same question inside the confirmation it already draws (owner's pick over a
 * second dialog in front of it), so one press raises one layer.
 */

const api = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));

vi.mock("@/lib/api/client", () => ({
  listRenterSuppliers: () => Promise.resolve(api.rows),
  recordRequestShare: () => Promise.resolve(),
  setBidDeadline: () => Promise.resolve(),
  shareRequestEmail: () => Promise.resolve({ sent: false, reason: "UNAVAILABLE" }),
  mailConnectStatus: () => Promise.resolve({ configured: false, connected: false, provider: null, accountEmail: null, connectedAt: null }),
  mailConnectUrl: () => Promise.resolve(null),
  mailDisconnect: () => Promise.resolve(true),
  updateRenterSupplier: () => Promise.resolve({}),
  bidShareUrl: (id: string) => `https://os.moedatech.net/bid/${id}`,
}));

const c = en.intake.postShare;
const DIRECT = { supplierName: "Zahid Tractor", storeId: "st-1" };

beforeEach(() => {
  api.rows = [{ id: "1", name: "Al Faisal Rentals", email: "ops@alfaisal.sa", phone: "+966501112233", verified: true }];
  vi.stubGlobal("open", vi.fn());
});
afterEach(cleanup);

const onPost = vi.fn(async () => "new-uuid");

const drawPost = (props: Partial<React.ComponentProps<typeof ShareRequestPanel>> = {}) => {
  onPost.mockClear();
  return render(
    <LocaleProvider>
      <ShareRequestPanel mode="post" requestCode="EXC-170845" direct={DIRECT} onPost={onPost} {...props} />
    </LocaleProvider>,
  );
};

/** The Send button on the panel, on the Moedatech-only path this flow lands in by default. */
const pressSend = () => fireEvent.click(screen.getByText(c.postMoedatechOnly).closest("button")!);
const confirmPress = () =>
  fireEvent.click(
    Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find((b) =>
      (b.textContent ?? "").includes(c.confirmDoPostRequest),
    )!,
  );
const option = (label: string) => screen.getByText(label).closest("button")!;

describe("the request is DIRECT, so the press asks who it goes to", () => {
  it("Given Moedatech alone, Then Send asks first rather than posting to the one firm in silence", async () => {
    /**
     * 🔴 The case the web never had. The confirmation has stood in front of an E-MAIL send since
     * 2026-09-07 and in front of nothing else, and a request started from a store is ordinarily sent
     * with no channel at all — so the one press that addressed it to a single supplier asked nothing
     * and could not be called off.
     */
    drawPost();
    await screen.findByText("Al Faisal Rentals");
    pressSend();

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(c.whoReceives)).toBeTruthy();
    expect(screen.getByText("Zahid Tractor")).toBeTruthy();
    expect(screen.getByText(c.destBroadcastInstead)).toBeTruthy();
    // Nothing has happened: the post is behind the confirm press, as it is for the mail.
    expect(onPost).not.toHaveBeenCalled();
  });

  it("Given the store is kept, Then it posts to that supplier alone", async () => {
    drawPost();
    await screen.findByText("Al Faisal Rentals");
    pressSend();
    confirmPress();

    await waitFor(() => expect(onPost).toHaveBeenCalled());
    // The store is PRE-PICKED (app parity), so confirming without touching anything keeps it direct.
    expect(onPost).toHaveBeenCalledWith(false);
  });

  it("Given «Broadcast instead», Then the post is told to drop the one recipient", async () => {
    drawPost();
    await screen.findByText("Al Faisal Rentals");
    pressSend();
    fireEvent.click(option(c.destBroadcastInstead));
    confirmPress();

    await waitFor(() => expect(onPost).toHaveBeenCalled());
    expect(onPost).toHaveBeenCalledWith(true);
  });

  it("Given he cancels, Then nothing is posted — and the next press starts from the store again", async () => {
    /**
     * ⚠️ The reset is the rule `skipEmail` already follows: an answer given on a press he called off
     * must not ride into the next one. Without it a renter who picked broadcast, cancelled, and
     * pressed Send again would broadcast a request he had just decided to keep direct.
     */
    drawPost();
    await screen.findByText("Al Faisal Rentals");
    pressSend();
    fireEvent.click(option(c.destBroadcastInstead));
    fireEvent.click(screen.getByText(c.confirmNo).closest("button")!);
    expect(onPost).not.toHaveBeenCalled();

    pressSend();
    confirmPress();
    await waitFor(() => expect(onPost).toHaveBeenCalledWith(false));
  });

  it("Given a BROADCAST request, Then no question is asked — the press posts, as it always did", async () => {
    /* App parity: `_handleSubmit` submits straight away when `!state.isDirect`. */
    drawPost({ direct: null });
    await screen.findByText("Al Faisal Rentals");
    pressSend();

    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(onPost).toHaveBeenCalled());
  });

  it("Given the request is already LIVE, Then the recipient is not up for discussion", async () => {
    /**
     * A posted request's type is on the row. `share` mode is a second share of something already
     * addressed, so the chooser would offer a change nothing can make.
     */
    render(
      <LocaleProvider>
        <ShareRequestPanel mode="share" requestUuid="abc-123" requestCode="EXC-170845" direct={DIRECT} />
      </LocaleProvider>,
    );
    await screen.findByText("Al Faisal Rentals");
    fireEvent.click(screen.getByText(c.sendMoedatechOnly).closest("button")!);
    expect(screen.queryByText(c.whoReceives)).toBeNull();
  });
});

describe("switching to broadcast keeps the request", () => {
  const draft = (): RfqDraft =>
    ({
      project: defaultProjectDetails(),
      items: [newManualItem("m1")],
      preferences: defaultPreferences(),
      detectedLocations: [],
      summary: { count: 1, categories: [] },
    }) as unknown as RfqDraft;

  const withDraft = (over: Partial<RfqState> = {}): RfqState => ({ ...initialState, phase: "wizard", draft: draft(), ...over });

  it("Given GO_BROADCAST, Then the recipient goes and the draft stays", () => {
    /**
     * 🔴 **This is why it is not `SET_DIRECT` with null.** That case DROPS the draft on purpose — a
     * request written for one firm must not be re-addressed behind the renter's back — and here the
     * draft is exactly what he is keeping: same machine, same site, same dates, one press before it
     * posts. Reaching for `setDirect(null)` would wipe the request he is standing on.
     */
    const before = withDraft({ direct: { supplierId: "412", supplierName: "Zahid", storeId: "st-1" } });
    const after = reducer(before, { t: "GO_BROADCAST" });

    expect(after.direct).toBeNull();
    expect(after.draft).toBe(before.draft);
    expect(after.phase).toBe("wizard");
  });

  it("Given a request that was never direct, Then it is a no-op", () => {
    const before = withDraft();
    expect(reducer(before, { t: "GO_BROADCAST" })).toBe(before);
  });
});

describe("the wire reads the ANSWER, not the store", () => {
  const STORE = fs.readFileSync(path.join(process.cwd(), "src/lib/store/rfq-store.tsx"), "utf8");
  const POST = fs.readFileSync(path.join(process.cwd(), "src/components/create/ShareOnPost.tsx"), "utf8");

  it("Given «broadcast», Then submit builds the payload from its ARGUMENT", () => {
    /**
     * 🔴 The trap this pins. `submit` reads the store through `stateRef.current`, which is written
     * during RENDER — so a caller that dispatched `GO_BROADCAST` and called `submit()` in the same
     * handler would still read the old `direct` and post the request to the firm the renter had just
     * declined. The flag is passed in; the dispatch is only for the screen.
     */
    expect(STORE).toMatch(/const direct = opts\?\.asBroadcast \? null : s\.direct;/);
    expect(STORE).toMatch(/\.\.\.\(direct \? \{ direct \} : \{\}\),/);
    // And the screen follows, so the ribbon above the review stops naming a firm that is not receiving it.
    expect(STORE).toMatch(/if \(opts\?\.asBroadcast && s\.direct\) dispatch\(\{ t: "GO_BROADCAST" \}\);/);
  });

  it("Given the panel's answer, Then the create flow hands it straight to submit", () => {
    expect(POST).toMatch(/const post = async \(asBroadcast\?: boolean\)/);
    expect(POST).toMatch(/actions\.submit\(\{ asBroadcast \}\)/);
  });
});

describe("the words are the app's own", () => {
  it("Given both locales, Then they say what the app's sheet says", () => {
    /**
     * ⚠️ The Arabic is `app_ar.arb`'s `submitConfirmBroadcastInstead` /
     * `submitConfirmBroadcastDescription` verbatim: one question asked at one moment in two products
     * must not be phrased two ways.
     */
    expect(c.destBroadcastInstead).toBe("Broadcast instead");
    expect(c.destBroadcastLine).toBe("Reach all matching suppliers in your area and compare bids");
    expect(ar.intake.postShare.destBroadcastInstead).toBe("البث للجميع بدلاً من ذلك");
    expect(ar.intake.postShare.destBroadcastLine).toBe("تواصل مع جميع الموردين المطابقين في منطقتك وقارن العروض");
  });

  it("Given no mail will leave, Then the title stops promising one", () => {
    /**
     * ~~«Post this request and e-mail it?».~~ That arm is the one case where nothing is e-mailed —
     * Moedatech alone, or an Outlook that is not connected — so the title promised the very thing the
     * block beneath it was explaining would not happen.
     */
    const PANEL = fs.readFileSync(path.join(process.cwd(), "src/components/share/ShareRequestPanel.tsx"), "utf8");
    expect(PANEL).toMatch(/const confirmTitle = uuid \? c\.confirmSendTitle : emailWillGo \? c\.confirmBothTitle : c\.confirmPostAloneTitle;/);
  });
});
