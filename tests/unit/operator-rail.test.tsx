import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { OperatorRail } from "@/components/create/OperatorRail";
import { OPERATOR_CERTIFICATES } from "@/lib/contract";
import { makeAgentDraft, makeItem, renderCanvas } from "../setup/canvas";

/**
 * MREQ-TC-17/18 — the operator rail.
 *
 * Two things here are easy to get wrong in a way nothing else notices. Accommodation and transport
 * are ONE renter-facing choice writing TWO contract fields, so a control that sets only half produces
 * a term pair the renter never agreed to. And the nationality free-text is only meaningful under
 * "Restricted" — left behind after switching back to "Any", it rides along on a request that now
 * accepts anyone.
 */

const rail = (opts: Parameters<typeof renderCanvas>[1] = {}) =>
  renderCanvas((store) => <OperatorRail item={store.state.draft!.items[0]} />, opts);

/* ── Opening is not answering (owner, 2026-09-01) ────────────────────────────────────────────────
   One control used to do both: the header toggle wrote `operatorNeeded` AND showed the panel, and
   the collapsed strip set «yes» on the press that opened it — so looking at the rail ordered an
   operator, and suppliers price one. `expanded` is local now; the ANSWER is the question at the top
   of the panel, and nothing else writes it. */
describe("turning the operator off (MREQ-AC-25)", () => {
  /* The question is a SWITCH now, not a pair of buttons — `role="switch"`, with the answer written
     beside it. What it pins is unchanged: the answer is written only here, and opening the panel
     writes nothing. */
  const askSwitch = () => screen.getByRole("switch");

  it("records 'no' from the question, and folds the rail back to its strip", async () => {
    const handle = await rail();
    expect(screen.getByText("FOOD")).toBeTruthy();

    await handle.run(() => askSwitch().click());

    expect(handle.store().state.draft!.items[0].operatorNeeded).toBe("no");
    /* The details go — there is no operator to feed or house — and the rail folds to the 72px strip
       it has always used for «no operator». Collapsed, not gone: a renter who answered by accident
       has to be able to find it, and pressing the strip only OPENS it (the test below). */
    expect(screen.queryByText("FOOD")).toBeNull();
    expect(screen.getByLabelText("The operator")).toBeTruthy();
  });

  it("reopening the strip ANSWERS NOTHING", async () => {
    const handle = await rail({ draft: makeAgentDraft({ items: [makeItem({ operatorNeeded: "no" })] }) });

    // An item that says «no» opens closed: the strip is what is on screen.
    const strip = screen.getByLabelText("The operator");
    await handle.run(() => strip.click());

    // Opened — and the answer is untouched, which is the whole point of the split.
    expect(handle.store().state.draft!.items[0].operatorNeeded).toBe("no");
    expect(screen.getByText("Do you want an operator with this equipment?")).toBeTruthy();
    expect(screen.queryByText("FOOD")).toBeNull();

    // Saying yes is a separate, deliberate press — and only then do the details appear.
    await handle.run(() => askSwitch().click());
    expect(handle.store().state.draft!.items[0].operatorNeeded).toBe("yes");
    expect(screen.getByText("FOOD")).toBeTruthy();
  });
});

describe("food, accommodation and transport (MREQ-AC-26)", () => {
  it("writes both accommodation and transport from one press", async () => {
    const handle = await rail();
    const field = screen.getByText("ACCOM. & TRANSPORT").closest("div")!.parentElement!;

    await handle.run(() => within(field).getByRole("button", { name: "Me" }).click());

    const op = handle.store().state.draft!.items[0].operator;
    expect(op.fatAccommodationTransport).toBe("me");
  });

  it("offers Supplier then Me on both, in that order (MREQ-AC-62)", async () => {
    await rail();
    expect(screen.getAllByRole("button", { name: "Supplier" }).length).toBe(2); // food + accommodation
    expect(screen.getAllByRole("button", { name: "Me" }).length).toBe(2);
    for (const label of ["FOOD", "ACCOM. & TRANSPORT"]) {
      const field = screen.getByText(label).closest("div")!.parentElement!;
      expect(within(field).getAllByRole("button").map((x) => x.textContent!.trim())).toEqual(["Supplier", "Me"]);
    }
  });

  it("does not block — food and accommodation are optional in the app (MREQ-AC-11)", async () => {
    const handle = await rail();
    const op = handle.store().state.draft!.items[0].operator;
    expect(op.fatFood).toBeNull();
    expect(op.fatAccommodationTransport).toBeNull();
    // No required dot on either label.
    for (const label of ["FOOD", "ACCOM. & TRANSPORT"]) {
      const row = screen.getByText(label).parentElement!;
      expect(row.querySelector(".bg-brand")).toBeNull();
    }
  });
});

describe("operator certificates (MREQ-AC-27)", () => {
  it("offers exactly the platform's operator certificate set", async () => {
    await rail();
    const field = screen.getByText("OPERATOR CERTIFICATES").closest("div")!.parentElement!;
    const labels = within(field)
      .getAllByRole("button")
      .map((b) => b.textContent!.trim());
    // Short chip forms; the stored codes are still OPERATOR_CERTIFICATES.
    expect(labels).toEqual(["TÜV", "SPSP", "Other"]);
    expect(OPERATOR_CERTIFICATES).toEqual(["tuv", "spsp", "other"]);
    // The prototype offered an "Any" operator certificate, which the platform has no code for.
    expect(labels).not.toContain("Any");
    // And SASO is gone: the normalization agent accepts only SPSP / TÜV on the operator dimension,
    // so offering it let a renter demand a cert no parse can produce.
    expect(labels).not.toContain("SASO");
  });

  it("reveals a free-text box for Other", async () => {
    const handle = await rail();
    expect(screen.queryByPlaceholderText("Name the certificate")).toBeNull();
    await handle.run(() => screen.getByRole("button", { name: "Other" }).click());
    expect(handle.store().state.draft!.items[0].operator.certificate).toContain("other");
    expect(screen.getByPlaceholderText("Name the certificate")).toBeTruthy();
  });
});

describe("nationality is HIDDEN (owner, 2026-09-22)", () => {
  async function openMore(handle: Awaited<ReturnType<typeof rail>>) {
    await handle.run(() => screen.getByText("MORE DETAILS").closest("button")!.click());
  }

  /* 🔴 **MREQ-AC-28 is WITHDRAWN on this panel**, not broken. Owner, on the app first
     (2026-09-21: *"remove operator nationality from all surfaces now, in request, bid, deal room"*)
     and then on the web: *"operator nationality is removed in the app, check it there and align web
     to it"*. The app hides its own control in `equipment_step.dart` and the web now hides this one;
     `term-visibility.ts` is the single rule, and `hidden-term-keys.test.ts` pins every surface.

     ~~It revealed a free-text list under «Restricted» and cleared it on «Any».~~
     ~~It capped that list at the contract's 100 characters.~~
     Both described a control nobody can reach. What replaces them is the pair of rules that fail
     SILENTLY if this is ever done carelessly: the STATE must survive, and the panel must still be
     able to read complete. */
  it("draws neither the choice nor the list it used to reveal", async () => {
    const handle = await rail();
    await openMore(handle);
    expect(screen.queryByText("NATIONALITY")).toBeNull();
    expect(screen.queryByPlaceholderText("Which nationalities work for you?")).toBeNull();
  });

  /* 🔴 **The field is still WRITTEN and still SENT.** The app keeps `_operatorNationality`
     loaded from the item and written back by `_saveCurrentEquipment`, so editing a request created
     before the term was hidden preserves what it holds. A "cleanup" that dropped it from the draft
     would clear it on the next save, silently, on data the renter cannot see to restore. */
  it("keeps the value on the draft, so an older request is not cleared by an edit", async () => {
    const handle = await rail();
    await handle.run(() => {
      handle.store().actions.patchItemOperator(handle.store().state.draft!.items[0].id, {
        nationality: "restricted",
        nationalityCustom: "Filipino, Indian",
      });
    });
    expect(handle.store().state.draft!.items[0].operator.nationality).toBe("restricted");
    expect(handle.store().state.draft!.items[0].operator.nationalityCustom).toBe("Filipino, Indian");
    // …and it is still not drawn.
    await openMore(handle);
    expect(screen.queryByText("NATIONALITY")).toBeNull();
  });

  it("reads the night shift as words, not a bare boolean", async () => {
    const handle = await rail();
    await openMore(handle);
    expect(screen.getByText("Day only")).toBeTruthy();
    // Toggle is role="switch", not a button.
    await handle.run(() => screen.getAllByRole("switch").at(-1)!.click());
    expect(handle.store().state.draft!.items[0].operator.nightShift).toBe(true);
    expect(screen.getByText("Included")).toBeTruthy();
  });
});
