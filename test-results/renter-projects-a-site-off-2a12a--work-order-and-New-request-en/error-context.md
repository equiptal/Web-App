# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: renter-projects.spec.ts >> a site offers both ways to put something on it >> PROJ-UI-03 · the header carries Add work order and New request
- Location: tests\e2e\renter-projects.spec.ts:87:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /add work order/i })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('button', { name: /add work order/i })

```

```yaml
- banner:
  - link "Home":
    - /url: /
    - img "Moedatech"
  - navigation:
    - link "Dashboard":
      - /url: /
    - link "Browse":
      - /url: /browse
    - link "Requests":
      - /url: /requests
    - link "My Organization":
      - /url: /company
  - button "Switch to Arabic": English
  - link "Inbox":
    - /url: /inbox
    - text: "2"
  - button "Notifications": "20"
  - link "Settings · Verified":
    - /url: /profile
    - text: خا
- main:
  - heading "Let our AI assistant find your next equipment" [level=1]
  - paragraph: Describe what you need in plain words. Our AI assistant matches you with the right suppliers.
  - button "Create request"
  - heading "My Requests" [level=2]
  - text: 20 open · 2 new bids
  - button "View all"
  - table:
    - rowgroup:
      - row "Site Equipment Bids Closes":
        - columnheader "Site"
        - columnheader "Equipment"
        - columnheader "Bids"
        - columnheader "Closes"
        - columnheader
    - rowgroup:
      - button "Riyadh — Al Wuroud District Crawler Excavator · 30 ton 1 26 days left Share for bids Edit request Cancel request Compare bids":
        - cell "Riyadh — Al Wuroud District"
        - cell "Crawler Excavator · 30 ton"
        - cell "1"
        - cell "26 days left"
        - cell "Share for bids Edit request Cancel request Compare bids":
          - button "Share for bids"
          - button "Edit request"
          - button "Cancel request"
          - button "Compare bids"
      - button "Riyadh — Al Malaz District Crawler Excavator · 30 ton 1 16 days left Share for bids Edit request Cancel request Compare bids":
        - cell "Riyadh — Al Malaz District"
        - cell "Crawler Excavator · 30 ton"
        - cell "1"
        - cell "16 days left"
        - cell "Share for bids Edit request Cancel request Compare bids":
          - button "Share for bids"
          - button "Edit request"
          - button "Cancel request"
          - button "Compare bids"
      - button "Riyadh — Al Malaz District Crawler Excavator · 30 ton 1 16 days left Share for bids Edit request Cancel request Compare bids":
        - cell "Riyadh — Al Malaz District"
        - cell "Crawler Excavator · 30 ton"
        - cell "1"
        - cell "16 days left"
        - cell "Share for bids Edit request Cancel request Compare bids":
          - button "Share for bids"
          - button "Edit request"
          - button "Cancel request"
          - button "Compare bids"
      - button "Riyadh — Al Malaz District Crawler Excavator · 30 ton 1 15 days left Share for bids Edit request Cancel request Compare bids":
        - cell "Riyadh — Al Malaz District"
        - cell "Crawler Excavator · 30 ton"
        - cell "1"
        - cell "15 days left"
        - cell "Share for bids Edit request Cancel request Compare bids":
          - button "Share for bids"
          - button "Edit request"
          - button "Cancel request"
          - button "Compare bids"
      - button "Riyadh — Al Wuroud District All-Terrain Crane · 20 Ton +1 more 2 16 days left Share for bids Edit request Cancel request Compare bids":
        - cell "Riyadh — Al Wuroud District"
        - cell "All-Terrain Crane · 20 Ton +1 more"
        - cell "2"
        - cell "16 days left"
        - cell "Share for bids Edit request Cancel request Compare bids":
          - button "Share for bids"
          - button "Edit request"
          - button "Cancel request"
          - button "Compare bids"
  - button "15 more requests"
  - complementary:
    - heading "18 new bids" [level=3]
    - button "M Murad alabdullah 300 BOMAG PC · Al Wuroud District, Riyadh"
    - button "M Murad alabdullah 10 BOMAG PC · Al Malaz District, Riyadh"
    - button "M Murad alabdullah 5 BOMAG PC · Al Wuroud District, Riyadh"
    - button "M Murad alabdullah 2 BOMAG PC · Al Wuroud District, Riyadh"
    - button "M Murad alabdullah 20 BOMAG PC · Al Malaz District, Riyadh"
    - button "13 more"
  - heading "Your projects" [level=2]
  - text: 17 sites
  - button "New project"
  - navigation:
    - button "UAT delete 1788125697449 0 requests · 0 work orders"
    - button "UAT delete 1788125664744 0 requests · 0 work orders"
    - button "UAT delete 1788125621057 0 requests · 0 work orders"
    - button "UAT propagate 1788125614825 0 requests · 0 work orders"
    - button "UAT delete 1788125551914 0 requests · 0 work orders"
    - button "UAT propagate 1788125533593 0 requests · 0 work orders"
    - button "UAT 1788125519843 0 requests · 0 work orders"
    - button "UAT delete 1788125439502 0 requests · 0 work orders"
    - button "UAT propagate 1788125438637 0 requests · 0 work orders"
    - button "UAT 1788125425348 0 requests · 0 work orders"
    - button "UAT delete 1788125349022 0 requests · 0 work orders"
    - button "UAT 1788125324176 0 requests · 0 work orders"
    - button "UAT delete 1788125288184 0 requests · 0 work orders"
    - button "UAT 1788125263374 0 requests · 0 work orders"
    - button "UAT delete 1788125096362 0 requests · 0 work orders"
    - button "UAT 1788125068851 0 requests · 0 work orders"
    - button "p1 ended 0 requests · 0 work orders"
    - button "Unassigned 23"
    - button "New project"
  - heading "p1 Edit" [level=2]:
    - text: p1
    - button "Edit"
  - paragraph: PM5R+P9C, As Sulimaniyah, Riyadh 12242, Saudi Arabia
  - term: Requests
  - definition: "0"
  - term: Work orders
  - definition: "0"
  - term: Units awarded
  - definition: "0"
  - term: Runs
  - definition: — → —
  - text: What is on this site Aug
- button "Support"
- alert
- button "# PINS"
```

# Test source

```ts
  1   | import { test, expect, type ConsoleMessage } from "@playwright/test";
  2   | 
  3   | /**
  4   |  * The renter-projects journey, in a real browser, against a real environment.
  5   |  *
  6   |  * Needs two things the default config does not provide, and skips loudly without them rather than
  7   |  * passing on a signed-out page:
  8   |  *
  9   |  *   PW_BASE_URL   the deployed app (staging)
  10  |  *   PW_STATE      a storageState file holding a renter session
  11  |  *
  12  |  * Everything here asserts what the page SAYS. The API layer already proved the write path reaches
  13  |  * the database; what a browser adds is whether the renter can find the thing, read it, and act on
  14  |  * it — a working endpoint behind a button nobody can see is still a broken feature. That is exactly
  15  |  * how the missing *Add work order* button survived: every endpoint worked.
  16  |  */
  17  | 
  18  | const STATE = process.env.PW_STATE;
  19  | const REMOTE = Boolean(process.env.PW_BASE_URL);
  20  | 
  21  | test.skip(!STATE || !REMOTE, "needs PW_BASE_URL and PW_STATE — see /web:test step 1");
  22  | test.use({ storageState: STATE });
  23  | 
  24  | /** Console noise that is not the app's fault and would fail every page if counted. */
  25  | const IGNORED = [/favicon/i, /Download the React DevTools/i, /\[Fast Refresh\]/i, /Failed to load resource.*401/i];
  26  | 
  27  | function watchConsole(page: import("@playwright/test").Page) {
  28  |   const errors: string[] = [];
  29  |   page.on("console", (m: ConsoleMessage) => {
  30  |     if (m.type() !== "error") return;
  31  |     const text = m.text();
  32  |     if (IGNORED.some((re) => re.test(text))) return;
  33  |     errors.push(text);
  34  |   });
  35  |   page.on("pageerror", (e) => errors.push(String(e)));
  36  | 
  37  |   /* The browser's own console says only "Failed to load resource: 403" — no URL, which leaves a
  38  |      reader with a failure they cannot act on. Record the response itself so the report can name the
  39  |      endpoint. 401s from the guest probes are expected and already ignored above. */
  40  |   page.on("response", (r) => {
  41  |     if (r.status() < 400 || r.status() === 401) return;
  42  |     errors.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
  43  |   });
  44  | 
  45  |   return errors;
  46  | }
  47  | 
  48  | test.describe("the dashboard carries the sites", () => {
  49  |   test("PROJ-UI-01 · the section renders under My requests, in the dashboard itself", async ({ page }) => {
  50  |     const errors = watchConsole(page);
  51  |     await page.goto("/dashboard", { waitUntil: "networkidle" });
  52  | 
  53  |     // Signed in, not bounced to the login screen — otherwise every assertion below is vacuous.
  54  |     await expect(page).not.toHaveURL(/\/login/);
  55  | 
  56  |     /* Two buttons carry this name and both are meant to: the section header's, and the dashed one
  57  |        at the end of the site rail. `.first()` takes the header's — the one a renter with no sites
  58  |        at all can reach. */
  59  |     const newProject = page.getByRole("button", { name: /new project/i }).first();
  60  |     await expect(newProject).toBeVisible();
  61  | 
  62  |     /* No separate route. The point is not the path — /dashboard redirects to / — but that the
  63  |        sites and the requests are the SAME page, which is what the owner asked for: "below my
  64  |        requests, no separate route". */
  65  |     await expect(page.getByText(/my requests/i).first()).toBeVisible();
  66  | 
  67  |     expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  68  |   });
  69  | 
  70  |   test("PROJ-UI-02 · the form opens on When, then Where, then Payment", async ({ page }) => {
  71  |     await page.goto("/dashboard", { waitUntil: "networkidle" });
  72  |     await page.getByRole("button", { name: /new project/i }).first().click();
  73  | 
  74  |     const dialog = page.getByRole("dialog");
  75  |     await expect(dialog).toBeVisible();
  76  | 
  77  |     // Six fields, and no hours/day — that question belongs to the request's More details.
  78  |     await expect(dialog.getByText(/hours\s*\/?\s*day/i)).toHaveCount(0);
  79  | 
  80  |     // Save refuses without a location, and says why rather than sitting there dead.
  81  |     const save = dialog.getByRole("button", { name: /^save/i });
  82  |     await expect(save).toBeDisabled();
  83  |   });
  84  | });
  85  | 
  86  | test.describe("a site offers both ways to put something on it", () => {
  87  |   test("PROJ-UI-03 · the header carries Add work order and New request", async ({ page }) => {
  88  |     const errors = watchConsole(page);
  89  |     await page.goto("/dashboard", { waitUntil: "networkidle" });
  90  | 
  91  |     // Open the first site that exists. No site means nothing to assert — say so rather than pass.
  92  |     const card = page.locator("[data-site-card], button", { hasText: /p1|zone/i }).first();
  93  |     test.skip((await card.count()) === 0, "no site on this account to open");
  94  |     await card.click();
  95  |     await page.waitForTimeout(1500);
  96  | 
> 97  |     await expect(page.getByRole("button", { name: /add work order/i })).toBeVisible();
      |                                                                         ^ Error: expect(locator).toBeVisible() failed
  98  |     await expect(page.getByRole("button", { name: /new request/i })).toBeVisible();
  99  | 
  100 |     // The roll-ups are gone: they counted what the chart below draws in full.
  101 |     await expect(page.getByText(/units awarded/i)).toHaveCount(0);
  102 | 
  103 |     expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  104 |   });
  105 | });
  106 | 
  107 | test.describe("Arabic", () => {
  108 |   test.use({ locale: "ar-SA" });
  109 | 
  110 |   test("PROJ-UI-04 · the dashboard flips direction and keeps its strings", async ({ page }) => {
  111 |     await page.goto("/dashboard?lang=ar", { waitUntil: "networkidle" });
  112 | 
  113 |     const dir = await page.evaluate(() => document.documentElement.dir);
  114 |     expect(dir, "the document must flip to rtl").toBe("rtl");
  115 | 
  116 |     // A key that fell back to English is a missing translation, not a styling choice.
  117 |     await expect(page.getByText("New project", { exact: true })).toHaveCount(0);
  118 |   });
  119 | });
  120 | 
```