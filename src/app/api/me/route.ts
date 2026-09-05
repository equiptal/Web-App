import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { clearAuthCookies } from "@/lib/api/auth-server";
import { normalizeTier } from "@/lib/contract/auth";
import { setUserCookie } from "@/lib/api/auth-server";
import { supplierStatusToVerification, type RenterProfile } from "@/lib/contract/onboarding";

interface BackendMe {
  id: number;
  phone: string;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  city?: string | null;
  jobTitle?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  tier?: string;
  /** mobile/016 — first-request slot flag; gates the home "Start Your Request" pop-up. */
  hasUsedFirstRequestSlot?: boolean;
  crNumber?: string | null;
  commercialRegistrationNumber?: string | null;
  vatNumber?: string | null;
  taxNumber?: string | null;
  nationalAddress?: string | null;
  // Saudi National Address parts (the backend returns these, not a composed string).
  buildingNumber?: string | null;
  shortAddress?: string | null;
  district?: string | null;
  companyCity?: string | null;
  postalCode?: string | null;
  supplierProfile?: {
    companyName?: string | null; crNumber?: string | null; commercialRegistrationNumber?: string | null;
    vatNumber?: string | null; taxNumber?: string | null; nationalAddress?: string | null;
    buildingNumber?: string | null; shortAddress?: string | null; district?: string | null;
    companyCity?: string | null; postalCode?: string | null;
  } | null;
}
/**
 * `GET /users/me/profile-status` — and it is the IDENTITY payload, not just a status.
 *
 * ⚠️ **This is where the app reads a renter's CR, VAT, company and address from.** `ProfileStatus`
 * in `profile_models.dart` is built from this response and parses `crNumber`, `vatNumber`,
 * `companyName`, `companyLegalName` and the five Saudi-address parts; `live_quotation_document.dart`
 * then hands those straight to the quotation's Rentee block. The web was reading the same four
 * fields off `GET /users/me`, which does not carry them — so where the app printed a number the web
 * printed a "Verified" pill, and where the app composed "Jeddah" into the national address the web
 * composed nothing. Verified against staging on 2026-09-04: `/users/me` answers `companyCity: null`
 * while `/users/me/profile-status` answers `'Jeddah'` for the same account.
 *
 * The app is the source of truth for what a renter's identity IS, so this payload wins.
 */
interface BackendStatus {
  supplierStatus?: number | null;
  /** Also carried on profile-status; used as the fallback if `/users/me` omits it. */
  hasUsedFirstRequestSlot?: boolean;
  companyName?: string | null;
  /** The registered entity name. The app carries it; nothing on the web reads it yet. */
  companyLegalName?: string | null;
  crNumber?: string | null;
  vatNumber?: string | null;
  nationalAddress?: string | null;
  buildingNumber?: string | null;
  shortAddress?: string | null;
  district?: string | null;
  companyCity?: string | null;
  postalCode?: string | null;
}

/**
 * GET /api/me — the signed-in renter's profile + tier + verification status (web-app/003).
 * Reads the shared backend (`GET /users/me` + `GET /users/me/profile-status`) as the renter, so
 * tier/status reflect changes made on either surface (AC-07/24/25/26). Drives gating + revisit states.
 */
export async function GET(req: Request) {
  return withAuthedBackend(req, async (call) => {
    try {
      const me = await call<BackendMe>("/users/me");
      const status = await call<BackendStatus>("/users/me/profile-status");
      const user: RenterProfile = {
        id: me.id,
        phone: me.phone,
        tier: normalizeTier(me.tier),
        firstName: me.firstName ?? null,
        lastName: me.lastName ?? null,
        // Profile-status first, because that is the payload the app builds a renter's identity from.
        companyName: status.companyName ?? me.companyName ?? me.supplierProfile?.companyName ?? null,
        city: me.city ?? null,
        jobTitle: me.jobTitle ?? null,
        email: me.email ?? null,
        whatsapp: me.whatsapp ?? null,
        // mobile/016 — the backend exposes this on BOTH /users/me and /users/me/profile-status; read
        // either so the home pop-up gate works regardless of which one carries it.
        hasUsedFirstRequestSlot: me.hasUsedFirstRequestSlot ?? status.hasUsedFirstRequestSlot ?? false,
        // Company identity for the quotation Rentee block — read from either the user or its profile,
        // tolerant of the backend's field naming. Null when absent (quotation falls back to the pill).
        crNumber: status.crNumber ?? me.crNumber ?? me.commercialRegistrationNumber ?? me.supplierProfile?.crNumber ?? me.supplierProfile?.commercialRegistrationNumber ?? null,
        vatNumber: status.vatNumber ?? me.vatNumber ?? me.taxNumber ?? me.supplierProfile?.vatNumber ?? me.supplierProfile?.taxNumber ?? null,
        // Backend returns the National Address as structured parts, not a string — compose it
        // (building no. · short address · district · city · postal code) so the quotation shows the real
        // address instead of always falling back to the "Verified" pill (mobile composes it the same way).
        nationalAddress:
          status.nationalAddress ??
          me.nationalAddress ??
          me.supplierProfile?.nationalAddress ??
          ([
            status.buildingNumber ?? me.buildingNumber ?? me.supplierProfile?.buildingNumber,
            status.shortAddress ?? me.shortAddress ?? me.supplierProfile?.shortAddress,
            status.district ?? me.district ?? me.supplierProfile?.district,
            status.companyCity ?? me.companyCity ?? me.supplierProfile?.companyCity,
            status.postalCode ?? me.postalCode ?? me.supplierProfile?.postalCode,
          ]
            .map((v) => (typeof v === "string" ? v.trim() : ""))
            .filter(Boolean)
            .join(", ") || null),
      };
      const res = NextResponse.json({
        user,
        verification: { status: supplierStatusToVerification(status.supplierStatus) },
      });
      // Heal a stale session tier. `useSession().tier` — which gates the sidebar card, the
      // quotation download and the request-limit checks — comes from the `mt_user` cookie, and
      // `/api/auth/session` reads that cookie without ever re-reading the backend. So a tier change
      // made ELSEWHERE never reached this browser: most importantly, a member approved into a
      // verified company inherits Verified server-side but kept seeing "Basic" here until they
      // signed in again. This route already holds a fresh `/users/me`, so re-stamping costs nothing.
      // Guarded, NOT unconditional: `normalizeTier` falls back to "guest" for anything it doesn't
      // recognise, and this runs on every authed page load — so a response that omitted `tier` would
      // silently demote the user to guest and the bad cookie would stick. Only re-stamp when the
      // backend actually sent a tier; otherwise leave the existing cookie untouched.
      if (typeof me.tier === "string" && me.tier) {
        setUserCookie(res, { id: me.id, phone: me.phone, tier: normalizeTier(me.tier) });
      }
      return res;
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}

/**
 * DELETE /api/me — delete (soft-delete) the signed-in renter's account (app parity, `DELETE /users/me`).
 * On success the account is gone, so we clear the auth cookies; the client drops to anon and returns
 * home. Guarded behind an explicit typed-confirm modal on the client.
 */
export async function DELETE(req: Request) {
  return withAuthedBackend(req, async (call) => {
    try {
      await call<void>("/users/me", { method: "DELETE" });
      const res = NextResponse.json({ ok: true });
      clearAuthCookies(res);
      return res;
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
