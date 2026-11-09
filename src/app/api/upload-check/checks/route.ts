import { NextResponse } from "next/server";
import { withAuthedBackend } from "@/lib/api/app-backend-authed";
import {
  UPLOAD_CHECK_BASE,
  UPLOAD_CHECK_FLOW,
  UPLOAD_CHECK_HEADERS,
  bodyOf,
  cleanFiles,
  refusal,
  refusalResponse,
} from "@/lib/api/upload-check-server";
import type { UploadCheckStartAnswer } from "@/lib/upload-check/types";

/**
 * POST /api/upload-check/checks — start a company documents check with the file list
 * (`{ files: [{ id, name, mime, bytes, sha256, pages }] }`, contract-v4 §1).
 *
 * ⚠️ **`flow: "company"` is pinned here**; a `flow` or `equipmentId` in the browser's body is
 * ignored. Only `checkId`, the presigned PUTs and the progress link go back (`known` is the
 * equipment memory's answer and the progress file carries what the page draws).
 */
export async function POST(req: Request) {
  const files = cleanFiles((await bodyOf(req)).files);
  if (!files) return refusal("bad_input", 422);

  return withAuthedBackend(req, async (call) => {
    try {
      const data = await call<UploadCheckStartAnswer>(`${UPLOAD_CHECK_BASE}/checks`, {
        method: "POST",
        headers: UPLOAD_CHECK_HEADERS,
        body: JSON.stringify({ flow: UPLOAD_CHECK_FLOW, files }),
      });
      return NextResponse.json({
        checkId: data.checkId,
        upload: Array.isArray(data.upload) ? data.upload : [],
        progressUrl: data.progressUrl,
      });
    } catch (err) {
      return refusalResponse(err);
    }
  });
}
