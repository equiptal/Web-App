import { NextResponse } from "next/server";
import { useRealApp, serverEnv } from "@/lib/config/env";
import { agentsPost, AgentsBackendError } from "@/lib/api/agents-backend";
import { sessionUserId } from "@/lib/api/session-user";
import { draftToCreateRequest } from "@/lib/api/app-adapters";
import type { RfqRequestPayload } from "@/lib/contract";
import type { CreateRequestResult } from "@/lib/contract/app";

/**
 * POST /api/requests — submit the assembled broadcast request.
 * Real (AGENTS_API_URL + token set): maps the draft → create_request and POSTs /agents/requests as
 * the signed-in renter (web-app/001, AC-03), falling back to AGENTS_TEST_USER_ID only when there's
 * no session. Otherwise → mock. Body: RfqRequestPayload & { simulateError?, isTrial? }
 *
 * mobile/016 — `isTrial: true` (the renter picked "Trial Request" on the home pop-up) is forwarded to
 * the agents backend, which creates the request WITHOUT dispatching it to suppliers, attaches sample
 * bids from the demo supplier, and auto-deletes it after 60 min.
 */
export async function POST(req: Request) {
  let body: (RfqRequestPayload & { simulateError?: boolean; isTrial?: boolean }) | Record<string, never> = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }

  if ("simulateError" in body && body.simulateError) {
    return NextResponse.json({ code: "network" }, { status: 503 });
  }

  // AC-03: submit as the signed-in renter; the env test user is only a no-session fallback.
  //
  // This route DELIBERATELY keeps that fallback while the owner-guarded routes dropped theirs. Here
  // `userId` is CREATOR ATTRIBUTION, not an authorization decision — it grants no read or delete
  // access to anyone else's data — and removing it would silently reroute a session-less submit into
  // the mock branch below, which answers 201 with a fabricated RFQ code. Failing a real submission by
  // pretending it succeeded is worse than attributing it to the configured test user.
  //
  // The impersonation vector is still closed: `sessionUserId()` now returns only backend-VERIFIED ids,
  // so a forged cookie can no longer pick whose name a request is filed under — the worst case is
  // today's no-session behaviour. Open question for the UI owner: a session-less submit on a deployed
  // environment should probably 401 so the auth gate opens, instead of landing on the test user.
  const verifiedId = await sessionUserId();
  const userId = verifiedId != null ? String(verifiedId) : serverEnv.agentsTestUserId;

  if (useRealApp && userId && "items" in body) {
    try {
      const payload = draftToCreateRequest(body as RfqRequestPayload, userId);
      // mobile/016 — sent only when true, so a real request's payload is byte-identical to before.
      const isTrial = "isTrial" in body && body.isTrial === true;
      const data = await agentsPost<CreateRequestResult>(
        "/agents/requests",
        isTrial ? { ...payload, isTrial: true } : payload,
      );
      // The server fans out one request per equipment item → `requests[]`. Surface every code (for
      // display) AND the request UUIDs (the bid-link token resolves by UUID, never the shortCode).
      const codes = (data.requests ?? [])
        .map((r) => r.shortCode ?? r.requestId)
        .filter((c): c is string => !!c);
      const uuids = (data.requests ?? [])
        .map((r) => r.requestId)
        .filter((c): c is string => !!c);
      return NextResponse.json(
        {
          requestId: codes[0] ?? "RFQ",
          requestIds: codes.length ? codes : ["RFQ"],
          requestUuids: uuids,
          // mobile/016 — echoed back so the confirmation screen can say "this was a trial run".
          isTrial,
          trialExpiresAt: data.trialExpiresAt ?? null,
        },
        { status: 201 },
      );
    } catch (err) {
      console.error("[requests] real submit failed:", err);
      // Surface the real backend status + message instead of an opaque 503.
      if (err instanceof AgentsBackendError) {
        return NextResponse.json(
          { code: "submit_failed", detail: err.message, backendCode: err.code, backendStatus: err.status },
          { status: 502 },
        );
      }
      return NextResponse.json({ code: "network" }, { status: 503 });
    }
  }

  // Mock submission.
  await new Promise((r) => setTimeout(r, 300));
  const items = "items" in body && Array.isArray(body.items) ? body.items : [];
  const requestId = "RFQ-" + Math.abs(hash(JSON.stringify(items))).toString(36).toUpperCase().slice(0, 6);
  return NextResponse.json({ requestId, requestIds: [requestId] }, { status: 201 });
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
