/**
 * VAT-inclusive shared-link pricing — with NO backend flag.
 *
 * Some suppliers quote prices that already include 15% VAT. The public bid form lets them toggle this.
 * To keep every stored submission VAT-EXCLUSIVE (identical to on-platform bids, so the renter side which
 * always adds 15% lands on the same total), we strip the VAT back out of entered prices on submit. The
 * "priced VAT-inclusive" fact itself is carried as a tagged line in the submission's `notes` — the one
 * field that round-trips to the renter's submission view without adding a column/endpoint. The viewer
 * detects the tag (shows a note) and strips the tag line before displaying the notes.
 */
export const VAT_RATE = 0.15;

/** Language-agnostic marker the bid form writes into notes when the supplier priced VAT-inclusive. */
export const VAT_INCLUSIVE_TAG = "[VAT-INCLUSIVE]";
const VAT_INCLUSIVE_LINE = `${VAT_INCLUSIVE_TAG} Prices were quoted VAT-inclusive (15% VAT already included).`;
const VAT_INCLUSIVE_DETECT_RE = /\[VAT-INCLUSIVE\]/i; // non-global: safe for .test()
const VAT_INCLUSIVE_LINE_RE = /^.*\[VAT-INCLUSIVE\].*$/gim; // global: strips the whole marker line

/** Strip 15% VAT out of a gross (VAT-inclusive) amount → net, rounded to 2 dp. */
export function grossToNet(gross: number): number {
  return Math.round((gross / (1 + VAT_RATE)) * 100) / 100;
}

/** Normalize an entered price to the VAT-exclusive value we store (net when priced VAT-inclusive). */
export function priceToStore(entered: number, vatIncluded: boolean): number {
  return vatIncluded ? grossToNet(entered) : entered;
}

/** Build submission notes: the supplier's own notes + the VAT-inclusive marker line when toggled on. */
export function buildSubmissionNotes(userNotes: string, vatIncluded: boolean): string | undefined {
  return [userNotes.trim(), vatIncluded ? VAT_INCLUSIVE_LINE : ""].filter(Boolean).join("\n") || undefined;
}

/** Did the supplier price VAT-inclusive? (marker present in the submission notes) */
export function hasVatInclusiveNote(notes: string | null | undefined): boolean {
  return VAT_INCLUSIVE_DETECT_RE.test(notes ?? "");
}

/** The supplier's notes with the VAT-inclusive marker line removed (for clean display). */
export function stripVatInclusiveNote(notes: string | null | undefined): string | null {
  return (notes ?? "").replace(VAT_INCLUSIVE_LINE_RE, "").trim() || null;
}

export interface VatLines {
  /** Net — the sum of the components, which are always stored VAT-EXCLUSIVE. */
  subtotal: number;
  /** Gross − net. NEVER `subtotal × VAT_RATE`. */
  vat: number;
  /** Gross — the stored figure when there is one, so the rows reconcile with what the supplier sent. */
  total: number;
}

/**
 * The three rows of a submission's price breakdown (RMAP AC-216, §6.13.9).
 *
 * **VAT is derived as `total − subtotal`, never recomputed as `subtotal × 0.15`.** A submission stores an
 * already-rounded gross total; recomputing the tax from the net components produces a breakdown whose
 * rows do not add up to the figure the supplier actually sent — off by a riyal on the exact screen the
 * renter uses to decide. Deriving it makes `subtotal + vat === total` true by construction.
 *
 * `storedGross` is `item.total` (per item) or `submission.grandTotal` (whole submission). It is null only
 * for rows written before those fields existed, where `× (1 + VAT_RATE)` is the honest fallback.
 *
 * Shared deliberately: the submission modal and the read-only bottom bar (§6.13.9) must agree line for
 * line, and they only can if they compute in one place.
 */
export function vatLines(subtotal: number, storedGross?: number | null): VatLines {
  const total = storedGross ?? subtotal * (1 + VAT_RATE);
  return { subtotal, vat: total - subtotal, total };
}
