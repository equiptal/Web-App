import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  arrivalNotice,
  dockMessageView,
  dockTabs,
  dockUnreadTotal,
  inboxGroupKey,
  type DockAnchor,
} from "@/lib/contract/chat-dock";
import { mapReceivedBids, type InboxBid } from "@/lib/contract/inbox";
import { bidSupplierKey, mapBid } from "@/lib/contract/bids";

/**
 * **V12 — the chat dock's rules** (spec 004 §6.9, 004a §2 + §2.1; RM3-AC-43…47, RM3-AC-62…64).
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

/* ══════════════════════════════════════════════════════════════════════════════════════════════════
   RM3-AC-47 · OPENING A TAB CREATES NO DEAL ROOM (004a §4.5, §3.2d)

   The highest-consequence rule on this surface, and the one with no runtime test behind it. A
   `DealRoom` row sets `BID_OFFER_LOCKED` and **freezes the lessor's offered count** — so a dock that
   creates a room on mount, on open, or on a tab switch makes the shortfall ask of §6.3 permanently
   unanswerable: the renter asks for the missing machines and the lessor is no longer able to add them,
   because browsing his offer locked it.

   `ChatDock` is a client component and this repo's vitest env is `node` with no component harness, so
   the rule is pinned the way `bid-equipment-access.test.ts` pins the equipment route's write-freedom:
   against the source. The claim being asserted is **structural and complete** — the room-creating call
   exists exactly once in the file, lexically inside `send()`, and nothing that runs on its own
   (an effect, a memo, the mount, the open toggle, a tab press) can reach it.
   ══════════════════════════════════════════════════════════════════════════════════════════════════ */

const CHAT_DOCK = "src/components/map/ChatDock.tsx";
const dockSrc = readFileSync(resolve(process.cwd(), CHAT_DOCK), "utf8");

/** The `{…}` body of a named function declaration, by brace matching from its first `{`. */
function functionBody(source: string, declaration: string): { start: number; end: number } {
  const at = source.indexOf(declaration);
  if (at < 0) throw new Error(`declaration not found: ${declaration}`);
  const open = source.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return { start: open, end: i };
    }
  }
  throw new Error(`unbalanced body: ${declaration}`);
}

describe("opening a chat tab creates NO deal room (RM3-AC-47)", () => {
  it("calls the room-creating function EXACTLY ONCE in the whole component", () => {
    // One call site is what makes every other assertion here decisive: there is no second path to
    // audit. A second `ensureDealRoom(` anywhere in this file fails this line, wherever it was added.
    expect(dockSrc.match(/ensureDealRoom\(/g) ?? []).toHaveLength(1);
  });

  it("puts that one call INSIDE `send()` — the room-creating act, and the only one", () => {
    const body = functionBody(dockSrc, "async function send()");
    const call = dockSrc.indexOf("ensureDealRoom(");
    expect(call).toBeGreaterThan(body.start);
    expect(call).toBeLessThan(body.end);
  });

  it("reaches no room-creating client function by any other name", () => {
    // `ensureDealRoom` is the one wrapper over `POST /api/me/deal-rooms`. Importing the raw client
    // call, or the accept path, would create a room this test could not see through the wrapper.
    for (const bypass of ["startDealRoom", "acceptBid", "deal-rooms"]) {
      expect(dockSrc).not.toContain(bypass);
    }
  });

  it("runs NOTHING that creates a room before the send section — no effect, no memo, no mount", () => {
    // Everything above `── sending` is what the component does on its own: the REST refresh, the
    // focus/poll effects, the Stream connection, the tab memo, the fleet + reply memos, the notice.
    // A function declaration is hoisted, so an effect COULD call `send()` from above it — this asserts
    // it does not, which is what makes "only a send creates a room" true rather than merely arranged.
    const beforeSending = dockSrc.slice(0, dockSrc.indexOf("── sending"));
    // The call form, not the bare name — the import sits above and is not a call.
    expect(beforeSending).not.toMatch(/ensureDealRoom\(/);
    expect(beforeSending).not.toMatch(/\bsend\(\)/);
  });

  it("invokes `send()` from exactly two places, both of them the renter pressing send", () => {
    const callSites = dockSrc
      .split("\n")
      .filter((line) => /\bvoid send\(\)/.test(line));
    expect(callSites).toHaveLength(2);
    // The Enter key and the send button. Neither is a lifecycle hook, and no third caller exists.
    expect(callSites.filter((l) => /onKeyDown=/.test(l))).toHaveLength(1);
    expect(callSites.filter((l) => /onClick=/.test(l))).toHaveLength(1);
  });

  it("switches tab by setting state and nothing else (the press an unlocked offer cannot survive)", () => {
    // The tab handler is the likeliest place a room-creating "connect on switch" would be added.
    expect(dockSrc).toContain("onClick={() => setActiveBidId(tab.bidId)}");
  });

  it("opens the dock by toggling state and nothing else", () => {
    expect(dockSrc).toContain("onClick={() => setOpen((v) => !v)}");
  });

  it("renders a roomless tab as COMPOSE-ONLY — a note, never a creation", () => {
    // `!active?.dealRoomId` is the branch that would tempt an eager create. It renders copy.
    expect(dockSrc).toContain("{t.chatDock.composeOnly}");
  });

  it("hands the model a null room rather than one it made up", () => {
    // The rule at the model's own boundary: a tab for a bid with no room carries `dealRoomId: null`,
    // and `dockTabs` has no way to mint one. If it ever did, the component would inherit a room it
    // never created and the compose-only branch would stop rendering.
    const tabs = dockTabs(anchor({ dealRoomId: null }), [row({ bidId: "b1", dealRoomId: null })]);
    expect(tabs.map((t) => t.dealRoomId)).toEqual([null]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════
   RM3-AC-44 · A SINGLE BID GETS NO TAB STRIP
   ══════════════════════════════════════════════════════════════════════════════════════════════════ */

describe("no tab strip for a single bid (RM3-AC-44)", () => {
  it("gates the strip on `tabs.length > 1`, so one tab renders no strip at all", () => {
    // The model half is asserted above (`dockTabs` returns one tab). This is the half that lives in
    // the component: the condition the caller actually renders under. Together they close the AC as
    // far as a `node` env can — what stays UNPROVEN here is the PAINTED result, i.e. that the strip
    // element is absent from the DOM and leaves no empty row behind. That needs a component harness
    // (RM3-TC-11, manual-verify).
    expect(dockSrc).toContain("{tabs.length > 1 && (");
    const strip = dockSrc.indexOf('className="bm-chat-tabs"');
    const guard = dockSrc.indexOf("{tabs.length > 1 && (");
    expect(strip).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(strip); // the guard wraps the strip; it does not follow it
  });

  it("draws the strip in exactly one place, so there is no second ungated copy", () => {
    expect(dockSrc.match(/className="bm-chat-tabs"/g) ?? []).toHaveLength(1);
    expect(dockSrc.match(/\{tabs\.length > 1 &&/g) ?? []).toHaveLength(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════
   RM3-AC-63 / RM3-AC-64 · THE ARRIVAL NOTICE MAY NOT IMPLY IMMEDIACY

   Unread is REST on a 45-second poll, so the notice cannot know a message *just* arrived. The copy
   must state that a reply IS there. This asserts the words themselves, in both locales, because the
   defect is a copy edit away and no behavioural test would catch it.
   ══════════════════════════════════════════════════════════════════════════════════════════════════ */

describe("the arrival notice states a STATE, never an event (RM3-AC-63/64)", () => {
  const enSrc = readFileSync(resolve(process.cwd(), "src/lib/i18n/en.ts"), "utf8");
  const arSrc = readFileSync(resolve(process.cwd(), "src/lib/i18n/ar.ts"), "utf8");

  /** The `chatDock: { … }` block of a dictionary — the only copy the notice can render. */
  const dictBlock = (source: string): string => {
    const at = source.indexOf("chatDock: {");
    expect(at).toBeGreaterThan(-1);
    return source.slice(at, source.indexOf("\n  },", at));
  };

  /** One key's string value out of a dictionary block. */
  const copy = (source: string, key: string): string => {
    const m = new RegExp(`\\n\\s*${key}:\\s*"([^"]*)"`).exec(dictBlock(source));
    expect(m, `chatDock.${key} not found`).not.toBeNull();
    return (m as RegExpExecArray)[1];
  };

  /**
   * The keys the BUBBLE renders, and only those. Scoped deliberately: `unavailable` legitimately says
   * *"right now"* about the chat service, which is not a claim about when a message landed — a blanket
   * sweep of the block would fail on it and the rule would get relaxed to make the test pass.
   */
  const NOTICE_KEYS = ["noticeTitle", "itemFallback"];

  /** Immediacy vocabulary. Each of these turns a poll-timed badge into a claim about *when*. */
  const IMMEDIACY_EN = [/\bjust\b/i, /\bnow\b/i, /\barrived\b/i, /\bnew\b/i, /\bmoments? ago\b/i];
  const IMMEDIACY_AR = [/الآن/, /للتو/, /للتوّ/, /حالاً/, /وصل/, /جديدة?/];

  it("carries no immediacy word in the English notice copy", () => {
    for (const key of NOTICE_KEYS) {
      const value = copy(enSrc, key);
      for (const bad of IMMEDIACY_EN) expect(value, `chatDock.${key}`).not.toMatch(bad);
    }
    // And it does state the thing it IS allowed to state — that a reply exists.
    expect(copy(enSrc, "noticeTitle")).toMatch(/repl/i);
  });

  it("carries no immediacy word in the Arabic notice copy — «الآن», «للتو», «وصل»", () => {
    for (const key of NOTICE_KEYS) {
      const value = copy(arSrc, key);
      for (const bad of IMMEDIACY_AR) expect(value, `chatDock.${key}`).not.toMatch(bad);
    }
    expect(copy(arSrc, "noticeTitle")).toContain("ردّ");
  });

  it("reaches for no immediacy-named copy key — not the bid list's «وصل الآن» badge, not any other", () => {
    // `bidMap.justArrived` ("Just arrived" / «وصل الآن») is a live key in both dictionaries, on this
    // very surface, and it is one `t.bidMap.justArrived` away from the bubble. This asserts the
    // CLASS rather than the one key, so a differently-named recency string is caught too. It reads
    // only the dock, so the other agent adding or renaming dictionary keys cannot redden it.
    const keys = [...dockSrc.matchAll(/\bt\.\w+\.(\w+)/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(4); // the dock does read copy, so the sweep is not vacuous
    expect(keys.filter((k) => /just|arriv|now|recent|live/i.test(k))).toEqual([]);
    expect(dockSrc).not.toContain("justArrived");
  });

  it("says nothing at all about the tab being read, whatever the copy says (RM3-AC-63)", () => {
    const tabs = dockTabs(anchor(), [row({ bidId: "b1", unreadCount: 3 })]);
    expect(arrivalNotice(tabs, {}, { open: true, bidId: "b1" })).toBeNull();
  });
});

/**
 * **I1 — the anchor and the rows must resolve the SAME counterparty key.**
 *
 * The dock keys its anchor tab from a `BidCard` (`mapBid`) and its rows from `InboxBid`s
 * (`mapReceivedBids`), then matches them with `bidSupplierKey`. Both mappers therefore have to read
 * `Bid.supplierCompanyId` out of whatever shape the projection nests it in — and they used not to:
 * the bid list scanned four sources, received-bids read the flat key only. On any payload that nests
 * the company id the anchor resolved a company key while the rows fell back to `supplierId` or the
 * name, the two never matched, `dockTabs` returned the anchor alone, and **every sibling bid of the
 * same firm disappeared from the strip**.
 *
 * These go through the real mappers on raw payloads rather than through the fixtures above, because a
 * fixture on both sides is exactly what let the two derivations drift apart unnoticed.
 */
describe("one counterparty key across both projections (I1, AC-70)", () => {
  /** The bid list's shape: the supplier is nested, and the firm hangs off `supplier.company`. */
  const rawBid = (id: string, memberId: string) => ({
    id,
    status: "PENDING",
    supplier: { id: memberId, name: "Ali", company: { id: 77, name: "Al-Faris Rentals", isVerified: true } },
    request: { id: "r1", requestGroupId: "g1" },
  });

  /** The received-bids shape: the same firm, same nesting, no flat `supplierCompanyId` at all. */
  const rawInboxRow = (id: string, memberId: string, name: string) => ({
    id,
    status: "PENDING",
    dealRoomId: `dr-${id}`,
    unreadCount: 0,
    supplier: { id: memberId, name: "Ali", company: { id: 77, name: "Al-Faris Rentals", isVerified: true } },
    request: { id: "r1", requestGroupId: "g1", equipmentItems: [{ subtypeId: "t1", subtypeName: name }] },
  });

  it("resolves the same key from a nested company id on both sides", () => {
    const card = mapBid(rawBid("b1", "u1"), false);
    const [inbox] = mapReceivedBids([rawInboxRow("b1", "u1", "Excavator")]);
    expect(card.supplierCompanyId).toBe("77");
    expect(inbox.supplierCompanyId).toBe("77");
    expect(bidSupplierKey(inbox)).toBe(bidSupplierKey(card));
  });

  it("keeps every sibling bid of the same FIRM in the strip, even when two members submitted them", () => {
    const card = mapBid(rawBid("b1", "u1"), false);
    const rows = mapReceivedBids([
      rawInboxRow("b1", "u1", "Excavator"),
      // A colleague at the same firm — a different member id, so `supplierId` alone would split them.
      rawInboxRow("b2", "u2", "Loader"),
    ]);
    const tabs = dockTabs(
      {
        bidId: card.id,
        supplierCompanyId: card.supplierCompanyId,
        supplierId: card.supplierId,
        supplierName: card.supplierName,
        dealRoomId: card.dealRoomId,
        label: null,
        groupKey: "g1",
      },
      rows,
    );
    expect(tabs.map((t) => t.bidId)).toEqual(["b1", "b2"]);
    expect(tabs.map((t) => t.label)).toEqual(["Excavator", "Loader"]);
  });

  it("still reads the FLAT key received-bids used to be the only reader of", () => {
    const [inbox] = mapReceivedBids([{ id: "b1", supplierCompanyId: "co-9", supplierId: "u1", request: {} }]);
    expect(inbox.supplierCompanyId).toBe("co-9");
    expect(inbox.supplierId).toBe("u1");
  });

  it("falls back member → name when no firm is on the payload, identically on both sides", () => {
    const card = mapBid({ id: "b1", supplier: { id: "u1", name: "Ali" }, request: { id: "r1" } }, false);
    const [inbox] = mapReceivedBids([{ id: "b1", supplierId: "u1", supplierName: "Ali", request: {} }]);
    expect(card.supplierCompanyId).toBeNull();
    expect(inbox.supplierCompanyId).toBeNull();
    expect(bidSupplierKey(inbox)).toBe(bidSupplierKey(card));
    expect(bidSupplierKey(card)).toBe("u1");
  });
});

/**
 * **I2 — the dock may not drop a message the deal room shows.**
 *
 * Both surfaces read the SAME Stream channel, and unread comes from REST and counts every message.
 * So `if (!m.text) return null` in the dock was not a rendering shortcut: it was the renter seeing a
 * badge, opening the dock, and finding nothing there — an attachment-only or location-only message
 * simply did not exist on that surface, with no gap to notice and nothing to tap.
 *
 * The classification is asserted here rather than the chrome (this repo's vitest env is `node`), and
 * it is the classification BOTH surfaces use, which is what stops them drifting apart again.
 */
describe("dockMessageView — nothing the deal room renders is invisible in the dock (I2)", () => {
  const dealRoomSrc = readFileSync(resolve(process.cwd(), "src/components/deal-room/DealRoom.tsx"), "utf8");

  it("keeps an attachment-only image message, with its thumb", () => {
    const view = dockMessageView({
      attachments: [{ type: "image", image_url: "https://x/full.jpg", thumb_url: "https://x/thumb.jpg" }],
    });
    expect(view.empty).toBe(false);
    expect(view.text).toBeNull();
    expect(view.attachments).toEqual([
      { kind: "image", url: "https://x/full.jpg", thumbUrl: "https://x/thumb.jpg", title: null, mimeType: null },
    ]);
  });

  it("keeps a location-only message, and hands back the point rather than a string", () => {
    const view = dockMessageView({ custom: { kind: "location", lat: 24.71, lng: 46.68 } });
    expect(view.empty).toBe(false);
    expect(view.location).toEqual({ lat: 24.71, lng: 46.68 });
    // The deal room falls back to "Shared location" when there is no text — so must the dock, which
    // means the view has to say there IS a location even with nothing to label it.
    expect(view.text).toBeNull();
  });

  it("reads a location whose coordinates arrived as strings, exactly as the deal room does", () => {
    expect(dockMessageView({ custom: { kind: "location", lat: "24.71", lng: "46.68" } }).location).toEqual({
      lat: 24.71,
      lng: 46.68,
    });
  });

  it("is not fooled by a `location` custom with no usable point", () => {
    const view = dockMessageView({ custom: { kind: "location", lat: "not-a-number", lng: 46.68 } });
    expect(view.location).toBeNull();
    expect(view.empty).toBe(true); // nothing to show, and nothing pretending to be a map link
  });

  it("classifies a voice note by mime type, not only by Stream's `type`", () => {
    const view = dockMessageView({ attachments: [{ asset_url: "https://x/vn.m4a", mime_type: "audio/mp4" }] });
    expect(view.attachments[0].kind).toBe("audio");
    expect(view.attachments[0].url).toBe("https://x/vn.m4a");
  });

  it("classifies everything else as a named file, keeping the sender's own title", () => {
    const view = dockMessageView({
      attachments: [{ type: "file", asset_url: "https://x/quote.pdf", title: "Quotation.pdf", mime_type: "application/pdf" }],
    });
    expect(view.attachments[0]).toMatchObject({ kind: "file", title: "Quotation.pdf", mimeType: "application/pdf" });
  });

  it("keeps an attachment that arrived with only whitespace for text", () => {
    const view = dockMessageView({ text: "   ", attachments: [{ type: "image", image_url: "https://x/a.jpg" }] });
    expect(view.empty).toBe(false);
    expect(view.text).toBeNull(); // no empty bubble above the thumb
    expect(view.attachments).toHaveLength(1);
  });

  it("keeps a plain text message unchanged", () => {
    const view = dockMessageView({ text: "متى يمكن التسليم؟" });
    expect(view).toEqual({ text: "متى يمكن التسليم؟", location: null, attachments: [], empty: false });
  });

  it("drops ONLY a message with no text, no attachment and no point", () => {
    expect(dockMessageView({}).empty).toBe(true);
    expect(dockMessageView({ text: "", attachments: [], custom: {} }).empty).toBe(true);
  });

  it("the dock renders from the view, and no longer early-returns on missing text", () => {
    // The exact line this finding is about. Asserted on the source because the gap was invisible by
    // construction: it rendered nothing, so no snapshot and no count could ever have caught it.
    // Comments are stripped — the code there now explains what it is NOT doing, by name.
    const code = dockSrc.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
    expect(code).not.toMatch(/if\s*\(\s*!\s*m\.text\s*\)\s*return null/);
    expect(dockSrc).toContain("dockMessageView(m)");
    expect(dockSrc).toContain("view.attachments.map");
    expect(dockSrc).toContain("msg-att-img");
    expect(dockSrc).toContain("msg-att-file");
  });

  it("covers every attachment kind the deal room has a branch for", () => {
    // Read off the shipped surface rather than restated: if staging widens the deal room again, this
    // is the assertion that notices the dock has not followed.
    expect(dealRoomSrc).toContain('a.type === "image"');
    expect(dealRoomSrc).toContain('(a.mime_type || "").startsWith("audio/")');
    expect(dealRoomSrc).toContain('custom.kind === "location"');
    const kinds = new Set(
      [
        dockMessageView({ attachments: [{ type: "image", image_url: "u" }] }),
        dockMessageView({ attachments: [{ type: "audio", asset_url: "u" }] }),
        dockMessageView({ attachments: [{ mime_type: "audio/mpeg", asset_url: "u" }] }),
        dockMessageView({ attachments: [{ type: "video", asset_url: "u" }] }),
        dockMessageView({ attachments: [{ type: "file", asset_url: "u" }] }),
      ].map((v) => {
        expect(v.empty).toBe(false);
        return v.attachments[0].kind;
      }),
    );
    expect([...kinds].sort()).toEqual(["audio", "file", "image"]);
  });
});
