/**
 * A request started from ONE supplier's listing, built from that listing (app parity, Epic 008).
 *
 * ── Why this exists ─────────────────────────────────────────────────────────────────────────────
 *
 * Pressing *Request* on a machine in a store used to land the renter on the intake screen — *"How
 * would you like to create your request?"* — with the machine's NAME typed into the box for him to
 * describe and for the agent to parse. He was being asked to write down, in prose, the machine he
 * had just tapped, and then to wait while we guessed which catalogue row he meant. The guess can
 * miss: "Tuv Certfied Service Jeep" is a real answer the parser has given for a real listing.
 *
 * The app never does that. `public_equipment_detail_sheet.dart` builds an `EquipmentPrefill` from
 * the listing itself — `categoryId` / `subtypeId` / `capacityId`, its fuel, its year, its
 * attachments — and opens the wizard with the equipment already chosen
 * (`WizardPrefill.forDirectRequest`). Nothing is parsed, because nothing needs to be: the renter
 * pointed at the row, so the row IS the answer.
 *
 * This is the same move on the web. The draft it returns goes through `PROCESS_SUCCESS` like any
 * parsed one, so the project's defaults, the template's terms and the canvas gates all behave
 * exactly as they do on the typed path.
 *
 * ── What it does NOT fill ───────────────────────────────────────────────────────────────────────
 *
 * The listing's PRICE, make and model. A request states what the renter needs, not what one
 * supplier happens to stock — a make on the request would narrow the very question he is asking,
 * and the price is the supplier's to offer. The machine's identity comes across as taxonomy; the
 * rest of the form is the renter's.
 */

import { defaultPreferences, defaultProjectDetails, newManualItem } from "@/lib/contract/draft";
import type { AgentDraft, EquipmentItem } from "@/lib/contract/draft";
import type { FuelType } from "@/lib/contract/options";

/** What the store screen knows about the machine the renter tapped. */
export interface DirectPrefill {
  categoryId: string | null;
  subtypeId: string | null;
  capacityId: string | null;
  /** For `rawLabel` only — the words the canvas shows under «YOU WROTE». */
  label?: string | null;
  /** The listing's own fuel, as the backend spells it (`DIESEL` / `PETROL` / `ELECTRIC`). */
  fuel?: string | null;
  /**
   * The listing's manufacture year, seeded as the MINIMUM the request will accept — the app's own
   * comment: *"seed it with this equipment's year so the direct request prefers this vintage or
   * newer"*. A year in the future, or an implausible one, is dropped rather than sent.
   */
  year?: number | null;
  attachmentIds?: string[];
}

/** `DIESEL` → `diesel`. Anything unrecognised leaves the item's own default in place. */
const FUEL_IN: Record<string, FuelType> = { DIESEL: "diesel", PETROL: "petrol", ELECTRIC: "electric" };

/** A plausible manufacture year, as a string, or null. Mirrors `yearOf` on the fast lane. */
function yearOf(raw: number | null | undefined): string | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (raw < 1950 || raw > new Date().getFullYear() + 1) return null;
  return String(Math.trunc(raw));
}

/**
 * True when there is enough of a taxonomy triple to build the item from.
 *
 * All three, or none: the backend refuses a partial triple (one or two ids is a 422, deliberately —
 * two of three resolves to nothing the matcher can use), and a line seeded with half a match would
 * reach the canvas looking answered while being unpostable. A listing missing an id therefore falls
 * back to the typed path, which is today's behaviour and loses nothing.
 */
export function canSeedDirect(p: DirectPrefill | null | undefined): boolean {
  return !!(p && p.categoryId && p.subtypeId && p.capacityId);
}

/**
 * The listing as a one-item draft, ready for `PROCESS_SUCCESS`.
 *
 * `verdict: "confident"` and `resolved: true`, because there is nothing to validate: these ids came
 * off the row the renter chose, not out of a model. The canvas still asks him for the year and the
 * certificate (MREQ-AC-54, its own gates) and for the dates and the site.
 */
export function directRequestDraft(p: DirectPrefill): AgentDraft {
  const base = newManualItem("i1");
  const fuel = p.fuel ? FUEL_IN[p.fuel.trim().toUpperCase()] : undefined;
  const item: EquipmentItem = {
    ...base,
    ref: {
      categoryId: p.categoryId,
      subcategoryId: p.subtypeId,
      measurementId: p.capacityId,
    },
    rawLabel: p.label?.trim() || null,
    verdict: "confident",
    resolved: true,
    ...(fuel ? { fuelType: fuel } : {}),
    equipmentYear: yearOf(p.year),
    attachmentIds: p.attachmentIds ?? [],
  };

  return {
    rfqId: null,
    project: defaultProjectDetails(),
    items: [item],
    preferences: defaultPreferences(),
    detectedLocations: [],
    summary: "",
    justifications: [],
    fieldNotes: {},
  } as unknown as AgentDraft;
}
