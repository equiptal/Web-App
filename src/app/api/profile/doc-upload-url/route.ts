import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * POST /api/profile/doc-upload-url — get a presigned S3 URL for a verification document (AC-10/11/12).
 * Proxies backend `POST /profile/doc-upload-url` `{ filename, contentType }` → `{ url, key }`. The
 * backend allowlists JPEG/PNG/WebP/PDF (bilingual reject) and enforces no size limit. The client then
 * PUTs the file directly to `url` and references `key` in the verification payload.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* empty */
  }
  const filename = typeof body.filename === "string" ? body.filename : "";
  const contentType = typeof body.contentType === "string" ? body.contentType : "";

  return withAuthedBackend(req, async (call) => {
    try {
      const data = await call<{ url: string; key: string }>("/profile/doc-upload-url", {
        method: "POST",
        body: JSON.stringify({ filename, contentType }),
      });
      return NextResponse.json(data);
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
