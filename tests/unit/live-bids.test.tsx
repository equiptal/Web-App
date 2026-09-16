import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LocaleProvider } from "@/lib/i18n";
import { SessionProvider } from "@/lib/session";
import { HomeRequests } from "@/components/home/HomeRequests";
import { useLiveTick, BIDS_POLL_MS, LINK_FANOUT_POLL_MS } from "@/lib/live/useLiveTick";
import type { InboxBid } from "@/lib/contract/inbox";
import { groupRequests } from "@/lib/contract/requests";

/**
 * **A bid that arrives while the renter is looking at the screen is ON the screen** (owner,
 * 2026-09-17: *"i want all bids recieved in real time directly in cards and in compare and in the
 * bids list on home page, all must load in real time"*).
 *
 * Three surfaces, and every one of them read its bids exactly once:
 *  · the workspace's CARDS and COMPARE tabs, which share one array fetched per item and never again;
 *  · the dashboard rail's app bids, fetched once per session;
 *  · the dashboard rail's off-platform half, memoised in `subsOnce` for the life of the mount and
 *    never invalidated - which is why a reload was the only thing that ever showed a new one.
 *
 * There is no push channel for a bid (Stream is chat, and its token is minted per deal room), so
 * this is the house's own pattern - the bell, the chat dock and the deal room all poll - with the
 * two rules those three each got half right: nothing runs on a hidden tab, and coming BACK to the
 * tab is itself a read.
 */

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

/** jsdom has no visibility control, so the property is redefined for the length of a case. */
function setHidden(hidden: boolean) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useLiveTick", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setHidden(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("rises on its own clock", async () => {
    const { result } = renderHook(() => useLiveTick(1000));
    expect(result.current).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(result.current).toBe(3);
  });

  it("stops while the tab is hidden, so a dashboard left open overnight asks for nothing", async () => {
    const { result } = renderHook(() => useLiveTick(1000));
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    const before = result.current;
    await act(async () => { setHidden(true); await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current).toBe(before);
  });

  it("treats coming BACK as a read, when the interval has already passed", async () => {
    const { result } = renderHook(() => useLiveTick(1000));
    await act(async () => { setHidden(true); await vi.advanceTimersByTimeAsync(10_000); });
    const hidden = result.current;
    // No timer advance: the return itself is the tick. This is the case the renter notices - he
    // answers a supplier in another tab, comes back, and the bid is there.
    await act(async () => { setHidden(false); });
    expect(result.current).toBe(hidden + 1);
  });

  it("does NOT read on a return inside the interval", async () => {
    // `focus` fires on every click back into the window. Without the elapsed test, a renter working
    // across two windows would fetch on each press.
    const { result } = renderHook(() => useLiveTick(10_000));
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    const before = result.current;
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(result.current).toBe(before);
  });

  it("prices the two clocks apart: the one-call read is fast, the fan-out is not", () => {
    // The dashboard's off-platform half is ONE CALL PER GROUP (capped at `LINK_FANOUT_MAX`), so it
    // must never share the cheap read's cadence.
    expect(BIDS_POLL_MS).toBeLessThan(LINK_FANOUT_POLL_MS);
    expect(BIDS_POLL_MS).toBeGreaterThanOrEqual(10_000);
  });
});

const api = vi.hoisted(() => ({
  bids: [] as unknown[],
  requests: [] as unknown[],
  submissions: [] as unknown[],
  receivedCalls: 0,
  submissionCalls: 0,
}));
vi.mock("@/lib/api/client", () => ({
  fetchAllMyRequests: () => Promise.resolve({ requests: api.requests }),
  fetchReceivedBids: () => {
    api.receivedCalls += 1;
    return Promise.resolve({ bids: api.bids });
  },
  fetchBids: () => Promise.resolve({ bids: [] }),
  fetchRequestSubmissions: () => {
    api.submissionCalls += 1;
    return Promise.resolve({
      renterName: null, openedCount: 0, submittedCount: api.submissions.length,
      bidDeadline: null, logoUrl: null, groupRef: null, submissions: api.submissions,
    });
  },
  fetchRequestDetail: () => Promise.resolve({}),
  cancelRequest: () => Promise.resolve({}),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const request = () => ({
  id: "r1", requestGroupId: null, shortCode: "EXC-1", groupRef: null, displayId: "EXC-1", code: "EXC-1",
  status: "OPEN", createdAt: "2026-09-01T08:00:00Z", expiresAt: null,
  city: "King Khalid International Airport, Riyadh", bidCount: 1, renteeEditUsed: false,
  requiredCerts: [], mobByRentee: null, demobByRentee: null, durationDays: 30,
  item: { name: "Crawler excavator", nameAr: null, qty: 2, imageUrl: null, imageIsPhoto: false, categoryId: "c1" },
}) as unknown as Parameters<typeof groupRequests>[0][number];

const bid = (over: Partial<InboxBid> = {}): InboxBid => ({
  bidId: "b1", status: "SUBMITTED", dealRoomId: null, dealRoomStatus: null, unreadCount: 0,
  currentPrice: 48500, priceUnit: "PER_MONTH", agreedUnits: null, unitsOffered: 1,
  supplierName: "Al Faisal Heavy Equipment Rentals", supplierId: null, supplierCompanyId: null,
  supplierLogoUrl: null, equipmentName: "Crawler excavator 30 ton",
  request: { id: "r1", displayId: "EXC-170845", shortCode: null, equipmentSummary: "Crawler excavator", groupId: null, location: "King Khalid International Airport, Riyadh" },
  equipmentType: { id: null, name: null },
  equipment: { subtype: "Crawler excavator", subtypeAr: null, size: "20 ton", sizeAr: null },
  createdAt: "2026-09-03T09:00:00Z", supplierStarted: false,
  ...over,
});

const draw = () =>
  render(
    <LocaleProvider initialLocale="en">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <SessionProvider initialUser={{ id: 7, phone: "+966501112233", tier: "basic" } as any}>
        <HomeRequests />
      </SessionProvider>
    </LocaleProvider>,
  );

describe("the dashboard's bid rail refreshes itself", () => {
  beforeEach(() => {
    api.bids = [bid()];
    api.requests = [request()];
    api.submissions = [];
    api.receivedCalls = 0;
    api.submissionCalls = 0;
    setHidden(false);
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ user: { id: 7, phone: "+966501112233", tier: "basic" } }), {
        status: 200, headers: { "content-type": "application/json" },
      }),
    ));
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("shows a bid that lands while the dashboard is open, with no reload", async () => {
    draw();
    expect(await screen.findByText("Al Faisal Heavy Equipment Rentals")).toBeTruthy();
    expect(screen.queryByText("Najd Cranes Co.")).toBeNull();

    api.bids = [bid(), bid({ bidId: "b2", supplierName: "Najd Cranes Co.", currentPrice: 44000 })];
    await act(async () => { await vi.advanceTimersByTimeAsync(BIDS_POLL_MS + 100); });

    expect(screen.getByText("Najd Cranes Co.")).toBeTruthy();
  });

  it("keeps the rows on screen while the refresh is in flight", async () => {
    // The refresh is a SECOND effect on purpose: the mount's own read empties the rail first, and
    // ticking that one would blank the card for the length of a round trip every fifteen seconds.
    draw();
    await screen.findByText("Al Faisal Heavy Equipment Rentals");
    await act(async () => { await vi.advanceTimersByTimeAsync(BIDS_POLL_MS + 100); });
    expect(screen.getByText("Al Faisal Heavy Equipment Rentals")).toBeTruthy();
  });

  it("does not ask again while the tab is hidden", async () => {
    draw();
    await screen.findByText("Al Faisal Heavy Equipment Rentals");
    const before = api.receivedCalls;
    await act(async () => { setHidden(true); await vi.advanceTimersByTimeAsync(BIDS_POLL_MS * 4); });
    expect(api.receivedCalls).toBe(before);
  });

  it("re-reads the off-platform half on the SLOWER clock, not the fast one", async () => {
    // `subsOnce` is a per-request memo that was never invalidated. The fan-out empties it once per
    // slow tick; within a tick the deadline lookup still shares this fan's single call.
    draw();
    await screen.findByText("Al Faisal Heavy Equipment Rentals");
    // The mount's OWN fan-out has to have landed before its calls can be told from a tick's: the
    // rail paints off the app bids, which resolve first, so the row is on screen a moment before the
    // off-platform read returns.
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    const afterMount = api.submissionCalls;
    expect(afterMount).toBeGreaterThan(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(BIDS_POLL_MS + 100); });
    expect(api.submissionCalls, "the fast tick must not fan out").toBe(afterMount);
    await act(async () => { await vi.advanceTimersByTimeAsync(LINK_FANOUT_POLL_MS + 100); });
    expect(api.submissionCalls).toBeGreaterThan(afterMount);
  });
});

describe("the workspace's two tabs", () => {
  const src = read("src/components/workspace/RequestsWorkspace.tsx");

  it("re-reads the open item's bids on the tick", () => {
    expect(src).toContain("useLiveTick(BIDS_POLL_MS)");
    expect(src).toMatch(/\}, \[status, itemId, showLarger, bidTick\]\);/);
  });

  it("empties the panes on an ITEM change and never on a refresh", () => {
    // Without the distinction every poll would blank both panes for the length of a round trip: the
    // cards would flash their «No bids yet» and the table would fold to nothing, every 15 seconds.
    expect(src).toContain("loadedFor.current !== key");
  });

  it("draws the CARDS rail from every bid, bench included", () => {
    /* The bench is a ✕ on a compare COLUMN, and it was taking the bid off the cards tab too - a tab
       with no bench strip, no ✕ and no way back. Only a reload (which empties `benched`) brought it
       back, which is half of what the owner reported as *"bids doesnt appear directly in the bid
       cards … only after refresh"*. */
    const cards = src.slice(src.indexOf("<BidCards"), src.indexOf("onToggle={toggleBid}"));
    expect(cards).toContain("bids={shownAll}");
    expect(cards).not.toContain("bids={shown}");
  });

  it("keeps the bench for the COMPARISON and the sheet it prints", () => {
    const matrix = src.slice(src.indexOf("<CompareMatrix"), src.indexOf("ranking={ranking}"));
    expect(matrix).toContain("bids={shownAll}");
    expect(matrix).toContain("benched={benched}");
    // The comparison's own export and the assistant still read the benched-out set: both answer
    // questions about the table, and a sheet that printed a bid struck off in front of the renter is
    // a sheet that disagrees with its own screen (2026-08-25).
    expect(src).toContain("<AiRankPanel bids={shown}");
    expect(src).toContain("const printComparison = useCallback(() => {\n    if (typeof window === \"undefined\" || !item || shown.length === 0) return;");
  });

  it("downloads the quotation for a benched bid, because the cards tab still shows it", () => {
    expect(src).toContain("checkedBids.size > 0 ? shownAll.filter((b) => checkedBids.has(b.card.id)) : shownAll");
  });
});
