import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { nationalDayOrdinal, seasonAt, seasonOrdinal } from "@/lib/season";

/**
 * **The National Day skin is a SEASON, not a repaint** (owner, 2026-09-16: *"can i do a national day
 * version that stay until 1-10 and it is another design theme not replacing ours so maybe just a
 * flag"*, and, asked whether the brand orange should move with it, *"orange stays"*).
 *
 * Two halves are pinned here, and they fail for different reasons:
 *
 *  1. **The window.** It opens and closes on Riyadh's clock, not the server's. A Lambda runs in UTC,
 *     and «until 1 October» read in UTC takes the theme down at 03:00 Riyadh on the 1st.
 *  2. **The blast radius.** The whole argument for calling this a second theme rather than a
 *     restyle is that nothing above the seasonal block in `globals.css` changes value while it runs.
 *     That is a claim about the STYLESHEET, so it is read off the stylesheet.
 */

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

/** Riyadh is UTC+3 with no daylight saving, so a wall-clock time there is a fixed subtraction. */
const riyadh = (iso: string) => new Date(`${iso}+03:00`);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("the window is 16 September to 1 October, on Riyadh's clock", () => {
  it("is off the day before it opens", () => {
    expect(seasonAt(riyadh("2026-09-15T23:59"))).toBeNull();
  });

  it("is on from the first minute of the 16th", () => {
    expect(seasonAt(riyadh("2026-09-16T00:00"))).toBe("nd");
  });

  it("is on over the day itself", () => {
    expect(seasonAt(riyadh("2026-09-23T12:00"))).toBe("nd");
  });

  it("is on for the last minute of September", () => {
    expect(seasonAt(riyadh("2026-09-30T23:59"))).toBe("nd");
  });

  it("is off from the first minute of 1 October", () => {
    expect(seasonAt(riyadh("2026-10-01T00:00"))).toBeNull();
  });

  it("is off for the rest of the year", () => {
    expect(seasonAt(riyadh("2026-01-05T09:00"))).toBeNull();
    expect(seasonAt(riyadh("2026-12-24T09:00"))).toBeNull();
  });

  /**
   * 🔴 The case the whole `RIYADH_OFFSET_MS` constant exists for. These two instants are 21:00 and
   * 21:30 UTC on 30 September — the same UTC DAY — and they fall on opposite sides of the boundary
   * in Riyadh. Judge the window in UTC and both read as «still September», so the theme stays up for
   * three hours of 1 October; judge the OPENING in UTC and it arrives three hours late as well.
   */
  it("closes at midnight in Riyadh, not at midnight UTC", () => {
    expect(seasonAt(new Date("2026-09-30T20:30:00Z"))).toBe("nd"); // 23:30 on the 30th, Riyadh
    expect(seasonAt(new Date("2026-09-30T21:30:00Z"))).toBeNull(); // 00:30 on the 1st, Riyadh
  });

  /** It recurs. The dates carry no year, so next September it comes back with no code change — and
   *  the ordinal below is what keeps the number honest when it does. */
  it("comes back the following September", () => {
    expect(seasonAt(riyadh("2027-09-23T12:00"))).toBe("nd");
    expect(seasonAt(riyadh("2027-10-02T12:00"))).toBeNull();
  });
});

describe("the ordinal is derived, never written down", () => {
  /**
   * 96 in 2026. It is a HIJRI count, so it cannot be computed from the 1932 unification — that gap
   * is 94 this September. The offset is checked against the two the country has already held.
   */
  it("reads 96 this September and 95 last", () => {
    expect(nationalDayOrdinal(2026)).toBe(96);
    expect(nationalDayOrdinal(2025)).toBe(95);
  });

  it("advances by itself, so next September needs no edit", () => {
    expect(nationalDayOrdinal(2027)).toBe(97);
  });

  it("takes the year from Riyadh as well", () => {
    // 21:30 UTC on 31 December is already 1 January in Riyadh, so the mark rolls over with the city.
    expect(seasonOrdinal(new Date("2026-12-31T21:30:00Z"))).toBe(97);
  });
});

describe("the flag is the kill switch OVER the window", () => {
  it("answers null on the day itself when it is off", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_NATIONAL_DAY", "0");
    const { seasonAt: gated } = await import("@/lib/season");
    expect(gated(riyadh("2026-09-23T12:00"))).toBeNull();
  });

  it("is on by default, so shipping it needs no env var", async () => {
    vi.resetModules();
    const { NATIONAL_DAY_ENABLED } = await import("@/lib/flags");
    expect(NATIONAL_DAY_ENABLED).toBe(true);
  });
});

describe("the skin adds; it moves nothing", () => {
  const css = read("src/app/globals.css");
  /**
   * ⚠️ **Comments are stripped before anything is read.** This block explains, at length, the rules
   * it must never write — a `::before` on the header, a redefined `--brand` — so a sweep over the
   * raw text matches the explanation and fails on its own prose. Fourth time in this repo
   * (`basis-[34rem]`, `object-contain`, the CTA halo's `-z-10`).
   */
  const skinSource = css.slice(css.indexOf("THE NATIONAL DAY SKIN")).replace(/\/\*[\s\S]*?\*\//g, "");
  /* The marker sits INSIDE the banner comment, so stripping the comments leaves the banner's own
     remaining prose at the front. Start at the first real selector instead — a line opening with a
     class or an attribute — or the first "selector" read below is a sentence. */
  const skin = skinSource.slice(skinSource.search(/^[.[]/m));

  it("is scoped under the attribute, every rule of it", () => {
    /* Selectors are read by splitting on the braces rather than by a line-anchored regex. The first
       cut used `/^([^@\s][^{]*)\{/gm` and matched `}` at the start of a line, so it reported the
       whole gap between two rules as a selector — a case that fails on the file's own punctuation
       rather than on anything the file says. */
    const selectors = skin
      .split("}")
      .filter((b) => b.includes("{"))
      .flatMap((b) => b.split("{")[0].split(","))
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    expect(selectors.length).toBeGreaterThan(0);
    for (const s of selectors) {
      /* `.nd-decor` and `.nd-chip` are the two INERT defaults — `display: none`, and the `::after`
         that hangs off the first of them. They paint nothing until the attribute switches their
         display on, which is what makes them safe to declare unscoped. Everything else must name
         the season, or it is painting all year. */
      /* `@media (width >= 40rem)` is an at-rule PRELUDE, not a selector - the split above cannot
         tell the two apart, and the rule inside it is scoped like every other. */
      if (s.startsWith("@")) continue;
      const inert = s.startsWith(".nd-decor") || s === ".nd-chip";
      if (inert) continue;
      expect(s, `${s} paints outside the season`).toContain('[data-season="nd"]');
    }
  });

  /**
   * 🔴 The load-bearing case. A seasonal block is allowed to give a HOST a green ground; it is not
   * allowed to redefine `--brand`, `--navy-deep` or `--ok` under the whole product, which would
   * repaint every CTA and every success tick for a fortnight and is exactly what the owner refused.
   * A custom property assignment inside this block is that mistake, whatever it is assigning.
   */
  it("redefines no token", () => {
    const assignments = [...skin.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]);
    expect(assignments).toEqual([]);
  });

  it("keeps the brand orange where it was", () => {
    expect(/--brand:\s*#f97316/i.test(css)).toBe(true);
  });

  it("names its colours as tokens, never as a hex", () => {
    // The mask carries `%23000` because a mask reads alpha, not hue — it is a shape, not a paint.
    const paint = skin.replace(/url\("data:image\/svg\+xml,[^"]*"\)/g, "");
    expect(paint.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });
});

describe("the header wears it without branching on the date", () => {
  const shell = read("src/components/AppShell.tsx").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  /**
   * 🔴 The reason the classes are unconditional. The server knows the date and a client component
   * re-reads it, so a `season === "nd" && …` in this file is either a hydration mismatch or a navy
   * bar that flips green a frame after every cold load, for the whole fortnight. `seasonAt` is read
   * in `layout.tsx` and nowhere else.
   */
  it("calls no date helper of its own", () => {
    expect(shell).not.toContain("seasonAt");
  });

  it("carries all three hosts on the bar", () => {
    expect(shell).toContain('className="nd-bar sticky top-0');
    expect(shell).toContain('className="nd-decor"');
    expect(shell).toMatch(/className="nd-chip flex-none/);
  });

  /**
   * 🔴 **The chip carries NO width utility, and that is the fix rather than an omission.**
   * `max-sm:hidden` was on this element and could never have worked: Tailwind emits its utilities
   * inside `@layer utilities`, the seasonal block in `globals.css` is unlayered, and unlayered CSS
   * beats layered CSS whatever the specificity — so the season's `display` won at every width and
   * the chip would have ridden the phone bar all fortnight. Found by reading the compiled sheet,
   * which is the only place it is visible: it typechecks, it lints, and it looks right on a laptop.
   *
   * The width lives with the season now, in one `@media`, and this case is what stops a tidy-up
   * putting a utility back on the element and quietly undoing it.
   */
  it("leaves the phone rule to the stylesheet, where it can win", () => {
    expect(shell).not.toMatch(/nd-chip[^"]*(max-sm:|hidden|sm:inline-flex)/);
    expect(read("src/app/globals.css")).toContain('[data-season="nd"] .nd-chip { display: inline-flex; }');
  });

  it("writes the ordinal in Latin digits, as this app does everywhere", () => {
    expect(shell).toContain("{seasonOrdinal()}");
    expect(shell).not.toMatch(/[٠-٩]/);
  });
});

describe("the attribute is written on the server, and only there", () => {
  const layout = read("src/app/layout.tsx");

  it("puts the season on <html>", () => {
    expect(layout).toContain("data-season={season}");
  });

  /** `undefined`, not `""`: React omits the attribute entirely, where an empty string would leave
   *  `data-season=""` on every page for eleven and a half months. */
  it("leaves the attribute off out of season", () => {
    expect(layout).toContain("seasonAt() ?? undefined");
  });
});
