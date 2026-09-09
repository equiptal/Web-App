import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * **Pictures of the surfaces a batch touched** (owner, 2026-09-08).
 *
 * A UI change used to end "not verified visually": the renter surfaces sit behind auth and a
 * backend, so the agent that made the change could not look at it and the owner had to open the
 * browser and screenshot it again. `/dev/preview` renders each surface on invented data with no
 * session; this walks those specimens and saves PNGs into `.artifacts/ui/`, which is where the
 * change report reads them from.
 *
 *     npm run ui:shots                          every specimen, both widths, both scripts
 *     UI_SHOT=yard-explain npm run ui:shots     just one, while iterating on it
 *
 * ── What it proves and what it does not ─────────────────────────────────────────────────────────
 * It proves the LAYOUT: what wraps, what overflows, what the Arabic mirror does to a row, whether a
 * badge fits beside a figure. It cannot prove the content is right for real data — the fixtures are
 * literals in `specimens.tsx` — so a data-shaped bug still needs the real app.
 *
 * ── Two widths, two scripts, on purpose ─────────────────────────────────────────────────────────
 * 392px is the panel this app draws its densest surfaces in and the phone it is read on; 1024 is the
 * desktop. Arabic is a full pass rather than a spot check, because the whole app mirrors and a
 * layout that breaks under RTL breaks for most of the userbase.
 *
 * It ASSERTS almost nothing by design — a screenshot test that fails on a pixel becomes a chore
 * nobody runs. The one thing it does assert is that the specimen rendered at all: an empty clip is a
 * broken specimen, and a report built on blank pictures is worse than one that says "unverified".
 */

const OUT = path.join(process.cwd(), ".artifacts", "ui");
const ONLY = process.env.UI_SHOT?.trim() || null;
const WIDTHS = [392, 1024];

/** The ids `/dev/preview` knows. Kept as a literal list so a failure names the missing specimen
 *  rather than silently photographing nothing — the page's index is the other half of this. */
const SPECIMENS = [
  "yard-card-unconfirmed",
  "yard-card-confirmed",
  "yard-explain",
  "request-card-company",
  "request-card-document",
  "price-footer",
];

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
});

for (const id of SPECIMENS) {
  if (ONLY && id !== ONLY) continue;
  for (const width of WIDTHS) {
    test(`shot: ${id} @${width}`, async ({ page }, info) => {
      // The project name is the locale (`playwright.config.ts`), and the app's own provider reads
      // `?lang=` and persists it — the same seam `/en` redirects into (`middleware.ts`).
      const lang = info.project.name === "ar" ? "ar" : "en";
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/dev/preview?s=${id}&lang=${lang}`);

      const clip = page.locator("[data-shot]");
      await expect(clip, `specimen "${id}" did not render — is it in specimens.tsx?`).toBeVisible();
      // Fonts settle after first paint; a shot taken before they do photographs the fallback face.
      await page.evaluate(() => document.fonts.ready);

      const file = path.join(OUT, `${id}--${lang}-${width}.png`);
      await clip.screenshot({ path: file });
      // The size check is the "did it render" assertion in disguise: a 0-byte or near-empty PNG is a
      // specimen that threw, and it must not pass as evidence.
      expect(fs.statSync(file).size, `${file} is empty`).toBeGreaterThan(2000);
    });
  }
}
