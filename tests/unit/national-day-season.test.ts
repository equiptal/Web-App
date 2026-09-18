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
    const blocks = skin
      .split("}")
      .filter((b) => b.includes("{"))
      .map((b) => ({
        selectors: b.split("{")[0].split(",").map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean),
        body: b.split("{").slice(1).join("{").replace(/\s+/g, " ").trim(),
      }));
    expect(blocks.length).toBeGreaterThan(0);
    for (const { selectors, body } of blocks) {
      /* An INERT default is a rule whose only declaration is `display: none` - it paints nothing,
         so it is safe to declare unscoped, and it is what keeps a host silent for the eleven and a
         half months the attribute is absent. Asked as a question about the BODY rather than
         against a list of class names: the list needed editing every time a motif was added, and a
         list that has to be edited is a list that will one day be edited wrongly. */
      if (body === "display: none;") continue;
      for (const s of selectors) {
      /* `.nd-decor` and `.nd-chip` are the two INERT defaults — `display: none`, and the `::after`
         that hangs off the first of them. They paint nothing until the attribute switches their
         display on, which is what makes them safe to declare unscoped. Everything else must name
         the season, or it is painting all year. */
      /* `@media (width >= 40rem)` is an at-rule PRELUDE, not a selector - the split above cannot
         tell the two apart, and the rule inside it is scoped like every other. */
        /* `@media (width >= 40rem)` is an at-rule PRELUDE, not a selector - the split above cannot
           tell the two apart, and the rule inside it is scoped like every other. */
        if (s.startsWith("@")) continue;
        expect(s, `${s} paints outside the season`).toContain('[data-season="nd"]');
      }
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
    /* Two things are dropped before the sweep, and neither is paint:
         - a `data:` mask, because a mask reads ALPHA and never hue - `%23000` is a shape;
         - an `@supports` prelude, because `(-webkit-text-stroke: 1px #fff)` is a question about
           whether the browser parses the property at all. The value is the probe, and the colour
           that actually renders is the rule inside the block. */
    const paint = skin
      .replace(/url\("data:image\/svg\+xml,[^"]*"\)/g, "")
      .replace(/@supports\s*\([^)]*\)/g, "");
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
    expect(shell).toMatch(/className="nd-mark"/);
  });

  /**
   * 🔴 **The bar wears the MARK, never a chip** (owner, 2026-09-17: *"remove the 96 from the cta
   * and just make this style instead of the 96 pill on header"*) — the outlined figure, the gold
   * hairline and the caption, laid out as a row for a 52px bar.
   *
   * The half a tidy-up would undo: «Beta» beside it is an outlined pill, so a SECOND outlined pill
   * a hand's width away read as a pair of controls. The mark carries no border and no ground, which
   * is why putting `.nd-chip` back on this bar is a regression rather than a preference.
   */
  it("does not put a chip on the bar", () => {
    expect(shell).not.toMatch(/nd-chip/);
  });

  /**
   * 🔴 **The host carries NO width utility, and that is the fix rather than an omission.**
   * `max-sm:hidden` was on this element and could never have worked: Tailwind emits its utilities
   * inside `@layer utilities`, the seasonal block in `globals.css` is unlayered, and unlayered CSS
   * beats layered CSS whatever the specificity — so the season's `display` won at every width and
   * the element would have ridden the phone bar all fortnight. Found by reading the compiled sheet,
   * which is the only place it is visible: it typechecks, it lints, and it looks right on a laptop.
   *
   * The width lives with the season now, in one `@media`, and this case is what stops a tidy-up
   * putting a utility back on the element and quietly undoing it. It survived the pill becoming a
   * mark because the trap belongs to the BLOCK, not to whatever is standing in it.
   */
  it("leaves the phone rule to the stylesheet, where it can win", () => {
    expect(shell).not.toMatch(/nd-mark[^"]*(max-sm:|hidden|sm:inline-flex)/);
    expect(read("src/app/globals.css")).toContain("@media (width >= 40rem) {");
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

/**
 * **The kit's pieces, and where each one went** (owner, 2026-09-16: *"use more elements and
 * decorations from the prototype i gave u"*).
 *
 * The kit ships eleven motifs and names the surface each is for. These cases pin that mapping,
 * because the mapping is the decision - the same palm grove on a 52px bar and on a 160px band is
 * two different judgements, and the kit is explicit that the eight-palm line "needs room to work".
 */
describe("the kit's motifs land on the surfaces the kit names", () => {
  /* Comments stripped, for the reason the block above records: this stylesheet explains which
     motif goes where, so a sweep over the raw text counts the explanation as well as the rule. */
  const css = read("src/app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const cta = read("src/components/home/CtaBanner.tsx");
  const wall = read("src/components/common/GuestWall.tsx");
  const intake = read("src/components/screens/Intake.tsx");

  it("gives the 160px band the eight-palm TREE LINE and the 52px bar the four-palm grove", () => {
    expect(css).toContain('url("/nd96-treeline.svg")');
    expect(css).toContain('url("/nd96-palms.svg")');
    // Each file is named exactly once, so the two cannot quietly swap surfaces.
    expect(css.match(/nd96-treeline\.svg/g)).toHaveLength(1);
    expect(css.match(/nd96-palms\.svg/g)).toHaveLength(1);
  });

  /**
   * 🔴 The band's seasonal layer must come AFTER the photograph, the two gradients and the
   * multiply. All four sit at exactly `-z-10`, and among equals the last one painted wins - so
   * declared above them the tree line is perfectly present in the DOM and invisible on screen.
   * That is the halo bug this same file shipped with on 2026-09-16, at the same depth.
   */
  it("draws the band's season layer after every other -z-10 layer", () => {
    const multiply = cta.indexOf("mix-blend-multiply");
    const band = cta.indexOf('className="nd-band');
    expect(multiply).toBeGreaterThan(-1);
    expect(band).toBeGreaterThan(multiply);
  });

  /**
   * 🔴 **The band's bottom edge carries NOTHING** (owner, 2026-09-17: *"make the cta of ai straight
   * line as it was"*). Both treatments were tried on it and both are withdrawn - the gold seam, then
   * the dune sweep - and `.nd-dune` is deleted from the stylesheet with its artwork, so this case
   * fails the moment either comes back.
   *
   * The reason, for whoever reaches for the kit's dune again: it is the one motif that changes a
   * SILHOUETTE rather than adding a mark inside a box, and this edge is a structural join. The band
   * wears its season on the inside.
   */
  it("leaves the band's bottom edge straight", () => {
    expect(cta).toContain('className="relative isolate -mt-[calc(1.5rem+1px)]');
    expect(cta).not.toMatch(/className="nd-(seam|dune)/);
    expect(css).not.toMatch(/\.nd-dune\s*(\{|::after)/);
  });

  /**
   * 🔴 **The band says nothing in words** (owner, 2026-09-17). It keeps the three motifs that do
   * not speak — the tree line, the dot field and the dune sweep — and the ordinal mark moved to the
   * bar. The band exists to say ONE sentence, and a second piece of copy at the far end of it was
   * competing with that sentence for the same 160px.
   */
  it("leaves the band with no mark and no words of its own", () => {
    expect(cta).not.toMatch(/nd-mark/);
    expect(cta).not.toMatch(/seasonOrdinal/);
    // What it keeps: the two pieces that sit INSIDE it and say nothing.
    expect(cta).toContain('className="nd-band');
  });

  it("gives the role gate the INTERLOCKING band and the pale chip", () => {
    expect(wall).toContain("nd-crown");
    expect(wall).toContain("nd-chip is-pale");
    expect(wall).toContain("nd-palm-corner");
    // The woven rank is two triangles per tile; the quiet seam is one.
    expect(css).toContain("M0 7h12L6 0zM12 7h12L18 0z");
  });

  /**
   * ⚠️ The strip's ink is an arbitrary VARIANT on the element, never `color` in the seasonal block.
   * A colour set there would be unlayered and would beat `text-muted-dark` all year - the same trap
   * that caught the header chip's `max-sm:hidden`, read the other way round.
   */
  it("recolours the strip's ink with a variant, not with an unlayered rule", () => {
    expect(wall).toContain("[[data-season='nd']_&]:text-white");
    const crown = css.slice(css.indexOf('[data-season="nd"] .nd-crown {'));
    expect(crown.slice(0, crown.indexOf("}"))).not.toMatch(/(^|\s)color:/);
  });

  it("finishes the intake card's edge and does not put a palm behind its controls", () => {
    expect(intake).toContain("nd-seam field-card relative");
    expect(intake).not.toContain("nd-palm-corner");
  });

  /**
   * 🔴 Two of the kit's eleven are deliberately NOT carried, and this case is the record so the
   * next reader meets them as decisions rather than as omissions.
   *
   *  · **Confetti** would fire over the dashboard's own «your request is posted» tick, which is the
   *    one moment in this product that is allowed to celebrate something.
   *  · **The corner ribbon** marks "one item as part of the campaign". Nothing in this product is
   *    part of a campaign, so on a request tile or a bid card it would be a claim about the offer.
   */
  it("carries neither the confetti nor the corner ribbon", () => {
    for (const src of [css, cta, wall, intake, read("src/components/AppShell.tsx")]) {
      expect(src).not.toMatch(/nd-confetti|nd-ribbon/);
    }
  });
});
