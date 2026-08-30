import { test, expect } from "@playwright/test";
import { en } from "../../src/lib/i18n/en";

/**
 * The UAT script, automated (`docs/specs/007-renter-projects-uat.md`).
 *
 * Its sibling `renter-projects.spec.ts` covers the surfaces; this one walks the journey a renter
 * walks, case by case, so the cases stop being a checklist a person re-runs by hand every time.
 *
 * Copy is read from the dictionary, never pinned here. A label rename is a product decision, and a
 * test that fails over one teaches people to distrust the suite.
 *
 * Needs `PW_BASE_URL` and `PW_STATE` — see `/web:test` step 1. Skips loudly without them rather
 * than passing on a signed-out page.
 */

const STATE = process.env.PW_STATE;
test.skip(!STATE || !process.env.PW_BASE_URL, "needs PW_BASE_URL and PW_STATE");
test.use({ storageState: STATE });

const F = en.projects.form;
const S = en.projects.surface;

/** Open the New project dialog from the dashboard. */
async function openForm(page: import("@playwright/test").Page) {
  await page.goto("/", { waitUntil: "networkidle" });
  // Two buttons carry this name by design — the section header's and the rail's dashed one.
  await page.getByRole("button", { name: S.newProject }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}


/**
 * Make a site and file a request under it, through the app's own API.
 *
 * F and H need a site in a particular state, and hunting for one that happens to be in it makes the
 * case skip on most accounts — a skip that reads like coverage. `page.request` carries the same
 * session cookies as the page, so this is the renter doing it, not a back door.
 */
async function siteWithARequest(page: import("@playwright/test").Page, title: string) {
  const made = await page.request.post("/api/projects", {
    data: {
      title,
      location: { label: "Qiddiya Zone 4, Riyadh", lat: 24.7136, lng: 46.6753 },
      defaults: { rentalBasis: "MONTHLY", startDate: "2026-09-01", endDate: "2026-12-31" },
    },
  });
  expect(made.status(), await made.text()).toBe(201);
  const site = await made.json();

  const list = await page.request.get("/api/me/requests");
  const body = (await list.json()) as { requests?: { id: string }[] } | { id: string }[];
  // The route answers `{ requests: [...] }`; treating it as a bare array silently found nothing and
  // turned this case into a skip that read like coverage.
  const rows = Array.isArray(body) ? body : (body.requests ?? []);
  const filed = rows.length > 0;
  if (filed) {
    const put = await page.request.patch(`/api/me/requests/${rows[0].id}/project`, {
      data: { projectId: site.id },
    });
    expect(put.status()).toBe(200);
  }

  return { id: site.id as string, title, filed, requestId: filed ? rows[0].id : null };
}

/** Put a request back where it was, so a test run does not quietly refile the renter's work. */
async function unfile(page: import("@playwright/test").Page, requestId: string | null) {
  if (requestId) await page.request.patch(`/api/me/requests/${requestId}/project`, { data: { projectId: null } });
}

test.describe("B · Create a project", () => {
  test("B1 · the sections read When, then Where, then Payment", async ({ page }) => {
    const dialog = await openForm(page);

    /* Compared by POSITION, not by where each string falls in the dialog's text.
     *
     * "Reads in this order" is a claim about the rendered page, and the three headings are the
     * thing a renter's eye actually lands on. Matching substrings in `innerText` looked equivalent
     * and was not: it is order in the DOM, which a `flex-col-reverse` or an `order:` would happily
     * disagree with, and it goes looking for a label when the heading is what carries the section. */
    const top = async (name: string) => {
      const box = await dialog.getByRole("heading", { name, exact: false }).first().boundingBox();
      expect(box, `no "${name}" heading in the form`).not.toBeNull();
      return box!.y;
    };

    const when = await top(F.whenTitle);
    const where = await top(F.whereTitle);
    /* Matched on the word rather than a dictionary key: the Payment heading's key is in flux across
       branches right now, and the owner specified this section by what it SAYS. */
    const pay = await top("Payment");

    // The owner asked for this order specifically: when you need it, then where, then how you pay.
    expect(when, "When must come before Where").toBeLessThan(where);
    expect(where, "Where must come before Payment").toBeLessThan(pay);

    // And the four When fields sit on ONE row — the reason the section was restructured.
    const ys = await Promise.all(
      [F.start, F.end, F.extendableLabel, F.basis].map(async (l) => {
        const b = await dialog.getByText(l, { exact: true }).first().boundingBox();
        return b?.y ?? -1;
      }),
    );
    expect(Math.max(...ys) - Math.min(...ys), `the four When fields are not on one row: ${ys}`).toBeLessThan(24);
  });

  test("B2 · Save refuses without a location, and says why", async ({ page }) => {
    const dialog = await openForm(page);

    await expect(dialog.getByRole("button", { name: /^save/i })).toBeDisabled();
    /* A disabled button with no reason is the bug that was reported as "clicking save doesn't do
       anything" — the renter cannot tell a refusal from a dead control. */
    await expect(dialog.getByText(F.addressRequired)).toBeVisible();
  });

  test("B4 · a blank title says what the site will be called instead", async ({ page }) => {
    const dialog = await openForm(page);
    await dialog.getByLabel(F.address).fill("Qiddiya Zone 4, Riyadh");

    // The hint carries the fallback name, so the renter knows blank is a choice, not an omission.
    const stem = F.titleHint.split("{fallback}")[0].trim();
    await expect(dialog.getByText(new RegExp(stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeVisible();
  });

  test("B5 · a filled form saves, and B7 · Not now lands on the board", async ({ page }) => {
    const dialog = await openForm(page);
    const name = `UAT ${Date.now()}`;

    await dialog.getByLabel(F.address).fill("Qiddiya Zone 4, Riyadh");
    await dialog.getByLabel(F.title).fill(name);
    await dialog.getByLabel(F.start).fill("2026-09-01");
    await dialog.getByLabel(F.end).fill("2026-12-31");

    const save = dialog.getByRole("button", { name: /^save/i });
    await expect(save, "Save should enable once there is a location").toBeEnabled();
    await save.click();

    // B5 — the confirmation names the site.
    await expect(page.getByText(name, { exact: false }).first()).toBeVisible({ timeout: 15_000 });

    // B7 — Not now leaves you on the board with the site selected, not on an empty page.
    const later = page.getByRole("button", { name: en.projects.created.later });
    if (await later.count()) {
      await later.first().click();
      await expect(page.getByText(name, { exact: false }).first()).toBeVisible();
    }
  });
});

test.describe("C · A request, with the site", () => {
  test("C1 · the chip row names your sites", async ({ page }) => {
    await page.goto("/create", { waitUntil: "networkidle" });
    // Renders nothing at all when there are no sites — so this asserts the row, not a placeholder.
    await expect(page.getByText(en.projects.chips.label, { exact: true }).first()).toBeVisible();
  });

  test("C2 · tapping a chip takes over the strip with pills", async ({ page }) => {
    await page.goto("/create", { waitUntil: "networkidle" });

    const label = page.getByText(en.projects.chips.label, { exact: true }).first();
    await expect(label).toBeVisible();

    // The first chip after the label. Clicking it should retire the whole chip row.
    const chip = label.locator("xpath=following-sibling::button[1]");
    test.skip((await chip.count()) === 0, "no site chip to tap");
    await chip.click();

    await expect(label, "the chip row is replaced by the pills once a site is picked").toHaveCount(0);
  });

  test("C3 · a short line parses with no network round trip (Tier 0)", async ({ page }) => {
    await page.goto("/create", { waitUntil: "networkidle" });

    const agentCalls: string[] = [];
    page.on("request", (r) => {
      if (/\/api\/agent\//.test(r.url())) agentCalls.push(`${r.method()} ${r.url()}`);
    });

    const box = page.locator("textarea").first();
    await box.fill("2 forklifts");
    await box.press("Enter");
    await page.waitForTimeout(2500);

    /* The browser matcher answers this shape itself. A network call here is the regression that was
       reported as "I wrote 2 forklifts only and it is still slow". */
    expect(agentCalls, `agent was called:\n${agentCalls.join("\n")}`).toEqual([]);
  });
});

test.describe("F · Edit the project, and what it reaches", () => {
  test("F1–F3 · the propagation list states each row's cost, and pre-ticks only the free ones", async ({ page }) => {
    const site = await siteWithARequest(page, `UAT propagate ${Date.now()}`);
    test.skip(!site.filed, "this account has no request to file under a site");

    await page.goto("/", { waitUntil: "networkidle" });

    // Open THIS site, not whichever happens to be first.
    await page.getByText(site.title, { exact: false }).first().click();
    await page.waitForTimeout(1200);
    /* `exact` matters: the requests list above carries "Edit request" buttons, and a substring
       match on "Edit" picks one of those and opens the wrong editor entirely. */
    await page.getByRole("button", { name: en.common.edit, exact: true }).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // F1 — the list appears, and says plainly that nothing moves unless it is ticked.
    await expect(dialog.getByText(F.applyTitle)).toBeVisible();
    await expect(dialog.getByText(F.applyNote)).toBeVisible();

    /* F3 — nothing is ticked by surprise. A request carrying bids has ONE edit left, and ticking it
       spends that edit, so it is offered and never assumed. */
    for (const box of await dialog.locator('input[type="checkbox"]:checked').all()) {
      const row = box.locator("xpath=ancestor::*[self::li or self::label][1]");
      const text = (await row.innerText()).replace(/\s+/g, " ");
      expect(
        text.includes(F.stateFree) || text.includes(F.stateWorkOrder),
        `pre-ticked a row that costs an edit: ${text}`,
      ).toBe(true);
    }

    // F6 — a row whose one edit is already spent cannot be ticked at all.
    const spent = dialog.getByText(F.stateUsed);
    if (await spent.count()) {
      const box = spent.first().locator("xpath=ancestor::*[self::li or self::label][1]//input[@type='checkbox']");
      await expect(box).toBeDisabled();
    }

    await unfile(page, site.requestId);
  });
});

test.describe("H · Delete", () => {
  /* Marked `fixme`, not skipped, so it reports as owed work rather than as coverage.
   *
   * Two reasons, and the first is the honest one: the fix for the 204 fault (`e2bc63b`) is not
   * deployed, so this case cannot pass on staging today whatever the test does — the relay still
   * turns a successful delete into `upstream_unreachable`. The delete itself is already proven at
   * the API layer (204, and the row is gone); what is unproven is that the UI stops lying about it.
   *
   * Second, the confirm control needs a locator I have not pinned down: the trigger in the edit form
   * and the button inside the confirm panel carry the same accessible name, and the panel is not a
   * `role="dialog"`. Worth ten minutes once there is a deploy that can actually go green. */
  test.fixme("H2 · deleting an empty site succeeds without claiming the server is unreachable", async ({ page }) => {
    /* The 204 fault: the row WAS removed and the renter was told the server could not be reached,
       because `NextResponse.json` throws when handed a body at 204 and the throw was caught as a
       dead upstream. Asserted on the status the browser saw, not on the page settling — the page
       settles either way, which is exactly why this went unnoticed. */
    const seen: string[] = [];
    page.on("response", (r) => {
      if (r.request().method() === "DELETE" && /\/api\/projects\//.test(r.url())) {
        seen.push(`${r.status()} ${r.url()}`);
      }
    });

    const title = `UAT delete ${Date.now()}`;
    const made = await page.request.post("/api/projects", {
      data: { title, location: { label: "Qiddiya Zone 4, Riyadh", lat: 24.7136, lng: 46.6753 } },
    });
    expect(made.status()).toBe(201);
    const site = await made.json();

    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByText(title, { exact: false }).first().click();
    await page.waitForTimeout(1000);
    /* `exact` matters: the requests list above carries "Edit request" buttons, and a substring
       match on "Edit" picks one of those and opens the wrong editor entirely. */
    await page.getByRole("button", { name: en.common.edit, exact: true }).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // An empty site offers the plain action; one with rows offers an explanation instead.
    /* Prove the dialog is THIS site before reading the delete copy. The entry says "Delete project"
       for an empty one and "This project is in use" for one with rows, so opening the wrong site
       gives a confusing failure about the wrong thing. */
    await expect(dialog.getByLabel(F.title)).toHaveValue(title);

    const del = dialog.getByText(en.projects.del.confirmAction).first();
    await expect(del, "an empty site should offer delete, not an explanation").toBeVisible();
    await del.click();

    /* The confirm panel is a second dialog, opened by the click above. Probing it with `count()`
       races its render and silently skips the confirm — which is why the first run reported that no
       DELETE was ever sent. Wait for it. */
    const panel = page.getByText(en.projects.del.confirmTitle);
    await expect(panel).toBeVisible();

    /* Scoped to the confirm dialog. The trigger in the edit form carries the SAME accessible name,
       so an unscoped match can click the thing that opened this panel instead of the one inside it. */
    await page
      .getByRole("dialog")
      .filter({ hasText: en.projects.del.confirmTitle })
      .getByRole("button", { name: en.projects.del.confirmAction, exact: true })
      .click();
    await page.waitForTimeout(3000);

    expect(seen.length, "no DELETE was sent").toBeGreaterThan(0);
    expect(seen.filter((s) => !/^2\d\d /.test(s)), `delete did not answer 2xx:\n${seen.join("\n")}`).toEqual([]);

    // Whatever the UI said, the row must actually be gone.
    const after = await page.request.get(`/api/projects/${site.id}`);
    expect([404, 403]).toContain(after.status());
  });
});

test.describe("J · Language", () => {
  test.use({ locale: "ar-SA" });

  test("J2 · the chart mirrors, and the board keeps its Arabic", async ({ page }) => {
    await page.goto("/?lang=ar", { waitUntil: "networkidle" });

    expect(await page.evaluate(() => document.documentElement.dir)).toBe("rtl");
    // A key that fell back to English is a missing translation, not a styling choice.
    await expect(page.getByText(S.newProject, { exact: true })).toHaveCount(0);
    await expect(page.getByText(en.projects.board.whatIsHere, { exact: true })).toHaveCount(0);
  });
});
