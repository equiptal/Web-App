import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * GET  /api/me/export-templates — the caller's bid-comparison export templates, for the picker.
 * POST /api/me/export-templates — register an uploaded template and run the AI mapping pass.
 *
 * Proxies the app backend's `/export-templates`. Templates are company-shared (with a personal
 * fallback for users who have no company yet), so scoping is entirely the backend's job — we
 * forward the signed-in renter's token and nothing else.
 */

export async function GET(req: Request) {
  return withAuthedBackend(req, async (call) => {
    try {
      // `failed` rows come back on purpose: the picker shows why a template is unusable
      // instead of silently omitting it.
      return NextResponse.json(await call<unknown>("/export-templates"));
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}

export async function POST(req: Request) {
  const body = await req.text();
  return withAuthedBackend(req, async (call) => {
    try {
      // Runs the mapping inline — seconds, not milliseconds. The client shows a progress state.
      return NextResponse.json(await call<unknown>("/export-templates", { method: "POST", body }));
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
