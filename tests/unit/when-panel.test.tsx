import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { WhenPanel } from "@/components/create/WhenPanel";
import { confirmedProject, makeAgentDraft, makeItem, renderCanvas } from "../setup/canvas";
import { gateWhen } from "@/lib/contract/gates";

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
    expect(screen.getByText("155")).toBeTruthy();
    expect(
      screen.getByText("billable days: 181 calendar days less 26 Fridays, at 10 hours a day, billed monthly"),
    ).toBeTruthy();
  });

  it("names the figure being accepted in the acknowledgement", async () => {
    await panel();
    expect(screen.getByText("I understand suppliers will quote against 155 billable days")).toBeTruthy();
  });

  /**
   * This assertion is INVERTED from what it was, and deliberately (owner, 2026-08-25). It used to
   * forbid «billable days» as jargon and «N calendar days less M Fridays» as arithmetic-rather-than-
   * a-sentence. The owner has since specified exactly that wording, so the guard that remains is the
   * one they asked for instead: two lines, and no heading above them.
   */
  it("is two lines with no heading over them", async () => {
    await panel();
    expect(screen.queryByText("DAYS YOU'LL BE CHARGED FOR")).toBeNull();
    expect(screen.getByText(/^billable days:/)).toBeTruthy();
    expect(screen.getByText(/^I understand suppliers will quote against/)).toBeTruthy();
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

/**
 * An end date before the start date used to pass everything (owner, 2026-08-25). `durationDaysBetween`
 * ends in `d < 1 ? 1 : d`, so the reversed window came back as ONE day: the figure printed, the panel
 * turned green, the nudge stayed quiet — while the adapter that builds the payload floors the same
 * subtraction and dropped the duration entirely, so the request went out with none.
 */
describe("with the end date before the start date", () => {
  const backwards = { startDate: "2026-09-10", endDate: "2026-09-03" };
  /* The picks below are September 2026 days, and the start field refuses a day before TODAY since
     2026-10-07. Today is pinned to 1 September so these cases keep testing the order of the dates. */
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 1, 12));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("withholds the figure instead of reporting one day", async () => {
    await panel({ draft: withTiming(backwards) });
    expect(screen.queryByText(/billable days:/)).toBeNull();
    expect(screen.getAllByText("The end date is before the start date. Fix the dates to see billable days.").length).toBeGreaterThan(0);
  });

  it("blocks the send even once the acknowledgement is ticked", async () => {
    const handle = await panel({ draft: withTiming(backwards) });
    await handle.run(() => handle.store().actions.setChargedDaysUnderstood(true));
    const gate = gateWhen(handle.store().state.draft!.project, true);
    expect(gate.ok).toBe(false);
    expect(gate.reasons).toContain("gate.datesReversed");
  });

  /**
   * ~~«bounds each date input by the other, so the picker cannot offer one»~~ (`max`/`min` on native
   * inputs). Reversed by the owner on 2026-10-04: greyed-out days read as a broken field. Every day
   * shows; a backwards or same-day pick is REFUSED, with the reason in red at the bottom of the calendar.
   */
  it("refuses a start after the end with a red note, and takes one before it", async () => {
    const handle = await panel({ draft: withTiming({ startDate: "2026-09-10", endDate: "2026-09-12" }) });
    await handle.run(() => screen.getByRole("button", { name: "START DATE" }).click());
    const day = (n: number) => screen.getAllByRole("button", { pressed: false }).find((b) => b.textContent === String(n))!;

    await handle.run(() => day(20).click());
    expect(screen.getByRole("alert").textContent).toContain("Start can't be on or after the end date");
    expect(handle.store().state.draft!.project.timing.startDate).toBe("2026-09-10");

    await handle.run(() => day(11).click());
    expect(handle.store().state.draft!.project.timing.startDate).toBe("2026-09-11");
  });

  it("refuses an end before the start", async () => {
    const handle = await panel({ draft: withTiming({ startDate: "2026-09-10", endDate: "2026-09-12" }) });
    await handle.run(() => screen.getByRole("button", { name: "END DATE" }).click());
    const day = screen.getAllByRole("button", { pressed: false }).find((b) => b.textContent === "5")!;
    await handle.run(() => day.click());
    expect(screen.getByRole("alert").textContent).toContain("End can't be on or before the start date");
    expect(handle.store().state.draft!.project.timing.endDate).toBe("2026-09-12");
  });

  // Owner, 2026-10-07: the start date cannot be in the past. Today itself is allowed.
  it("refuses a start before today with its own note, and takes today", async () => {
    vi.setSystemTime(new Date(2026, 8, 8, 12));
    try {
      const handle = await panel({ draft: withTiming({ startDate: "2026-09-10", endDate: "2026-09-20" }) });
      await handle.run(() => screen.getByRole("button", { name: "START DATE" }).click());
      const day = (n: number) => screen.getAllByRole("button", { pressed: false }).find((b) => b.textContent === String(n))!;

      await handle.run(() => day(5).click());
      expect(screen.getByRole("alert").textContent).toContain("Start can't be in the past");
      expect(handle.store().state.draft!.project.timing.startDate).toBe("2026-09-10");

      await handle.run(() => day(8).click());
      expect(handle.store().state.draft!.project.timing.startDate).toBe("2026-09-08");
    } finally {
      vi.setSystemTime(new Date(2026, 8, 1, 12));
    }
  });

  // Owner, 2026-10-05: *"apply this rule if start and end is the same"*.
  it("refuses a start on the end's own day", async () => {
    const handle = await panel({ draft: withTiming({ startDate: "2026-09-10", endDate: "2026-09-12" }) });
    await handle.run(() => screen.getByRole("button", { name: "START DATE" }).click());
    const day = screen.getAllByRole("button", { pressed: false }).find((b) => b.textContent === "12")!;
    await handle.run(() => day.click());
    expect(screen.getByRole("alert").textContent).toContain("Start can't be on or after the end date");
    expect(handle.store().state.draft!.project.timing.startDate).toBe("2026-09-10");
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

  /**
   * The three variants are told apart by their ASK, not by their reason.
   *
   * They used to be matched on «don`t know your dates / end date / start date» — three different
   * reasons for one fact. The reason is shared, and since 2026-09-28 one short line: «… for lower
   * bids». What changes between the three is which date the renter is asked for, so that is what
   * these look for.
   */
  it("asks for both when neither is set", async () => {
    await panel({ draft: withTiming({ startDate: null, endDate: null }) });
    expect(screen.getByText(/Add dates for lower bids/)).toBeTruthy();
  });

  // A renter who has filled the start in is not told his dates are missing — he is told WHICH is.
  it("asks only for the end date when the start is set", async () => {
    await panel({ draft: withTiming({ endDate: null }) });
    expect(screen.getByText(/Add an end date for lower bids/)).toBeTruthy();
    expect(screen.queryByText(/Add dates for lower bids/)).toBeNull();
  });

  // The prototype gated this notice on the end date alone, so this branch was unreachable in it.
  it("asks only for the start date when the end is set — a branch the prototype could never show", async () => {
    await panel({ draft: withTiming({ startDate: null }) });
    expect(screen.getByText(/Add a start date for lower bids/)).toBeTruthy();
  });

  it("is one line: short, small, and truncated rather than wrapped (owner, 2026-09-28)", async () => {
    await panel({ draft: withTiming({ endDate: null }) });
    const text = screen.getByText("Add an end date for lower bids");
    expect(text.className).toContain("truncate");
    expect(text.closest("p")!.getAttribute("title")).toBe("Add an end date for lower bids");
  });

  it("no longer says «Suppliers quote you a … rate» under the billing basis (owner, 2026-09-28)", async () => {
    await panel(); // bills monthly
    expect(screen.queryByText(/Suppliers quote you/)).toBeNull();
  });

  it("shows no nudge when both dates are set", async () => {
    await panel();
    // Matched on the reason the notice actually carries. It matched «Suppliers quote lower», which
    // stopped existing when that copy was corrected — leaving an assertion that passed because its
    // needle was gone rather than because the notice was.
    expect(screen.queryByText(/for lower bids/)).toBeNull();
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

describe("hours (MREQ-AC-37)", () => {
  it("offers the platform's hour options", async () => {
    const handle = await panel();
    await handle.run(() => screen.getByText(/MORE DETAILS/).closest("button")!.click());

    for (const h of ["8", "10", "12"]) expect(screen.getByRole("button", { name: h })).toBeTruthy();
  });

  it("no longer asks for an overtime rate", async () => {
    // Retired 2026-09-04 with the app: neither side is asked for one, so a picker here could only
    // write a term the supplier is never shown and the quotation must then hide.
    const handle = await panel();
    await handle.run(() => screen.getByText(/MORE DETAILS/).closest("button")!.click());

    for (const o of ["Without", "1.5×", "2×"]) expect(screen.queryByRole("button", { name: o })).toBeNull();
  });

  it("changing the hours re-asks the acknowledgement, since the sentence quotes them", async () => {
    const handle = await panel();
    await handle.run(() => handle.store().actions.setChargedDaysUnderstood(true));
    await handle.run(() => screen.getByText(/MORE DETAILS/).closest("button")!.click());
    await handle.run(() => screen.getByRole("button", { name: "12" }).click());

    expect(handle.store().state.draft!.project.timing.hoursPerDay).toBe(12);
    expect(handle.store().state.chargedDaysUnderstood).toBe(false);
    expect(screen.getByText(/at 12 hours a day/)).toBeTruthy();
  });
});

/**
 * Owner, 2026-09-27: payment terms in the schedule panel, *"in the same row of the date-billing"*,
 * and «Your target price» hidden *"for now"* until it can be set per machine.
 */
describe("payment terms, in the dates and billing row", () => {
  it("is a box in the same grid as the dates and the billing basis", async () => {
    await panel();
    const payment = screen.getByText("PAYMENT TERMS");
    const billing = screen.getByText("HOW YOU'RE BILLED");
    const row = (el: Element) => el.closest(".grid.gap-4");
    expect(row(payment)).not.toBeNull();
    expect(row(payment)).toBe(row(billing));
  });

  it("does not show the target price while it is hidden", async () => {
    await panel();
    expect(screen.queryByText("BUDGET")).toBeNull();
    expect(screen.queryByText(/BUDGET CEILING/i)).toBeNull();
  });

  it("sets the payment term, and a second press on it clears it", async () => {
    const handle = await panel();
    await handle.run(() => screen.getByText("Net 30").click());
    expect(handle.store().state.draft!.preferences.payment.terms).toBe("net-30");
    await handle.run(() => screen.getByText("Net 30").click());
    expect(handle.store().state.draft!.preferences.payment.terms).toBeNull();
  });
});
