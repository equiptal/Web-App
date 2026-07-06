import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Gating middleware — behaviour switches on the PUBLIC-WEB feature flag.
 *
 * Flag ON (staging, NEXT_PUBLIC_PUBLIC_WEB_ENABLED=1): the web is **public to browse**; only the
 * account-bound resources in GATED_PREFIXES require a session. The account gate fires in-app at
 * request submit (the combined OTP+register modal), not in middleware.
 *
 * Flag OFF (default → production): the legacy behaviour — the WHOLE app requires a session; only the
 * account-less routes in PUBLIC_PREFIXES (the shared supplier bid form `/bid/<token>`) are public.
 * One edge switch is enough to hold the public-web epic back from prod: with the flag off, guests are
 * redirected to /login before any guest-facing UI (open tabs, guest compare, the OTP submit modal)
 * can render, so that code is inert.
 *
 * Edge check on the refresh-token cookie (the 30-day "remembered" envelope — name kept in sync with
 * `auth-server.ts` REFRESH_COOKIE): present ⇒ treat as a valid session (the access token is refreshed
 * lazily by `/api/auth/session`). `/login` redirects an authed user to `next` (AC-07) or home (AC-08).
 * The matcher excludes `/api/*`, Next internals and static files.
 */
const REFRESH_COOKIE = "mt_refresh";
const ID_COOKIE = "mt_id";

// PUBLIC-WEB FEATURE FLAG. Set NEXT_PUBLIC_PUBLIC_WEB_ENABLED=1 in the STAGING environment to keep
// public browse there. Leave it unset in production until the public-web + one-step-auth-gate epic
// ships (same env-flag pattern as LOGO_UPLOAD_ENABLED). Read at call time so it's build-inlined in
// prod and toggleable in tests.
const publicWebEnabled = () => process.env.NEXT_PUBLIC_PUBLIC_WEB_ENABLED === "1";

// Flag ON: NO route gate at all — the whole web is public. Auth is a modal fired in-app (there is no
// `/login` redirect); pages that need a session (e.g. a deal room) open the auth modal in place.
// Flag OFF (legacy/prod): everything gates EXCEPT these account-less routes (the shared supplier bid
// form `/bid/<token>`, opened by suppliers who have no login).
const PUBLIC_PREFIXES = ["/bid"];

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

  // Decide whether this path needs a session. Flag ON: nothing gates (public web — auth is an in-app
  // modal). Flag OFF (legacy): everything gates except the account-less PUBLIC_PREFIXES.
  const needsSession = publicWebEnabled()
    ? false
    : !PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (needsSession && !authed) {
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
