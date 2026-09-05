import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  arrivalNotice,
  dockMayReportAsks,
  dockMessageView,
  dockNoticeQuote,
  dockTabs,
  dockTabsWithKnownRooms,
  dockUnreadTotal,
  dockWatchRoomId,
  inboxGroupKey,
  type DockAnchor,
} from "@/lib/contract/chat-dock";
import {
  askIdentity,
  composeAvailabilityRequest,
  isAskOutstanding,
  outstandingAskIdentities,
  type RenteeRequestCardPayload,
} from "@/lib/contract/rentee-request";
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
  equipment: { subtype: "Crawler excavator", subtypeAr: null, size: "20 ton", sizeAr: null },
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
   THE BUBBLE QUOTES WHAT WAS SAID (owner, 2026-08-11)

   *"It never shows what was actually said."* The bubble carried «رسالة جديدة», the supplier's name
   and the item's type — three things the renter already knew. The words were available the whole
   time: `dockWatchRoomId` keeps the anchor bid's channel connected while the dock is shut, so the
   messages the notice is announcing are in hand.

   What this pins is the one judgement that can go wrong quietly: WHOSE line gets quoted.
   ══════════════════════════════════════════════════════════════════════════════════════════════════ */

describe("dockNoticeQuote — the arrival's own words, and only the arrival's", () => {
  const mine = { id: "m1", user: { id: "me" }, text: "هل المعدّة متاحة؟" };
  const theirs = { id: "t1", user: { id: "them" }, text: "وصلنا طلبك، سنرد قريباً." };

  it("quotes the last INCOMING message", () => {
    expect(dockNoticeQuote([mine, theirs], "me")).toEqual({ text: "وصلنا طلبك، سنرد قريباً.", attachment: false });
  });

  it("never quotes my own line back at me, however recent it is", () => {
    // The renter answering the supplier must not turn his own reply into "the supplier said".
    expect(dockNoticeQuote([theirs, mine], "me")).toEqual({ text: "وصلنا طلبك، سنرد قريباً.", attachment: false });
  });

  it("stops at the last incoming message rather than hunting backwards for words", () => {
    // A file with no caption is the arrival. Walking past it to an older remark would put a sentence
    // from an hour ago in quotes under a notice about something that landed now.
    const file = { id: "t2", user: { id: "them" }, attachments: [{ type: "file", asset_url: "https://x/q.pdf" }] };
    expect(dockNoticeQuote([theirs, file], "me")).toEqual({ text: null, attachment: true });
  });

  it("reports a shared point as something said without words", () => {
    const point = { id: "t3", user: { id: "them" }, custom: { kind: "location", lat: 24.7, lng: 46.6 } };
    expect(dockNoticeQuote([point], "me")).toEqual({ text: null, attachment: true });
  });

  it("says nothing at all when it cannot tell whose message is whose", () => {
    // No connection yet, so no author to compare against. Silence — the caller falls back to copy
    // that claims nothing, which beats attributing the renter's own line to the supplier.
    expect(dockNoticeQuote([theirs], null)).toBeNull();
  });

  it("says nothing when the conversation holds nothing from the other side", () => {
    expect(dockNoticeQuote([mine], "me")).toBeNull();
    expect(dockNoticeQuote([], "me")).toBeNull();
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
/** The surface's stylesheet. Read once here rather than per-describe: the geometry assertions below
 *  and the composer's further down are reading the same file for the same reason. */
const cssSrc = readFileSync(resolve(process.cwd(), "src/components/map/map-proto.css"), "utf8");

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

  it("puts that one call INSIDE `deliver()` — the one seam every send goes through", () => {
    /* This used to name `send()`, and the RULE has not changed — the seam has. The composer grew an
       attach control and a voice note (owner, 2026-08-11) and all three senders post the same way,
       so the create-connect-post steps moved into the one function they share rather than being
       copied twice. The assertion is stronger for it: no longer "the text sender creates the room",
       but "exactly one function can, and it is not a sender". */
    const body = functionBody(dockSrc, "async function deliver(");
    const call = dockSrc.indexOf("ensureDealRoom(");
    expect(call).toBeGreaterThan(body.start);
    expect(call).toBeLessThan(body.end);
  });

  it("routes the typed message, the attachment AND the voice note through that one seam", () => {
    // The shape this AC's regression takes now that the composer can send more than text: an upload
    // that posts on its own has to create the room on its own, and a `DealRoom` row freezes the
    // lessor's offered count. Each sender is proved to reach `deliver`, and the call count is proved
    // to be exactly those three — a fourth caller anywhere in the file fails this line.
    const SENDERS = ["async function send()", "async function sendFiles(", "async function sendVoiceNote("];
    for (const sender of SENDERS) {
      const body = functionBody(dockSrc, sender);
      expect(dockSrc.slice(body.start, body.end), sender).toContain("deliver(");
      // …and none of them holds a channel itself. `channelRef` is read inside `deliver` alone, so
      // there is no path that posts into a room without first passing the create-if-missing branch.
      expect(dockSrc.slice(body.start, body.end), sender).not.toContain("channelRef");
    }
    expect(dockSrc.match(/\bdeliver\(/g) ?? []).toHaveLength(SENDERS.length + 1); // + the declaration
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

  it("opens the dock by setting state and nothing else", () => {
    expect(dockSrc).toContain("onClick={() => setOpen(true)}");
  });

  it("hides the dock button while the conversation is open (`rChatDock`, prototype 3863)", () => {
    // *"While the conversation is open it IS the affordance — a button under it would be a second
    // one."* The prototype returns null; ours must not render the FAB under its own drawer, where it
    // would be a second control claiming to toggle one state.
    expect(dockSrc).toMatch(/\{!open && \(\s*<button type="button" className="bm-dock"/);
    // …and the drawer's ✕ is then the only way back, so it must still exist.
    expect(dockSrc).toContain('className="bm-chat-x" onClick={() => setOpen(false)}');
  });

  it("docks the conversation beside the panel rather than floating it (`rDrawer`, prototype 1573–1580)", () => {
    // The prototype's stated intent: the conversation REPLACES the map — flush, square, full height,
    // starting where the panel ends. A radius, a shadow or a `bottom:` offset here is the floating
    // widget this deliberately stopped being.
    const chat = cssBlockOf(cssSrc, ".bidmap .bm-chat {");
    expect(chat).toMatch(/inset-block:\s*0/);
    expect(chat).toMatch(/border-radius:\s*0/);
    expect(chat).toMatch(/box-shadow:\s*none/);
    expect(chat).not.toMatch(/max-height/);
    // FILL is sized from the SAME variable the panel is, so the resize grip moves the seam with it
    // and the two columns can never overlap.
    const fill = cssBlockOf(cssSrc, ".bidmap .bm-chat.is-fill {");
    // Asserted as the INVARIANT rather than as a literal: the two must read the same variable AND
    // fall back to the same figure, because the fallback is what governs an untouched surface — a
    // dock still defaulting to 392 beside a 460 panel would overlap it by 68px before the grip is
    // ever dragged. Pinning the number instead sent the width change of 2026-08-20 through a test
    // edit that could as easily have been made by updating only this line.
    const panelW = /var\(--bm-panel-w,\s*(\d+)px\)/.exec(cssBlockOf(cssSrc, ".bidmap .bm-panel {"))?.[1];
    expect(panelW).toBeTruthy();
    expect(fill).toContain(`var(--bm-panel-w, ${panelW}px)`);
    expect(fill).toMatch(/inset-inline-end:\s*0/);
    // MIRROR is `rDrawer`'s own resting width — 420px (`04-machine-panel.js:20`), the value the
    // placement control switches away from and back to. 436 was a rounding of it and nothing more
    // (owner, 2026-08-11: *"chat is still different UI and size"*). The `calc(100% - 470px)` ceiling
    // stays — it is the guard that stops two columns squeezing the map to nothing between them.
    const mirror = cssBlockOf(cssSrc, ".bidmap .bm-chat.is-mirror {");
    expect(mirror).toMatch(/width:\s*420px/);
    expect(mirror).toContain("calc(100% - 470px)");
  });

  it("moves the conversation with ONE control, and that control moves nothing else", () => {
    // A view preference: it may not touch the selection, the map, the active tab or the channel.
    expect(dockSrc).toContain('onClick={() => setPlace((p) => (p === "fill" ? "mirror" : "fill"))}');
    const place = dockSrc.slice(
      dockSrc.indexOf('className="bm-chat-place"'),
      dockSrc.indexOf('className="bm-chat-x"'),
    );
    expect(place.length).toBeGreaterThan(120); // positive control on the slice
    for (const forbidden of ["setActiveBidId", "setOpen", "refresh(", "ensureDealRoom", "onOpenMachine"]) {
      expect(place).not.toContain(forbidden);
    }
    // Both labels name the state the press moves TO — a toggle labelled with its current state lies.
    expect(dockSrc).toContain("place === \"fill\" ? t.chatDock.placeMirror : t.chatDock.placeFill");
  });

  it("renders a roomless tab as COMPOSE-ONLY — a note, never a creation", () => {
    // `!active?.dealRoomId` is the branch that would tempt an eager create. It renders copy.
    expect(dockSrc).toContain("{t.chatDock.composeOnly}");
  });

  it("wears a WHITE identity band and shadowed bubbles", () => {
    /* Owner, 2026-08-11 — two rulings, a day apart, and the second supersedes the first on the band
       alone. *"Chat is still different UI and size"* brought `pChat`'s values to this surface; then,
       looking at the result: *"the dock header is blue — make it white."* Blue on this surface means
       an action, and a 64px slab of it said something that is not an action: who you are talking to.

       So the head is WHITE with dark ink and a hairline divider, and everything else that ruling
       brought stays — each of these is a thing he can see:
         · the stream's ground is `#e9eef3`, the prototype's tint;
         · BOTH bubbles carry no shadow at all — this app has none and neither carries an outline (05:29,
           05:143) — the border on incoming made every one of the supplier's remarks a boxed notice. */
    const head = cssBlockOf(cssSrc, ".bidmap .bm-chat-head {");
    expect(head.toLowerCase()).toMatch(/background:\s*var\(--surface\)/);
    expect(head.toLowerCase()).not.toContain("#2563eb");
    // A hairline the eye can find: a translucent-white rule, which is what it carried against blue,
    // is no divider at all on white.
    expect(head.toLowerCase()).toMatch(/border-bottom:\s*1px solid #e1e9f1/);
    expect(head).toMatch(/height:\s*64px/); // still on the panel's own line
    // The name has to be legible on it — white ink on a white band was the way this would break.
    expect(cssSrc).toContain(".bidmap .bm-chat-who");
    expect(/\.bidmap \.bm-chat-who \{[^}]*color: #0f2238/i.test(cssSrc)).toBe(true);
    // The avatar the band is built around — the prototype's 42px circle of initials.
    expect(cssBlockOf(cssSrc, ".bidmap .bm-chat-av {")).toMatch(/width:\s*42px/);
    expect(cssBlockOf(cssSrc, ".bidmap .bm-chat-body {").toLowerCase()).toContain("#e9eef3");
    /* ── The bubbles now live in the BASE, and BOTH routes wear them (owner, 2026-08-19) ──────────
       *"we have now 2 chats style… i want both to be the same, the style i want is the one in the
       map."* This block used to be `.bidmap .bm-chat .msg.*` — an override that let the deal room
       keep a saturated outgoing fill while the dock had the pale one. The dock's root is
       `bm-chat dlproto`, so it reads `.dlproto .msg` already; promoting the values there gives both
       surfaces one style and leaves nothing to drift. */
    const dealCss = readFileSync(resolve(process.cwd(), "src/components/deal-room/deal-room-proto.css"), "utf8");
    const them = cssBlockOf(dealCss, ".dlproto .msg.them {");
    // ~~Both bubbles carried `0 1px 2px rgba(0,0,0,.08)`.~~ This app has no shadows (owner,
    // 2026-08-26). What the AC was actually about survives and is asserted below: the two routes
    // wear ONE style, and neither bubble is a boxed notice.
    expect(them).not.toContain("box-shadow");
    expect(them).toMatch(/border:\s*0/);
    // Outgoing is the PALE fill with dark ink, not a brand colour with white text — the single change
    // a reader of the deal room actually sees, and the one most likely to be "fixed" back.
    const mine = cssBlockOf(dealCss, ".dlproto .msg.mine {");
    expect(mine.toLowerCase()).toContain("#d9eeff");
    expect(mine.toLowerCase()).toContain("#16304f");
    expect(mine).not.toContain("var(--rentee)"); // the blue fill it used to carry
    // And the fork is GONE, not merely equal. Two blocks holding the same values is how they came to
    // hold different ones.
    expect(cssSrc).not.toContain(".bidmap .bm-chat .msg");
    // A card is a message, so it takes a side and the prototype's 86% (05:140–141) rather than
    // stretching the column and reading as a banner — and it is CAPPED on the same wrapper, so a
    // drawer that fills the canvas cannot leave the card floating in the middle of it.
    const card = cssBlockOf(cssSrc, ".bidmap .bm-chat-card {");
    expect(card).toMatch(/width:\s*86%/);
    expect(card).toContain("max-width: min(86%, 376px)");
    expect(cssSrc).toContain(".bidmap .bm-chat-card.is-mine { align-self: flex-end; }");
    expect(cssSrc).toContain(".bidmap .bm-chat-card.is-them { align-self: flex-start; }");
  });

  it("sides every card by its AUTHOR, so one channel reads right from both chairs", () => {
    /* Owner, 2026-08-11: *"not floating cards in the middle, same on the supplier view make these
       cards appear like messages sent by the other side or by me whether the request or the
       response."*

       The dock and `/deal-room/[id]` read the SAME channel, and the renter and the supplier read it
       from opposite ends. `is-mine` for an ask and `is-them` for a reply is therefore not a rule —
       it is the renter's chair hardcoded, and it inverts the moment the reader changes. The side has
       to come off the Stream author, exactly as the plain bubbles below it already take theirs. */
    const stream = dockSrc.slice(dockSrc.indexOf("messages.map((m) => {"), dockSrc.indexOf("<div ref={bottomRef} />"));
    expect(stream).toContain("const mine = myStreamId != null && m.user?.id === myStreamId;");
    /* BOTH card wrappers are driven by that one reading, and neither states a side literally: the
       renter's request card, and the bare form an unfoldable reply keeps.

       There were THREE until the owner's evening ruling of the same day (V12c) — *"make it one card
       for request and show his answer"* — which withdrew the second full card a reply used to draw
       through `RequestCard` (`replyCardView`). Its wrapper went with it. What did NOT change is this
       rule: a card takes its author's side, so the surviving card sits on the renter's edge here and
       on the other edge from the supplier's chair, with nothing hardcoded either way. */
    expect(stream.match(/bm-chat-card \$\{mine \? "is-mine" : "is-them"\}/g) ?? []).toHaveLength(2);
    expect(stream).not.toContain('className="bm-chat-card is-mine"');
    expect(stream).not.toContain('className="bm-chat-card is-them"');
  });

  it("draws ONE card per request, and keeps the unfoldable answer rendering", () => {
    /* Owner, 2026-08-11 (evening, superseding that morning's ruling): *"why the cards each one on
       different side… make it one card for request and show his answer"*.

       The two cards were the ask and a second full card built for the reply — on opposite edges,
       because each takes its own author's side, and both stating the answer in different words. The
       request's card carries the answer now (through `cardCtx.reply`, worded by `replyAnswerLine`),
       and the reply's card is suppressed. */
    const stream = dockSrc.slice(dockSrc.indexOf("messages.map((m) => {"), dockSrc.indexOf("<div ref={bottomRef} />"));
    // Not imported and not called — the withdrawn function is named only in the comment that records
    // why it is gone.
    expect(dockSrc).not.toMatch(/^\s*replyCardView,$/m);
    expect(dockSrc).not.toContain("replyCardView(");
    expect(stream).toContain("replyFoldsIntoAsk(answeredRefs, card.reply)");
    /* …and ONLY when the fold has somewhere to go. A reply whose ask is not in the loaded window has
       nothing carrying its answer, so it must fall through to the bare `ChatCard` form below rather
       than disappearing — the fold is a suppression, never a deletion. */
    expect(stream.indexOf("replyFoldsIntoAsk")).toBeLessThan(stream.indexOf("if (card) {"));
    expect(stream).toContain("if (card) {");
  });

  it("cues the card the answer folded into — finite, and not on every poll", () => {
    // *"light plumbing or something to show the answer when opening the chat"*. The answer lands in
    // the card of the QUESTION, which may be far above the newest message.
    expect(dockSrc).toContain("cue={cuedRef != null && cuedRef === card.card.ref}");
    // Keyed on a stable string, so a `message.new` or a refresh that leaves the same last answer in
    // place restarts nothing…
    expect(dockSrc).toContain("latestAnsweredRef(threadCards)");
    expect(dockSrc).toMatch(/\}, \[open, cueRef\]\);/);
    // …and `open` is a term of the rule because this dock stays mounted while SHUT (it watches the
    // anchor's room), so a cue started then would burn itself behind a closed drawer.
    expect(dockSrc).toMatch(/setTimeout\(\(\) => setCuedRef\(null\), ANSWER_CUE_MS\)/);
    // It takes its own class back off. Nothing here loops.
    expect(dockSrc).toContain("clearTimeout(timer)");
  });

  it("gives an attachment a way to be KEPT, through the deal room's own save", () => {
    // Owner, 2026-08-11: documents in this chat need a download, *"same as existing behaviour of
    // existing deal room"*. One path, not two — the shared module owns both the save and the name
    // the file lands under, so the dock cannot save a file under a different name than the deal
    // room does.
    expect(dockSrc).toContain("saveChatAttachment(");
    expect(dockSrc).toContain("chatAttachmentFilename(");
    expect(dockSrc).toContain('className="msg-att-dl"');
    expect(dockSrc).not.toMatch(/async function save|createObjectURL/); // no second implementation
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

  /**
   * Every attachment kind Stream can hand this surface.
   *
   * It used to enumerate them by reading the DEAL ROOM's branches and checking the dock had kept up —
   * a good invariant while both surfaces rendered messages. The deal room renders none now (owner,
   * 2026-08-26), so the list is stated here instead of being read off a surface that no longer has it.
   */
  it("covers every attachment kind Stream can hand it", () => {
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

/* ══════════════════════════════════════════════════════════════════════════════════════════════════
   THE COMPOSER (owner, 2026-08-11)

   «just add things already exist in the existing chat like upload and voice note, the composer».

   Two claims, and they are the only two. **Reuse**: the attach control and the voice note are the
   DEAL ROOM's — one gate, one upload, one message shape, in `lib/chat/chat-attachments` — so a file
   sent from the map is the same object as one sent in the deal room, and the dock declares no rules
   of its own to drift from them. **Inert while in flight**: every control in the row, the attach and
   the mic included, goes dead while a send is on the wire — on a roomless bid the first press is
   creating a `DealRoom`, and a second press during it would race that create.

   Source-asserted for the same reason everything above is: `ChatDock` is a client component and this
   repo's vitest env is `node` with no component harness. The BEHAVIOUR of the shared path itself is
   exercised for real in `chat-attachments.test.ts`.
   ══════════════════════════════════════════════════════════════════════════════════════════════════ */

describe("the dock's composer sends what the deal room sends, the way the deal room sends it", () => {
  const composerSrc = dockSrc.slice(
    dockSrc.indexOf('<div className="bm-chat-compose">'),
    dockSrc.indexOf("</section>"),
  );
  const dealRoomSrc = readFileSync(resolve(process.cwd(), "src/components/deal-room/DealRoom.tsx"), "utf8");

  it("carries an attach control, a recorder, an input and a send — the positive control", () => {
    // Without these the disabled sweep below would pass over an empty row.
    expect(composerSrc.length).toBeGreaterThan(400);
    expect(composerSrc).toContain('type="file"');
    expect(composerSrc).toContain("accept={CHAT_ACCEPT}");
    expect(composerSrc).toContain("<VoiceRecorder");
    expect(composerSrc).toContain('className="bm-chat-input"');
    expect(composerSrc).toContain('className="bm-chat-send"');
  });

  it("takes BOTH capabilities from the deal room rather than restating them", () => {
    // The recorder is the deal room's component, mounted unchanged; the gate, the caps, the accept
    // list and the wire shape are the shared module's. Both surfaces import the same one.
    expect(dockSrc).toContain('from "@/components/deal-room/VoiceRecorder"');
    expect(dockSrc).toContain('from "@/lib/chat/chat-attachments"');
    expect(dealRoomSrc).toContain('from "@/lib/chat/chat-attachments"');
    // …and neither surface keeps a private copy of the rules. A local extension list or a local cap
    // is exactly how the two would start disagreeing about what a chat attachment is.
    for (const src of [dockSrc, dealRoomSrc]) {
      expect(src).not.toMatch(/const CHAT_(IMAGE|DOC|VIDEO)_EXT\s*=/);
      expect(src).not.toMatch(/const CHAT_MAX_(MEDIA|VIDEO)\s*=/);
      expect(src).not.toMatch(/\.sendImage\(|\.sendFile\(/);
    }
  });

  it("disables EVERY control in the row while a send is in flight", () => {
    // Four controls, four gates, and each one names both flight states: `busy` (the seam, which
    // spans the room create) and `uploading` (the file on the wire). A control that named neither
    // would still be pressable during the create it is racing.
    const gates = [...composerSrc.matchAll(/disabled=\{([^}]*)\}/g)].map((m) => m[1]);
    expect(gates).toHaveLength(4); // attach · recorder · input · send
    for (const gate of gates) {
      expect(gate, gate).toMatch(/\bbusy\b/);
      expect(gate, gate).toMatch(/\buploading\b/);
    }
    // …and the send button is additionally gated on there being something to send.
    expect(gates.filter((g) => /text\.trim\(\)/.test(g))).toHaveLength(1);
  });

  it("hands the recorder the SHARED cap, and its errors to the composer's own error row", () => {
    expect(composerSrc).toContain("maxBytes={CHAT_MAX_MEDIA}");
    expect(composerSrc).toContain("onError={setFileErr}");
    // The recorder takes the row while it runs — a timer, a cancel and a send cannot share this
    // width with an input.
    expect(composerSrc).toMatch(/\{!voiceRecording && \(/);
    expect(dockSrc).toContain("onRecordingChange={setVoiceRecording}");
  });

  it("keeps a media message rendering as MEDIA — the card paths are unchanged", () => {
    // The dock renders `rentee_request` through `RequestCard` and every other custom type through
    // `ChatCard`. An attachment carries no `custom.type`, so it has to fall through BOTH of those to
    // the bubble — otherwise the file the composer just gained would be invisible where it lands.
    const stream = dockSrc.slice(
      dockSrc.indexOf("messages.map((m) => {"),
      dockSrc.indexOf("<div ref={bottomRef} />"),
    );
    expect(stream.length).toBeGreaterThan(500); // positive control on the slice
    expect(stream).toContain("if (card?.type === RENTEE_REQUEST_CARD_TYPE)");
    expect(stream).toContain("if (card) {");
    expect(stream).toContain("dockMessageView(m)");
    expect(stream).toContain("view.attachments.map");
    // …and the media branch is LAST. A card path added below it would swallow the attachment.
    expect(stream.indexOf("dockMessageView(m)")).toBeGreaterThan(stream.indexOf("if (card) {"));
  });

  it("draws the prototype's composer geometry (05-chat-and-requests.js:42–45)", () => {
    // 40px round send; input r20 · `10px 14px` · 12.5px on `var(--surface)` inside `var(--border-strong)`. Ours ran a
    // size under all of it (32px · r18 · `8px 12px` · 11.5px · white on the prototype's tint).
    const send = cssBlockOf(cssSrc, ".bidmap .bm-chat-send {");
    expect(send).toMatch(/width:\s*40px/);
    expect(send).toMatch(/height:\s*40px/);
    const input = cssBlockOf(cssSrc, ".bidmap .bm-chat-input {");
    // A capsule, and it stays one: the radius scale sharpened on 2026-08-28 and this control is
    // round by SHAPE rather than by a step on that scale.
    expect(input).toMatch(/border-radius:\s*999px/);
    expect(input).toMatch(/padding:\s*10px 14px/);
    expect(input).toMatch(/font-size:\s*12\.5px/);
    expect(input.toLowerCase()).toContain("#f8fafc");
    expect(input.toLowerCase()).toContain("#c8d8e8");
    // The recorder renders `.ib`, and the deal room styles that under `.composer` — a selector that
    // does not reach this surface. Without a rule here the two new controls would be unstyled
    // buttons, which is the one way "reuse the component" quietly fails to look reused.
    expect(cssSrc).toContain(".bidmap .bm-chat-compose .ib {");
  });
});

/* ─────────────────────────────────────────────────────────────────────────────────────────────────
 * A SENT ASK SURVIVES A RELOAD (owner's UAT, 2026-08-11)
 *
 * The defect, in his words: he composed an ask, confirmed it, and *"the card never showed in the
 * thread"*; on refresh the control was back to «اطلب تأكيد التوفّر» as though nothing had been sent,
 * and pressing it returned the backend's 409 — which proved the ask HAD been sent and only the UI
 * had forgotten. His ruling: *"remain blocked and will never open it again for the renter if asked
 * once, and only change when the supplier replied."*
 *
 * Both halves of the cause are asserted here, because either one alone reproduces it:
 *
 *  1. the dock read the channel only while it was OPEN, so the set that blocks the controls was
 *     rebuilt from messages a reloaded page did not hold — `dockWatchRoomId`;
 *  2. the room the ask-send created was invisible to the dock until `GET /received-bids` mentioned
 *     it, so the card had no stream to land in — the `dealRoomId` the surface passes down, exercised
 *     through `dockTabs` here.
 *
 * The set itself is `outstandingAskIdentities`, which already had its own tests; what is new is that
 * it is reachable at all on a page nobody has opened the dock on.
 * ────────────────────────────────────────────────────────────────────────────────────────────────*/
describe("an ask sent, the page reloaded — the control stays blocked", () => {
  const ask = composeAvailabilityRequest("eq-1")!;
  /** The card as it comes back off the channel, exactly as the backend stamps it (§7.3). */
  const posted: RenteeRequestCardPayload = {
    type: "rentee_request",
    ref: "RQ-7F3A",
    scope: "equipment",
    equipmentId: "eq-1",
    serial: "BM-991",
    kind: "availability",
    docTypes: null,
  };

  it("the closed dock still watches the anchor's room — `open` is not a term of the rule", () => {
    // THE regression. Before the fix this was `open ? activeRoomId : null`, so a page the renter had
    // not opened the dock on read no conversation at all and reported nothing.
    expect(dockWatchRoomId({ open: false, activeRoomId: null, anchorRoomId: "dr-1" })).toBe("dr-1");
    // Open, it follows the tab being read — a sibling tab is a different room.
    expect(dockWatchRoomId({ open: true, activeRoomId: "dr-2", anchorRoomId: "dr-1" })).toBe("dr-2");
    // No room, nothing to watch. A bid with no deal room has no conversation to forget.
    expect(dockWatchRoomId({ open: false, activeRoomId: null, anchorRoomId: null })).toBeNull();
  });

  it("reports the anchor's asks with the dock shut, and never an empty set out of ignorance", () => {
    const anchorRoomId = "dr-1";
    // Shut, with the anchor's messages in hand: it may speak.
    expect(dockMayReportAsks({ loadedRoomId: anchorRoomId, anchorRoomId, messageCount: 3 })).toBe(true);
    // Nothing loaded yet — silence, not "nothing is outstanding".
    expect(dockMayReportAsks({ loadedRoomId: null, anchorRoomId, messageCount: 0 })).toBe(false);
    // A SIBLING tab's conversation says nothing about this surface's controls.
    expect(dockMayReportAsks({ loadedRoomId: "dr-2", anchorRoomId, messageCount: 9 })).toBe(false);
  });

  it("the room the ask-send created gives the anchor tab a stream to render the card in", () => {
    // The feed has not caught up: its row for this bid still carries `dealRoomId: null`.
    const tabs = dockTabs(anchor({ dealRoomId: null }), [row({ bidId: "b1", dealRoomId: null })]);
    expect(tabs[0].dealRoomId).toBeNull();
    // The room the SENDER holds is folded in. Without it the tab stays compose-only, the dock
    // renders «لا رسائل بعد», and the card the renter just confirmed is nowhere.
    const merged = dockTabsWithKnownRooms(tabs, { anchorBidId: "b1", surfaceRoomId: "dr-1" });
    expect(merged[0].dealRoomId).toBe("dr-1");
  });

  it("never overrides the feed, and never lends the anchor's room to a sibling tab", () => {
    // The feed is the authority: a room it already knows wins, so a stale prop cannot disconnect a
    // live conversation.
    const known = dockTabs(anchor({ dealRoomId: null }), [row({ bidId: "b1", dealRoomId: "dr-feed" })]);
    expect(dockTabsWithKnownRooms(known, { anchorBidId: "b1", surfaceRoomId: "dr-stale" })[0].dealRoomId).toBe("dr-feed");
    // A sibling bid is a different room; the surface's id belongs to the anchor alone.
    const two = dockTabs(anchor({ dealRoomId: null }), [
      row({ bidId: "b1", dealRoomId: null }),
      row({ bidId: "b2", dealRoomId: null, equipmentType: { id: "t2", name: "Loader" } }),
    ]);
    const merged = dockTabsWithKnownRooms(two, { anchorBidId: "b1", surfaceRoomId: "dr-1" });
    expect(merged.find((tb) => tb.bidId === "b1")?.dealRoomId).toBe("dr-1");
    expect(merged.find((tb) => tb.bidId === "b2")?.dealRoomId).toBeNull();
    // The dock's own fresh rooms still take precedence for the tab that created them.
    const fresh = dockTabsWithKnownRooms(two, { fresh: { b2: "dr-2" }, anchorBidId: "b1", surfaceRoomId: "dr-1" });
    expect(fresh.find((tb) => tb.bidId === "b2")?.dealRoomId).toBe("dr-2");
  });

  it("blocks the control after the reload, and unblocks it only on the supplier's reply", () => {
    // ── the send ──────────────────────────────────────────────────────────────────────────────
    // This session's own acknowledgement: the surface notes the identity it just put in the room.
    const thisSession = new Set([askIdentity(ask)]);
    expect(isAskOutstanding(ask, thisSession)).toBe(true);

    // ── the reload ────────────────────────────────────────────────────────────────────────────
    // Everything in memory is gone. The surface starts with an empty set — which is exactly the
    // state that produced the 409 — and the ONLY thing that can put the ask back is the channel.
    const afterReload = new Set<string>();
    expect(isAskOutstanding(ask, afterReload)).toBe(false);

    // The dock mounts SHUT, watches the anchor's room, and reads the card back out of it.
    const roomId = dockWatchRoomId({ open: false, activeRoomId: null, anchorRoomId: "dr-1" });
    expect(roomId).toBe("dr-1");
    const messages = [{ ask: posted }];
    expect(dockMayReportAsks({ loadedRoomId: roomId, anchorRoomId: "dr-1", messageCount: messages.length })).toBe(true);
    const reported = outstandingAskIdentities(messages);
    // Still blocked, on a page nobody opened the dock on.
    expect(isAskOutstanding(ask, reported)).toBe(true);

    // ── the supplier answers ──────────────────────────────────────────────────────────────────
    // "only change when the supplier replied — whether it becomes confirmed or with supplier
    // response, whatever it is": a refusal releases the control exactly as an acceptance does.
    const answered = outstandingAskIdentities([
      { ask: posted },
      { reply: { type: "rentee_request_reply", inReplyTo: "RQ-7F3A", equipmentId: "eq-1", resolution: "declined", deliveredTypes: null } },
    ]);
    expect(isAskOutstanding(ask, answered)).toBe(false);
  });
});

/** One CSS rule's declaration block, by exact selector. */
function cssBlockOf(css: string, selector: string): string {
  const at = css.indexOf(selector);
  if (at < 0) throw new Error(`selector missing: ${selector}`);
  const open = css.indexOf("{", at);
  return css.slice(open + 1, css.indexOf("}", open));
}
