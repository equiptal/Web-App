import { test, expect, type Browser, type BrowserContext, type Page, type Locator } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * ── The manual's CLIPS (owner, 2026-09-06) ───────────────────────────────────────────────────────
 * One short silent recording per section of `HelpManual`, showing a pointer doing the thing the
 * section describes. The stills say what a screen IS; these say what you DO on it.
 *
 * **The cursor is ours.** Headless Chromium draws no pointer, which is why the first recording looked
 * like pages teleporting. `CURSOR` injects a dot that follows Playwright's synthetic mouse and pulses
 * on a press, so a viewer can see where the click landed.
 *
 * **One context per clip.** Playwright writes a video when its context closes, so each section gets
 * its own context, its own video file, and its own failure — a section that cannot be recorded does
 * not take the others with it.
 *
 * **Deliberately slow.** Every move takes 25 steps and every act is followed by a beat. A clip that
 * moves at machine speed is unreadable, and the whole point is that a renter can follow it.
 *
 * ⚠️ **These WRITE.** Section 1 posts a real request; 2 sends a real e-mail; 5 sends an availability
 * ask; 6 sends a counter; 7 accepts a deal. The owner authorised each on 2026-09-06, against staging,
 * with one named supplier (`0502165558`, id 2544). Anything wider is a new decision.
 */

const OUT = path.join(process.cwd(), "public", "manual", "clips");
const RAW = path.join(process.cwd(), "test-results", "clips-raw");
const VIEWPORT = { width: 1440, height: 900 };

/** The drawn pointer: a ring that follows the mouse, and flashes when a button goes down. */
const CURSOR = `
  (() => {
    const dot = document.createElement("div");
    dot.id = "__cursor";
    dot.style.cssText = [
      "position:fixed","z-index:2147483647","left:0","top:0","width:22px","height:22px",
      "margin:-11px 0 0 -11px","border-radius:999px","pointer-events:none",
      "border:2px solid rgba(20,30,48,.9)","background:rgba(255,255,255,.55)",
      "box-shadow:0 1px 6px rgba(0,0,0,.35)","transition:transform .08s ease",
    ].join(";");
    const ring = document.createElement("div");
    ring.style.cssText = "position:absolute;inset:-8px;border-radius:999px;border:2px solid rgba(232,137,12,.9);opacity:0;transition:opacity .2s,transform .25s";
    dot.appendChild(ring);
    const mount = () => document.body && !document.getElementById("__cursor") && document.body.appendChild(dot);
    document.addEventListener("DOMContentLoaded", mount);
    mount();
    addEventListener("mousemove", (e) => { mount(); dot.style.transform = \`translate(\${e.clientX}px, \${e.clientY}px)\`; }, true);
    addEventListener("mousedown", () => { ring.style.opacity = "1"; ring.style.transform = "scale(1.6)"; }, true);
    addEventListener("mouseup", () => { ring.style.opacity = "0"; ring.style.transform = "scale(1)"; }, true);
  })();
`;

/** The session, set the way `setHandoffSession` sets it (see `manual-shots.spec.ts` for the why). */
async function newClip(browser: Browser, key: string): Promise<{ context: BrowserContext; page: Page }> {
  const token = process.env.PW_ID_TOKEN;
  expect(token, "PW_ID_TOKEN must be set").toBeTruthy();
  const origin = new URL(process.env.PW_BASE_URL ?? "http://localhost:3000");
  const claims = JSON.parse(Buffer.from(token!.split(".")[1], "base64").toString("utf8")) as Record<string, string>;

  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: path.join(RAW, key), size: VIEWPORT },
    baseURL: origin.origin,
  });
  const base = { domain: origin.hostname, path: "/", httpOnly: true, secure: origin.protocol === "https:", sameSite: "Lax" as const };
  await context.addCookies([
    { name: "mt_access", value: token!, ...base },
    { name: "mt_id", value: token!, ...base },
    { name: "mt_user", value: JSON.stringify({ id: Number(claims["custom:dbUserId"] ?? 0), phone: claims.phone_number ?? "", tier: "basic" }), ...base },
  ]);
  await context.addInitScript(CURSOR);
  const page = await context.newPage();
  return { context, page };
}

/** Close the context (which writes the video) and file it under its section's name. */
async function saveClip(context: BrowserContext, page: Page, key: string) {
  const video = page.video();
  await context.close();
  if (!video) return;
  fs.mkdirSync(OUT, { recursive: true });
  await video.saveAs(path.join(OUT, `${key}.webm`));
  console.log(`  ✓ clips/${key}.webm`);
}

/* ── The gestures ──────────────────────────────────────────────────────────────────────────────
   Every one of these MOVES the pointer first and pauses after, because the clip is for a person. */

async function moveTo(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded().catch(() => {});
  const box = await target.boundingBox();
  expect(box, "the pointer needs a box to move to").toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 25 });
  await page.waitForTimeout(300);
}

/**
 * Move the pointer for the camera, then press the ELEMENT.
 *
 * ⚠️ It used to press the coordinates — `mouse.down()` where the pointer had arrived — and that is a
 * press on whatever is topmost at that point. On a canvas with a sticky footer the choice rows sit
 * under the bar, so the billing basis was clicked five runs in a row and never answered, and the gate
 * kept reporting it missing. `locator.click()` waits for the element to be actionable and presses IT.
 * The cursor still glides there first, which is all the clip needs from the mouse.
 */
async function click(page: Page, target: Locator, beat = 900) {
  await expect(target).toBeVisible({ timeout: 25_000 });
  await moveTo(page, target);
  await target.click({ timeout: 15_000 }).catch(async () => {
    // Covered by something the page draws over it: press it where it stands.
    await target.click({ force: true, timeout: 5_000 }).catch(() => {});
  });
  await page.waitForTimeout(beat);
}

async function type(page: Page, target: Locator, text: string) {
  await click(page, target, 250);
  // `locator.type` is deprecated and re-runs actionability per key; the focus is already ours.
  await page.keyboard.type(text, { delay: 45 });
  await page.waitForTimeout(700);
}

/** Hold still on something, so the eye can land before the clip moves on. */
async function beat(page: Page, ms = 1400) {
  await page.waitForTimeout(ms);
}

/** A named step: the log is what turns a ten-minute hang into a one-line diagnosis. */
async function step(name: string, run: () => Promise<void>) {
  const t0 = Date.now();
  console.log(`    → ${name}`);
  await run();
  console.log(`      ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

test.describe.configure({ mode: "serial" });

test("1+2 · post a request with the assistant, then share it", async ({ browser }) => {
  // Two minutes is the honest ceiling for one clip; past that something is waiting on a selector
  // that will never appear, and the run should say so rather than hold the terminal.
  test.setTimeout(120_000);
  const { context, page } = await newClip(browser, "post");
  try {
    await step("open /create", async () => {
      await page.goto("/create?new=1", { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await beat(page, 1200);
    });

    /* The project first: its site and dates carry into the request, which is why the section tells
       a renter to pick one. On this account it is «TEST Qiddiya» (owner, 2026-09-06: «test»). */
    await step("pick the project", async () => {
      const chip = page.getByRole("button", { name: /test/i }).first();
      if (await chip.count()) await click(page, chip, 1200);
      else console.log("      (no «test» chip on this account — carrying on without it)");
    });

    await step("describe the machine", async () => {
      const box = page.locator("textarea").first();
      await type(page, box, "spider lift 58 m");
      await beat(page);
    });

    await step("continue", async () => {
      await click(page, page.getByRole("button", { name: /^continue$/i }).first(), 2500);
      await page.waitForLoadState("networkidle").catch(() => {});
      await beat(page, 1800);
    });

    /* ── The machine's own answers ─────────────────────────────────────────────────────────────
       ⚠️ **The project does NOT fill these.** It carries the site, the dates and the hours; the
       transport sides and the operator belong to the MACHINE, and the canvas will not advance until
       they are answered — «Next» simply does nothing, which is what made the first three cuts of this
       clip walk in place for twenty seconds and then report that the send button was missing.

       Each of these is a pair of buttons, «Supplier» and «Me», in the order the panel lists them:
       delivery, return, then fuel. The clip answers the two starred ones the way a renter usually
       does — the supplier brings it and takes it back — and leaves fuel as the request had it. */
    await step("answer the transport sides", async () => {
      const supplierButtons = page.getByRole("button", { name: /^supplier$/i });
      for (const i of [0, 1]) {
        const b = supplierButtons.nth(i);
        if (await b.count()) await click(page, b, 700);
      }
    });

    await step("answer the operator question", async () => {
      /* «Do you want an operator with this equipment?» is a SWITCH (`Toggle` → `role="switch"`), not
         a Yes/No pair — which is why looking for a button named «No» found nothing at all. It is on
         by default, and while it is on the panel also demands who covers the operator's food and his
         accommodation, so the canvas will not advance. Turning it off answers all three at once and
         keeps the clip to the machine, which is what this section is about. */
      const toggle = page.getByRole("switch").first();
      if (!(await toggle.count())) {
        console.log("      (no operator switch on screen)");
        return;
      }
      if ((await toggle.getAttribute("aria-checked")) === "true") await click(page, toggle, 900);
    });

    /* ── The two unstarred answers the gate still wants ────────────────────────────────────────
       `itemWebGaps` requires a MINIMUM YEAR and a CERTIFICATE answer — «gate.yearMissing» and
       «gate.certMissing» — and an answer of "none" only counts once the field has been TOUCHED. On
       screen neither carries a star, so «Review & send» looks enabled and then silently shakes a
       panel instead of advancing. That is what stopped four cuts of this clip.
       
       ⚠️ Worth a product look, not just a script workaround: a required field that shows no star and
       fails a press without saying why is the same trap that took four attempts here. */
    await step("answer the year and the certificate", async () => {
      /* Two different controls, and reaching for both as `button` is why the earlier cuts answered
         neither: `CertSelect` IS a button (`aria-label="CERTIFICATE"`), but the year is a
         `SearchSelect`, which is the house `Dropdown` — a COMBOBOX. A `getByRole("button")` for it
         matches nothing, silently, and the gate keeps holding.

         Both answers are the explicit "none": «No certificate» and «Any year». That is what the gate
         wants — a decision, not a value — and it is the honest thing for a spider lift the renter
         described in four words. */
      const cert = page.getByRole("button", { name: /^certificate$/i }).first();
      if (await cert.count()) {
        await click(page, cert, 600);
        await click(page, page.getByRole("option", { name: /no certificate/i }).first(), 700);
      }

      const year = page.getByRole("combobox", { name: /minimum year/i }).first();
      if (await year.count()) {
        await click(page, year, 600);
        await click(page, page.getByRole("option", { name: /any year/i }).first(), 700);
      }
    });

    /* The site has to be CONFIRMED, even when a project filled it (`gate` — «Is this the right site?
       Please confirm it before you continue»). Nothing on the machine panel says so, which is why
       «Review & send» reads as enabled and then quietly does nothing: the gate scrolls to the gap
       rather than refusing the press. */
    await step("open «Where it goes» and confirm the site", async () => {
      const where = page.getByRole("button", { name: /where it goes/i }).first();
      if (await where.count()) await click(page, where, 900);
      /* The control says «This is the right spot», not «Confirm» — `confirmAction` in the dictionary
         is a different string that this panel does not use. Matching on the word «confirm» found
         nothing and the gate went on holding, with `* Required` on a panel the clip had just opened. */
      const confirm = page.getByRole("button", { name: /this is the right spot|confirm location/i }).first();
      if (await confirm.count()) await click(page, confirm, 1200);
      else console.log("      (no confirm control — the site may already be confirmed)");
    });

    /* One more of the same shape, on the schedule: «HOW YOU'RE BILLED*» reads «Monthly» in the
       panel's own summary, and the gate still wants it PRESSED. A value the project carried is not
       yet the renter's answer. */
    await step("open «When it runs», pick the billing, tick the days", async () => {
      /* ⚠️ Order and STATE both matter here, and getting either wrong costs a run:
         · the panel header is a toggle — pressing it on an already-open panel shuts it;
         · the acknowledgement only EXISTS once a basis is chosen (there is nothing to acknowledge
           without one), so it must be looked for after the press, not before;
         · a blocked «Review & send» collapses the panels again, so a later pass has to reopen. */
      const monthly = () => page.getByRole("button", { name: /^monthly$/i });
      if (!(await monthly().count())) {
        const when = page.getByRole("button", { name: /when it runs/i }).first();
        if (await when.count()) await click(page, when, 900);
      }
      if (await monthly().count()) await click(page, monthly().first(), 900);

      const ack = page.locator('input[type="checkbox"]').first();
      if (await ack.count()) {
        /* The pointer goes to the LABEL (that is what a renter aims at, and what the camera should
           show), and the state is set on the input itself with `check`, which does not care that the
           box is a 16px target under a sticky bar. A plain click on the input reported «false»
           afterwards — pressed, and not ticked. */
        // No `label` lookup here: `locator("label", { has: … })` on a page-level locator resolves
        // slowly enough to eat the whole test budget, and the pointer has one job — be near the tick.
        await moveTo(page, ack).catch(() => {});
        await ack.check({ force: true, timeout: 8_000 }).catch(() => {});
        await page.waitForTimeout(700);
        console.log(`      charged days acknowledged: ${await ack.isChecked().catch(() => false)}`);
      } else {
        console.log("      (the acknowledgement is not on screen — the basis may not have taken)");
      }
    });

    /* ── Through the canvas ────────────────────────────────────────────────────────────────────
       Driven by the CTA the screen itself offers, so a panel that appears or disappears between
       builds changes how many presses it takes and nothing else. It stops the moment «Ready to
       send» is on screen — or the moment a press stops moving anything, which means a gap this
       script has not been taught to answer. */
    await step("walk the canvas to Ready to send", async () => {
      const ready = page.getByText(/ready to send/i).first();
      let lastHeading = "";
      for (let i = 0; i < 8; i++) {
        if (await ready.isVisible().catch(() => false)) break;
        const heading = (await page.locator("h1,h2,h3").allInnerTexts().catch(() => [])).slice(0, 2).join(" / ");
        if (heading && heading === lastHeading) {
          console.log(`      stuck on «${heading}» — a required answer is missing; the clip stops here`);
          break;
        }
        lastHeading = heading;
        /* ⚠️ `filter({ hasNot: page.locator("[disabled]") })` was here, and `hasNot` takes a
           PAGE-WIDE locator, not a check on the button: one disabled control anywhere on the screen
           filtered out every candidate. That is why the first cut walked no panels at all and then
           reported the send control missing. Ask the button itself whether it is enabled.

           The name is the ACCESSIBLE name — «Next», «Review & Send» — not the inner text, which also
           carries the material ligature («Next arrow_forward»). */
        /* «Review & send» FIRST, and «Next» only as a fallback. The canvas is one page — the machine,
           the site and the schedule stacked, with «Review & send» at its foot — not a wizard. «Next»
           steps WITHIN the machine (to the operator), so once the operator is off it does nothing at
           all, and a loop that reached for it first pressed a dead button eight times and concluded a
           required answer was missing. */
        const cta = (await page.getByRole("button", { name: /review & send/i }).count())
          ? page.getByRole("button", { name: /review & send/i }).first()
          : page.getByRole("button", { name: /^(next|continue)$/i }).first();
        if (!(await cta.count()) || !(await cta.isEnabled().catch(() => false))) break;
        await click(page, cta, 900);
        await page.waitForTimeout(400);
      }
      /* If it did not land, say WHY in the log rather than in another debugging session: every field
         the canvas has marked «Required», by its own label. */
      if (!(await ready.isVisible().catch(() => false))) {
        const owed = await page.evaluate(() => {
          const out: string[] = [];
          for (const el of Array.from(document.querySelectorAll("*"))) {
            if (el.children.length || !/Required/.test(el.textContent ?? "")) continue;
            const field = el.closest("div");
            const label = field?.querySelector("span,label")?.textContent?.replace(/\s+/g, " ").trim();
            if (label) out.push(label.slice(0, 60));
          }
          return [...new Set(out)];
        });
        console.log(`      still owed: ${owed.join(" · ") || "(nothing marked — the gate is elsewhere)"}`);
        const where = await page.evaluate(() => ({
          url: location.pathname + location.search,
          heads: Array.from(document.querySelectorAll("h1,h2")).map((h) => (h.textContent ?? "").trim()).slice(0, 4),
          ctas: Array.from(document.querySelectorAll("button")).map((b) => (b.textContent ?? "").replace(/\s+/g, " ").trim()).filter((t) => /send|review/i.test(t)).slice(0, 4),
          tail: (document.body.innerText || "").replace(/\s+/g, " ").slice(-260),
        }));
        console.log(`      at ${where.url} | heads: ${where.heads.join(" / ")} | ctas: ${where.ctas.join(" | ")}`);
        console.log(`      tail: ${where.tail}`);
      }
      await beat(page, 1500);
    });

    /* ⚠️ THE WRITE, and it is opt-in. Pressing this posts a real request to staging's suppliers.
       The owner authorised it («yes fine on staging»), but a script that sends every time it is run
       sends every time somebody re-runs it to fix a timing bug — which is three sends so far today.
       `PW_SEND=1` is the switch; without it the clip ends ON the send button, which is also the
       better last frame for the manual. */
    await step("the send", async () => {
      const send = page.getByRole("button", { name: /send to suppliers|send request/i }).first();
      if (!(await send.count())) {
        console.log("      (never reached Ready to send — nothing was posted)");
        return;
      }
      await moveTo(page, send);
      await beat(page, 1200);
      if (process.env.PW_SEND === "1") {
        console.log("      PW_SEND=1 — posting the request");
        await click(page, send, 3000);
        await page.waitForLoadState("networkidle").catch(() => {});
      } else {
        console.log("      the clip stops on the send button (set PW_SEND=1 to post)");
      }
      await beat(page, 2500);
    });
  } finally {
    await saveClip(context, page, "post");
  }
});

/** What this account holds, asked of the app's own API through a signed-in page. */
async function findData(page: Page) {
  const bids = await page.evaluate(async () => {
    const r = await fetch("/api/me/received-bids?limit=100", { cache: "no-store" });
    return r.ok
      ? ((await r.json()) as {
          bids: { bidId: string; dealRoomId: string | null; dealRoomStatus: string | null; supplierName: string; request: { id: string; groupId: string | null } }[];
        }).bids
      : [];
  });
  const byRequest = new Map<string, typeof bids>();
  for (const b of bids) byRequest.set(b.request?.id ?? "", [...(byRequest.get(b.request?.id ?? "") ?? []), b]);
  const [requestId, onIt] = [...byRequest.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? ["", []];
  return { bids, requestId, onIt, bidId: onIt[0]?.bidId ?? "" };
}

test("3 · view the bids, then compare them", async ({ browser }) => {
  test.setTimeout(180_000);
  const { context, page } = await newClip(browser, "bids");
  try {
    await page.goto("/requests", { waitUntil: "domcontentloaded" });
    const { requestId } = await findData(page);
    await step("open the request with the most offers", async () => {
      await page.goto(`/requests?r=${encodeURIComponent(requestId)}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByText(/counter this price|view quote/i).first()).toBeVisible({ timeout: 25_000 });
      await beat(page, 2000);
    });
    await step("switch to Compare", async () => {
      await click(page, page.getByRole("button", { name: /^compare$/i }).first(), 2000);
    });
    /* The two rails, in the order the owner reads them: what it comes to, then what they agreed to.
       Each opens alone, which is the behaviour the section is describing. */
    await step("open the grand total", async () => {
      await click(page, page.getByText(/^grand total$/i).first(), 2200);
    });
    await step("open the terms", async () => {
      await click(page, page.getByText(/^terms$/i).first(), 2400);
    });
  } finally {
    await saveClip(context, page, "bids");
  }
});

test("4 · build a suppliers group", async ({ browser }) => {
  test.setTimeout(180_000);
  const { context, page } = await newClip(browser, "suppliers");
  try {
    await step("open My Suppliers", async () => {
      await page.goto("/suppliers", { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await beat(page, 1500);
    });
    /* ⚠️ A WRITE: this creates a group on the account (owner-authorised, staging). The name is the
       owner's own — «Cranes». */
    await step("create the group «Cranes»", async () => {
      const create = page.getByRole("button", { name: /create group|new group/i }).first();
      if (!(await create.count())) {
        console.log("      (no group control on this page)");
        return;
      }
      await click(page, create, 900);
      const name = page.getByPlaceholder(/earthmoving|group/i).or(page.locator('input[type="text"]')).first();
      if (await name.count()) await type(page, name, "Cranes");
      /* Its members are ticked in the same sheet: the first supplier row is enough to show what a
         group IS without turning the clip into a data-entry session. */
      const firstRow = page.getByRole("checkbox").first();
      if (await firstRow.count()) await click(page, firstRow, 700);
      const confirm = page.getByRole("button", { name: /create|save|done/i }).last();
      if (await confirm.count()) await click(page, confirm, 2200);
    });
    await beat(page, 2000);
  } finally {
    await saveClip(context, page, "suppliers");
  }
});

test("5 · the equipment map, and the papers behind it", async ({ browser }) => {
  test.setTimeout(240_000);
  const { context, page } = await newClip(browser, "map");
  try {
    await page.goto("/requests", { waitUntil: "domcontentloaded" });
    const { requestId, onIt } = await findData(page);
    /* The owner's supplier for this: `0502165558`, «Murad alabdullah» — the only account authorised
       for a send in these clips. */
    const target = onIt.find((b) => /murad/i.test(b.supplierName)) ?? onIt[0];

    await step("open the bid card's equipment & docs", async () => {
      await page.goto(`/requests?r=${encodeURIComponent(requestId)}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByText(/equipment & docs/i).first()).toBeVisible({ timeout: 25_000 });
      await beat(page, 1400);
      await click(page, page.getByText(/equipment & docs/i).first(), 1800);
    });

    await step("open the map for that supplier", async () => {
      await page.goto(`/bids/${encodeURIComponent(target?.bidId ?? "")}/equipment`, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".leaflet-container").first()).toBeVisible({ timeout: 30_000 });
      await beat(page, 2500);
    });

    await step("press a red distance and read what it means", async () => {
      const red = page.locator(".bm-eq-yard, [class*='bm-eq-km']").first();
      if (await red.count()) await click(page, red, 2200);
      else console.log("      (no unconfirmed distance on this offer)");
    });

    /* ⚠️ A WRITE when `PW_SEND=1`: it puts an availability question in the conversation with the
       supplier. Authorised for this one supplier only. */
    await step("ask him to confirm availability", async () => {
      const ask = page.getByRole("button", { name: /ask the supplier|اسأل/i }).first();
      if (!(await ask.count())) {
        console.log("      (no ask control on screen)");
        return;
      }
      await moveTo(page, ask);
      await beat(page, 1000);
      if (process.env.PW_SEND === "1") await click(page, ask, 2500);
      else console.log("      the clip stops on «Ask the supplier» (set PW_SEND=1 to send)");
    });

    await step("open the documents", async () => {
      const docs = page.getByRole("button", { name: /company documents|documents/i }).first();
      if (await docs.count()) await click(page, docs, 2400);
      await beat(page, 1800);
    });
  } finally {
    await saveClip(context, page, "map");
  }
});

test("6 · counter the price", async ({ browser }) => {
  test.setTimeout(240_000);
  const { context, page } = await newClip(browser, "counter");
  try {
    await page.goto("/requests", { waitUntil: "domcontentloaded" });
    const { requestId, onIt } = await findData(page);
    const target = onIt.find((b) => /murad/i.test(b.supplierName)) ?? onIt[0];

    await step("press «Counter this price» on the card", async () => {
      await page.goto(`/requests?r=${encodeURIComponent(requestId)}`, { waitUntil: "domcontentloaded" });
      const counter = page.getByRole("button", { name: /counter this price/i }).first();
      await expect(counter).toBeVisible({ timeout: 25_000 });
      await beat(page, 1200);
      await click(page, counter, 3000);
      await page.waitForLoadState("networkidle").catch(() => {});
    });

    await step("name a lower price", async () => {
      // The sheet's own price cell — the first editable amount on the quotation.
      const price = page.locator('input[inputmode="numeric"], input[type="number"]').first();
      if (await price.count()) {
        await click(page, price, 400);
        await page.keyboard.press("Control+A");
        await page.keyboard.type("14000", { delay: 60 });
        await beat(page, 1200);
      } else console.log("      (no editable price on the sheet)");
    });

    await step("walk to the terms and the review", async () => {
      for (const name of [/next: terms/i, /next: review|review/i]) {
        const cta = page.getByRole("button", { name }).first();
        if (await cta.count()) await click(page, cta, 1800);
      }
    });

    /* ⚠️ THE WRITE: this sends the counter to the supplier. `PW_SEND=1` only. */
    await step("send the counter", async () => {
      const send = page.getByRole("button", { name: /^send|send counter|send offer/i }).first();
      if (!(await send.count())) {
        console.log("      (no send control on the sheet)");
        return;
      }
      await moveTo(page, send);
      await beat(page, 1200);
      if (process.env.PW_SEND === "1") await click(page, send, 3000);
      else console.log("      the clip stops on the send button (set PW_SEND=1 to send)");
    });
  } finally {
    await saveClip(context, page, "counter");
  }
});

test("7 · accept the deal, and take the quotation", async ({ browser }) => {
  test.setTimeout(240_000);
  const { context, page } = await newClip(browser, "accept");
  try {
    await page.goto("/requests", { waitUntil: "domcontentloaded" });
    const { bids } = await findData(page);
    /* A room that is still open if there is one; otherwise the settled room, which at least shows
       what accepting produces — the quotation, and the download beside it. */
    const rank: Record<string, number> = { OPEN: 0, ACTIVE: 0, NEGOTIATING: 1, AWAITING_CONFIRMATION: 2, CLOSED: 3 };
    const room = bids
      .filter((b) => b.dealRoomId && rank[(b.dealRoomStatus ?? "").toUpperCase()] != null)
      .sort((a, b) => rank[(a.dealRoomStatus ?? "").toUpperCase()] - rank[(b.dealRoomStatus ?? "").toUpperCase()])[0];
    if (!room) {
      console.log("      (no deal room on this account)");
      return;
    }

    await step("open the deal room", async () => {
      await page.goto(`/deal-room/${encodeURIComponent(room.dealRoomId!)}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await beat(page, 2200);
    });

    /* ⚠️ THE WRITE: accepting binds the renter to the supplier's terms. `PW_SEND=1` only. */
    await step("accept", async () => {
      const accept = page.getByRole("button", { name: /^accept|accept deal|قبول/i }).first();
      if (!(await accept.count())) {
        console.log("      (nothing to accept — this room is already settled)");
        return;
      }
      await moveTo(page, accept);
      await beat(page, 1200);
      if (process.env.PW_SEND === "1") await click(page, accept, 3000);
      else console.log("      the clip stops on «Accept» (set PW_SEND=1 to accept)");
    });

    await step("the quotation", async () => {
      const quote = page.getByRole("button", { name: /download quote|final quotation|quotation/i }).first();
      if (await quote.count()) {
        await moveTo(page, quote);
        await beat(page, 1800);
      } else console.log("      (no quotation control on this room)");
    });
  } finally {
    await saveClip(context, page, "accept");
  }
});
