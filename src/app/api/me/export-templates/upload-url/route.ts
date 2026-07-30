import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * POST /api/me/export-templates/upload-url — a presigned S3 PUT for a template upload.
 *
 * The client PUTs the file straight to S3, then calls `POST /api/me/export-templates` with the
 * returned key. The extension is checked here as a courtesy; the authoritative format gate runs
 * on that second call, because only the bytes can tell a genuine .xlsx from a renamed .docx
 * (both are ZIPs) — and a rejected file is deleted from S3 there.
 */
export async function POST(req: Request) {
  const body = await req.text();
  return withAuthedBackend(req, async (call) => {
    try {
      return NextResponse.json(
        await call<unknown>("/export-templates/upload-url", { method: "POST", body })
      );
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
