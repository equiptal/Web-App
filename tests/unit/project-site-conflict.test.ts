import { describe, it, expect } from "vitest";
import { siteConflicts, periodDiffers } from "@/lib/contract/project";

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
