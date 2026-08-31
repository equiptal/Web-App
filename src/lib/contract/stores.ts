/**
 * Contract + mappers for the renter web stores surfaces (web-app/004). Maps the shared
 * Moedatech-App backend payloads (`GET /stores`, `GET /stores/{id}`, `GET /equipment/taxonomy`)
 * to a stable, read-only web shape. The data mirrors the mobile app (AC-24); the web defines none
 * of it. Tolerant extraction (envelope already unwrapped by `withAuthedBackend`, but list payloads
 * may arrive as a bare array or `{ data, meta }`).
 */

/** A supplier store as shown on a browse/preview card (AC-16). */
export interface StoreCard {
  id: string;
  /**
   * The SUPPLIER behind the store, when the payload names one — SUP-T03.
   *
   * `id` above is the store. My Suppliers links a renter to the supplier, so a store id is the wrong
   * key: two stores could belong to one firm, and the link would point at a shopfront rather than a
   * company. The mapper reads every spelling the two services have used and keeps null when none is
   * there, which is `requestCodeOf`'s rule in `requests.ts` and for the same reason — a name we do
   * not know is an id discarded, and the picker must be able to SAY it cannot link rather than link
   * the wrong thing.
   */
  supplierId: string | null;
  name: string;
  logoUrl: string | null;
  isVerified: boolean;
  activeEquipmentCount: number;
  city: string | null;
}

/** One equipment listing on a store detail (AC-20). Localized names carried as en + ar. */
export interface EquipmentCard {
  id: string;
  subcategoryId: string | null;
  measurementId: string | null;
  category: string | null;
  categoryAr: string | null;
  subcategory: string | null;
  subcategoryAr: string | null;
  measurement: string | null;
  measurementAr: string | null;
  make: string | null; // manufacturer
  model: string | null; // modelName
  year: number | null;
  fuel: string | null; // fuelType
  price: number | null; // null → price-on-request
  priceUnit: string | null; // e.g. PER_DAY
  isVerified: boolean; // verificationStatus === 'VERIFIED'
  photoUrl: string | null; // first photoKeys entry (pre-signed)
}

/** A store detail surface (AC-18/19/20). */
export interface StoreDetail {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  viewCount: number;
  isVerified: boolean;
  /** The supplier behind the store — see `StoreCard.supplierId`. Null when the payload names none. */
  supplierId: string | null;
  supplierName: string | null;
  city: string | null;
  activeEquipmentCount: number;
  equipment: EquipmentCard[];
}

/** Full equipment detail (the app's public equipment sheet — GET /equipment/{id}). */
export interface EquipmentDetail {
  id: string;
  category: string | null;
  categoryAr: string | null;
  subcategory: string | null;
  subcategoryAr: string | null;
  measurement: string | null;
  measurementAr: string | null;
  manufacturer: string | null;
  modelName: string | null;
  year: number | null;
  fuel: string | null;
  operatingHours: number | null;
  price: number | null;
  priceUnit: string | null;
  isVerified: boolean;
  photos: string[]; // signed photo URLs for the carousel
  docTypes: string[]; // document types present (e.g. tuv/spsp/saso) — status only, no contents
  yardName: string | null;
  yardCity: string | null;
  storeName: string | null;
}

/** A node in the equipment taxonomy tree used by the browse filters (AC-11/24). */
export interface TaxonomyNode {
  id: string;
  name: string;
  nameAr: string;
  iconUrl: string | null;
  children: TaxonomyNode[];
}

type Raw = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean => v === true;

// Shared public asset bucket (constant across envs — same as the mobile app's S3Url). Equipment
// photos and taxonomy icons are stored as raw S3 keys (e.g. `default/equipment/photos/x.jpg`); the
// backend returns logos/banners pre-signed (full http URLs). `mediaUrl` passes http URLs through and
// builds the public URL for bare keys. Pure string construction — no AWS SDK / credentials.
const MEDIA_BASE = "https://moedatech-eu-storage.s3.eu-central-1.amazonaws.com";
export function mediaUrl(keyOrUrl: unknown): string | null {
  const v = str(keyOrUrl);
  if (!v) return null;
  if (v.startsWith("http")) return v;
  return `${MEDIA_BASE}/${v.replace(/^\/+/, "")}`;
}

/**
 * First usable photo URL from a `photoKeys` array. The backend stores entries as structured
 * objects (`{ key, slot }`) and signs the `.key` into a full URL, but legacy/plain entries may be
 * bare strings — handle both, then run through `mediaUrl` (passes signed http URLs through).
 */
function firstPhotoUrl(v: unknown): string | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  for (const e of v) {
    const key = typeof e === "string" ? e : e && typeof e === "object" && "key" in e ? str((e as Raw).key) : null;
    const url = mediaUrl(key);
    if (url) return url;
  }
  return null;
}

/** Pull the store array out of a browse payload (bare array or `{ data | stores | items: [...] }`). */
export function extractStoreList(raw: unknown): Raw[] {
  if (Array.isArray(raw)) return raw as Raw[];
  if (raw && typeof raw === "object") {
    const o = raw as Raw;
    const arr = (Object.values(o).find((v) => Array.isArray(v)) as unknown[]) ?? [];
    return arr as Raw[];
  }
  return [];
}

/**
 * The supplier's id off a store payload, whatever it is called there.
 *
 * The authed and public store projections have not agreed on a name, and the field may not be sent
 * at all — so this tries each spelling and answers null rather than inventing one. Null is a real
 * answer: it means this store cannot be linked to a supplier yet, and the caller says so.
 */
export function supplierIdOf(raw: Raw): string | null {
  // An id arrives as a number as often as a string — `id` above is already `String(...)`d for that
  // reason, and a string-only read here would silently drop half the payloads it is meant to catch.
  const id = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : null;
  const nested = raw.supplier && typeof raw.supplier === "object" ? (raw.supplier as Raw) : null;
  return (
    id(raw.supplierId) ??
    id(raw.supplierUserId) ??
    id(raw.ownerId) ??
    id(raw.ownerUserId) ??
    id(raw.companyId) ??
    (nested ? id(nested.id) ?? id(nested.userId) : null)
  );
}

export function mapStoreCard(raw: Raw): StoreCard {
  return {
    id: String(raw.id ?? ""),
    supplierId: supplierIdOf(raw),
    // Authed `/stores` sends `name`; the public projection sends the supplier's `companyName`.
    name: str(raw.name) ?? str(raw.companyName) ?? "",
    logoUrl: mediaUrl(raw.logoUrl ?? raw.logoKey),
    isVerified: bool(raw.isVerified),
    activeEquipmentCount: num(raw.activeEquipmentCount) ?? 0,
    city: str(raw.city),
  };
}

export function mapEquipment(raw: Raw): EquipmentCard {
  return {
    id: String(raw.id ?? ""),
    subcategoryId: str(raw.subcategoryId),
    measurementId: str(raw.measurementId),
    category: str(raw.categoryName),
    categoryAr: str(raw.categoryNameAr),
    subcategory: str(raw.subcategoryName),
    subcategoryAr: str(raw.subcategoryNameAr),
    measurement: str(raw.measurementName),
    measurementAr: str(raw.measurementNameAr),
    make: str(raw.manufacturer),
    model: str(raw.modelName),
    year: num(raw.year),
    fuel: str(raw.fuelType),
    price: num(raw.price),
    priceUnit: str(raw.priceUnit),
    isVerified: raw.verificationStatus === "VERIFIED",
    photoUrl: firstPhotoUrl(raw.photoKeys),
  };
}

/** All signed photo URLs from a `photoKeys`/`documentKeys` array (entries are `{key}` objects or strings). */
function allKeyUrls(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((e) => (typeof e === "string" ? e : e && typeof e === "object" && "key" in e ? str((e as Raw).key) : null))
    .map((k) => mediaUrl(k))
    .filter((u): u is string => !!u);
}

/** The `type`/`slot` labels present in a structured key array (e.g. document types). */
function keyField(v: unknown, field: "type" | "slot"): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((e) => (e && typeof e === "object" && field in e ? str((e as Raw)[field]) : null))
    .filter((x): x is string => !!x && x !== "OTHER");
}

export function mapEquipmentDetail(raw: Raw): EquipmentDetail {
  const store = raw.store && typeof raw.store === "object" ? (raw.store as Raw) : {};
  // The authed `/equipment/{id}` sends yard as flat `yardName`/`yardCity`; the public store-equipment
  // projection (guest path) nests it as `yard{name,city}` — accept both.
  const yard = raw.yard && typeof raw.yard === "object" ? (raw.yard as Raw) : {};
  return {
    id: String(raw.id ?? ""),
    category: str(raw.categoryName),
    categoryAr: str(raw.categoryNameAr),
    subcategory: str(raw.subcategoryName),
    subcategoryAr: str(raw.subcategoryNameAr),
    measurement: str(raw.measurementName),
    measurementAr: str(raw.measurementNameAr),
    manufacturer: str(raw.manufacturer),
    modelName: str(raw.modelName),
    year: num(raw.year),
    fuel: str(raw.fuelType),
    operatingHours: num(raw.operatingHours),
    price: num(raw.price),
    priceUnit: str(raw.priceUnit),
    isVerified: raw.verificationStatus === "VERIFIED",
    photos: allKeyUrls(raw.photoKeys),
    docTypes: keyField(raw.documentKeys, "type"),
    yardName: str(raw.yardName) ?? str(yard.name),
    yardCity: str(raw.yardCity) ?? str(yard.city),
    storeName: str(store.name) ?? str(store.companyName) ?? str(raw.storeName),
  };
}

export function mapStoreDetail(raw: Raw): StoreDetail {
  const store = (raw.store && typeof raw.store === "object" ? (raw.store as Raw) : raw) as Raw;
  const yards = Array.isArray(raw.yards) ? (raw.yards as Raw[]) : [];
  const equipmentRaw = Array.isArray(raw.equipment) ? (raw.equipment as Raw[]) : [];
  const meta = (raw.equipmentMeta && typeof raw.equipmentMeta === "object" ? (raw.equipmentMeta as Raw) : {}) as Raw;
  // Public projection carries city on each equipment's nested `yard` rather than on the store/yards.
  const eqYard = equipmentRaw.length && equipmentRaw[0].yard && typeof equipmentRaw[0].yard === "object" ? (equipmentRaw[0].yard as Raw) : null;
  const city = str(store.city) ?? (yards.length ? str(yards[0].city) : null) ?? (eqYard ? str(eqYard.city) : null);
  return {
    id: String(store.id ?? ""),
    name: str(store.name) ?? str(store.companyName) ?? "",
    description: str(store.description),
    logoUrl: mediaUrl(store.logoUrl ?? store.logoKey),
    bannerUrl: mediaUrl(store.bannerUrl ?? store.bannerKey),
    viewCount: num(store.viewCount) ?? 0,
    isVerified: bool(store.isVerified),
    supplierId: supplierIdOf(store),
    supplierName: str(store.supplierName) ?? str(store.companyName),
    city,
    activeEquipmentCount: num(meta.total) ?? equipmentRaw.length,
    equipment: equipmentRaw.map(mapEquipment),
  };
}

/** Map the backend taxonomy tree, keeping only id/name/nameAr/children (filters need no more). */
export function mapTaxonomy(raw: unknown): TaxonomyNode[] {
  const arr = Array.isArray(raw) ? raw : extractStoreList(raw);
  const walk = (n: Raw): TaxonomyNode => ({
    id: String(n.id ?? ""),
    name: str(n.name) ?? "",
    nameAr: str(n.nameAr) ?? str(n.name) ?? "",
    iconUrl: mediaUrl(n.imageUrl ?? n.imageKey),
    children: Array.isArray(n.children) ? (n.children as Raw[]).map(walk) : [],
  });
  return (arr as Raw[]).map(walk);
}
