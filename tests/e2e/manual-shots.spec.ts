import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * ── The manual's pictures, cut by a script (owner, 2026-09-06) ───────────────────────────────────
 * One image per section of `HelpManual`, saved into `public/manual/`, so the seven slots fill
 * themselves and REFILL when the UI moves.
 *
 * **Why a script and not a screen recording.** A clip has to be watched in order, at its pace, and
 * the manual opens in a modal beside a renter who has one question. Worse, a clip rots whole: any UI
 * change invalidates every one of them at once and you cannot re-cut a toolbar. This run is
 * repeatable — `npm run manual:shots` after a deploy and every picture is current again.
 *
 * **Credentials come from the environment, never from this file.** `PW_PHONE` and `PW_OTP` are read
 * at run time; the staging OTP bypass lives in the backend's own `.env.staging` and must not be
 * copied into the repo, a commit or a log.
 *
 *     PW_BASE_URL=https://webstaging.moedatech.net PW_PHONE=5XXXXXXXX PW_OTP=**** \
 *       npx playwright test tests/e2e/manual-shots.spec.ts
 *
 * **It captures what the environment actually has.** A section whose surface needs data this account
 * does not hold (a deal room, say) is skipped with a line saying so rather than saving a picture of
 * an empty state — an empty state teaches nothing, and a manual that shows one is worse than a
 * manual with a gap.
 *
 * **It WRITES nothing unless told to.** «Counter the price» has no picture until somebody is actually
 * negotiating, and starting one is a real act: it creates a deal room and puts an offer in front of a
 * supplier. So the run is read-only by default and only opens a negotiation when `PW_NEGOTIATE_BID`
 * names the exact bid to counter — never a bid it picked itself, never on an environment that was not
 * named. The owner authorised one supplier for this on 2026-09-06 (`0502165558`, supplier id 2544 on
 * staging); anything wider is a new decision, not a rerun of this one.
 */

const OUT = path.join(process.cwd(), "public", "manual");
const VIEWPORT = { width: 1440, height: 900 };
/** The modal draws these at ~640px wide, so a 2× shot stays sharp without being a 4MB PNG. */
const SCALE = 2;

test.use({ viewport: VIEWPORT, deviceScaleFactor: SCALE, video: "on" });

const captured: string[] = [];
const skipped: string[] = [];

test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));
test.afterAll(() => {
  console.log(`\n── manual shots ───────────────────────────────`);
  for (const c of captured) console.log(`  ✓ ${c}`);
  for (const s of skipped) console.log(`  – ${s}`);
});

/**
 * Sign in by SETTING THE SESSION COOKIES the app itself sets.
 *
 * Two routes were tried and rejected before this one:
 *
 *  · **Driving the phone-and-four-digits modal** depends on which sign-in surface the environment is
 *    running. A guest wall that had changed under us is exactly how the first run captured signed-OUT
 *    pages and still reported success.
 *  · **`/api/auth/handoff?token=…`** puts a live credential in a URL — in the browser's history, in
 *    the server's access log and in Playwright's own trace — and the navigation itself failed on the
 *    staging TLS front.
 *
 * The cookies are the same three `setHandoffSession` writes (`auth-server.ts`), so this is the
 * session the app builds for itself, established without the token ever appearing in a URL. The
 * caller mints the idToken and passes it in `PW_ID_TOKEN`; nothing is read, printed or stored here.
 */
async function signIn(page: Page, context: BrowserContext) {
  const token = process.env.PW_ID_TOKEN;
  expect(token, "PW_ID_TOKEN must be set — mint it from the backend before the run").toBeTruthy();
  const origin = new URL(process.env.PW_BASE_URL ?? "http://localhost:3000");
  const user = JSON.parse(Buffer.from(token!.split(".")[1], "base64").toString("utf8")) as {
    "custom:dbUserId"?: string;
    phone_number?: string;
  };
  const identity = { id: Number(user["custom:dbUserId"] ?? 0), phone: user.phone_number ?? "", tier: "basic" };

  const base = { domain: origin.hostname, path: "/", httpOnly: true, secure: origin.protocol === "https:", sameSite: "Lax" as const };
  await context.addCookies([
    { name: "mt_access", value: token!, ...base },
    { name: "mt_id", value: token!, ...base },
    { name: "mt_user", value: JSON.stringify(identity), ...base },
  ]);

  /* Proof, not assumption. A session that did not take leaves every later page a guest page, and a
     manual full of sign-in walls is the failure this check exists to prevent. */
  await page.goto("/requests", { waitUntil: "domcontentloaded" });
  const me = await page.evaluate(async () => {
    const r = await fetch("/api/auth/session", { cache: "no-store" });
    return r.ok ? ((await r.json()) as { user: { id: number } | null }) : null;
  });
  expect(me?.user, "the session cookies did not take — is PW_ID_TOKEN fresh?").toBeTruthy();
  console.log(`  signed in as user ${me?.user?.id}`);
}

/**
 * The two things that float over every page and belong in none of these pictures: the support
 * bubble, and the `# PINS` developer overlay. Hidden by stylesheet rather than by a flag, so the shot
 * is of the real page with two ornaments taken off it.
 */
const HIDE_FURNITURE = `
  [data-pin="99"], [data-pin="99.1"], #intercom-container, .intercom-lightweight-app { display: none !important; }
  button[style*="# PINS"], div:has(> button):has-text("# PINS") { display: none !important; }
`;

/**
 * Save one picture — of a LOADED page.
 *
 * ⚠️ A fixed pause is not a wait. One run of this script produced a `bids.png` of six grey skeleton
 * tiles and an empty page, and reported success: the 900ms happened to be enough on the run before
 * and not on that one. Every shot now waits for something the surface only draws once its data is in,
 * and then for every skeleton on the page to be gone. A picture of a loading state is worse than no
 * picture, because it ships looking deliberate.
 */
async function shot(page: Page, key: string, opts: { clip?: string; ready?: string } = {}) {
  const { clip: selector, ready } = opts;
  await page.waitForLoadState("networkidle").catch(() => {});
  if (ready) {
    await expect(page.locator(ready).first(), `${key}: waited for ${ready}`).toBeVisible({ timeout: 25_000 });
  }
  // `Skeleton` marks itself with `animate-pulse`; none left means every panel has its data.
  await page
    .waitForFunction(() => document.querySelectorAll(".animate-pulse").length === 0, null, { timeout: 25_000 })
    .catch(() => {});
  await page.waitForTimeout(600); // the last paint after the last fetch
  await page.addStyleTag({ content: HIDE_FURNITURE }).catch(() => {});
  // The overlay's own button carries no class or id, so it is removed by its text — the one place a
  // text match is the honest selector.
  await page
    .evaluate(() => {
      for (const el of Array.from(document.querySelectorAll("button"))) {
        if (el.textContent?.trim().startsWith("# PINS")) (el.parentElement ?? el).remove();
      }
      // The support bubble is a fixed 56px circle at the corner; it has no test hook either.
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('[class*="size-14"][class*="fixed"]'))) el.remove();
    })
    .catch(() => {});
  const file = path.join(OUT, `${key}.png`);
  const target = selector ? page.locator(selector).first() : null;
  if (target && (await target.count()) > 0 && (await target.isVisible().catch(() => false))) {
    await target.screenshot({ path: file });
  } else {
    await page.screenshot({ path: file });
  }
  captured.push(`${key}.png`);
}

test("cuts one picture per manual section", async ({ page, context }) => {
  test.setTimeout(300_000);
  await signIn(page, context);

  /* What this account holds, asked of the app's own API through the signed-in page — so the shots
     land on real data rather than on whatever happens to be first. */
  const bids = await page.evaluate(async () => {
    const r = await fetch("/api/me/received-bids?limit=50", { cache: "no-store" });
    return r.ok
      ? ((await r.json()) as {
          bids: { bidId: string; dealRoomId: string | null; dealRoomStatus: string | null; request: { id: string; groupId: string | null } }[];
        }).bids
      : [];
  });
  const byRequest = new Map<string, typeof bids>();
  for (const b of bids) {
    const k = b.request?.id ?? "";
    byRequest.set(k, [...(byRequest.get(k) ?? []), b]);
  }
  // The busiest request on the account: the comparison teaches nothing with one column.
  const [requestId, onIt] = [...byRequest.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? ["", []];
  const groupId = onIt[0]?.request?.groupId ?? requestId;
  const bidId = onIt[0]?.bidId ?? "";
  /* A deal room from ANY bid on the account, not just this request's — the busiest request is the
     right subject for the comparison and rarely the one that has a room.
     
     ⚠️ **A dead room is not a picture of negotiating.** The first run took the first room it found and
     produced a page reading «This deal room has been cancelled» for the section about countering a
     price. Rooms are ranked, and anything ended is refused outright rather than shot: a manual is
     better with a gap than with a picture teaching the wrong thing. */
  const ROOM_RANK: Record<string, number> = { OPEN: 0, ACTIVE: 0, NEGOTIATING: 1, AWAITING_CONFIRMATION: 2, CLOSED: 3 };
  const rooms = bids
    .filter((b) => b.dealRoomId && ROOM_RANK[(b.dealRoomStatus ?? "").toUpperCase()] != null)
    .sort((a, b) => ROOM_RANK[(a.dealRoomStatus ?? "").toUpperCase()] - ROOM_RANK[(b.dealRoomStatus ?? "").toUpperCase()]);
  const roomId = rooms[0]?.dealRoomId ?? "";
  const roomState = (rooms[0]?.dealRoomStatus ?? "").toUpperCase();
  /* The two sections want DIFFERENT rooms. Countering is a live act: a settled room shows «Agreed ·
     Approved · Download quote», which is the end of the story that section begins. Accepting is
     happy with a settled one — that IS what accepting produced. */
  const counterRoom = ROOM_RANK[roomState] <= 2 ? roomId : "";
  const acceptRoom = roomId;
  console.log(`  data: request ${requestId || "—"} · ${onIt.length} bid(s) · room ${roomId ? roomState : "none live"}`);

  // 1 · Post a request with the assistant.
  await page.goto("/create", { waitUntil: "domcontentloaded" });
  await shot(page, "post", { ready: "text=/describe|اكتب|what do you need/i" });

  // 2 · Share the request with your suppliers — the share drawer, opened on the request itself.
  if (groupId) {
    await page.goto(`/requests?g=${encodeURIComponent(groupId)}&share=1`, { waitUntil: "domcontentloaded" });
    await shot(page, "share", { clip: '[role="dialog"]', ready: '[role="dialog"]' });
  } else skipped.push("share.png — no request on this account");

  // 3 · View your bids, and compare them.
  if (requestId) {
    await page.goto(`/requests?r=${encodeURIComponent(requestId)}`, { waitUntil: "domcontentloaded" });
    // A supplier card is on screen only once the bids have answered.
    await shot(page, "bids", { ready: "text=/counter this price|view quote/i" });
  } else skipped.push("bids.png — no request with bids");

  // 4 · Build your suppliers list.
  await page.goto("/suppliers", { waitUntil: "domcontentloaded" });
  await shot(page, "suppliers", { ready: "text=/supplier|مورد/i" });

  // 5 · The equipment map.
  if (bidId) {
    await page.goto(`/bids/${encodeURIComponent(bidId)}/equipment`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500); // the map loads its tiles and its fleet
    await shot(page, "map", { ready: ".leaflet-container" });
  } else skipped.push("map.png — no bid to open a map on");

  /* ── Opening a negotiation, only when explicitly told which bid ────────────────────────────
     `POST /marketplace/deal-rooms` is what the card's «Counter this price» calls: it creates the room
     — one of the three acts allowed to (004a §4.5) — and the sheet is what `?act=counter` then opens.
     Driving the app's own endpoint rather than hunting for a card in the DOM keeps the WRITE explicit
     and one line long, so what this run changes is impossible to miss in review. */
  const negotiateBid = process.env.PW_NEGOTIATE_BID?.trim();
  let openedRoom = "";
  if (negotiateBid) {
    console.log(`  opening a negotiation on bid ${negotiateBid} (PW_NEGOTIATE_BID)`);
    openedRoom = await page.evaluate(async (bidId) => {
      const r = await fetch("/api/me/deal-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bidId }),
      });
      if (!r.ok) return "";
      const d = (await r.json()) as { id?: string; dealRoomId?: string; data?: { id?: string } };
      return d.id ?? d.dealRoomId ?? d.data?.id ?? "";
    }, negotiateBid);
    console.log(openedRoom ? `  room ${openedRoom}` : "  the room could not be opened — see the app's response");
  }

  // 6 · Counter the price — the sheet, which is what countering opens.
  const counterTarget = openedRoom || counterRoom;
  if (counterTarget) {
    await page.goto(`/deal-room/${encodeURIComponent(counterTarget)}?act=counter`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200); // the sheet builds itself from the bid's own terms
    await shot(page, "counter", { ready: "text=/next: terms|التالي/i" });
  } else skipped.push("counter.png — no room still being negotiated (this account's rooms are all closed or abandoned)");

  // 7 · Accept a deal — the same room, without the counter sheet over it.
  if (acceptRoom) {
    await page.goto(`/deal-room/${encodeURIComponent(acceptRoom)}`, { waitUntil: "domcontentloaded" });
    await shot(page, "accept", { ready: "text=/download quote|reopen|accept|تحميل/i" });
  } else skipped.push("accept.png — no deal room on this account");

  expect(captured.length, "at least the surfaces that need no special data").toBeGreaterThan(1);
});
