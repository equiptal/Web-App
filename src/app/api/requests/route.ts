import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { agentsPost, AgentsBackendError } from "@/lib/api/agents-backend";
import { sessionUserId } from "@/lib/api/session-user";
import { draftToCreateRequest } from "@/lib/api/app-adapters";
import type { RfqRequestPayload } from "@/lib/contract";
import type { CreateRequestResult } from "@/lib/contract/app";

/**
 * POST /api/requests — submit the assembled broadcast request.
 * Real (AGENTS_API_URL + token set): maps the draft → create_request and POSTs /agents/requests as
 * the signed-in renter (web-app/001, AC-03); with no session it answers 401 so the auth gate owns
 * the anonymous case. Otherwise → mock. Body: RfqRequestPayload & { simulateError?, isTrial? }
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

  // AC-03: submit as the signed-in renter.
  //
  // ~~The env test user used to be a no-session fallback here.~~ On a real backend a session-less
  // submit now answers 401 instead — the open question the old comment left ("should probably 401 so
  // the auth gate opens") was decided when the OS public share pages started funnelling anonymous
  // visitors into this exact route: every one of their submits would have been filed as the
  // configured test user, invisibly, with a green 201. The client is ready for it — a 401 maps to
  // the designed `auth` submit-error state (`contract/submit-error.ts`: `status === 401 → kind
  // "auth"`), not a generic failure. And it stays the backstop, not the ordinary path: the only
  // caller (`ShareOnPost`'s `post()`) gates `tier === "guest"` behind the AccountModal BEFORE
  // calling `submit()`, so this fires only when the client believes it is signed in and the
  // server disagrees (expired or cleared session).
  //
  // ⚠️ 401 BEFORE the `useRealApp` branch would break local mock dev — the mock below deliberately
  // answers without any session. The check therefore lives inside the real-backend condition, so
  // mock mode is unchanged and a SESSION-LESS real submit can no longer reach the mock's
  // fabricated 201. (A signed-in real-mode POST whose body failed to parse still can, via the
  // `"items" in body` condition below — pre-existing, untouched here.)
  const verifiedId = await sessionUserId();
  if (useRealApp && verifiedId == null) {
    return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  }
  const userId = verifiedId != null ? String(verifiedId) : null;

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
          {
            code: "submit_failed",
            detail: err.message,
            backendCode: err.code,
            backendStatus: err.status,
            /**
             * ⚠️ **Which FIELD the backend refused** (owner, 2026-09-12: *"can it be specific, like
             * if a field is missing"*).
             *
             * ~~Dropped here.~~ A `VALIDATION_ERROR` carries `parsed.error.flatten()`, so the backend
             * has always said exactly which key it could not accept and this route threw it away,
             * leaving the renter with the word «Validation Error» and no field.
             *
             * ⚠️ Forwarded RAW, as the backend's own key names. Turning them into sentences is the
             * client's job, where the dictionary lives.
             */
            details: err.details ?? null,
          },
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
