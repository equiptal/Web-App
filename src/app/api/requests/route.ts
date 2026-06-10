import { NextResponse } from "next/server";
import { useRealApp, serverEnv } from "@/lib/config/env";
import { agentsPost } from "@/lib/api/agents-backend";
import { draftToCreateRequest } from "@/lib/api/app-adapters";
import type { RfqRequestPayload } from "@/lib/contract";
import type { CreateRequestResult } from "@/lib/contract/app";

/**
 * POST /api/requests — submit the assembled broadcast request.
 * Real (AGENTS_API_URL + token + AGENTS_TEST_USER_ID set): maps the draft → create_request and
 * POSTs /agents/requests. Otherwise (or if no test user while auth is bypassed) → mock.
 * Body: RfqRequestPayload & { simulateError?: boolean }
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

  if (useRealApp && serverEnv.agentsTestUserId && "items" in body) {
    try {
      const payload = draftToCreateRequest(body as RfqRequestPayload, serverEnv.agentsTestUserId);
      const data = await agentsPost<CreateRequestResult>("/agents/requests", payload);
      return NextResponse.json({ requestId: data.shortCode ?? data.requestId ?? "RFQ" }, { status: 201 });
    } catch (err) {
      console.error("[requests] real submit failed:", err);
      return NextResponse.json({ code: "network" }, { status: 503 });
    }
  }

  // Mock submission.
  await new Promise((r) => setTimeout(r, 300));
  const items = "items" in body && Array.isArray(body.items) ? body.items : [];
  const requestId = "RFQ-" + Math.abs(hash(JSON.stringify(items))).toString(36).toUpperCase().slice(0, 6);
  return NextResponse.json({ requestId }, { status: 201 });
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
