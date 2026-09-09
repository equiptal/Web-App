/**
 * **A TYPE search that finds nothing is where off-catalogue begins** (owner, 2026-09-09).
 *
 * *"I have a case: what if I want to add an equipment that is not in the taxonomy, like custom
 * equipment type, but the user didn't write it in the text — he wanted to add it, or to edit his
 * choice of an existing one. There is no path for it if he isn't on the intake"*, then *"maybe if he
 * searched in the type and didn't find it we show for him something here that will open the field of
 * custom type and the alert"*.
 *
 * Before this the canvas could only ARRIVE off-catalogue: the agent read a machine it could not place
 * and `deriveVerdict` called it `no-match`. A renter who wanted to name one himself — or who had
 * picked the wrong type and then found the catalogue held nothing for him — had to go back to «Your
 * request» and retype the whole thing.
 *
 * Two halves are pinned here, and they are separate on purpose:
 *  1. `SET_ITEM_OFF_CATALOGUE`, the reducer's counterpart to `SET_ITEM_SUBCATEGORY` — all three
 *     things that say «off-catalogue» move together (the 2026-09-06 trap: verdict, ids, typed name),
 *     and the round trip back is lossless.
 *  2. the dropdown's empty state, which is where the renter meets it: a row that quotes what he
 *     typed, and only while he has typed something.
 */

import { describe, expect, it, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Dropdown } from "@/components/Dropdown";
import { LocaleProvider } from "@/lib/i18n";
import { isCustomLine, customName } from "@/lib/contract/gates";
import { reducer, initialState } from "@/lib/store/rfq-store";
import { makeAgentDraft, makeItem, confirmedProject } from "../setup/canvas";

afterEach(cleanup);

/* ── 1 · the transition ──────────────────────────────────────────────────────────────────────── */

type State = Parameters<typeof reducer>[0];
type Action = Parameters<typeof reducer>[1];

/** A state holding one matched item, the way the canvas holds it. `makeAgentDraft` is the AGENT's
 *  half of a draft, which is the shape the store consumes; only `items` is read here. */
const stateWith = (over: Parameters<typeof makeItem>[0] = {}): State =>
  ({
    ...initialState,
    draft: makeAgentDraft({ items: [makeItem({ id: "a0", ...over })], project: confirmedProject() }),
  }) as unknown as State;

const run = (state: State, action: Action) => reducer(state, action);

describe("the reducer's off-catalogue transition", () => {
  it("clears the taxonomy, moves the verdict AND keeps his typed name — all three together", () => {
    const before = stateWith();
    const item0 = before.draft!.items[0];
    // The starting point is a real catalogue line: ids present, verdict not `no-match`.
    expect(item0.ref.subcategoryId).toBeTruthy();
    expect(isCustomLine(item0)).toBe(false);

    const after = run(before, { t: "SET_ITEM_OFF_CATALOGUE", id: "a0", name: "water jetting unit" });
    const item = after.draft!.items[0];

    expect(item.verdict).toBe("no-match");
    expect(item.ref.categoryId).toBeNull();
    expect(item.ref.subcategoryId).toBeNull();
    // The size goes with the type: a size is a size OF something.
    expect(item.ref.measurementId).toBeNull();
    expect(item.customEquipment).toBe("water jetting unit");
    // Which is what every surface downstream branches on.
    expect(isCustomLine(item)).toBe(true);
    expect(customName(item)).toBe("water jetting unit");
  });

  it("is reversible: picking a real type ends the off-catalogue state and drops the name", () => {
    /* The 2026-09-06 bug in the other direction — a pick that cleared `isCustomLine` while leaving
       `verdict: "no-match"` made the row vanish. The two transitions have to be exact mirrors, or a
       renter who changes his mind twice ends up in a state neither of them describes. */
    const off = run(stateWith(), { t: "SET_ITEM_OFF_CATALOGUE", id: "a0", name: "water jetting unit" });
    const back = run(off, { t: "SET_ITEM_SUBCATEGORY", id: "a0", subcategoryId: "sub-crawler" });
    const item = back.draft!.items[0];

    expect(item.ref.subcategoryId).toBe("sub-crawler");
    expect(item.verdict).toBe("needs-validation");
    expect(item.customEquipment).toBeNull();
    expect(isCustomLine(item)).toBe(false);
  });

  it("accepts an empty name, so the gate can ask for it in the box the card opens", () => {
    // Reached by a renter who presses the row with the search cleared — the name is then owed, and
    // `customEquipmentMissing` is what says so.
    const after = run(stateWith(), { t: "SET_ITEM_OFF_CATALOGUE", id: "a0", name: "" });
    expect(customName(after.draft!.items[0])).toBe("");
    expect(isCustomLine(after.draft!.items[0])).toBe(true);
  });
});

/* ── 2 · where he meets it ───────────────────────────────────────────────────────────────────── */

/* EIGHT options at least: `Dropdown` only draws its search box past seven (`searchable`), and the
   whole of this half is about what the SEARCH does when it matches nothing. */
const types = Array.from({ length: 8 }, (_, i) => ({ value: `sub-${i}`, label: `Excavator ${i}` }));

const draw = async (onPick: (q: string) => void, options = types) => {
  render(
    <LocaleProvider initialLocale="en">
      <Dropdown
        value={null}
        options={options}
        placeholder="TYPE"
        searchPlaceholder="Search types…"
        label="Type"
        onChange={() => {}}
        emptyAction={{ label: "Add a custom equipment type", onPick }}
      />
    </LocaleProvider>,
  );
  /* Opened by PRESSING the trigger, which is what a renter does — and `defaultOpen` measures the
     trigger on a `requestAnimationFrame`, so it would need a frame waited on here for nothing. */
  await act(async () => {
    screen.getByRole("combobox", { name: "Type" }).click();
  });
};

/** The list's search box, which only exists past seven options (`searchable`). */
const search = () => screen.getByPlaceholderText("Search types…");

describe("the TYPE list's empty state offers the way out", () => {
  it("appears once a search matches nothing, and says what it is in general terms", async () => {
    /* ~~It quoted the search text: «Add «wat» as equipment we do not carry yet».~~ General on the
       owner's word (2026-09-09): *"make it general, add custom equipment type but show something that
       is not on moedatech etc"*. Quoting read as a promise about that text, and a search FRAGMENT is
       not a machine's name. */
    const onPick = vi.fn();
    await draw(onPick);

    // Nothing offered while the list still has matches: he has not failed to find anything yet.
    expect(screen.queryByText("Add a custom equipment type")).toBeNull();

    fireEvent.change(search(), { target: { value: "wat" } });

    fireEvent.click(screen.getByText("Add a custom equipment type"));
    // The typed text is still handed over — trimmed — even though the canvas no longer seeds a name
    // with it. A caller that wants it has it.
    expect(onPick).toHaveBeenCalledWith("wat");
  });

  it("is ONE line and nothing else", async () => {
    /* ~~A second, quieter line under it: «Something Moedatech does not list yet».~~ Removed (owner,
       2026-09-09: *"add a custom equipment type only"*). What the state MEANS is said in orange on
       the card the moment the box opens, so a second line here said it twice. */
    await draw(vi.fn());
    fireEvent.change(search(), { target: { value: "wat" } });
    const row = screen.getByText("Add a custom equipment type").closest("button")!;
    // `add` is the Material glyph's own ligature text, which counts in `textContent`. Everything
    // after it is the row's copy, and there is exactly one line of it.
    expect(row.textContent).toBe("addAdd a custom equipment type");
  });

  it("stays out of an empty list that nobody searched", async () => {
    /* An empty list with an empty box is «there is nothing here to pick at all» — a taxonomy that
       failed to load, or a size list waiting on a type. That is a different fault with a different
       answer, and offering to name a machine there would be answering the wrong question. */
    /* Eight options so the box exists, and a query that matches nothing — then CLEARED, which is the
       state this case is about: an empty list with an empty box. */
    await draw(vi.fn());
    fireEvent.change(search(), { target: { value: "wat" } });
    expect(screen.getByText("Add a custom equipment type")).toBeTruthy();
    fireEvent.change(search(), { target: { value: "" } });
    expect(screen.queryByText("Add a custom equipment type")).toBeNull();
  });

  it("does not fire on whitespace alone", async () => {
    const onPick = vi.fn();
    await draw(onPick);
    fireEvent.change(search(), { target: { value: "   " } });
    expect(screen.queryByText("Add a custom equipment type")).toBeNull();
    expect(onPick).not.toHaveBeenCalled();
  });
});

/* ── 3 · the CARD hands it over, whatever the type control already holds ─────────────────────────
   The owner asked *"for this custom why there is a case i didnt find this option"* over a screenshot
   of the TYPE list open on a card that already had «Articulating Boom Lift» chosen, searching «wat»,
   showing «—» and no row.

   Asserted against the SOURCE rather than a render, and deliberately: driving it through the card
   needs a taxonomy of more than seven subtypes (`Dropdown.searchable`), and the canvas harness's
   fixture has five — extending a fixture every create suite shares, to reach a rule that is one prop,
   costs more than it proves. What can go wrong here is the prop being made conditional on a chosen
   value, and that is exactly what this reads. */
describe("the card offers it whatever the TYPE control already holds", () => {
  const src = readFileSync(resolve(process.cwd(), "src/components/create/MachineCard.tsx"), "utf8");
  /** The TYPE control's own props, from its `value` line to the end of its `onChange`. */
  const typeControl = src.slice(src.indexOf("value={item.ref.subcategoryId}"), src.indexOf("actions.setItemSubcategory"));

  it("passes `emptyAction` on the TYPE control, gated ONLY by the feature flag", () => {
    expect(typeControl).toContain("emptyAction=");
    expect(typeControl).toContain("CUSTOM_EQUIPMENT_ENABLED");
    // The mutation this catches: withholding the row once a type is chosen, which would take away
    // the half of the owner's ask that is about EDITING a wrong choice.
    expect(typeControl).not.toMatch(/emptyAction=\{[^}]*subcategoryId\s*[?&]/);
  });

  it("keeps it off the SIZE control, which is empty for a different reason", () => {
    // A size list is empty until a type exists; offering to name a machine there answers a question
    // nobody asked. The type is where the catalogue actually fails.
    const sizeControl = src.slice(src.indexOf("value={item.ref.measurementId}"), src.indexOf("actions.setItemMeasurement"));
    expect(sizeControl).not.toContain("emptyAction=");
  });
});
