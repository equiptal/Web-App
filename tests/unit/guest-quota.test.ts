import { describe, it, expect } from "vitest";
import {
  GUEST_PARSE_LIMIT,
  guestParseCookie,
  guestParseCount,
  hasSession,
} from "@/lib/access/guest-quota-server";

/**
 * The signed-out parse cap — previously imported by no test at all.
 *
 * A signed-out visitor gets `GUEST_PARSE_LIMIT` Mansour parses, then must sign in. The client nudges
 * via localStorage, but that resets when storage is cleared; this is the BFF-side backstop that
 * localStorage cannot wipe, because the count lives in an HMAC-signed HttpOnly cookie.
 *
 * ## Two behaviours here look like bugs and are not
 *
 * **A forged cookie fails OPEN.** `guestParseCount` returns 0 for a bad signature — "treat as fresh,
 * not blocked" — so tampering hands the guest a new allowance rather than locking them out. That is
 * the deliberate trade: the module's own header states the honest ceiling, that an anonymous visitor
 * has no durable identity and one who clears the cookie gets a fresh allowance either way. What this
 * closes is the trivial "clear localStorage → unlimited" path, not determined tampering. A hard cap
 * exists only once someone signs in, and then this never applies.
 *
 * **Any auth cookie counts as a session.** `hasSession` is fail-open by design so a real user is never
 * mistaken for a guest and capped.
 *
 * Tests that asserted the opposite of either would be asserting a policy nobody chose.
 */

const req = (cookie?: string) =>
  new Request("https://example.test/api/agent/process", {
    headers: cookie ? { cookie } : {},
  });

/** The Set-Cookie value reduced to the bare `name=value` a browser would send back. */
const asSentCookie = (setCookie: string) => setCookie.split(";")[0];

describe("the limit itself", () => {
  it("allows three parses before sign-in is required", () => {
    expect(GUEST_PARSE_LIMIT).toBe(3);
  });
});

describe("counting a guest's parses", () => {
  it("starts at zero when no cookie has been set", () => {
    expect(guestParseCount(req())).toBe(0);
  });

  it("reads back a count it stamped", () => {
    for (const n of [0, 1, 2, 3, 42]) {
      expect(guestParseCount(req(asSentCookie(guestParseCookie(n))))).toBe(n);
    }
  });

  it("survives other cookies sitting beside it", () => {
    const mine = asSentCookie(guestParseCookie(2));
    expect(guestParseCount(req(`ajs_anonymous_id=abc; ${mine}; _ga=GA1.2.3`))).toBe(2);
  });
});

describe("tampering", () => {
  it("treats a forged signature as a fresh visitor, not a blocked one", () => {
    // Deliberate: fail-open. See the note at the top of this file — this is the documented ceiling of
    // an anonymous cap, not a defect. A test asserting a block here would pin a policy nobody chose.
    expect(guestParseCount(req("mt_gq=9.deadbeefdeadbeefdeadbeef"))).toBe(0);
  });

  it("treats a count raised without re-signing as fresh", () => {
    const forged = asSentCookie(guestParseCookie(1)).replace("mt_gq=1", "mt_gq=99");
    expect(guestParseCount(req(forged))).toBe(0);
  });

  it("treats a malformed value as fresh", () => {
    for (const bad of ["mt_gq=", "mt_gq=nosignature", "mt_gq=..", "mt_gq=abc.def"]) {
      expect(guestParseCount(req(bad))).toBe(0);
    }
  });

  it("rejects a negative count", () => {
    // A signed "-1" would otherwise buy an extra parse.
    expect(guestParseCount(req("mt_gq=-1.whatever"))).toBe(0);
  });
});

describe("the cookie it stamps", () => {
  const c = guestParseCookie(2);

  it("is HttpOnly, so client script cannot rewrite the count", () => {
    expect(c).toContain("HttpOnly");
  });

  it("is site-wide and long-lived", () => {
    expect(c).toContain("Path=/");
    expect(c).toContain("Max-Age=157680000");
  });

  it("is SameSite=Lax", () => {
    expect(c).toContain("SameSite=Lax");
  });

  it("carries a signature, not a bare number", () => {
    expect(asSentCookie(c)).toMatch(/^mt_gq=2%2E?[^;]+$|^mt_gq=2\.[^;]+$/);
    expect(asSentCookie(c)).not.toBe("mt_gq=2");
  });
});

describe("telling a guest from a signed-in visitor", () => {
  it("reports no session when no auth cookie is present", () => {
    expect(hasSession(req())).toBe(false);
    expect(hasSession(req("mt_gq=1.sig; _ga=GA1.2.3"))).toBe(false);
  });

  it("reports a session on ANY of the auth cookies", () => {
    // Fail-open on purpose: a real user must never be mistaken for a guest and capped.
    for (const name of ["mt_user", "mt_access", "mt_refresh", "mt_id"]) {
      expect(hasSession(req(`${name}=something`))).toBe(true);
    }
  });

  it("does not count an empty auth cookie as a session", () => {
    expect(hasSession(req("mt_access=   "))).toBe(false);
  });
});
