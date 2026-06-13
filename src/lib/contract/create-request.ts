/**
 * web-app/005 — build the app-backend create-request payload for `POST /rentees/me/requests`
 * (the SHARED request model the mobile app uses), from a wizard draft + channel/supplier.
 *
 * Reuses web-app/002's `draftToCreateRequest` for the project/equipment/preferences mapping (the
 * item shape — categoryId/subtypeId/capacityId, operator, fuel, logistics — is the same shared
 * contract), then: strips `userId` (the endpoint is "me"-scoped), sets `type` from the channel,
 * adds `supplierId` for a direct request, `fulfillmentType` when ≥2 items, and a required `urgency`
 * derived from the start date (the app schema requires it; see [[web002-urgency-derived]]).
 */
import { draftToCreateRequest } from "@/lib/api/app-adapters";
import type { CreateRequestPayload } from "@/lib/contract/app";
import type { RfqRequestPayload } from "@/lib/contract/draft";

export type RequestChannel = "broadcast" | "direct";

/** App create-request body — same as the shared payload minus `userId` (me-scoped), plus 005 fields. */
export type AppCreateRequest = Omit<CreateRequestPayload, "userId"> & {
  supplierId?: number;
  fulfillmentType?: "SINGLE_SUPPLIER" | "MULTIPLE_SUPPLIERS";
  urgency: "ASAP" | "SOON" | "FAR_FUTURE";
};

/** Derive urgency from the start date (app backend requires the field). */
export function deriveUrgency(startDate?: string | null): "ASAP" | "SOON" | "FAR_FUTURE" {
  if (!startDate) return "ASAP";
  const start = new Date(startDate).getTime();
  if (Number.isNaN(start)) return "SOON";
  const days = (start - Date.now()) / 86_400_000;
  if (days <= 3) return "ASAP";
  if (days <= 30) return "SOON";
  return "FAR_FUTURE";
}

export function buildCreateRequest(
  draft: RfqRequestPayload,
  opts: { channel: RequestChannel; supplierId?: number | null },
): AppCreateRequest {
  // The userId arg is irrelevant here (stripped below) — the endpoint is me-scoped.
  const { userId: _omitUserId, ...base } = draftToCreateRequest(draft, "0");
  const direct = opts.channel === "direct" && opts.supplierId != null;
  const itemCount = base.equipmentItems.length;
  return {
    ...base,
    type: direct ? "DIRECT" : "BROADCAST",
    ...(direct ? { supplierId: opts.supplierId as number } : {}),
    ...(itemCount >= 2 ? { fulfillmentType: direct ? "SINGLE_SUPPLIER" : "MULTIPLE_SUPPLIERS" } : {}),
    urgency: deriveUrgency(draft.project.timing.startDate),
  };
}
