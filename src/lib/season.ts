import { NATIONAL_DAY_ENABLED } from "@/lib/flags";

/**
 * Seasonal skins — a second theme laid OVER the palette, never in place of it.
 *
 * Owner, 2026-09-16: *"can i do a national day version that stay until 1-10 and it is another
 * design theme not replacing ours so maybe just a flag"*.
 *
 * ── What a season is allowed to be ──────────────────────────────────────────────────────────────
 * One attribute on `<html>` — `data-season="nd"` — and a block of CSS in `globals.css` scoped under
 * it. Nothing else. No component branches on the date, no token is redefined, and the whole thing
 * is removed by one attribute not being written.
 *
 * 🔴 **The brand orange does NOT move** (owner's call, asked and answered on 2026-09-16: *"orange
 * stays"*). Green is CHROME here — the bar, the seam, the chip — and it is chrome only. This app
 * already spends green on a meaning: `--ok` is «it happened» (the posted tick, the met term, the
 * paper on file). Repainting `--brand` green would put the celebration's colour and the product's
 * own success colour on the same screen saying two different things, and every CTA in the product
 * would move for a fortnight. The seasonal tokens are therefore ADDITIVE (`--nd-*`): a surface opts
 * into one, no surface loses one.
 *
 * ── The window is decided on the SERVER ─────────────────────────────────────────────────────────
 * `layout.tsx` writes the attribute during its render. Reading the clock in a client effect instead
 * would paint the navy bar first and repaint it green a frame later, on every cold load, for the
 * whole fortnight.
 */
export type Season = "nd";

/**
 * Riyadh is **UTC+3 and has no daylight saving**, so the offset is a constant rather than a lookup.
 * The window has to be judged there and not in the server's own zone: an Amplify Lambda runs in UTC,
 * and «until 1 Oct» read in UTC would take the theme down at 3am Riyadh on the 1st — three hours
 * early, in the middle of the night, which nobody would see but which is still the wrong answer.
 */
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Saudi National Day is 23 September. The window opens a week before it and closes on 1 October —
 * the owner's own dates (*"stay until 1-10"*), with the run-up so the theme is up before the day
 * rather than only after it.
 *
 * Month is 1-based here on purpose: `new Date()`'s 0-based month is the single most reliable way to
 * get a date constant wrong, and this pair is read by a human far more often than by the compiler.
 */
const OPENS = { month: 9, day: 16 } as const;
const CLOSES = { month: 10, day: 1 } as const;

/**
 * The ordinal the mark carries — 96 in 2026.
 *
 * Saudi Arabia counts these by the HIJRI year, not by the Gregorian gap from the 1932 unification
 * (which would read 94 this September), so it cannot be derived from the founding date. It is an
 * offset from the Gregorian year instead, checked against the two the country has already
 * celebrated: 2025 was the 95th and 2026 is the 96th, so the offset is 1930.
 *
 * ⚠️ **The Hijri year is shorter than the Gregorian one, so this offset drifts.** It is right for
 * the next several years and it will not be right forever; when the two calendars slip a year past
 * each other the number here is what to correct, and a test pins today's answer so the correction
 * is a failing case rather than a wrong number on the bar.
 */
export const nationalDayOrdinal = (year: number): number => year - 1930;

/**
 * Which season, if any, is running at `now`.
 *
 * `null` is the ordinary answer for most of the year, and it is what the flag returns whatever the
 * date says: `NATIONAL_DAY_ENABLED` is the kill switch OVER the window, so the theme can be taken
 * down early without waiting for 1 October and without a code change to these dates.
 */
export function seasonAt(now: Date = new Date()): Season | null {
  if (!NATIONAL_DAY_ENABLED) return null;
  const riyadh = new Date(now.getTime() + RIYADH_OFFSET_MS);
  const y = riyadh.getUTCFullYear();
  const opens = Date.UTC(y, OPENS.month - 1, OPENS.day);
  const closes = Date.UTC(y, CLOSES.month - 1, CLOSES.day);
  const today = Date.UTC(y, riyadh.getUTCMonth(), riyadh.getUTCDate(), riyadh.getUTCHours(), riyadh.getUTCMinutes());
  return today >= opens && today < closes ? "nd" : null;
}

/**
 * What the season means in words, for the chip and the mark.
 *
 * ⚠️ **The digits are LATIN in both locales**, which is this app's standing rule since 2026-09-04
 * (owner, through the app: *"the numbers should be in eng even in arabic"*) and is where the web
 * departs from the Flutter kit, which draws «٩٦». The rule is product-wide — `latinDigits()` is
 * applied to rows that arrive Arabic-indic from the database — and one seasonal pill is not the
 * place to break it.
 */
export const seasonOrdinal = (now: Date = new Date()): number =>
  nationalDayOrdinal(new Date(now.getTime() + RIYADH_OFFSET_MS).getUTCFullYear());
