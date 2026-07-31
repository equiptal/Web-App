import { NextResponse } from "next/server";
import { agentsGet, agentsPost, AgentsBackendError } from "@/lib/api/agents-backend";
import { sessionUserId } from "@/lib/api/session-user";

/**
 * GET  /api/me/export-templates — the caller's bid-comparison export templates, for the picker.
 * POST /api/me/export-templates — register an uploaded template and run the mapping pass.
 *
 * Proxies the agents backend's `/agents/export-templates`, which is service-token authed and
 * takes the renter id as `?userId=` — the same shape as `/agents/bids/{id}/documents`.
 *
 * The id comes from `sessionUserId()` (a backend-verified token, never the unsigned `mt_user`
 * cookie), and no session is refused rather than proxied without one: templates are
 * company-scoped and the export embeds suppliers' CR/VAT, so the owner guard is a
 * confidentiality boundary rather than a convenience.
 */

function unauthorized() {
  return NextResponse.json({ code: "unauthorized" }, { status: 401 });
}

function relayError(err: unknown) {
  const status = err instanceof AgentsBackendError ? err.status || 502 : 500;
  const body =
    err instanceof AgentsBackendError
      ? { code: err.code, message: err.message, messageAr: err.messageAr, details: err.details }
      : { message: "Request failed" };
  return NextResponse.json(body, { status });
}

export async function GET() {
  const userId = await sessionUserId();
  if (userId == null) return unauthorized();
  try {
    // `failed` rows come back on purpose: the picker shows why a template is unusable
    // instead of silently omitting it.
    return NextResponse.json(await agentsGet<unknown>(`/agents/export-templates?userId=${userId}`));
  } catch (err) {
    return relayError(err);
  }
}

export async function POST(req: Request) {
  const userId = await sessionUserId();
  if (userId == null) return unauthorized();
  try {
    const body = await req.json();
    // Runs the mapping inline — seconds, not milliseconds. The client shows a progress state.
    return NextResponse.json(
      await agentsPost<unknown>(`/agents/export-templates?userId=${userId}`, body)
    );
  } catch (err) {
    return relayError(err);
  }
}
