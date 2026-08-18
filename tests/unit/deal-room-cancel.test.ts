import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
