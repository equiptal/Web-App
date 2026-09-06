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

async function click(page: Page, target: Locator, beat = 900) {
  await expect(target).toBeVisible({ timeout: 25_000 });
  await moveTo(page, target);
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.up();
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
      for (const label of [/certificate/i, /minimum year/i]) {
        const control = page.getByRole("button", { name: label }).first();
        if (!(await control.count())) continue;
        await click(page, control, 700);
        const option = page.getByRole("option").first();
        if (await option.count()) await click(page, option, 700);
        else await page.keyboard.press("Escape");
      }
    });

    /* The site has to be CONFIRMED, even when a project filled it (`gate` — «Is this the right site?
       Please confirm it before you continue»). Nothing on the machine panel says so, which is why
       «Review & send» reads as enabled and then quietly does nothing: the gate scrolls to the gap
       rather than refusing the press. */
    await step("open «Where it goes» and confirm the site", async () => {
      const where = page.getByRole("button", { name: /where it goes/i }).first();
      if (await where.count()) await click(page, where, 900);
      const confirm = page.getByRole("button", { name: /confirm location|confirm/i }).first();
      if (await confirm.count()) await click(page, confirm, 1200);
      else console.log("      (no confirm control — the site may already be confirmed)");
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
