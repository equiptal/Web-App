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
    for (const p of ["/", "/create", "/stores/42", "/compare", "/requests", "/inbox", "/profile", "/deal-room/abc", "/dashboard"]) {
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

/* ── Link-preview crawlers on /bid: cacheable, so WhatsApp will build a card ────────────────────── */
describe("unfurl crawlers on a shared bid link", () => {
  afterEach(() => { delete process.env[FLAG]; });

  /**
   * `/bid/<token>` reads request headers to build its Open Graph tags, so Next serves it with
   * `Cache-Control: private, no-cache, no-store`. Telegram ignores that and previews anyway; WhatsApp
   * honours it and shows a bare URL. The header is relaxed for crawlers only — the page is a form, and
   * serving a real supplier a five-minute-stale copy would be a different bug.
   */
  const bot = (ua: string) =>
    new NextRequest(new URL("http://localhost/bid/eq-rental-abc"), { headers: { "user-agent": ua } });

  it("gets a cacheable response", () => {
    for (const ua of ["WhatsApp/2.23.20.0", "facebookexternalhit/1.1", "TelegramBot (like TwitterBot)", "Slackbot-LinkExpanding 1.0"]) {
      expect(middleware(bot(ua)).headers.get("cache-control"), ua).toBe("public, max-age=300, s-maxage=300");
    }
  });

  it("still passes the request through rather than answering it", () => {
    expect(isNext(middleware(bot("WhatsApp/2.23.20.0")))).toBe(true);
  });

  it("leaves a real browser on the uncached response", () => {
    const res = middleware(bot("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36"));
    expect(res.headers.get("cache-control")).toBeNull();
  });

  it("does not relax caching outside /bid", () => {
    const res = middleware(
      new NextRequest(new URL("http://localhost/requests"), { headers: { "user-agent": "WhatsApp/2.23.20.0" } }),
    );
    expect(res.headers.get("cache-control")).toBeNull();
  });
});
