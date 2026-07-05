import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import type { RespondBody, RespondResult } from "@/lib/contract/survey";

/**
 * POST /api/me/surveys/{id}/respond — submit the renter's answer to one Outcome Survey.
 * Proxies `POST /api/surveys/{id}/respond`. The backend validates which action is allowed per
 * survey type and is idempotent on already-resolved surveys. Errors map via the bilingual envelope.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: RespondBody;
  try {
    body = (await req.json()) as RespondBody;
  } catch {
    return NextResponse.json({ code: "validation" }, { status: 400 });
  }
  if (!body?.action) return NextResponse.json({ code: "validation" }, { status: 400 });

  return withAuthedBackend(req, async (call) => {
    try {
      const result = await call<RespondResult>(`/api/surveys/${encodeURIComponent(id)}/respond`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      return NextResponse.json(result ?? { status: "ACTIVE" });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
