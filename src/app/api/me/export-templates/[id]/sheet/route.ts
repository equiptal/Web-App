import { NextResponse } from "next/server";
import { agentsPost, AgentsBackendError } from "@/lib/api/agents-backend";
import { sessionUserId } from "@/lib/api/session-user";
import { mockExportTemplates } from "@/lib/config/env";
import { mockSheetView } from "@/lib/api/mock-export-templates";

/**
 * POST /api/me/export-templates/:id/sheet — their template as an annotated, FILLED grid.
 *
 * Backs the review screen: their own spreadsheet, with each cell saying what an export does to
 * it and what value it actually receives for the comparison in the body.
 *
 * POST rather than GET because it carries that comparison. One endpoint rather than a separate
 * preview — describing the cells and filling them are the same question, and splitting them
 * meant two round trips, two workbook reads server-side, and two shapes that could disagree
 * about which cells exist.
 *
 * A body is optional: without it the grid still names the field feeding each cell, which is
 * what a template with nothing to export needs.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const body = await req.json().catch(() => ({}));
    return NextResponse.json(
      await agentsPost<unknown>(
        `/agents/export-templates/${encodeURIComponent(id)}/sheet?userId=${userId}`,
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
