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
  measurements: Measurement[];
}

export interface Category {
  id: string;
  name: string;
  nameAr?: string | null;
  subcategories: Subcategory[];
}

export type Taxonomy = Category[];

/** Locale-aware display name for a taxonomy node: Arabic when locale is "ar" and a name_ar exists,
 *  else the canonical English name. Keeps the English value as the source of truth. */
export function taxName(node: { name: string; nameAr?: string | null } | undefined, locale: string): string {
  if (!node) return "";
  return locale === "ar" && node.nameAr ? node.nameAr : node.name;
}

/**
 * Whether a ref's category is the "Lifting Equipment" taxonomy (cranes, forklifts, telehandlers, MEWPs …).
 * Mirrors the app's `_isLiftingCategory` (create_request_bloc.dart): match the canonical category slug/id
 * containing `lifting`, the English category name containing `lifting`, or the Arabic name containing `رفع`.
 * Drives the 2026-07 cert rule (lifting → Aramco equipment cert, else TÜV).
 */
export function isLiftingCategory(
  ref: { categoryId: string | null },
  taxonomy: Taxonomy,
): boolean {
  const catId = (ref.categoryId ?? "").toLowerCase();
  if (catId.includes("lifting")) return true;
  const cat = taxonomy.find((c) => c.id === ref.categoryId);
  if ((cat?.name ?? "").toLowerCase().includes("lifting")) return true;
  return (cat?.nameAr ?? "").includes("رفع");
}

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
