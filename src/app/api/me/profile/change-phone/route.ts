import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * POST /api/me/profile/change-phone — start the change-phone flow (app parity, `POST /profile/change-phone`,
 * changePhoneSchema / requireTier basic). Sends a 4-digit OTP to the NEW number (SMS; staging bypass
 * code applies). Body: { newPhone }. Returns the backend's { message, messageAr }.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* empty */
  }
  const newPhone = typeof body.newPhone === "string" ? body.newPhone.trim() : "";

  return withAuthedBackend(req, async (call) => {
    try {
      const data = await call<{ message?: string; messageAr?: string }>("/profile/change-phone", {
        method: "POST",
        body: JSON.stringify({ newPhone }),
      });
      return NextResponse.json({ ok: true, ...data });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
