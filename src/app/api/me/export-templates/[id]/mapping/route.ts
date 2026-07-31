import { NextResponse } from "next/server";
import { agentsPatch, AgentsBackendError } from "@/lib/api/agents-backend";
import { sessionUserId } from "@/lib/api/session-user";
import { useRealApp } from "@/lib/config/env";
import { mockResolve } from "@/lib/api/mock-export-templates";

/**
 * PATCH /api/me/export-templates/:id/mapping — apply the user's decisions on the reconciliation
 * and flip the template to `ready`.
 *
 * Resolutions persist on the stored mapping, which is what makes a template CONVERGE: resolve
 * "Mob/Demob" once and that cell fills on every export afterwards, rather than the question
 * being re-asked each time. The backend re-validates the edited mapping, so an invalid
 * correction comes back with the specific problem rather than being stored.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await sessionUserId();
  if (userId == null) return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    if (!useRealApp) {
      const view = mockResolve(id, body);
      return view
        ? NextResponse.json(view)
        : NextResponse.json({ message: "Template not found" }, { status: 404 });
    }
    return NextResponse.json(
      await agentsPatch<unknown>(
        `/agents/export-templates/${encodeURIComponent(id)}/mapping?userId=${userId}`,
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
