/**
 * The request the renter is still writing, in the shape the bid card reads.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────────────────────────
 *
 * The preview on *Ready to send* was blank until the request had been posted, because the card was
 * built from the bid-form endpoint and that endpoint needs a token, and a token needs a request. So
 * the panel showed an empty frame and a line of apology under it — "fills in once the request is
 * posted" — which is exactly backwards: the renter is being asked to approve a message he cannot
 * read, and the only chance to change his mind comes after the request is live.
 *
 * The draft in hand already holds every value that card draws. This maps it into `BidFormData`, so
 * one model (`bidCardModel`) renders the preview before the post and the real thing after it — and
 * they cannot say different things, because there is only one of them.
 *
 * ── What is honestly missing before the post ────────────────────────────────────────────────────
 *
 * The **reference** and the **link**. Both are minted by the backend on create. Everything else —
 * the machines, the city, the dates, the terms — is the renter's own writing and is already here.
 */

import { resolveRef, type Taxonomy } from "@/lib/contract/taxonomy";
import { postableItems } from "@/lib/contract/gates";
import type { EquipmentItem, ProjectDetails } from "@/lib/contract/draft";
import type { BidFormData, BidFormItem } from "@/lib/contract/link-bids";
import type { Party } from "@/lib/contract/options";

/**
 * ⚠️ The draft says `"me"` where the card says `RENTER`.
 *
 * `party()` in `bidCardModel` reads `ME` as the SUPPLIER, because that is what the backend means by
 * it on a bid. On a draft it means the renter himself. Translating here rather than widening that
 * function keeps each vocabulary true in its own place — and stops a card that tells a supplier he
 * is delivering the machine the renter is delivering.
 */
const partyWord = (p: Party | null | undefined): string | null =>
  p === "me" ? "RENTER" : p === "supplier" ? "SUPPLIER" : null;

const taxName = (node: { name: string; nameAr?: string | null } | null | undefined, ar: boolean): string | null =>
  node ? ((ar ? node.nameAr : null) || node.name || null) : null;

const BASIS: Record<string, string> = { daily: "PER_DAY", weekly: "PER_WEEK", monthly: "PER_MONTH" };

function draftItem(it: EquipmentItem, project: ProjectDetails, taxonomy: Taxonomy): BidFormItem {
  const { subcategory, measurement } = resolveRef(taxonomy, it.ref);
  // The taxonomy name is the one the supplier will read on the posted request; `rawLabel` is what the
  // renter happened to type, and is the fallback only while the item has not resolved to a node.
  const label = taxName(subcategory, false) ?? it.agentNames?.subtype ?? it.rawLabel;
  const labelAr = taxName(subcategory, true) ?? it.agentNames?.subtypeAr ?? null;
  const size = taxName(measurement, false) ?? it.rawSize;
  const safety = it.safetyCertsOverride ?? project.certificates.safety;

  return {
    requestItemId: it.id,
    label,
    labelAr,
    size,
    sizeAr: taxName(measurement, true),
    numberOfUnits: it.quantity,
    priceUnit: project.timing.rentalBasis ? BASIS[project.timing.rentalBasis] ?? null : null,
    deliveryBy: partyWord(it.deliveryOverride ?? project.deliveryToSite),
    returnBy: partyWord(it.returnOverride ?? project.returnFromSite),
    notes: it.additionalNotes || null,
    requiredTerms: {
      operator: it.operatorNeeded === "yes" ? "YES" : null,
      nationality: it.operator.nationality,
      nightShift: it.operator.nightShift ? "YES" : null,
      fatFood: partyWord(it.operator.fatFood),
      fatTransport: partyWord(it.operator.fatAccommodationTransport),
      fuel: partyWord(it.fuelResponsibilityOverride ?? project.fuelResponsibility),
      fuelType: it.fuelType,
      year: it.equipmentYear ?? project.advanced.equipmentYear,
      operatorCert: it.operator.certificate.join(", ") || null,
      equipmentCert: safety.join(", ") || null,
    },
  };
}

/**
 * The draft as a bid form, or null when there is nothing yet worth previewing.
 *
 * Null rather than an empty shell: `bidCardModel` falls back to its two-string path when the form
 * carries no items, and that path with no strings draws a card with nothing on it. A caller with
 * null shows the frame and says the request has no machines yet, which is the true answer.
 */
export function draftBidForm(
  project: ProjectDetails | null | undefined,
  items: EquipmentItem[] | null | undefined,
  taxonomy: Taxonomy,
  deadline: string | null = null,
): BidFormData | null {
  if (!project) return null;
  const live = postableItems(items ?? []);
  if (!live.length) return null;

  return {
    token: "",
    status: "open",
    closedReason: null,
    deadline,
    renter: { name: null, contactName: null, city: null, verified: false, logoUrl: null },
    projectTerms: {
      location: project.location.label,
      lat: project.location.lat ?? null,
      lng: project.location.lng ?? null,
      rentalBasis: project.timing.rentalBasis,
      startDate: project.timing.startDate,
      endDate: project.timing.endDate,
      hoursPerDay: project.timing.hoursPerDay,
      workingDaysPerWeek: project.advanced.workingDaysPerWeek,
      // The draft has one flag; the card wants three states. `false` here IS an answer the renter
      // gave (the box is on the screen, unticked), so it is passed through rather than nulled.
      extendable: project.timing.extendable,
    },
    contractTerms: [],
    notes: null,
    items: live.map((it) => draftItem(it, project, taxonomy)),
  };
}
