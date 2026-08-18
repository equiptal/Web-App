import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSiblingTabs } from "@/lib/contract/sibling-tabs";
import { dealSystemEventKind, dealSystemEventIcon, SYSTEM_EVENT_ICON } from "@/lib/contract/deal-system-event";

/**
 * **Cancelling a negotiation from the web room** (app parity, module 4A).
 *
 * The act itself is one POST, so most of what can go wrong here is not in the call — it is in the
 * three things around it that no type checks and no eye reliably catches:
 *
 *   1. The REASON reaching the backend under the field it stores it in, trimmed and capped, and
 *      absent rather than empty when the renter states none.
 *   2. The read-only GATE. A CLOSED or ABANDONED room has nothing left to cancel; an entry that
 *      survives into one offers the renter an act the backend will refuse.
 *   3. The menu's ANCHOR. The dropdown lives outside `.topbar` because that bar scrolls sideways
 *      and would clip it — a positioning bug that renders as "the menu is invisible on a laptop"
 *      and reproduces on no wide screen.
 */

const ROOM = readFileSync(resolve(process.cwd(), "src/components/deal-room/DealRoom.tsx"), "utf8");
const CSS = readFileSync(resolve(process.cwd(), "src/components/deal-room/deal-room-proto.css"), "utf8");

vi.mock("@/lib/api/app-backend-authed", () => ({
  withAuthedBackend: async (_req: Request, fn: (call: (p: string, i?: RequestInit) => Promise<unknown>) => Promise<Response>) =>
    fn((path: string, init?: RequestInit) => {
      calls.push([path, init]);
      return Promise.resolve({ ok: true });
    }),
  appAuthErrorResponse: () => new Response(null, { status: 401 }),
}));

const calls: Array<[string, RequestInit | undefined]> = [];

import { POST } from "@/app/api/me/deal-rooms/[id]/close/route";

function req(body?: unknown) {
  return new Request("http://localhost/api/me/deal-rooms/dr_1/close", {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const params = { params: Promise.resolve({ id: "dr_1" }) };
const lastBody = () => JSON.parse(String(calls[calls.length - 1][1]?.body ?? "{}")) as { reasonText?: string };

describe("POST /api/me/deal-rooms/:id/close", () => {
  it("forwards the reason to the backend's own close endpoint, under its own field name", async () => {
    await POST(req({ reasonText: "Price is not suitable" }), params);
    expect(calls[calls.length - 1][0]).toBe("/api/deal-rooms/dr_1/close");
    expect(lastBody().reasonText).toBe("Price is not suitable");
  });

  it("trims the renter's own words and caps them at the backend's 1000", async () => {
    await POST(req({ reasonText: `  ${"x".repeat(1200)}  ` }), params);
    expect(lastBody().reasonText).toHaveLength(1000);
  });

  it("omits the field entirely when the renter states no reason — an empty string is not a reason", async () => {
    await POST(req({ reasonText: "   " }), params);
    expect(lastBody()).not.toHaveProperty("reasonText");
  });

  it("still closes the room when the request carries no body at all", async () => {
    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    expect(calls[calls.length - 1][0]).toBe("/api/deal-rooms/dr_1/close");
  });
});

describe("the cancel entry in the room's ⋮ kebab", () => {
  it("offers the renter the app's six reasons, with the free-text one LAST", () => {
    // The free-text box is keyed by position (`picked === CANCEL_REASONS.length - 1`), so a reason
    // appended after "Other reason" would silently take the textarea with it.
    const list = ROOM.slice(ROOM.indexOf("const CANCEL_REASONS"));
    const reasons = [...list.slice(0, list.indexOf("];")).matchAll(/\{ en: "([^"]+)"/g)].map((m) => m[1]);
    expect(reasons).toEqual([
      "Found a better offer",
      "Price is not suitable",
      "Equipment does not match",
      "Delayed response",
      "Emergency circumstances",
      "Other reason",
    ]);
  });

  it("hides itself on a read-only room — CLOSED or ABANDONED", () => {
    const entry = ROOM.indexOf('setCancelOpen(true)');
    expect(entry).toBeGreaterThan(-1);
    // The gate sits immediately above the entry, in the same JSX branch.
    expect(ROOM.slice(entry - 400, entry)).toContain("!closed && !abandoned");
  });

  it("keeps the dropdown OUT of the sideways-scrolling top bar", () => {
    const topbarEnd = ROOM.indexOf('{/* The kebab\'s menu is a sibling of the top bar');
    const menu = ROOM.indexOf('className="dr-menu"');
    expect(topbarEnd).toBeGreaterThan(-1);
    expect(menu).toBeGreaterThan(topbarEnd);
  });

  it("anchors the dropdown to a positioned .dlproto, so it cannot fly to the page corner", () => {
    // `.dr-menu` is absolutely positioned; without `position: relative` on `.dlproto` it would
    // resolve against the viewport instead and land nowhere near the kebab.
    expect(/\.dlproto\s*\{[^}]*position:\s*relative/.test(CSS)).toBe(true);
    expect(/\.dlproto \.dr-menu\s*\{[^}]*position:\s*absolute/.test(CSS)).toBe(true);
  });
});

/* ══════════════ the sibling strip (app parity: `sibling_item_tabs.dart`) ══════════════ */
describe("buildSiblingTabs", () => {
  const req = (id: string, name: string) => ({ id, displayId: `REQ-${id}`, item: { name, nameAr: `${name}-ar` } });
  const bids: Record<string, { bidId: string; dealRoomId: string | null }> = {
    r1: { bidId: "b1", dealRoomId: "dr1" },
    r2: { bidId: "b2", dealRoomId: null },
    r3: { bidId: "b3", dealRoomId: "dr3" },
  };
  const build = (ids: string[], current: string, only?: string[]) =>
    buildSiblingTabs({
      siblings: ids.map((i) => req(i, `Item ${i}`)),
      currentRequestId: current,
      bidOn: (id) => (only && !only.includes(id) ? null : bids[id] ?? null),
    });

  it("gives one tab per sibling this supplier bid on, in the posted order", () => {
    expect(build(["r1", "r2", "r3"], "r1").map((t) => t.requestId)).toEqual(["r1", "r2", "r3"]);
  });

  it("skips a sibling he never bid on — there is no conversation to open", () => {
    // Not a disabled tab and not an empty thread: no tab.
    expect(build(["r1", "r2", "r3"], "r1", ["r1", "r3"]).map((t) => t.requestId)).toEqual(["r1", "r3"]);
  });

  it("keeps a tab for a sibling with no room yet", () => {
    // Opening a conversation creates nothing; SENDING creates the room. Hiding the tab until then
    // would mean the renter can only reach the conversations he has already started.
    const tab = build(["r1", "r2"], "r1").find((t) => t.requestId === "r2");
    expect(tab?.dealRoomId).toBeNull();
    expect(tab?.bidId).toBe("b2");
  });

  it("marks exactly the room the renter is standing in", () => {
    const tabs = build(["r1", "r2", "r3"], "r2");
    expect(tabs.filter((t) => t.isCurrent).map((t) => t.requestId)).toEqual(["r2"]);
  });

  it("refuses a strip of one — there is nowhere to switch to", () => {
    expect(build(["r1", "r2"], "r1", ["r1"])).toEqual([]);
    expect(build(["r1"], "r1")).toEqual([]);
  });

  it("refuses a strip that does not contain the current room", () => {
    // It would read as "this conversation is not part of that submission". It can happen honestly —
    // a bid withdrawn between the two reads, or a sibling list that paged short.
    expect(build(["r1", "r2"], "r9")).toEqual([]);
  });

  it("names a tab by its ITEM, in both locales", () => {
    // Every sibling in a group was posted at the same moment about the same project, so the request's
    // own reference does not distinguish them.
    const tab = build(["r1", "r2"], "r1")[0];
    expect(tab.label).toEqual({ en: "Item r1", ar: "Item r1-ar" });
  });

  it("falls back to the printed reference, never to a bare id", () => {
    // A tab the renter cannot read is a tab he cannot choose.
    const tabs = buildSiblingTabs({
      siblings: [{ id: "r1", displayId: "REQ-88" }, { id: "r2", shortCode: "REQ-89" }],
      currentRequestId: "r1",
      bidOn: (id) => bids[id] ?? null,
    });
    expect(tabs.map((t) => t.label.en)).toEqual(["REQ-88", "REQ-89"]);
  });

  it("reads the app's raw equipmentItems shape too", () => {
    const tabs = buildSiblingTabs({
      siblings: [
        { id: "r1", equipmentItems: [{ subtypeName: "Crawler excavator", capacityName: "30 ton" }] },
        { id: "r2", equipmentItems: [{ categoryNameAr: "رافعة" }] },
      ],
      currentRequestId: "r1",
      bidOn: (id) => bids[id] ?? null,
    });
    expect(tabs[0].label.en).toBe("Crawler excavator · 30 ton");
    // One locale missing is not a reason to fall back to a code — the other still names the machine.
    expect(tabs[1].label).toEqual({ en: "رافعة", ar: "رافعة" });
  });
});

/* ══════════════ the system line's glyph (app parity: `dealSystemEventType`) ══════════════
   The backend narrates every move as a plain sentence and sends no type beside it, so both clients
   read the sentence — in whichever language the room was acted in. What is guarded here is the
   ORDER (a line can hold two of these words) and the fallback. */
describe("dealSystemEventKind", () => {
  it("reads each move in English and in Arabic", () => {
    expect(dealSystemEventKind("Supplier proposed 4,000 SAR")).toBe("offer-received");
    expect(dealSystemEventKind("اقترح المورد سعراً جديداً")).toBe("offer-received");
    expect(dealSystemEventKind("Rentee countered")).toBe("counter-sent");
    expect(dealSystemEventKind("عرض مضاد من المستأجر")).toBe("counter-sent");
    expect(dealSystemEventKind("Supplier accepted all terms")).toBe("accepted");
    expect(dealSystemEventKind("قبل جميع الشروط")).toBe("accepted");
    expect(dealSystemEventKind("Supplier declined")).toBe("cancelled");
    expect(dealSystemEventKind("أغلق غرفة التفاوض")).toBe("cancelled");
  });

  it("treats a withdrawn acceptance as a counter, not a cancellation", () => {
    // The room goes back to negotiating; nothing was cancelled.
    expect(dealSystemEventKind("Rentee withdrew their acceptance")).toBe("counter-sent");
    expect(dealSystemEventKind("سحب المستأجر قبوله")).toBe("counter-sent");
  });

  it("resolves a line holding two of the words to the act that changed the room", () => {
    // "countered" is tested before "declined", so this reads as the counter it is. Reordering these
    // silently relabels real conversations, which is why the order is the app's.
    expect(dealSystemEventKind("Rentee countered, supplier declined")).toBe("counter-sent");
  });

  it("falls back to the neutral glyph rather than to nothing", () => {
    expect(dealSystemEventKind("Something nobody has taught this yet")).toBe("room-opened");
    expect(dealSystemEventKind("")).toBe("room-opened");
    expect(dealSystemEventKind(null)).toBe("room-opened");
  });

  it("honours the caller's room-opened flag over the text", () => {
    // The app keys this off a synthetic message id the web does not mint, so the caller says so.
    expect(dealSystemEventKind("Supplier proposed 4,000", { isRoomOpened: true })).toBe("room-opened");
  });

  it("gives each kind its own glyph — one bolt for everything said only 'something happened'", () => {
    const icons = new Set(Object.values(SYSTEM_EVENT_ICON));
    expect(icons.size).toBe(Object.keys(SYSTEM_EVENT_ICON).length);
    expect(dealSystemEventIcon("Supplier accepted all terms")).toBe("check_circle");
  });
});
