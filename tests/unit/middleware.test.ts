import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

function req(path: string, cookie?: string) {
  return new NextRequest(new URL(`http://localhost${path}`), cookie ? { headers: { cookie } } : undefined);
}

const AUTHED = "mt_refresh=sometoken";
const isNext = (res: Response) => res.headers.get("x-middleware-next") === "1";
const FLAG = "NEXT_PUBLIC_PUBLIC_WEB_ENABLED";

/* ── Flag ON: public browse, only account-bound resources gate (staging) ── */
describe("public-web ON — public-by-default gating", () => {
  beforeEach(() => { process.env[FLAG] = "1"; });
  afterEach(() => { delete process.env[FLAG]; });

  it("unauthenticated → public page (home) passes through (browse freely)", () => {
    expect(isNext(middleware(req("/")))).toBe(true);
  });

  it("unauthenticated → public tabs (/create, /stores, /compare, /requests, /inbox, /profile) pass through", () => {
    for (const p of ["/create", "/stores/42", "/compare", "/requests", "/requests/123", "/inbox", "/profile"]) {
      expect(isNext(middleware(req(p)))).toBe(true);
    }
  });

  it("unauthenticated → gated page (/deal-room/x) redirects to /login?next=<path>", () => {
    const res = middleware(req("/deal-room/abc"));
    const loc = res.headers.get("location") ?? "";
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(loc).toContain("/login");
    expect(loc).toContain(`next=${encodeURIComponent("/deal-room/abc")}`);
  });

  it("unauthenticated → demo dashboard redirects to /login", () => {
    const res = middleware(req("/dashboard"));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.headers.get("location") ?? "").toContain("/login");
  });

  it("authenticated → gated page passes through", () => {
    expect(isNext(middleware(req("/deal-room/abc", AUTHED)))).toBe(true);
  });
});

/* ── Flag OFF (default → production): whole app requires a session; only /bid is public ── */
describe("public-web OFF — legacy auth-required gating", () => {
  beforeEach(() => { delete process.env[FLAG]; });

  it("unauthenticated → home + every app page redirects to /login", () => {
    for (const p of ["/", "/create", "/stores/42", "/compare", "/requests", "/inbox", "/profile", "/deal-room/abc", "/dashboard"]) {
      const res = middleware(req(p));
      expect(res.status, p).toBeGreaterThanOrEqual(300);
      expect(res.headers.get("location") ?? "", p).toContain("/login");
    }
  });

  it("unauthenticated → the account-less supplier bid form (/bid/<token>) still passes through", () => {
    expect(isNext(middleware(req("/bid/token123")))).toBe(true);
  });

  it("authenticated → app pages pass through", () => {
    for (const p of ["/", "/requests", "/compare", "/profile"]) {
      expect(isNext(middleware(req(p, AUTHED))), p).toBe(true);
    }
  });
});

/* ── Login redirects + handoff behave the same regardless of the flag ── */
describe("login + handoff (flag-independent)", () => {
  afterEach(() => { delete process.env[FLAG]; });

  it("unauthenticated on /login → passes through (shows sign-in)", () => {
    expect(isNext(middleware(req("/login")))).toBe(true);
  });

  it("authenticated on /login?next=/foo → redirect to /foo (AC-07)", () => {
    const res = middleware(req("/login?next=/foo", AUTHED));
    expect(res.headers.get("location") ?? "").toContain("/foo");
  });

  it("authenticated on /login with no next → redirect home (AC-08)", () => {
    const res = middleware(req("/login", AUTHED));
    const loc = new URL(res.headers.get("location") ?? "http://localhost/x");
    expect(loc.pathname).toBe("/");
  });
});
