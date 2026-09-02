import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { ReadyToSend } from "@/components/create/ReadyToSend";
import { BID_WINDOWS, MAINTENANCE_SLAS, PAYMENT_TERMS } from "@/lib/contract";
import { confirmedProject, makeAgentDraft, makeItem, renderCanvas } from "../setup/canvas";

/**
 * MREQ-TC-26/28 — the review screen.
 *
 * Everything above Preferences is read-only on purpose: a screen that both shows and edits is one
 * where a stray click changes the request while the renter is checking it. So the assertions are
 * about what is editable here and what sends the renter back to the canvas.
 *
 * ── The sections moved behind «View all details» (owner, 2026-09-02) ────────────────────────────
 *
 * The page now leads with a one-line summary and keeps the four sections in a dialog. Nothing about
 * them changed: same values, same pens, same export. So most of these cases open the dialog first
 * and assert exactly what they always did — `openDetails` is the only new line in them, and a case
 * that fails WITHOUT it is a case that was reading the strip by accident.
 */

const review = (opts: Parameters<typeof renderCanvas>[1] = {}) =>
  renderCanvas(<ReadyToSend />, {
    draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
    prepare: (store) => store.actions.setReadyToSend(true),
    ...opts,
  });

/** Open the dialog that now holds the four review sections. */
async function openDetails(handle: Awaited<ReturnType<typeof review>>) {
  await handle.run(() => screen.getByRole("button", { name: /View all details/i }).click());
}

describe("what suppliers will see (MREQ-AC-42)", () => {
  it("leads with one line: the place, the dates and the machine", async () => {
    /* The strip, which is now the page's own summary. The place is a LINK here — an address a
       renter cannot press is one they retype into another tab to check. */
    await review();
    expect(screen.getByText("Ready to send")).toBeTruthy();
    const map = screen.getByRole("link", { name: /King Khalid International Airport/i });
    expect(map.getAttribute("href")).toMatch(/google\.com\/maps/);
    expect(screen.getByRole("button", { name: /View all details/i })).toBeTruthy();
  });

  it("summarises the site, schedule and charged days", async () => {
    const handle = await review();
    await openDetails(handle);
    /* Twice on purpose now: the strip's link and this section. Scoped to the dialog, which is what
       this case is about. */
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText(/King Khalid International Airport/)).toBeTruthy();
    expect(screen.getByText("DAYS CHARGED")).toBeTruthy();
    expect(screen.getByText("155")).toBeTruthy();
  });

  it("sends the renter back to the canvas to change anything else", async () => {
    const handle = await review();
    await openDetails(handle);
    await handle.run(() => screen.getAllByRole("button", { name: /Edit/ })[0].click());
    expect(handle.store().state.readyToSend).toBe(false);
  });

  it("returns to editing without submitting", async () => {
    const handle = await review();
    await handle.run(() => screen.getByRole("button", { name: "Back to editing" }).click());
    expect(handle.store().state.readyToSend).toBe(false);
    expect(handle.store().state.requestId).toBeNull();
  });
});

describe("Preferences are the only editable region (MREQ-AC-43)", () => {
  it("offers payment terms, maintenance, budget, bid window, filters and notes", async () => {
    const handle = await review();
    await openDetails(handle);
    expect(screen.getByText(/PAYMENT DETAILS/)).toBeTruthy();
    expect(screen.getByText("MAINTENANCE")).toBeTruthy();
    expect(screen.getByText(/BUDGET CEILING/)).toBeTruthy();
    expect(screen.getByText(/OFFER \/ BID WINDOW/)).toBeTruthy();
    expect(screen.getByText("SUPPLIER FILTERS")).toBeTruthy();
    expect(screen.getByText(/ADDITIONAL NOTES/)).toBeTruthy();
  });

  it("offers exactly the platform's payment terms — none of the prototype's", async () => {
    const handle = await review();
    await openDetails(handle);
    const field = screen.getByText(/PAYMENT DETAILS/).closest("div")!.parentElement!;
    const labels = within(field)
      .getAllByRole("button")
      .map((b) => b.textContent!.trim());
    expect(labels).toEqual(["Upfront", "Daily", "Net 30", "Net 60", "End of job"]);
    expect(PAYMENT_TERMS.length).toBe(labels.length);
    for (const invented of ["Net 15", "Net 45", "On completion"]) expect(labels).not.toContain(invented);
  });

  it("writes a chosen term to the draft, and clears it on a second press", async () => {
    const handle = await review();
    await openDetails(handle);
    const field = screen.getByText(/PAYMENT DETAILS/).closest("div")!.parentElement!;
    await handle.run(() => within(field).getByRole("button", { name: "Net 30" }).click());
    expect(handle.store().state.draft!.preferences.payment.terms).toBe("net-30");
    await handle.run(() => within(field).getByRole("button", { name: "Net 30" }).click());
    expect(handle.store().state.draft!.preferences.payment.terms).toBeNull();
  });

  it("keeps maintenance, which the prototype dropped", async () => {
    const handle = await review();
    await openDetails(handle);
    // Supplier is the contract default, so the SLA is offered.
    expect(handle.store().state.draft!.preferences.maintenance.responsibility).toBe("supplier");
    expect(screen.getByText(/RESPONSE TIME/)).toBeTruthy();
    const sla = screen.getByText(/RESPONSE TIME/).closest("div")!.parentElement!;
    expect(within(sla).getAllByRole("button").length).toBe(MAINTENANCE_SLAS.length);

    // Handing maintenance to the renter makes a supplier response time meaningless.
    await handle.run(() => screen.getByRole("button", { name: "Renter" }).click());
    expect(screen.queryByText(/RESPONSE TIME/)).toBeNull();
  });

  it("offers the platform's bid windows", async () => {
    const handle = await review();
    await openDetails(handle);
    const field = screen.getByText(/OFFER \/ BID WINDOW/).closest("div")!.parentElement!;
    expect(within(field).getAllByRole("button").length).toBe(BID_WINDOWS.length);
  });

  it("takes digits only for the budget", async () => {
    const handle = await review();
    await openDetails(handle);
    const field = screen.getByText(/BUDGET CEILING/).closest("div")!.parentElement!;
    const input = within(field).getByRole("textbox") as HTMLInputElement;
    // fireEvent.change goes through React's value setter; assigning .value directly does not.
    await handle.run(() => {
      fireEvent.change(input, { target: { value: "45,000 SAR" } });
    });
    expect(handle.store().state.draft!.preferences.budgetSar).toBe(45000);
  });

  it("toggles the two supplier filters independently", async () => {
    const handle = await review();
    await openDetails(handle);
    await handle.run(() => screen.getByRole("button", { name: "Verified suppliers only" }).click());
    expect(handle.store().state.draft!.preferences.supplierFilters.verifiedOnly).toBe(true);
    expect(handle.store().state.draft!.preferences.supplierFilters.sublettingAllowed).toBe(false);

    await handle.run(() => screen.getByRole("button", { name: "Allow subletting / crosshire" }).click());
    expect(handle.store().state.draft!.preferences.supplierFilters.sublettingAllowed).toBe(true);
    expect(handle.store().state.draft!.preferences.supplierFilters.verifiedOnly).toBe(true);
  });

  it("offers no payment METHOD control (MREQ-AC-44)", async () => {
    const handle = await review();
    await openDetails(handle);
    expect(screen.queryByText(/PAYMENT METHOD/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Bank transfer|Cash/ })).toBeNull();
  });
});

describe("the line-item table (MREQ-AC-45)", () => {
  it("lists the items and exports the spec sheet as CSV", async () => {
    // `downloadCsv` builds a blob URL and clicks an anchor; jsdom has neither, so stub the seam.
    const create = vi.fn(() => "blob:x");
    vi.stubGlobal("URL", { ...URL, createObjectURL: create, revokeObjectURL: vi.fn() });

    const handle = await review();
    await openDetails(handle);
    expect(screen.getByText(/^Equipment —/)).toBeTruthy();

    await handle.run(() => screen.getByRole("button", { name: /Export|Excel|CSV/i }).click());
    expect(create).toHaveBeenCalled();
  });

  it("jumps back to the item behind a row", async () => {
    const handle = await review();
    await openDetails(handle);
    await handle.run(() => screen.getByRole("button", { name: "Crawler excavator" }).click());
    expect(handle.store().state.readyToSend).toBe(false);
    expect(handle.store().state.itemIndex).toBe(0);
  });
});

describe("sending, and the two buttons that are gone (owner, 2026-09-02)", () => {
  /**
   * The review used to end in an action row: *Back to editing* and *Send to suppliers*.
   *
   * Both are gone. The send is the one button on the share card below — which is the only one that
   * knows WHICH suppliers, and the only one that can mint the link before it sends it; two buttons
   * that both post a request is one too many. The account gate went with it, to the thing that
   * posts (`ShareOnPost`).
   */
  it("has no send of its own", async () => {
    await review();
    expect(screen.queryByRole("button", { name: /Send to suppliers/i })).toBeNull();
  });

  it("offers a pen beside «View all details» instead of a button in an action row", async () => {
    // Where the hand already is: he has just read the strip, and the two controls are the two
    // things he can do about it — look closer, or change it.
    const handle = await review();
    const pen = screen.getByRole("button", { name: "Back to editing" });

    // A pen, not a labelled button: its only content is the glyph, and its name is an `aria-label`.
    expect(pen.textContent?.trim()).toBe("edit");
    expect(pen.previousElementSibling?.textContent).toContain("View all details");

    await handle.run(() => pen.click());
    expect(handle.store().state.readyToSend).toBe(false);
  });
});

/* ============================================================================================== *
 * The summary strip
 * ============================================================================================== */

describe("the one-line summary (owner, 2026-09-02)", () => {
  /* Four stacked cards owned the whole page to restate values the renter had just finished setting.
     They were a receipt, and a receipt is read once and scrolled past, so the page was spending its
     best space on the least new information. Nothing is hidden: the same sections, the same pens and
     the same export are one press away. */

  it("names the machine, its count, and how many more there are", async () => {
    await renderCanvas(<ReadyToSend />, {
      draft: makeAgentDraft({ items: [makeItem(), makeItem({ id: "i2" })], project: confirmedProject() }),
      prepare: (store) => store.actions.setReadyToSend(true),
    });
    // The first machine in full, and a count for the rest — not a list that grows off the line.
    expect(screen.getByText(/\+1/)).toBeTruthy();
  });

  it("sets the payment term without opening anything", async () => {
    /* The one term a renter commonly answers at this moment. Sending them into a dialog to press one
       chip is the kind of trip this redesign exists to remove. */
    const handle = await review();
    // The house Dropdown: a combobox that opens a listbox, not a native select.
    await handle.run(() => screen.getAllByRole("combobox")[0].click());
    const option = screen.getAllByRole("option").find((o) => o.textContent?.trim() === "Net 30")!;
    await handle.run(() => option.click());
    expect(handle.store().state.draft?.preferences.payment.terms).toBe("net-30");
  });

  it("keeps the sections out of the page until they are asked for", async () => {
    await review();
    // The dialog's own content must not be on the page behind it.
    expect(screen.queryByText("DAYS CHARGED")).toBeNull();
    expect(screen.queryByText(/ADDITIONAL NOTES/)).toBeNull();
  });
});
