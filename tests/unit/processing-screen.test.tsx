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

describe("in flight, it names nothing", () => {
  it("draws MANSOUR and the one line, and no picture", () => {
    /**
     * Nothing has been matched, so there is nothing to show a picture OF. The old screen filled
     * this gap with paced lines about scanning and extracting, which read as findings.
     *
     * ~~A `precision_manufacturing` glyph.~~ A generic equipment icon on the one screen whose
     * subject is the AGENT (owner, 2026-09-13).
     */
    const c = render(<ProcessingView imageUrl={null} title={en.processing.reading} caption={null} />).container;
    expect(img(c)).toBeNull();
    expect(mansour(c)).toBeTruthy();
    expect(glyph(c)).toBeNull();
    expect(c.textContent).toContain(en.processing.reading);
  });

  it("has no caption, so the line cannot read as a match", () => {
    const c = render(<ProcessingView imageUrl={null} title={en.processing.reading} caption={null} />).container;
    expect(c.textContent).not.toContain(en.processing.matched);
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

  it("CROPS it, because these are photographs", () => {
    /**
     * 🔴 `object-contain` was tried and looked at: `equipment_image_url` is 1.83:1, so contain drew
     * a 76x41 band across a round hole with empty crescents above and below. A photograph reaches
     * its own edges and wants the crop — the requests rail measured the same thing on 2026-08-31.
     */
    const el = draw();
    expect(img(el)?.className).toMatch(/object-cover/);
    expect(img(el)?.className).not.toMatch(/object-contain/);
  });

  it("names the machine, and says where the name came from", () => {
    const el = draw();
    expect(el.textContent).toContain("Crawler excavator 20 ton");
    expect(el.textContent).toContain(en.processing.matched);
  });
});

describe("the furniture is gone, not merely hidden", () => {
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

  it("one moving thing, and it reports no position", () => {
    // The ring spins; it never fills. The server answers this request in one shot, so a bar that
    // creeps is a claim about progress nobody can make.
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
