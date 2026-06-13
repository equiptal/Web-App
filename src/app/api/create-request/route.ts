import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { buildCreateRequest, type RequestChannel } from "@/lib/contract/create-request";
import type { RfqRequestPayload } from "@/lib/contract/draft";

/**
 * POST /api/create-request — manual & direct request creation (web-app/005, AC-10/17/18/26–31/34).
 * Posts to the shared app backend `POST /rentees/me/requests` (me-scoped, Cognito ID token) — the
 * same model the mobile app uses, so the request shows on the app + admin. Distinct from
 * `/api/requests` (web-app/002's agent/Mansour broadcast). Body: `{ draft, channel, supplierId? }`.
 */
export async function POST(req: Request) {
  let body: { draft?: RfqRequestPayload; channel?: RequestChannel; supplierId?: number | null } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* empty */
  }
  if (!body.draft || !Array.isArray(body.draft.items)) {
    return NextResponse.json({ code: "validation" }, { status: 400 });
  }
  const payload = buildCreateRequest(body.draft, {
    channel: body.channel === "direct" ? "direct" : "broadcast",
    supplierId: body.supplierId ?? null,
  });
  return withAuthedBackend(req, async (call) => {
    try {
      const data = await call<{ requestId?: string; shortCode?: string }>("/rentees/me/requests", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return NextResponse.json({ requestId: data?.shortCode ?? data?.requestId ?? "REQ" }, { status: 201 });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
