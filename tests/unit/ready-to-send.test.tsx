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
 */

const review = (opts: Parameters<typeof renderCanvas>[1] = {}) =>
  renderCanvas(<ReadyToSend />, {
    draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
    prepare: (store) => store.actions.setReadyToSend(true),
    ...opts,
  });

describe("what suppliers will see (MREQ-AC-42)", () => {
  it("summarises the site, schedule and charged days", async () => {
    await review();
    expect(screen.getByText("Ready to send")).toBeTruthy();
    expect(screen.getByText(/King Khalid International Airport/)).toBeTruthy();
    expect(screen.getByText("DAYS CHARGED")).toBeTruthy();
    expect(screen.getByText("155")).toBeTruthy();
  });

  it("sends the renter back to the canvas to change anything else", async () => {
    const handle = await review();
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
    await review();
    expect(screen.getByText(/PAYMENT TERMS/)).toBeTruthy();
    expect(screen.getByText("MAINTENANCE")).toBeTruthy();
    expect(screen.getByText(/BUDGET CEILING/)).toBeTruthy();
    expect(screen.getByText(/OFFER \/ BID WINDOW/)).toBeTruthy();
    expect(screen.getByText("SUPPLIER FILTERS")).toBeTruthy();
    expect(screen.getByText(/ADDITIONAL NOTES/)).toBeTruthy();
  });

  it("offers exactly the platform's payment terms — none of the prototype's", async () => {
    await review();
    const field = screen.getByText(/PAYMENT TERMS/).closest("div")!.parentElement!;
    const labels = within(field)
      .getAllByRole("button")
      .map((b) => b.textContent!.trim());
    expect(labels).toEqual(["Upfront", "Daily", "Net 30", "Net 60", "End of job"]);
    expect(PAYMENT_TERMS.length).toBe(labels.length);
    for (const invented of ["Net 15", "Net 45", "On completion"]) expect(labels).not.toContain(invented);
  });

  it("writes a chosen term to the draft, and clears it on a second press", async () => {
    const handle = await review();
    const field = screen.getByText(/PAYMENT TERMS/).closest("div")!.parentElement!;
    await handle.run(() => within(field).getByRole("button", { name: "Net 30" }).click());
    expect(handle.store().state.draft!.preferences.payment.terms).toBe("net-30");
    await handle.run(() => within(field).getByRole("button", { name: "Net 30" }).click());
    expect(handle.store().state.draft!.preferences.payment.terms).toBeNull();
  });

  it("keeps maintenance, which the prototype dropped", async () => {
    const handle = await review();
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
    await review();
    const field = screen.getByText(/OFFER \/ BID WINDOW/).closest("div")!.parentElement!;
    expect(within(field).getAllByRole("button").length).toBe(BID_WINDOWS.length);
  });

  it("takes digits only for the budget", async () => {
    const handle = await review();
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
    await handle.run(() => screen.getByRole("button", { name: "Verified suppliers only" }).click());
    expect(handle.store().state.draft!.preferences.supplierFilters.verifiedOnly).toBe(true);
    expect(handle.store().state.draft!.preferences.supplierFilters.sublettingAllowed).toBe(false);

    await handle.run(() => screen.getByRole("button", { name: "Allow subletting / crosshire" }).click());
    expect(handle.store().state.draft!.preferences.supplierFilters.sublettingAllowed).toBe(true);
    expect(handle.store().state.draft!.preferences.supplierFilters.verifiedOnly).toBe(true);
  });

  it("offers no payment METHOD control (MREQ-AC-44)", async () => {
    await review();
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
    expect(screen.getByText(/^Equipment —/)).toBeTruthy();

    await handle.run(() => screen.getByRole("button", { name: /Export|Excel|CSV/i }).click());
    expect(create).toHaveBeenCalled();
  });

  it("jumps back to the item behind a row", async () => {
    const handle = await review();
    await handle.run(() => screen.getByRole("button", { name: "Crawler excavator" }).click());
    expect(handle.store().state.readyToSend).toBe(false);
    expect(handle.store().state.itemIndex).toBe(0);
  });
});

describe("sending (MREQ-AC-47)", () => {
  it("raises the account modal for a guest instead of posting", async () => {
    const handle = await review();
    expect(handle.store().state.busy).toBe(false);

    await handle.run(() => screen.getByRole("button", { name: /Send to suppliers/ }).click());

    // Guest — the gate opens and nothing is submitted.
    expect(handle.store().state.requestId).toBeNull();
    expect(handle.store().state.busy).toBe(false);
  });
});
