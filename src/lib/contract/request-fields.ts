/**
 * Every stored field of a request, turned into labelled rows.
 *
 * A request carries roughly forty parameters. The workspace was showing five of them, and the rest
 * existed only inside the edit form — so the one place a renter goes to ask "what did I actually ask
 * for" could not answer (owner, 2026-08-29).
 *
 * ── Where this came from ────────────────────────────────────────────────────────────────────────
 * `requestDetailRows` is lifted verbatim out of `components/requests/RequestDetail.tsx`, the
 * standalone detail page that the workspace replaced and which is line-commented in place. Lifted
 * rather than rewritten, because it already carried the enum maps, the Arabic for every label and
 * the rule that a null is dropped rather than printed as a dash — all of it decided once, against
 * the backend, by someone reading the payload. Rewriting it would have meant deciding it all again,
 * differently. `itemDetailRows` is the same idea applied to `Ditem` from that file, which said the
 * item's terms in icons; here they are labelled rows, because a modal has the width for words.
 *
 * ── Two levels, and the split is the backend's ──────────────────────────────────────────────────
 * A multi-item submission is a FAN-OUT of single-item requests sharing a `requestGroupId`. The
 * request-level settings are copied across all of them; the item-level ones are per machine. So
 * `requestDetailRows` is asked once for the group and `itemDetailRows` once per machine.
 *
 * **NO React.** These return plain strings so the caller decides how a row is drawn — and so this
 * file stays testable without a renderer.
 */

import type { RequestItem, RequestRecord } from "@/lib/contract/requests";

/** `L(en, ar)` — the caller's own bilingual picker, passed in so this file holds no locale state. */
export type Pick = (en: string, ar: string) => string;

/** A label and its value. Only rows that HAVE a value are ever returned. */
export type Row = [label: string, value: string];

/** Drop the rows with nothing in them. A detail list padded with dashes reads as a broken fetch. */
const kept = (rows: [string, string | number | null | undefined][]): Row[] =>
  rows
    .filter(([, v]) => v != null && v !== "" && v !== "—")
    .map(([k, v]) => [k, String(v)] as Row);

/** An unmapped enum, made readable: `FAR_FUTURE` becomes `Far Future` rather than being hidden. */
const pretty = (v: string) => v.replace(/[_-]+/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export function requestFieldFormatters(ar: boolean, L: Pick) {
  const yn = (b: boolean | null | undefined) => (b == null ? null : b ? L("Yes", "نعم") : L("No", "لا"));
  const enumL = (v: unknown, map: Record<string, [string, string]>) => {
    if (v == null || v === "") return null;
    const s = String(v);
    const x = map[s.toUpperCase()] ?? map[s.toLowerCase()];
    return x ? L(x[0], x[1]) : pretty(s);
  };
  const n = (v: unknown) => Number(v).toLocaleString(ar ? "ar-SA-u-ca-gregory" : "en-US");
  const qty = (v: unknown, unit: [string, string]) => (v == null ? null : `${n(v)} ${L(unit[0], unit[1])}`);
  return { yn, enumL, n, qty };
}

/**
 * Every REQUEST-level parameter that has a value.
 *
 * Duration and the certificate list are deliberately absent: both have a home of their own in the
 * modal — duration beside the dates it is derived from, the certificates as chips — and a field
 * printed twice makes a reader wonder which one is authoritative.
 */
export function requestDetailRows(r: RequestRecord, ar: boolean, L: Pick): Row[] {
  const { yn, enumL, n, qty } = requestFieldFormatters(ar, L);

  const rentalMap = { DAILY: ["Daily", "يومي"], WEEKLY: ["Weekly", "أسبوعي"], MONTHLY: ["Monthly", "شهري"], PER_JOB: ["Per job", "للمهمة"], LONG_TERM: ["Long term", "طويل الأمد"] } as Record<string, [string, string]>;
  const urgencyMap = { ASAP: ["ASAP", "عاجل"], SOON: ["Soon", "قريبًا"], FAR_FUTURE: ["Future", "مستقبلًا"] } as Record<string, [string, string]>;
  const payMap = { UPFRONT: ["Upfront", "مقدمًا"], DAILY: ["Daily", "يومي"], "NET-30": ["Net 30 days", "صافي ٣٠ يومًا"], "NET-60": ["Net 60 days", "صافي ٦٠ يومًا"], "END-OF-JOB": ["End of job", "نهاية المهمة"] } as Record<string, [string, string]>;
  const slaMap = { FOUR_HR: ["4 hours", "٤ ساعات"], EIGHT_HR: ["8 hours", "٨ ساعات"], TWENTY_FOUR_HR: ["24 hours", "٢٤ ساعة"], FORTY_EIGHT_HR: ["48 hours", "٤٨ ساعة"], SEVENTY_TWO_HR: ["72 hours", "٧٢ ساعة"] } as Record<string, [string, string]>;
  const maintMap = { SUPPLIER: ["Supplier", "المؤجّر"], RENTER: ["Renter", "المستأجر"], RENTEE: ["Renter", "المستأجر"], SHARED: ["Shared", "مشتركة"] } as Record<string, [string, string]>;
  const otMap = { "0": ["None", "بدون"], WITHOUT: ["None", "بدون"], "1.5X": ["1.5×", "1.5×"], "2X": ["2×", "2×"] } as Record<string, [string, string]>;
  const offerMap = { "24H": ["24 hours", "٢٤ ساعة"], "48H": ["48 hours", "٤٨ ساعة"], "72H": ["72 hours", "٧٢ ساعة"], "1W": ["1 week", "أسبوع"] } as Record<string, [string, string]>;

  return kept([
    [L("Rental basis", "أساس الإيجار"), enumL(r.rentalType, rentalMap)],
    [L("Urgency", "الإلحاح"), enumL(r.urgency, urgencyMap)],
    [L("Working hours", "ساعات العمل"), qty(r.workingHoursPerDay, ["hrs/day", "ساعة/يوم"])],
    [L("Working days / week", "أيام العمل/أسبوع"), r.workingDaysPerWeek ?? null],
    [L("Estimated job hours", "ساعات المهمة التقديرية"), qty(r.jobEstimatedHours, ["hrs", "ساعة"])],
    [L("Overtime rate", "أجر العمل الإضافي"), enumL(r.overtimeRate, otMap)],
    [L("Terrain", "التضاريس"), enumL(r.terrainType, {})],
    [L("Fulfillment", "نوع التنفيذ"), enumL(r.fulfillmentType, {})],
    [L("Payment terms", "شروط الدفع"), enumL(r.paymentTerms, payMap)],
    [L("Payment method", "طريقة الدفع"), enumL(r.paymentMethod, {})],
    [L("Breakdown response", "زمن الاستجابة للأعطال"), enumL(r.breakdownResponseSla, slaMap)],
    [L("Maintenance", "الصيانة"), enumL(r.maintenanceResponsibility, maintMap)],
    [L("Budget", "الميزانية"), r.budgetCeiling ? `${n(r.budgetCeiling)} ${L("SAR", "ر.س")}` : null],
    [L("Min. supplier rating", "أدنى تقييم للمؤجّر"), r.minimumSupplierRating ? `★ ${Number(r.minimumSupplierRating).toFixed(1)}` : null],
    [L("Delivery lead time", "مهلة التسليم"), enumL(r.deliveryLeadTime, {})],
    [L("Offer duration", "مدة العرض"), enumL(r.offerDuration, offerMap)],
    [L("Verified suppliers only", "مؤجّرون موثّقون فقط"), yn(r.verifiedSuppliersOnly)],
    [L("On-site storage", "تخزين في الموقع"), yn(r.equipmentStorageOnSite)],
    [L("Subletting allowed", "التأجير من الباطن"), yn(r.subletting)],
    [L("Local content", "المحتوى المحلي"), yn(r.localContent)],
    [L("Extendable", "قابل للتمديد"), yn(r.extendable)],
  ]);
}

/**
 * Every ITEM-level parameter that has a value, for one machine.
 *
 * The mobilization, demobilization and F.A.T rows are stated as WHO BEARS THEM rather than as a bare
 * yes/no, because the field name (`mobilizationByRentee`) is the only thing that says which way the
 * boolean points, and the renter is not reading field names.
 */
export function itemDetailRows(it: RequestItem, ar: boolean, L: Pick): Row[] {
  const { yn, enumL, n } = requestFieldFormatters(ar, L);
  const mine = (b: boolean | null | undefined) =>
    b == null ? null : b ? L("Me", "عليّ") : L("Supplier", "على المؤجّر");
  const fuelMap = { DIESEL: ["Diesel", "ديزل"], PETROL: ["Petrol", "بنزين"], ELECTRIC: ["Electric", "كهربائي"], HYBRID: ["Hybrid", "هجين"] } as Record<string, [string, string]>;

  return kept([
    [L("Units", "العدد"), it.numberOfUnits > 0 ? n(it.numberOfUnits) : null],
    [L("Operator", "المشغّل"), it.operatorIncluded == null ? null : it.operatorIncluded === "YES" ? L("Included", "مع مشغّل") : L("Not included", "بدون مشغّل")],
    [L("Operator nationality", "جنسية المشغّل"), it.operatorNationality],
    [L("Fuel", "الوقود"), enumL(it.fuelTypePreference, fuelMap)],
    [L("Diesel included", "الديزل مشمول"), yn(it.dieselIncluded)],
    [L("Delivery to site", "التوصيل للموقع"), mine(it.mobilizationByRentee)],
    [L("Return from site", "الإرجاع من الموقع"), mine(it.demobilizationByRentee)],
    [L("Food & accommodation", "الإعاشة والسكن"), it.fatRequired == null ? null : it.fatRequired ? L("Supplier", "على المؤجّر") : L("Me", "عليّ")],
    [L("Night shift", "وردية ليلية"), yn(it.nightShiftRequired)],
    [L("Max equipment age", "أقصى عمر للمعدة"), it.maxEquipmentAge ? `${n(it.maxEquipmentAge)} ${L("years", "سنة")}` : null],
    [L("Safety certificates", "شهادات السلامة"), it.safetyCertifications?.length ? it.safetyCertifications.join(" · ") : null],
    [L("Notes", "ملاحظات"), it.additionalNotes],
  ]);
}

/** The machine's own name, as the enriched taxonomy can give it. */
export function itemDisplayName(it: RequestItem, ar: boolean): string {
  const parts = ar
    ? [it.subtypeNameAr ?? it.subtypeName, it.capacityNameAr ?? it.capacityName]
    : [it.subtypeName, it.capacityName];
  return parts.filter(Boolean).join(" · ") || (ar ? it.categoryNameAr ?? "" : it.categoryName ?? "") || "—";
}
