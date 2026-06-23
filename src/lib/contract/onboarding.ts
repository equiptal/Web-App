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
}

/** A master-data option (city / job title). */
export interface MasterDataOption {
  id?: number | string;
  name?: string;
  nameAr?: string;
}
