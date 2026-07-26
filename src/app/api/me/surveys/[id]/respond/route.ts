import { NextResponse } from "next/server";

/**
 * POST /api/me/surveys/{id}/respond — DISABLED (Outcome Survey feature switched off).
 *
 * Still exports POST for the same reason as ../../pending: Next.js requires an HTTP-method export,
 * and an explicit 404 beats a missing handler when debugging. No writes reach the app backend.
 *
 * Original proxy preserved below. To restore, see docs/surveys-disabled.md.
 */
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
export async function POST(_req: Request, _ctx: { params: Promise<{ id: string }> }) {
  return NextResponse.json({ code: "not_found", detail: "surveys disabled" }, { status: 404 });
}

/* ---- ORIGINAL IMPLEMENTATION (disabled) ------------------------------------------------
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import type { RespondBody, RespondResult } from "@/lib/contract/survey";

/**
 * POST /api/me/surveys/{id}/respond — submit the renter's answer to one Outcome Survey.
 * Proxies `POST /api/surveys/{id}/respond`. The backend validates which action is allowed per
 * survey type and is idempotent on already-resolved surveys. Errors map via the bilingual envelope.
 *\/
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
------------------------------------------------------------------------------------------ */
