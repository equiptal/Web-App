import type { Taxonomy } from "@/lib/contract";
import { postableItems } from "@/lib/contract";
import type { RfqRequestPayload } from "@/lib/contract";
import type { TaxonomyNode, CreateRequestPayload, CreateRequestItem } from "@/lib/contract/app";

/** Build the UI's nested taxonomy tree from the app's flat node list (GET /agents/taxonomy). */
export function nodesToTree(nodes: TaxonomyNode[]): Taxonomy {
  const bySort = (a: TaxonomyNode, b: TaxonomyNode) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name);
  const cats = nodes.filter((n) => n.level === "CATEGORY").sort(bySort);
  const subs = nodes.filter((n) => n.level === "SUBCATEGORY");
  const meas = nodes.filter((n) => n.level === "MEASUREMENT");
  return cats.map((c) => ({
    id: c.id,
    name: c.name,
    subcategories: subs
      .filter((s) => s.parent_id === c.id)
      .sort(bySort)
      .map((s) => ({
        id: s.id,
        name: s.name,
        measurements: meas
          .filter((m) => m.parent_id === s.id)
          .sort(bySort)
          .map((m) => ({ id: m.id, name: m.name })),
      })),
  }));
}

/** Date-only "YYYY-MM-DD" (or empty) → full ISO datetime with offset, as the backend requires. */
function toIsoDateTime(d: string | null): string | undefined {
  if (!d) return undefined;
  const dt = new Date(d.length <= 10 ? `${d}T00:00:00Z` : d);
  return isNaN(dt.getTime()) ? undefined : dt.toISOString();
}

/**
 * Client-derived urgency from the start date — EXACT mirror of the mobile app's CR-017 rule
 * (`create_request_bloc.dart::_computeUrgency`): floor the whole-day gap, then <2d → ASAP, 2–14d →
 * SOON, 14+d (or no/unparseable date) → FAR_FUTURE. The app backend stores the client value verbatim
 * (`request.service.ts`), so the web must compute it identically rather than rely on server defaulting.
 */
function computeUrgency(startDate: string | null): "ASAP" | "SOON" | "FAR_FUTURE" {
  if (!startDate) return "FAR_FUTURE";
  const start = new Date(startDate.length <= 10 ? `${startDate}T00:00:00Z` : startDate).getTime();
  if (Number.isNaN(start)) return "FAR_FUTURE";
  const daysUntil = Math.floor((start - Date.now()) / 86_400_000);
  if (daysUntil < 2) return "ASAP";
  if (daysUntil <= 14) return "SOON";
  return "FAR_FUTURE";
}

const FUEL_MAP: Record<string, CreateRequestItem["fuelTypePreference"]> = {
  diesel: "DIESEL",
  petrol: "PETROL",
  electric: "ELECTRIC",
  // 'hybrid' has no app equivalent (AC-26 divergence, plan.md Q6) → omitted.
};

/**
 * AC-28: UI equipmentYear ("any" | "2020".."2026" | "custom:<year>") → the backend's
 * `maxEquipmentAge`, which despite its name stores a minimum MANUFACTURE YEAR, not an age (it must
 * match mobile-created rows — see ALIGNMENT rule 4 / equipment_step.dart). Returns the integer year,
 * or undefined for "any"/unset/unparseable. Tolerates a trailing "+" (mobile chips carry it).
 */
function toManufactureYear(equipmentYear: string | null): number | undefined {
  if (!equipmentYear || equipmentYear === "any") return undefined;
  const m = equipmentYear.match(/\d{4}/); // handles "2024", "custom:2024", "2024+"
  return m ? Number(m[0]) : undefined;
}

/** AC-26: supplier ⇒ fuel included. Only meaningful for diesel/petrol; electric/hybrid ⇒ omit (null). */
function toDieselIncluded(fuelType: string, party: "me" | "supplier"): boolean | undefined {
  if (fuelType !== "diesel" && fuelType !== "petrol") return undefined;
  return party === "supplier";
}

const RENTAL_MAP: Record<string, CreateRequestPayload["rentalType"]> = {
  daily: "DAILY",
  weekly: "WEEKLY",
  monthly: "MONTHLY",
};

/** AC-15: UI overtime ("without"|"1.5x"|"2x") → §4.2 enum. */
const OVERTIME_MAP: Record<string, CreateRequestPayload["overtimeRate"]> = {
  without: "0",
  "1.5x": "1.5X",
  "2x": "2X",
};

/** AC-37: UI maintenance SLA → §4.2 enum. "custom" has no enum slot → omitted. */
const SLA_MAP: Record<string, CreateRequestPayload["breakdownResponseSla"]> = {
  "4h": "FOUR_HR",
  "8h": "EIGHT_HR",
  "24h": "TWENTY_FOUR_HR",
};

/**
 * Map the UI draft → the app's create_request payload (POST /agents/requests). Resolves the field
 * divergences logged in plan.md Q6: rental basis → rentalType, me/supplier → mob/demob booleans
 * (me ⇒ byRentee true), fuel enum, etc. Taxonomy ids on items must be REAL app ids — true when the
 * catalogue was loaded from GET /agents/taxonomy.
 *
 * `userId` is required by the backend; while web auth is bypassed it comes from AGENTS_TEST_USER_ID.
 *
 * Integration rules (ALIGNMENT-web-app-002.md): `startDate` is optional — omit it and the server
 * defaults to "now"; never invent one (rule 3). `urgency` is now sent, computed client-side to mirror
 * the mobile app's CR-017 rule (the agents endpoint is aligning to require it like the app endpoint,
 * which stores the client value verbatim) — see `computeUrgency`.
 */
export function draftToCreateRequest(draft: RfqRequestPayload, userId: string): CreateRequestPayload {
  const { project, preferences } = draft;
  const items = postableItems(draft.items);
  // Rule 4 + §4.2: project-level fields are stored per-item — compute once, fan out onto each item.
  const manufactureYear = toManufactureYear(project.advanced.equipmentYear);
  const safetyCerts = project.certificates.safety.length ? project.certificates.safety.slice() : undefined; // AC-50 fanned per-item
  // AC-50: "Other" certs → requiredCerts; the local-content flag is split out into its own boolean.
  const otherCerts = project.certificates.other;
  const localContent = otherCerts.includes("local-content");
  const requiredCerts = otherCerts.filter((c) => c !== "local-content");

  return {
    userId: Number(userId), // agents-backend requires an integer id
    type: "BROADCAST", // web is broadcast-only (brief Non-goals)
    rentalType: (project.timing.rentalBasis && RENTAL_MAP[project.timing.rentalBasis]) || "DAILY",
    startDate: toIsoDateTime(project.timing.startDate), // optional; omitted when unset → server defaults to now
    endDate: toIsoDateTime(project.timing.endDate),
    urgency: computeUrgency(project.timing.startDate), // mobile CR-017 parity (see computeUrgency)
    extendable: project.timing.extendable, // AC-13 (rule 6: needs the deployed `extendable` column)
    projectLat: project.location.lat,
    projectLng: project.location.lng,
    projectAddressLabel: project.location.label ?? undefined,
    additionalNotes: preferences.additionalNotes || undefined,
    // §4.2 header fields:
    workingHoursPerDay: project.timing.hoursPerDay, // AC-14/15 (default 8)
    workingDaysPerWeek: project.advanced.workingDaysPerWeek, // AC-15 (default 6)
    overtimeRate: OVERTIME_MAP[project.advanced.overtimeRate], // AC-15
    siteAccessRestrictions: project.advanced.siteAccessRestrictions.length // AC-27: UI array → single string
      ? project.advanced.siteAccessRestrictions.join(", ")
      : undefined,
    paymentTerms: preferences.payment.terms ?? undefined, // AC-36
    paymentMethod: preferences.payment.method ?? undefined, // AC-36
    maintenanceResponsibility: preferences.maintenance.responsibility, // AC-37 (default supplier)
    breakdownResponseSla: preferences.maintenance.sla ? SLA_MAP[preferences.maintenance.sla] : undefined, // AC-37
    budgetCeiling: preferences.budgetSar && preferences.budgetSar > 0 ? preferences.budgetSar : undefined, // AC-39
    verifiedSuppliersOnly: preferences.supplierFilters.verifiedOnly, // AC-40
    subletting: preferences.supplierFilters.sublettingAllowed, // AC-40
    offerDuration: preferences.supplierFilters.bidWindow ?? undefined, // AC-40 bid window
    requiredCerts: requiredCerts.length ? requiredCerts : undefined, // AC-50
    localContent: localContent || undefined, // AC-50 (omit when false)
    equipmentItems: items.map((i) => {
      const fuelParty = i.fuelResponsibilityOverride ?? project.fuelResponsibility ?? "me"; // AC-26 override → request-wide → default me
      const operatorIncluded = i.operatorNeeded === "yes";
      return {
        categoryId: i.ref.categoryId as string,
        subtypeId: i.ref.subcategoryId as string,
        capacityId: i.ref.measurementId as string,
        numberOfUnits: i.quantity,
        operatorIncluded: operatorIncluded ? "YES" : "NO",
        fuelTypePreference: FUEL_MAP[i.fuelType],
        mobilizationByRentee: (i.deliveryOverride ?? project.deliveryToSite ?? "me") === "me",
        demobilizationByRentee: (i.returnOverride ?? project.returnFromSite ?? "me") === "me",
        additionalNotes: i.additionalNotes || undefined, // AC-53 (rule 6: needs the deployed item column)
        maxEquipmentAge: manufactureYear, // AC-28 project-level year, fanned out (undefined ⇒ key dropped)
        dieselIncluded: toDieselIncluded(i.fuelType, fuelParty), // AC-26
        fatRequired: operatorIncluded ? i.operator.transfer : false, // AC-24 operator "transfer" sub-field
        // §4.2 per-item operator sub-fields (only meaningful when an operator is included):
        nightShiftRequired: operatorIncluded ? i.operator.nightShift : undefined, // AC-24
        operatorNationality: operatorIncluded ? i.operator.nationality ?? undefined : undefined, // AC-24
        safetyCertifications: safetyCerts, // AC-50 project safety certs fanned per-item
      };
    }),
  };
}
