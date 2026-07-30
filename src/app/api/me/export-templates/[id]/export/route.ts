import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * POST /api/me/export-templates/:id/export — render the comparison into the caller's template.
 *
 * Returns the pre-flight summary AND the download URL together: one render, one round trip, so
 * the UI can show what will be blank before the user commits. Affordable because this path makes
 * no model call — the mapping happened once, at upload.
 *
 * The comparison FIGURES come from the client, because the comparison maths lives only in this
 * app; the backend resolves supplier/renter identity itself and ignores any client-sent CR/VAT.
 *
 * A template that is not `ready` comes back as a 400 carrying
 * `details.fallback === "builtin_export"`. That is passed through untouched so the caller can
 * degrade to the standard export instead of leaving the user unable to export at all.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.text();
  return withAuthedBackend(req, async (call) => {
    try {
      return NextResponse.json(
        await call<unknown>(`/export-templates/${encodeURIComponent(id)}/export`, {
          method: "POST",
          body,
        })
      );
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
