import { describe, it, expect } from "vitest";
import { siteConflicts, periodDiffers, siteSpan } from "@/lib/contract/project";
import { mapAwardBook } from "@/lib/contract/award";

/**
 * Editing a site is editing the SITE (owner, 2026-08-31).
 *
 * *"Edit the project by default, no need to mention its sub children like requests or work orders
 * unless there is a conflict between project and work order or request — it will ask the user keep
 * it different or apply to all. In case a request can't be edited, just inform him of the
 * conflict."*
 *
 * So the question is no longer *what would you like to apply this to* but *what would now disagree
 * with you*. Everything below is that test.
 */

type Group = Parameters<typeof siteConflicts>[0][number];

const site = { startDate: "2026-09-01", endDate: "2026-12-31" };

const wo = (over: Partial<Group> = {}): Group => ({
  id: "wo1",
  kind: "work_order",
  ref: "WO-1",
  title: "Own fleet",
  when: null,
  ...over,
});

const req = (over: Partial<Group> = {}): Group => ({
  id: "r1",
  kind: "request",
  ref: "RFQ-1042",
  status: "OPEN",
  bidCount: 0,
  renteeEditUsed: false,
  when: { startDate: "2026-09-01", endDate: "2026-12-31" },
  ...over,
});

describe("what actually disagrees with the site", () => {
  it("says nothing about a work order that has no period of its own", () => {
    /* `when: null` IS inheritance. It already follows the site, so changing the site changes it —
       there is no decision to put in front of anyone. This is the case that made the old list feel
       like busywork: it was always there, always tickable, and ticking it did nothing. */
    expect(siteConflicts([wo()], site)).toEqual([]);
  });

  it("says nothing about a request whose dates already match", () => {
    expect(siteConflicts([req()], site)).toEqual([]);
  });

  it("raises a work order that carries its own period", () => {
    const found = siteConflicts([wo({ when: { startDate: "2026-10-01", endDate: "2027-03-31" } })], site);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ ref: "Own fleet", startDate: "2026-10-01", editable: true });
  });

  it("raises a request whose dates differ, and lets it move while it is free", () => {
    const found = siteConflicts([req({ when: { startDate: "2026-08-01", endDate: "2026-12-31" } })], site);

    expect(found).toHaveLength(1);
    expect(found[0].editable).toBe(true);
    expect(found[0].reason).toBe("free");
  });

  it("compares end dates too, not just starts", () => {
    const found = siteConflicts([req({ when: { startDate: "2026-09-01", endDate: "2027-06-30" } })], site);
    expect(found).toHaveLength(1);
  });
});

describe("rows that cannot take the new dates are told, not offered", () => {
  it("marks a request whose one post-bid edit is spent as not editable", () => {
    const found = siteConflicts(
      [req({ when: { startDate: "2026-08-01", endDate: "2026-12-31" }, bidCount: 3, renteeEditUsed: true })],
      site,
    );

    expect(found).toHaveLength(1);
    expect(found[0].editable).toBe(false);
    expect(found[0].reason).toBe("edit_used");
  });

  it("marks a closed request as not editable", () => {
    const found = siteConflicts(
      [req({ when: { startDate: "2026-08-01", endDate: "2026-12-31" }, status: "CLOSED" })],
      site,
    );

    expect(found[0].editable).toBe(false);
    expect(found[0].reason).toBe("closed");
  });

  it("still LISTS them — a renter who is not told finds out from a supplier", () => {
    /* The one that cannot change is the one worth saying out loud: the site will read one thing and
       a live request another, and nobody is going to notice on their own. */
    const found = siteConflicts(
      [
        req({ id: "a", when: { startDate: "2026-08-01", endDate: "2026-12-31" }, status: "CLOSED" }),
        req({ id: "b", when: { startDate: "2026-08-01", endDate: "2026-12-31" } }),
      ],
      site,
    );

    expect(found.map((f) => f.id)).toEqual(["a", "b"]);
    expect(found.filter((f) => f.editable)).toHaveLength(1);
  });

  it("still counts a request with bids as movable — it costs the edit, it is not refused", () => {
    const found = siteConflicts(
      [req({ when: { startDate: "2026-08-01", endDate: "2026-12-31" }, bidCount: 2, renteeEditUsed: false })],
      site,
    );

    expect(found[0].editable).toBe(true);
    expect(found[0].reason).toBe("costs_the_edit");
  });
});

describe("a site with no dates of its own", () => {
  it("disagrees with anything that has them", () => {
    // Clearing a site's period is a change like any other, and a row still holding dates now differs.
    const found = siteConflicts([req()], { startDate: null, endDate: null });
    expect(found).toHaveLength(1);
  });

  it("agrees with a work order that has none either", () => {
    expect(siteConflicts([wo()], { startDate: null, endDate: null })).toEqual([]);
  });
});

describe("the chart's *own dates* chip", () => {
  /* It asks `periodDiffers`, not "does this row hold a period". A request ALWAYS holds one — the
     backend copies the site's onto it at submit and says so in `getChart` — so the old condition
     put a warning on every request ever filed, and opening it showed a comparison with no rows in
     it. Reported 2026-08-31: *"I created a project from this request directly, so how do they
     differ in location? impossible."* */

  it("stays away when the row's own copy matches the site", () => {
    expect(periodDiffers({ startDate: "2026-08-31", endDate: "2026-10-07" }, { startDate: "2026-08-31", endDate: "2026-10-07" })).toBe(false);
  });

  it("appears when a date really differs", () => {
    expect(periodDiffers({ startDate: "2026-08-31", endDate: "2026-12-31" }, { startDate: "2026-08-31", endDate: "2026-10-07" })).toBe(true);
  });

  it("stays away for a work order that inherits", () => {
    expect(periodDiffers(null, { startDate: "2026-08-31", endDate: "2026-10-07" })).toBe(false);
  });

  it("treats an open-ended site and an open-ended row as agreeing", () => {
    expect(periodDiffers({ startDate: null, endDate: null }, { startDate: null, endDate: null })).toBe(false);
  });
});

describe("a row's own name", () => {
  /* A request has no title column anywhere, so its name lives in the site's blob keyed by request
     id. Owner's ruling, 2026-08-31, over a migration on `equipment_requests` for a nickname only
     ever read on the board it was typed on — with the known cost that the name belongs to the
     FILING and does not follow the request off the site. */

  it("reads names out of the blob", () => {
    const book = mapAwardBook({ requests: {}, workOrderItems: {}, labels: { r1: "Tower crane, north side" } });
    expect(book.labels.r1).toBe("Tower crane, north side");
  });

  it("drops anything that is not a real name, rather than rendering it", () => {
    // A row whose name did not survive is called by its reference — what it was called before.
    const book = mapAwardBook({ labels: { a: "  ", b: 7, c: null, d: "Crane" } });
    expect(Object.keys(book.labels)).toEqual(["d"]);
  });

  it("is empty on a blob that has never held one", () => {
    expect(mapAwardBook({ requests: {}, workOrderItems: {} }).labels).toEqual({});
    expect(mapAwardBook(null).labels).toEqual({});
  });

  it("trims, so a name is never stored with the renter's stray spaces", () => {
    expect(mapAwardBook({ labels: { r1: "  Crane  " } }).labels.r1).toBe("Crane");
  });
});

describe("the span a site actually runs", () => {
  /* Owner, 2026-08-31: *"the end or start date must show first start or last end if its children
     have different values, with a note of the difference — we are not changing project values,
     just viewing the latest ones."* A view, never a correction. */

  const site = (over: Record<string, unknown> = {}) =>
    ({
      defaults: { timing: { rentalBasis: null, extendable: false, startDate: "2026-08-31", endDate: "2026-10-07" } },
      firstStart: null,
      lastEnd: null,
      ...over,
    }) as Parameters<typeof siteSpan>[0];

  it("shows the site's own dates when nothing is filed under it", () => {
    const s = siteSpan(site());
    expect(s.start.shown).toBe("2026-08-31");
    expect(s.end.shown).toBe("2026-10-07");
    // No difference, so nothing to note — a note that always shows says nothing.
    expect(s.start.stated).toBeNull();
    expect(s.end.stated).toBeNull();
  });

  it("reaches past the site's end when something runs longer, and notes what the site says", () => {
    const s = siteSpan(site({ firstStart: "2026-08-31", lastEnd: "2026-12-31" }));
    expect(s.end.shown).toBe("2026-12-31");
    expect(s.end.stated).toBe("2026-10-07");
    // The start agreed, so the start says nothing.
    expect(s.start.stated).toBeNull();
  });

  it("reaches back before the site's start too", () => {
    const s = siteSpan(site({ firstStart: "2026-07-01", lastEnd: "2026-10-07" }));
    expect(s.start.shown).toBe("2026-07-01");
    expect(s.start.stated).toBe("2026-08-31");
  });

  it("keeps the site's own date when the children sit inside it", () => {
    // Something that starts later and finishes earlier does not shrink the site.
    const s = siteSpan(site({ firstStart: "2026-09-15", lastEnd: "2026-09-30" }));
    expect(s.start.shown).toBe("2026-08-31");
    expect(s.end.shown).toBe("2026-10-07");
    expect(s.start.stated).toBeNull();
    expect(s.end.stated).toBeNull();
  });

  it("falls back to the filed span on a site with no dates of its own", () => {
    const s = siteSpan(site({
      defaults: { timing: { rentalBasis: null, extendable: false, startDate: null, endDate: null } },
      firstStart: "2026-09-01",
      lastEnd: "2026-11-30",
    }));
    expect(s.start.shown).toBe("2026-09-01");
    expect(s.end.shown).toBe("2026-11-30");
    /* Nothing to note: the site never stated a date, so there is no difference to report — only an
       absence, and "site says nothing" is not worth a line. */
    expect(s.start.stated).toBeNull();
    expect(s.end.stated).toBeNull();
  });

  it("answers null on a site that states nothing and holds nothing", () => {
    const s = siteSpan(site({ defaults: { timing: { rentalBasis: null, extendable: false, startDate: null, endDate: null } } }));
    expect(s.start.shown).toBeNull();
    expect(s.end.shown).toBeNull();
  });
});

describe("marks that do not wait on an award", () => {
  /* Owner, 2026-08-31: *"Can the mark as mobilized or demobilized be independent of awarding to the
     supplier? I don't want the user to follow a specific sequence."*

     A machine arriving on site is a fact about the machine. Who supplies it is a different fact,
     recorded at a different time and sometimes never. The first version created an award named *Own
     fleet* so there would be somewhere to write — which said a supplier had been chosen when none
     had. A row-level mark says only what happened. */

  it("reads a row's own marks out of the blob", () => {
    const book = mapAwardBook({ marks: { r1: { mobilizedAt: "2026-09-04", demobilizedAt: null } } });
    expect(book.marks.r1).toEqual({ mobilizedAt: "2026-09-04", demobilizedAt: null });
  });

  it("keeps a row that has only left, not arrived", () => {
    // Nothing orders these two. A renter may record the departure of something they never logged in.
    const book = mapAwardBook({ marks: { r1: { demobilizedAt: "2026-12-01" } } });
    expect(book.marks.r1).toEqual({ mobilizedAt: null, demobilizedAt: "2026-12-01" });
  });

  it("drops a row with neither date rather than keeping an empty one", () => {
    // "Never marked" has to read one way only, or a caller has to test for two shapes of nothing.
    expect(mapAwardBook({ marks: { r1: {}, r2: { mobilizedAt: null } } }).marks).toEqual({});
  });

  it("drops a date that is not a date", () => {
    expect(mapAwardBook({ marks: { r1: { mobilizedAt: 20260904 } } }).marks).toEqual({});
  });

  it("is empty on a blob that has never held one", () => {
    expect(mapAwardBook({ requests: {}, workOrderItems: {} }).marks).toEqual({});
    expect(mapAwardBook(null).marks).toEqual({});
  });
});
