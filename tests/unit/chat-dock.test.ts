import { describe, it, expect } from "vitest";
import {
  arrivalNotice,
  dockTabs,
  dockUnreadTotal,
  inboxGroupKey,
  type DockAnchor,
} from "@/lib/contract/chat-dock";
import type { InboxBid } from "@/lib/contract/inbox";

/**
 * **V12 — the chat dock's rules** (spec 004 §6.9, 004a §2 + §2.1; RM3-AC-43…47, AC-62…64).
 *
 * The rules, not the chrome: which tabs exist, who counts as one counterparty, which tab carries
 * which badge, and when the arrival notice may appear. The rendered dock — the floating control, the
 * bubble's position, the absence of an edge rail — is manual-verify (RM3-TC-11); this repo's vitest
 * env is `node` and has no component harness.
 */

const row = (over: Partial<InboxBid> = {}): InboxBid => ({
  bidId: "b1",
  status: "PENDING",
  dealRoomId: null,
  dealRoomStatus: null,
  unreadCount: 0,
  currentPrice: null,
  priceUnit: null,
  agreedUnits: null,
  unitsOffered: 1,
  supplierName: "Ali",
  supplierId: "u1",
  supplierCompanyId: "co-1",
  supplierLogoUrl: null,
  equipmentName: null,
  request: { id: "r1", displayId: null, shortCode: null, equipmentSummary: null, groupId: "g1", location: null },
  equipmentType: { id: "t1", name: "Excavator" },
  createdAt: null,
  supplierStarted: false,
  ...over,
});

const anchor = (over: Partial<DockAnchor> = {}): DockAnchor => ({
  bidId: "b1",
  supplierCompanyId: "co-1",
  supplierId: "u1",
  supplierName: "Ali",
  dealRoomId: null,
  label: "Excavator",
  groupKey: "g1",
  ...over,
});

describe("dockTabs — a tab per ITEM, for ONE counterparty (RM3-AC-43/44/45)", () => {
  it("gives a tab to every bid this supplier holds in the RFQ group", () => {
    const tabs = dockTabs(anchor(), [
      row({ bidId: "b1" }),
      row({ bidId: "b2", equipmentType: { id: "t2", name: "Loader" } }),
      row({ bidId: "b3", equipmentType: { id: "t3", name: "Crane" } }),
    ]);
    expect(tabs.map((t) => t.bidId)).toEqual(["b1", "b2", "b3"]);
    expect(tabs.map((t) => t.label)).toEqual(["Excavator", "Loader", "Crane"]);
  });

  it("gives a single-bid supplier ONE tab, so the caller renders no strip (RM3-AC-44)", () => {
    expect(dockTabs(anchor(), [row({ bidId: "b1" })])).toHaveLength(1);
  });

  it("treats two MEMBERS of one firm as ONE counterparty (RM3-AC-45)", () => {
    // Same `supplierCompanyId`, different people — the backend already puts both in one channel.
    const tabs = dockTabs(anchor(), [
      row({ bidId: "b1", supplierId: "u1", supplierName: "Ali" }),
      row({ bidId: "b2", supplierId: "u2", supplierName: "Omar", equipmentType: { id: "t2", name: "Loader" } }),
    ]);
    expect(tabs.map((t) => t.bidId)).toEqual(["b1", "b2"]);
  });

  it("excludes a different firm's bid on the same item", () => {
    const tabs = dockTabs(anchor(), [row({ bidId: "b1" }), row({ bidId: "bX", supplierCompanyId: "co-2" })]);
    expect(tabs.map((t) => t.bidId)).toEqual(["b1"]);
  });

  it("excludes the same firm's bid in a DIFFERENT RFQ group — the strip is this RFQ's, not the inbox", () => {
    const other = row({ bidId: "bY", request: { ...row().request, id: "r9", groupId: "g9" } });
    expect(dockTabs(anchor(), [row({ bidId: "b1" }), other]).map((t) => t.bidId)).toEqual(["b1"]);
  });

  it("still gives the anchor bid a tab when the feed did not return it", () => {
    // Paging, or a feed failure. A dock that could not open the conversation for the bid on screen
    // would be a worse failure than a one-tab strip.
    const tabs = dockTabs(anchor({ dealRoomId: "dr-1" }), []);
    expect(tabs).toEqual([{ bidId: "b1", dealRoomId: "dr-1", label: "Excavator", unreadCount: 0, current: true }]);
  });

  it("carries each tab's own room — null means COMPOSE-ONLY, never a room to create on open", () => {
    const tabs = dockTabs(anchor(), [
      row({ bidId: "b1", dealRoomId: "dr-1" }),
      row({ bidId: "b2", dealRoomId: null, equipmentType: { id: "t2", name: "Loader" } }),
    ]);
    expect(tabs.map((t) => t.dealRoomId)).toEqual(["dr-1", null]);
  });

  it("marks exactly one tab current, so no other surface has to work out which bid is on screen", () => {
    const tabs = dockTabs(anchor(), [row({ bidId: "b1" }), row({ bidId: "b2" })]);
    expect(tabs.filter((t) => t.current).map((t) => t.bidId)).toEqual(["b1"]);
  });

  it("falls back to the request id when the fan-out group is absent — `no siblings`, never `all`", () => {
    const ungrouped = (bidId: string, requestId: string) =>
      row({ bidId, request: { ...row().request, id: requestId, groupId: null } });
    expect(inboxGroupKey(ungrouped("b1", "r1"))).toBe("r1");
    const tabs = dockTabs(anchor({ groupKey: "r1" }), [ungrouped("b1", "r1"), ungrouped("b2", "r2")]);
    expect(tabs.map((t) => t.bidId)).toEqual(["b1"]);
  });
});

describe("dockUnreadTotal — the badge on the control (RM3-AC-46)", () => {
  it("sums every tab, so the closed dock states what the open one would show", () => {
    const tabs = dockTabs(anchor(), [
      row({ bidId: "b1", unreadCount: 2 }),
      row({ bidId: "b2", unreadCount: 3 }),
    ]);
    expect(tabs.map((t) => t.unreadCount)).toEqual([2, 3]);
    expect(dockUnreadTotal(tabs)).toBe(5);
  });

  it("never reports a negative count from a malformed row", () => {
    expect(dockUnreadTotal(dockTabs(anchor(), [row({ bidId: "b1", unreadCount: -4 })]))).toBe(0);
  });
});

describe("arrivalNotice — refresh-timed, and silent on what is being read (RM3-AC-62/63)", () => {
  const tabs = () =>
    dockTabs(anchor(), [
      row({ bidId: "b1", unreadCount: 0 }),
      row({ bidId: "b2", unreadCount: 1, equipmentType: { id: "t2", name: "Loader" } }),
    ]);

  it("carries the request reference and the machine's serial, taken from the ASK", () => {
    // Only the ask carries a serial — §7.3 stamps it server-side from the resolved listing, and the
    // reply carries none.
    const notice = arrivalNotice(
      tabs(),
      { b2: { ref: "RQ-7F3A", serial: "SER-9", resolution: "provided" } },
      { open: false, bidId: null },
    );
    expect(notice?.bidId).toBe("b2");
    expect(notice?.reply).toEqual({ ref: "RQ-7F3A", serial: "SER-9", resolution: "provided" });
  });

  it("says nothing about the tab the renter is reading (RM3-AC-63)", () => {
    expect(arrivalNotice(tabs(), {}, { open: true, bidId: "b2" })).toBeNull();
  });

  it("still speaks for an unread tab while the dock is open on another one", () => {
    expect(arrivalNotice(tabs(), {}, { open: true, bidId: "b1" })?.bidId).toBe("b2");
  });

  it("says nothing when nothing is unread — a badge at zero is not news", () => {
    const quiet = dockTabs(anchor(), [row({ bidId: "b1", unreadCount: 0 })]);
    expect(arrivalNotice(quiet, {}, { open: false, bidId: null })).toBeNull();
  });

  it("appears for ordinary unread with no reply attached, rather than not at all", () => {
    const notice = arrivalNotice(tabs(), {}, { open: false, bidId: null });
    expect(notice?.reply).toBeNull();
    expect(notice?.unreadCount).toBe(1);
  });
});
