import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Gating middleware (web-app/001, AC-07/08/16/17/20). Edge check on the refresh-token cookie (the
 * 30-day "remembered" envelope — name kept in sync with `auth-server.ts` REFRESH_COOKIE): present ⇒
 * treat as a valid session (the access token is refreshed lazily by `/api/auth/session`).
 *
 * - Unauthenticated → any gated page redirects to `/login?next=<path>` (AC-16/20).
 * - Authenticated → `/login` redirects to `next` (AC-07) or home (AC-08); other pages pass (AC-17).
 *
 * The matcher excludes `/api/*`, Next internals and static files, so the auth API stays reachable
 * while signed out and assets aren't gated.
 */
const REFRESH_COOKIE = "mt_refresh";

function safeNext(next: string | null): string {
  // Only allow same-origin relative paths (block protocol-relative `//host`).
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const authed = Boolean(req.cookies.get(REFRESH_COOKIE)?.value);

  if (pathname === "/login") {
    if (authed) {
      const dest = req.nextUrl.clone();
      const target = safeNext(req.nextUrl.searchParams.get("next"));
      const [p, q] = target.split("?");
      dest.pathname = p;
      dest.search = q ? `?${q}` : "";
      return NextResponse.redirect(dest);
    }
    return NextResponse.next();
  }

  if (!authed) {
    const dest = req.nextUrl.clone();
    dest.pathname = "/login";
    dest.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(dest);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
