/**
 * City centroids, for the one thing the equipment sheet cannot say without them: roughly where the
 * machine is.
 *
 * The backend sends a yard's `latitude`/`longitude` on some projections and only a city name on
 * others, and a sheet that draws no map at all when the coordinates are missing looks broken rather
 * than uninformed. So a named city falls back to its centre — a CITY-level answer, drawn at a
 * city-level zoom, which is the honest resolution of the fact we actually hold. It never pretends to
 * be a yard: `EquipmentLocationMap` labels the pin with the city, not with an address.
 *
 * An unknown city returns null and the map is not drawn. Guessing a country centroid would put a
 * machine in the Empty Quarter, and a renter would believe it.
 */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Keyed by the lowercase city name; Arabic spellings sit beside the English ones on purpose. */
const CENTROIDS: Record<string, LatLng> = {
  riyadh: { lat: 24.7136, lng: 46.6753 },
  الرياض: { lat: 24.7136, lng: 46.6753 },
  jeddah: { lat: 21.4858, lng: 39.1925 },
  جدة: { lat: 21.4858, lng: 39.1925 },
  dammam: { lat: 26.4207, lng: 50.0888 },
  الدمام: { lat: 26.4207, lng: 50.0888 },
  khobar: { lat: 26.2794, lng: 50.2083 },
  "al khobar": { lat: 26.2794, lng: 50.2083 },
  الخبر: { lat: 26.2794, lng: 50.2083 },
  dhahran: { lat: 26.2361, lng: 50.0393 },
  الظهران: { lat: 26.2361, lng: 50.0393 },
  jubail: { lat: 27.0046, lng: 49.6583 },
  الجبيل: { lat: 27.0046, lng: 49.6583 },
  mecca: { lat: 21.3891, lng: 39.8579 },
  makkah: { lat: 21.3891, lng: 39.8579 },
  مكة: { lat: 21.3891, lng: 39.8579 },
  medina: { lat: 24.5247, lng: 39.5692 },
  madinah: { lat: 24.5247, lng: 39.5692 },
  المدينة: { lat: 24.5247, lng: 39.5692 },
  taif: { lat: 21.2703, lng: 40.4158 },
  الطائف: { lat: 21.2703, lng: 40.4158 },
  buraidah: { lat: 26.326, lng: 43.975 },
  بريدة: { lat: 26.326, lng: 43.975 },
  tabuk: { lat: 28.3835, lng: 36.5662 },
  تبوك: { lat: 28.3835, lng: 36.5662 },
  abha: { lat: 18.2465, lng: 42.5117 },
  أبها: { lat: 18.2465, lng: 42.5117 },
  khamis: { lat: 18.3, lng: 42.7333 },
  "khamis mushait": { lat: 18.3, lng: 42.7333 },
  hail: { lat: 27.5219, lng: 41.6907 },
  حائل: { lat: 27.5219, lng: 41.6907 },
  najran: { lat: 17.4917, lng: 44.1322 },
  نجران: { lat: 17.4917, lng: 44.1322 },
  jazan: { lat: 16.8892, lng: 42.5611 },
  جازان: { lat: 16.8892, lng: 42.5611 },
  yanbu: { lat: 24.0895, lng: 38.0618 },
  ينبع: { lat: 24.0895, lng: 38.0618 },
  "hafr al batin": { lat: 28.4342, lng: 45.9636 },
  "حفر الباطن": { lat: 28.4342, lng: 45.9636 },
  qatif: { lat: 26.5196, lng: 49.9962 },
  القطيف: { lat: 26.5196, lng: 49.9962 },
  ahsa: { lat: 25.3833, lng: 49.5833 },
  hofuf: { lat: 25.3833, lng: 49.5833 },
  الأحساء: { lat: 25.3833, lng: 49.5833 },
  neom: { lat: 28.0, lng: 35.3 },
  نيوم: { lat: 28.0, lng: 35.3 },
};

/** The centre of a named city, or null when the name is not one we hold. */
export function cityCentroid(city: string | null | undefined): LatLng | null {
  if (!city) return null;
  const key = city.trim().toLowerCase();
  if (!key) return null;
  if (CENTROIDS[key]) return CENTROIDS[key];
  // "Riyadh, Saudi Arabia" / "Al Khobar - Eastern Province" — take the first segment, then try the
  // whole string against each key as a containment test (the payloads are not consistent about it).
  const head = key.split(/[,\-–—|/]/)[0].trim();
  if (CENTROIDS[head]) return CENTROIDS[head];
  const hit = Object.keys(CENTROIDS).find((k) => head === k || head.includes(k));
  return hit ? CENTROIDS[hit] : null;
}
