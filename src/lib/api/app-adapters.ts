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

/**
 * Map the UI draft → the app's create_request payload (POST /agents/requests). Resolves the field
 * divergences logged in plan.md Q6: rental basis → rentalType, me/supplier → mob/demob booleans
 * (me ⇒ byRentee true), fuel enum, etc. Taxonomy ids on items must be REAL app ids — true when the
 * catalogue was loaded from GET /agents/taxonomy.
 *
 * `userId` is required by the backend; while web auth is bypassed it comes from AGENTS_TEST_USER_ID.
 *
 * Integration rules (ALIGNMENT-web-app-002.md): `startDate` is optional — omit it and the server
 * defaults to "now"; never invent one (rule 3). `urgency` is NEVER sent — the server derives it from
 * `startDate` (mobile CR-017); any value would be ignored (rule 2).
 */
export function draftToCreateRequest(draft: RfqRequestPayload, userId: string): CreateRequestPayload {
  const { project } = draft;
  const items = postableItems(draft.items);
  // Rule 4: project-level fields are stored per-item — compute once, fan out onto each item below.
  const manufactureYear = toManufactureYear(project.advanced.equipmentYear);

  return {
    userId: Number(userId), // agents-backend requires an integer id
    type: "BROADCAST", // web is broadcast-only (brief Non-goals)
    rentalType: (project.timing.rentalBasis && RENTAL_MAP[project.timing.rentalBasis]) || "DAILY",
    startDate: toIsoDateTime(project.timing.startDate), // optional; omitted when unset → server defaults to now
    endDate: toIsoDateTime(project.timing.endDate),
    extendable: project.timing.extendable, // AC-13 (rule 6: needs the deployed `extendable` column)
    projectLat: project.location.lat,
    projectLng: project.location.lng,
    projectAddressLabel: project.location.label ?? undefined,
    additionalNotes: draft.preferences.additionalNotes || undefined,
    equipmentItems: items.map((i) => {
      const fuelParty = i.fuelResponsibilityOverride ?? project.fuelResponsibility; // AC-26 request-wide + per-item override
      const operatorIncluded = i.operatorNeeded === "yes";
      return {
        categoryId: i.ref.categoryId as string,
        subtypeId: i.ref.subcategoryId as string,
        capacityId: i.ref.measurementId as string,
        numberOfUnits: i.quantity,
        operatorIncluded: operatorIncluded ? "YES" : "NO",
        fuelTypePreference: FUEL_MAP[i.fuelType],
        mobilizationByRentee: (i.deliveryOverride ?? project.deliveryToSite) === "me",
        demobilizationByRentee: (i.returnOverride ?? project.returnFromSite) === "me",
        additionalNotes: i.additionalNotes || undefined, // AC-53 (rule 6: needs the deployed item column)
        maxEquipmentAge: manufactureYear, // AC-28 project-level year, fanned out (undefined ⇒ key dropped)
        dieselIncluded: toDieselIncluded(i.fuelType, fuelParty), // AC-26
        fatRequired: operatorIncluded ? i.operator.transfer : false, // AC-24 operator "transfer" sub-field
      };
    }),
  };
}
