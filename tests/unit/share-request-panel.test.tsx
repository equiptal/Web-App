import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
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
}));

vi.mock("@/lib/api/client", () => ({
  listRenterSuppliers: () => Promise.resolve(api.rows),
  recordRequestShare: (...args: unknown[]) => {
    api.shares.push(args);
    return Promise.resolve();
  },
  setBidDeadline: () => Promise.resolve(),
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
    fireEvent.click(screen.getByText(c.email));
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
    fireEvent.click(screen.getByText(c.email));
    expect(screen.getByText(c.alwaysHint)).toBeTruthy();
  });

  it("Given e-mail, Then the recipients are the ticked suppliers", async () => {
    draw();
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.email));
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
    // ⚠️ The clipboard holds ONE thing, so Outlook gets the ADDRESSES — the thing its compose URL
    // cannot carry — and is told exactly where to put them. Never the card as well.
    await waitFor(() => expect(screen.getByText(c.nowPasteAddresses)).toBeTruthy());
    expect(screen.queryByText(c.nowPasteCard)).toBeNull();
  });

  it("Given nobody is ticked, Then it still sends — the renter addresses it himself", async () => {
    // Owner, 2026-09-02: *"users can share with this template in whatsapp or email without choosing
    // from their suppliers fine."* The compose window opens with the message and no recipient.
    draw();
    await screen.findByText("Al Faisal Rentals");
    fireEvent.click(screen.getByText(c.email));
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
    fireEvent.click(screen.getByText(c.email));
    const button = screen.getByText(c.sendToSuppliers).closest("button")!;
    expect(button.hasAttribute("disabled")).toBe(false);

    fireEvent.click(button);
    await waitFor(() => expect(posted).toHaveBeenCalled());
    // It reached nobody by e-mail, and says so as a posting rather than as a failure.
    await waitFor(() => expect(screen.getByText(c.postedOnly)).toBeTruthy());
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
    // One channel at a time: pressing «More» selects it, and E-mail goes off with the same press.
    fireEvent.click(await screen.findByText(c.other));
    fireEvent.click(screen.getByText(c.sendToSuppliers));

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
    // One channel at a time: pressing «More» selects it, and E-mail goes off with the same press.
    fireEvent.click(await screen.findByText(c.other));
    fireEvent.click(screen.getByText(c.sendToSuppliers));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.getByText(c.messageCopied)).toBeTruthy();
  });

  it("Given both extras are off, Then it says Moedatech only, and still sends", async () => {
    /**
     * Owner, 2026-09-02: *"users must be able to send the request only through moedatech without any
     * other channel so they must see that clearly in the ui."* Stated as a fact, not left as the
     * absence of two ticks — a renter must never wonder whether Send does nothing.
     */
    draw();
    await screen.findByText("Al Faisal Rentals");
    // Nothing is on to begin with, so this IS the Moedatech-only state.
    expect(screen.getByText(c.moedatechOnlyHint)).toBeTruthy();
    const button = screen.getByText(c.sendMoedatechOnly).closest("button")!;
    expect(button.hasAttribute("disabled")).toBe(false);

    fireEvent.click(button);
    // No mail window, no WhatsApp: Moedatech alone means nothing else is opened.
    await waitFor(() => expect(screen.getByText(c.postedOnly)).toBeTruthy());
    expect(opened).not.toHaveBeenCalled();
  });

  it("Given a share went out, Then it is recorded against the request", async () => {
    draw();
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.email));
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

  it("Given the default wording, Then a greeting, an intro, our card and a sign-off", async () => {
    drawDraft();
    expect(await screen.findByText("Hello,")).toBeTruthy();
    expect(screen.getByText(/invites you to bid/)).toBeTruthy();
    // The details sit between them AS THE CARD — the template is greeting, card, sign-off.
    expect(screen.getByText("MOEDATECH")).toBeTruthy();
    expect(screen.getByText(/Open the link to submit your bid/)).toBeTruthy();
  });

  it("Given he edits a line, Then it is edited IN the preview, and that is what is sent", async () => {
    /**
     * Owner, 2026-09-02: *"i want the template itself editable and will be reflected in what will
     * be sent."* There is no separate drawer and no separate note box — the thing he reads and the
     * thing he types are one object, which is what makes the preview honest.
     */
    drawDraft();
    const greeting = await screen.findByLabelText(c.tplGreeting);
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
    await screen.findByLabelText(c.tplGreeting);

    // Pick e-mail and the e-mail frame is drawn: subject line and From.
    fireEvent.click(screen.getByText(c.email));
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
    fireEvent.click(screen.getByText(c.email));
    fireEvent.click(screen.getByText(c.sendToSuppliers));

    await waitFor(() => expect(screen.getByText(c.shareAgain)).toBeTruthy());
    expect(screen.getByText(c.shareAgainHint)).toBeTruthy();

    // And the channel it has used says so, so he can see where it has been.
    expect(screen.getByText(c.email).closest("button")!.textContent).toContain("check");
  });

  it("Given E-mail, Then no provider is asked for — it is just e-mail", async () => {
    /**
     * Owner, 2026-09-03: *"remove the outlook or gmail option it will be just email and user can
     * then select what he want to connect when we apply api."* Until a mailbox can be connected,
     * asking which webmail he uses is asking him to solve our problem.
     */
    draw();
    fireEvent.click(await screen.findByText(c.email));
    expect(screen.queryByText(c.outlook)).toBeNull();
    expect(screen.queryByText(c.gmail)).toBeNull();
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
    await waitFor(() => expect(screen.getByText("MOEDATECH")).toBeTruthy());
    expect(document.querySelector('img[src="/og-bid.png"]')).toBeNull();
    expect(screen.getByText("MOEDATECH")).toBeTruthy();
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
    fireEvent.click(await screen.findByText(c.email));

    // Same template, same card, whichever channel is chosen — no per-channel caveat on the message.
    expect(screen.getByText("MOEDATECH")).toBeTruthy();
    expect(screen.getByText(/Open the link to submit your bid/)).toBeTruthy();
  });
});

describe("what rides the clipboard on an e-mail send", () => {
  it("Given an e-mail send, Then the ADDRESSES go on the clipboard, not the card", async () => {
    /**
     * ⚠️ The provider choice is gone (owner, 2026-09-03: *"remove the outlook or gmail option"*), so
     * there is one composer and it is Outlook's deeplink — which discards `bcc`. The one thing it
     * cannot carry is therefore the recipients, and that is what the clipboard holds.
     *
     * The CARD in an e-mail waits for a connected mailbox, which is the owner's own plan: *"user can
     * then select what he want to connect when we apply api."* Until then no compose URL can carry
     * HTML, so there is nothing to choose between.
     */
    const writeText = vi.fn(async (_t: string) => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

    render(
      <LocaleProvider>
        <ShareRequestPanel mode="post" draftForm={DRAFT} renterName="Shibh Al Jazira" onPost={async () => "u"} />
      </LocaleProvider>,
    );
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.email));
    fireEvent.click(screen.getByText(c.sendToSuppliers));

    await waitFor(() => expect(opened).toHaveBeenCalled());
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("ops@alfaisal.sa"));
    // And he is told, once, where to put them.
    expect(screen.getByText(c.nowPasteAddresses)).toBeTruthy();
    expect(screen.queryByText(c.nowPasteCard)).toBeNull();
  });

  it("Given he never pastes, Then what he sends is still a complete message", async () => {
    // The body stands on its own: every fact, the link last. Nothing is worse for skipping the paste.
    render(
      <LocaleProvider>
        <ShareRequestPanel mode="post" draftForm={DRAFT} renterName="Shibh Al Jazira" onPost={async () => "u"} />
      </LocaleProvider>,
    );
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.email));
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

    const intro = (await screen.findByLabelText(c.tplIntro)) as HTMLTextAreaElement;
    expect(intro.value).toBe("Shibh Al Jazira invites you to bid on my equipment request.");
    expect(intro.value).not.toContain("{name}");

    // Clicking in hands him the token back, because that is the thing he edits.
    fireEvent.focus(intro);
    await waitFor(() => expect((screen.getByLabelText(c.tplIntro) as HTMLTextAreaElement).value).toContain("{name}"));
  });

  it("Given no company name, Then the default reads properly instead of losing a word", async () => {
    render(
      <LocaleProvider>
        <ShareRequestPanel mode="post" draftForm={DRAFT} onPost={async () => "u"} />
      </LocaleProvider>,
    );
    const intro = (await screen.findByLabelText(c.tplIntro)) as HTMLTextAreaElement;
    expect(intro.value).toBe("You are invited to bid on my equipment request.");
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
    await screen.findByLabelText(c.tplGreeting);

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

describe("what the panel claims after a send (owner, 2026-09-03)", () => {
  it("Given a send, Then it says the CHANNEL OPENED — never that it was sent", async () => {
    /**
     * ⚠️ *"this is tracking what? because i didnt send anything the whatsapp was pending."*
     *
     * It counted a successful `window.open` and called it "Request shared with 2 suppliers".
     * Opening a compose window is not sending a message: he may read it, edit it, close it, or
     * never come back. We hand the message to his mail app and lose sight of it there — there is no
     * callback, and there cannot be one. So the panel reports the HAND-OFF.
     */
    draw();
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.email));
    fireEvent.click(screen.getByText(c.sendToSuppliers));

    await waitFor(() => expect(screen.getByText(c.openedEmail.replace("{n}", "1"))).toBeTruthy());
    expect(screen.queryByText(/shared with/i)).toBeNull();
  });

  it("Given Moedatech alone, Then it claims no channel at all", async () => {
    draw();
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.sendMoedatechOnly));

    await waitFor(() => expect(screen.getByText(c.postedOnly)).toBeTruthy());
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
    fireEvent.click(await screen.findByText(c.copyShort));

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
    expect(screen.getByText(c.copyShort).closest("button")!.hasAttribute("disabled")).toBe(true);
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
