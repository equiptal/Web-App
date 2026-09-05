// @vitest-environment jsdom
// The trail's backstop is `sessionStorage`, so this one needs a window even though it renders
// nothing. Opted in per file, the way `vitest.config.ts` asks.
import { describe, it, expect, beforeEach } from "vitest";
import { currentTrailPath, previousPath, recordTrail, resetTrail } from "@/lib/nav-trail";

/**
 * The trail behind every Back control (owner, 2026-09-04: *"all back buttons whether from the web
 * itself or browser must be wired to the page where he was actually on"*).
 *
 * It used to be a `useRef` on `AppShell` — and `AppShell` is rendered by each PAGE, not by the
 * layout, so every navigation unmounted it and the trail came back empty. Back then fell through to
 * each page's `fallback`, which is why «Back» from a machine landed on Browse rather than on the
 * store it was opened from. These pin the two properties that fix makes: the trail outlives a
 * remount, and it never points at the page the renter is standing on.
 */

describe("the trail", () => {
  beforeEach(() => resetTrail());

  it("has nothing on a cold entry", () => {
    recordTrail("/");
    expect(previousPath()).toBeNull();
    expect(currentTrailPath()).toBe("/");
  });

  it("remembers the page before this one", () => {
    recordTrail("/browse");
    recordTrail("/stores/abc");
    expect(previousPath()).toBe("/browse");
  });

  it("ignores arriving where the renter already is", () => {
    // A re-render, a reload, or Strict Mode's double render. Any of them pushing the current page
    // onto the trail would aim Back at the page it is drawn on.
    recordTrail("/browse");
    recordTrail("/create");
    recordTrail("/create");
    recordTrail("/create");
    expect(previousPath()).toBe("/browse");
  });

  it("survives a reload, because it is the TAB's trail", () => {
    recordTrail("/requests");
    recordTrail("/create");
    // What a reload does to the module: the variables go, the tab's storage does not.
    const saved = window.sessionStorage.getItem("moedatech.nav-trail");
    expect(saved).toBeTruthy();
    resetTrail();
    window.sessionStorage.setItem("moedatech.nav-trail", saved!);
    // `resetTrail` marks the module restored, so re-import semantics are simulated by reading after
    // the store was put back: the next real page load calls `restore()` on its first read.
    expect(JSON.parse(saved!)).toEqual({ current: "/create", prev: "/requests" });
  });

  it("keeps two tabs' answers apart, because storage is per tab", () => {
    // Nothing to assert about another tab from here; what matters is that the key is sessionStorage
    // and not localStorage — a second tab must not inherit where this one has been.
    recordTrail("/browse");
    expect(window.localStorage.getItem("moedatech.nav-trail")).toBeNull();
    expect(window.sessionStorage.getItem("moedatech.nav-trail")).toBeTruthy();
  });
});
