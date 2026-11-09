import { NextResponse } from "next/server";
import { withAuthedBackend } from "@/lib/api/app-backend-authed";
import {
  UPLOAD_CHECK_BASE,
  UPLOAD_CHECK_HEADERS,
  bodyOf,
  cleanSharpAsk,
  isUuid,
  refusal,
  refusalResponse,
} from "@/lib/api/upload-check-server";
import type { UploadCheckSharpAnswer } from "@/lib/upload-check/types";

/**
 * POST /api/upload-check/checks/{checkId}/sharp — presigned PUTs for the sharp copies the progress
 * file asks in `needSharp` (contract-v4 §1). The backend narrows the ask to `needSharp` anyway.
 */
export async function POST(req: Request, { params }: { params: Promise<{ checkId: string }> }) {
  const { checkId } = await params;
  const files = cleanSharpAsk((await bodyOf(req)).files);
  if (!isUuid(checkId) || !files) return refusal("bad_input", 422);

  return withAuthedBackend(req, async (call) => {
    try {
      const data = await call<UploadCheckSharpAnswer>(`${UPLOAD_CHECK_BASE}/checks/${checkId}/sharp`, {
        method: "POST",
        headers: UPLOAD_CHECK_HEADERS,
        body: JSON.stringify(files.length ? { files } : {}),
      });
      return NextResponse.json({ upload: Array.isArray(data.upload) ? data.upload : [] });
    } catch (err) {
      return refusalResponse(err);
    }
  });
}
