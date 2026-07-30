import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * GET    /api/me/export-templates/:id — the review screen's payload: status plus the two-way
 *        reconciliation (cells we could not fill, each with the mapper's candidate; and our
 *        visible fields with no home in the template).
 * DELETE /api/me/export-templates/:id — soft delete.
 *
 * A template outside the caller's scope reads as 404 from the backend rather than 403, so its
 * existence is not confirmed to someone who cannot see it.
 */

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuthedBackend(req, async (call) => {
    try {
      return NextResponse.json(
        await call<unknown>(`/export-templates/${encodeURIComponent(id)}`)
      );
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuthedBackend(req, async (call) => {
    try {
      await call<unknown>(`/export-templates/${encodeURIComponent(id)}`, { method: "DELETE" });
      return new NextResponse(null, { status: 204 });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
