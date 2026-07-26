/**
 * Company-shared visibility (docs/plans/company-shared-visibility.md) — web types for the
 * multi-company membership feature, mirroring the app's `company_models.dart`.
 *
 * A company is a firm several user accounts belong to; members share visibility of the firm's
 * requests, the bids on them, its equipment/yards, and its deal rooms, and inherit its verification.
 * A user belongs to at most one company at a time.
 *
 * The payload comes from `GET /agents/companies/me` (byte-identical shape to the app's
 * `GET /companies/me`), proxied through `/api/me/company`.
 */

/** `owner` controls the roster (invite code, approvals, roles). Marketplace powers are identical. */
export type CompanyRole = "owner" | "member";
/** `pending` = joined by code, waiting on an owner. Sees nothing company-scoped until `active`. */
export type CompanyMemberStatus = "pending" | "active";

export interface CompanyMember {
  userId: number;
  name: string;
  phone: string | null;
  avatar: string | null;
  role: CompanyRole | string;
  status: CompanyMemberStatus | string;
  /** `founder` (submitted the verification) | `invite` (joined by code). */
  joinedVia: string | null;
  joinedAt: string | null;
}

export interface CompanyIdentity {
  id: string;
  name: string;
  legalName: string | null;
  isVerified: boolean;
  /** Non-null ONLY for an active owner of a verified company — the backend decides, not the client. */
  inviteCode: string | null;
}

export interface CompanyMembership {
  userId: number;
  role: CompanyRole | string;
  status: CompanyMemberStatus | string;
}

/** The `/api/me/company` payload. `company === null` ⇒ the renter has no company (offer the join form). */
export interface MyCompanyPayload {
  company: CompanyIdentity | null;
  membership: CompanyMembership | null;
  members: CompanyMember[];
}

/** Convenience view the UI renders against — flattens the payload and its derived flags. */
export interface MyCompany {
  id: string;
  name: string;
  legalName: string | null;
  isVerified: boolean;
  inviteCode: string | null;
  myUserId: number | null;
  myRole: CompanyRole | string;
  myStatus: CompanyMemberStatus | string;
  members: CompanyMember[];
  /** Active owner: may share the code, approve joiners, and change roles. */
  isOwner: boolean;
  /** Approved member — a `false` here is the "waiting for approval" screen. */
  isActive: boolean;
  activeMembers: CompanyMember[];
  pendingMembers: CompanyMember[];
  /** How many ACTIVE owners the firm has — gates demote/leave (never leave it ownerless). */
  activeOwnerCount: number;
}

/** Normalize the wire payload into the flattened view. Returns null when there's no company. */
export function toMyCompany(payload: MyCompanyPayload | null | undefined): MyCompany | null {
  const company = payload?.company;
  const membership = payload?.membership;
  if (!company || !membership) return null;
  const members = payload?.members ?? [];
  const activeMembers = members.filter((m) => m.status === "active");
  return {
    id: company.id,
    name: company.name ?? "",
    legalName: company.legalName ?? null,
    isVerified: company.isVerified === true,
    inviteCode: company.inviteCode ?? null,
    myUserId: membership.userId ?? null,
    myRole: membership.role ?? "member",
    myStatus: membership.status ?? "active",
    members,
    isOwner: membership.role === "owner" && membership.status === "active",
    isActive: membership.status === "active",
    activeMembers,
    pendingMembers: members.filter((m) => m.status === "pending"),
    activeOwnerCount: activeMembers.filter((m) => m.role === "owner").length,
  };
}
