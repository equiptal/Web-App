import { NextResponse } from "next/server";
import { agentsPost, AgentsBackendError } from "@/lib/api/agents-backend";
import { sessionUserId } from "@/lib/api/session-user";

/**
 * POST /api/me/export-templates/:id/export — render the comparison into the caller's template.
 *
 * Returns the pre-flight summary AND the download URL together: one render, one round trip, so
 * the UI can show what will be blank before the user commits. Affordable because this path makes
 * no model call — the mapping happened once, at upload.
 *
 * The comparison FIGURES come from the client, because the comparison maths lives only in this
 * app; the backend resolves supplier/renter identity itself and ignores any client-sent CR/VAT,
 * and independently verifies the caller can see the named request.
 *
 * A template that is not `ready` comes back carrying `details.fallback === "builtin_export"`.
 * That is passed through untouched so the caller can degrade to the standard export instead of
 * leaving the user unable to export at all.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await sessionUserId();
  if (userId == null) return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    return NextResponse.json(
      await agentsPost<unknown>(
        `/agents/export-templates/${encodeURIComponent(id)}/export?userId=${userId}`,
        body
      )
    );
  } catch (err) {
    const status = err instanceof AgentsBackendError ? err.status || 502 : 500;
    const payload =
      err instanceof AgentsBackendError
        ? { code: err.code, message: err.message, messageAr: err.messageAr, details: err.details }
        : { message: "Request failed" };
    return NextResponse.json(payload, { status });
  }
}
