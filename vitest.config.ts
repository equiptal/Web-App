import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit suite (T11 core): pure logic — adapters, gates, store helpers. Node env, no DOM needed.
// The `@/` alias mirrors tsconfig paths so tests import the same module specifiers as src.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Inline (empty) PostCSS so Vite doesn't load the project's Tailwind v4 config — these unit
  // tests import no CSS, and the Tailwind plugin isn't a valid Vite PostCSS plugin.
  css: { postcss: { plugins: [] } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
