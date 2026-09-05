/**
 * Backend enum values, as a person reads them.
 *
 * **NO React, NO DOM, NO i18n imports.** Every function here takes an `L(en, ar)` picker from its
 * caller, the same way `deal-room.ts` does, so the strings stay here and the locale stays out.
 *
 * The backend stores these as codes — `FAR_FUTURE`, `PER_JOB`, `SINGLE_SUPPLIER`, `FOUR_HR` — and the
 * web was printing them verbatim, including onto the quotation, which is the document a renter and a
 * supplier hold each other to. An Arabic quotation read «الأولوية: FAR_FUTURE». The app has mapped
 * all of them since it shipped (`core/utils/localized_labels.dart` + the switches on its quotation
 * page); this is that vocabulary, written once for the web.
 *
 * ONE module rather than a formatter per surface. The quotation, the deal room's request-summary
 * modal and the terms tables all render the same handful of codes; when each formatted its own, they
 * disagreed — the quotation printed `FAR_FUTURE`, the request modal printed "Later", and the app
 * printed "Flexible", three answers to one fact.
 *
 * **Every lookup falls back to the raw value.** A code this file has not met is shown as it arrived,
 * never blanked and never guessed at: an unrecognised urgency is still information, and a renter who
 * sees `NEXT_QUARTER` can ask what it means. A blank tells him nothing and hides that anything was
 * there.
 */

type LFn = (en: string, ar: string) => string;

/** Case-insensitive lookup against a map keyed by the backend's own spelling. */
function lookup(map: Record<string, [string, string]>, raw: string, L: LFn): string {
  const hit = map[raw.trim().toUpperCase()];
  return hit ? L(hit[0], hit[1]) : raw;
}

// ── Urgency (request.urgency) ───────────────────────────────────────────────────────────────────
// Note "Flexible", not "Later": `FAR_FUTURE` describes a start the renter is relaxed about, not one
// he has scheduled far out. The app's own label, kept verbatim so both surfaces say one thing.
const URGENCY: Record<string, [string, string]> = {
  ASAP: ["ASAP", "في أقرب وقت"],
  SOON: ["Soon", "قريباً"],
  FAR_FUTURE: ["Flexible", "مرن"],
};
export const urgencyLabel = (v: string, L: LFn): string => lookup(URGENCY, v, L);

// ── Rental type / minimum rental duration ───────────────────────────────────────────────────────
const RENTAL_TYPE: Record<string, [string, string]> = {
  DAILY: ["Daily", "يومي"],
  WEEKLY: ["Weekly", "أسبوعي"],
  MONTHLY: ["Monthly", "شهري"],
  PER_JOB: ["Per Job", "لكل مشروع"],
  LONG_TERM: ["Long Term", "طويل الأمد"],
};
export const rentalTypeLabel = (v: string, L: LFn): string => lookup(RENTAL_TYPE, v, L);

// ── Fulfillment type ────────────────────────────────────────────────────────────────────────────
// Three spellings each, because the backend has emitted all three over the life of the field and the
// older rooms still carry the older ones.
const FULFILLMENT: Record<string, [string, string]> = {
  SINGLE: ["Single Supplier", "مؤجر واحد"],
  SINGLE_SUPPLIER: ["Single Supplier", "مؤجر واحد"],
  MULTI: ["Multiple Suppliers", "مؤجرون متعددون"],
  MULTIPLE: ["Multiple Suppliers", "مؤجرون متعددون"],
  MULTIPLE_SUPPLIERS: ["Multiple Suppliers", "مؤجرون متعددون"],
};
export const fulfillmentLabel = (v: string, L: LFn): string => lookup(FULFILLMENT, v, L);

// ── Breakdown-response SLA ──────────────────────────────────────────────────────────────────────
// The bare digits are carried alongside the enum names: the same fact reaches the web as `FOUR_HR`
// from the term catalogue and as `4` from the older request payloads.
const SLA: Record<string, [string, string]> = {
  FOUR_HR: ["4 hours", "4 ساعات"], "4": ["4 hours", "4 ساعات"],
  EIGHT_HR: ["8 hours", "8 ساعات"], "8": ["8 hours", "8 ساعات"],
  TWENTY_FOUR_HR: ["24 hours", "24 ساعة"], "24": ["24 hours", "24 ساعة"],
  FORTY_EIGHT_HR: ["48 hours", "48 ساعة"], "48": ["48 hours", "48 ساعة"],
  SEVENTY_TWO_HR: ["72 hours", "72 ساعة"], "72": ["72 hours", "72 ساعة"],
};
export const slaLabel = (v: string, L: LFn): string => lookup(SLA, v, L);

// ── Responsibility (maintenance, fuel, transport …) ─────────────────────────────────────────────
const RESPONSIBILITY: Record<string, [string, string]> = {
  SUPPLIER: ["Supplier", "المؤجر"],
  RENTEE: ["Rentee", "المستأجر"],
  RENTER: ["Rentee", "المستأجر"],
  SHARED: ["Shared", "مشتركة"],
  EITHER: ["Either", "أيّهما"],
};
export const responsibilityLabel = (v: string, L: LFn): string => lookup(RESPONSIBILITY, partyToken(v), L);

/**
 * A responsibility value with the endpoint's display prefix taken off.
 *
 * ⚠️ **`GET /public/bid-form/{token}` changed its VALUES on 2026-09-02**, not just its labels
 * (`getBidForm.ts`, app commit c304828a): `deliveryBy`, `returnBy` and `requiredTerms.fuel` now read
 * `"On Supplier"` / `"On Renter"` where they read `"Supplier"` / `"Renter"` before. Every reader here
 * compared the two old words exactly, so the new spelling matched nothing and fell through to the
 * branch meaning "the other party" — on the public bid form that hid the delivery price input from
 * the supplier who owns the leg, and submitted 0 for it.
 *
 * Both spellings stay valid and both must keep working: the DRAFT preview path builds its own items
 * locally (`draftBidForm.ts:36-37`) and still emits the bare `RENTER` / `SUPPLIER`, and an older
 * backend does too. So this strips the prefix rather than remapping the value, leaving every
 * existing comparison and lookup keyed exactly as it was.
 *
 * Returns "" for null/undefined, so a caller can compare without a null check — the same shape the
 * `(v || "").toLowerCase()` idiom it replaces already had.
 */
/**
 * Arabic-Indic numerals → Latin, in a string that arrives already written.
 *
 * Digits are Latin app-wide, in Arabic too (owner, 2026-09-04: *"the numbers should be in eng even
 * in arabic"*). Our own strings were swept, but some Arabic text is not ours to sweep: the backend
 * seeds `t3_platform_defaults.options` with «صافي ٣٠ يوم» and «٢٤ ساعة», and `getBidForm` sends
 * `valueAr: "٢٤ ساعة"`. Those are rows in a live database, so the seed edits only land on a re-seed
 * and change nothing already stored. The app solved it the same way (`core/utils/latin_digits.dart`)
 * — normalise at the one place the value is RENDERED, not at every draw site.
 *
 * Digits only. Arabic letters, punctuation and «٪» are left exactly as they arrived.
 */
export function latinDigits(v: string | null | undefined): string {
  return String(v ?? "").replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

export function partyToken(v: string | null | undefined): string {
  return String(v ?? "").trim().replace(/^on\s+/i, "");
}

/**
 * City names.
 *
 * The backend stores the master-data service's ENGLISH name, so this is the only place an Arabic
 * document can get an Arabic city. Keyed lowercase, with the spellings the backend has actually
 * emitted — `Riyadh`, `riyadh`, `RIYADH`, and the `al-`/`al ` variants — because normalising them
 * away would also fold apart names that differ only by that prefix.
 *
 * An unknown city prints as stored. That is the right failure: a site the master-data service added
 * last week is still a real place, and printing it in English beats printing nothing.
 */
const CITY: Record<string, [string, string]> = {
  "riyadh": ["Riyadh", "الرياض"],
  "jeddah": ["Jeddah", "جدة"],
  "dammam": ["Dammam", "الدمام"],
  "mecca": ["Mecca", "مكة المكرمة"],
  "makkah": ["Mecca", "مكة المكرمة"],
  "medina": ["Medina", "المدينة المنورة"],
  "madinah": ["Medina", "المدينة المنورة"],
  "khobar": ["Khobar", "الخبر"],
  "al khobar": ["Khobar", "الخبر"],
  "al-khobar": ["Khobar", "الخبر"],
  "tabuk": ["Tabuk", "تبوك"],
  "abha": ["Abha", "أبها"],
  "jizan": ["Jizan", "جازان"],
  "ha'il": ["Ha'il", "حائل"],
  "hail": ["Ha'il", "حائل"],
  "dhahran": ["Dhahran", "الظهران"],
  "taif": ["Taif", "الطائف"],
  "al taif": ["Taif", "الطائف"],
  "al-taif": ["Taif", "الطائف"],
  "yanbu": ["Yanbu", "ينبع"],
  "buraidah": ["Buraidah", "بريدة"],
  "buraydah": ["Buraidah", "بريدة"],
  "najran": ["Najran", "نجران"],
  "hofuf": ["Hofuf", "الهفوف"],
  "al hofuf": ["Hofuf", "الهفوف"],
  "al-hofuf": ["Hofuf", "الهفوف"],
  "qatif": ["Qatif", "القطيف"],
  "jubail": ["Jubail", "الجبيل"],
  "al jubail": ["Jubail", "الجبيل"],
  "al-jubail": ["Jubail", "الجبيل"],
  "arar": ["Arar", "عرعر"],
  "other": ["Other", "أخرى"],
};

/**
 * A location as written on a document.
 *
 * A location is often a city plus a site — "Riyadh — King Fahd Rd site" — so the whole string is
 * tried first and, failing that, only the leading segment before a dash is translated. Anything the
 * renter typed himself passes through untouched: the site name is his, and translating half a phrase
 * he wrote would be worse than leaving it.
 */
export function cityLabel(raw: string, L: LFn): string {
  const whole = CITY[raw.trim().toLowerCase()];
  if (whole) return L(whole[0], whole[1]);
  const m = raw.match(/^([^—–-]+)([—–-].*)$/);
  if (!m) return raw;
  const head = CITY[m[1].trim().toLowerCase()];
  return head ? `${L(head[0], head[1])} ${m[2].trim()}` : raw;
}

/**
 * The one entry point a row should call when it knows a term's KEY but not which vocabulary the
 * value belongs to. Keys are matched case-insensitively, as the deal-room term keys are elsewhere.
 *
 * A key this file does not recognise returns null rather than a guess — the caller then falls back to
 * whatever generic formatting it already had (booleans, arrays, plain strings), which is right for
 * the free-text and numeric terms that make up most of the catalogue.
 */
export function termValueLabel(key: string, value: unknown, L: LFn): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  switch (key.toLowerCase()) {
    case "urgency": return urgencyLabel(value, L);
    case "rental_type": case "min_rental_duration": return rentalTypeLabel(value, L);
    case "fulfillment_type": return fulfillmentLabel(value, L);
    case "breakdown_response_sla": case "response_time": return slaLabel(value, L);
    case "maintenance_responsibility": case "fuel_responsibility":
    case "transport_responsibility": case "operator_responsibility":
      return responsibilityLabel(value, L);
    default: return null;
  }
}
