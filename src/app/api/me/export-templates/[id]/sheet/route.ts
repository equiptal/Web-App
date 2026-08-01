import { NextResponse } from "next/server";
import { agentsGet, AgentsBackendError } from "@/lib/api/agents-backend";
import { sessionUserId } from "@/lib/api/session-user";
import { mockExportTemplates } from "@/lib/config/env";
import { mockSheetView } from "@/lib/api/mock-export-templates";

/**
 * GET /api/me/export-templates/:id/sheet — the user's own template as an annotated grid.
 *
 * Backs the review screen, which draws THEIR spreadsheet with our answers in place rather than
 * a list of questions about cell references they have to go and find themselves.
 *
 * Separate from the reconciliation `GET /:id` because the backend re-reads the workbook out of
 * S3 to build this. The picker and the export both call that one and neither should pay for a
 * parse they don't need.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await sessionUserId();
  if (userId == null) return NextResponse.json({ code: "unauthorized" }, { status: 401 });

  if (mockExportTemplates) {
    const view = mockSheetView(id);
    return view
      ? NextResponse.json(view)
      : NextResponse.json({ message: "Template not found" }, { status: 404 });
  }

  try {
    return NextResponse.json(
      await agentsGet<unknown>(
        `/agents/export-templates/${encodeURIComponent(id)}/sheet?userId=${userId}`
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
