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
  supplierName: string | null;
  city: string | null;
  activeEquipmentCount: number;
  equipment: EquipmentCard[];
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

export function mapStoreCard(raw: Raw): StoreCard {
  return {
    id: String(raw.id ?? ""),
    name: str(raw.name) ?? "",
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
    photoUrl: Array.isArray(raw.photoKeys) && raw.photoKeys.length ? mediaUrl(raw.photoKeys[0]) : null,
  };
}

export function mapStoreDetail(raw: Raw): StoreDetail {
  const store = (raw.store && typeof raw.store === "object" ? (raw.store as Raw) : raw) as Raw;
  const yards = Array.isArray(raw.yards) ? (raw.yards as Raw[]) : [];
  const equipmentRaw = Array.isArray(raw.equipment) ? (raw.equipment as Raw[]) : [];
  const meta = (raw.equipmentMeta && typeof raw.equipmentMeta === "object" ? (raw.equipmentMeta as Raw) : {}) as Raw;
  const city = str(store.city) ?? (yards.length ? str(yards[0].city) : null);
  return {
    id: String(store.id ?? ""),
    name: str(store.name) ?? "",
    description: str(store.description),
    logoUrl: mediaUrl(store.logoUrl ?? store.logoKey),
    bannerUrl: mediaUrl(store.bannerUrl ?? store.bannerKey),
    viewCount: num(store.viewCount) ?? 0,
    isVerified: bool(store.isVerified),
    supplierName: str(store.supplierName),
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
