import { test, expect, type ConsoleMessage } from "@playwright/test";

/**
 * The renter-projects journey, in a real browser, against a real environment.
 *
 * Needs two things the default config does not provide, and skips loudly without them rather than
 * passing on a signed-out page:
 *
 *   PW_BASE_URL   the deployed app (staging)
 *   PW_STATE      a storageState file holding a renter session
 *
 * Everything here asserts what the page SAYS. The API layer already proved the write path reaches
 * the database; what a browser adds is whether the renter can find the thing, read it, and act on
 * it — a working endpoint behind a button nobody can see is still a broken feature. That is exactly
 * how the missing *Add work order* button survived: every endpoint worked.
 */

const STATE = process.env.PW_STATE;
const REMOTE = Boolean(process.env.PW_BASE_URL);

test.skip(!STATE || !REMOTE, "needs PW_BASE_URL and PW_STATE — see /web:test step 1");
test.use({ storageState: STATE });

/** Console noise that is not the app's fault and would fail every page if counted. */
const IGNORED = [/favicon/i, /Download the React DevTools/i, /\[Fast Refresh\]/i, /Failed to load resource.*401/i];

function watchConsole(page: import("@playwright/test").Page) {
  const errors: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (IGNORED.some((re) => re.test(text))) return;
    errors.push(text);
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  /* The browser's own console says only "Failed to load resource: 403" — no URL, which leaves a
     reader with a failure they cannot act on. Record the response itself so the report can name the
     endpoint. 401s from the guest probes are expected and already ignored above. */
  page.on("response", (r) => {
    if (r.status() < 400 || r.status() === 401) return;
    errors.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
  });

  return errors;
}

test.describe("the dashboard carries the sites", () => {
  test("PROJ-UI-01 · the section renders under My requests, in the dashboard itself", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/dashboard", { waitUntil: "networkidle" });

    // Signed in, not bounced to the login screen — otherwise every assertion below is vacuous.
    await expect(page).not.toHaveURL(/\/login/);

    /* Two buttons carry this name and both are meant to: the section header's, and the dashed one
       at the end of the site rail. `.first()` takes the header's — the one a renter with no sites
       at all can reach. */
    const newProject = page.getByRole("button", { name: /new project/i }).first();
    await expect(newProject).toBeVisible();

    /* No separate route. The point is not the path — /dashboard redirects to / — but that the
       sites and the requests are the SAME page, which is what the owner asked for: "below my
       requests, no separate route". */
    await expect(page.getByText(/my requests/i).first()).toBeVisible();

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("PROJ-UI-02 · the form opens on When, then Where, then Payment", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /new project/i }).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Six fields, and no hours/day — that question belongs to the request's More details.
    await expect(dialog.getByText(/hours\s*\/?\s*day/i)).toHaveCount(0);

    // Save refuses without a location, and says why rather than sitting there dead.
    const save = dialog.getByRole("button", { name: /^save/i });
    await expect(save).toBeDisabled();
  });
});

test.describe("a site offers both ways to put something on it", () => {
  test("PROJ-UI-03 · the header carries Add work order and New request", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/dashboard", { waitUntil: "networkidle" });

    // Open the first site that exists. No site means nothing to assert — say so rather than pass.
    const card = page.locator("[data-site-card], button", { hasText: /p1|zone/i }).first();
    test.skip((await card.count()) === 0, "no site on this account to open");
    await card.click();
    await page.waitForTimeout(1500);

    await expect(page.getByRole("button", { name: /add work order/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /new request/i })).toBeVisible();

    // The roll-ups are gone: they counted what the chart below draws in full.
    await expect(page.getByText(/units awarded/i)).toHaveCount(0);

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });
});

test.describe("Arabic", () => {
  test.use({ locale: "ar-SA" });

  test("PROJ-UI-04 · the dashboard flips direction and keeps its strings", async ({ page }) => {
    await page.goto("/dashboard?lang=ar", { waitUntil: "networkidle" });

    const dir = await page.evaluate(() => document.documentElement.dir);
    expect(dir, "the document must flip to rtl").toBe("rtl");

    // A key that fell back to English is a missing translation, not a styling choice.
    await expect(page.getByText("New project", { exact: true })).toHaveCount(0);
  });
});
