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
    expect(screen.getByText(c.alwaysHint)).toBeTruthy();
  });

  it("Given e-mail, Then the recipients are the ticked suppliers, in BCC", async () => {
    draw();
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.sendToSuppliers));

    await waitFor(() => expect(opened).toHaveBeenCalled());
    const url = new URL(opened.mock.calls[0][0] as string);
    // BCC, never To: forty suppliers in a To line tells each of them who else was asked.
    expect(url.searchParams.get("bcc")).toBe("ops@alfaisal.sa");
    expect(url.searchParams.get("to")).toBeNull();
    expect(url.searchParams.get("subject")).toContain("EXC-170845");
  });

  it("Given nobody is ticked, Then it still sends — the renter addresses it himself", async () => {
    // Owner, 2026-09-02: *"users can share with this template in whatsapp or email without choosing
    // from their suppliers fine."* The compose window opens with the message and no recipient.
    draw();
    await screen.findByText("Al Faisal Rentals");
    fireEvent.click(screen.getByText(c.sendToSuppliers));

    await waitFor(() => expect(opened).toHaveBeenCalled());
    expect(new URL(opened.mock.calls[0][0] as string).searchParams.get("bcc")).toBeNull();
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
    fireEvent.click(await screen.findByText(c.email));

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
    // Ours, and marked as ours where he can see it before he presses Edit.
    expect(screen.getByText(c.fixedByUs)).toBeTruthy();
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
    // Twice on the page now, and deliberately: once in the message, once in the card the LINK
    // unfurls into. Neither is editable.
    const shown = await screen.findAllByText(/Crawler Excavator 20 ton/);
    expect(shown.length).toBeGreaterThan(1);
    expect(shown.every((el) => el.closest("textarea") === null)).toBe(true);
  });

  it("Given the channel, Then the preview follows it with no tabs to press", async () => {
    // The channel row already says which one he is sending; a tab strip asks the same question again.
    drawDraft();
    await screen.findByLabelText(c.tplGreeting);

    // E-mail is on, so the e-mail frame is drawn: subject line and From.
    expect(screen.getByText(/A new equipment request for you/)).toBeTruthy();

    // ONE channel at a time: pressing WhatsApp is the whole act, and E-mail goes off with it.
    fireEvent.click(screen.getByText(c.whatsapp));
    await waitFor(() => expect(screen.queryByText(/A new equipment request for you/)).toBeNull());
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
    fireEvent.click(screen.getByText(c.sendToSuppliers));

    await waitFor(() => expect(screen.getByText(c.shareAgain)).toBeTruthy());
    expect(screen.getByText(c.shareAgainHint)).toBeTruthy();

    // And the channel it has used says so, so he can see where it has been.
    expect(screen.getByText(c.email).closest("button")!.textContent).toContain("check");
  });

  it("Given E-mail is the channel, Then Outlook and Gmail are asked for beside it", async () => {
    // Owner: *"when user click email they will ask to share through outlook or gmail instead of
    // having them here."* They belong to the channel, not to the panel.
    draw();
    await screen.findByText("Al Faisal Rentals");
    expect(screen.getByText(c.outlook)).toBeTruthy();

    fireEvent.click(screen.getByText(c.whatsapp));
    expect(screen.queryByText(c.outlook)).toBeNull();
  });
});

describe("the link preview (owner, 2026-09-02)", () => {
  const drawDraft = () =>
    render(
      <LocaleProvider>
        <ShareRequestPanel mode="post" draftForm={DRAFT} renterName="Shibh Al Jazira" onPost={async () => "u"} />
      </LocaleProvider>,
    );

  it("Given no link yet, Then the card the link becomes is STILL drawn", async () => {
    /**
     * *"why in the preview i dont see like the link preview itself."* It used to need the URL, which
     * does not exist until the request does — so the one thing a supplier actually sees was missing
     * from the screen where the renter decides whether to send it. Everything on the card but the
     * picture comes from the draft and is already correct.
     */
    drawDraft();
    expect(await screen.findByText(c.unfurl)).toBeTruthy();

    // The generic band stands in until `/bid/<token>/og` has a token to render for.
    const img = document.querySelector<HTMLImageElement>('img[src="/og-bid.png"]');
    expect(img).not.toBeNull();
  });

  it("Given WhatsApp, Then the card is inside the bubble, where WhatsApp draws it", async () => {
    drawDraft();
    fireEvent.click(await screen.findByText(c.whatsapp));
    // Same card, drawn where that client actually draws it.
    await waitFor(() => expect(screen.getByText(c.unfurl)).toBeTruthy());
  });
});

describe("the card, in an e-mail from HIS address (owner, 2026-09-02)", () => {
  it("Given an e-mail send, Then the card goes on the clipboard for one paste", async () => {
    /**
     * *"i want it from his email not us , so it is like normal sharing but with preview."*
     *
     * A compose URL carries `text/plain` only, so the body is words. Sending real HTML from OUR
     * server would arrive from `notifications@moedatech.net`, which is the thing he ruled out. The
     * card therefore rides the clipboard: Gmail and Outlook keep pasted HTML, so one Ctrl+V turns
     * his plain message into the laid-out one, still from his own account.
     */
    const write = vi.fn(async (_items: unknown[]) => {});
    // jsdom's Blob has no `.text()`, so the stub keeps the raw strings it was handed.
    const seen: Record<string, string> = {};
    vi.stubGlobal("Blob", class {
      constructor(parts: string[], opts: { type: string }) {
        seen[opts.type] = parts.join("");
      }
    });
    vi.stubGlobal("ClipboardItem", class { constructor(public parts: Record<string, Blob>) {} });
    vi.stubGlobal("navigator", { ...navigator, clipboard: { write, writeText: async () => {} } });

    render(
      <LocaleProvider>
        <ShareRequestPanel mode="post" draftForm={DRAFT} renterName="Shibh Al Jazira" onPost={async () => "u"} />
      </LocaleProvider>,
    );
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
    fireEvent.click(screen.getByText(c.sendToSuppliers));

    // The compose window still opens, and the clipboard is loaded in the same press.
    await waitFor(() => expect(opened).toHaveBeenCalled());
    await waitFor(() => expect(write).toHaveBeenCalled());

    /**
     * ⚠️ The CARD alone, never the whole message. The body already holds the words; copying the
     * rendered message too meant a paste produced the request twice in one e-mail.
     */
    const html = seen["text/html"] ?? "";
    expect(html).toContain("Crawler Excavator");
    expect(html).not.toContain("Hello,");
    expect(html).not.toContain("invites you to bid");
    // And he is TOLD, or he would never know to paste.
    expect(screen.getByText(c.pasteForCard)).toBeTruthy();
  });

  it("Given he never pastes, Then what he sends is still a complete message", async () => {
    // The body stands on its own: every fact, the link last. Nothing is worse for skipping the paste.
    render(
      <LocaleProvider>
        <ShareRequestPanel mode="post" draftForm={DRAFT} renterName="Shibh Al Jazira" onPost={async () => "u"} />
      </LocaleProvider>,
    );
    fireEvent.click(await screen.findByText("Al Faisal Rentals"));
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
    expect(intro.value).toBe("Shibh Al Jazira invites you to bid on an equipment request.");
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
    expect(intro.value).toBe("You are invited to bid on an equipment request.");
  });

  it("Given the card, Then it is drawn ONCE, outside the message", async () => {
    // Owner: *"so request details is duplicated in the card and in the text itslef?"* The card is
    // not part of the message — it is what some apps build out of the link — so it sits outside the
    // frame, labelled with the apps that draw it.
    render(
      <LocaleProvider>
        <ShareRequestPanel mode="post" draftForm={DRAFT} renterName="Shibh Al Jazira" onPost={async () => "u"} />
      </LocaleProvider>,
    );
    expect((await screen.findAllByText(c.unfurl)).length).toBe(1);
    expect(screen.getByText(c.unfurlWhere)).toBeTruthy();
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
    fireEvent.click(await screen.findByText(c.copy));

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
    // Locked, and drawn as locked in BOTH places — the link field, and where the link will sit in
    // the message itself. The renter needs to know one is coming, or Copy looks broken rather than
    // not-yet.
    expect(screen.getAllByText(c.linkMasked).length).toBe(2);
    expect(screen.getByText(c.copy).closest("button")!.hasAttribute("disabled")).toBe(true);
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
