import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { withAuthedBackend, type AuthedCall } from "@/lib/api/app-backend-authed";
import { agentsGet } from "@/lib/api/agents-backend";
import type { MyCompanyPayload } from "@/lib/contract/company";
import { extractRequestList, type RequestRecord } from "@/lib/contract/requests";
import type { IntercomServerIdentity } from "@/lib/support/intercom";

/**
 * GET /api/support/intercom — who the messenger should say this person is.
 *
 * Two jobs, and both of them have to happen on the server.
 *
 * **The signature.** Intercom's identity verification is an HMAC-SHA256 of the user id under the
 * workspace's secret, and it exists precisely so a browser cannot claim to be someone else — a
 * messenger booted with a bare `user_id` will happily accept any id the page hands it. So the secret
 * never reaches the client, and neither does the choice of WHICH id gets signed: the subject is
 * `me.id` as the backend just reported it, not a value posted in from the page and not the id inside
 * the session cookie. Signing a client-supplied id would rebuild the hole the hash closes.
 *
 * **The name and the address.** The web session is `{ id, phone, tier }`, so the messenger has been
 * introducing everyone as «User 42» with a phone-derived email. The real name, email and company are
 * on `GET /users/me`, which needs the renter's own token — so it is read here and handed down with
 * the signature in one call rather than making the widget fan out to two.
 *
 * Verification is OPTIONAL and off until configured. `INTERCOM_IDENTITY_SECRET` unset answers
 * `userHash: null` with `verified: false`, which is the state the mobile app runs in today — it calls
 * `loginIdentifiedUser` with no hash at all, so the workspace cannot have it enforced for mobile. Web
 * is a separate switch in the same dashboard, and this way the web works whichever way that switch is
 * set: unsigned while it is off, signed the moment the secret lands, with no code change either way.
 */
interface BackendMe {
  id: number;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  companyName?: string | null;
  supplierProfile?: { companyName?: string | null } | null;
}

/**
 * The two `GET /users/me/profile-status` fields support needs. `accountCreatedAt` is read HERE
 * rather than off `/users/me`, which was never confirmed to carry `createdAt`; `isTestAccount` is the
 * backend's internal/QA list (`constants/test-accounts.ts`). Both are absent on an older backend.
 */
interface BackendStatus {
  accountCreatedAt?: string | null;
  isTestAccount?: boolean;
}

/**
 * `GET /marketplace/my-requests`, unwrapped: newest first (`createdAt desc`), company-wide for a
 * member, with the full count in `total` and the still-open count in `summary.activeRequests`
 * (OPEN | ACTIVE | PARTIALLY_ACCEPTED, `rentee.service.ts`).
 */
interface BackendMyRequests {
  data?: RequestRecord[];
  total?: number;
  summary?: { activeRequests?: number };
}

/**
 * The support context an agent reads beside the chat (Intercom context ticket, 2026-09-24).
 *
 * Each half is fetched on its own and fails on its own: support must still know WHO this is when the
 * requests or the company call is down, so a failure there answers null rather than failing the route.
 */
async function supportContext(
  call: AuthedCall,
  userId: number,
): Promise<Pick<IntercomServerIdentity, "companyId" | "companyRole" | "companyCreatedAt" | "requests" | "registeredAt" | "testAccount">> {
  const [company, requests, status] = await Promise.all([
    agentsGet<MyCompanyPayload>(`/agents/companies/me?userId=${userId}`).catch(() => null),
    // A handful, not one: a TRIAL (the app's demo request) can be the newest, and it is not what the
    // renter is asking about. `/api/me/requests` drops them for the same reason.
    call<BackendMyRequests>("/marketplace/my-requests?limit=5").catch(() => null),
    call<BackendStatus>("/users/me/profile-status").catch(() => null),
  ]);
  const last = requests ? extractRequestList(requests).find((r) => r.isTrial !== true) ?? null : null;
  const notified = (last as { suppliersNotified?: unknown } | null)?.suppliersNotified;
  return {
    companyId: company?.company?.id ?? null,
    companyRole: company?.membership?.role ?? null,
    companyCreatedAt: unixSeconds(company?.company?.createdAt),
    requests: requests
      ? {
          total: typeof requests.total === "number" ? requests.total : 0,
          open: requests.summary?.activeRequests ?? 0,
          last: last
            ? {
                id: last.id,
                status: last.status,
                offers: last.bidCount ?? 0,
                // Absent on a backend older than 2026-09-24, and then OMITTED rather than read as 0.
                notified: typeof notified === "number" ? notified : null,
              }
            : null,
        }
      : null,
    registeredAt: unixSeconds(status?.accountCreatedAt),
    testAccount: typeof status?.isTestAccount === "boolean" ? status.isTestAccount : null,
  };
}

/** Unix SECONDS: Intercom types a date attribute by its first value, and milliseconds would stick. */
function unixSeconds(iso: string | null | undefined): number | null {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}

export async function GET(req: Request) {
  return withAuthedBackend(req, async (call) => {
    const me = await call<BackendMe>("/users/me");
    const userId = String(me.id);
    const secret = process.env.INTERCOM_IDENTITY_SECRET ?? "";
    const name = [me.firstName, me.lastName].filter(Boolean).join(" ").trim();

    return NextResponse.json({
      userId,
      name: name || null,
      email: me.email ?? null,
      phone: me.phone ?? null,
      company: me.companyName ?? me.supplierProfile?.companyName ?? null,
      ...(await supportContext(call, me.id)),
      // Hex, and over the id alone — Intercom's own rule. Never logged: the digest is a credential
      // for this identity, and a support conversation is not the place to leak one.
      userHash: secret ? createHmac("sha256", secret).update(userId).digest("hex") : null,
      verified: Boolean(secret),
    } satisfies IntercomServerIdentity);
  });
}
