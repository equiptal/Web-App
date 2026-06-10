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

const FUEL_MAP: Record<string, CreateRequestItem["fuelTypePreference"]> = {
  diesel: "DIESEL",
  petrol: "PETROL",
  electric: "ELECTRIC",
  // 'hybrid' has no app equivalent (AC-26 divergence, plan.md Q6) → omitted.
};

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
 * `todayIso` is passed in (callers stamp it) since the spec's start_date is optional but the backend
 * requires one.
 */
export function draftToCreateRequest(draft: RfqRequestPayload, userId: string, todayIso: string): CreateRequestPayload {
  const { project } = draft;
  const items = postableItems(draft.items);

  return {
    userId,
    type: "BROADCAST", // web is broadcast-only (brief Non-goals)
    rentalType: (project.timing.rentalBasis && RENTAL_MAP[project.timing.rentalBasis]) || "DAILY",
    startDate: project.timing.startDate || todayIso,
    endDate: project.timing.endDate || undefined,
    urgency: "SOON", // not collected on web; sensible default
    projectLat: project.location.lat,
    projectLng: project.location.lng,
    projectAddressLabel: project.location.label ?? undefined,
    additionalNotes: draft.preferences.additionalNotes || undefined,
    equipmentItems: items.map((i) => ({
      categoryId: i.ref.categoryId as string,
      subtypeId: i.ref.subcategoryId as string,
      capacityId: i.ref.measurementId as string,
      numberOfUnits: i.quantity,
      operatorIncluded: i.operatorNeeded === "yes" ? "YES" : "NO",
      fuelTypePreference: FUEL_MAP[i.fuelType],
      mobilizationByRentee: (i.deliveryOverride ?? project.deliveryToSite) === "me",
      demobilizationByRentee: (i.returnOverride ?? project.returnFromSite) === "me",
    })),
  };
}
