import { NextResponse } from "next/server";
import { agentsGet, agentsDelete, AgentsBackendError } from "@/lib/api/agents-backend";
import { sessionUserId } from "@/lib/api/session-user";
import { useRealApp } from "@/lib/config/env";
import { mockDelete, mockReconciliation } from "@/lib/api/mock-export-templates";

/**
 * GET    /api/me/export-templates/:id — the review screen's payload: status plus the two-way
 *        reconciliation (cells we could not fill, each with the mapper's candidate; and our
 *        visible fields with no home in the template).
 * DELETE /api/me/export-templates/:id — soft delete.
 *
 * A template outside the caller's scope reads as 404 from the backend rather than 403, so its
 * existence is not confirmed to someone who cannot see it.
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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await sessionUserId();
  if (userId == null) return unauthorized();
  if (!useRealApp) {
    const view = mockReconciliation(id);
    return view
      ? NextResponse.json(view)
      : NextResponse.json({ message: "Template not found" }, { status: 404 });
  }
  try {
    return NextResponse.json(
      await agentsGet<unknown>(`/agents/export-templates/${encodeURIComponent(id)}?userId=${userId}`)
    );
  } catch (err) {
    return relayError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await sessionUserId();
  if (userId == null) return unauthorized();
  if (!useRealApp) {
    mockDelete(id);
    return new NextResponse(null, { status: 204 });
  }
  try {
    await agentsDelete<unknown>(`/agents/export-templates/${encodeURIComponent(id)}?userId=${userId}`);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return relayError(err);
  }
}
