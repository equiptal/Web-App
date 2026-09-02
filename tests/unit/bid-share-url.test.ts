import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The bid form lives in the Supplier OS since 2026-08-31. Three producers compose that link — the
 * mobile app, c-hub admin, and this app — and they have to emit ONE string for the same request,
 * otherwise which product an off-platform supplier sees depends on who pressed Share.
 *
 * `OS_BASE` is read at module load, so every case re-imports the module with its own environment.
 */
async function build(osUrl?: string): Promise<(id: string) => string> {
  vi.resetModules();
  if (osUrl === undefined) delete process.env.NEXT_PUBLIC_OS_APP_URL;
  else process.env.NEXT_PUBLIC_OS_APP_URL = osUrl;
  const mod = await import("@/lib/api/client");
  return mod.bidShareUrl;
}

const REAL = process.env.NEXT_PUBLIC_OS_APP_URL;

describe("bidShareUrl", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    if (REAL === undefined) delete process.env.NEXT_PUBLIC_OS_APP_URL;
    else process.env.NEXT_PUBLIC_OS_APP_URL = REAL;
  });

  // AC-3. The default is PROD, not staging: a missing variable in the prod bundle must not hand a
  // real supplier a Railway link.
  it("falls back to the production OS host when the variable is unset", async () => {
    const bidShareUrl = await build(undefined);
    expect(bidShareUrl("abc-123")).toBe("https://os.moedatech.net/bid/abc-123");
  });

  it("uses NEXT_PUBLIC_OS_APP_URL when it is set (staging opts in)", async () => {
    const bidShareUrl = await build("https://web-production-de3c8.up.railway.app");
    expect(bidShareUrl("abc-123")).toBe("https://web-production-de3c8.up.railway.app/bid/abc-123");
  });

  // AC-4.
  it("does not double the slash when the variable carries a trailing one", async () => {
    const bidShareUrl = await build("https://web-production-de3c8.up.railway.app/");
    expect(bidShareUrl("abc-123")).toBe("https://web-production-de3c8.up.railway.app/bid/abc-123");
  });

  // AC-1 / AC-2: one shape, no renter-name slug, and never this app's own origin.
  it("emits the bare id with no renter-name slug", async () => {
    const bidShareUrl = await build(undefined);
    const url = bidShareUrl("7f3d0c1e-9a2b-4c5d-8e6f-0a1b2c3d4e5f");
    expect(url).toBe("https://os.moedatech.net/bid/7f3d0c1e-9a2b-4c5d-8e6f-0a1b2c3d4e5f");
    expect(url).not.toContain("localhost");
  });

  it("takes exactly one argument, so no call site can pass an origin", async () => {
    const bidShareUrl = await build(undefined);
    expect(bidShareUrl.length).toBe(1);
  });
});
