import { describe, it, expect } from "vitest";
import { backNameKey, backTarget } from "@/lib/contract/back-nav";

/**
 * The back control names its destination, and the destination is where the renter came FROM
 * (owner, 2026-09-03: *"create request will show back to home or back to marketplace or back to
 * browse depending on where he was"*).
 *
 * Two rules, and both fail quietly if they break — a wrong label still looks like a working button,
 * which is why they are pinned here rather than left to the shell.
 */

describe("naming a place", () => {
  it("names the four tabs and the places reached from them", () => {
    expect(backNameKey("/")).toBe("home");
    expect(backNameKey("/browse")).toBe("browse");
    expect(backNameKey("/requests")).toBe("marketplace");
    expect(backNameKey("/company")).toBe("company");
    expect(backNameKey("/suppliers")).toBe("suppliers");
    expect(backNameKey("/inbox")).toBe("inbox");
    expect(backNameKey("/profile")).toBe("profile");
  });

  it("gives a subtree its parent's name, and keeps `/` exact", () => {
    // Every route in the app starts with "/", and only one of them is home.
    expect(backNameKey("/requests/abc")).toBe("marketplace");
    expect(backNameKey("/browse")).toBe("browse");
    expect(backNameKey("/create")).toBeNull();
  });

  it("calls a store page BROWSE, because that is the place and not the route", () => {
    // «Back to stores» would name a URL. A store is a supplier read from the directory.
    expect(backNameKey("/stores/xyz")).toBe("browse");
  });

  it("drops the query and the hash before deciding", () => {
    expect(backNameKey("/requests?g=1&details=1")).toBe("marketplace");
    expect(backNameKey("/browse#top")).toBe("browse");
  });

  it("names nothing it cannot name, rather than guessing", () => {
    // The control still draws — it just says «Back» and cannot promise a place.
    expect(backNameKey("/legal/terms-of-use")).toBeNull();
    expect(backNameKey(null)).toBeNull();
    expect(backNameKey("")).toBeNull();
  });
});

describe("choosing where back goes", () => {
  it("prefers where the renter actually came from", () => {
    // The whole point: one page, four doors, and the label follows the door he used.
    expect(backTarget("/create", "/browse", "/")).toEqual({ href: "/browse", key: "browse" });
    expect(backTarget("/create", "/requests", "/")).toEqual({ href: "/requests", key: "marketplace" });
    expect(backTarget("/create", "/suppliers", "/")).toEqual({ href: "/suppliers", key: "suppliers" });
  });

  it("falls back on a cold load, where there is no trail to read", () => {
    // A deep link, a fresh tab, a reload. The page's own `fallback` is where it belongs.
    expect(backTarget("/create", null, "/")).toEqual({ href: "/", key: "home" });
  });

  it("falls back when the previous page is not a place we name", () => {
    // `/create` → `/create?mode=trial` is a real navigation and a useless destination.
    expect(backTarget("/legal/terms-of-use", "/legal/privacy-policy", "/profile")).toEqual({
      href: "/profile",
      key: "profile",
    });
  });

  it("never sends the renter to the page he is standing on", () => {
    // Two visits to `/requests` in a row would otherwise make Back a no-op that looks broken.
    expect(backTarget("/requests", "/requests/abc", "/")).toEqual({ href: "/", key: "home" });
  });

  it("carries a fallback it cannot name, rather than refusing to draw", () => {
    // The control works; it just says «Back». Better than no way off the page.
    expect(backTarget("/legal/x", null, "/verify")).toEqual({ href: "/verify", key: null });
  });
});
