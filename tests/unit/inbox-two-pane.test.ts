import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **The inbox is the chats on the LEFT and the conversation on the RIGHT** (owner, 2026-09-22:
 * *"i want it like the chats inbox look that open each chat beside it so maybe like the chat pannel
 * in the map but instead of equipments on the left, the chat inbox will be on the left and on right
 * the chats"*), with a **thin price bar above the conversation** (*"can we show him a thin price bar
 * with the counter this price on top of the chat when he open it from the inbox as he will not see
 * this one … i want to have another entry point for the negotiate"*).
 *
 * These read the SOURCE. The view pulls Stream, the router, four fetches and a 1,400-line dock; what
 * is under test is a set of layout and reuse rulings — which component draws the conversation, where
 * the selection lives, and what the row is made of — none of which a render would state more
 * clearly than the code does.
 */

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
/** Comments first: every one of these files EXPLAINS the thing it must not do, so a bare
 *  `not.toContain` fails on its own prose. Seventh time in this repo. */
const strip = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/[^\n]*/g, "");

const VIEW = strip(read("src/components/inbox/InboxView.tsx"));
const DOCK = strip(read("src/components/map/ChatDock.tsx"));
const FOOT = strip(read("src/components/map/PriceFooter.tsx"));
const CSS = read("src/components/map/map-proto.css");

describe("two panes, one page", () => {
  it("Given the page, Then the list and the conversation are siblings in one row", () => {
    expect(VIEW).toMatch(/lg:w-\[360px\]/);
    expect(VIEW).toMatch(/lg:border-e/);
  });

  it("Given a phone, Then there is ONE column and the list IS the page until a row is pressed", () => {
    /**
     * A 360px list beside a conversation is a desktop layout; two panes squeezed into 390px would
     * leave neither readable. The list hides when a row is open, and the pane hides when none is.
     */
    expect(VIEW).toContain('${openRow ? "hidden" : "flex"}');
    expect(VIEW).toContain('${openRow ? "flex" : "hidden lg:flex"}');
  });

  it("Given the shell, Then the page is pinned to the viewport", () => {
    // Without `fullBleed` the composer sits under the fold and the list scrolls the whole document.
    expect(strip(read("src/app/inbox/page.tsx"))).toContain("<AppShell title={t.shell.inbox} fullBleed>");
  });
});

describe("which conversation is open", () => {
  it("Given a row is pressed, Then the selection goes in the URL", () => {
    /**
     * 🔴 Component state is the exact complaint `useUrlOverlay` was written for: a renter who opens
     * a conversation, presses into the equipment map and comes back would land on the list with
     * nothing selected.
     */
    expect(VIEW).toContain('useUrlOverlay("bid")');
    expect(VIEW).toContain("openBid(b.bidId)");
  });

  it("Given a second row, Then it REPLACES rather than stacking", () => {
    // The hook's own rule, relied on here: reading four conversations costs one Back, not four.
    const hook = strip(read("src/lib/nav/useUrlOverlay.ts"));
    expect(hook).toContain("window.history.replaceState");
  });
});

describe("the conversation is the DOCK, not a second chat", () => {
  it("Given the pane, Then it mounts ChatDock embedded", () => {
    expect(VIEW).toContain("<ChatDock");
    expect(VIEW).toContain("embedded");
  });

  it("Given embedded, Then four pieces of floating chrome stand down", () => {
    /**
     * The dock button (the conversation is not opened from in here), the arrival bubble (the list
     * beside it carries the unread count on every row), the placement control (there is one place)
     * and the ✕ unless the page hands one in.
     */
    expect(DOCK).toContain("{!open && !embedded && (");
    expect(DOCK).toContain("{showNotice && !open && !embedded && (");
    expect(DOCK).toContain("{!embedded && (");
    expect(DOCK).toContain("{(!embedded || onClose) && (");
  });

  it("Given embedded, Then it opens on arrival and stays open", () => {
    expect(DOCK).toContain("useState(!!initialOpen || embedded)");
  });

  it("Given embedded, Then the TAB STRIP survives", () => {
    /**
     * A supplier bidding on three items has three rooms, and the inbox row that opened this one
     * names a single bid — so the strip is the only thing that says the other two exist. It is not
     * conditioned on `embedded` anywhere.
     */
    expect(DOCK).not.toMatch(/embedded[^\n]*dr-sibs/);
    expect(DOCK).toContain("dockTabs");
  });

  it("Given the host, Then it carries `.bidmap` so every rule the dock draws with applies", () => {
    /**
     * 🔴 Not a hack. Some three hundred selectors — the identity band, the bubbles, the cards, the
     * composer — are scoped under that class, so a differently-named host would need all of them
     * copied. `.bidmap` itself is a plain flex container, which is what a chat column wants.
     */
    expect(VIEW).toMatch(/className="bidmap min-h-0 flex-1"/);
    expect(CSS).toContain(".bidmap .bm-chat.is-inbox");
    // The dock is absolute against a RELATIVE child of that wrapper, not against the wrapper — the
    // price bar is the wrapper's other child and must keep its own height.
    expect(VIEW).toContain('<div className="relative min-h-0 flex-1">');
  });
});

describe("the thin price bar", () => {
  it("Given the pane, Then the bar is the map's PriceFooter, slim", () => {
    /**
     * 🔴 A variant, never a second component. What matters here is the hand-off: `?act=counter`
     * seeds the deal room's own `openFlow` with its own guards intact, and a slim copy would have
     * had to copy that with it — which is the thing `PriceFooter`'s own header forbids.
     */
    expect(VIEW).toContain("<PriceFooter");
    expect(VIEW).toContain("slim");
    expect(FOOT).toContain('className={`bm-foot${slim ? " is-slim" : ""}`}');
  });

  it("Given slim, Then only the geometry and the edge move", () => {
    // Same figures, same `canAccept` gate, same breakdown, same two acts.
    expect(CSS).toContain(".bidmap .bm-foot.is-slim");
    expect(CSS).toMatch(/\.bidmap \.bm-foot\.is-slim \{[^}]*border-top: 0/);
    expect(CSS).toMatch(/\.bidmap \.bm-foot\.is-slim \{[^}]*border-bottom: 1px/);
    expect(FOOT).not.toMatch(/slim \?[^\n]*canAccept/);
  });

  it("Given the bar, Then it stands INSIDE the styling context", () => {
    /**
     * Found by looking, and invisible to every other gate: `.bm-foot*` is scoped under `.bidmap`
     * too, so with the bar mounted outside the wrapper it rendered as a white row of default
     * buttons — no navy slab, no hero figure, no CTAs. It typechecks, it lints, and no case reads a
     * computed style.
     */
    const pane = VIEW.slice(VIEW.indexOf('pin("inbox-pane")'), VIEW.indexOf("<ChatDock"));
    expect(pane.length).toBeGreaterThan(120); // positive control on the slice
    expect(pane).toContain('className="bidmap min-h-0 flex-1"');
    expect(pane).toContain("<PriceFooter");
    // `.bidmap` is a ROW by default (a panel beside a map); here it is a bar above a conversation.
    expect(pane).toContain('flexDirection: "column"');
  });

  it("Given the bar, Then it is priced off the REQUEST's own two fields", () => {
    // The same fields the map's footer is handed, so one bid cannot read as two totals.
    expect(VIEW).toContain("durationDays={reqTerms.get(openRow.request.id)?.durationDays ?? null}");
    expect(VIEW).toContain("startDate={reqTerms.get(openRow.request.id)?.startDate ?? null}");
  });
});

describe("the row", () => {
  it("Given a conversation, Then the row quotes its last message", () => {
    expect(VIEW).toContain("inboxPreview({");
    expect(VIEW).toContain("inboxTimeLabel({");
  });

  it("Given no Stream answer, Then the row falls back to the machine and the price", () => {
    /**
     * ⚠️ The equipment line is the FALLBACK, not the default: it is what shows before the Stream
     * read lands and what stays if Stream is unreachable, so a row is never blank and never waits
     * on a second network call.
     */
    expect(VIEW).toContain("b.equipmentName || b.request.equipmentSummary");
  });

  it("Given the reader sent the last message, Then a tick — and only then", () => {
    // A tick always means «mine», which is what keeps the column scannable.
    expect(VIEW).toContain("{chat?.isMine && (");
    expect(VIEW).toContain('chat.readByOther ? "done_all" : "done"');
  });

  it("Given unread messages, Then a RED pill", () => {
    // The app's own change of 2026-09-20: the per-row count is red, matching its navbar badge.
    expect(VIEW).toMatch(/bg-danger[^"]*text-white/);
    expect(VIEW).toContain('b.unreadCount > 99 ? "99+" : b.unreadCount');
  });

  it("Given the row, Then there is no CTA button on it", () => {
    /**
     * 🔴 Withdrawn with the navigation it belonged to (owner's pick): pressing the row IS the act
     * now, and a button inside a button is invalid markup besides.
     */
    expect(VIEW).not.toContain("ctaLabel");
  });

  it("Given the grouping, Then it stays the web's two levels", () => {
    // His pick of three. The app groups by subtype alone because a phone has no room for two.
    expect(VIEW).toContain("groupMap.get(b.request.id)");
    expect(VIEW).toContain("g.subs");
  });
});

describe("the list keeps itself current", () => {
  it("Given no push on the web, Then the list polls at the dock's own cadence", () => {
    /**
     * 🔴 The app reloads this screen on an FCM `DealRoomDataChanged` and again on every tab
     * revisit; there is no socket behind this list, so without a cadence the unread counts and the
     * previews go stale the moment the tab is left open — which on a chat inbox reads as a
     * broken screen rather than a slow one. 45s is a badge, not a conversation.
     */
    expect(VIEW).toContain("const POLL_MS = 45_000;");
    expect(VIEW).toContain("window.setInterval");
  });

  it("Given a hidden tab, Then nothing is fetched into it", () => {
    // A request per 45s spent on a screen nobody is looking at; `visibilitychange` covers the return.
    expect(VIEW).toContain("if (!document.hidden)");
    expect(VIEW).toContain('window.addEventListener("visibilitychange", onVisible)');
  });

  it("Given a FAILED poll, Then the list is left alone rather than emptied", () => {
    /**
     * 🔴 `setBids([])` belongs to the FIRST read, where there is nothing on screen to
     * protect. On a later one it would blank a working inbox over one dropped request.
     */
    expect(VIEW).toContain("setBids((prev) => prev ?? [])");
  });

  it("Given a poll, Then only the BIDS are re-read", () => {
    // The site, the RFQ code and the two price fields do not move while a renter reads his messages.
    expect(VIEW).toMatch(/fetchReceivedBids\(\)[\s\S]{0,240}\}, \[tick\]\);/);
    expect(VIEW).toMatch(/fetchMyRequests\(\)[\s\S]{0,420}\}, \[\]\);/);
  });

  it("Given the same rooms, Then the previews still refresh", () => {
    // The ids can be identical while every last message has changed, the ordinary case on a busy
    // account, so the tick is what refreshes them rather than the room list changing.
    expect(VIEW).toContain("}, [roomKey, tick]);");
  });
});

describe("the way to the equipment", () => {
  it("Given the inbox, Then the conversation carries a link to the map", () => {
    /**
     * The renter never reaches the map from here otherwise, and it is the yards, the papers and the
     * readiness — everything the conversation is ABOUT.
     */
    expect(VIEW).toContain("onOpenEquipment={openEquipment}");
    expect(VIEW).toContain("/equipment`");
    expect(DOCK).toContain("onOpenEquipment");
  });

  it("Given the map itself, Then the control is not drawn", () => {
    // It would point at the page it is standing on. Absent, not inert.
    expect(DOCK).toContain("{onOpenEquipment && (");
    expect(strip(read("src/components/map/BidMapWorkspace.tsx"))).not.toContain("onOpenEquipment");
  });
});
