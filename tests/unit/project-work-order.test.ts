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
  /* Read the wire shape off the payload, which is now `{ groupId, body }`. */
  const items = (d: WorkOrderDraft, create = true) =>
    workOrderPayload(d, { create }).body.items as Record<string, unknown>[];

  it("keeps the id of a machine that already exists, and adds no id key for a new one", () => {
    const d = draft({
      groupId: "g1",
      machines: [
        { ...blankMachine(), id: "m_welder", rawLabel: "Welding machine", offCatalogue: true },
        { ...blankMachine(), rawLabel: "Generator", offCatalogue: true },
      ],
    });

    const it0 = items(d, false);
    expect(it0[0].id).toBe("m_welder");
    // The KEY is absent, not present-and-null: the item schema is strict, and a null id fails it.
    expect("id" in it0[1]).toBe(false);
  });

  it("carries the group id beside the body, never inside it", () => {
    const edit = workOrderPayload(draft({ groupId: "g1" }), { create: false });
    expect(edit.groupId).toBe("g1");
    // Both work-order schemas are `.strict()`. `groupId` in the body is a 422, not a spare key.
    expect("groupId" in edit.body).toBe(false);
    expect(workOrderPayload(draft(), { create: true }).groupId).toBeUndefined();
  });

  it("hangs supplier lines on their own machine, and writes none for a blank supplier", () => {
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

    /* The backend takes awards as `items[].supplyLines` — there is no top-level `awards` array, and
       sending one failed the strict schema. Nesting them is also what ties an award to its machine
       without a positional index that a reorder would silently invalidate. */
    const lines = items(d)[0].supplyLines as { supplierName: string; units: number; rateAmount: number | null }[];
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ supplierName: "Zahid Tractor", units: 2, rateAmount: 8600 });
    // No price recorded is null, not zero — zero is a rate somebody agreed to.
    expect(lines[1].rateAmount).toBeNull();
  });

  it("leaves supplier lines out of an update, where the schema refuses them", () => {
    const d = draft({
      groupId: "g1",
      machines: [
        {
          ...blankMachine(),
          rawLabel: "Excavator",
          offCatalogue: true,
          lines: [{ supplierName: "Zahid Tractor", units: 2, rateAmount: "8600", rentalBasis: "monthly" }],
        },
      ],
    });
    expect("supplyLines" in items(d, false)[0]).toBe(false);
  });

  it("names the three taxonomy ids flat on the item, not nested under a ref", () => {
    const matched = draft({
      machines: [{ ...blankMachine(), categoryId: "c1", subcategoryId: "s1", measurementId: "z1", rawLabel: "leftover" }],
    });
    const row = items(matched)[0];

    // Text left behind from a switch must not ride along beside a complete taxonomy match.
    expect(row.rawLabel).toBeNull();
    expect(row.categoryId).toBe("c1");
    expect("ref" in row).toBe(false);
  });

  it("omits an unanswered period field instead of sending null", () => {
    /* `when` is `.partial().strict()`: partial means OPTIONAL, not nullable, so a null is a
       validation failure rather than an unanswered question. */
    const when = workOrderPayload(draft(), { create: true }).body.when as Record<string, unknown>;
    // Nothing answered yet, so nothing is sent — an empty object, not five nulls.
    expect(when).toEqual({});
  });

  it("upper-cases the period's basis, which is not the award's lower-case enum", () => {
    const d = draft({ when: { ...EMPTY_WHEN, rentalBasis: "monthly", startDate: "2026-09-01" } });
    const when = workOrderPayload(d, { create: true }).body.when as Record<string, unknown>;
    expect(when.rentalBasis).toBe("MONTHLY");
    expect(when.startDate).toBe("2026-09-01");
  });

  it("falls back to no title rather than an empty string", () => {
    expect(workOrderPayload(draft({ title: "   " }), { create: true }).body.title).toBeNull();
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
