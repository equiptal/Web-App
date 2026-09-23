import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { RowMenu } from "@/components/projects/RowMenu";
import type { Award, ChartGroup } from "@/lib/contract/award";

/**
 * W-T15 — the row menu, which is where every action on this chart lives.
 *
 * The list differs four ways and each difference is a decision, so each is pinned: an un-awarded row
 * has no marks; a work order is never awarded from here and carries none of the three marketplace
 * links; an unfiled row says *File in a project*; and a mark entry toggles rather than doubling the
 * list with an "undo" twin.
 */

const award = (over: Partial<Award> = {}): Award => ({
  id: "a1",
  supplierId: null,
  supplierName: "Zahid Tractor",
  units: 2,
  mobilizationAmount: null,
  demobilizationAmount: null,
  rentalBasis: "monthly",
  rateAmount: 8600,
  mobilizedAt: null,
  demobilizedAt: null,
  documents: [],
  awardedAt: null,
  ...over,
});

const group = (kind: ChartGroup["kind"]): Pick<ChartGroup, "kind"> => ({ kind });

/** Every action wired, so what is ABSENT from the menu is the component's decision, not the test's. */
const all = () => ({
  onAward: vi.fn(),
  onChangeAward: vi.fn(),
  onAttachDocument: vi.fn(),
  onMark: vi.fn(),
  onOpenRequest: vi.fn(),
  onQuotation: vi.fn(),
  onDealRoom: vi.fn(),
  onReviewBids: vi.fn(),
  onEditWorkOrder: vi.fn(),
  onDeleteWorkOrder: vi.fn(),
  onRemoveFromProject: vi.fn(),
  onFileInProject: vi.fn(),
});

/** Everything here needs the locale, so it is wrapped once rather than in every case. */
function mount(ui: React.ReactElement) {
  cleanup();
  render(<LocaleProvider>{ui}</LocaleProvider>);
}

function open(ui: React.ReactElement): string[] {
  mount(ui);
  fireEvent.click(screen.getByRole("button", { name: /row actions/i }));
  // Only the text nodes: the icon is a ligature span, so raw textContent reads "handshakeAward".
  // It carries aria-hidden, so the ACCESSIBLE name is already correct — this is a reading problem
  // in the test, not a labelling one in the menu.
  return screen.getAllByRole("menuitem").map((b) =>
    [...b.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join("")
      .trim(),
  );
}

describe("what the menu offers", () => {
  it("a request nobody has awarded: award, the bids, AND the marks", () => {
    /* Marks no longer wait on an award (owner, 2026-08-31: *"I don't want the user to follow a
       specific sequence"*). A machine arriving is a fact about the machine; who supplies it is a
       different fact, recorded at a different time and sometimes never. The row keeps its own mark,
       so there is nothing to award first and no invented supplier. */
    const items = open(<RowMenu group={group("request")} award={null} actions={all()} />);

    expect(items).toContain("Award");
    expect(items).toContain("Review the bids");
    expect(items).toContain("Mark mobilized");
    expect(items).toContain("Mark demobilized");
    /* ~~Papers still need an award: there is no id to file one under until one exists.~~ Reversed
       the same day (*"attach must alwasy also shown like mebo/demo"*), and the old reason was only
       half true — the backend's attach endpoint reads `-` in the award slot as *file this against
       the site*, which is where the agreement that predates any supplier belongs. */
    expect(items).toContain("Attach a document");
  });

  it("a work-order machine nobody supplies: the marks too", () => {
    /* Owner, 2026-08-31: *"I want them allowed even if no supplier is mentioned, so they are always
       visible."* A work order with no supplier line IS the renter's own fleet, and their own
       excavator still arrives on a Tuesday — hiding the mark behind an award made the one kind of
       machine needing no supplier the one kind that could not be tracked. */
    const items = open(<RowMenu group={group("work_order")} award={null} actions={all()} />);

    expect(items).toContain("Mark mobilized");
    expect(items).toContain("Mark demobilized");
    /* And Award, because the supplier section can be left blank on the form (owner, 2026-08-31) —
       without this the machine had no way to name a supplier later except by reopening the order. */
    expect(items).toContain("Award");
    // A paper still needs an award to hang on: there is no id to file one under yet.
    expect(items).toContain("Attach a document"); // see the note above — it no longer waits on an award
  });

  it("an awarded request: marks, papers, and the three navigation links", () => {
    const items = open(<RowMenu group={group("request")} award={award()} actions={all()} />);

    expect(items).toEqual(
      expect.arrayContaining([
        "Attach a document",
        "Mark mobilized",
        "Mark demobilized",
        "Open the request",
        "Our quotation",
        "Open the deal room",
        "Change the award",
      ]),
    );
    // Award is not offered twice — the awarded row changes its award instead.
    expect(items).not.toContain("Award");
  });

  it("a work order: never awarded here, and none of the three links", () => {
    const items = open(<RowMenu group={group("work_order")} award={award()} actions={all()} />);

    expect(items).toContain("Edit the work order");
    /* ONE red door, not two (owner, 2026-08-31). A work order used to carry *Remove from the
       project* AND *Delete the work order*, which asked the renter to know that for this kind of row
       those are the same act — the site is the only place a work order exists. The dialog behind the
       one entry is where that is said, and where the move is offered instead. */
    expect(items).toContain("Remove from the project");
    expect(items).not.toContain("Delete the work order");
    // It went to nobody. Showing these greyed out would imply the renter could have had them.
    expect(items).not.toContain("Open the request");
    expect(items).not.toContain("Our quotation");
    expect(items).not.toContain("Open the deal room");
  });

  it("a work order with no award yet IS offered Award", () => {
    /* ~~It is awarded on its own form, the moment it exists.~~ Only if the renter filled the
       supplier section in (owner, 2026-08-31). Leaving it blank is normal — they may not know yet,
       or it is their own fleet — and it left the machine with no way to name a supplier afterwards.
       The dialog is the same *who supplies it* section the form carries. */
    const items = open(<RowMenu group={group("work_order")} award={null} actions={all()} />);

    expect(items).toContain("Award");
    // Bids remain marketplace-only: a work order went out to nobody.
    expect(items).not.toContain("Review the bids");
  });

  it("an unfiled row says File in a project, not Move", () => {
    const items = open(<RowMenu group={group("request")} award={null} unfiled actions={all()} />);
    expect(items).toContain("File in a project");
    expect(items).not.toContain("Remove from the project");
  });

  it("hides an action that has no handler rather than showing a dead entry", () => {
    // W-T18 and W-T19 supply some of these later. An entry that does nothing when pressed is worse
    // than one that is not there, because the renter tries it twice.
    const items = open(<RowMenu group={group("request")} award={award()} actions={{ onAttachDocument: vi.fn() }} />);
    expect(items).toEqual(["Attach a document"]);
  });
});

describe("the marks toggle", () => {
  it("sets today's date when unset", () => {
    const actions = all();
    mount(<RowMenu group={group("request")} award={award()} actions={actions} today="2026-09-04" />);
    fireEvent.click(screen.getByRole("button", { name: /row actions/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark mobilized" }));

    expect(actions.onMark).toHaveBeenCalledWith("mobilizedAt", "2026-09-04");
  });

  it("clears it when already set, from the same entry", () => {
    const actions = all();
    mount(<RowMenu group={group("request")} award={award({ mobilizedAt: "2026-09-04" })} actions={actions} today="2026-09-30" />);
    fireEvent.click(screen.getByRole("button", { name: /row actions/i }));

    // One entry, reading its opposite — a separate "undo" twin would double the list to say the
    // same thing, and a mistyped date is the common case.
    fireEvent.click(screen.getByRole("menuitem", { name: "Undo mobilized" }));
    expect(actions.onMark).toHaveBeenCalledWith("mobilizedAt", null);
  });
});

describe("where the layer opens", () => {
  /* Found on staging, 2026-08-31: the chart body is `max-h-[64vh] overflow-y-auto`, and an
     `absolute` menu is clipped by THAT box, not by the window. On a six-entry list the last two
     entries — *Change the award* and the red *Remove from the project* — sat at 725px and 756px
     against a container ending at 702px: rendered, focusable, invisible. Flipping upward could not
     save it, because a 207px list fits on neither side of a box with ~155px below the row and ~81px
     above. Only leaving the scroll box does. */

  it("is anchored to its row by layout, not by measured coordinates", () => {
    /* ~~`position: fixed`, so an ancestor's overflow cannot clip it.~~ Reverted the same day, and
       the revert is right: the chart body that clipped it (`max-h-[64vh] overflow-y-auto`) was
       removed by the owner, so fixed had nothing left to buy and two costs of its own — a menu that
       opened away from its row, because fixed coordinates are a snapshot taken before the layout
       change that opening causes, and a shaking page, because re-placing on every captured scroll
       event re-rendered the row whether the numbers moved or not.

       So this pins the property that matters now: placed by LAYOUT, inside the trigger's own
       relative box, where it cannot come unstuck from the ⋮ it belongs to. */
    mount(<RowMenu group={group("work_order")} award={award()} actions={all()} />);
    fireEvent.click(screen.getByRole("button", { name: /row actions/i }));

    const menu = screen.getByRole("menu");
    expect(menu.className).toMatch(/\babsolute\b/);
    expect(menu.style.position).not.toBe("fixed");
    // And its box is the trigger's, so the two move together.
    expect(menu.closest("div.relative")).toBeTruthy();
  });

  it("shows every entry, with the destructive one last", () => {
    // The clipping hid exactly the tail of the list, so the tail is what this pins.
    const items = open(<RowMenu group={group("work_order")} award={award()} actions={all()} />);
    expect(items.at(-1)).toBe("Remove from the project");
    expect(items).toContain("Change the award");

    const last = screen.getByRole("menuitem", { name: "Remove from the project" });
    expect(last.className).toMatch(/text-danger/);
  });
});

describe("attaching a paper", () => {

  /* *"attach must alwasy also shown like mebo/demo"* (owner, 2026-08-31). It used to appear only on
     an awarded row, because a paper hangs on an award. The backend never agreed: its attach endpoint
     has always taken `-` in the award slot to file a paper against the SITE, for exactly the paper
     that belongs to no single award — a framework agreement signed before anyone is named. */

  it("is offered on a row nobody has awarded", () => {
    const items = open(<RowMenu group={group("work_order")} award={null} actions={all()} />);
    expect(items).toContain("Attach a document");
  });

  it("is offered on an unawarded request too", () => {
    const items = open(<RowMenu group={group("request")} award={null} actions={all()} />);
    expect(items).toContain("Attach a document");
  });

  it("sits with the marks, not behind them", () => {
    // The three that no longer wait on an award, in one list.
    const items = open(<RowMenu group={group("work_order")} award={null} actions={all()} />);
    expect(items).toContain("Mark mobilized");
    expect(items).toContain("Mark demobilized");
    expect(items).toContain("Attach a document");
  });
});
