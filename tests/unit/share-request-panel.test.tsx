import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { ar } from "@/lib/i18n/ar";
import { defaultTemplate } from "@/lib/shareTemplate";
import { shareMessageHtml } from "@/lib/copyShareMessage";
import { bidCardModel, type BidCardModel } from "@/lib/bidCardModel";
import { ShareRequestPanel } from "@/components/share/ShareRequestPanel";
import type { BidFormData } from "@/lib/contract/link-bids";

/**
 * *Share this request* — the one panel every share surface renders.
 *
 * Three surfaces used to compose their own message, and which one a supplier received depended on
 * which button was pressed. These are the rules that made them one, and the ones the owner named on
 * 2026-09-02: a LIST rather than pills, Moedatech locked on, a preview that can be read before the
 * post, and recipients taken from the ticks.
 */

const api = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  shares: [] as unknown[][],
  /**
   * What SUP-BE-23's endpoint answers. Default: it could not send, which is every renter whose IT
   * has not added the DNS records — and therefore the behaviour every OTHER test in this file has
   * always described. Only the cases below change it.
   */
  mail: { sent: false, reason: "UNAVAILABLE", from: null, domain: null, dns: [], connectPath: null } as Record<string, unknown>,
  mailCalls: [] as unknown[][],
  /**
   * Outlook connection state. Default: this stage has NO Azure app registration, which is what
   * staging answers until one exists, so no Connect button is drawn and every other test in this
   * file sees the panel it has always seen.
   */
  connect: { configured: false, connected: false, provider: null, accountEmail: null, connectedAt: null } as {
    configured: boolean;
    connected: boolean;
    provider: string | null;
    accountEmail: string | null;
    connectedAt: string | null;
  },
  connectUrl: null as string | null,
  disconnected: 0,
}));

vi.mock("@/lib/api/client", () => ({
  listRenterSuppliers: () => Promise.resolve(api.rows),
  recordRequestShare: (...args: unknown[]) => {
    api.shares.push(args);
    return Promise.resolve();
  },
  setBidDeadline: () => Promise.resolve(),
  shareRequestEmail: (...args: unknown[]) => {
    api.mailCalls.push(args);
    return Promise.resolve(api.mail);
  },
  mailConnectStatus: () => Promise.resolve(api.connect),
  mailConnectUrl: () => Promise.resolve(api.connectUrl),
  mailDisconnect: () => {
    api.disconnected += 1;
    api.connect = { configured: true, connected: false, provider: null, accountEmail: null, connectedAt: null };
    return Promise.resolve(true);
  },
  updateRenterSupplier: () => Promise.resolve({}),
  bidShareUrl: (id: string) => `https://os.moedatech.net/bid/${id}`,
}));

const DRAFT: BidFormData = {
  token: "",
  status: "open",
  closedReason: null,
  deadline: null,
  renter: { name: null, contactName: null, city: null, verified: false, logoUrl: null },
  projectTerms: {
    location: "Riyadh, Saudi Arabia",
    lat: null,
    lng: null,
    rentalBasis: "monthly",
    startDate: "2026-09-01",
    endDate: "2026-12-31",
    hoursPerDay: 10,
    workingDaysPerWeek: 6,
    extendable: true,
  },
  contractTerms: [],
  notes: null,
  items: [
    {
      requestItemId: "m1",
      label: "Crawler Excavator",
      size: "20 ton",
      numberOfUnits: 2,
      priceUnit: "PER_MONTH",
      deliveryBy: "RENTER",
      returnBy: "SUPPLIER",
      requiredTerms: { operator: "YES", fuel: "RENTER", fuelType: "diesel" },
    },
  ],
};

const opened = vi.fn();

beforeEach(() => {
  api.shares = [];
  api.mailCalls = [];
  api.mail = { sent: false, reason: "UNAVAILABLE", from: null, domain: null, dns: [], connectPath: null };
  api.connect = { configured: false, connected: false, provider: null, accountEmail: null, connectedAt: null };
  api.connectUrl = null;
  api.disconnected = 0;
  api.rows = [
    { id: "1", name: "Al Faisal Rentals", email: "ops@alfaisal.sa", phone: "+966501112233", verified: true },
    // No address: he is in the list, he is pickable, and he is honestly named as skipped.
    { id: "2", name: "Najd Equipment Est.", email: null, phone: "+966505556677", verified: false },
    // Neither contact — the row that proves the Add follows the CHANNEL rather than the field.
    { id: "3", name: "Hail Heavy Transport", email: null, phone: null, verified: false },
  ];
  opened.mockReset();
  vi.stubGlobal("open", opened);
});
afterEach(cleanup);

const draw = (props: Partial<React.ComponentProps<typeof ShareRequestPanel>> = {}) =>
  render(
    <LocaleProvider>
      <ShareRequestPanel mode="share" requestUuid="abc-123" requestCode="EXC-170845" {...props} />
    </LocaleProvider>,
  );

const c = en.intake.postShare;
const enShare = en.intake.postShare;
const arShare = ar.intake.postShare;

describe("who it goes to", () => {
  it("Given suppliers, Then they are a LIST — each row carrying the address it will be sent to", async () => {
    /**
     * Pills wrap into a shape that changes every time one is picked, so the renter loses his place
     * in his own list — and a pill has no room for the one thing that decides whether a supplier is
     * included at all.
     */
    draw();
    const row = (await screen.findByText("Al Faisal Rentals")).closest("li")!;
    expect(within(row).getByText("ops@alfaisal.sa")).toBeTruthy();

    const missing = screen.getByText("Najd Equipment Est.").closest("li")!;
    expect(within(missing).getByText(c.noEmail)).toBeTruthy();
  });

  it("Given a pick with no address, Then it says he will be left out — before the press", async () => {
    draw();
    fireEvent.click(await screen.findByText("Najd Equipment Est."));
    // No channel is on by default, so the e-mail warning belongs to the e-mail channel.
    fireEvent.click(screen.getByText(c.outlook));
    expect(screen.getByText(c.skipping.replace("{n}", "1"))).toBeTruthy();
  });

  it("Given a preselected row, Then it starts ticked", async () => {
    draw({ preselect: ["1"] });
    const row = (await screen.findByText("Al Faisal Rentals")).closest("li")!;
    expect(within(row).getByRole("checkbox").getAttribute("aria-checked")).toBe("true");
  });
});

describe("how it goes", () => {
  it("Given the channel row, Then Moedatech is there and cannot be turned off", async () => {
    /**
     * It is not a channel the renter chooses, it is where the request goes. Saying so beside the two
     * he DOES choose is what stops him believing that unticking both means nobody sees it.
     */
    draw();
    const mark = await screen.findByAltText("Moedatech");
    expect(mark.closest("button")).toBeNull();

    // With an extra channel on, the line says Moedatech is the floor rather than the whole of it.
    fireEvent.click(screen.getByText(c.outlook));
    /**
     * ⚠️ ~~«Every request goes to Moedatech. You can share it via other channels too.»~~ Removed
     * (owner, 2026-09-06). On every state but one it restated the row directly above it — the chip
     * is locked on and the other buttons are right there — costing a line the supplier list and the
     * preview both wanted.
     */
    expect(screen.queryByText(c.alwaysHint)).toBeNull();
  });

  it("Given e-mail, Then the recipients are the ticked suppliers", async () => {
    draw();
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.outlook));
    fireEvent.click(screen.getByText(c.sendToSuppliers));

    await waitFor(() => expect(opened).toHaveBeenCalled());
    const url = new URL(opened.mock.calls[0][0] as string);
    /**
     * ⚠️ Outlook is the default provider and its compose deeplink carries NO blind list, so the
     * window opens with the message and no recipients — the panel hands the addresses over to paste
     * into Bcc instead (owner, 2026-09-03). Gmail keeps them blind; `compose-email.test.ts` pins that.
     */
    expect(url.searchParams.get("to")).toBeNull();
    expect(url.searchParams.get("bcc")).toBeNull();
    /**
     * `RFQ for <machine>` (owner, 2026-09-03). A supplier's inbox holds forty "new equipment
     * requests"; the subject is where he decides whether to open it, so it names the machine.
     */
    expect(url.searchParams.get("subject")).toContain("RFQ for");
    // ⚠️ And the panel says nothing afterwards: three lines of narration under the button went on
    // 2026-09-03. The pop-up on return carries the one fact he does not already have.
    expect(screen.queryByText(/on the clipboard/i)).toBeNull();
  });

  it("Given nobody is ticked, Then it still sends — the renter addresses it himself", async () => {
    // Owner, 2026-09-02: *"users can share with this template in whatsapp or email without choosing
    // from their suppliers fine."* The compose window opens with the message and no recipient.
    draw();
    await screen.findByText("Al Faisal Rentals");
    fireEvent.click(screen.getByText(c.outlook));
    fireEvent.click(screen.getByText(c.sendToSuppliers));

    await waitFor(() => expect(opened).toHaveBeenCalled());
    const q = new URL(opened.mock.calls[0][0] as string).searchParams;
    expect(q.get("bcc")).toBeNull();
    expect(q.get("to")).toBeNull();
    // Nobody was named, so nothing is recorded against the request.
    expect(api.shares).toHaveLength(0);
  });

  it("Given a pick with no e-mail, Then Send still works — and the request is still POSTED", async () => {
    /**
     * ⚠️ The regression this pins (owner, 2026-09-02: *"nothing happen when i click post and
     * share"*). Send used to be gated on a channel being able to reach somebody, so ticking a
     * supplier with no address quietly disabled the button — and because the post happens on this
     * press, the request was never created either. Four of a typical renter's ten suppliers have no
     * address, so this was not an edge.
     *
     * Moedatech is always a destination. Nothing about who is picked may stop a request existing.
     */
    const posted = vi.fn(async () => "new-uuid");
    render(
      <LocaleProvider>
        <ShareRequestPanel mode="post" draftForm={DRAFT} onPost={posted} />
      </LocaleProvider>,
    );

    // `Najd Equipment Est.` has a phone and no e-mail; E-mail is the channel that is on.
    fireEvent.click(await screen.findByText("Najd Equipment Est."));
    fireEvent.click(screen.getByText(c.outlook));
    const button = screen.getByText(c.sendToSuppliers).closest("button")!;
    expect(button.hasAttribute("disabled")).toBe(false);

    fireEvent.click(button);
    // The request is CREATED, which is the thing the disabled button used to prevent.
    await waitFor(() => expect(posted).toHaveBeenCalled());
  });

  it("Given «More», Then the message goes to the device's own share sheet", async () => {
    // Owner, 2026-09-02: *"must be an option for general share that open any channel."*
    const share = vi.fn(async (_data: { title?: string; text?: string }) => undefined);
    vi.stubGlobal("navigator", { ...navigator, share, clipboard: { writeText: async () => {} } });

    render(
      <LocaleProvider>
        <ShareRequestPanel mode="post" draftForm={DRAFT} onPost={async () => "new-uuid"} />
      </LocaleProvider>,
    );
    // ⚠️ The request is posted FIRST, because *More* only exists once there is a link to hand
    // over — see the «not posted yet» case below.
    await screen.findByText("Al Faisal Rentals");
    fireEvent.click(screen.getByText(c.postMoedatechOnly).closest("button")!);

    // ⚠️ One press: *More* IS the act, so it hands over immediately rather than waiting for Send.
    fireEvent.click(await screen.findByText(c.other));

    await waitFor(() => expect(share).toHaveBeenCalled());
    // The whole message, not the bare link — the same words every other channel carries.
    expect(share.mock.calls[0][0].text).toContain("Crawler Excavator");
  });

  it("Given no share sheet, Then «More» copies the message instead of failing quietly", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, share: undefined, clipboard: { writeText } });

    render(
      <LocaleProvider>
        <ShareRequestPanel mode="post" draftForm={DRAFT} onPost={async () => "new-uuid"} />
      </LocaleProvider>,
    );
    await screen.findByText("Al Faisal Rentals");
    fireEvent.click(screen.getByText(c.postMoedatechOnly).closest("button")!);

    fireEvent.click(await screen.findByText(c.other));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.getByText(c.messageCopied)).toBeTruthy();
  });

  it("Given the request is not posted yet, Then «More» is absent — a look cannot publish it", async () => {
    /**
     * Owner, 2026-09-03: *"clciking more posting the request? it mustn do so."*
     *
     * ⚠️ *More* sends on its own press, and in `post` mode sending MINTS THE REQUEST. So the
     * control that exists to show a renter what channels are available was also the one control
     * that published his request without a second thought — no tick, no Send, no confirmation.
     *
     * The fix is not a confirmation step. *More* hands the OS a URL and before the post there is
     * no URL, so it simply has nothing to offer yet.
     */
    const posted = vi.fn(async () => "new-uuid");
    const share = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, share, clipboard: { writeText: async () => {} } });

    render(
      <LocaleProvider>
        <ShareRequestPanel mode="post" draftForm={DRAFT} onPost={posted} />
      </LocaleProvider>,
    );
    await screen.findByText("Al Faisal Rentals");

    // The two TICKS are there — they choose, they do not send.
    expect(screen.getByText(c.whatsapp)).toBeTruthy();
    expect(screen.getByText(c.outlook)).toBeTruthy();
    // The one control that would have sent is not.
    expect(screen.queryByText(c.other)).toBeNull();
    expect(posted).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
  });

  it("Given the post has happened, Then «More» appears — now there is a link to hand over", async () => {
    // The same panel stays on screen after the post, so the control arrives the moment it is real.
    const share = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, share, clipboard: { writeText: async () => {} } });

    render(
      <LocaleProvider>
        <ShareRequestPanel mode="post" draftForm={DRAFT} onPost={async () => "new-uuid"} />
      </LocaleProvider>,
    );
    await screen.findByText("Al Faisal Rentals");
    fireEvent.click(screen.getByText(c.postMoedatechOnly).closest("button")!);

    await waitFor(() => expect(screen.getByText(c.other)).toBeTruthy());
  });

  it("Given both extras are off, Then it says Moedatech only, and still sends", async () => {
    const posted = vi.fn(async () => "new-uuid");
    /**
     * Owner, 2026-09-02: *"users must be able to send the request only through moedatech without any
     * other channel so they must see that clearly in the ui."* Stated as a fact, not left as the
     * absence of two ticks — a renter must never wonder whether Send does nothing.
     */
    render(
      <LocaleProvider>
        <ShareRequestPanel mode="post" draftForm={DRAFT} onPost={posted} />
      </LocaleProvider>,
    );
    await screen.findByText("Al Faisal Rentals");
    // Nothing is on to begin with, so this IS the Moedatech-only state.
    expect(screen.getByText(c.moedatechOnlyHint)).toBeTruthy();
    const button = screen.getByText(c.postMoedatechOnly).closest("button")!;
    expect(button.hasAttribute("disabled")).toBe(false);

    fireEvent.click(button);
    // No mail window, no WhatsApp: Moedatech alone means nothing else is opened.
    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(opened).not.toHaveBeenCalled();
    /* And the button does NOT become «Share again»: nothing was shared, so offering to repeat it
       would name an act that never happened. `sent` only records real channels. */
    expect(screen.queryByText(c.shareAgain)).toBeNull();
  });

  it("Given a share went out, Then it is recorded against the request", async () => {
    draw();
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.outlook));
    fireEvent.click(screen.getByText(c.sendToSuppliers));

    await waitFor(() => expect(api.shares).toHaveLength(1));
    expect(api.shares[0]).toEqual(["abc-123", ["1"], "email"]);
  });
});

describe("the words around the card", () => {
  /** Post mode, so the card is built from the draft rather than fetched from a link that has none. */
  const drawDraft = () =>
    render(
      <LocaleProvider>
        <ShareRequestPanel mode="post" draftForm={DRAFT} renterName="Shibh Al Jazira" onPost={async () => "new-uuid"} />
      </LocaleProvider>,
    );

  it("Given the default wording, Then his words above, our card, his words below", async () => {
    drawDraft();
    /**
     * ⚠️ ONE box above and one below (owner, 2026-09-05). The greeting and the invitation are a
     * single value, so they are read out of the field rather than found as separate text nodes.
     */
    const above = (await screen.findByLabelText(c.tplAbove)) as HTMLTextAreaElement;
    expect(above.value.startsWith("Hello,")).toBe(true);
    expect(above.value).toContain("invites you to bid");
    expect((screen.getByLabelText(c.tplBelow) as HTMLTextAreaElement).value).toContain("Thanks,");
    // The details sit between them AS THE CARD — the template is greeting, card, sign-off.
    // ⚠️ The mark appears twice on this screen: the locked Moedatech chip and the card's band.
    // The band is identified by its own content, not by a logo the chip also has.
    expect(screen.getAllByAltText("Moedatech").length).toBeGreaterThan(1);
    expect(screen.getByText(/Open the link to submit your bid/)).toBeTruthy();
  });

  it("Given he edits a line, Then it is edited IN the preview, and that is what is sent", async () => {
    /**
     * Owner, 2026-09-02: *"i want the template itself editable and will be reflected in what will
     * be sent."* There is no separate drawer and no separate note box — the thing he reads and the
     * thing he types are one object, which is what makes the preview honest.
     */
    drawDraft();
    const greeting = await screen.findByLabelText(c.tplAbove);
    fireEvent.change(greeting, { target: { value: "Dear partner," } });

    expect((greeting as HTMLTextAreaElement).value).toBe("Dear partner,");
    await waitFor(() => expect(screen.getByText(c.tplReset)).toBeTruthy());
  });

  it("Given the card, Then it is text in the message and never a field", async () => {
    /**
     * Owner, 2026-09-02: *"not the request card itself this is fixed from us."* A renter who could
     * edit it could send a card that disagrees with the request it links to, and the first anyone
     * would know is a withdrawn bid at the deal room.
     */
    drawDraft();
    // Once, in the card, and not a field: a supplier prices what it says.
    const shown = await screen.findAllByText(/Crawler Excavator 20 ton/);
    // Not a field, wherever it appears: a supplier prices what it says.
    expect(shown.every((el) => el.closest("textarea") === null)).toBe(true);
  });

  it("Given the channel, Then the preview follows it with no tabs to press", async () => {
    // The channel row already says which one he is sending; a tab strip asks the same question again.
    drawDraft();
    await screen.findByLabelText(c.tplAbove);

    // Pick e-mail and the e-mail frame is drawn: subject line and From.
    fireEvent.click(screen.getByText(c.outlook));
    expect(screen.getByText(/RFQ for/)).toBeTruthy();

    // ONE channel at a time: pressing WhatsApp is the whole act, and E-mail goes off with it.
    fireEvent.click(screen.getByText(c.whatsapp));
    await waitFor(() => expect(screen.queryByText(/RFQ for/)).toBeNull());
  });
});

describe("finding a supplier", () => {
  it("Given a search, Then the list narrows and the ticks are untouched", async () => {
    draw({ preselect: ["1"] });
    fireEvent.change(await screen.findByLabelText(c.searchSuppliers), { target: { value: "najd" } });

    expect(screen.queryByText("Al Faisal Rentals")).toBeNull();
    expect(screen.getByText("Najd Equipment Est.")).toBeTruthy();
    // Scrolled out of view is still picked — the count says so.
    expect(screen.getByText(c.selected.replace("{n}", "1"))).toBeTruthy();
  });

  it("Given nothing matches, Then it says so rather than showing an empty box", async () => {
    draw();
    fireEvent.change(await screen.findByLabelText(c.searchSuppliers), { target: { value: "zzz" } });
    expect(screen.getByText(c.noMatches)).toBeTruthy();
  });
});

/**
 * The group control is My Suppliers' own menu (owner, 2026-09-03: *"I want to show same group
 * dropdown in the my suppliers, use same component"*). It was a bare `<select>` here and a menu
 * there, for one list and one set of names.
 */
describe("the group filter is the suppliers menu", () => {
  beforeEach(() => {
    api.rows = [
      { id: "1", name: "Al Faisal Rentals", email: "ops@alfaisal.sa", phone: "+966501112233", groups: ["test"] },
      { id: "2", name: "Najd Equipment Est.", email: "bids@najd.sa", phone: null, groups: ["test2"] },
    ];
  });

  it("Given groups, Then the menu lists them with their counts and narrows the list", async () => {
    draw();
    fireEvent.click(await screen.findByText(en.suppliers.allGroups));

    // Every group, and how many suppliers are in it — the rows My Suppliers draws.
    const menu = screen.getByText("test2").closest("span")!;
    expect(within(menu).getByText("1")).toBeTruthy();

    fireEvent.click(screen.getByText("test2"));
    expect(screen.queryByText("Al Faisal Rentals")).toBeNull();
    expect(screen.getByText("Najd Equipment Est.")).toBeTruthy();
  });

  it("Given the picker, Then the menu administers nothing — no pen, no bin, no «New group»", async () => {
    // Renaming and deleting a group belong to the screen that owns the groups. Here it only filters.
    draw();
    fireEvent.click(await screen.findByText(en.suppliers.allGroups));

    expect(screen.queryByTitle(en.suppliers.rename)).toBeNull();
    expect(screen.queryByTitle(en.suppliers.deleteGroup)).toBeNull();
    expect(screen.queryByText(en.suppliers.newGroup)).toBeNull();
  });

  it("Given no groups at all, Then the row carries no group control", async () => {
    api.rows = [{ id: "1", name: "Al Faisal Rentals", email: "ops@alfaisal.sa", phone: null }];
    draw();
    await screen.findByText("Al Faisal Rentals");
    expect(screen.queryByText(en.suppliers.allGroups)).toBeNull();
    expect(screen.queryByText(en.suppliers.createGroup)).toBeNull();
  });
});

describe("one channel at a time (owner, 2026-09-02)", () => {
  it("Given WhatsApp is pressed, Then E-mail goes off — two tabs cannot open on one press", async () => {
    /**
     * ⚠️ The regression this pins. Three independent toggles meant Send could call `window.open`
     * twice in the same tick, and a browser's pop-up blocker swallows the second. The renter watched
     * one window appear, assumed both had, and one channel silently never happened.
     */
    draw();
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.whatsapp));
    fireEvent.click(screen.getByText(c.sendToSuppliers));

    await waitFor(() => expect(opened).toHaveBeenCalledTimes(1));
    expect(String(opened.mock.calls[0][0])).toContain("wa.me");
  });

  it("Given it has already gone out, Then the button offers another channel rather than another post", async () => {
    // Owner: *"he clicks email first and post it then he want to share it to whatsapp."* The link
    // already exists, so a second press is a second CHANNEL, never a second request.
    draw();
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.outlook));
    fireEvent.click(screen.getByText(c.sendToSuppliers));

    // The button renames itself; the three narration lines under it went on 2026-09-03.
    await waitFor(() => expect(screen.getByText(c.shareAgain)).toBeTruthy());

    // And the channel it has used says so, so he can see where it has been.
    expect(screen.getByText(c.outlook).closest("button")!.textContent).toContain("check");
  });

  it("Given the channel row, Then OUTLOOK and GMAIL are the two e-mail buttons", async () => {
    /**
     * Owner, 2026-09-05: *"can u add option for gmail so it is gmail or outlook instead of general
     * email."*
     *
     * ~~One «E-mail» button and a hidden provider, removed on 2026-09-03 when both behaved
     * identically badly.~~ They no longer do. Gmail carries `bcc` in its compose URL, so its window
     * opens with the suppliers in the Bcc line where he can read them, today, with no connection.
     * Outlook discards `bcc` without a word, which is why it has the connector. Handing a Gmail
     * renter an Outlook window was the gap this closes.
     */
    draw();
    expect(await screen.findByText(c.outlook)).toBeTruthy();
    expect(screen.getByText(c.gmail)).toBeTruthy();
  });

  it("Given GMAIL, Then no Microsoft consent is asked for — its window already carries the Bcc", async () => {
    // ⚠️ A consent there would be a detour to solve a problem he does not have.
    api.connect = { configured: true, connected: false, provider: "microsoft", accountEmail: null, connectedAt: null };
    api.connectUrl = "https://login.microsoftonline.com/x";
    api.mail = { sent: false, reason: "UNAVAILABLE", from: null, domain: null, dns: [], connectPath: null };

    draw({ draftForm: DRAFT });
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.gmail));
    fireEvent.click(screen.getByText(c.sendToSuppliers).closest("button")!);

    await waitFor(() => expect(opened).toHaveBeenCalled());
    const urls = opened.mock.calls.map((call) => String(call[0]));
    expect(urls.some((u) => u.includes("login.microsoftonline.com"))).toBe(false);
    // And the recipients really are on the Gmail window, which is the whole point.
    expect(urls.some((u) => u.includes("mail.google.com") && u.includes("bcc="))).toBe(true);
  });
});

describe("the link preview (owner, 2026-09-02)", () => {
  const drawDraft = () =>
    render(
      <LocaleProvider>
        <ShareRequestPanel mode="post" draftForm={DRAFT} renterName="Shibh Al Jazira" onPost={async () => "u"} />
      </LocaleProvider>,
    );

  it("Given WhatsApp, Then the card is drawn — because WhatsApp really draws one", async () => {
    /**
     * *"why in the preview i dont see like the link preview itself."* It used to need the URL, which
     * does not exist until the request does — so the one thing a supplier actually sees was missing
     * from the screen where the renter decides whether to send it. Everything on the card but the
     * picture comes from the draft and is already correct.
     */
    drawDraft();
    fireEvent.click(await screen.findByText(c.whatsapp));

    /**
     * The band is DRAWN, not stood in for. `/bid/<token>/og` needs a token; the generic file it
     * fell back to is a navy rectangle with the logo and nothing else, so the half of the card a
     * supplier sees first was the one part of the preview that was untrue.
     */
    await waitFor(() => expect(screen.getAllByAltText("Moedatech").length).toBeGreaterThan(1));
    expect(document.querySelector('img[src="/og-bid.png"]')).toBeNull();
    // ⚠️ The mark appears twice on this screen: the locked Moedatech chip and the card's band.
    // The band is identified by its own content, not by a logo the chip also has.
    expect(screen.getAllByAltText("Moedatech").length).toBeGreaterThan(1);
    expect(screen.getByText(/Open the link to submit your bid/)).toBeTruthy();
  });

  it("Given E-MAIL, Then the card is still the template — and the panel says what arrives today", async () => {
    /**
     * Owner, 2026-09-03: *"greetings, {name} invites you to bid on my equipment request, then the
     * card with the details and link, then at the end the renter name with thanks — that's it no
     * more no less."* The template is the template in every channel.
     *
     * What differs is the DOOR, and that is said outside the message rather than by drawing a
     * different template: a compose URL carries `text/plain`, so e-mail gets these details as words
     * until a mailbox is connected.
     */
    drawDraft();
    fireEvent.click(await screen.findByText(c.outlook));

    // Same template, same card, whichever channel is chosen — no per-channel caveat on the message.
    // ⚠️ The mark appears twice on this screen: the locked Moedatech chip and the card's band.
    // The band is identified by its own content, not by a logo the chip also has.
    expect(screen.getAllByAltText("Moedatech").length).toBeGreaterThan(1);
    expect(screen.getByText(/Open the link to submit your bid/)).toBeTruthy();
  });
});

describe("what rides the clipboard on an e-mail send", () => {
  it("Given an e-mail send, Then the addresses are OFFERED rather than taken", async () => {
    /**
     * The provider choice is gone (owner, 2026-09-03: *"remove the outlook or gmail option"*), so
     * there is one composer and it is Outlook's deeplink, which discards `bcc`. The one thing it
     * cannot carry is the recipients, and that paste is real.
     *
     * ⚠️ ~~It used to be written to the clipboard by the SEND.~~ Silently, and the clipboard holds
     * one thing, so it destroyed whatever the renter had just copied with no word on screen (owner,
     * 2026-09-05: *"there is a copy of the link and copy of the email, different ones"*). Now the
     * send touches nothing and the addresses wait behind a button.
     */
    const writeText = vi.fn(async (_t: string) => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

    render(
      <LocaleProvider>
        <ShareRequestPanel mode="post" draftForm={DRAFT} renterName="Shibh Al Jazira" onPost={async () => "u"} />
      </LocaleProvider>,
    );
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.outlook));
    fireEvent.click(screen.getByText(c.sendToSuppliers));

    await waitFor(() => expect(opened).toHaveBeenCalled());
    // The send itself left the clipboard alone.
    expect(writeText).not.toHaveBeenCalled();
    // And the paste it DOES need is one press away, with the right value behind it.
    fireEvent.click(await screen.findByText(c.copyAddresses));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("ops@alfaisal.sa"));
  });

  it("Given he never pastes, Then what he sends is still a complete message", async () => {
    // The body stands on its own: every fact, the link last. Nothing is worse for skipping the paste.
    render(
      <LocaleProvider>
        <ShareRequestPanel mode="post" draftForm={DRAFT} renterName="Shibh Al Jazira" onPost={async () => "u"} />
      </LocaleProvider>,
    );
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.outlook));
    fireEvent.click(screen.getByText(c.sendToSuppliers));

    await waitFor(() => expect(opened).toHaveBeenCalled());
    const body = new URL(String(opened.mock.calls[0][0])).searchParams.get("body")!;
    expect(body).toContain("Crawler Excavator");
    expect(body).toContain("Riyadh");
    expect(body.trimEnd().endsWith("/bid/u")).toBe(true);
  });
});

describe("the preview says what is SENT, not what is stored", () => {
  it("Given a company name, Then the preview shows it — never the raw {name}", async () => {
    /**
     * ⚠️ The template stores `{name}`, which is what he must see to edit it. A preview that reads
     * *"{name} invites you to bid"* is showing him a message nobody receives — the exact gap between
     * preview and send this panel exists to close. Resolved when the field is idle; raw the moment
     * he clicks in.
     */
    render(
      <LocaleProvider>
        <ShareRequestPanel mode="post" draftForm={DRAFT} renterName="Shibh Al Jazira" onPost={async () => "u"} />
      </LocaleProvider>,
    );

    const above = (await screen.findByLabelText(c.tplAbove)) as HTMLTextAreaElement;
    // ⚠️ ONE box now (owner, 2026-09-05), so the greeting and the invitation are one value.
    expect(above.value).toBe("Hello,\n\nShibh Al Jazira invites you to bid on my equipment request.");
    expect(above.value).not.toContain("{name}");

    // Clicking in hands him the token back, because that is the thing he edits.
    fireEvent.focus(above);
    await waitFor(() => expect((screen.getByLabelText(c.tplAbove) as HTMLTextAreaElement).value).toContain("{name}"));
  });

  it("Given no company name, Then the default reads properly instead of losing a word", async () => {
    render(
      <LocaleProvider>
        <ShareRequestPanel mode="post" draftForm={DRAFT} onPost={async () => "u"} />
      </LocaleProvider>,
    );
    const above = (await screen.findByLabelText(c.tplAbove)) as HTMLTextAreaElement;
    expect(above.value).toBe("Hello,\n\nYou are invited to bid on my equipment request.");
  });

  it("Given the details, Then they appear ONCE — as the card, not as the card AND the text", async () => {
    /**
     * Owner: *"so request details is duplicated in the card and in the text itslef?"* Yes, twice
     * over: the same facts as a text block, then again as a card underneath.
     *
     * They were never two things — one request, two renderings, and which one a supplier meets
     * depends on his app. The preview draws the richer one, in the place the details belong, and
     * says underneath what arrives where a card cannot.
     */
    render(
      <LocaleProvider>
        <ShareRequestPanel mode="post" draftForm={DRAFT} renterName="Shibh Al Jazira" onPost={async () => "u"} />
      </LocaleProvider>,
    );
    await screen.findByLabelText(c.tplAbove);

    /**
     * The details block names the machine ONCE. The subject line names it too since 2026-09-03
     * (`RFQ for <machine>`), which is a different sentence in a different place — what must not
     * happen is the same facts twice inside the message.
     */
    /**
     * ONE rendering of the details, and it is the card. The message used to state its own contents
     * twice — a text block, then the card underneath — which is what the owner kept reading as
     * duplication, and he was right: nobody designs a letter that says everything twice.
     */
    expect(screen.getAllByText(/Crawler Excavator 20 ton · with operator/, { selector: "div" })).toHaveLength(1);
  });
});

describe("the panel narrates nothing after a send (owner, 2026-09-03)", () => {
  it("Given a send, Then no running commentary is left under the button", async () => {
    /**
     * ~~«Your e-mail opened with 1 suppliers» — «Your suppliers are on the clipboard, press Ctrl+V»
     * — «Pick another channel above and press again».~~ *"remove this it isnt even working."*
     *
     * Three lines describing a window the renter is already looking at, one of them counting a send
     * we cannot observe. What he does not already know is that the request is POSTED, and the
     * pop-up on his return says exactly that — see `ShareOnPost`.
     */
    draw();
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.outlook));
    fireEvent.click(screen.getByText(c.sendToSuppliers));

    await waitFor(() => expect(opened).toHaveBeenCalled());
    expect(screen.queryByText(/on the clipboard/i)).toBeNull();
    expect(screen.queryByText(/opened with/i)).toBeNull();
    expect(screen.queryByText(/Pick another channel/i)).toBeNull();
  });
});

describe("the Add action belongs to the channel (owner, 2026-09-03)", () => {
  it("Given no channel, Then a row states both contacts and offers neither", async () => {
    draw();
    const row = (await screen.findByText("Najd Equipment Est.")).closest("li")!;

    // Both stated — he has not said how he is sending, so he is not being asked to fix anything.
    expect(within(row).getByText(c.noEmail)).toBeTruthy();
    expect(within(row).queryByText(c.addEmail)).toBeNull();
    expect(within(row).queryByText(c.addPhone)).toBeNull();
  });

  it("Given WhatsApp, Then a row with no number offers Add phone", async () => {
    draw();
    await screen.findByText("Al Faisal Rentals");
    fireEvent.click(screen.getByText(c.whatsapp));

    // Hail has neither contact — with WhatsApp chosen it is the NUMBER it is asked for.
    const noContact = screen.getByText("Hail Heavy Transport").closest("li")!;
    expect(within(noContact).getByText(c.addPhone)).toBeTruthy();
    expect(within(noContact).queryByText(c.addEmail)).toBeNull();
  });

  it("Given MORE, Then no contact is asked for at all", async () => {
    /**
     * ⚠️ *More* hands the message to the device's own share sheet, which picks its own recipient.
     * A missing address is not a gap there — it is simply not ours to ask for. The first cut fell
     * through to the e-mail branch and offered «Add e-mail» on a channel that never uses one.
     */
    draw();
    await screen.findByText("Al Faisal Rentals");
    fireEvent.click(screen.getByText(c.other));

    expect(screen.queryByText(c.addEmail)).toBeNull();
    expect(screen.queryByText(c.addPhone)).toBeNull();
  });

  it("Given WhatsApp, Then a row missing a NUMBER offers Add phone, not Add e-mail", async () => {
    // It only ever offered an address, so a renter about to use WhatsApp was pointed at the wrong
    // field entirely.
    draw();
    await screen.findByText("Najd Equipment Est.");
    fireEvent.click(screen.getByText(c.whatsapp));

    // `Al Faisal Rentals` has both, so no Add appears on it either way.
    const hasBoth = screen.getByText("Al Faisal Rentals").closest("li")!;
    expect(within(hasBoth).queryByText(c.addPhone)).toBeNull();

    // `Najd` has a number and no address — so with WhatsApp chosen it needs nothing, and the
    // e-mail prompt that used to sit there is gone.
    const najd = screen.getByText("Najd Equipment Est.").closest("li")!;
    expect(within(najd).queryByText(c.addEmail)).toBeNull();
    expect(within(najd).getByText("+966505556677")).toBeTruthy();
  });
});

describe("what onShared tells the caller (owner, 2026-09-03)", () => {
  it("Given a channel opened, Then the caller is told WHICH — so it can wait for him to come back", async () => {
    /**
     * *"the send must go to the channel directly before seeing the sucess popup, success shown when
     * he is back on the web."*
     *
     * The panel hands the message off and a new tab takes focus a few milliseconds later. A caller
     * that announces immediately draws its dialog and has it buried. `channel` is passed so the
     * caller can hold the announcement until this tab is visible again — and so it knows the one
     * case where nothing opened at all.
     */
    const onShared = vi.fn();
    render(
      <LocaleProvider>
        <ShareRequestPanel mode="share" requestUuid="abc-123" onShared={onShared} />
      </LocaleProvider>,
    );
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.outlook));
    fireEvent.click(screen.getByText(c.sendToSuppliers));

    await waitFor(() => expect(onShared).toHaveBeenCalled());
    expect(onShared.mock.calls[0][1]).toBe("email");
  });

  it("Given Moedatech alone, Then the channel is «none» — nothing opened, so nothing to return from", async () => {
    const onShared = vi.fn();
    render(
      <LocaleProvider>
        <ShareRequestPanel mode="share" requestUuid="abc-123" onShared={onShared} />
      </LocaleProvider>,
    );
    await screen.findByText("Al Faisal Rentals");
    fireEvent.click(screen.getByText(c.sendMoedatechOnly));

    await waitFor(() => expect(onShared).toHaveBeenCalled());
    expect(onShared.mock.calls[0][1]).toBe("none");
  });
});

describe("copying", () => {
  it("Given Copy, Then the clipboard holds the LINK and nothing else", async () => {
    /**
     * Owner, 2026-09-02: *"copy link must only copy the linkl not the message."* It briefly copied
     * the whole message, which made the one control a renter reaches for when he needs a URL — a
     * CRM field, a purchase order — hand him four paragraphs. The template still travels: every
     * app that unfurls a link draws the card from the URL itself.
     */
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

    draw();
    fireEvent.click(await screen.findByLabelText(c.copy));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    // The URL, whole and alone: no greeting, no card, nothing to trim out of a CRM field.
    expect(writeText.mock.calls[0][0]).toMatch(/^https?:\/\/\S+\/bid\/abc-123$/);
  });
});

describe("what they receive", () => {
  it("Given a draft and no link yet, Then the message can still be read", async () => {
    /**
     * The frame used to be empty until the request was posted — a renter approving a message he
     * could not see, whose only chance to change it came once the request was live.
     */
    render(
      <LocaleProvider>
        <ShareRequestPanel mode="post" draftForm={DRAFT} onPost={async () => "new-uuid"} />
      </LocaleProvider>,
    );

    expect((await screen.findAllByText(/Crawler Excavator 20 ton/)).length).toBeGreaterThan(0);
    // Honest about the one thing that is genuinely missing.
    /**
     * Locked, and drawn as locked where the link will sit IN the message. The field above now shows
     * the shape of the coming link (host, a stub, stars) rather than this sentence, so there is one
     * of these, not two.
     */
    expect(screen.getByText(c.linkMasked)).toBeTruthy();
    expect(screen.getByLabelText(c.copy).closest("button")!.hasAttribute("disabled")).toBe(true);
  });

  it("Given no equipment yet, Then it says so rather than drawing an empty card", async () => {
    render(
      <LocaleProvider>
        <ShareRequestPanel mode="post" draftForm={null} onPost={async () => null} />
      </LocaleProvider>,
    );
    expect(await screen.findByText(c.previewEmpty)).toBeTruthy();
  });
});

/**
 * ── We send it ourselves when we may (SUP-BE-23) ────────────────────────────────────────────────
 *
 * The compose window exists because a query string is characters with no MIME type: that one fact
 * is why Gmail can never build a card from the body, and why Outlook silently discards `bcc`. When
 * the renter's domain is verified, nothing opens at all — the mail leaves from his own address with
 * the card in it and his suppliers in blind copy.
 */
describe("the mail we send ourselves", () => {
  const sendByEmail = async () => {
    draw();
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.outlook));
    fireEvent.click(screen.getByText(c.sendToSuppliers).closest("button")!);
  };

  it("Given a verified domain, Then NO compose window opens and the send is stated", async () => {
    /**
     * ⚠️ This is the one outcome on this panel the renter cannot see for himself. Every other press
     * puts a window in front of him; this one puts nothing, so silence would read as a dead button.
     */
    api.mail = { sent: true, from: "bandar@shibhaljazira.com", via: "ses", recipients: 1, messageId: "0100-abc", inSentFolder: false, skipped: 0 };
    await sendByEmail();

    await waitFor(() => expect(screen.getByText(/bandar@shibhaljazira\.com/)).toBeTruthy());
    expect(opened).not.toHaveBeenCalled();
  });

  it("Given WE sent it, Then no DECLARED share is recorded on top of it", async () => {
    /**
     * ⚠️ The backend writes that row itself, stamped with the SES message id — a send it can prove.
     * Recording a second one here would file a claim that the renter declared the same send from
     * his own client, which is a different fact and not a true one.
     */
    api.mail = { sent: true, from: "b@x.sa", via: "ses", recipients: 1, messageId: "m", inSentFolder: false, skipped: 0 };
    await sendByEmail();

    await waitFor(() => expect(api.mailCalls).toHaveLength(1));
    expect(api.shares).toHaveLength(0);
  });

  it("Given it could not send, Then the compose window opens exactly as before", async () => {
    // Nothing regresses for a renter whose IT has not added the records: this is today's behaviour,
    // chosen by a FIELD in the answer rather than by catching an error.
    api.mail = { sent: false, reason: "DOMAIN_NOT_VERIFIED", from: "b@x.sa", domain: "x.sa", dns: [] };
    await sendByEmail();

    await waitFor(() => expect(opened).toHaveBeenCalled());
    expect(api.shares).toHaveLength(1);
  });

  it("Given an unverified domain, Then the records his IT adds are on screen", async () => {
    api.mail = {
      sent: false,
      reason: "DOMAIN_NOT_VERIFIED",
      from: "bandar@shibhaljazira.com",
      domain: "shibhaljazira.com",
      dns: [{ type: "CNAME", name: "abc._domainkey.shibhaljazira.com", value: "abc.dkim.amazonses.com" }],
    };
    await sendByEmail();

    await waitFor(() => expect(screen.getByText("abc._domainkey.shibhaljazira.com")).toBeTruthy());
    expect(screen.getByText("abc.dkim.amazonses.com")).toBeTruthy();
    // ⚠️ Framed as an improvement, never as a failure: his message HAS already gone to his own
    // compose window, and telling him otherwise sends him chasing IT mid-share.
    expect(opened).toHaveBeenCalled();
  });

  it("Given a personal address, Then it says so and offers NO records to chase", async () => {
    /**
     * ⚠️ Nobody can add a DNS record to `gmail.com`. Showing this renter a list to forward to IT
     * would be an errand with no end, so the refusal is its own reason and its own sentence.
     */
    api.mail = { sent: false, reason: "PERSONAL_DOMAIN", from: "bandar@gmail.com", domain: "gmail.com", dns: [] };
    await sendByEmail();

    await waitFor(() => expect(screen.getByText(c.mailPersonal)).toBeTruthy());
    expect(screen.queryByText(c.mailSetupCopy)).toBeNull();
    expect(opened).toHaveBeenCalled();
  });

  it("Given the fallback ran, Then he can open his e-mail again himself", async () => {
    /**
     * ⚠️ `window.open` needs a live user gesture and this one fires AFTER an await on the mail API.
     * Safari can refuse it, and `noopener` makes `window.open` return null by spec — so a refusal
     * cannot be detected. The button is therefore always offered rather than only when something
     * looks wrong.
     */
    api.mail = { sent: false, reason: "UNAVAILABLE", from: null, domain: null, dns: [] };
    await sendByEmail();

    const again = await screen.findByText(c.mailOpenInstead);
    opened.mockReset();
    fireEvent.click(again);
    expect(opened).toHaveBeenCalled();
  });

  it("Given WhatsApp, Then the mail API is not called at all", async () => {
    draw();
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.whatsapp));
    fireEvent.click(screen.getByText(c.sendToSuppliers).closest("button")!);

    await waitFor(() => expect(opened).toHaveBeenCalled());
    expect(api.mailCalls).toHaveLength(0);
  });
});

/**
 * ── One language per message, and the renter picks it (owner, 2026-09-03) ───────────────────────
 *
 * *"i want one language in the same template, user has toggle on the preview to use arabic or
 * english but they are separate."*
 *
 * A renter reading Moedatech in English writes to a supplier who reads Arabic, and the reverse is
 * just as common. The message's language is therefore its own choice, and it is ONE choice: the
 * greeting, the card, the picture and the subject all take it.
 */
describe("the message's language", () => {
  it("Given the toggle, Then the whole template switches — not part of it", async () => {
    draw({ draftForm: DRAFT });
    await screen.findByText("Al Faisal Rentals");

    // It starts in the interface's language, which is the best guess anyone has.
    const above = () => (screen.getByLabelText(c.tplAbove) as HTMLTextAreaElement).value;
    expect(above()).toContain("Hello,");
    expect(above()).toContain("bid on my equipment request");

    fireEvent.click(screen.getByText("العربية"));

    await waitFor(() => expect(above()).toContain("مرحباً،"));
    // And the English wording is gone rather than sitting beside it.
    expect(above()).not.toContain("bid on my equipment request");
  });

  it("Given Arabic is chosen, Then the CARD PICTURE is asked for in Arabic too", async () => {
    /**
     * ⚠️ This is the bug that started it, found against live staging on 2026-09-03: an English
     * message carrying a card image that read «حفار 20 طن · مع مشغّل ×2». The picture's language was
     * decided by an endpoint whose default is the OPPOSITE of the image route's, and nobody was
     * passing a language down — so there was no neutral fallback, only the wrong one.
     */
    const seen: string[] = [];
    /**
     * The preview must ANSWER, or `useBidCard` clears the card and the frame (with the toggle
     * inside it) never draws — a 404 here would make the test pass on an empty column.
     */
    const preview = {
      title: "T",
      description: "D",
      en: { title: "T", description: "D" },
      ar: { title: "ت", description: "د" },
      imageUrl: "",
    };
    vi.stubGlobal("fetch", async (url: string) => {
      seen.push(String(url));
      return String(url).includes("/preview")
        ? { ok: true, status: 200, json: async () => preview }
        : { ok: false, status: 404, json: async () => ({}) };
    });

    // ⚠️ A real UUID: the card only loads for a link whose token parses, so a placeholder id
    // would make this test pass by fetching nothing.
    // A draft supplies the card, so the frame (and the toggle inside it) exists while fetch 404s.
    draw({ requestUuid: "a319541b-9762-43dd-a3d2-030bf3a3850d", draftForm: DRAFT });
    await screen.findByText("Al Faisal Rentals");
    // On mount it asks in the interface's language.
    await waitFor(() => expect(seen.some((u) => u.includes("/preview?lang=en"))).toBe(true));

    // ⚠️ The toggle lives INSIDE the card now, so a frame has to be on screen to reach it.
    fireEvent.click(screen.getByText(c.outlook));
    fireEvent.click(await screen.findByText("العربية"));
    await waitFor(() => expect(seen.some((u) => u.includes("/preview?lang=ar"))).toBe(true));
  });
});


/**
 * ── Connecting the renter's own Outlook (SUP-BE-23, the Graph path) ─────────────────────────────
 *
 * The DNS route puts his address in a `From` line by proving his COMPANY owns the domain, which
 * needs his IT. This one proves it by his own mailbox, which needs one press from him. Same result
 * in the message; a different person has to act.
 */
describe("connecting Outlook", () => {
  const pickEmail = async () => {
    draw();
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.outlook));
  };

  it("Given a stage with no app registration, Then nothing is offered", async () => {
    /**
     * ⚠️ `configured` and `connected` are two different facts. Reading `!connected` alone would draw
     * a Connect button on every stage that has no Azure registration, and it would lead nowhere:
     * `authorize` answers `NOT_CONFIGURED` and there is no consent screen to reach.
     */
    api.connect = { configured: false, connected: false, provider: null, accountEmail: null, connectedAt: null };
    await pickEmail();

    await waitFor(() => expect(screen.getByText(c.outlook)).toBeTruthy());
    expect(screen.queryByText(c.mailConnect)).toBeNull();
  });

  it("Given he only TICKED e-mail, Then nothing about Microsoft is on screen yet", async () => {
    /**
     * ⚠️ Owner, 2026-09-05: *"this isnt here, when i click email and send to suppliers then it
     * will ask to connect just the normal flow."* Offered on the tick, it put a paragraph about
     * consent in front of a renter who had not asked to send anything, above the button he was
     * reaching for.
     */
    api.connect = { configured: true, connected: false, provider: "microsoft", accountEmail: null, connectedAt: null };
    await pickEmail();

    await waitFor(() => expect(screen.getByText(c.outlook)).toBeTruthy());
    expect(screen.queryByText(c.mailConnect)).toBeNull();
  });

  it("Given the send was refused, Then the offer appears — at the moment it answers a question", async () => {
    api.connect = { configured: true, connected: false, provider: "microsoft", accountEmail: null, connectedAt: null };
    api.mail = {
      sent: false,
      reason: "NOT_CONNECTED",
      from: "bandar@zahid.sa",
      domain: "zahid.sa",
      dns: [],
      connectPath: "/agents/mail-connect/authorize",
    };
    await pickEmail();
    fireEvent.click(screen.getByText(c.sendToSuppliers).closest("button")!);

    await waitFor(() => expect(screen.getByText(c.mailConnect)).toBeTruthy());
    // And the share still went out the old way while he decides.
    expect(opened).toHaveBeenCalled();
  });

  it("Given he is connected, Then it says which address, and offers to disconnect", async () => {
    api.connect = { configured: true, connected: true, provider: "microsoft", accountEmail: "bandar@zahid.sa", connectedAt: null };
    await pickEmail();

    await waitFor(() => expect(screen.getByText(/bandar@zahid\.sa/)).toBeTruthy());
    fireEvent.click(screen.getByText(c.mailDisconnect));
    await waitFor(() => expect(api.disconnected).toBe(1));
  });

  it("Given the token was dropped, Then the button says RECONNECT rather than connect", async () => {
    api.connect = { configured: true, connected: false, provider: "microsoft", accountEmail: null, connectedAt: null };
    api.mail = {
      sent: false,
      reason: "RECONNECT_REQUIRED",
      from: "bandar@zahid.sa",
      domain: "zahid.sa",
      dns: [],
      connectPath: "/agents/mail-connect/authorize",
    };
    await pickEmail();
    fireEvent.click(screen.getByText(c.sendToSuppliers).closest("button")!);

    await waitFor(() => expect(screen.getByText(c.mailReconnect)).toBeTruthy());
    // And the share still went out the old way while he sorts it out.
    expect(opened).toHaveBeenCalled();
  });

  it("Given Graph sent it, Then it says the copy is in his Sent folder", async () => {
    /**
     * ⚠️ Only on the Graph path. SES sends AS him without touching his mailbox, so there is no copy
     * there, and saying otherwise sends him looking for something that does not exist.
     */
    api.mail = { sent: true, from: "bandar@zahid.sa", via: "graph", recipients: 2, messageId: null, inSentFolder: true, skipped: 0 };
    await pickEmail();
    fireEvent.click(screen.getByText(c.sendToSuppliers).closest("button")!);

    await waitFor(() => expect(screen.getByText(c.mailInSent)).toBeTruthy());
    expect(opened).not.toHaveBeenCalled();
  });

  it("Given SES sent it, Then it does NOT claim a Sent folder copy", async () => {
    api.mail = { sent: true, from: "bandar@zahid.sa", via: "ses", recipients: 2, messageId: "0100-x", inSentFolder: false, skipped: 0 };
    await pickEmail();
    fireEvent.click(screen.getByText(c.sendToSuppliers).closest("button")!);

    await waitFor(() => expect(screen.getByText(/bandar@zahid\.sa/)).toBeTruthy());
    expect(screen.queryByText(c.mailInSent)).toBeNull();
  });

  it("Given some picks had no address, Then the left-out are counted rather than hidden", async () => {
    // A count that quietly omits them is how a renter comes to believe eight people were written to.
    api.mail = { sent: true, from: "b@x.sa", via: "graph", recipients: 1, messageId: null, inSentFolder: true, skipped: 2 };
    await pickEmail();
    fireEvent.click(screen.getByText(c.sendToSuppliers).closest("button")!);

    await waitFor(() => expect(screen.getByText(new RegExp(String(2)))).toBeTruthy());
  });
});


/**
 * ── The preview IS the message (owner, 2026-09-05) ──────────────────────────────────────────────
 *
 * *"make sure the preview now is same as the one will be sent in the outlook really."*
 *
 * It was not. `shareMessageHtml` sends greeting, intro, card, THE POINTS, sign-off, link. The
 * preview drew greeting, intro, card, sign-off: no points, no link. A renter approved a message
 * whose entire middle he had never seen, and the terms a supplier prices against were the part
 * missing.
 *
 * These pin the pieces rather than the markup, so wording and styling stay free to change and the
 * ORDER and the PRESENCE cannot.
 */
describe("the preview and the sent e-mail carry the same message", () => {
  const model: BidCardModel = {
    ref: "CEX-020902",
    imageHeadline: "Excavator 20 ton · with operator ×2",
    cardTitle: "Excavator 20 ton · with operator ×2",
    items: [],
    where: "Diriyah · 4 months & extendable",
    terms: [
      { label: "Mobilization", value: "On Renter" },
      { label: "Fuel", value: "On Supplier · diesel" },
    ],
    closing: "Bidding closes 12 Sep 2026",
    accepting: true,
    cta: "Submit your bid",
  };

  const URL_ = "https://os.moedatech.net/bid/abc-123";

  it("Given the sent HTML, Then it carries greeting, card, POINTS, sign-off and the link, in that order", () => {
    const html = shareMessageHtml(model, URL_, `${URL_}/og`, { renterName: "Shibh Al Jazira", lang: "en" });

    const at = (needle: string) => {
      const i = html.indexOf(needle);
      expect(i, `missing from the sent e-mail: ${needle}`).toBeGreaterThan(-1);
      return i;
    };

    // ⚠️ «Mobilization» is the piece that was absent from the preview. It is a term a supplier
    // prices against, so a preview without it is a preview of a different message.
    expect(at("Hello,")).toBeLessThan(at("invites you to bid"));
    expect(at("invites you to bid")).toBeLessThan(at("Excavator 20 ton"));
    expect(at("Excavator 20 ton")).toBeLessThan(at("Mobilization"));
    expect(at("Mobilization")).toBeLessThan(at("Thanks,"));
    expect(html.lastIndexOf(URL_)).toBeGreaterThan(at("Thanks,"));
  });

  it("Given the panel's preview, Then every one of those pieces is on screen", async () => {
    /**
     * ⚠️ The card renders as ARTWORK here, which is the path that was wrong: the text fallback
     * (`parts.card`) always carried the points, so the gap only appeared once a real card existed,
     * which is every posted request.
     */
    draw({ draftForm: DRAFT });
    await screen.findByText("Al Faisal Rentals");

    const sent = shareMessageHtml(
      bidCardModel(null, { title: "", description: "" }, "en", DRAFT),
      "https://os.moedatech.net/bid/abc-123",
      "",
      { lang: "en" },
    );

    // Whatever the sent message says about the transport legs, the preview says it too.
    for (const piece of ["Mobilization", "Demobilization", "Fuel"]) {
      expect(sent).toContain(piece);
      expect(screen.getAllByText(new RegExp(piece)).length, `${piece} missing from the preview`).toBeGreaterThan(0);
    }
  });

  it("Given no link yet, Then the preview shows the mask where the link will go", async () => {
    // Before the post there is no URL, so the placeholder stands in its place rather than the line
    // simply being absent: the renter must see that a link is part of what he is sending.
    draw({ mode: "post", requestUuid: null, draftForm: DRAFT, onPost: async () => "new-uuid" });
    await screen.findByText("Al Faisal Rentals");

    expect(screen.getByText(c.linkMasked)).toBeTruthy();
  });
});


/**
 * ── Copy message: the channel nothing can block (owner, 2026-09-05) ─────────────────────────────
 *
 * *"can we have an option to copy paste the template so if share doesnt work?"*
 *
 * Every other route out of this panel depends on something we do not control: a compose window that
 * discards Bcc, a consent screen a tenant can refuse, a deeplink that carries text only. The
 * clipboard depends on nothing, so it is the fallback that always exists, and it was there all along
 * buried inside «More»'s failure path where nobody would find it.
 */
describe("copy message", () => {
  it("Given a posted request, Then BOTH flavours go on the clipboard", async () => {
    /**
     * ⚠️ The receiving app chooses: Gmail and Outlook keep the HTML and draw the card, a chat takes
     * the words. Writing only one would decide for an app we cannot see, and the card is the half
     * that has been missing everywhere.
     */
    const write = vi.fn(async () => {});
    const flavours: Record<string, unknown>[] = [];
    vi.stubGlobal("ClipboardItem", class {
      constructor(parts: Record<string, unknown>) {
        flavours.push(parts);
      }
    });
    vi.stubGlobal("navigator", { ...navigator, clipboard: { write, writeText: async () => {} } });

    draw({ draftForm: DRAFT });
    fireEvent.click(await screen.findByText(c.copyMessage));

    await waitFor(() => expect(write).toHaveBeenCalled());
    expect(Object.keys(flavours[0]).sort()).toEqual(["text/html", "text/plain"]);
  });

  it("Given no link yet, Then it is locked — the same rule as Copy link", async () => {
    /**
     * ⚠️ The message ends with a URL that does not exist before the post, so copying early hands
     * him a message with a hole where the link goes. Owner's rule for the link itself
     * (2026-09-02): nothing is copyable before the request is posted.
     */
    render(
      <LocaleProvider>
        <ShareRequestPanel mode="post" draftForm={DRAFT} onPost={async () => "new-uuid"} />
      </LocaleProvider>,
    );
    await screen.findByText("Al Faisal Rentals");

    expect(screen.getByText(c.copyMessage).closest("button")!.hasAttribute("disabled")).toBe(true);
  });

  it("Given it copied, Then it says so and then stops saying so", async () => {
    // A label that stays changed is a button that looks broken the next time he needs it.
    vi.stubGlobal("ClipboardItem", class {
      constructor(public parts: Record<string, unknown>) {}
    });
    vi.stubGlobal("navigator", { ...navigator, clipboard: { write: async () => {}, writeText: async () => {} } });

    draw({ draftForm: DRAFT });
    fireEvent.click(await screen.findByText(c.copyMessage));

    await waitFor(() => expect(screen.getByText(c.copyMessageDone)).toBeTruthy());
  });
});


/**
 * ── One writer, and it is always a press (owner, 2026-09-05) ────────────────────────────────────
 *
 * *"there is a copy of the link and copy of the email, different ones."*
 *
 * ⚠️ **The clipboard holds ONE thing.** Five places in this panel used to write it and only two were
 * buttons, so pressing Send with e-mail silently threw away whatever the renter had just copied and
 * nothing on screen said why. The rule now: nothing writes the clipboard without a press, so what is
 * on it is always the thing he last pressed.
 */
describe("the clipboard has one writer at a time", () => {
  const clip = () => {
    const writeText = vi.fn(async () => {});
    const write = vi.fn(async () => {});
    vi.stubGlobal("ClipboardItem", class {
      constructor(public parts: Record<string, unknown>) {}
    });
    vi.stubGlobal("navigator", { ...navigator, clipboard: { write, writeText } });
    return { write, writeText };
  };

  it("Given an e-mail send, Then it does NOT touch the clipboard on its own", async () => {
    /**
     * ⚠️ This is the whole bug. A renter presses «Copy message», then presses Send, and the e-mail
     * branch used to overwrite it with the supplier addresses (Outlook) or the card (Gmail). He
     * pasted, and got something he never asked for.
     */
    const { write, writeText } = clip();
    api.mail = { sent: false, reason: "UNAVAILABLE", from: null, domain: null, dns: [], connectPath: null };

    draw({ draftForm: DRAFT });
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.outlook));
    fireEvent.click(screen.getByText(c.sendToSuppliers).closest("button")!);

    await waitFor(() => expect(opened).toHaveBeenCalled());
    expect(write).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("Given the send fell back to Outlook, Then the addresses are offered as a BUTTON", async () => {
    /**
     * ⚠️ Outlook's deeplink discards `bcc` without a word, so its window opens addressed to nobody.
     * That paste is real and it stays, but as a press rather than a theft.
     */
    const { writeText } = clip();
    api.mail = { sent: false, reason: "UNAVAILABLE", from: null, domain: null, dns: [], connectPath: null };

    draw({ draftForm: DRAFT });
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.outlook));
    fireEvent.click(screen.getByText(c.sendToSuppliers).closest("button")!);

    const button = await screen.findByText(c.copyAddresses);
    fireEvent.click(button);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("ops@alfaisal.sa"));
  });

  it("Given nothing was sent yet, Then no addresses button exists", async () => {
    // It answers a problem that has not happened. Drawn up front it would be a paste offered for a
    // window nobody opened.
    clip();
    draw({ draftForm: DRAFT });
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.outlook));

    expect(screen.queryByText(c.copyAddresses)).toBeNull();
  });

  it("Given WE sent it, Then no addresses button either — the message carried them", async () => {
    /**
     * ⚠️ A server-side send puts the recipients on the message itself. Offering a paste there would
     * be offering a fix for a problem that did not happen, and the renter would reasonably wonder
     * what he was supposed to do with it.
     */
    clip();
    api.mail = { sent: true, from: "b@x.sa", via: "graph", recipients: 1, messageId: null, inSentFolder: true, skipped: 0 };

    draw({ draftForm: DRAFT });
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.outlook));
    fireEvent.click(screen.getByText(c.sendToSuppliers).closest("button")!);

    await waitFor(() => expect(api.mailCalls).toHaveLength(1));
    expect(screen.queryByText(c.copyAddresses)).toBeNull();
  });
});


/**
 * -- His wording comes back (owner, 2026-09-05) --------------------------------------------------
 *
 * *"if user edited a template and get back to it later will be saved? i wanna save it for him so it
 * is used always."*
 *
 * It is the whole reason the template is stored rather than rebuilt: a firm that opens every request
 * with the same sentence should type it once, not forty times. These close the loop the storage
 * tests leave open, which is that the PANEL reads it back on a fresh mount.
 */
describe("what he typed is still there next time", () => {
  it("Given he edits and comes back, Then his words are what the panel opens with", async () => {
    draw({ draftForm: DRAFT });
    const above = (await screen.findByLabelText(c.tplAbove)) as HTMLTextAreaElement;
    fireEvent.change(above, { target: { value: "Dear partner, please quote by Sunday." } });

    // A different mount, as though he closed the page and came back tomorrow.
    cleanup();
    draw({ draftForm: DRAFT });

    const again = (await screen.findByLabelText(c.tplAbove)) as HTMLTextAreaElement;
    expect(again.value).toBe("Dear partner, please quote by Sunday.");
  });

  it("Given he edits the SUBJECT, Then that comes back too", async () => {
    // ⚠️ It is part of the template now, not a line we rebuild each render, so it has to persist
    // like the rest of his wording or it would silently reset every visit.
    // ⚠️ The subject only exists on the E-MAIL frame: WhatsApp has no subject line, so drawing a
    // field for one there would offer him something that goes nowhere.
    draw({ draftForm: DRAFT });
    fireEvent.click(await screen.findByText(c.outlook));
    const title = (await screen.findByLabelText(c.tplTitle)) as HTMLTextAreaElement;
    fireEvent.change(title, { target: { value: "Quote needed: {equipment}" } });

    cleanup();
    draw({ draftForm: DRAFT });
    fireEvent.click(await screen.findByText(c.outlook));

    const again = (await screen.findByLabelText(c.tplTitle)) as HTMLTextAreaElement;
    // Shown filled, because that is what gets sent; the token is his when he clicks in.
    expect(again.value).toContain("Quote needed:");
    expect(again.value).toContain("Crawler Excavator");
  });

  it("Given he resets, Then it is ours again and STAYS ours after a reload", async () => {
    draw({ draftForm: DRAFT });
    const above = (await screen.findByLabelText(c.tplAbove)) as HTMLTextAreaElement;
    fireEvent.change(above, { target: { value: "Mine" } });
    fireEvent.click(await screen.findByText(c.tplReset));

    cleanup();
    draw({ draftForm: DRAFT });

    const again = (await screen.findByLabelText(c.tplAbove)) as HTMLTextAreaElement;
    expect(again.value).not.toBe("Mine");
    expect(again.value).toContain("bid on my equipment request");
  });

  it("Given ARABIC, Then it keeps its OWN wording — the two do not overwrite each other", async () => {
    /**
     * ⚠️ Stored per language, and that is deliberate: a renter who writes an Arabic greeting has
     * not thereby replaced his English one. One slot for both would mean switching the toggle
     * silently destroyed whichever he had written first.
     */
    draw({ draftForm: DRAFT });
    fireEvent.change(await screen.findByLabelText(c.tplAbove), { target: { value: "English wording" } });
    fireEvent.click(screen.getByText("العربية"));
    fireEvent.change(screen.getByLabelText(c.tplAbove), { target: { value: "نص عربي" } });

    cleanup();
    draw({ draftForm: DRAFT });

    // Back in English, his English words. The Arabic ones did not land on top of them.
    const again = (await screen.findByLabelText(c.tplAbove)) as HTMLTextAreaElement;
    expect(again.value).toBe("English wording");
  });
});


/**
 * -- One wording per channel, kept on his account (owner, 2026-09-05) ----------------------------
 *
 * *"different template per channel but i want it stored in his profile."*
 *
 * An e-mail and a WhatsApp message are read in different frames and at different lengths, so a
 * renter who writes a proper letter for one and two lines for the other was choosing which of the
 * two to write badly. And wording kept in one browser met our default on every other machine.
 */
describe("a wording per channel", () => {
  it("Given he edits E-MAIL, Then WhatsApp keeps its own", async () => {
    draw({ draftForm: DRAFT });
    fireEvent.click(await screen.findByText(c.outlook));
    fireEvent.change(screen.getByLabelText(c.tplAbove), { target: { value: "Formal letter" } });

    fireEvent.click(screen.getByText(c.whatsapp));
    await waitFor(() =>
      expect((screen.getByLabelText(c.tplAbove) as HTMLTextAreaElement).value).not.toBe("Formal letter"),
    );

    fireEvent.change(screen.getByLabelText(c.tplAbove), { target: { value: "Two lines" } });

    // Back to e-mail: the letter is still the letter.
    fireEvent.click(screen.getByText(c.outlook));
    await waitFor(() =>
      expect((screen.getByLabelText(c.tplAbove) as HTMLTextAreaElement).value).toBe("Formal letter"),
    );
  });

  it("Given both are set, Then a fresh mount still has both", async () => {
    draw({ draftForm: DRAFT });
    fireEvent.click(await screen.findByText(c.outlook));
    fireEvent.change(screen.getByLabelText(c.tplAbove), { target: { value: "Mail wording" } });
    fireEvent.click(screen.getByText(c.whatsapp));
    fireEvent.change(screen.getByLabelText(c.tplAbove), { target: { value: "Chat wording" } });

    cleanup();
    draw({ draftForm: DRAFT });

    fireEvent.click(await screen.findByText(c.whatsapp));
    await waitFor(() =>
      expect((screen.getByLabelText(c.tplAbove) as HTMLTextAreaElement).value).toBe("Chat wording"),
    );
    fireEvent.click(screen.getByText(c.outlook));
    await waitFor(() =>
      expect((screen.getByLabelText(c.tplAbove) as HTMLTextAreaElement).value).toBe("Mail wording"),
    );
  });

  it("Given RESET, Then only the channel he is reading goes back to ours", async () => {
    // He pressed it while reading one message. Taking the other two would undo work he cannot see.
    draw({ draftForm: DRAFT });
    fireEvent.click(await screen.findByText(c.outlook));
    fireEvent.change(screen.getByLabelText(c.tplAbove), { target: { value: "Mail wording" } });
    fireEvent.click(screen.getByText(c.whatsapp));
    fireEvent.change(screen.getByLabelText(c.tplAbove), { target: { value: "Chat wording" } });

    fireEvent.click(await screen.findByText(c.tplReset));
    await waitFor(() =>
      expect((screen.getByLabelText(c.tplAbove) as HTMLTextAreaElement).value).toContain("bid on my equipment request"),
    );

    fireEvent.click(screen.getByText(c.outlook));
    await waitFor(() =>
      expect((screen.getByLabelText(c.tplAbove) as HTMLTextAreaElement).value).toBe("Mail wording"),
    );
  });
});

/*
 * -- `describe("his wording follows him off this browser")` lived here --
 *
 * Three cases covering the account copy: it wins over an empty browser, an empty account never
 * overwrites what he typed here, and an unreachable account still lets him edit. Removed with the
 * feature on 2026-09-05 (owner: *"for now keep it browser"*). They are worth restoring alongside
 * `docs/implementation-plans/renter-suppliers/share-template-on-account.md`.
 */


/**
 * -- One press: post, connect, Outlook (owner, 2026-09-05) ---------------------------------------
 *
 * *"when user select suppliers and was selecting email and click post it must open for him the
 * connector and choose his account then open the outlook for him and see who is bcc then click send
 * so he send it by him self."*
 *
 * The connector used to be a button he had to find AFTER a send had already failed: two presses and
 * a paragraph explaining the first one. The request is posted by the time the consent is needed, so
 * it is not a detour, it is the next step of the thing he pressed.
 */
describe("Send opens the connector itself", () => {
  /** A pop-up that is already closed, so the poll resolves on its first tick. */
  const popup = () => {
    const win = { closed: true } as Window;
    opened.mockReturnValue(win);
    return win;
  };

  it("Given he is not connected, Then pressing Send opens the consent, then sends", async () => {
    api.connect = { configured: true, connected: true, provider: "microsoft", accountEmail: "b@x.sa", connectedAt: null };
    api.connectUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?x=1";
    api.mail = { sent: true, from: "b@x.sa", via: "graph", recipients: 1, messageId: null, inSentFolder: false, skipped: 0, draftUrl: null };

    // Not connected at the moment of the press; connected by the time the pop-up closes.
    api.connect = { configured: true, connected: false, provider: "microsoft", accountEmail: null, connectedAt: null };
    popup();

    draw({ draftForm: DRAFT });
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.outlook));
    fireEvent.click(screen.getByText(c.sendToSuppliers).closest("button")!);

    await waitFor(() => expect(opened).toHaveBeenCalled());
    expect(String(opened.mock.calls[0][0])).toContain("login.microsoftonline.com");
  });

  it("Given a DRAFT came back, Then it opens so he can read the Bcc and press Send himself", async () => {
    /**
     * 🔴 **This is the only point in the whole feature where he SEES the recipients.** Outlook's
     * compose deeplink discards blind copies without a word, and a send the server made on his
     * behalf shows him nothing at all.
     */
    api.connect = { configured: true, connected: true, provider: "microsoft", accountEmail: "b@x.sa", connectedAt: null };
    api.mail = {
      sent: true,
      from: "b@x.sa",
      via: "graph",
      recipients: 3,
      messageId: null,
      inSentFolder: false,
      skipped: 0,
      draftUrl: "https://outlook.office.com/mail/deeplink/read/AAMk123",
    };

    draw({ draftForm: DRAFT });
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.outlook));
    fireEvent.click(screen.getByText(c.sendToSuppliers).closest("button")!);

    await waitFor(() =>
      expect(opened.mock.calls.some((call) => String(call[0]).includes("deeplink/read/AAMk123"))).toBe(true),
    );
  });

  it("Given no draft link, Then nothing is opened — the message has already gone", async () => {
    // ⚠️ Today's backend calls `POST /me/sendMail`. There is no draft to show, so opening
    // anything would be opening a window at a message he cannot change.
    api.connect = { configured: true, connected: true, provider: "microsoft", accountEmail: "b@x.sa", connectedAt: null };
    api.mail = { sent: true, from: "b@x.sa", via: "graph", recipients: 1, messageId: null, inSentFolder: true, skipped: 0, draftUrl: null };

    draw({ draftForm: DRAFT });
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.outlook));
    fireEvent.click(screen.getByText(c.sendToSuppliers).closest("button")!);

    await waitFor(() => expect(api.mailCalls).toHaveLength(1));
    expect(opened).not.toHaveBeenCalled();
  });

  it("Given this stage cannot connect, Then Send does NOT try, and the window opens as before", async () => {
    // ⚠️ `configured: false` means no Azure app registration. A consent pop-up there is a dead end.
    api.connect = { configured: false, connected: false, provider: null, accountEmail: null, connectedAt: null };
    api.connectUrl = null;
    api.mail = { sent: false, reason: "UNAVAILABLE", from: null, domain: null, dns: [], connectPath: null };

    draw({ draftForm: DRAFT });
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.outlook));
    fireEvent.click(screen.getByText(c.sendToSuppliers).closest("button")!);

    await waitFor(() => expect(opened).toHaveBeenCalled());
    expect(String(opened.mock.calls[0][0])).not.toContain("login.microsoftonline.com");
  });
});


/**
 * -- The two Copies, and the share sheet (owner, 2026-09-05) -------------------------------------
 */
describe("the message's own controls live on the message", () => {
  it("Given the preview, Then the language and Copy template are INSIDE the card", async () => {
    /**
     * ⚠️ *"the 2 copies for the link and for the template is very confusing."*
     *
     * ~~One in this row saying «Copy», one in the preview heading saying «Copy message».~~ Two
     * near-identical buttons in two places, each naming a different thing in the same word, and no
     * screen on which he could see both to tell them apart. Side by side they explain each other.
     */
    /**
     * ⚠️ **Inside the card, not above it** (owner, 2026-09-05). In the column heading they read as
     * settings for the panel; against the subject line they read as what they are — this letter's
     * language, and this letter on the clipboard.
     */
    draw({ draftForm: DRAFT });
    await screen.findByText("Al Faisal Rentals");
    fireEvent.click(screen.getByText(c.outlook));

    const card = (await screen.findByLabelText(c.tplTitle)).closest("div")!.parentElement!;
    expect(within(card).getByText("العربية")).toBeTruthy();
    expect(within(card).getByText(c.copyMessage)).toBeTruthy();
    // And the link row carries a glyph only: the accessible name is there, the WORD is not.
    expect(screen.getByLabelText(c.copy)).toBeTruthy();
    expect(screen.getByLabelText(c.copy).textContent).not.toContain(c.copy);
  });
});

describe("More hands the sheet a URL", () => {
  it("Given the share sheet, Then the link is its own field, not buried in the text", async () => {
    /**
     * 🔴 Windows and Android draw the link tile, the QR button and the copy-link button from the
     * `url` FIELD. With only `text` they fall back to a bare list of apps with no preview of what is
     * being sent, which is not the sheet the owner asked for.
     *
     * ⚠️ And the URL is trimmed off the end of `text`, or every target that concatenates the two
     * shows it twice.
     */
    const share = vi.fn(async (_d: { url?: string; text?: string; title?: string }) => undefined);
    vi.stubGlobal("navigator", { ...navigator, share, clipboard: { writeText: async () => {} } });

    draw({ draftForm: DRAFT });
    // Share mode already has a link, so «More» is on screen without a post.
    await screen.findByText("Al Faisal Rentals");
    fireEvent.click(screen.getByText(c.other));

    await waitFor(() => expect(share).toHaveBeenCalled());
    const arg = share.mock.calls[0][0];
    expect(arg.url).toContain("/bid/");
    expect(arg.text).toContain("Crawler Excavator");
    expect(arg.text!.endsWith(arg.url!)).toBe(false);
  });
});
