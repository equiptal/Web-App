import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { SessionProvider } from "@/lib/session";
import { HomeRequests } from "@/components/home/HomeRequests";
import type { InboxBid } from "@/lib/contract/inbox";

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

const api = vi.hoisted(() => ({ bids: [] as unknown[] }));
vi.mock("@/lib/api/client", () => ({
  // No requests: the table draws its loading rows and the rail is what is under test. A renter with
  // no requests at all takes the whole block off the page, which is a different case.
  fetchAllMyRequests: () => new Promise(() => {}),
  fetchReceivedBids: () => Promise.resolve({ bids: api.bids }),
  fetchBids: () => Promise.resolve({ bids: [] }),
  fetchRequestSubmissions: () => Promise.resolve(null),
  fetchRequestDetail: () => Promise.resolve({}),
  cancelRequest: () => Promise.resolve({}),
}));
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
  createdAt: "2026-09-03T09:00:00Z",
  supplierStarted: false,
  ...over,
});

beforeEach(() => {
  api.bids = [bid()];
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
    expect(within(row).getByText("Crawler excavator 30 ton")).toBeTruthy();
    expect(within(row).getByText(/King Khalid International Airport/)).toBeTruthy();
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
    expect(screen.getByText("Al Faisal Heavy Equipment Rentals").className).toContain("truncate");
    expect(screen.getByText("Crawler excavator 30 ton").className).toContain("truncate");
    expect(within(row).getByText("48,500").className).toContain("flex-none");
  });

  it("drops the site, not the machine, when the rail is narrow", async () => {
    // A container query on the RAIL, so the fact that goes is decided by the card's own width rather
    // than by the viewport's — this card is 300px beside the table and full width on a phone.
    draw();
    await screen.findByText("Al Faisal Heavy Equipment Rentals");
    const site = screen.getByText(/King Khalid International Airport/);
    expect(site.className).toContain("@[260px]/bidrail:block");
    expect(site.className).toContain("hidden");
  });

  it("falls back to the request's own summary when the bid names no machine", async () => {
    api.bids = [bid({ equipmentName: null })];
    draw();
    expect(await screen.findByText("Crawler excavator")).toBeTruthy();
  });
});
