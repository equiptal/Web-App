/** Onboarding + verification contract (web-app/003), over the shared Moedatech-App identity. */

import type { RenterTier } from "./auth";

/** Verification lifecycle, derived from the backend user's `supplierStatus` int. */
export type VerificationStatus = "none" | "pending" | "verified" | "rejected";

/** Map the backend `supplierStatus` (1=pending, 2=verified/approved, 3=rejected, 0/null=none). */
export function supplierStatusToVerification(s: number | null | undefined): VerificationStatus {
  if (s === 2) return "verified";
  if (s === 1) return "pending";
  if (s === 3) return "rejected";
  return "none";
}

/** The signed-in renter's profile (web reads it; the backend owns the fields/validators). */
export interface RenterProfile {
  id: number;
  phone: string;
  tier: RenterTier;
  firstName: string | null;
  lastName: string | null;
  /** Company name on the renter's profile (display name; verification holds the legal name). */
  companyName: string | null;
  city: string | null;
  jobTitle: string | null;
  email: string | null;
  whatsapp: string | null;
  /** Company identity from the renter's profile — shown on the generated quotation's Rentee party
   *  block (app parity). Null when the backend hasn't supplied them. */
  crNumber?: string | null;
  vatNumber?: string | null;
  nationalAddress?: string | null;
  /**
   * mobile/016 — `true` once this account has completed a first request (a real submit succeeded, or
   * a trial's sample bids rendered). Gates the home "Start Your Request" pop-up, exactly as in the
   * app. Account-level and persistent: it survives the trial's 60-min auto-delete.
   */
  hasUsedFirstRequestSlot?: boolean;
  /**
   * The backend's own «this account finished signing up» column, and it is NOT the tier.
   *
   * 🔴 **`createRequest` gates on THIS, never on the tier** (`backend-agents`, the
   * `GUEST_CANNOT_POST_REQUESTS` branch), while `getUserTier` never reads it — it answers `basic`
   * off `firstName && lastName && city && jobTitle` alone. The two can therefore disagree, and when
   * they do the renter is stuck: basic enough that the web sends his profile save to the EDIT
   * endpoint, which never sets this flag, and not onboarded enough to post a request.
   *
   * Optional because an older backend omitted it. `undefined` is read as «assume complete» — the
   * ordinary case by far, and guessing the other way would send a healthy renter through the
   * first-save endpoint for no reason.
   */
  hasCompletedOnboarding?: boolean;
}

/** A master-data option (city / job title). */
export interface MasterDataOption {
  id?: number | string;
  name?: string;
  nameAr?: string;
}
