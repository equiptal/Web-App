import { test, expect, type ConsoleMessage } from "@playwright/test";

/**
 * The surfaces a signed-out visitor reaches.
 *
 * Deliberately narrow. Auth has no local mock, so anything behind a session belongs to a real
 * environment and a session strategy — see `playwright.config.ts`. What is here is what a laptop and a
 * CI box can prove on their own, which is also the part of the app the outside world can see without
 * being invited.
 *
 * Every spec asserts what the page *says*, not that it responded. An error boundary and an empty state
 * both return 200, and both look like a healthy deploy from the network tab.
 */

/** Console noise that is not the app's fault and would fail every page if counted. */
const IGNORED = [
  /favicon/i,
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  // Next's dev overlay and HMR client chatter.
  /webpack-hmr/i,
];

/** Collect real console errors for the life of a page. */
function watchConsole(page: import("@playwright/test").Page): string[] {
  const errors: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (IGNORED.some((re) => re.test(text))) return;
    errors.push(text);
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

test.describe("the home hub, signed out", () => {
  test("paints real content rather than a redirect to sign-in", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/");

    // The public-web flag makes the site browsable without an account. If this ever redirects, the
    // guest surface has been switched off — which is a product decision, not a test failure to hide.
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("body")).not.toBeEmpty();

    // Something the renter can act on has to be on the page. A shell that renders its chrome and no
    // content passes a naive "did it load" check and is useless to a visitor.
    await expect(page.getByRole("button").or(page.getByRole("link")).first()).toBeVisible();

    expect(errors, `console errors on /:\n${errors.join("\n")}`).toEqual([]);
  });

  test("sets the document direction from the locale", async ({ page }, testInfo) => {
    await page.goto("/");
    const dir = await page.locator("html").getAttribute("dir");
    const lang = await page.locator("html").getAttribute("lang");
    if (testInfo.project.name === "ar") {
      // The whole app mirrors. A page that stays LTR under an Arabic locale is broken for most users.
      expect(dir === "rtl" || lang?.startsWith("ar"), `expected RTL, got dir=${dir} lang=${lang}`).toBe(true);
    } else {
      expect(dir === null || dir === "ltr").toBe(true);
    }
  });
});

test.describe("an unknown supplier bid link", () => {
  test("refuses cleanly and leaks nothing about the request", async ({ page }) => {
    await page.goto("/bid/definitely-not-a-real-token");

    const body = (await page.locator("body").innerText()).toLowerCase();

    // The failure mode that matters is not a 500 — it is a page that renders the request anyway.
    // Nothing identifying may appear for a token that does not resolve.
    expect(body).not.toMatch(/excavator|loader|crane|رافعة|حفار/);
    // And it must not silently offer a way to bid on nothing.
    await expect(page.getByRole("button", { name: /submit|send|إرسال/i })).toHaveCount(0);
  });
});

test.describe("routes behind a session", () => {
  // Not a journey test — a boundary test. It asserts the gate holds, which is the one thing about
  // these routes that can be proven without a session.
  for (const path of ["/dashboard", "/requests", "/inbox", "/profile", "/company"]) {
    test(`${path} does not serve renter data to a signed-out visitor`, async ({ page }) => {
      const res = await page.goto(path);

      // Either the middleware redirects, or the page renders a signed-out state. What must NOT happen
      // is a rendered list of somebody's requests.
      const redirected = !new URL(page.url()).pathname.startsWith(path);
      const status = res?.status() ?? 0;
      expect(redirected || status === 401 || status === 403 || status === 200).toBe(true);

      if (!redirected) {
        const body = (await page.locator("body").innerText()).toLowerCase();
        // A signed-out visitor must not see request references or supplier names.
        expect(body).not.toMatch(/\bREQ-\d|\bBID-\d/i);
      }
    });
  }
});
