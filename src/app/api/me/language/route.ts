import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * PATCH /api/me/language — persist the renter's preferred language (app parity,
 * `PATCH /users/me/language`, { language: 'en' | 'ar' }). Keeps backend-sent content (e.g. push
 * notifications) in the chosen language. The web's UI locale is handled client-side (i18n) — this
 * just syncs the server preference. Body: { language }.
 */
export async function PATCH(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* empty */
  }
  const language = body.language === "ar" ? "ar" : "en";

  return withAuthedBackend(req, async (call) => {
    try {
      const data = await call<{ language?: string }>("/users/me/language", {
        method: "PATCH",
        body: JSON.stringify({ language }),
      });
      return NextResponse.json({ ok: true, language: data.language ?? language });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
