/**
 * SERVER-ONLY guest parse cap (public-web-auth-gate T10, server backstop). A signed-out visitor gets a
 * small number of Mansour parses before we require sign-in. The client already nudges via localStorage
 * (see agent-quota.ts), but that resets when storage is cleared — this is the BFF-side enforcement that
 * localStorage can't wipe: the count lives in a signed HttpOnly cookie the BFF owns.
 *
 * Import ONLY from route handlers. Needs NO env var — the HMAC secret has a built-in constant fallback
 * (an optional GUEST_QUOTA_SECRET override makes the count fully non-forgeable, but is not required).
 *
 * Honest ceiling: anonymous = no durable identity, so a guest who ALSO clears this cookie (or switches
 * browser/device) gets a fresh allowance. This stops the trivial "clear localStorage → unlimited" path;
 * a hard per-person cap only exists once they sign in (then it's per-account, and this never applies).
 */
import crypto from "crypto";

/** Free Mansour parses for a signed-out visitor, then sign-in is required. */
export const GUEST_PARSE_LIMIT = 3;

const COOKIE = "mt_gq";
const SECRET = process.env.GUEST_QUOTA_SECRET?.trim() || "mt-guest-quota-v1";
const FIVE_YEARS = 60 * 60 * 24 * 365 * 5;

/** Auth cookies the app sets on any signed-in session (see auth-server.ts). Presence of ANY ⇒ signed in. */
const SESSION_COOKIES = ["mt_user", "mt_access", "mt_refresh", "mt_id"];

function cookieVal(header: string, name: string): string | null {
  const m = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function sign(v: string): string {
  return crypto.createHmac("sha256", SECRET).update(v).digest("base64url").slice(0, 24);
}

/**
 * Is this request from a signed-in visitor? Fail-open: presence of ANY auth cookie counts, so a real
 * user is never mistaken for a guest and capped. A guest has none of these.
 */
export function hasSession(req: Request): boolean {
  const header = req.headers.get("cookie") ?? "";
  return SESSION_COOKIES.some((n) => {
    const v = cookieVal(header, n);
    return v != null && v.trim() !== "";
  });
}

/** Verified guest parse count from the cookie. 0 when absent OR tampered (fail-open — never over-blocks). */
export function guestParseCount(req: Request): number {
  const raw = cookieVal(req.headers.get("cookie") ?? "", COOKIE);
  if (!raw) return 0;
  const [n, sig] = raw.split(".");
  if (!n || !sig || sign(n) !== sig) return 0; // forged/corrupt → treat as fresh, not blocked
  const c = parseInt(n, 10);
  return Number.isFinite(c) && c >= 0 ? c : 0;
}

/** A `Set-Cookie` value stamping the new (signed) count — HttpOnly, long-lived, lax. */
export function guestParseCookie(count: number): string {
  const val = `${count}.${sign(String(count))}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${encodeURIComponent(val)}; Path=/; Max-Age=${FIVE_YEARS}; HttpOnly; SameSite=Lax${secure}`;
}
