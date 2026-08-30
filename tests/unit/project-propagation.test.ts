import { describe, it, expect } from "vitest";
import { propagationForRequest, propagationForWorkOrder } from "@/lib/contract/project";

/**
 * W-T11 — who a project edit is allowed to reach, and what starts ticked.
 *
 * The expensive mistake here is one line: **pre-ticking a request that has bids.** The renter came
 * to change the SITE. If a bid-bearing request is ticked for them, saving spends the one post-bid
 * edit the rules allow, on a row they were not looking at, and they find out later when the edit
 * they actually needed is refused.
 *
 * So the rule is narrow and tested from both sides: eligible is not the same as pre-ticked.
 */

const req = (over: Partial<{ status: string; bidCount: number; renteeEditUsed: boolean }> = {}) =>
  propagationForRequest({ id: "r1", ref: "RFQ-1042", status: "OPEN", bidCount: 0, renteeEditUsed: false, ...over });

describe("what a project edit may reach", () => {
  it("a request with no bids is free, and starts ticked", () => {
    const r = req();
    expect(r.state).toBe("free");
    expect(r.eligible).toBe(true);
    expect(r.preTicked).toBe(true);
  });

  it("a request WITH bids may be ticked — but never for the renter", () => {
    const r = req({ bidCount: 4 });
    expect(r.state).toBe("costs_the_edit");
    expect(r.eligible).toBe(true);
    // The whole protection. Ticking it spends their one post-bid edit, so they do it themselves.
    expect(r.preTicked).toBe(false);
  });

  it("a request whose one edit is spent cannot be ticked at all", () => {
    const r = req({ bidCount: 4, renteeEditUsed: true });
    expect(r.state).toBe("edit_used");
    expect(r.eligible).toBe(false);
    expect(r.preTicked).toBe(false);
  });

  it("a closed or cancelled request is out of reach", () => {
    for (const status of ["CLOSED", "CANCELLED", "EXPIRED"]) {
      const r = req({ status, bidCount: 0 });
      expect(r.state).toBe("closed");
      expect(r.eligible).toBe(false);
    }
  });

  it("counts an ACTIVE request as live, like the drawer's Edit does", () => {
    // The rule has to match `requestActions()`. Two answers to "is this still editable" is how the
    // form starts offering something the backend then refuses.
    expect(req({ status: "ACTIVE", bidCount: 0 }).state).toBe("free");
    expect(req({ status: "ACTIVE", bidCount: 2 }).state).toBe("costs_the_edit");
  });

  it("a work order is always editable and costs nothing", () => {
    const w = propagationForWorkOrder({ id: "g1", ref: "Own fleet — Qiddiya" });
    expect(w.state).toBe("work_order");
    expect(w.eligible).toBe(true);
    // It goes to nobody, so there is no bid to protect and no edit to spend.
    expect(w.preTicked).toBe(true);
  });

  it("never pre-ticks anything it would not also let you tick", () => {
    const rows = [
      req(),
      req({ bidCount: 4 }),
      req({ bidCount: 4, renteeEditUsed: true }),
      req({ status: "CLOSED" }),
      propagationForWorkOrder({ id: "g1", ref: "WO" }),
    ];
    for (const r of rows) if (r.preTicked) expect(r.eligible).toBe(true);
  });
});
