import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

function req(path: string, cookie?: string) {
  return new NextRequest(new URL(`http://localhost${path}`), cookie ? { headers: { cookie } } : undefined);
}

const AUTHED = "mt_refresh=sometoken";
const isNext = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("gating middleware (AC-07/08/16/17/20)", () => {
  it("unauthenticated → redirect to /login?next=<path> (AC-16/20)", () => {
    const res = middleware(req("/"));
    const loc = res.headers.get("location") ?? "";
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(loc).toContain("/login");
    expect(loc).toContain(`next=${encodeURIComponent("/")}`);
  });

  it("authenticated → gated page passes through (AC-17)", () => {
    const res = middleware(req("/", AUTHED));
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
