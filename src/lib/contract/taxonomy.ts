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
}

export interface Category {
  id: string;
  name: string;
  nameAr?: string | null;
  /** Canonical taxonomy group (`equipment_taxonomy.tag`), e.g. "Lifting, Cranes & Aerial". Tags live on
   *  CATEGORY rows and are authoritative for the 2026-07 cert rule — see {@link isLiftingCategory}. */
  tag?: string | null;
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
 * `tag` values that identify the lifting / cranes / aerial group. The taxonomy endpoint returns the
 * column verbatim (the DB display name); the slug form is accepted too so either source resolves.
 * App parity: `kLiftingTagValues` (localized_labels.dart).
 */
export const LIFTING_TAG_VALUES = ["lifting, cranes & aerial", "lifting_cranes_aerial"];

/** English name fragments that mean "lifting" — consulted only when no tag is available (cold/fixture
 *  taxonomy, pre-reorg rows). App parity: `_liftingNameHintsEn`. */
const LIFTING_NAME_HINTS_EN = [
  "lifting",
  "crane",
  "forklift",
  "telehandler",
  "aerial work platform",
  "mewp",
  "scissor lift",
  "man lift",
  "spider lift",
  "boom lift",
];

/** Arabic counterparts of {@link LIFTING_NAME_HINTS_EN}. App parity: `_liftingNameHintsAr`. */
const LIFTING_NAME_HINTS_AR = ["رفع", "رافع", "كرين"];

/**
 * Whether a ref belongs to the "Lifting, Cranes & Aerial" taxonomy group (cranes, forklifts,
 * telehandlers, MEWPs …). Drives the 2026-07 cert rule (lifting → Aramco equipment cert, else TÜV).
 *
 * App parity with `isLiftingEquipment` (localized_labels.dart): the taxonomy `tag` wins outright when
 * present, so a BMU row like "Basket Crane" is never mis-classified by its name. Only when no tag is
 * available (fixture taxonomy, cold cache) do we fall back to the category/subcategory names — plus the
 * category id, which is a slug of the name in the fixture data.
 */
export function isLiftingCategory(
  ref: { categoryId: string | null; subcategoryId?: string | null },
  taxonomy: Taxonomy,
): boolean {
  const cat = taxonomy.find((c) => c.id === ref.categoryId);
  const sub = cat?.subcategories.find((s) => s.id === ref.subcategoryId);
  const tag = (cat?.tag ?? sub?.tag ?? "").trim().toLowerCase();
  if (tag) return LIFTING_TAG_VALUES.includes(tag);

  const en = `${ref.categoryId ?? ""} ${cat?.name ?? ""} ${sub?.name ?? ""}`.toLowerCase();
  if (LIFTING_NAME_HINTS_EN.some((h) => en.includes(h))) return true;
  const ar = `${cat?.nameAr ?? ""} ${sub?.nameAr ?? ""}`;
  return LIFTING_NAME_HINTS_AR.some((h) => ar.includes(h));
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
