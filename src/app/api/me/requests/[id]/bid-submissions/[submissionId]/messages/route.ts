import { NextResponse } from "next/server";
import { agentsPost, AgentsBackendError } from "@/lib/api/agents-backend";
import { sessionUserId } from "@/lib/api/session-user";

/**
 * POST /api/me/requests/:id/bid-submissions/:submissionId/messages — the renter's pre-conversion
 * "Negotiate" message on an off-platform shared-link submission. Proxies the agents service-token
 * endpoint `POST /agents/requests/{id}/bid-submissions/{submissionId}/messages`, forwarding the
 * signed-in renter's id for the owner guard. The backend appends `{ text, at }` to the submission's
 * `rentee_messages` and emails the ops distribution on the first message (cue to onboard + convert).
 *
 * The id comes from the SHARED `sessionUserId()` (a backend-verified token — never the unsigned
 * `mt_user` cookie), and no session is refused rather than proxied without a `userId`: this writes a
 * message onto someone's submission and emails ops, so an unowned call is never harmless.
 */

export async function POST(req: Request, { params }: { params: Promise<{ id: string; submissionId: string }> }) {
  const { id, submissionId } = await params;

  let text = "";
  try {
    const body = (await req.json()) as { text?: unknown };
    text = typeof body.text === "string" ? body.text.trim() : "";
  } catch {
    /* invalid JSON → empty text → 400 below */
  }
  if (!text) {
    return NextResponse.json({ error: { code: "invalid", message: "A message is required" } }, { status: 400 });
  }

  const userId = await sessionUserId();
  if (userId == null) return NextResponse.json({ error: { code: "unauthorized", message: "Sign in to send a message" } }, { status: 401 });
  const qs = `?userId=${userId}`;
  try {
    const data = await agentsPost<unknown>(
      `/agents/requests/${encodeURIComponent(id)}/bid-submissions/${encodeURIComponent(submissionId)}/messages${qs}`,
      { text },
    );
    return NextResponse.json({ data });
  } catch (err) {
    const status = err instanceof AgentsBackendError ? err.status || 502 : 500;
    const code = err instanceof AgentsBackendError ? err.code : undefined;
    const message = err instanceof Error ? err.message : "Failed to send message";
    return NextResponse.json({ error: { code, message } }, { status });
  }
}
