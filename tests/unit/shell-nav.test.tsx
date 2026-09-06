import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { SessionProvider } from "@/lib/session";
import { en } from "@/lib/i18n/en";
import { AppShell } from "@/components/AppShell";
import { HomeHub } from "@/components/home/HomeHub";
import { recordTrail, resetTrail } from "@/lib/nav-trail";

/**
 * The top bar, and what a guest finds behind the Dashboard tab (owner, 2026-09-04).
 *
 * *"Nav bar will have dashboard at center and on one side browse and other side is requests, not
 * marketplace. And in guest mode it will land to browse not dashboard but same arrangement — note in
 * guest the dashboard will show sign in CTA, same one as all other pages."*
 *
 * Three things are pinned here because each of them fails silently: an order (the middle tab is a
 * decision, not an accident), a tab that must NOT be there any more (My Organization left the bar
 * with its page), and the one rule that reads as a contradiction until you separate landing from
 * pressing.
 */

const nav = vi.hoisted(() => ({ path: "/", replaced: [] as string[], pushed: [] as string[] }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
  useRouter: () => ({
    replace: (href: string) => nav.replaced.push(href),
    push: (href: string) => nav.pushed.push(href),
    prefetch: () => {},
    back: () => {},
  }),
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  nav.path = "/";
  nav.replaced = [];
  nav.pushed = [];
  resetTrail();
  // Everything the shell and the hub reach for. `{}` is enough: none of these assertions is about
  // what came back, and a 404 here would only add noise to the console.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/api/auth/session")
        ? { user: null }
        : url.includes("/api/me/deal-rooms/unread-count")
          ? { total: 0 }
          : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
});
afterEach(cleanup);

const shell = (user: { id: number; phone: string; tier: string } | null) =>
  render(
    <LocaleProvider initialLocale="en">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <SessionProvider initialUser={user as any}>
        <AppShell>
          <p>page</p>
        </AppShell>
      </SessionProvider>
    </LocaleProvider>,
  );

const MEMBER = { id: 7, phone: "+966501112233", tier: "basic" };

/** The desktop tab row — `AppNav`'s own `<nav>`, the only one in the tree. */
const tabRow = () => document.querySelector("nav") as HTMLElement;
const tabWords = () => [...tabRow().querySelectorAll("a")].map((a) => a.textContent);

describe("the nav row", () => {
  it("names three places, with Dashboard in the middle", () => {
    shell(MEMBER);
    expect(tabWords()).toEqual([en.shell.browse, en.shell.dashboard, en.shell.requests]);
  });

  it("keeps that order for a guest, so a tab means the same thing signed in or out", () => {
    shell(null);
    expect(tabWords()).toEqual([en.shell.browse, en.shell.dashboard, en.shell.requests]);
  });

  it("calls the requests tab «Requests», not «Marketplace»", () => {
    shell(MEMBER);
    expect(within(tabRow()).getByText("Requests").getAttribute("href")).toBe("/requests");
    expect(within(tabRow()).queryByText("Marketplace")).toBeNull();
  });

  it("no longer carries My Organization", () => {
    // The firm is part of `/profile` now, and `/company` 308s there from the edge.
    shell(MEMBER);
    expect(within(tabRow()).queryByText(en.shell.company)).toBeNull();
    expect([...tabRow().querySelectorAll("a")].map((a) => a.getAttribute("href"))).not.toContain("/company");
  });

  it("marks the product Beta, beside the wordmark and outside its link", () => {
    shell(MEMBER);
    const beta = screen.getByText(en.shell.beta);
    // Pressing the state of the product must not navigate anywhere.
    expect(beta.closest("a")).toBeNull();
    // Beside the mark, in the bar's own leading cluster, rather than somewhere on the page.
    expect(beta.closest("header")).toBeTruthy();
  });
});

describe("a guest on the dashboard", () => {
  const guestHub = () =>
    render(
      <LocaleProvider initialLocale="en">
        <SessionProvider initialUser={null}>
          <HomeHub />
        </SessionProvider>
      </LocaleProvider>,
    );

  it("LANDS on Browse when he arrived cold", async () => {
    // A bookmark, a shared link, a fresh tab: no in-app page behind him.
    recordTrail("/");
    guestHub();
    await waitFor(() => expect(nav.replaced).toEqual(["/browse"]));
    expect(screen.queryByText(en.guestWall.dashboardTitle)).toBeNull();
  });

  it("gets the guest WALL when he PRESSED the tab — the page, blurred, with the card on it", async () => {
    // Owner, 2026-09-06: *"show dashboard and requests as a blurry page with a sign-in modal at the
    // front, kind of as marketing."* The prompt used to be a bordered card alone in a column.
    recordTrail("/browse");
    recordTrail("/");
    guestHub();
    expect(await screen.findByText(en.guestWall.dashboardTitle)).toBeTruthy();
    expect(screen.getByText(en.guestWall.join)).toBeTruthy();
    // He asked for this page, so he stays on it.
    expect(nav.replaced).toEqual([]);
  });

  it("offers the same door as every other guarded page — the auth modal, not a /login route", async () => {
    recordTrail("/requests");
    recordTrail("/");
    guestHub();
    await screen.findByText(en.guestWall.dashboardTitle);
    expect(screen.getByText(en.shell.signIn)).toBeTruthy();
    // No route in that button: the prompt raises the auth modal in place.
    expect(screen.getByText(en.shell.signIn).closest("a")).toBeNull();
  });
});
