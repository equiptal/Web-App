import { COLORS, CSS_VAR_NAME } from "@/lib/ds-colors";

/**
 * Resolving design tokens, for the tests that measure a colour rather than name it.
 *
 * Several ACs are about what a colour *is* — the shortfall must be orange and never the availability
 * red; the ask must be blue and never a navy. Those tests used to read a literal hex out of the
 * markup and check its channels. The app writes `var(--warn)` now, so they resolve it here first.
 *
 * Checking the channels is still the right test. A token name proves nothing about what the reader
 * sees: `--warn` could be pointed at anything tomorrow, and the AC would go on passing while the
 * screen stopped obeying it.
 */

const BY_VAR: Record<string, string> = Object.fromEntries(
  (Object.keys(COLORS) as (keyof typeof COLORS)[]).map((k) => [CSS_VAR_NAME[k], COLORS[k]]),
);

/** `var(--warn)` → `#ed6a5e`. Anything that is not a known token comes back unchanged. */
export function resolveToken(value: string): string {
  return value.replace(/var\((--[a-z0-9-]+)\)/g, (whole, name) => BY_VAR[name] ?? whole);
}

/** The channels of a colour, whether it arrives as a token, a hex or an `rgb()`. */
export function channels(value: string): { r: number; g: number; b: number } | null {
  const v = resolveToken(value.trim());
  const hex = v.match(/#([0-9a-fA-F]{6})\b/);
  if (hex) {
    return {
      r: parseInt(hex[1].slice(0, 2), 16),
      g: parseInt(hex[1].slice(2, 4), 16),
      b: parseInt(hex[1].slice(4, 6), 16),
    };
  }
  const rgb = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3] };
  return null;
}

/** Every token whose value is one of these, so a test can say "not any navy" without listing hexes. */
export const NAVY_TOKENS = [
  "var(--navy-deep)",
  "var(--navy)",
  "var(--navy-mid)",
  "var(--foreground)",
] as const;
