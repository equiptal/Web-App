// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { OtherOffers } from "@/components/map/OtherOffers";
import { otherOffers } from "@/lib/contract/other-offers";
import { mapReceivedBids } from "@/lib/contract/inbox";
import { readSupplierDisplayName } from "@/lib/contract/bids";
import { LocaleProvider } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import type { InboxBid } from "@/lib/contract/inbox";

/**
 * **«Other offers» names the other SUPPLIERS on this request** (owner, 2026-09-07: *"this must show
 * other offers' suppliers on this request, not other offers from this supplier… it will show other
 * suppliers' names which are bidders on this equipment request"*).
 *
 * The screenshot behind it: two chips, both «Murad alabdullah», under a header naming «Al-Faisal
 * Contracting Est.» — one firm, listed twice, under the name of the person who typed the bid. Two
 * faults, and each half is pinned below: the strip counts counterparties, and one counterparty has
 * one name across every surface.
 */

const row = (over: Partial<InboxBid>): InboxBid =>
  ({
    bidId: "b1",
    status: "PENDING",
    dealRoomId: null,
    dealRoomStatus: null,
    unreadCount: 0,
    currentPrice: 1000,
    priceUnit: "month",
    agreedUnits: null,
    unitsOffered: 1,
    supplierName: "Al-Faisal Contracting Est.",
    supplierId: "u1",
    supplierCompanyId: "c1",
    supplierLogoUrl: null,
    equipmentName: null,
    request: { id: "rq1", displayId: null, shortCode: null, equipmentSummary: null, groupId: null, location: null },
    equipmentType: { id: null, name: null },
    equipment: { subtype: null, subtypeAr: null, size: null, sizeAr: null },
    createdAt: null,
    supplierStarted: false,
    ...over,
  }) as InboxBid;

afterEach(cleanup);

describe("one chip per supplier", () => {
  it("collapses a firm that bid on two lines of the same request", () => {
    // The reported bug: two bids, one firm, two chips reading like his own other offers.
    const out = otherOffers(
      [
        row({ bidId: "b1", currentPrice: 900 }),
        row({ bidId: "b2", currentPrice: 1200 }),
        row({ bidId: "b3", supplierId: "u2", supplierCompanyId: "c2", supplierName: "Zahid Tractor", currentPrice: 1100 }),
      ],
      "rq1",
      "b1",
    );
    expect(out.map((o) => o.supplierName)).toEqual(["Al-Faisal Contracting Est.", "Zahid Tractor"]);
  });

  it("counts two colleagues of one firm as one supplier", () => {
    // `bidSupplierKey` keys on the COMPANY first, which is how the backend models a counterparty —
    // both members read and write the same deal-room channel.
    const out = otherOffers(
      [row({ bidId: "b1", supplierId: "u1" }), row({ bidId: "b2", supplierId: "u9" })],
      "rq1",
      "b1",
    );
    expect(out).toHaveLength(1);
  });

  it("keeps the bid ON SCREEN as its supplier's chip, even when it is not his cheapest", () => {
    // Otherwise the strip would mark nothing and the renter could not see where he is standing.
    const out = otherOffers(
      [row({ bidId: "cheap", currentPrice: 500 }), row({ bidId: "here", currentPrice: 4000 })],
      "rq1",
      "here",
    );
    expect(out.map((o) => o.bidId)).toEqual(["here"]);
  });

  it("travels to a supplier's cheapest offer when the renter is reading somebody else's", () => {
    const out = otherOffers(
      [
        row({ bidId: "here", supplierCompanyId: "c9", supplierName: "Bin Quraya" }),
        row({ bidId: "dear", currentPrice: 8000 }),
        row({ bidId: "cheap", currentPrice: 700 }),
      ],
      "rq1",
      "here",
    );
    expect(out.find((o) => o.supplierName === "Al-Faisal Contracting Est.")?.bidId).toBe("cheap");
  });

  it("puts the cheapest first and an unpriced offer last", () => {
    const out = otherOffers(
      [
        row({ bidId: "b1", supplierCompanyId: "c1", supplierName: "A", currentPrice: null }),
        row({ bidId: "b2", supplierCompanyId: "c2", supplierName: "B", currentPrice: 300 }),
      ],
      "rq1",
      "b2",
    );
    expect(out.map((o) => o.supplierName)).toEqual(["B", "A"]);
  });

  it("ignores bids on another request", () => {
    const out = otherOffers(
      [row({ bidId: "b1" }), row({ bidId: "b2", supplierCompanyId: "c2", request: { ...row({}).request, id: "rq2" } })],
      "rq1",
      "b1",
    );
    expect(out).toHaveLength(1);
  });
});

describe("one counterparty, one name", () => {
  it("names the FIRM, not the member who submitted the bid", () => {
    // The header above the strip already said the firm; the strip said the person, so the same offer
    // carried two names on one screen.
    const name = readSupplierDisplayName({
      supplierDisplayName: "Murad alabdullah",
      supplier: {
        firstName: "Murad",
        lastName: "alabdullah",
        supplierProfile: { companyName: "Al-Faisal Contracting Est." },
      },
    });
    expect(name).toBe("Al-Faisal Contracting Est.");
  });

  it("falls back to a verified firm's brand, then to the person", () => {
    expect(
      readSupplierDisplayName({ supplier: { company: { name: "Zahid Tractor", isVerified: true } } }),
    ).toBe("Zahid Tractor");
    // An unverified company row is an ops draft, not an identity: the person's name is truer.
    expect(
      readSupplierDisplayName({ supplier: { firstName: "Murad", lastName: "A", company: { name: "Placeholder" } } }),
    ).toBe("Murad A");
  });

  it("carries into the received-bids rows the strip and the rail are built from", () => {
    const [mapped] = mapReceivedBids([
      {
        id: "b1",
        supplierDisplayName: "Murad alabdullah",
        supplier: { id: "u1", supplierProfile: { companyName: "Al-Faisal Contracting Est." } },
        request: { id: "rq1" },
      },
    ]);
    expect(mapped.supplierName).toBe("Al-Faisal Contracting Est.");
  });
});

describe("the strip itself", () => {
  const draw = (offers: ReturnType<typeof otherOffers>, current: string) =>
    render(
      <LocaleProvider initialLocale="en">
        <OtherOffers offers={offers} currentBidId={current} />
      </LocaleProvider>,
    );

  it("draws nothing for a single offer", () => {
    // A row naming only the supplier already on screen is furniture.
    const { container } = draw(otherOffers([row({ bidId: "b1" })], "rq1", "b1"), "b1");
    expect(container.textContent).toBe("");
  });

  it("marks the one being read and offers the others", () => {
    const offers = otherOffers(
      [row({ bidId: "b1" }), row({ bidId: "b2", supplierCompanyId: "c2", supplierName: "Zahid Tractor" })],
      "rq1",
      "b1",
    );
    draw(offers, "b1");
    expect(screen.getByLabelText(en.bidMap.otherBids)).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((el) => el.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    expect(tabs[1].textContent).toContain("Zahid Tractor");
  });
});
