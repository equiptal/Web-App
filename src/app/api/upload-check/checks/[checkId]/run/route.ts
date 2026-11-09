import { NextResponse } from "next/server";
import { withAuthedBackend } from "@/lib/api/app-backend-authed";
import { UPLOAD_CHECK_BASE, UPLOAD_CHECK_HEADERS, isUuid, refusal, refusalResponse } from "@/lib/api/upload-check-server";

/**
 * POST /api/upload-check/checks/{checkId}/run — the small copies are up, wake the worker
 * (contract-v4 §1). Answers a fresh progress link.
 */
export async function POST(req: Request, { params }: { params: Promise<{ checkId: string }> }) {
  const { checkId } = await params;
  if (!isUuid(checkId)) return refusal("bad_input", 422);

  return withAuthedBackend(req, async (call) => {
    try {
      const data = await call<{ progressUrl?: string }>(`${UPLOAD_CHECK_BASE}/checks/${checkId}/run`, {
        method: "POST",
        headers: UPLOAD_CHECK_HEADERS,
      });
      return NextResponse.json({ progressUrl: data.progressUrl });
    } catch (err) {
      return refusalResponse(err);
    }
  });
}
