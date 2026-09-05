import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { SessionProvider } from "@/lib/session";
import { HomeNotificationBubble } from "@/components/home/HomeNotificationBubble";
import { BELL_ANCHOR_ID } from "@/components/NotificationsBell";
import type { NotificationItem } from "@/lib/contract/notifications";

/**
 * The dashboard's notification strip — one line, and a ✕ that means it.
 *
 * Two rulings, both of which fail silently (owner, 2026-09-05):
 *   · *"Thin, so it doesn't cover the create request button — shorter and more horizontal, with less
 *     lines."* A card that grows a second line covers the hero's only CTA, and no test notices.
 *   · *"When the user clicks ✕ it will not appear again, even in a new login."* A dismissal kept in
 *     `sessionStorage` looks identical on the screen and is gone by the next sign-in.
 */

const api = vi.hoisted(() => ({ rows: [] as NotificationItem[], read: [] as string[] }));
vi.mock("@/lib/api/client", () => ({
  fetchNotifications: () => Promise.resolve({ data: api.rows, page: 1, total: api.rows.length }),
  markNotificationRead: (id: string) => {
    api.read.push(id);
    return Promise.resolve({});
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const row = (over: Partial<NotificationItem> = {}): NotificationItem => ({
  id: "n1",
  type: "bid.received",
  title: "New off-platform bid",
  body: "Test submitted a bid via your public link. This supplier may not be a Moedatech member.",
  roleContext: "rentee",
  isRead: false,
  createdAt: "2026-09-05T09:00:00Z",
  data: { requestId: "r1" },
  ...over,
});

const draw = (userId = 7) =>
  render(
    <LocaleProvider initialLocale="en">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <SessionProvider initialUser={{ id: userId, phone: "+966501112233", tier: "basic" } as any}>
        <HomeNotificationBubble />
      </SessionProvider>
    </LocaleProvider>,
  );

beforeEach(() => {
  api.rows = [row()];
  api.read = [];
  localStorage.clear();
  // The strip measures the bell and hangs under it; with no anchor it never places itself.
  const bell = document.createElement("div");
  bell.id = BELL_ANCHOR_ID;
  document.body.appendChild(bell);
  // `SessionProvider` revalidates over fetch — without this the session lands on anon a tick later.
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ user: { id: 7, phone: "+966501112233", tier: "basic" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ));
});
afterEach(() => {
  cleanup();
  document.getElementById(BELL_ANCHOR_ID)?.remove();
});

describe("one line, not a card", () => {
  it("raises the newest unread row worth raising, by its title", async () => {
    draw();
    expect(await screen.findByText("New off-platform bid")).toBeTruthy();
  });

  it("states the title and NOT the body — the bell holds the sentence", async () => {
    draw();
    await screen.findByText("New off-platform bid");
    // The body was two clamped lines, and those lines are what reached the hero's CTA.
    expect(screen.queryByText(/submitted a bid via your public link/)).toBeNull();
  });

  it("keeps «+n more» inline rather than on a row of its own", async () => {
    api.rows = [row(), row({ id: "n2" }), row({ id: "n3" })];
    draw();
    const more = await screen.findByText("+2 more");
    // Same line as the title: a strip with a footer is the shape this replaced.
    expect(more.closest("div")).toBe(screen.getByText("New off-platform bid").closest("div"));
  });

  it("skips a type the bubble may not raise", async () => {
    api.rows = [row({ type: "equipment.approved", title: "Listing approved" })];
    draw();
    await waitFor(() => expect(screen.queryByText("Listing approved")).toBeNull());
  });
});

describe("✕ means it, in the next login too", () => {
  it("marks the notification READ — the only dismissal that survives a sign-out", async () => {
    draw();
    await screen.findByText("New off-platform bid");
    fireEvent.click(screen.getByLabelText("Close"));
    // The read flag is the renter's and lives server-side, and the strip only raises unread rows.
    expect(api.read).toEqual(["n1"]);
    expect(screen.queryByText("New off-platform bid")).toBeNull();
  });

  it("remembers it on this browser as well, keyed by the ACCOUNT", async () => {
    draw();
    await screen.findByText("New off-platform bid");
    fireEvent.click(screen.getByLabelText("Close"));
    // `localStorage`, not `sessionStorage`: the point is that a new login honours it.
    expect(JSON.parse(localStorage.getItem("moeda.home-bubble.dismissed.7")!)).toEqual(["n1"]);
    expect(localStorage.getItem("moeda.home-bubble.dismissed.8")).toBeNull();
  });

  it("does not come back on a later visit, even when the read call was lost", async () => {
    // The backend never got the flag — the row still arrives unread — and the strip stays away.
    localStorage.setItem("moeda.home-bubble.dismissed.7", JSON.stringify(["n1"]));
    draw();
    await waitFor(() => expect(screen.queryByText("New off-platform bid")).toBeNull());
  });

  it("still raises a NEW notification after one was dismissed", async () => {
    localStorage.setItem("moeda.home-bubble.dismissed.7", JSON.stringify(["n1"]));
    api.rows = [row({ id: "n2", title: "Bid updated" }), row()];
    draw();
    expect(await screen.findByText("Bid updated")).toBeTruthy();
  });

  it("keeps one renter's dismissal off another renter's dashboard", async () => {
    localStorage.setItem("moeda.home-bubble.dismissed.7", JSON.stringify(["n1"]));
    draw(8);
    expect(await screen.findByText("New off-platform bid")).toBeTruthy();
  });
});
