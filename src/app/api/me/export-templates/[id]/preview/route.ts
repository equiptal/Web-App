import { NextResponse } from "next/server";
import { agentsPost, AgentsBackendError } from "@/lib/api/agents-backend";
import { sessionUserId } from "@/lib/api/session-user";
import { mockExportTemplates } from "@/lib/config/env";

/**
 * POST /api/me/export-templates/:id/preview — this comparison, resolved into their template.
 *
 * Same body as the export. Returns the value that would land in every cell, so the review grid
 * can show the actual figures instead of the names of the fields feeding them.
 *
 * The backend runs a REAL render and watches it, rather than resolving the values a second
 * way — a preview that disagrees with the downloaded file would mean the user approves one set
 * of numbers and sends another.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await sessionUserId();
  if (userId == null) return NextResponse.json({ code: "unauthorized" }, { status: 401 });

  // Dev mode fakes storage and the parsed file, so there is no workbook to render against.
  // An empty preview degrades to the field-name view rather than breaking the review.
  if (mockExportTemplates) {
    return NextResponse.json({ cells: [], summary: null, mock: true });
  }

  try {
    const body = await req.json();
    return NextResponse.json(
      await agentsPost<unknown>(
        `/agents/export-templates/${encodeURIComponent(id)}/preview?userId=${userId}`,
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
