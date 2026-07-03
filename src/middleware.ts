import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Gating middleware. The web is **public by default** (browse without an account); only the
 * personal, account-bound areas listed in GATED_PREFIXES require a session. Edge check on the
 * refresh-token cookie (the 30-day "remembered" envelope — name kept in sync with `auth-server.ts`
 * REFRESH_COOKIE): present ⇒ treat as a valid session (the access token is refreshed lazily by
 * `/api/auth/session`).
 *
 * - Any page NOT under a GATED_PREFIX loads for everyone (guests browse freely). The account gate
 *   fires in-app at request submit (the combined OTP+register modal), not in middleware.
 * - Unauthenticated → a gated page redirects to `/login?next=<path>` (AC-16/20).
 * - Authenticated → `/login` redirects to `next` (AC-07) or home (AC-08).
 *
 * The matcher excludes `/api/*`, Next internals and static files, so the auth API stays reachable
 * while signed out and assets aren't gated.
 */
const REFRESH_COOKIE = "mt_refresh";
const ID_COOKIE = "mt_id";

// Routes that still hard-require a session at the edge. The nav *tabs* (Requests / Inbox / Profile /
// Compare) are NOT gated — they load for everyone and render a guest empty-state + CTA in-app, so the
// site feels open. Only resource-specific routes that make no sense without an account stay gated:
// a specific deal room (reached via a bid/award) and the demo dashboard.
const GATED_PREFIXES = ["/deal-room", "/dashboard"];

function safeNext(next: string | null): string {
  // Only allow same-origin relative paths (block protocol-relative `//host`).
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Mobile→web sign-in handoff (mobile/017 AC-08): the app opens `<web>/?handoff=<idToken>`. Forward
  // the carried token to the handoff route (an /api/* path, so it runs past this login gate) which
  // validates it, sets the session, and lands on a fresh request.
  const handoff = req.nextUrl.searchParams.get("handoff");
  if (handoff) {
    const dest = req.nextUrl.clone();
    dest.pathname = "/api/auth/handoff";
    dest.search = `?token=${encodeURIComponent(handoff)}`;
    return NextResponse.redirect(dest);
  }

  // A refresh token (normal sign-in) OR an idToken (handoff session, no refresh) counts as authed.
  const authed = Boolean(req.cookies.get(REFRESH_COOKIE)?.value || req.cookies.get(ID_COOKIE)?.value);

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

  // Only the personal, account-bound areas gate; everything else is public (browse freely).
  const isGated = GATED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isGated && !authed) {
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
