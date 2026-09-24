/**
 * Intercom identity for the web, built to the app's own rules.
 *
 * The mobile app has carried Intercom since mobile/001 (`intercom_service.dart`) and the backend
 * listens for `conversation.admin.replied` on the other side of it. That webhook resolves a recipient
 * by mapping Intercom's `user.user_id` back to a `User` row — so **the id sent from here must be the
 * same database id the app sends**, or a support agent's reply reaches nobody. That single fact is
 * why this file mirrors `buildIntercomUserPayload` rather than inventing a web-shaped payload.
 *
 * What the web can and cannot match:
 *
 * | App sends | Web sends |
 * |---|---|
 * | `user_id` — the DB user id | the same, from the session |
 * | name, email, phone | phone; name and email only as the app's own fallbacks (see below) |
 * | `user_type` — from `active_role` | always `rentee`: this whole surface is the renter's |
 * | `app_version` / `app_build` / `device_os` | `device_os: "web"` and the app version |
 * | (no `platform` yet) | `platform: "web-rentee"`, the `X-Client-Platform` value |
 * | (not yet) | `side`, `is_guest`, company id/role/record, request counts (context ticket, 2026-09-24) |
 * | `locale`, `tier`, `account_created_at` | locale and tier; no created-at on the session |
 *
 * The web's `RenterUser` is `{ id, phone, tier }` — no name, no email, no created-at — so `name` and
 * `email` take optional arguments. A caller that has richer profile data can pass it and the payload
 * improves without this file changing; today nothing does, and the fallbacks below are exactly the
 * ones a nameless mobile user already gets, so the two clients agree rather than disagreeing quietly.
 *
 * **NO React, NO DOM.** The component next door does the loading and the booting.
 */

import type { RenterTier } from "@/lib/contract/auth";

/**
 * The workspace's Intercom app id.
 *
 * Not a secret — it ships inside the messenger snippet on every page that loads it, which is why the
 * app hardcodes the same value. Overridable per environment all the same, so a staging workspace can
 * be pointed somewhere else without a code change.
 */
export const INTERCOM_APP_ID = process.env.NEXT_PUBLIC_INTERCOM_APP_ID || "w17eryax";

/** Intercom's own endpoint for the messenger — the value its published snippet carries. */
export const INTERCOM_API_BASE = "https://api-iam.intercom.io";

export interface IntercomIdentity {
  id: number;
  phone: string;
  tier: RenterTier;
}

/**
 * What `GET /api/support/intercom` answers — the parts of an identity only the server can supply.
 *
 * `userHash` is Intercom's identity verification: an HMAC of the user id under the workspace secret,
 * which exists because a messenger booted with a bare `user_id` will accept any id the page hands it.
 * Null while no secret is configured, which is the state mobile runs in — it calls
 * `loginIdentifiedUser` with no hash — and the messenger then boots unsigned, exactly as before.
 *
 * The name and email are here because the web SESSION has neither; they live on `GET /users/me`,
 * which needs the renter's own token. Without them support was talking to «User 42».
 */
export interface IntercomServerIdentity {
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  /** The company's UUID, as TEXT: the ticket asked for a number, but a company id is a UUID. */
  companyId: string | null;
  /** The product's own values, `owner` | `member` (the ticket's `staff` is not a role that exists). */
  companyRole: string | null;
  /** The company's creation, Unix seconds, for Intercom's company `created_at`. */
  companyCreatedAt: number | null;
  /** `profile-status.accountCreatedAt` in Unix seconds, null when the backend did not send it. */
  registeredAt: number | null;
  /** The backend's internal/QA flag. Null when an older backend does not send it. */
  testAccount: boolean | null;
  /**
   * The renter's requests, company-wide for a member (that is the list `my-requests` answers).
   * Null when the call failed, so a failure does not tell support «0 requests».
   */
  requests: {
    total: number;
    open: number;
    /** The newest non-trial request. `status` is the backend's own value (`OPEN`, `ACCEPTED`, ...). */
    last: {
      id: string;
      status: string;
      offers: number;
      /** Suppliers it was sent to; null on a backend that does not send it yet. */
      notified: number | null;
    } | null;
  } | null;
  userHash: string | null;
  verified: boolean;
}

/**
 * Which client the chat came from, in the backend's `X-Client-Platform` vocabulary
 * (`mobile-ios` | `mobile-android` | `web-rentee` | `supplier-os`), so an agent reads one set of
 * values everywhere. A literal rather than `CLIENT_PLATFORM_HEADER`: that module is server-only.
 * Sent on the anonymous boot too, so a visitor who never signs in still reads as the web.
 */
export const INTERCOM_PLATFORM = "web-rentee";

/**
 * **The last refused action, for `last_error`** (Intercom context ticket, 2026-09-24).
 *
 * The ticket asks for «the last blocked action, if one fired in the last minute». The web has no
 * profile gate of its own, as the app's `action_blocked_by_profile` is, so the web's equivalent is a
 * request the backend refused to post: the case a renter most often writes to support about, with
 * the backend code support needs (`E8009` is the request limit).
 */
let lastRefusal: { reason: string; at: number } | null = null;
const REFUSAL_WINDOW_MS = 60_000;

export function noteSupportError(reason: string, now = Date.now()): void {
  lastRefusal = { reason, at: now };
}

/** The refusal if it happened in the last minute, else null: an old one would mislead the agent. */
export function recentSupportError(now = Date.now()): string | null {
  return lastRefusal && now - lastRefusal.at <= REFUSAL_WINDOW_MS ? lastRefusal.reason : null;
}

/**
 * The address a support agent sees.
 *
 * A real email wins, because it is the one the user actually owns. Failing that the app derives one
 * from the phone number — digits only, `@moedatech.app` — and this does the same, so one person does
 * not arrive in the inbox as two contacts depending on which client they wrote from. Null when there
 * is neither, rather than an empty string: Intercom treats `""` as a value and would store it.
 */
export function intercomEmail(phone: string | null | undefined, email?: string | null): string | null {
  const real = email?.trim();
  if (real) return real;
  const digits = (phone ?? "").replace(/[+\s]/g, "");
  return digits ? `${digits}@moedatech.app` : null;
}

/** The display name, with the app's own fallback for a user who has not given one. */
export function intercomName(id: number, name?: string | null): string {
  const given = name?.trim();
  return given || `User ${id}`;
}

/**
 * The boot object for an identified renter.
 *
 * Custom attributes sit at the TOP LEVEL here, unlike the mobile SDK's nested `customAttributes` map
 * — that is the JS messenger's shape, and nesting them would file them all under one unusable key.
 * The names are kept identical to the app's so a support agent reads one set of fields, not two.
 */
export function buildIntercomPayload(args: {
  user: IntercomIdentity;
  locale: string;
  appVersion: string;
  name?: string | null;
  email?: string | null;
  /** What the server route answered, when it has answered. */
  server?: IntercomServerIdentity | null;
}): Record<string, unknown> {
  const { user, locale, appVersion, server } = args;
  const name = server?.name ?? args.name;
  const email = server?.email ?? args.email;
  const phone = server?.phone ?? user.phone;
  return {
    /**
     * The DATABASE id, as a string.
     *
     * The backend's `conversation.admin.replied` webhook resolves a recipient by mapping this exact
     * value back to a `User` row. The server route signs the same id it reports, so a signed boot and
     * an unsigned one address the same person.
     */
    user_id: server?.userId ?? String(user.id),
    name: intercomName(user.id, name),
    email: intercomEmail(phone, email),
    phone,
    // `active_role` 1 on the app. There is no supplier surface on the web to be anything else.
    user_type: "rentee",
    // The same fact under the ticket's name, which the inbox routing rules read. `user_type` stays:
    // the mobile app sends it, and dropping it would blank the field for every web contact.
    side: "rentee",
    // Only a signed-in renter reaches this payload, and signing in means he registered.
    is_guest: false,
    tier: user.tier,
    locale,
    device_os: "web",
    platform: INTERCOM_PLATFORM,
    app_version: appVersion,
    ...(server?.company ? { company_name: server.company } : {}),
    // Absent values are OMITTED, not sent as null or 0: Intercom types an attribute by its first
    // value, and a null company or a zero for a failed call would tell support something untrue.
    ...(server?.companyId ? { company_id: server.companyId } : {}),
    ...(server?.companyRole ? { company_role: server.companyRole } : {}),
    ...(server?.registeredAt != null ? { registered_at: server.registeredAt } : {}),
    ...(server?.testAccount != null ? { test_account: server.testAccount } : {}),
    ...(server?.requests
      ? {
          requests_total: server.requests.total,
          requests_open: server.requests.open,
          ...(server.requests.last
            ? {
                last_request_id: server.requests.last.id,
                last_request_status: server.requests.last.status,
                last_request_offers: server.requests.last.offers,
                ...(server.requests.last.notified != null
                  ? { last_request_notified: server.requests.last.notified }
                  : {}),
              }
            : {}),
        }
      : {}),
    /**
     * Intercom's COMPANY record, so every renter under one firm groups on one card. Keyed on the
     * company's UUID, the same value as `company_id` above.
     */
    ...(server?.companyId
      ? {
          company: {
            company_id: server.companyId,
            ...(server.company ? { name: server.company } : {}),
            ...(server.companyCreatedAt != null ? { created_at: server.companyCreatedAt } : {}),
          },
        }
      : {}),
    /**
     * Identity verification, when the workspace has it configured.
     *
     * OMITTED rather than sent as null when it does not: Intercom reads the key's PRESENCE, and a
     * `user_hash: null` is a failed signature rather than an absent one — it would refuse the boot
     * on a workspace that is not even asking for verification.
     */
    ...(server?.userHash ? { user_hash: server.userHash } : {}),
  };
}
