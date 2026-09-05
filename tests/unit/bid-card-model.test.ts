/**
 * The card model — the one shape behind the generated image, the clipboard card and the emailed one.
 *
 * The fixtures are `GET /public/bid-form/{token}` payloads, because that is what the card now reads:
 * the preview endpoint's two strings never carried a term, which is why no term ever appeared on a
 * card in production (2026-09-01).
 */

import { describe, it, expect } from "vitest";
import { bidCardDescription, bidCardModel, cityOf } from "@/lib/bidCardModel";
import type { BidFormData, BidFormItem } from "@/lib/contract/link-bids";

const item = (over: Partial<BidFormItem> = {}): BidFormItem =>
  ({
    requestItemId: "i1",
    label: "Tower light",
    labelAr: "برج إنارة",
    size: "9m",
    sizeAr: "٩م",
    numberOfUnits: 6,
    imageUrl: null,
    priceUnit: "PER_MONTH",
    deliveryBy: "supplier",
    returnBy: "supplier",
    notes: null,
    requiredTerms: {
      operator: "YES",
      nationality: null,
      nightShift: null,
      fatFood: "supplier",
      fatTransport: "renter",
      fuel: "renter",
      fuelType: "Diesel",
      year: null,
      operatorCert: null,
      equipmentCert: null,
    },
    ...over,
  }) as BidFormItem;

const form = (over: Partial<BidFormData> = {}): BidFormData =>
  ({
    token: "t",
    status: "open",
    closedReason: null,
    deadline: "2026-08-21T20:59:00.000Z",
    renter: { name: null, contactName: null, city: null, verified: false, logoUrl: null },
    projectTerms: {
      location: "6305 Abi Dajanah, Al Mursilat, Riyadh 12461, Saudi Arabia",
      lat: null,
      lng: null,
      rentalBasis: "MONTHLY",
      startDate: "2026-08-18T00:00:00.000Z",
      endDate: "2026-09-17T00:00:00.000Z",
      hoursPerDay: null,
      workingDaysPerWeek: null,
    },
    contractTerms: [],
    notes: null,
    items: [item()],
    ...over,
  }) as BidFormData;

const copy = { title: "EXC-170845 — Tower light rental, 6 units", description: "Riyadh · 30-day rental · Bids close 21 Aug" };
const preview = { reference: "EXC-170845", status: "open" } as never;

describe("cityOf", () => {
  it("Given a Google-formatted address, When read, Then it answers the city and not the country", () => {
    // Taking the last segment gave every card "Saudi Arabia"; the postcode rides on the city segment.
    expect(cityOf("6305 Abi Dajanah, Al Mursilat, Riyadh 12461, Saudi Arabia")).toBe("Riyadh");
  });

  it("Given a label that is only a city, When read, Then it comes back unchanged", () => {
    expect(cityOf("Jeddah")).toBe("Jeddah");
  });

  it("Given nothing, When read, Then null — the row is simply not drawn", () => {
    expect(cityOf(null)).toBeNull();
  });

  it("Given a COMMA-LESS label, Then the country is still stripped", () => {
    /**
     * ⚠️ Found against live staging, 2026-09-03. `COUNTRY_SEGMENTS` matches a WHOLE segment, so
     * "Diriyah Saudi Arabia" is one segment that is not the country and the entire string came back
     * as the city — and a label with no commas is not a rare shape, it is what a dropped PIN
     * returns. The card IMAGE for CEX-020902 read «Diriyah» while the e-mail BODY of the same
     * request read «QFC4+RX Diriyah Saudi Arabia»: the agents backend had fixed its copy of this
     * function and this one had not.
     */
    expect(cityOf("QFC4+RX Diriyah Saudi Arabia")).toBe("Diriyah");
    expect(cityOf("Riyadh Kingdom of Saudi Arabia")).toBe("Riyadh");
  });

  it("Given a PLUS CODE, Then it is dropped — it names nothing a supplier can read", () => {
    // A grid reference, and it LEADS the line, taking the room the city needs.
    expect(cityOf("QFC4+RX Diriyah")).toBe("Diriyah");
    // Nothing but the grid reference: no city at all beats a card that says «QFC4+RX».
    expect(cityOf("QFC4+RX")).toBeNull();
  });

  it("Given «ksa» inside a word, Then the word survives — the tail must be its own word", () => {
    // A bare `endsWith` would turn a city transliterated "Miksa" into "Mi".
    expect(cityOf("Miksa")).toBe("Miksa");
  });

  it("Given a label that is ONLY a country, Then null rather than «Saudi Arabia» as the site", () => {
    /**
     * ⚠️ It used to fall back to the raw last segment, which put the country on the card as the
     * place the machine is going. `where` drops a null part, so the line reads the duration and the
     * dates alone — shorter, and true.
     */
    expect(cityOf("Saudi Arabia")).toBeNull();
    expect(cityOf("12461, Saudi Arabia")).toBeNull();
  });
});

describe("bidCardModel", () => {
  it("Given one machine, When built, Then the image names it and the card carries the detail", () => {
    const m = bidCardModel(preview, copy, "en", form());

    expect(m.ref).toBe("EXC-170845");
    expect(m.imageHeadline).toBe("Tower light 9m · with operator ×6");
    // The machine is already in the title, so it is not repeated as a row below it.
    expect(m.items).toEqual([]);
    expect(m.where).toBe("Riyadh · 1 month · 18 Aug → 17 Sep 2026");
    expect(m.terms).toEqual([
      { label: "Mobilization", value: "Supplier" },
      { label: "Demobilization", value: "Supplier" },
      { label: "Food", value: "Supplier" },
      { label: "Accommodation & transport", value: "Renter" },
      { label: "Fuel", value: "Renter · diesel" },
    ]);
    expect(m.closing).toBe("Bidding closes 21 Aug 2026");
    expect(m.cta).toBe("Open the link to submit your bid →");
  });

  it("Given three machines, When built, Then the image counts the rest and the card lists them", () => {
    const m = bidCardModel(
      preview,
      copy,
      "en",
      form({
        items: [
          item(),
          item({ requestItemId: "i2", label: "Generator", size: "250 kVA", numberOfUnits: 2 }),
          item({ requestItemId: "i3", label: "Manlift", size: "16m", numberOfUnits: 1 }),
        ],
      }),
    );

    // The image names one machine and counts the rest in words a supplier reads at a glance.
    expect(m.imageHeadline).toBe("Tower light 9m · with operator ×6 + 2 other equipment items");
    expect(m.cardTitle).toBe("3 machines · Riyadh");
    expect(m.items).toHaveLength(3);
    expect(m.items[1].label).toBe("Generator 250 kVA · with operator");
    expect(m.items[1].units).toBe("×2");
    // These three agree on every term, so nothing hangs off the individual rows.
    expect(m.items[1].terms).toEqual([]);
  });

  it("Given a term that differs per machine, When built, Then each machine states its OWN answer", () => {
    /**
     * ~~It used to collapse a disagreement to the word "Varies by machine".~~ That told a supplier
     * there was something he needed to know without telling him what it was, so he priced one of the
     * answers and found out which at the deal room. Two excavators where one is delivered by the
     * renter and one by the supplier is an ordinary request, and it is drawn as one.
     */
    const m = bidCardModel(
      preview,
      copy,
      "en",
      form({ items: [item(), item({ requestItemId: "i2", deliveryBy: "renter" })] }),
    );

    // Not in the request's shared block, because the request has no single answer for it.
    expect(m.terms.some((r) => r.label === "Mobilization")).toBe(false);
    // On each machine, as the fact it is.
    expect(m.items[0].terms).toContainEqual({ label: "Mobilization", value: "Supplier" });
    expect(m.items[1].terms).toContainEqual({ label: "Mobilization", value: "Renter" });
    // What they DO agree on stays stated once, above.
    expect(m.terms.some((r) => r.label === "Fuel")).toBe(true);
  });

  it("Given the endpoint's newer \"On Supplier\" spelling, When built, Then the card reads the same party", () => {
    /**
     * `getBidForm.ts` began sending `"On Supplier"` / `"On Renter"` on 2026-09-02. `party()` matched
     * the bare words only, so the prefixed value fell past both branches and the card printed the raw
     * English string — on an Arabic card too.
     */
    const m = bidCardModel(
      preview,
      copy,
      "en",
      form({
        items: [
          item({ deliveryBy: "On Supplier", returnBy: "On Supplier" }),
          item({ requestItemId: "i2", deliveryBy: "On Renter", returnBy: "On Renter" }),
        ],
      }),
    );

    expect(m.items[0].terms).toContainEqual({ label: "Mobilization", value: "Supplier" });
    expect(m.items[1].terms).toContainEqual({ label: "Mobilization", value: "Renter" });
  });

  it("Given a year and a certificate, When built, Then the card asks for them", () => {
    /**
     * Owner, 2026-09-02: the card carries *"cert or year if required"*. A supplier who brings a 2009
     * machine to a request that said 2015+ has wasted a mobilization, and one who arrives without a
     * TUV certificate cannot work at all — both are things he must read BEFORE he prices.
     */
    const m = bidCardModel(
      preview,
      copy,
      "en",
      form({
        items: [
          item({ requiredTerms: { ...item().requiredTerms, year: "2015", equipmentCert: "TÜV", operatorCert: "SPSP" } }),
        ],
      }),
    );

    expect(m.terms).toContainEqual({ label: "Equipment year", value: "2015" });
    expect(m.terms).toContainEqual({ label: "Certificates", value: "TÜV, SPSP" });
  });

  it("Given a year of «any», Then no row — it is the absence of a requirement", () => {
    // "Any year" is what a request says when nobody set one. Printing it as a requirement invites a
    // supplier to read the block as though every line were a constraint.
    const m = bidCardModel(
      preview,
      copy,
      "en",
      form({ items: [item({ requiredTerms: { ...item().requiredTerms, year: "any" } })] }),
    );
    expect(m.terms.some((r) => r.label === "Equipment year")).toBe(false);
  });

  it("Given terms the renter left unset, When built, Then those rows do not exist", () => {
    const bare = item({
      deliveryBy: null,
      returnBy: null,
      requiredTerms: { ...item().requiredTerms, fatFood: null, fatTransport: null, fuel: null, fuelType: null },
    });
    const m = bidCardModel(preview, copy, "en", form({ items: [bare] }));

    // Never "Fuel: —": an empty row teaches a supplier to skim the block, and then he skims the row
    // that mattered.
    expect(m.terms).toEqual([]);
  });

  it("Given no deadline, When built, Then nothing takes the closing line's place", () => {
    const m = bidCardModel(preview, copy, "en", form({ deadline: null }));
    expect(m.closing).toBeNull();
  });

  it("Given a closed request, When built, Then the state is ADDED to the detail, not put in its place", () => {
    const m = bidCardModel(preview, copy, "en", form({ status: "closed", closedReason: "deadline" }));

    expect(m.cta).toBe("No longer accepting bids");
    expect(m.closing).toBe("Closed 21 Aug 2026. No longer accepting bids");
    // The request stays named. The backend's own string replaces the whole description, so a link
    // forwarded a week later loses the city and the dates — this is the fault being fixed.
    expect(m.where).toBe("Riyadh · 1 month · 18 Aug → 17 Sep 2026");
    expect(bidCardDescription(m)).toContain("Riyadh");
    expect(bidCardDescription(m)).toContain("No longer accepting bids");
  });

  it("Given no form payload, When built, Then it falls back to splitting the preview strings", () => {
    const m = bidCardModel(preview, copy, "en", null);

    expect(m.imageHeadline).toBe("Tower light rental, 6 units");
    expect(m.where).toBe("Riyadh · 30-day rental");
    expect(m.terms).toEqual([]);
  });

  it("Given Arabic, When built, Then the labels and the month are Arabic and the count is not", () => {
    const m = bidCardModel(preview, copy, "ar", form());

    expect(m.imageHeadline).toBe("برج إنارة ٩م · مع مشغّل ×6");
    // The city is read out of `projectAddressLabel`, which is whatever Google returned when the site
    // was made — usually English, on an Arabic card too. Translating it here would be inventing a
    // name for somebody's site.
    expect(m.where).toContain("Riyadh");
    expect(m.terms[0]).toEqual({ label: "النقل إلى الموقع", value: "على المؤجّر" });
    expect(m.closing).toBe("يُغلق الاستقبال 21 أغسطس 2026");
  });
});

describe("bidCardDescription", () => {
  it("Given a full request, Then the deadline survives and the terms fill what is left", () => {
    // WhatsApp gives about two lines. This used to join everything and hand over ~215 characters, so
    // the client cut the tail — and the tail was the deadline, the one line that decides whether a
    // supplier acts today or next week.
    const d = bidCardDescription(bidCardModel(preview, copy, "en", form()));

    expect(d.length).toBeLessThanOrEqual(200);
    expect(d).toContain("Riyadh");
    expect(d).toContain("Bidding closes 21 Aug 2026");
    // The order is the priority order: where, deadline, then terms while they fit.
    expect(d.indexOf("Bidding closes")).toBeLessThan(d.indexOf("Mobilization"));
  });

  it("Given more terms than fit, Then it stops on a whole term rather than mid-word", () => {
    const long = form({
      items: [
        item({
          requiredTerms: {
            ...item().requiredTerms,
            fatFood: "A very long answer that will not fit inside the budget at all",
          },
        }),
      ],
    });
    const d = bidCardDescription(bidCardModel(preview, copy, "en", long));

    expect(d.length).toBeLessThanOrEqual(200);
    // A term that does not fit is on the page one tap away; a half-written one is noise.
    expect(d.endsWith("·")).toBe(false);
  });
});
