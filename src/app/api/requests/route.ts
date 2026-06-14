import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { useRealApp, serverEnv } from "@/lib/config/env";
import { agentsPost, AgentsBackendError } from "@/lib/api/agents-backend";
import { USER_COOKIE } from "@/lib/api/auth-server";
import { draftToCreateRequest } from "@/lib/api/app-adapters";
import type { RfqRequestPayload } from "@/lib/contract";
import type { CreateRequestResult } from "@/lib/contract/app";
import type { RenterUser } from "@/lib/contract/auth";

/** AC-03: the signed-in renter's real backend id (web-app/001), or null when there's no session. */
async function sessionUserId(): Promise<string | null> {
  try {
    const raw = (await cookies()).get(USER_COOKIE)?.value;
    if (!raw) return null;
    const user = JSON.parse(raw) as RenterUser;
    return typeof user.id === "number" ? String(user.id) : null;
  } catch {
    return null;
  }
}

/**
 * POST /api/requests — submit the assembled broadcast request.
 * Real (AGENTS_API_URL + token set): maps the draft → create_request and POSTs /agents/requests as
 * the signed-in renter (web-app/001, AC-03), falling back to AGENTS_TEST_USER_ID only when there's
 * no session. Otherwise → mock. Body: RfqRequestPayload & { simulateError?: boolean }
 */
export async function POST(req: Request) {
  let body: (RfqRequestPayload & { simulateError?: boolean }) | Record<string, never> = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }

  if ("simulateError" in body && body.simulateError) {
    return NextResponse.json({ code: "network" }, { status: 503 });
  }

  // AC-03: submit as the signed-in renter; the env test user is only a no-session fallback.
  const userId = (await sessionUserId()) ?? serverEnv.agentsTestUserId;

  if (useRealApp && userId && "items" in body) {
    try {
      const payload = draftToCreateRequest(body as RfqRequestPayload, userId);
      const data = await agentsPost<CreateRequestResult>("/agents/requests", payload);
      // The server fans out one request per equipment item → `requests[]`. Surface every code.
      const codes = (data.requests ?? [])
        .map((r) => r.shortCode ?? r.requestId)
        .filter((c): c is string => !!c);
      return NextResponse.json(
        { requestId: codes[0] ?? "RFQ", requestIds: codes.length ? codes : ["RFQ"] },
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
