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

/**
 * ── The canonical group, in the reader's language (owner, 2026-09-08) ────────────────────────────
 * *"Category Arabic missing, always shows in English."*
 *
 * `GET /equipment/taxonomy` carries `name` and `nameAr` for every node, but `tag` — the canonical
 * grouping the CATEGORY box shows — is English only: there is no `tagAr` on the wire (checked
 * against staging). So an Arabic renter picked «رافعة شوكية» for the type and read «Lifting, Cranes
 * & Aerial» in the box above it.
 *
 * The vocabulary is seven values and it is the backend's own, so it is translated here by value.
 * A tag this map does not know comes back untouched rather than guessed at — a new group added
 * upstream shows in English until it is added here, which is visibly wrong rather than quietly so.
 *
 * ⚠️ **Backend, when someone is in there:** `tagAr` beside `tag` on the taxonomy rows would retire
 * this map. Until then, any tag added to `equipment_taxonomy.tag` has to be added below too.
 */
const TAG_AR: Record<string, string> = {
  "BMU": "وحدات صيانة المباني",
  "Demolition, Crushing & Screening": "الهدم والتكسير والغربلة",
  "Drilling & Foundation": "الحفر والأساسات",
  "Earthmoving & Excavation": "أعمال الحفر ونقل التربة",
  "Lifting, Cranes & Aerial": "الرفع والرافعات والمنصات",
  "Light Construction & Support": "الإنشاءات الخفيفة والمساندة",
  "Road Construction & Paving": "إنشاء الطرق والرصف",
};

/** A taxonomy `tag` in the reader's language. Unknown tags pass through as they arrived. */
export function taxTag(tag: string | null | undefined, locale: string): string {
  if (!tag) return "";
  return locale === "ar" ? TAG_AR[tag] ?? tag : tag;
}

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
