import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/**
 * Unit suite. Two environments, chosen per file rather than globally:
 *
 *  - **node** (the default) for pure logic — adapters, gates, pricing, store helpers. Most of the
 *    suite. Fast, and it can't accidentally start depending on a DOM.
 *  - **jsdom** for `.test.tsx` files, which render components. Opted into with
 *    `environmentMatchGlobs` so a logic test that drifts into needing a DOM has to say so.
 *
 * The DOM half exists because the request canvas (MREQ) is behaviour, not calculation: whether a
 * refused move shakes, whether a panel opens, whether an option list matches the contract, and
 * whether a control is hidden are all invisible to a type-check and to a node-env test. The previous
 * four-step wizard had no component tests at all, which is how a screen ships unlooked-at.
 *
 * The `@/` alias mirrors tsconfig paths so tests import the same specifiers as src.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Inline (empty) PostCSS so Vite doesn't load the project's Tailwind v4 config — these unit
  // tests import no CSS, and the Tailwind plugin isn't a valid Vite PostCSS plugin.
  css: { postcss: { plugins: [] } },
  test: {
    environment: "node",
    environmentMatchGlobs: [["tests/**/*.test.tsx", "jsdom"]],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/setup/dom.ts"],
  },
});
