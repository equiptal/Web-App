import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * PATCH /api/me/export-templates/:id/mapping — apply the user's decisions on the reconciliation
 * and flip the template to `ready`.
 *
 * Resolutions persist on the stored mapping, which is what makes a template CONVERGE: resolve
 * "Mob/Demob" once and that cell fills on every export afterwards, rather than the question
 * being re-asked each time. The backend re-validates the edited mapping, so an invalid
 * correction comes back as a 400 with the specific problem rather than being stored.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.text();
  return withAuthedBackend(req, async (call) => {
    try {
      return NextResponse.json(
        await call<unknown>(`/export-templates/${encodeURIComponent(id)}/mapping`, {
          method: "PATCH",
          body,
        })
      );
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
