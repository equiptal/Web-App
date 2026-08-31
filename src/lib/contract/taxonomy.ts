/**
 * Equipment taxonomy types: category → subcategory → measurement.
 * Per STANDARDS § Equipment taxonomy. The renter edits items strictly within these values
 * (acceptance.md AC-21/22 — only taxonomy-valid values are accepted, with reset-&-re-pick cascade).
 */

export interface Measurement {
  id: string;
  name: string;
  /** Arabic display name (from the taxonomy DB name_ar); null when not set. */
  nameAr?: string | null;
  /** Unit the taxonomy records this measurement in, e.g. "ton", "m". Used for unit conversion (AC-20). */
  unit?: string;
}

export interface Subcategory {
  id: string;
  name: string;
  nameAr?: string | null;
  /** Canonical taxonomy group inherited from the parent category (see {@link Category.tag}). */
  tag?: string | null;
  measurements: Measurement[];
  /** A photograph of real equipment for this node, when the admin panel has one.
   *  Null/absent on most rows — callers fall back to the icon, then to a glyph. */
  equipmentImageUrl?: string | null;
}

export interface Category {
  id: string;
  name: string;
  nameAr?: string | null;
  /** Canonical taxonomy group (`equipment_taxonomy.tag`), e.g. "Lifting, Cranes & Aerial". Tags live on
   *  CATEGORY rows, so a subcategory inherits its parent's. Display/grouping only — no cert rule reads it. */
  tag?: string | null;
  subcategories: Subcategory[];
  /** A photograph of real equipment for this node, when the admin panel has one.
   *  Null/absent on most rows — callers fall back to the icon, then to a glyph. */
  equipmentImageUrl?: string | null;
}

export type Taxonomy = Category[];

/** Locale-aware display name for a taxonomy node: Arabic when locale is "ar" and a name_ar exists,
 *  else the canonical English name. Keeps the English value as the source of truth. */
export function taxName(node: { name: string; nameAr?: string | null } | undefined, locale: string): string {
  if (!node) return "";
  return locale === "ar" && node.nameAr ? node.nameAr : node.name;
}

/*
 * `isLiftingCategory` used to live here — the tag lookup plus English/Arabic name hints that decided
 * whether a line was lifting equipment, which was the branch of the 2026-07 cert rule that seeded
 * Aramco. The rule is withdrawn (certificates are the renter's pick, never the wizard's), and the app
 * deleted its counterpart outright in the same change — `isLiftingEquipment`, `equipmentCertForLifting`
 * and `kLiftingTagValues` are all gone from `localized_labels.dart` on `main`. Kept dead here it would
 * read as a live classification anyone might wire back up, so it is gone from the web too.
 *
 * The `tag` field on {@link TaxonomyCategory} stays — it is what the taxonomy endpoint returns, not a
 * cert signal.
 */

/** A point in the taxonomy. A complete match has all three; partial selections leave lower levels null. */
export interface TaxonomyRef {
  categoryId: string | null;
  subcategoryId: string | null;
  measurementId: string | null;
}

export const EMPTY_REF: TaxonomyRef = {
  categoryId: null,
  subcategoryId: null,
  measurementId: null,
};

export function isCompleteRef(ref: TaxonomyRef): boolean {
  return Boolean(ref.categoryId && ref.subcategoryId && ref.measurementId);
}

/** Resolve a ref to display names against a taxonomy. Missing levels return undefined. */
export function resolveRef(taxonomy: Taxonomy, ref: TaxonomyRef) {
  const category = taxonomy.find((c) => c.id === ref.categoryId);
  const subcategory = category?.subcategories.find((s) => s.id === ref.subcategoryId);
  const measurement = subcategory?.measurements.find((m) => m.id === ref.measurementId);
  return { category, subcategory, measurement };
}

/** Validate a ref against a taxonomy: every non-null level must exist and nest correctly (AC-21). */
export function isValidRef(taxonomy: Taxonomy, ref: TaxonomyRef): boolean {
  if (!ref.categoryId) return true; // empty is valid (nothing picked yet)
  const { category, subcategory, measurement } = resolveRef(taxonomy, ref);
  if (!category) return false;
  if (ref.subcategoryId && !subcategory) return false;
  if (ref.measurementId && !measurement) return false;
  return true;
}
