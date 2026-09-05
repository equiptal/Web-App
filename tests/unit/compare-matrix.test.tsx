import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { CompareMatrix } from "@/components/workspace/CompareMatrix";
import type { BidCard, TermRow } from "@/lib/contract/bids";
import type { WorkspaceBid } from "@/lib/contract/workspace";
import { LocaleProvider } from "@/lib/i18n";

/**
 * The comparison table, as the owner reshaped it on 2026-09-05:
 *
 *  · **Every term the bids answer gets a column** — it drew five, hard-coded, and dropped the rest.
 *  · **The answers are read, not clipped** — the cells were single-line `truncate`.
 *  · **One side at a time** — opening the terms folds the money away, and the other way round.
 *  · **No padlock** on the rail that opens the equipment map.
 */
const term = (key: string, labelEn: string, value: string, extra?: Partial<TermRow>): TermRow => ({
  key,
  labelEn,
  labelAr: labelEn,
  state: "matched",
  value,
  ...extra,
});

const bc = (p: Partial<BidCard>): BidCard => ({
  id: "b", status: "PENDING", supplierId: null, supplierCompanyId: null, supplierName: "S", verified: false, rating: null,
  distanceKm: null, submittedAt: null, validUntil: null, price: 1000, mobPrice: null, demobPrice: null,
  priceUnit: "PER_MONTH", duration: null, numberOfUnits: 1, unitsOffered: 1, openingPrice: null, lastCounterBy: null,
  requestChangedAt: null, liveStatus: null, reqMinYear: null, equipment: null, eqVerified: false,
  compliance: { entityType: "individual", activityLicense: false, taxNumber: false, nationalAddress: false, safety: false, saso: false, localContent: false },
  matchCount: 0, conflictCount: 0, dealRoomId: null, expired: false,
  note: null, requiredCerts: [], heldCertCodes: [], ownershipDocs: [], mobLeadTime: null, demobLeadTime: null,
  terms: { equipment: [], contract: [], supplier: [] },
  ...p,
} as BidCard);

const wb = (card: BidCard, source: "app" | "offline" = "app"): WorkspaceBid =>
  ({ card, source } as WorkspaceBid);

/** Two offers whose terms go well past the five the table used to know. */
function draw(bids?: WorkspaceBid[], legs?: { mobByRentee?: boolean | null; demobByRentee?: boolean | null }) {
  const rows = bids ?? [
    wb(
      bc({
        id: "b1",
        supplierName: "Al Faisal",
        terms: {
          equipment: [term("year", "Equipment year", "2019", { renteeValue: "2018" })],
          contract: [
            term("operator_included", "Operator", "Included", { renteeValue: "Included" }),
            term("payment_terms", "Payment", "net_30"),
            term("fat_food", "Food (F.A.T)", "supplier", { renteeValue: "supplier" }),
            term("maintenance", "Maintenance", "Supplier provides all scheduled maintenance"),
            // Retired everywhere on 2026-09-04 — it must not come back with the dynamic columns.
            term("overtime_rate", "Overtime", "0"),
          ],
          supplier: [term("cr", "CR", "yes"), term("vat", "VAT", "yes")],
        },
      }),
    ),
    wb(
      bc({
        id: "b2",
        supplierName: "Binladin Rentals",
        price: 1200,
        terms: {
          equipment: [term("year", "Equipment year", "2021", { renteeValue: "2018" })],
          // The other vocabulary for the same two facts: one column each, never two.
          contract: [term("operator", "Operator", "Included", { renteeValue: "Included" }), term("payment", "Payment", "net_60")],
          supplier: [],
        },
      }),
    ),
  ];
  return render(
    <LocaleProvider>
      <CompareMatrix
        bids={rows}
        durationDays={null}
        startDate={null}
        mobByRentee={legs?.mobByRentee ?? null}
        demobByRentee={legs?.demobByRentee ?? null}
        benched={new Set()}
        onBench={() => {}}
        ranking={null}
        rankBusy={false}
        onRank={() => {}}
      />
    </LocaleProvider>,
  );
}

/** Open the terms group — it starts folded to its rail. */
function openTerms() {
  fireEvent.click(screen.getByText("Terms"));
}

describe("every term the bids carry gets a column", () => {
  it("draws the ones the old fixed list dropped", () => {
    draw();
    openTerms();
    for (const label of ["Operator", "Equipment year", "Payment", "Food (F.A.T)", "Maintenance"]) {
      expect(screen.getAllByText(label).length, label).toBeGreaterThan(0);
    }
  });

  it("folds the two vocabularies into ONE column — `operator_included` and `operator` are one fact", () => {
    draw();
    openTerms();
    // Two suppliers, one «Operator» column: the label appears once, not once per key.
    expect(screen.getAllByText("Operator")).toHaveLength(1);
  });

  it("keeps the retired and the non-term rows out", () => {
    draw();
    openTerms();
    // Overtime: retired on nine surfaces on 2026-09-04, and its stored `'0'` is truthy.
    expect(screen.queryByText("Overtime")).toBeNull();
    // CR and VAT are company details; the equipment-and-docs check owns them.
    expect(screen.queryByText("CR")).toBeNull();
    expect(screen.queryByText("VAT")).toBeNull();
  });

  it("splits «you set» from «they offered» by whether the renter's own value is on the row", () => {
    draw();
    openTerms();
    expect(screen.getByText("Terms you set")).toBeTruthy();
    expect(screen.getByText("They offered on their own")).toBeTruthy();
  });
});

describe("a term the request never mentioned draws no column", () => {
  /**
   * An in-app bid carries a FIXED set of rows whether or not the request asked (`bidTerms`): the
   * unasked ones arrive `grey` with nothing on them. Read naively that is a fourteen-column table on
   * a request that set two terms.
   */
  it("drops the grey rows nobody was asked about", () => {
    draw([
      wb(bc({
        id: "x",
        supplierName: "A",
        terms: {
          equipment: [
            { key: "attachments", labelEn: "Attachments", labelAr: "الملحقات", state: "grey" },
            { key: "measurement", labelEn: "Measurement", labelAr: "القياس", state: "grey" },
          ],
          contract: [
            // Asked: the renter's own value is on the row.
            { key: "payment_terms", labelEn: "Payment terms", labelAr: "شروط الدفع", state: "grey", renteeValue: "net_30" },
            // Not asked, and nothing to say.
            { key: "breakdown_response_sla", labelEn: "Breakdown response", labelAr: "زمن الاستجابة", state: "grey" },
          ],
          supplier: [],
        },
      })),
    ]);
    openTerms();
    expect(screen.getByText("Payment terms")).toBeTruthy();
    for (const gone of ["Attachments", "Measurement", "Breakdown response"]) {
      expect(screen.queryByText(gone), gone).toBeNull();
    }
  });

  it("keeps a grey row that still carries a conflict or an answer", () => {
    draw([
      wb(bc({
        id: "x",
        supplierName: "A",
        terms: {
          equipment: [{ key: "year", labelEn: "Year of manufacture", labelAr: "سنة الصنع", state: "conflict", value: "2016" }],
          contract: [],
          supplier: [],
        },
      })),
    ]);
    openTerms();
    expect(screen.getByText("Year of manufacture")).toBeTruthy();
  });

  it("never folds the retired «Fuel type» row into the fuel RESPONSIBILITY column", () => {
    // An in-app bid spells fuel type as the bare `fuel`; responsibility is `fuel_responsibility` in
    // both vocabularies. Merging them put «Diesel» under a column meaning who pays for it.
    draw([
      wb(bc({
        id: "x",
        supplierName: "A",
        terms: {
          equipment: [{ key: "fuel", labelEn: "Fuel type", labelAr: "نوع الوقود", state: "matched", value: "diesel" }],
          contract: [term("fuel_responsibility", "Fuel", "supplier", { renteeValue: "supplier" })],
          supplier: [],
        },
      })),
    ]);
    openTerms();
    expect(screen.queryByText("Fuel type")).toBeNull();
    expect(screen.getByText("Fuel")).toBeTruthy();
    expect(screen.getAllByText("On supplier").length).toBe(1);
  });
});

describe("a responsibility says whose it is", () => {
  it("prints «On supplier» / «On rentee», never the bare party", () => {
    draw();
    openTerms();
    // The request put the operator's food on the supplier; the cell says so as a sentence.
    expect(screen.getAllByText("On supplier").length).toBeGreaterThan(0);
    // The bare party as a VALUE is gone. («Supplier» itself still heads the first column, which is
    // a different word doing a different job.)
    expect(screen.queryByText("Rentee")).toBeNull();
    expect(screen.queryByText("supplier")).toBeNull();
  });

  it("reads both wire spellings — the bare `supplier` and the newer `On Supplier`", () => {
    draw([
      wb(bc({ id: "x", supplierName: "A", terms: { equipment: [], contract: [term("fuel_responsibility", "Fuel", "supplier", { renteeValue: "supplier" })], supplier: [] } })),
      // The VALUE spelling is what this pins. The KEY is `fuel_responsibility` in both vocabularies;
      // the bare `fuel` is the retired fuel-TYPE row and is hidden (see the case above).
      wb(bc({ id: "y", supplierName: "B", terms: { equipment: [], contract: [term("fuel_responsibility", "Fuel", "On Renter", { renteeValue: "On Renter" })], supplier: [] } })),
    ]);
    openTerms();
    expect(screen.getAllByText("On supplier").length).toBeGreaterThan(0);
    expect(screen.getAllByText("On rentee").length).toBeGreaterThan(0);
  });
});

describe("a money cell with no figure says so in money words", () => {
  it("reads «Not quoted» on delivery and return, never the terms table's «Didn't say»", () => {
    draw();
    // Neither offer priced a leg: two suppliers × delivery and return.
    expect(screen.getAllByText("Not quoted").length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText("Didn't say")).toBeNull();
  });

  it("keeps «Not charged» for a leg the supplier excluded — a gap and a zero are not the same", () => {
    draw([
      wb(bc({ id: "x", supplierName: "A", mobExcluded: true, demobPrice: null })),
      wb(bc({ id: "y", supplierName: "B", mobPrice: 500, demobPrice: 500 })),
    ]);
    expect(screen.getAllByText("Not charged").length).toBeGreaterThan(0);
  });
});

describe("a transport leg the RENTER owns says so", () => {
  it("prints «On rentee» instead of the supplier's silence", () => {
    // An app bid leaves the price null when the leg is not the supplier's — the backend rejects a
    // bid that omits it when it IS his, so a null here can only mean «not mine to price».
    draw([wb(bc({ id: "x", supplierName: "A" }))], { mobByRentee: true, demobByRentee: true });
    expect(screen.getAllByText("On rentee").length).toBe(2);
    expect(screen.queryByText("Not quoted")).toBeNull();
  });

  it("beats a stray zero — the shared form stores an empty input as 0", () => {
    draw([wb(bc({ id: "x", supplierName: "A", mobPrice: 0, demobPrice: 0 }))], { mobByRentee: true });
    // Delivery is the renter's: «On rentee», not «0 SAR» which reads as free delivery.
    expect(screen.getAllByText("On rentee").length).toBe(1);
  });

  it("leaves the supplier's own leg alone", () => {
    draw([wb(bc({ id: "x", supplierName: "A", mobPrice: 1500, demobPrice: null }))], { mobByRentee: false, demobByRentee: false });
    expect(screen.queryByText("On rentee")).toBeNull();
    expect(screen.getAllByText("Not quoted").length).toBe(1); // the unpriced return only
  });

  it("says nothing new when the request never stated the leg", () => {
    draw([wb(bc({ id: "x", supplierName: "A" }))], {});
    expect(screen.queryByText("On rentee")).toBeNull();
  });
});

describe("an answer is read, never clipped", () => {
  it("wraps rather than truncating, and carries the whole string on the cell", () => {
    const { container } = draw();
    openTerms();
    const cell = screen.getByTitle("Supplier provides all scheduled maintenance");
    expect(cell).toBeTruthy();
    // The value itself is on two lines at most, not cut to one.
    expect(container.querySelector(".line-clamp-2")).toBeTruthy();
    expect(within(cell).getByText("Supplier provides all scheduled maintenance")).toBeTruthy();
  });
});

describe("one side of the table at a time", () => {
  it("folds the money when the terms open", () => {
    draw();
    // Money is open to begin with: its columns are on screen.
    expect(screen.getAllByText("Monthly rental").length).toBeGreaterThan(0);
    openTerms();
    // Both money groups are rails now — their column heads are gone.
    expect(screen.queryByText("Monthly rental")).toBeNull();
    expect(screen.queryByText("First cycle")).toBeNull();
  });

  it("and folds the terms again when a money group is reopened", () => {
    draw();
    openTerms();
    expect(screen.getAllByText("Terms you set").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Per cycle"));
    expect(screen.queryByText("Terms you set")).toBeNull();
    expect(screen.getAllByText("Monthly rental").length).toBeGreaterThan(0);
  });
});

describe("the rail that leaves the page", () => {
  it("carries no padlock — the map it opens is not gated", () => {
    const { container } = draw();
    const rail = screen.getByLabelText("Open the equipment map, with every offer on it");
    expect(rail).toBeTruthy();
    expect(within(rail).queryByText("lock")).toBeNull();
    expect(container.querySelector('[data-icon="lock"]')).toBeNull();
  });
});

/**
 * ── The table does not scroll inside itself (owner, 2026-09-04, again on 2026-09-05) ─────────────
 *
 * *"I want the compare table to not have this weird scroll inside the table while we have all this
 * empty space in the screen."* The matrix renders at full height and the PAGE carries it; only the
 * columns scroll, sideways. A vertical bar came back anyway, through CSS rather than layout: one
 * axis set to `auto` computes the other from `visible` to `auto`, so any child overhanging the strip
 * gave it a scrollbar of its own. Both of these fail silently — nothing throws, and it only shows on
 * a screenshot.
 */
describe("the table opens on «Per cycle», one group at a time", () => {
  it("shows the quoted figures and puts the other two on their rails", () => {
    draw();
    expect(screen.getAllByText("Monthly rental").length).toBeGreaterThan(0);
    // Rails, not groups: the words are there, their columns are not.
    expect(screen.queryByText("First cycle")).toBeNull();
    expect(screen.queryByText("Terms you set")).toBeNull();
  });

  it("the grand-total panel opens its three cost fields", () => {
    draw();
    fireEvent.click(screen.getByText("Grand total"));
    expect(screen.getAllByText("First cycle").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Every cycle after").length).toBeGreaterThan(0);
    // …and folds the one that was open.
    expect(screen.queryByText("Monthly rental")).toBeNull();
  });

  it("never leaves two groups open", () => {
    draw();
    fireEvent.click(screen.getByText("Grand total"));
    openTerms();
    expect(screen.getAllByText("Terms you set").length).toBeGreaterThan(0);
    expect(screen.queryByText("First cycle")).toBeNull();
    expect(screen.queryByText("Monthly rental")).toBeNull();
  });

  it("but folding one opens nothing — a renter may put them all away", () => {
    draw();
    // The open group folds by its own control; the label beside it is not a button.
    fireEvent.click(screen.getAllByLabelText("Fold this group away")[0]);
    expect(screen.queryByText("Monthly rental")).toBeNull();
    expect(screen.queryByText("First cycle")).toBeNull();
    expect(screen.queryByText("Terms you set")).toBeNull();
  });
});

describe("a term cell states the supplier's answer, not a verdict", () => {
  it("takes the supplier's half of a conflict detail, and marks it red", () => {
    draw([
      wb(bc({
        id: "x",
        supplierName: "A",
        terms: {
          equipment: [{
            key: "certs",
            labelEn: "Equipment certificate",
            labelAr: "شهادة المعدة",
            state: "conflict",
            detail: { en: "Renter: TÜV · Supplier: SPSP", ar: "المستأجر: TÜV · المؤجّر: SPSP" },
          }],
          contract: [],
          supplier: [],
        },
      })),
    ]);
    openTerms();
    // His answer, alone — the renter's ask is in the column head, not in the cell.
    const cell = screen.getByText("SPSP");
    expect(cell).toBeTruthy();
    expect(cell.className).toContain("text-danger");
    expect(screen.queryByText(/Renter: TÜV/)).toBeNull();
  });

  it("states the agreed value when the term matched", () => {
    draw([
      wb(bc({
        id: "x",
        supplierName: "A",
        terms: { equipment: [], contract: [{ key: "payment_terms", labelEn: "Payment terms", labelAr: "شروط الدفع", state: "matched", renteeValue: "net_30" }], supplier: [] },
      })),
    ]);
    openTerms();
    // «matched» means he accepted the renter's value, so printing it IS printing his answer.
    expect(screen.getAllByText(/Net 30/i).length).toBeGreaterThan(0);
  });

  it("does NOT print the renter's ask back at him on a term nobody answered", () => {
    draw([
      wb(bc({
        id: "x",
        supplierName: "A",
        terms: { equipment: [], contract: [{ key: "breakdown_response_sla", labelEn: "Breakdown response", labelAr: "زمن الاستجابة", state: "grey", renteeValue: "TWENTY_FOUR_HR" }], supplier: [] },
      })),
    ]);
    openTerms();
    expect(screen.getByText("Didn't say")).toBeTruthy();
    expect(screen.queryByText("24 hours")).toBeNull();
  });
});

describe("only the columns scroll, and only sideways", () => {
  const scroller = (c: HTMLElement) => c.querySelector('[data-pin="30.1"]') as HTMLElement;

  it("states BOTH axes on the column strip", () => {
    const { container } = draw();
    const cls = scroller(container).className;
    expect(cls).toContain("overflow-x-auto");
    // Left unstated, this is what put a 130px scrollbar inside a table with half a screen under it.
    expect(cls).toContain("overflow-y-clip");
  });

  it("draws the money breakdown OUTSIDE that strip, so nothing overhangs it", () => {
    const { container } = draw();
    // The totals are a rail until pressed (owner, 2026-09-06: the table opens on «Per cycle»), so
    // this opens the panel that holds the three cost fields before reaching for one of them.
    fireEvent.click(screen.getByText("Grand total"));
    // The «i» beside a money column opens the breakdown.
    // The «i» — the LAST control carrying that name; the first is the column's own sort button.
    fireEvent.click(screen.getAllByRole("button", { name: "First cycle" }).at(-1)!);
    const panel = screen.getByText("How first cycle is built");
    // In the page, not in the strip: an absolutely-placed panel inside it is what forced the bar,
    // and on the last column it was clipped by the horizontal scroller instead of overhanging it.
    expect(scroller(container).contains(panel)).toBe(false);
  });
});
