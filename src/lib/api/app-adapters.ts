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
    nameAr: c.name_ar, // carry Arabic display names (was dropped) so the UI can render them by locale
    subcategories: subs
      .filter((s) => s.parent_id === c.id)
      .sort(bySort)
      .map((s) => ({
        id: s.id,
        name: s.name,
        nameAr: s.name_ar,
        measurements: meas
          .filter((m) => m.parent_id === s.id)
          .sort(bySort)
          .map((m) => ({ id: m.id, name: m.name, nameAr: m.name_ar })),
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
 * AC-28: UI equipmentYear ("any" | "2015+".."2022+") → the backend's `maxEquipmentAge`, which
 * despite its name stores a minimum MANUFACTURE YEAR, not an age (it must match mobile-created rows
 * — see ALIGNMENT rule 4 / equipment_step.dart). Returns the integer year, or undefined for
 * "any"/unset/unparseable. Tolerates the trailing "+" the mobile chips carry.
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

/** AC-37: UI maintenance SLA → §4.2 enum (matches the app's breakdown_response_sla values). */
const SLA_MAP: Record<string, CreateRequestPayload["breakdownResponseSla"]> = {
  "4h": "FOUR_HR",
  "8h": "EIGHT_HR",
  "24h": "TWENTY_FOUR_HR",
  "48h": "FORTY_EIGHT_HR",
  "72h": "SEVENTY_TWO_HR",
};

// The maps below align the values the web sends with the exact strings the backend's deal-room term
// matching expects. Without them these terms drift silently (the web's UI-friendly values never match
// the supplier's declared values), so they always read as "not agreed" in the deal room.

/** AC-36: UI payment terms → backend enum (`upfront` already matches). */
const PAYMENT_TERMS_MAP: Record<string, string> = {
  upfront: "upfront",
  daily: "per_day",
  "net-30": "net_30",
  "net-60": "net_60",
  "end-of-job": "end_of_job",
};

/** AC-36: UI payment method → backend enum (`cash` already matches). */
const PAYMENT_METHOD_MAP: Record<string, string> = {
  "bank-transfer": "bank_transfer",
  cash: "cash",
};

/** AC-37: UI maintenance responsibility → backend enum (`supplier` already matches; renter → rentee). */
const MAINTENANCE_RESP_MAP: Record<string, string> = {
  supplier: "supplier",
  renter: "rentee",
};

/** AC-40: UI bid window → backend offer-duration enum (uppercase unit; 1-week → 1W). */
const OFFER_DURATION_MAP: Record<string, string> = {
  "24h": "24H",
  "48h": "48H",
  "72h": "72H",
  "1-week": "1W",
};

/**
 * AC-50: UI cert values → the canonical equipment doc-type enum the SUPPLIER uploads against (and the
 * bid-eligibility matcher compares to). The web's hyphenated values never match the underscored
 * supplier docs, so an unmapped required cert silently excludes EVERY supplier (zero eligible bids).
 * `local-content` is split into its own `localContent` boolean; free-text "other" is routed to notes.
 */
const CERT_TOKEN_MAP: Record<string, string> = {
  tuv: "tuv",
  spsp: "spsp",
  "saso-technical": "saso_technical_inspection",
  "saso-registration": "saso_registration",
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
  // Rule 4 + §4.2: project-level fields are stored per-item — fanned out onto each item below. The
  // equipment year is per-item overridable (AC-28): an item's own year wins over the request-wide one.
  // AC-50: safety certs fanned per-item, mapped to the canonical equipment doc-type enum (see
  // CERT_TOKEN_MAP). Unmapped values are dropped — they could never match a supplier's doc.
  const safetyOtherText = project.certificates.safetyOther.trim();
  const toCertTokens = (certs: string[]): string[] =>
    [...new Set(certs.map((c) => CERT_TOKEN_MAP[c]).filter(Boolean) as string[])];
  // AC-50: "Other" certs → requiredCerts (canonical tokens); the local-content flag is its own boolean.
  const otherCerts = project.certificates.other;
  const localContent = otherCerts.includes("local-content");
  const requiredCerts = toCertTokens(otherCerts.filter((c) => c !== "local-content"));
  // A free-text "other" cert can never match an equipment doc type (it would silently kill bidding),
  // so carry it to suppliers as a note instead of placing it in the gating cert list.
  const otherCertNote =
    project.certificates.safety.includes("other") && safetyOtherText ? `Additional certificate required: ${safetyOtherText}` : "";
  const mergedNotes = [preferences.additionalNotes?.trim(), otherCertNote].filter(Boolean).join("\n") || undefined;

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
    additionalNotes: mergedNotes,
    // §4.2 header fields:
    workingHoursPerDay: project.timing.hoursPerDay, // AC-14/15 (default 8)
    workingDaysPerWeek: project.advanced.workingDaysPerWeek, // AC-15 (default 6)
    overtimeRate: OVERTIME_MAP[project.advanced.overtimeRate], // AC-15
    paymentTerms: preferences.payment.terms ? PAYMENT_TERMS_MAP[preferences.payment.terms] : undefined, // AC-36
    paymentMethod: preferences.payment.method ? PAYMENT_METHOD_MAP[preferences.payment.method] : undefined, // AC-36
    maintenanceResponsibility: MAINTENANCE_RESP_MAP[preferences.maintenance.responsibility], // AC-37 (default supplier)
    breakdownResponseSla: preferences.maintenance.sla ? SLA_MAP[preferences.maintenance.sla] : undefined, // AC-37
    budgetCeiling: preferences.budgetSar && preferences.budgetSar > 0 ? preferences.budgetSar : undefined, // AC-39
    verifiedSuppliersOnly: preferences.supplierFilters.verifiedOnly, // AC-40
    subletting: preferences.supplierFilters.sublettingAllowed, // AC-40
    offerDuration: preferences.supplierFilters.bidWindow ? OFFER_DURATION_MAP[preferences.supplierFilters.bidWindow] : undefined, // AC-40 bid window
    requiredCerts: requiredCerts.length ? requiredCerts : undefined, // AC-50
    localContent: localContent || undefined, // AC-50 (omit when false)
    equipmentItems: items.map((i) => {
      const fuelParty = i.fuelResponsibilityOverride ?? project.fuelResponsibility ?? "me"; // AC-26 override → request-wide → default me
      const operatorIncluded = i.operatorNeeded === "yes";
      return {
        categoryId: i.ref.categoryId as string,
        subtypeId: i.ref.subcategoryId as string,
        capacityId: i.ref.measurementId as string,
        // Per-item attachments: admin-defined ids + free-text customs (trimmed, de-duped, blanks dropped).
        attachmentIds: i.attachmentIds ?? [],
        customAttachments: [...new Set((i.customAttachments ?? []).map((s) => s.trim()).filter(Boolean))],
        numberOfUnits: i.quantity,
        operatorIncluded: operatorIncluded ? "YES" : "NO",
        fuelTypePreference: FUEL_MAP[i.fuelType],
        mobilizationByRentee: (i.deliveryOverride ?? project.deliveryToSite ?? "me") === "me",
        demobilizationByRentee: (i.returnOverride ?? project.returnFromSite ?? "me") === "me",
        additionalNotes: i.additionalNotes || undefined, // AC-53 (rule 6: needs the deployed item column)
        // Part 1: free-text work type, crane subtypes only (≤255). Trimmed; omitted when blank.
        workType: i.workType?.trim() ? i.workType.trim().slice(0, 255) : undefined,
        maxEquipmentAge: toManufactureYear(i.equipmentYear ?? project.advanced.equipmentYear), // AC-28 per-item year, falls back to request-wide (undefined ⇒ key dropped)
        dieselIncluded: toDieselIncluded(i.fuelType, fuelParty), // AC-26
        // Part 2: F.A.T split — each encodes the SIDE (supplier⇒true / me⇒false), omitted without an
        // operator. `fatRequired` is the legacy single flag, kept for back-compat (supplier covers any
        // part) until the agent backend reads the split booleans.
        fatFood: operatorIncluded && i.operator.fatFood ? i.operator.fatFood === "supplier" : undefined,
        fatAccommodationTransport:
          operatorIncluded && i.operator.fatAccommodationTransport ? i.operator.fatAccommodationTransport === "supplier" : undefined,
        fatRequired:
          operatorIncluded && (i.operator.fatFood || i.operator.fatAccommodationTransport)
            ? i.operator.fatFood === "supplier" || i.operator.fatAccommodationTransport === "supplier"
            : undefined,
        // §4.2 per-item operator sub-fields (only meaningful when an operator is included):
        nightShiftRequired: operatorIncluded ? i.operator.nightShift : undefined, // AC-24
        operatorNationality: operatorIncluded ? i.operator.nationality ?? undefined : undefined, // AC-24
        // Part 3: free-text nationalities when the rentee restricts them (≤100).
        operatorNationalityCustom:
          operatorIncluded && i.operator.nationality === "restricted" ? i.operator.nationalityCustom?.trim() || undefined : undefined,
        // Operator certs → the app's NON-gating operatorLicenseLevel (CERTIFIED/TUV/SPSP), comma-joined.
        // Web chips are tuv/spsp (the web has no CERTIFIED chip — fine, the app's set is a superset).
        // saso-technical is an EQUIPMENT cert with no operator-license equivalent → routed to safety below.
        operatorLicenseLevel: operatorIncluded
          ? i.operator.certificate.map((c) => (({ tuv: "TUV", spsp: "SPSP" }) as Record<string, string>)[c]).filter(Boolean).join(",") || undefined
          : undefined,
        // Equipment safety certs (gating) — the project safety list PLUS an operator-picked saso-technical
        // (no operatorLicenseLevel equivalent, so don't drop it), all as canonical doc-type tokens.
        safetyCertifications: (() => {
          const base = [...project.certificates.safety];
          if (operatorIncluded && i.operator.certificate.includes("saso-technical")) base.push("saso-technical");
          const tokens = toCertTokens(base);
          return tokens.length ? tokens : undefined;
        })(),
      };
    }),
  };
}
