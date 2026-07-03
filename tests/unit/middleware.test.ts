import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

function req(path: string, cookie?: string) {
  return new NextRequest(new URL(`http://localhost${path}`), cookie ? { headers: { cookie } } : undefined);
}

const AUTHED = "mt_refresh=sometoken";
const isNext = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("public-by-default gating middleware", () => {
  it("unauthenticated → public page (home) passes through (browse freely)", () => {
    const res = middleware(req("/"));
    expect(isNext(res)).toBe(true);
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
    const res = middleware(req("/deal-room/abc", AUTHED));
    expect(isNext(res)).toBe(true);
  });

  it("unauthenticated on /login → passes through (shows sign-in)", () => {
    const res = middleware(req("/login"));
    expect(isNext(res)).toBe(true);
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
