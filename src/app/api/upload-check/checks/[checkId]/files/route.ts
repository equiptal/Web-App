import { NextResponse } from "next/server";
import { withAuthedBackend } from "@/lib/api/app-backend-authed";
import {
  UPLOAD_CHECK_BASE,
  UPLOAD_CHECK_HEADERS,
  bodyOf,
  cleanFiles,
  isUuid,
  refusal,
  refusalResponse,
} from "@/lib/api/upload-check-server";
import type { UploadCheckFilesAnswer } from "@/lib/upload-check/types";

/**
 * POST /api/upload-check/checks/{checkId}/files — more files for a running check (contract-v4 §1).
 * The backend gates it by the STORED check's flow and refuses another user's check (404).
 */
export async function POST(req: Request, { params }: { params: Promise<{ checkId: string }> }) {
  const { checkId } = await params;
  const files = cleanFiles((await bodyOf(req)).files);
  if (!isUuid(checkId) || !files) return refusal("bad_input", 422);

  return withAuthedBackend(req, async (call) => {
    try {
      const data = await call<UploadCheckFilesAnswer>(`${UPLOAD_CHECK_BASE}/checks/${checkId}/files`, {
        method: "POST",
        headers: UPLOAD_CHECK_HEADERS,
        body: JSON.stringify({ files }),
      });
      return NextResponse.json({
        upload: Array.isArray(data.upload) ? data.upload : [],
        progressUrl: data.progressUrl,
      });
    } catch (err) {
      return refusalResponse(err);
    }
  });
}
