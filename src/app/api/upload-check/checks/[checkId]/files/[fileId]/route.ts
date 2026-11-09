import { NextResponse } from "next/server";
import { withAuthedBackend } from "@/lib/api/app-backend-authed";
import {
  UPLOAD_CHECK_BASE,
  UPLOAD_CHECK_HEADERS,
  isFileId,
  isUuid,
  refusal,
  refusalResponse,
} from "@/lib/api/upload-check-server";

/**
 * DELETE /api/upload-check/checks/{checkId}/files/{fileId} — the renter removed a file from the
 * pile, so the check drops it from its answer (contract-v4 §1). 204.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ checkId: string; fileId: string }> }) {
  const { checkId, fileId } = await params;
  const id = /^\d+$/.test(fileId) ? Number(fileId) : NaN;
  if (!isUuid(checkId) || !isFileId(id)) return refusal("bad_input", 422);

  return withAuthedBackend(req, async (call) => {
    try {
      await call(`${UPLOAD_CHECK_BASE}/checks/${checkId}/files/${id}`, {
        method: "DELETE",
        headers: UPLOAD_CHECK_HEADERS,
      });
      return new NextResponse(null, { status: 204 });
    } catch (err) {
      return refusalResponse(err);
    }
  });
}
