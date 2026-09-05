import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { SessionProvider } from "@/lib/session";
import { HomeRequests } from "@/components/home/HomeRequests";
import type { InboxBid } from "@/lib/contract/inbox";
import { en } from "@/lib/i18n/en";
import { groupRequests } from "@/lib/contract/requests";

/**
 * The bids rail on the dashboard — one card per bid, four facts in it (owner, 2026-09-04).
 *
 * *"The bids in home page must show bidder name, equipment name of the request with price, location
 * if there is enough space. But here make sure all these fit in one notification card and doesn't
 * require to scroll horizontal, it looks weird."*
 *
 * ── Why a class is asserted here, which these tests otherwise avoid ─────────────────────────────
 * The horizontal scrollbar was not the content's fault and no query can see it: the column was
 * `overflow-y-auto` and nothing else, and CSS computes the OTHER axis from `visible` to `auto` when
 * one axis scrolls. jsdom lays nothing out, so the only witness available is the declaration itself.
 */

const api = vi.hoisted(() => ({ bids: [] as unknown[], requests: [] as unknown[], submissions: [] as unknown[] }));
vi.mock("@/lib/api/client", () => ({
  fetchAllMyRequests: () => Promise.resolve({ requests: api.requests }),
  fetchReceivedBids: () => Promise.resolve({ bids: api.bids }),
  fetchBids: () => Promise.resolve({ bids: [] }),
  fetchRequestSubmissions: () =>
    Promise.resolve({ renterName: null, openedCount: 0, submittedCount: api.submissions.length, bidDeadline: null, logoUrl: null, groupRef: null, submissions: api.submissions }),
  fetchRequestDetail: () => Promise.resolve({}),
  cancelRequest: () => Promise.resolve({}),
}));

/** One request of the renter's, as the API CLIENT hands it over — already mapped, because that is
 *  what `HomeRequests` groups. */
const request = () => ({
  id: "r1",
  requestGroupId: null,
  shortCode: "EXC-1",
  groupRef: null,
  displayId: "EXC-1",
  code: "EXC-1",
  status: "OPEN",
  createdAt: "2026-09-01T08:00:00Z",
  expiresAt: null,
  city: "King Khalid International Airport, Riyadh",
  bidCount: 1,
  renteeEditUsed: false,
  requiredCerts: [],
  mobByRentee: null,
  demobByRentee: null,
  durationDays: 30,
  item: { name: "Crawler excavator · 20 ton", nameAr: "حفارة · ٢٠ طن", qty: 2, imageUrl: null, imageIsPhoto: false, categoryId: "c1" },
}) as unknown as Parameters<typeof groupRequests>[0][number];

/** One off-platform submission on that request. */
const submission = (over: Record<string, unknown> = {}) => ({
  id: "s-1",
  requestId: "r1",
  createdAt: "2026-09-04T09:00:00Z",
  companyName: "Najd Equipment Est.",
  items: [{ requestItemId: "m1", requestId: "r1", label: "Crawler excavator", numberOfUnits: 2, priceUnit: "PER_MONTH", rentalRate: 21000 }],
  ...over,
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const bid = (over: Partial<InboxBid> = {}): InboxBid => ({
  bidId: "b1",
  status: "SUBMITTED",
  dealRoomId: null,
  dealRoomStatus: null,
  unreadCount: 0,
  currentPrice: 48500,
  priceUnit: "PER_MONTH",
  agreedUnits: null,
  unitsOffered: 1,
  supplierName: "Al Faisal Heavy Equipment Rentals",
  supplierId: null,
  supplierCompanyId: null,
  supplierLogoUrl: null,
  equipmentName: "Crawler excavator 30 ton",
  request: {
    id: "r1",
    displayId: "EXC-170845",
    shortCode: null,
    equipmentSummary: "Crawler excavator",
    groupId: null,
    location: "King Khalid International Airport, Riyadh",
  },
  equipmentType: { id: null, name: null },
  equipment: { subtype: "Crawler excavator", subtypeAr: null, size: "20 ton", sizeAr: null },
  createdAt: "2026-09-03T09:00:00Z",
  supplierStarted: false,
  ...over,
});

beforeEach(() => {
  api.bids = [bid()];
  // The rail belongs to a renter who HAS requests — a renter with none takes the whole block off the
  // dashboard, which is a different case and is not what these describe.
  api.requests = [request()];
  api.submissions = [];
  // `SessionProvider` revalidates over `fetch`, which this file does not otherwise use: without a
  // stub the session resolves to ANON a tick after mount and every renter-scoped read is skipped.
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ user: { id: 7, phone: "+966501112233", tier: "basic" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ));
});
afterEach(cleanup);

const draw = () =>
  render(
    <LocaleProvider initialLocale="en">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <SessionProvider initialUser={{ id: 7, phone: "+966501112233", tier: "basic" } as any}>
        <HomeRequests />
      </SessionProvider>
    </LocaleProvider>,
  );

/** The rail's scrolling column. */
const scroller = () => document.querySelector(".overflow-y-auto") as HTMLElement;

describe("one bid, one card", () => {
  it("states the bidder, the price, the machine and the site", async () => {
    draw();
    const row = (await screen.findByText("Al Faisal Heavy Equipment Rentals")).closest("button")!;
    expect(within(row).getByText("48,500")).toBeTruthy();
    // The machine is the REQUEST's own words — subtype · size — not the supplier's model number
    // (owner, 2026-09-05: *"show equipment subtype and size, not model and year"*).
    expect(within(row).getByText("Crawler excavator · 20 ton")).toBeTruthy();
    expect(within(row).queryByText(/Caterpillar|320/)).toBeNull();
    expect(within(row).getByText(/King Khalid International Airport/)).toBeTruthy();
  });

  it("carries the price's UNIT, because 500 a day and 500 a month are different offers", async () => {
    draw();
    const row = (await screen.findByText("Al Faisal Heavy Equipment Rentals")).closest("button")!;
    expect(within(row).getByText("/ month")).toBeTruthy();
  });

  it("says nothing about a basis the bid never named", async () => {
    api.bids = [bid({ priceUnit: null })];
    draw();
    const row = (await screen.findByText("Al Faisal Heavy Equipment Rentals")).closest("button")!;
    expect(within(row).queryByText(/^\/ /)).toBeNull();
    expect(within(row).getByText("48,500")).toBeTruthy();
  });

  it("never scrolls sideways", async () => {
    draw();
    await screen.findByText("Al Faisal Heavy Equipment Rentals");
    // Both axes stated. `overflow-y-auto` alone is what put a horizontal scrollbar on a 300px rail.
    expect(scroller().className).toContain("overflow-x-hidden");
  });

  it("truncates the long facts rather than widening the card", async () => {
    draw();
    const row = (await screen.findByText("Al Faisal Heavy Equipment Rentals")).closest("button")!;
    // The name and the machine yield; the PRICE never does — a number cut in half is a wrong number.
    expect(within(row).getByText("Al Faisal Heavy Equipment Rentals").className).toContain("truncate");
    expect(within(row).getByText("Crawler excavator · 20 ton").className).toContain("truncate");
    expect(within(row).getByText("48,500").closest("span")!.className).toContain("flex-none");
  });

  it("drops the site, not the machine, when the rail is narrow", async () => {
    // A container query on the RAIL, so the fact that goes is decided by the card's own width rather
    // than by the viewport's — this card is 300px beside the table and full width on a phone.
    draw();
    const row = (await screen.findByText("Al Faisal Heavy Equipment Rentals")).closest("button")!;
    const site = within(row).getByText(/King Khalid International Airport/);
    expect(site.className).toContain("@[260px]/bidrail:block");
    expect(site.className).toContain("hidden");
  });

  it("falls back to the request's own summary when the taxonomy named nothing", async () => {
    api.bids = [bid({ equipment: { subtype: null, subtypeAr: null, size: null, sizeAr: null } })];
    draw();
    expect(await screen.findByText("Crawler excavator")).toBeTruthy();
  });
});

/**
 * ── The rail shows the bids that arrived OFF the platform too (owner, 2026-09-05) ───────────────
 *
 * *"I want these bids to even show the off-platform bids."* The rail read the app's own projection
 * only, so a request whose offers all came through the renter's shared link said «no bids yet» on the
 * dashboard while the workspace listed three of them.
 */
describe("the bids that came through the shared link", () => {
  beforeEach(() => {
    api.requests = [request()];
    api.submissions = [submission()];
  });

  it("puts them in the same rail as the app's own bids", async () => {
    draw();
    expect(await screen.findByText("Najd Equipment Est.")).toBeTruthy();
    expect(screen.getByText("Al Faisal Heavy Equipment Rentals")).toBeTruthy();
    // Both counted, so the heading is the renter's whole answer rather than half of it.
    expect(screen.getByText(/2 new bids/)).toBeTruthy();
  });

  it("states the same four facts, with the machine from the request", async () => {
    draw();
    const row = (await screen.findByText("Najd Equipment Est.")).closest("button")!;
    expect(within(row).getByText("21,000")).toBeTruthy();
    expect(within(row).getByText("/ month")).toBeTruthy();
    expect(within(row).getByText("Crawler excavator · 20 ton")).toBeTruthy();
  });

  it("says where it came from, because there is no chat behind it", async () => {
    draw();
    const row = (await screen.findByText("Najd Equipment Est.")).closest("button")!;
    expect(within(row).getByText(en.workspace.sourceOffline)).toBeTruthy();
    // The app bid beside it carries no such mark.
    const app = screen.getByText("Al Faisal Heavy Equipment Rentals").closest("button")!;
    expect(within(app).queryByText(en.workspace.sourceOffline)).toBeNull();
  });

  it("sorts the newest first, whichever source it came from", async () => {
    // The submission is from 4 Sept and the app bid from 3 Sept.
    draw();
    await screen.findByText("Najd Equipment Est.");
    const names = [...scroller().querySelectorAll("button")].map((b) => b.querySelector("span.truncate")?.textContent);
    expect(names).toEqual(["Najd Equipment Est.", "Al Faisal Heavy Equipment Rentals"]);
  });
});
