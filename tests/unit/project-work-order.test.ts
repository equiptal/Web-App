import { describe, it, expect } from "vitest";
import { workOrderPayload, blankMachine, type WorkOrderDraft } from "@/components/projects/WorkOrderForm";
import { machineIsNamed, groupWorkOrderItems, EMPTY_WHEN, type WorkOrderItem } from "@/lib/contract/work-order";

/**
 * W-T17 — saving a work order.
 *
 * One rule here loses a renter's data if it slips, and it is not obvious from the form: **machines
 * are upserted by id.** A machine sent without its id is created fresh, and every award, mark and
 * purchase order keyed to the id it used to have is scrubbed — because the renter renamed it. So the
 * payload builder is tested on exactly that, from both directions.
 */

const draft = (over: Partial<WorkOrderDraft> = {}): WorkOrderDraft => ({
  title: "Own fleet — Qiddiya",
  when: { ...EMPTY_WHEN },
  machines: [blankMachine()],
  ...over,
});

describe("the payload", () => {
  it("keeps the id of a machine that already exists", () => {
    const d = draft({
      groupId: "g1",
      machines: [
        { ...blankMachine(), id: "m_welder", rawLabel: "Welding machine", offCatalogue: true },
        { ...blankMachine(), rawLabel: "Generator", offCatalogue: true },
      ],
    });

    const p = workOrderPayload(d);
    const items = p.items as { id?: string; sortOrder: number }[];

    expect(items[0].id).toBe("m_welder");
    // A new machine has no id, and inventing one would create a row the backend cannot match.
    expect(items[1].id).toBeUndefined();
    expect(items.map((i) => i.sortOrder)).toEqual([0, 1]);
  });

  it("carries the group id when editing, and omits it when creating", () => {
    expect(workOrderPayload(draft({ groupId: "g1" })).groupId).toBe("g1");
    expect(workOrderPayload(draft()).groupId).toBeUndefined();
  });

  it("writes one award per supplier line, and none for a blank supplier", () => {
    const d = draft({
      machines: [
        {
          ...blankMachine(),
          rawLabel: "Excavator",
          offCatalogue: true,
          lines: [
            { supplierName: "Zahid Tractor", units: 2, rateAmount: "8600", rentalBasis: "monthly" },
            { supplierName: "Al-Rajhi", units: 1, rateAmount: "", rentalBasis: "monthly" },
            // Own fleet: the renter provides it, so there is no supplier to record.
            { supplierName: "  ", units: 1, rateAmount: "", rentalBasis: "monthly" },
          ],
        },
      ],
    });

    const awards = workOrderPayload(d).awards as { supplierName: string; units: number; rateAmount: number | null }[];
    expect(awards).toHaveLength(2);
    expect(awards[0]).toMatchObject({ supplierName: "Zahid Tractor", units: 2, rateAmount: 8600 });
    // No price recorded is null, not zero — zero is a rate somebody agreed to.
    expect(awards[1].rateAmount).toBeNull();
  });

  it("sends the typed name only for an off-catalogue machine", () => {
    const matched = draft({
      machines: [{ ...blankMachine(), categoryId: "c1", subcategoryId: "s1", measurementId: "z1", rawLabel: "leftover" }],
    });
    const items = workOrderPayload(matched).items as { rawLabel: string | null; ref: { categoryId: string | null } }[];

    // Text left behind from a switch must not ride along beside a complete taxonomy match.
    expect(items[0].rawLabel).toBeNull();
    expect(items[0].ref.categoryId).toBe("c1");
  });

  it("falls back to no title rather than an empty string", () => {
    expect(workOrderPayload(draft({ title: "   " })).title).toBeNull();
  });
});

describe("what counts as named", () => {
  it("accepts a complete taxonomy match", () => {
    expect(machineIsNamed({ ref: { categoryId: "c", subcategoryId: "s", measurementId: "z" }, rawLabel: null })).toBe(true);
  });

  it("accepts a typed name — legal on a work order and nowhere else", () => {
    expect(machineIsNamed({ ref: { categoryId: null, subcategoryId: null, measurementId: null }, rawLabel: "Welding machine" })).toBe(true);
  });

  it("refuses half of each", () => {
    // A partial match is the shape that passes one check and fails the other later.
    expect(machineIsNamed({ ref: { categoryId: "c", subcategoryId: "s", measurementId: null }, rawLabel: "" })).toBe(false);
    expect(machineIsNamed({ ref: { categoryId: null, subcategoryId: null, measurementId: null }, rawLabel: "   " })).toBe(false);
  });
});

/**
 * A work order is a group id its machines share, so the header is read back rather than stored once.
 * Reading it from the LOWEST `sortOrder` is what stops a display flickering between two values if
 * rows ever disagree.
 */
describe("reading a group back", () => {
  const item = (over: Partial<WorkOrderItem>): WorkOrderItem =>
    ({
      id: "m1",
      workOrderGroupId: "g1",
      sortOrder: 0,
      projectId: "p1",
      title: "Own fleet",
      when: { ...EMPTY_WHEN },
      whenConflictAck: false,
      ref: { categoryId: null, subcategoryId: null, measurementId: null },
      rawLabel: "Welder",
      rawSize: null,
      quantity: 1,
      attachmentIds: [],
      customAttachments: [],
      terms: {} as WorkOrderItem["terms"],
      notes: null,
      ...over,
    }) as WorkOrderItem;

  it("takes the header from the lowest sortOrder, whatever order the rows arrive in", () => {
    const groups = groupWorkOrderItems([
      item({ id: "m2", sortOrder: 1, title: "WRONG" }),
      item({ id: "m1", sortOrder: 0, title: "Own fleet — Qiddiya" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("Own fleet — Qiddiya");
    expect(groups[0].items.map((i) => i.id)).toEqual(["m1", "m2"]);
  });

  it("keeps two orders apart", () => {
    const groups = groupWorkOrderItems([
      item({ id: "m1", workOrderGroupId: "g1" }),
      item({ id: "m2", workOrderGroupId: "g2", title: "Site power" }),
    ]);
    expect(groups.map((g) => g.id)).toEqual(["g1", "g2"]);
  });
});
