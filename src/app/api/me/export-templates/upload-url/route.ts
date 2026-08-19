import { NextResponse } from "next/server";
import { agentsPost, AgentsBackendError } from "@/lib/api/agents-backend";
import { sessionUserId } from "@/lib/api/session-user";

/**
 * POST /api/me/export-templates/upload-url — a presigned S3 PUT for a template upload.
 *
 * The client PUTs the file straight to S3, then calls `POST /api/me/export-templates` with the
 * returned key. The extension is checked upstream as a courtesy; the authoritative format gate
 * runs on that second call, because only the bytes can tell a genuine .xlsx from a renamed
 * .docx (both are ZIPs) — and a rejected file is deleted from S3 there.
 */
export async function POST(req: Request) {
  const userId = await sessionUserId();
  if (userId == null) return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    return NextResponse.json(
      await agentsPost<unknown>(`/agents/export-templates/upload-url?userId=${userId}`, body)
    );
  } catch (err) {
    const status = err instanceof AgentsBackendError ? err.status || 502 : 500;
    const payload =
      err instanceof AgentsBackendError
        ? { code: err.code, message: err.message, messageAr: err.messageAr, details: err.details }
        : { message: "Request failed" };
    return NextResponse.json(payload, { status });
  }
}
