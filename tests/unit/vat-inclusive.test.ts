import { describe, it, expect } from "vitest";
import {
  grossToNet,
  priceToStore,
  buildSubmissionNotes,
  hasVatInclusiveNote,
  stripVatInclusiveNote,
  vatLines,
  VAT_RATE,
} from "@/lib/contract/vat-inclusive";

/**
 * End-to-end for the shared-link VAT-inclusive toggle — no backend flag.
 * Chains the SUPPLIER side (bid form submit transform) → the persisted submission (net prices + tagged
 * notes) → the RENTER side (submission viewer: detect tag, strip it, reconstruct totals). Asserts the
 * renter's grand total lands on exactly what the supplier typed, and the tag never shows in the notes.
 */

// Mirrors the bid form's submit transform (src/app/bid/[token]/page.tsx).
function submitForm(input: {
  userNotes: string;
  vatIncluded: boolean;
  items: { rentalRate: number; deliveryPrice: number; returnPrice: number; qty: number }[];
}) {
  return {
    notes: buildSubmissionNotes(input.userNotes, input.vatIncluded),
    items: input.items.map((it) => ({
      rentalRate: priceToStore(it.rentalRate, input.vatIncluded),
      deliveryPrice: priceToStore(it.deliveryPrice, input.vatIncluded),
      returnPrice: priceToStore(it.returnPrice, input.vatIncluded),
      numberOfUnits: it.qty,
    })),
  };
}

// Mirrors the submission viewer (src/components/requests/SharedBidSubmissionModal.tsx).
function viewSubmission(sub: {
  notes?: string;
  items: { rentalRate: number; deliveryPrice: number; returnPrice: number; numberOfUnits: number }[];
}) {
  const subtotal = sub.items.reduce((s, a) => s + (a.rentalRate + a.deliveryPrice + a.returnPrice) * a.numberOfUnits, 0);
  const vat = subtotal * 0.15;
  return {
    vatInclusive: hasVatInclusiveNote(sub.notes),
    shownNotes: stripVatInclusiveNote(sub.notes),
    grandIncl: Math.round(subtotal + vat),
    subtotalNet: Math.round(subtotal),
  };
}

describe("grossToNet", () => {
  it("strips 15% VAT out of a gross amount", () => {
    expect(grossToNet(115)).toBe(100);
    expect(grossToNet(230)).toBe(200);
  });
  it("rounds to 2 decimal places", () => {
    expect(grossToNet(100)).toBe(86.96);
  });
});

describe("priceToStore", () => {
  it("leaves prices untouched when VAT-exclusive (default)", () => {
    expect(priceToStore(100, false)).toBe(100);
  });
  it("strips VAT when the supplier priced VAT-inclusive", () => {
    expect(priceToStore(115, true)).toBe(100);
  });
});

describe("notes tag detection/strip (stateful-regex safe)", () => {
  it("detects the tag repeatedly (no /g lastIndex drift)", () => {
    const notes = buildSubmissionNotes("", true)!;
    expect(hasVatInclusiveNote(notes)).toBe(true);
    expect(hasVatInclusiveNote(notes)).toBe(true); // second call must not flip
  });
  it("is false when there is no tag", () => {
    expect(hasVatInclusiveNote("just a normal note")).toBe(false);
    expect(hasVatInclusiveNote(undefined)).toBe(false);
  });
  it("removes the tag line but keeps the supplier's own notes", () => {
    const notes = buildSubmissionNotes("Crane ready by Monday", true)!;
    expect(stripVatInclusiveNote(notes)).toBe("Crane ready by Monday");
  });
  it("returns null when the only content was the tag line", () => {
    expect(stripVatInclusiveNote(buildSubmissionNotes("", true))).toBeNull();
  });
});

describe("end-to-end: supplier form → submission → renter viewer", () => {
  it("VAT-inclusive round number: renter total equals what the supplier typed", () => {
    const sub = submitForm({ userNotes: "", vatIncluded: true, items: [{ rentalRate: 115, deliveryPrice: 0, returnPrice: 0, qty: 1 }] });
    expect(sub.items[0].rentalRate).toBe(100); // stored VAT-exclusive
    const view = viewSubmission(sub);
    expect(view.vatInclusive).toBe(true);
    expect(view.shownNotes).toBeNull();
    expect(view.subtotalNet).toBe(100);
    expect(view.grandIncl).toBe(115); // back to the supplier's gross entry
  });

  it("VAT-exclusive (default): 100 net → 115 incl, no note", () => {
    const sub = submitForm({ userNotes: "Deliver Mon", vatIncluded: false, items: [{ rentalRate: 100, deliveryPrice: 0, returnPrice: 0, qty: 1 }] });
    expect(sub.items[0].rentalRate).toBe(100);
    const view = viewSubmission(sub);
    expect(view.vatInclusive).toBe(false);
    expect(view.shownNotes).toBe("Deliver Mon");
    expect(view.grandIncl).toBe(115);
  });

  it("VAT-inclusive multi-unit + delivery, non-round: grand reconstructs the gross entry", () => {
    // Supplier typed gross: (rental 100 + delivery 50) × 2 units = 300 incl. VAT.
    const sub = submitForm({ userNotes: "Crane ready", vatIncluded: true, items: [{ rentalRate: 100, deliveryPrice: 50, returnPrice: 0, qty: 2 }] });
    expect(sub.items[0].rentalRate).toBe(86.96);
    expect(sub.items[0].deliveryPrice).toBe(43.48);
    const view = viewSubmission(sub);
    expect(view.vatInclusive).toBe(true);
    expect(view.shownNotes).toBe("Crane ready");
    expect(view.grandIncl).toBe(300); // matches the supplier's 300 gross entry
  });
});

describe("vatLines — the breakdown must reconcile with the STORED total (RMAP-AC-216)", () => {
  it("derives VAT as total − subtotal, so the rows always sum to the stored figure", () => {
    // The classic rounding trap: 86.96 + 43.48 = 130.44 net, ×1.15 = 150.006 — but the supplier's
    // stored gross is the round 150 he actually typed. Recomputing the tax would print a total the
    // supplier never sent, on the screen the renter uses to decide.
    const lines = vatLines(130.44, 150);
    expect(lines.total).toBe(150);
    expect(lines.subtotal + lines.vat).toBeCloseTo(lines.total, 10);
    expect(lines.vat).not.toBe(130.44 * VAT_RATE);
  });

  it("reconciles for any stored total, however the supplier rounded it", () => {
    for (const [subtotal, gross] of [[100, 115], [130.44, 150], [3333.33, 3833.33], [0, 0]] as const) {
      const lines = vatLines(subtotal, gross);
      expect(lines.subtotal + lines.vat).toBeCloseTo(lines.total, 10);
      expect(lines.total).toBe(gross);
    }
  });

  it("falls back to ×1.15 only when no total was stored — rows written before the field existed", () => {
    for (const stored of [null, undefined]) {
      const lines = vatLines(200, stored);
      expect(lines.subtotal).toBe(200);
      expect(lines.total).toBeCloseTo(230, 10);
      expect(lines.vat).toBeCloseTo(30, 10);
      expect(lines.subtotal + lines.vat).toBeCloseTo(lines.total, 10);
    }
  });

  it("never returns a negative VAT for a gross that equals its net (a zero-rated or free line)", () => {
    expect(vatLines(0, 0)).toEqual({ subtotal: 0, vat: 0, total: 0 });
    expect(vatLines(500, 500).vat).toBe(0);
  });
});
