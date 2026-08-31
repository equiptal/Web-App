import { describe, it, expect } from "vitest";
import {
  EMPTY_SELECTION,
  documentsTargetUnit,
  filterBySource,
  isClosedGroup,
  isClosedRequest,
  railTiles,
  requestActions,
  resolveSelection,
  selectedGroup,
  selectedItem,
  sourceCounts,
  termsDial,
  type WorkspaceBid,
} from "@/lib/contract/workspace";
import type { RequestGroup, RequestListItem, RequestStatus } from "@/lib/contract/requests";
import type { BidCard, TermRow, TermState } from "@/lib/contract/bids";

function item(id: string, status: RequestStatus = "OPEN", qty = 1, imageUrl: string | null = null): RequestListItem {
  return {
    id,
    expiresAt: null,
    requestGroupId: null,
    projectId: null,
      displayId: `REQ-${id}`,
    code: `REQ-${id}`,
    groupRef: null,
    type: "BROADCAST",
    status,
    urgency: null,
    rentalType: null,
    city: "Riyadh",
    startDate: null,
    endDate: null,
    durationDays: null,
    createdAt: null,
    bidCount: 0,
    renteeEditUsed: false,
    requiredCerts: [],
    mobByRentee: null,
    demobByRentee: null,
    item: { name: `item ${id}`, nameAr: "", qty, imageUrl, imageIsPhoto: false, categoryId: null },
  };
}

function group(id: string, items: RequestListItem[], groupRef: string | null = null): RequestGroup {
  return {
    id,
    expiresAt: null,
    groupRef,
    items,
    city: "Riyadh",
    neighbourhood: null,
    locationLabel: "Riyadh",
    address: "Riyadh",
    createdAt: null,
    type: "BROADCAST",
    totalBids: items.reduce((s, i) => s + i.bidCount, 0),
    totalUnits: items.reduce((s, i) => s + (i.item?.qty ?? 1), 0),
    asap: false,
  };
}

function bid(id: string, source: "app" | "offline"): WorkspaceBid {
  return { card: { id } as BidCard, source };
}

describe("isClosedRequest", () => {
  it("treats every end-of-life status as closed, whatever its case", () => {
    for (const s of ["CLOSED", "HUB_CLOSED", "EXPIRED", "FORCE_EXPIRED", "closed"]) {
      expect(isClosedRequest(s)).toBe(true);
    }
  });

  it("leaves live requests open", () => {
    for (const s of ["OPEN", "ACTIVE", "PARTIALLY_ACCEPTED", "ACCEPTED"]) {
      expect(isClosedRequest(s)).toBe(false);
    }
  });
});

describe("isClosedGroup", () => {
  it("stays open while one item is live", () => {
    expect(isClosedGroup(group("g", [item("a", "CLOSED"), item("b", "OPEN")]))).toBe(false);
  });

  it("closes only when every item has", () => {
    expect(isClosedGroup(group("g", [item("a", "CLOSED"), item("b", "EXPIRED")]))).toBe(true);
  });

  it("does not call an empty group closed", () => {
    expect(isClosedGroup(group("g", []))).toBe(false);
  });
});

describe("railTiles", () => {
  it("names a multi-item submission by its RFQ code and a lone request by its REQ id", () => {
    const tiles = railTiles([
      group("g1", [item("a"), item("b")], "RFQ-00067"),
      group("g2", [item("c")]),
    ]);
    expect(tiles.map((t) => t.label)).toEqual(["RFQ-00067", "REQ-c"]);
  });

  it("counts units across the group and takes the first image there is", () => {
    const tiles = railTiles([group("g1", [item("a", "OPEN", 2, null), item("b", "OPEN", 3, "pic.png")])]);
    expect(tiles[0].units).toBe(5);
    expect(tiles[0].imageUrl).toBe("pic.png");
  });

  /**
   * Several MACHINES is not several of ONE (owner, 2026-08-26).
   *
   * The rail badged both as «xN», so an excavator + a loader + a crane read as three of something.
   * The two counts are now separate fields and the tile draws a stack for one and «xN» for the other.
   */
  it("counts line items apart from units", () => {
    const multiItem = railTiles([group("g1", [item("a", "OPEN", 2), item("b", "OPEN", 3)])])[0];
    expect(multiItem.items).toBe(2);
    expect(multiItem.units).toBe(5);
  });

  it("reports one item for a lone request however many units it asks for", () => {
    const multiUnit = railTiles([group("g1", [item("a", "OPEN", 4)])])[0];
    expect(multiUnit.items).toBe(1);
    expect(multiUnit.units).toBe(4);
  });
});

describe("resolveSelection", () => {
  const groups = [group("g1", [item("a"), item("b")]), group("g2", [item("c")])];
  const bids = [bid("x", "app"), bid("y", "offline")];

  it("falls back to the first of everything when nothing is chosen", () => {
    expect(resolveSelection(groups, bids, EMPTY_SELECTION)).toEqual({ groupId: "g1", itemId: "a", bidId: "x" });
  });

  it("keeps a selection that is still valid", () => {
    const wanted = { groupId: "g1", itemId: "b", bidId: "y" };
    expect(resolveSelection(groups, bids, wanted)).toEqual(wanted);
  });

  it("repairs an item that belongs to a different group", () => {
    // 'a' is g1's item; asking for it under g2 must not leak across.
    expect(resolveSelection(groups, bids, { groupId: "g2", itemId: "a", bidId: "x" })).toEqual({
      groupId: "g2",
      itemId: "c",
      bidId: "x",
    });
  });

  it("drops a bid that is not among the ones loaded", () => {
    expect(resolveSelection(groups, bids, { groupId: "g1", itemId: "a", bidId: "gone" }).bidId).toBe("x");
  });

  it("selects no bid at all when none have arrived", () => {
    expect(resolveSelection(groups, [], { groupId: "g1", itemId: "a", bidId: "x" }).bidId).toBeNull();
  });

  it("returns an empty selection when there are no requests", () => {
    expect(resolveSelection([], [], EMPTY_SELECTION)).toEqual(EMPTY_SELECTION);
  });

  it("survives a group with no items", () => {
    expect(resolveSelection([group("g0", [])], [], EMPTY_SELECTION)).toEqual({ groupId: "g0", itemId: null, bidId: null });
  });
});

describe("selectedGroup / selectedItem", () => {
  const groups = [group("g1", [item("a"), item("b")])];

  it("finds what the resolved selection points at", () => {
    const sel = resolveSelection(groups, [], EMPTY_SELECTION);
    expect(selectedGroup(groups, sel)?.id).toBe("g1");
    expect(selectedItem(groups, sel)?.id).toBe("a");
  });

  it("returns null for a selection pointing nowhere", () => {
    expect(selectedGroup(groups, EMPTY_SELECTION)).toBeNull();
    expect(selectedItem(groups, EMPTY_SELECTION)).toBeNull();
  });
});

describe("documentsTargetUnit", () => {
  it("prefers a unit whose location the lessor confirmed", () => {
    const units = [
      { equipmentId: "a", locationSource: "bid_pin" },
      { equipmentId: "b", locationSource: "unit_yard" },
    ];
    expect(documentsTargetUnit(units)).toBe("b");
  });

  it("falls back to the first offered unit, so the link always lands somewhere", () => {
    expect(documentsTargetUnit([{ equipmentId: "a", locationSource: "listing_yard" }])).toBe("a");
    expect(documentsTargetUnit([{ equipmentId: "a" }])).toBe("a");
  });

  it("has nothing to open when nothing was offered", () => {
    expect(documentsTargetUnit([])).toBeNull();
    expect(documentsTargetUnit(null)).toBeNull();
    expect(documentsTargetUnit(undefined)).toBeNull();
  });
});

describe("requestActions — the app's post-bid edit rule", () => {
  const req = (status: RequestStatus, bidCount: number, renteeEditUsed = false) => ({ status, bidCount, renteeEditUsed });

  it("shows Edit on a live request whether or not bids have arrived", () => {
    expect(requestActions(req("OPEN", 0)).canEdit).toBe(true);
    expect(requestActions(req("ACTIVE", 4)).canEdit).toBe(true);
  });

  it("edits freely before any bid — no confirmation, no cap", () => {
    const a = requestActions(req("OPEN", 0));
    expect(a.editNeedsConfirm).toBe(false);
    expect(a.editCapUsed).toBe(false);
  });

  it("confirms the first edit once a bid exists, because it is the only one", () => {
    const a = requestActions(req("OPEN", 1));
    expect(a.editNeedsConfirm).toBe(true);
    expect(a.editCapUsed).toBe(false);
  });

  it("disables Edit once that one edit is spent, still showing it", () => {
    const a = requestActions(req("OPEN", 1, true));
    expect(a.canEdit).toBe(true);
    expect(a.editCapUsed).toBe(true);
    expect(a.editNeedsConfirm).toBe(false);
  });

  it("does not spend the cap on a request that never had bids", () => {
    // `renteeEditUsed` can be true from an earlier life; with no bids the edit is free again.
    expect(requestActions(req("OPEN", 0, true)).editCapUsed).toBe(false);
  });

  it("offers neither edit nor cancel once the request is over", () => {
    for (const s of ["CLOSED", "EXPIRED", "ACCEPTED"] as RequestStatus[]) {
      const a = requestActions(req(s, 2));
      expect(a.canEdit).toBe(false);
      expect(a.canCancel).toBe(false);
    }
  });

  it("allows cancelling while the request is live", () => {
    expect(requestActions(req("OPEN", 0)).canCancel).toBe(true);
    expect(requestActions(req("ACTIVE", 3)).canCancel).toBe(true);
  });
});

describe("termsDial", () => {
  const row = (key: string, state: TermState): TermRow => ({ key, labelEn: key, labelAr: key, state });
  // Only the two fields the dial reads; the rest of a BidCard is irrelevant here.
  const withTerms = (rows: TermRow[], negotiable: TermRow[] = []): BidCard =>
    ({ terms: { equipment: rows, contract: [], supplier: [] }, negotiableTerms: negotiable }) as unknown as BidCard;

  it("splits an app bid into met, against and unanswered", () => {
    const bid = withTerms([
      row("operator", "matched"),
      row("payment_terms", "conflict"),
      row("overtime_rate", "negotiating"),
    ]);
    expect(termsDial(bid, "app")).toEqual({ met: 1, against: 1, unanswered: 1, total: 3 });
  });

  it("counts an agreed term as met, since it is settled", () => {
    expect(termsDial(withTerms([row("operator", "agreed")]), "app").met).toBe(1);
  });

  it("leaves an off-platform bid nothing unanswered — a form answer is final", () => {
    // 'grey' is unanswered and is dropped for off-platform; the two answers are all that remain.
    const bid = withTerms([
      row("safety_certifications", "matched"),
      row("fuel_responsibility", "conflict"),
      row("payment_terms", "grey"),
    ]);
    expect(termsDial(bid, "offline")).toEqual({ met: 1, against: 1, unanswered: 0, total: 2 });
  });

  it("counts every answered term off-platform, not only the app's six", () => {
    const bid = withTerms([row("delivery_window", "matched"), row("insurance_cover", "matched")]);
    // Neither key is one of the app's negotiable six, so the app reading sees nothing at all.
    expect(termsDial(bid, "offline").total).toBe(2);
    expect(termsDial(bid, "app").total).toBe(0);
  });

  it("reports an empty dial rather than a full one when there are no terms", () => {
    expect(termsDial(withTerms([]), "app")).toEqual({ met: 0, against: 0, unanswered: 0, total: 0 });
  });
});

describe("filterBySource / sourceCounts", () => {
  const bids = [bid("x", "app"), bid("y", "offline"), bid("z", "app")];

  it("admits everything under All", () => {
    expect(filterBySource(bids, "all")).toHaveLength(3);
  });

  it("narrows to one source and keeps the loaded order", () => {
    expect(filterBySource(bids, "app").map((b) => b.card.id)).toEqual(["x", "z"]);
    expect(filterBySource(bids, "offline").map((b) => b.card.id)).toEqual(["y"]);
  });

  it("counts each position", () => {
    expect(sourceCounts(bids)).toEqual({ all: 3, app: 2, offline: 1 });
  });
});
