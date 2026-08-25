import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { WhenPanel } from "@/components/create/WhenPanel";
import { confirmedProject, makeAgentDraft, makeItem, renderCanvas } from "../setup/canvas";

/**
 * MREQ-TC-21/22/23/24 — the schedule panel, which is where this feature touches money.
 *
 * The renter books 181 days and is charged for 155, because Fridays are not billed. Every figure and
 * every sentence here has to agree with `lib/pricing/rental`, because the bid form, the deal room and
 * the quotation all price against that same code. The prototype disagreed with it three ways: it
 * dropped the inclusive `+1`, it read dates in local time, and its "monthly is too short" warning
 * divided by 30 inside a branch that only ran below 30 — so it could only ever say "0 months".
 */

const panel = (opts: Parameters<typeof renderCanvas>[1] = {}) =>
  renderCanvas(<WhenPanel open complete={false} onToggle={() => {}} />, {
    draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
    ...opts,
  });

/** A project with the timing overridden, keeping the confirmed site. */
const withTiming = (timing: Partial<ReturnType<typeof confirmedProject>["timing"]>) =>
  makeAgentDraft({
    items: [makeItem()],
    project: confirmedProject({ timing: { ...confirmedProject().timing, ...timing } }),
  });

describe("the charged-day figure (MREQ-AC-32/33)", () => {
  it("states 181 calendar days, 26 Fridays and 155 charged for the worked example", async () => {
    await panel();
    expect(screen.getByText("DAYS YOU'LL BE CHARGED FOR")).toBeTruthy();
    expect(screen.getByText("155")).toBeTruthy();
    expect(
      screen.getByText(
        "Your rental runs 181 calendar days. Fridays are not charged, and there are 26 of them, so suppliers price 155 days at 10 hours each.",
      ),
    ).toBeTruthy();
  });

  it("states the gap in the acknowledgement, not just the total", async () => {
    await panel();
    // The disclosure is the difference between what was booked and what is paid for.
    expect(screen.getByText("I understand suppliers will price 155 days, not 181.")).toBeTruthy();
  });

  it("does not use the old arithmetic phrasing", async () => {
    await panel();
    expect(screen.queryByText(/less 26 Fridays/)).toBeNull();
    expect(screen.queryByText(/billable days/i)).toBeNull();
  });

  it("re-asks the acknowledgement when the figure changes (MREQ-AC-05)", async () => {
    const handle = await panel();
    await handle.run(() => handle.store().actions.setChargedDaysUnderstood(true));
    expect(handle.store().state.chargedDaysUnderstood).toBe(true);

    // A new end date is a new number, so the previous acceptance no longer refers to anything.
    await handle.run(() => handle.store().actions.patchTiming({ endDate: "2027-03-08" }));
    expect(handle.store().state.chargedDaysUnderstood).toBe(false);
  });
});

describe("with dates missing (MREQ-AC-34/10)", () => {
  it("withholds the figure instead of showing zero, and stays finishable", async () => {
    const handle = await panel({ draft: withTiming({ startDate: null, endDate: null }) });

    expect(screen.queryByText("DAYS YOU'LL BE CHARGED FOR")).toBeNull();
    expect(screen.queryByText("0")).toBeNull();
    expect(
      screen.getByText("Add a start and end date and we'll show exactly how many days you'll be charged for. Fridays are never charged."),
    ).toBeTruthy();
    // The wording tells the truth about what is being accepted.
    expect(screen.getByText("I understand suppliers will price without a fixed end date.")).toBeTruthy();

    // Dates are optional on the web, so the panel can still be completed.
    await handle.run(() => screen.getByRole("checkbox").click());
    expect(handle.store().state.chargedDaysUnderstood).toBe(true);
  });

  it("nudges for whichever end is missing — including the start-only case", async () => {
    await panel({ draft: withTiming({ startDate: null, endDate: null }) });
    expect(screen.getByText(/don't know your dates/)).toBeTruthy();
  });

  it("nudges for a missing end date", async () => {
    await panel({ draft: withTiming({ endDate: null }) });
    expect(screen.getByText(/don't know your end date/)).toBeTruthy();
  });

  // The prototype gated this notice on the end date alone, so this branch was unreachable in it.
  it("nudges for a missing START date, which the prototype could never show", async () => {
    await panel({ draft: withTiming({ startDate: null }) });
    expect(screen.getByText(/don't know your start date/)).toBeTruthy();
  });

  it("shows no nudge when both dates are set", async () => {
    await panel();
    expect(screen.queryByText(/Suppliers quote lower/)).toBeNull();
  });
});

describe("a basis the dates cannot support (MREQ-AC-36/37)", () => {
  it("counts monthly shortfalls in days, never in months", async () => {
    await panel({ draft: withTiming({ startDate: "2026-08-01", endDate: "2026-08-12", rentalBasis: "monthly" }) });
    expect(screen.getByText("Your dates cover 12 days. Monthly billing usually needs 30 days or more.")).toBeTruthy();
    // The prototype's sentence could only ever read "0 months".
    expect(screen.queryByText(/0 months/)).toBeNull();
  });

  it("applies the same rule to weekly under seven days", async () => {
    await panel({ draft: withTiming({ startDate: "2026-08-01", endDate: "2026-08-04", rentalBasis: "weekly" }) });
    expect(screen.getByText("Your dates cover 4 days. Weekly billing usually needs 7 days or more.")).toBeTruthy();
  });

  it("stays silent for a long enough window and for daily billing", async () => {
    await panel();
    expect(screen.queryByText(/usually needs/)).toBeNull();
    await panel({ draft: withTiming({ startDate: "2026-08-01", endDate: "2026-08-02", rentalBasis: "daily" }) });
    expect(screen.queryByText(/usually needs/)).toBeNull();
  });

  it("does not block on a too-short basis", async () => {
    const handle = await panel({ draft: withTiming({ startDate: "2026-08-01", endDate: "2026-08-12", rentalBasis: "monthly" }) });
    await handle.run(() => screen.getByRole("checkbox").click());
    expect(handle.store().state.chargedDaysUnderstood).toBe(true);
  });
});

describe("working days per week is not offered (MREQ-AC-35)", () => {
  it("renders no control for it, and leaves the contract default of 6", async () => {
    const handle = await panel();
    expect(screen.queryByText(/[Ww]orking days/)).toBeNull();
    expect(handle.store().state.draft!.project.advanced.workingDaysPerWeek).toBe(6);
  });
});

describe("hours and overtime (MREQ-AC-37)", () => {
  it("offers the platform's hour and overtime options", async () => {
    const handle = await panel();
    await handle.run(() => screen.getByText(/MORE DETAILS/).closest("button")!.click());

    for (const h of ["8", "10", "12"]) expect(screen.getByRole("button", { name: h })).toBeTruthy();
    for (const o of ["Without", "1.5×", "2×"]) expect(screen.getByRole("button", { name: o })).toBeTruthy();
  });

  it("changing the hours re-asks the acknowledgement, since the sentence quotes them", async () => {
    const handle = await panel();
    await handle.run(() => handle.store().actions.setChargedDaysUnderstood(true));
    await handle.run(() => screen.getByText(/MORE DETAILS/).closest("button")!.click());
    await handle.run(() => screen.getByRole("button", { name: "12" }).click());

    expect(handle.store().state.draft!.project.timing.hoursPerDay).toBe(12);
    expect(handle.store().state.chargedDaysUnderstood).toBe(false);
    expect(screen.getByText(/so suppliers price 155 days at 12 hours each/)).toBeTruthy();
  });
});
