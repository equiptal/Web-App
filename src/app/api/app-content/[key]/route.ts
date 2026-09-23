import { NextResponse } from "next/server";
import { authGet } from "@/lib/api/app-backend";

/**
 * `GET /api/app-content/{key}` — the legal documents, from the same place the app reads them.
 *
 * The profile's «Privacy policy» and «Terms of use» pointed at `moedatech.net/privacy` and
 * `/terms`, and both 404 (owner, 2026-08-30). The marketing site has no such pages, and the app
 * never used one: `app_router.dart` routes both to a `LegalContentPage` fed by
 * `AppSettingsRepositoryImpl.getLegalContent`, which is `GET /app/content/{key}` on the app backend
 * with `privacy_policy` and `terms_of_use` as its two keys. So the document is CONTENT the product
 * serves, not a page on a website, and the web reads the same rows the app does — one text, kept in
 * one place, in both clients.
 *
 * **Unauthenticated on purpose.** `authGet` calls the backend with the tenant header and no bearer:
 * a visitor has to be able to read the terms before agreeing to them, and the login screen links to
 * both. `withAuthedBackend` would have made the terms a thing you must sign in to read.
 *
 * Only the two keys the app names are allowed through. `{key}` reaches the backend path, and an open
 * proxy that forwards any segment is a way to probe `/app/content/*` for whatever else lives there.
 */

/** The app's own two, and no third. See the note above on why this is a list and not a passthrough. */
const KEYS: Record<string, string> = {
  "privacy-policy": "privacy_policy",
  "terms-of-use": "terms_of_use",
};

export interface LegalContent {
  key: string;
  title: string;
  titleAr: string;
  content: string;
  contentAr: string;
  version: string;
  updatedAt: string;
}

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const backendKey = KEYS[key];
  if (!backendKey) return NextResponse.json({ error: "unknown_document" }, { status: 404 });

  try {
    const data = await authGet<LegalContent>(`/app/content/${backendKey}`);
    return NextResponse.json(data);
  } catch {
    // The document is the backend's; a failure here is "we could not fetch it", never an empty page
    // presented as the terms. The surface says so and offers a retry.
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
