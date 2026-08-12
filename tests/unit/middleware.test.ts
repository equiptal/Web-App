import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

function req(path: string, cookie?: string) {
  return new NextRequest(new URL(`http://localhost${path}`), cookie ? { headers: { cookie } } : undefined);
}

const AUTHED = "mt_refresh=sometoken";
const isNext = (res: Response) => res.headers.get("x-middleware-next") === "1";
const FLAG = "NEXT_PUBLIC_PUBLIC_WEB_ENABLED";

/* ── Default (flag unset) OR =1: fully public, NO route gate — auth is an in-app modal, no /login ── */
describe("public-web ON — no route gate at all", () => {
  beforeEach(() => { delete process.env[FLAG]; }); // default is now ON
  afterEach(() => { delete process.env[FLAG]; });

  it("unauthenticated → EVERY page passes through (incl. former gated /deal-room, /dashboard)", () => {
    for (const p of ["/", "/create", "/stores/42", "/requests", "/inbox", "/profile", "/deal-room/abc", "/dashboard"]) {
      expect(isNext(middleware(req(p))), p).toBe(true);
    }
  });

  it("never redirects to /login (no route gate)", () => {
    for (const p of ["/deal-room/abc", "/dashboard", "/profile"]) {
      const res = middleware(req(p));
      expect(res.headers.get("location"), p).toBeNull();
    }
  });

  it("authenticated → pages pass through", () => {
    expect(isNext(middleware(req("/deal-room/abc", AUTHED)))).toBe(true);
  });
});

/* ── Flag =0 (legacy kill-switch, e.g. prod): whole app requires a session; only /bid is public ── */
describe("public-web OFF — legacy auth-required gating", () => {
  beforeEach(() => { process.env[FLAG] = "0"; });
  afterEach(() => { delete process.env[FLAG]; });

  it("unauthenticated → home + every app page redirects to /login", () => {
    for (const p of ["/", "/create", "/stores/42", "/requests", "/inbox", "/profile", "/deal-room/abc", "/dashboard"]) {
      const res = middleware(req(p));
      expect(res.status, p).toBeGreaterThanOrEqual(300);
      expect(res.headers.get("location") ?? "", p).toContain("/login");
    }
  });

  it("unauthenticated → the account-less supplier bid form (/bid/<token>) still passes through", () => {
    expect(isNext(middleware(req("/bid/token123")))).toBe(true);
  });

  it("authenticated → app pages pass through", () => {
    for (const p of ["/", "/requests", "/profile"]) {
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

  it("authenticated on /login?next=/foo → redirect to /foo (specs#235-AC-07)", () => {
    const res = middleware(req("/login?next=/foo", AUTHED));
    expect(res.headers.get("location") ?? "").toContain("/foo");
  });

  it("authenticated on /login with no next → redirect home (specs#235-AC-08)", () => {
    const res = middleware(req("/login", AUTHED));
    const loc = new URL(res.headers.get("location") ?? "http://localhost/x");
    expect(loc.pathname).toBe("/");
  });
});

/* ── Retired surfaces (docs/requests-workspace-disabled.md) ──
   The requests list, both request-detail pages and the comparison workspace are one page now, so
   their old routes send the renter to it — at the edge, before any gate and before React.

   This lives in middleware because `redirect()` in a page does NOT work here: the thrown
   NEXT_REDIRECT is caught by a client error boundary in the provider tree and rendered as an error
   page, so the route answered 200 with a stack trace in its body. Found by curling the running dev
   server; these assertions are what stop it coming back. */
describe("retired requests routes redirect to the workspace", () => {
  beforeEach(() => { delete process.env[FLAG]; });
  afterEach(() => { delete process.env[FLAG]; });

  const retired = ["/compare", "/requests/abc123", "/requests/group/RFQ-00067", "/requests/abc/anything"];

  it("redirects permanently, and to the workspace", () => {
    for (const p of retired) {
      const res = middleware(req(p));
      // 308, not 307: these moved permanently. A 302 would let a browser keep asking.
      expect(res.status, p).toBe(308);
      expect(res.headers.get("location"), p).toBe("http://localhost/requests");
    }
  });

  it("drops the id rather than carrying it — the workspace resolves its own selection", () => {
    const res = middleware(req("/requests/abc123?view=bids"));
    expect(res.headers.get("location")).toBe("http://localhost/requests");
  });

  it("redirects whether or not there is a session — it is not a gate", () => {
    for (const p of retired) {
      expect(middleware(req(p, AUTHED)).status, p).toBe(308);
    }
  });

  it("still redirects under the legacy kill-switch, instead of bouncing to /login", () => {
    process.env[FLAG] = "0";
    const res = middleware(req("/compare"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("http://localhost/requests");
  });

  it("leaves the workspace itself alone", () => {
    // The match is on what is BELOW /requests/, so the page it redirects to cannot redirect to itself.
    expect(isNext(middleware(req("/requests")))).toBe(true);
  });

  it("leaves every other surface alone", () => {
    for (const p of ["/", "/create", "/inbox", "/profile", "/dashboard", "/deal-room/abc", "/bids/x/equipment"]) {
      expect(isNext(middleware(req(p))), p).toBe(true);
    }
  });
});
