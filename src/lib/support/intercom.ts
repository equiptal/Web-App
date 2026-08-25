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
}): Record<string, unknown> {
  const { user, locale, appVersion } = args;
  return {
    user_id: String(user.id),
    name: intercomName(user.id, args.name),
    email: intercomEmail(user.phone, args.email),
    phone: user.phone,
    // `active_role` 1 on the app. There is no supplier surface on the web to be anything else.
    user_type: "rentee",
    tier: user.tier,
    locale,
    device_os: "web",
    app_version: appVersion,
  };
}
