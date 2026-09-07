import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AiRankPanel } from "@/components/workspace/AiRankPanel";
import { LocaleProvider } from "@/lib/i18n";
import type { BidCard } from "@/lib/contract/bids";
import type { WorkspaceBid } from "@/lib/contract/workspace";

/**
 * The assistant under the comparison: the ranking CRITERIA on the page, and the conversation in a
 * panel of its own (owner, 2026-09-08).
 *
 * ~~A preset row with a one-line input beside it.~~ A conversation in a text field the width of a
 * sentence is a conversation nobody has; prod gives it a column, and so does this.
 */
/* The deterministic layer has its own tests (`comparison.test.ts`, `agent-bids`); stubbing it here
   keeps this file about the PANEL — and stops a minimal bid fixture from throwing inside
   `buildItemComparison`, which the panel catches as "the assistant could not answer". */
vi.mock("@/lib/contract/comparison", () => ({ buildItemComparison: () => ({ columns: [{ bid: { id: "b1" } }], excluded: [] }) }));
vi.mock("@/lib/contract/agent-bids", async (orig) => ({
  ...(await orig<typeof import("@/lib/contract/agent-bids")>()),
  bidColumnToComputed: () => ({ bid_id: "b1" }),
}));

vi.mock("@/lib/api/client", () => ({
  recommendBids: vi.fn(async () => ({
    agent: true,
    result: { ranking: [{ bid_id: "b1", rank: 1, recognition: null }], recommendation: { pick_bid_id: "b1", reasons: [{ tag: "cost-shift", text: "Cheapest once transport is counted" }] } },
  })),
  askBids: vi.fn(async () => ({
    agent: true,
    result: { reply: "Al Faisal can start on Sunday.", ranking: [], pick_bid_id: "b1", confidence: 0.8, interpretation: "read as: soonest start", changes: null },
  })),
}));

const bc = (p: Partial<BidCard>): BidCard =>
  ({
    id: "b1", status: "PENDING", supplierId: null, supplierCompanyId: null, supplierName: "Al Faisal", verified: false, rating: null,
    distanceKm: null, submittedAt: null, validUntil: null, price: 1000, mobPrice: null, demobPrice: null, priceUnit: "PER_MONTH",
    duration: null, numberOfUnits: 1, unitsOffered: 1, openingPrice: null, lastCounterBy: null, requestChangedAt: null, liveStatus: null,
    reqMinYear: null, equipment: null, eqVerified: false,
    compliance: { entityType: "individual", activityLicense: false, taxNumber: false, nationalAddress: false, safety: false, saso: false, localContent: false },
    matchCount: 0, conflictCount: 0, dealRoomId: null, expired: false, note: null, requiredCerts: [], heldCertCodes: [],
    ownershipDocs: [], mobLeadTime: null, demobLeadTime: null, terms: { equipment: [], contract: [], supplier: [] },
    ...p,
  }) as BidCard;

const bids: WorkspaceBid[] = [{ card: bc({}), source: "app" } as WorkspaceBid];

function draw(ranking: { bidId: string | null; note: string | null } | null = null) {
  const onRanking = vi.fn();
  render(
    <LocaleProvider>
      <AiRankPanel bids={bids} durationDays={30} ranking={ranking} onRanking={onRanking} />
    </LocaleProvider>,
  );
  return onRanking;
}

beforeEach(() => vi.clearAllMocks());

describe("the criteria are on the page", () => {
  it("offers the agent's four presets", () => {
    draw();
    for (const label of ["Best overall", "Lowest cost", "Newest machine", "Most trusted"]) {
      expect(screen.getByText(label), label).toBeTruthy();
    }
  });

  it("ranks on the preset the renter presses, and hands the pick up", async () => {
    const onRanking = draw();
    fireEvent.click(screen.getByText("Lowest cost"));
    /* The NOTE is drawn from the `ranking` prop, which the workspace owns — so what this asserts is
       the hand-off, not a string this component keeps. */
    await vi.waitFor(() => expect(onRanking).toHaveBeenCalledWith({ bidId: "b1", note: "Cheapest once transport is counted" }));
    const { recommendBids } = await import("@/lib/api/client");
    expect(recommendBids).toHaveBeenCalledWith(expect.objectContaining({ preference: { preset: "lowest_cost" } }));
  });
});

describe("the conversation lives in its own panel", () => {
  it("draws no input until the panel is opened", () => {
    draw();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("opens a panel with the box in it, and closes again", () => {
    draw();
    fireEvent.click(screen.getByText(/ask the assistant/i));
    const panel = screen.getByRole("dialog");
    expect(panel).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Close"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the exchange, and re-ranks on the answer", async () => {
    const onRanking = draw();
    fireEvent.click(screen.getByText(/ask the assistant/i));
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "who starts soonest?" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await screen.findByText(/can start on Sunday/i);
    // His question stays on screen beside the answer — a reason that scrolls away is uncheckable.
    expect(screen.getByText("who starts soonest?")).toBeTruthy();
    expect(onRanking).toHaveBeenCalledWith({ bidId: "b1", note: "Al Faisal can start on Sunday." });
  });
});
