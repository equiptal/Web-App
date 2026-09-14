import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { ProcessingView } from "@/components/screens/Processing";
import { en } from "@/lib/i18n/en";
import { ar } from "@/lib/i18n/ar";

/**
 * ── One ring, one picture, one line (owner, 2026-09-12) ─────────────────────────────────────────
 *
 * *"make it very simple processing icon that is aligned with our design system and no need for
 * steps and many complicated text he is doing, i want something simple and the taxonomy he is
 * thinking of and processing so images of taxonomy in our db will be shown in processing according
 * to what the agent is matching"*.
 *
 * What went: the four-stage rail, the four-line activity feed, the progress bar, the percentage
 * pill and the counts line. Five devices narrating a request the server answers in ONE shot.
 *
 * ⚠️ These read `ProcessingView`, the drawing with the state taken out of it. The stateful
 * `Processing` needs the rfq provider, a live agent and about four seconds of wall clock; what is
 * under test here is the layout ruling, which is what the owner's message was about.
 */
const SRC = readFileSync("src/components/screens/Processing.tsx", "utf8");

afterEach(cleanup);

const img = (c: HTMLElement) => c.querySelector("img");
const glyph = (c: HTMLElement) => c.querySelector(".material-icons-outlined");
/** The agent himself — see `mansour.test.tsx` for the rig's own rules. */
const mansour = (c: HTMLElement) => c.querySelector(".v4m-man");

describe("in flight, it shows the catalogue and names nothing", () => {
  it("draws a real drawing, and the one line", () => {
    /**
     * Owner, 2026-09-13, on a shot of a lone spinner: *"didnt we say it must show equipment he is
     * trying to map, the ui is so dull"*. The catalogue is flicked through while the agent reads.
     */
    const c = render(<ProcessingView imageUrl="https://x/spider-crane.png" title={en.processing.reading} caption={null} />).container;
    expect(img(c)?.getAttribute("src")).toBe("https://x/spider-crane.png");
    expect(c.textContent).toContain(en.processing.reading);
  });

  it("has NO caption, which is the whole licence for showing them", () => {
    // A picture here means «this is what the agent matched you to». Unnamed and moving, a reel of
    // them reads as the catalogue being searched; captioned, it would claim matches not yet made.
    const c = render(<ProcessingView imageUrl="https://x/spider-crane.png" title={en.processing.reading} caption={null} />).container;
    expect(c.textContent).not.toContain(en.processing.matched);
  });

  it("with no drawing at all, the AGENT holds the ring — never an empty disc, never a glyph", () => {
    // An off-catalogue line, or a taxonomy that failed to load.
    const c = render(<ProcessingView imageUrl={null} title={en.processing.reading} caption={null} />).container;
    expect(img(c)).toBeNull();
    expect(mansour(c)).toBeTruthy();
    expect(glyph(c)).toBeNull();
  });
});

describe("matched, it shows the catalogue's own picture", () => {
  const draw = () =>
    render(
      <ProcessingView imageUrl="https://x/eq.jpeg" title="Crawler excavator 20 ton" caption={en.processing.matched} />,
    ).container;

  it("the picture takes the ring, and the agent keeps the corner", () => {
    const c = draw();
    expect(img(c)?.getAttribute("src")).toBe("https://x/eq.jpeg");
    expect(glyph(c)).toBeNull();
    // He is still the one doing it; the machine is simply what he found.
    expect(mansour(c)).toBeTruthy();
  });

  it("FITS it and scales it past the box, because these are drawings", () => {
    /**
     * 🔴 Two fits were tried here, in this order, and both were looked at.
     *
     * `object-cover` was right while the slot held a PHOTOGRAPH (`equipment_image_url`, 1.83:1) —
     * contain drew a band across a round hole. That slot is gone: the drawings come from
     * `/api/stores/taxonomy` now, and a drawing carries its own transparent margin, so cropping one
     * enlarges the margin rather than the machine (the requests rail's note, 2026-08-31).
     *
     * Plain `contain` then filled under half the circle and the tile read as empty, which is the
     * report this answers — so it is contain PLUS a scale, exactly as the rail settled it.
     */
    const el = draw();
    expect(img(el)?.className).toMatch(/object-contain/);
    /**
     * 🔴 **No SCALE at all, and this is the third fit tried here.** `cover` was right for a
     * photograph; `contain` + 1.25 was the answer while the tile read as empty; both CLIP a
     * catalogue drawing, which was measured rather than argued: these are ~1.83:1 with no horizontal
     * margin, so `contain` already fills the width and anything above 1 pushes the machine's ends out
     * through the circle - at 1.5 the spider crane lost both outriggers.
     * The geometry: a w×h picture fits a circle of diameter D when w·√(1+(h/w)²) ≤ D, which at
     * 1.83:1 is w ≤ 0.87D. `contain` gives w = D, so 1.0 is the ceiling.
     */
    expect(img(el)?.className).not.toMatch(/scale-\[/);
    expect(img(el)?.className).not.toMatch(/object-cover/);
  });

  it("the scale is only safe because the disc CLIPS", () => {
    // Without `overflow-hidden rounded-full` on the parent the drawing would spill over the ring and
    // over Mansour's corner mark.
    const el = draw();
    expect(img(el)?.parentElement?.className).toMatch(/overflow-hidden/);
    expect(img(el)?.parentElement?.className).toMatch(/rounded-full/);
  });

  it("ARRIVES, rather than appearing — the ring closes and the drawing overshoots", () => {
    /**
     * Owner, 2026-09-13: *"when the image is found show it appear to the screen like winner"*.
     * Landing had no moment: the drawing simply swapped and a renter watching the reel could not
     * tell the ANSWER from one more candidate. `found` closes the ring and pops the machine on one
     * timeline; `prefers-reduced-motion` keeps both results and drops the overshoot (globals.css).
     */
    const el = render(
      <ProcessingView imageUrl="https://x/eq.png" title="Scissor lift" caption={en.processing.matched} found />,
    ).container;
    expect(img(el)?.className).toMatch(/found-pop/);
    // The ring is a CLOSED brand circle, not a quarter still turning over a settled answer.
    const ring = el.querySelector(".found-ring");
    expect(ring).toBeTruthy();
    expect(ring!.className).not.toMatch(/animate-spin/);
  });

  it("while READING the ring is still a turning quarter", () => {
    const el = render(<ProcessingView imageUrl="https://x/eq.png" title="Reading" caption={null} />).container;
    expect(el.querySelector(".found-ring")).toBeNull();
    expect(img(el)?.className).not.toMatch(/found-pop/);
    // Read by CLASS through a filter, never `querySelector`: the `motion-safe:` prefix needs its
    // colon escaped for CSS and an unescaped one throws rather than missing.
    expect([...el.querySelectorAll("span")].some((s) => /animate-spin/.test(s.className))).toBe(true);
  });

  it("names the machine, and says where the name came from", () => {
    const el = draw();
    expect(el.textContent).toContain("Crawler excavator 20 ton");
    expect(el.textContent).toContain(en.processing.matched);
  });
});

describe("the furniture is gone, not merely hidden", () => {
  it("the drawings are read off the APP taxonomy, not the agents one", () => {
    /**
     * 🔴 The first cut read `equipmentImageUrl` off `/api/taxonomy` — 1 row of 413 has one — and drew
     * a glyph because of it, which is the empty screen the owner photographed. The artwork was one
     * endpoint away, and the ids are the same in both trees.
     */
    expect(SRC).toMatch(/\/api\/stores\/taxonomy/);
    expect(SRC).toMatch(/iconForRef\(icons, item\.ref\)/);
    // ⚠️ The CALL, not the word: the note at the head of that file still names the field it stopped
    // reading, so a bare search would fail on the file's own explanation of itself.
    expect(SRC).not.toMatch(/\.equipmentImageUrl/);
  });

  it("no stage rail, no feed, no bar, no percentage", () => {
    // Each of these was a separate device saying the same nothing. A source test rather than a
    // render one: what must not come back is the MARKUP, in either state.
    expect(SRC).not.toMatch(/stageScan|stageExtract|stageMatch|stageAnalyze/);
    expect(SRC).not.toMatch(/liveActivity|agentWorking/);
    expect(SRC).not.toMatch(/\bpct\b|%`/);
    expect(SRC).not.toMatch(/summaryItems|summaryNeedCheck|summaryNotAvailable/);
  });

  it("their eighteen strings left BOTH dictionaries", () => {
    // A key nobody reads is the next agent's invitation to draw the thing again.
    for (const d of [en, ar]) {
      expect(Object.keys(d.processing).sort()).toEqual(["matched", "oneMachine", "reading"]);
    }
  });

  it("the processing LINE is back, and it reports no position either", () => {
    /**
     * 🔴 Owner, 2026-09-13: *"show process line anyways too"* - reversing the removal of 2026-09-12,
     * which took the bar out because `processRfq` is ONE request and a percentage moving on a timer
     * lies in the renter's favour until it stalls. What comes back is the honest form of «anyway»:
     * INDETERMINATE. A short segment travelling a track says «working» and claims nothing.
     */
    const reading = render(<ProcessingView imageUrl={null} title="x" caption={null} />).container;
    const seg = reading.querySelector(".proc-seg");
    expect(seg).toBeTruthy();
    // A SEGMENT of the track, never a width standing for a percentage.
    expect(seg!.className).toMatch(/w-\[30%\]/);
    // And nothing on it is a number.
    expect(reading.textContent).not.toMatch(/\d\s*%/);
  });

  it("and on a match the track FILLS and stops travelling", () => {
    // The same news the ring closing and the machine landing give at that moment.
    const el = render(
      <ProcessingView imageUrl="https://x/eq.png" title="Scissor lift" caption={en.processing.matched} found />,
    ).container;
    expect(el.querySelector(".proc-seg")).toBeNull();
    const bar = [...el.querySelectorAll("span")].find((s) => /bg-brand/.test(s.className) && /w-full/.test(s.className));
    expect(bar).toBeTruthy();
  });

  it("ONE spinner, and nothing anywhere reports a position", () => {
    /**
     * The ring spins and the line travels; neither fills toward a number. The server answers this
     * request in one shot, so a bar that CREEPS is a claim about progress nobody can make - which
     * is what `transition-[width]` on the old percentage bar was doing, and why its absence is
     * pinned here rather than left to a comment.
     */
    const c = render(<ProcessingView imageUrl={null} title="x" caption={null} />).container;
    expect(c.querySelectorAll(".animate-spin, .motion-safe\\:animate-spin").length).toBe(1);
    expect(SRC).not.toMatch(/transition-\[width\]/);
  });
});

describe("the error dialog is untouched", () => {
  it("still tells a rate limit from a dead agent from a dropped connection", () => {
    // AC-09 / AC-10. This change is about the waiting screen; the failure screen keeps its shape.
    expect(SRC).toMatch(/backendStatus/);
    expect(SRC).toMatch(/busyTitle/);
    expect(SRC).toMatch(/unavailableTitle/);
    expect(SRC).toMatch(/networkTitle/);
  });
});
