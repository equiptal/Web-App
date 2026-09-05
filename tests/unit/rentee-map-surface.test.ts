/**
 * **The rentee map's structural criteria** — RM3-AC-02, RM3-AC-06, RM3-AC-15, RM3-AC-26,
 * RM3-AC-33, RM3-AC-34, RM3-AC-35, RM3-AC-49.
 *
 * These eight are facts about the SURFACE rather than about a model: what the header is allowed to
 * list, which value reaches both drawing surfaces, which branch renders when the offer is empty, what
 * the landing effect touches, and what the stylesheet says about a cue's iteration count. None of them
 * can be reduced to a pure function without inventing one, and this suite mounts no DOM — so they are
 * asserted against the source and the stylesheet, which is the strongest thing available and is what
 * §E asks for ("assert the model, not a render") applied one level out.
 *
 * ── Two rules this file obeys, both of them lessons from the first pass ──────────────────────────
 *
 * **1 · Comments are stripped before every assertion.** These files explain their rules using the
 * words the rules forbid — `BidMapWorkspace.tsx`'s header says the panel carries no "contact details,
 * deals count, IBAN, CR and VAT" in exactly those words — so a naive grep reports a violation on the
 * sentence that states the prohibition. The stripper has a positive control of its own.
 *
 * **2 · Every negative carries a positive control.** A source assertion that passed because the file
 * moved, the anchor was renamed or the region resolved empty is the green-over-a-hole this ticket
 * exists to remove. Each region is proved non-empty and proved to contain what it SHOULD before it is
 * swept for what it must not.
 *
 * ── Scope note ───────────────────────────────────────────────────────────────────────────────────
 * `src/components/map/panel/**` is owned by other work in flight and is deliberately not read here.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AVAILABILITY_COLOUR, LANDING_CUE_MS, REQUEST_ACTION_COLOUR, SHORTFALL_COLOUR } from "@/lib/contract/bid-map";
import { channels, NAVY_TOKENS } from "../setup/ds";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

/** Block, line and JSX comments removed. String literals are left alone: a string holding a forbidden
 *  identifier is a real read waiting to happen, not prose. */
function strip(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** The text between two anchors, comments already stripped. Throws rather than returning "" when an
 *  anchor has moved — a silently empty region is how a source assertion goes vacuous. */
function region(src: string, from: string, to: string): string {
  const clean = strip(src);
  const start = clean.indexOf(from);
  const end = clean.indexOf(to, start + from.length);
  if (start < 0 || end < 0) throw new Error(`anchor moved: ${JSON.stringify(from)} … ${JSON.stringify(to)}`);
  return clean.slice(start, end + to.length);
}

/** One CSS rule's declaration block, by exact selector. */
function cssBlock(css: string, selector: string): string {
  const at = css.indexOf(selector);
  if (at < 0) throw new Error(`selector missing: ${selector}`);
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

const WORKSPACE = "src/components/map/BidMapWorkspace.tsx";
const LIST = "src/components/map/EquipmentList.tsx";
const CANVAS = "src/components/map/MapCanvas.tsx";
const DOCK = "src/components/map/ChatDock.tsx";
const CSS = "src/components/map/map-proto.css";

describe("the stripper does not eat the code it is cleaning", () => {
  it("keeps executable lines and removes only prose", () => {
    expect(strip("const a = 1; // iban\nconst b = 2;")).toContain("const b = 2");
    expect(strip("const a = 1; // iban\nconst b = 2;")).not.toContain("iban");
    expect(strip("/* deals count */ const a = 1;")).toBe("  const a = 1;");
    expect(strip('const u = "https://x/y";')).toContain("https://x/y");
  });

  it("throws rather than returning an empty region when an anchor moves", () => {
    expect(() => region("const a = 1;", "<header>", "</header>")).toThrow(/anchor moved/);
  });
});

/* ═════════════════════════ RM3-AC-02 · the header states identity, not credentials ═════════════════════════ */

describe("the panel header lists identity and nothing else (RM3-AC-02)", () => {
  const header = region(read(WORKSPACE), '<header className="bm-head">', "</header>");

  it("states the three things it SHOULD — the positive control", () => {
    // Without these the sweep below would pass over any header at all, including an empty one.
    expect(header).toMatch(/bid\.supplierName/);
    expect(header).toMatch(/companyDocuments/);
    expect(header.length).toBeGreaterThan(200);
  });

  it("renders the verified chip ONLY when the firm is verified", () => {
    // The chip is a claim about the platform's own check. Rendering it unconditionally would make
    // every supplier look verified, which is the one way this header can mislead.
    expect(header).toMatch(/\{bid\.verified\s*&&/);
    expect(header).toMatch(/verifiedCompany/);
  });

  it("carries no contact detail, no deals count, no IBAN, no CR and no VAT", () => {
    // They live in the company panel (V9). A header that lists credentials invites judging the
    // supplier before reading his machines.
    const FORBIDDEN = [
      /phone|mobile|whatsapp/i,
      /\bemail\b/i,
      /contact/i,
      /deals?count|dealscount|completedDeals|dealsCount/i,
      /\biban\b/i,
      /crNumber|commercialRegistration|\bcrNo\b/i,
      /\bvat\b/i,
      /rating|reviews?/i,
    ];
    for (const bad of FORBIDDEN) expect(header, String(bad)).not.toMatch(bad);
  });

  it("keeps those fields available on the bid, so the negative is a CHOICE and not an absence", () => {
    // The positive control on the rule. If `BidCard` ever stopped carrying them this AC would become
    // vacuously true — it is not: they are on the contract, one interpolation from the header.
    const bids = strip(read("src/lib/contract/bids.ts"));
    expect(bids).toMatch(/crNumber|vatNumber|iban|dealsCount|supplierPhone/i);
  });
});

/* ═════════════════════════ RM3-AC-15 · one selection value, both surfaces ═════════════════════════ */

describe("one selected id reaches the map and the list alike (RM3-AC-15)", () => {
  const workspace = strip(read(WORKSPACE));

  it("holds exactly ONE machine-selection state — a second ring is not representable", () => {
    const selectionStates = [...workspace.matchAll(/const \[(\w*[Ss]elect\w*), set\w+\] = useState/g)].map((m) => m[1]);
    expect(selectionStates).toEqual(["selectedMachineId"]);
  });

  it("hands that same value to MapCanvas and to EquipmentList", () => {
    // The mutation this catches: either surface re-pointed at a different variable. They would still
    // both render, and would disagree about which machine the renter is looking at.
    expect(region(read(WORKSPACE), "<MapCanvas", "/>")).toMatch(/selectedMachineId=\{selectedMachineId\}/);
    expect(region(read(WORKSPACE), "<EquipmentList", "scrollRef=")).toMatch(/selectedId=\{selectedMachineId\}/);
  });

  it("routes every change to that value through the one reducer", () => {
    /* FOUR movers — open, land, bid change, filtered-out — and every one of them is the reducer's
       answer. A `setSelectedMachineId` with no matching `nextSelection` is the rule written a second
       time, which is how the two surfaces start disagreeing.

       ~~SIX.~~ Two went, and neither is a rule that stopped being enforced:

       · the MARKER's own `press` (owner, 2026-08-11 — *"clicking an equipment on the map must open
         the panel of this selected equipment"*). It is `openMachine` now, which is the next test;
       · the request card's open in the chat, which was the third hand-written copy of the same four
         statements and now calls `openMachine` after clearing the filters that are its own concern.

       So the count going DOWN is the rule getting stronger — three entrances, one writer. */
    /* FIVE since 2026-08-18. `focusMachine` joined them — the card body's press, which flies the
       camera to a machine WITHOUT opening its panel (app parity). It is a genuine fifth entrance to
       the selection, not a bypass: it goes through the reducer like the other four, which is the only
       thing this test is about. The count going up is not the rule weakening; the assertion below,
       that no writer is handed a raw id, is what carries it. */
    const calls = workspace.match(/nextSelection\(/g) ?? [];
    const sets = [...workspace.matchAll(/setSelectedMachineId\(([^\n]*)/g)].map((m) => m[1].trim());
    expect(calls).toHaveLength(5);
    expect(sets).toHaveLength(calls.length);
    // …and none of them is handed a raw id, which is the shape a bypass would take.
    for (const arg of sets) expect(arg, arg).not.toMatch(/^(id|m\.equipmentId|equipmentId|null)\s*\)/);
  });

  it("opens the machine from the MAP as well as from the card, through one writer (owner, 2026-08-11)", () => {
    /* ── The finding ────────────────────────────────────────────────────────────────────────────
       *"Clicking an equipment on the map must open the panel of this selected equipment."* A marker
       press used to only ring the machine and light a card the renter then had to find in a column of
       fifty and press a second time.

       ── The mutations this catches ──────────────────────────────────────────────────────────────
       1 · the canvas re-pointed at a select-only handler, so a marker rings and opens nothing;
       2 · a SECOND opener written for the map beside the list's, which is how one press ends up
           setting the detail and the other only the selection;
       3 · `press` creeping back into the opener — which would clear the selection the panel it is
           about to fill is about, every time the renter pressed the machine already selected. */
    const opener = region(read(WORKSPACE), "const openMachine = useCallback(", "[onSelectMachine],");
    expect(opener).toMatch(/nextSelection\(cur, \{ kind: "open", id \}\)/);
    expect(opener).toMatch(/setDetailId\(id\)/); // it OPENS — the half a select-only handler lacks
    expect(opener).not.toMatch(/kind: "press"/);

    // One writer, two surfaces: the canvas and the list are handed the SAME callback, not two.
    expect(region(read(WORKSPACE), "<MapCanvas", "/>")).toMatch(/onOpenMachine=\{openMachine\}/);
    expect(region(read(WORKSPACE), "<EquipmentList", "scrollRef=")).toMatch(/onOpenDetail=\{openMachine\}/);

    // And the canvas really does hand a marker press up rather than absorbing it — without this the
    // three assertions above would hold over a map whose markers are inert.
    const canvas = strip(read(CANVAS));
    expect(canvas).toMatch(/eventHandlers=\{\{ click: \(\) => onOpen\(pin\.id\) \}\}/);
    expect(canvas).toMatch(/onOpen=\{\(id\) => onOpenMachine\?\.\(id\)\}/);
  });

  it("turns that id into the card's pressed state in the list", () => {
    const list = strip(read(LIST));
    expect(list).toMatch(/selected=\{selectedId === m\.equipmentId\}/);
    // `aria-current`, not the `aria-pressed` this asserted until 2026-08-11. The card OPENS the
    // machine now (owner) instead of toggling a selection, and `aria-pressed` on a control that
    // cannot be un-pressed announces a state that does not exist. AC-15's claim is unchanged — the
    // selected id still reaches the card as something a reader can perceive.
    expect(list).toMatch(/aria-current=\{selected \|\| undefined\}/);
  });

  it("turns the same id into the marker's selected state on the canvas", () => {
    const canvas = strip(read(CANVAS));
    expect(canvas).toMatch(/const selected = selectedId === pin\.id/);
    // …and the canvas derives no selection of its own to disagree with it.
    expect(canvas).not.toMatch(/useState<string \| null>/);
  });
});

/* ═════════ RM3-AC-19 · the selected marker reads as SELECTED, not as a third state ═════════
   Owner, 2026-08-11: *"in the map the selected equipment must be more visible."* The emphasis it
   gained had one constraint — RM3-AC-19 fixes `unitAvailability` as the ONLY source of a marker's
   colour, so a louder selection may take size, lift, ring and glow and may not take a fill. */

describe("the selected marker is emphasised by geometry, never by a colour (RM3-AC-19)", () => {
  const css = read(CSS);
  const canvas = strip(read(CANVAS));

  /** Every rule scoped to the SELECTED marker — the whole of what selection is allowed to do. */
  const selectedRules = [...css.matchAll(/\.bm-pin\.is-on[^{]*\{([^}]*)\}/g)].map((m) => m[0]);

  it("has selected-only rules at all, and one of them makes the machine BIGGER — the positive control", () => {
    // Without this the sweep below passes over a stylesheet that dropped the emphasis entirely, which
    // is the exact regression the owner reported and the one this file is here to hold.
    expect(selectedRules.length).toBeGreaterThanOrEqual(3);
    const stage = cssBlock(css, ".bm-pin.is-on .bm-pin-stage {");
    const scale = Number((stage.match(/transform:\s*scale\(([\d.]+)\)/) ?? [])[1]);
    expect(scale).toBeGreaterThan(1);
    // From the STAGE's bottom edge, so the machine grows upward and the ground point it marks — the
    // whole reason a marker is placed where it is — does not move.
    expect(stage).toMatch(/transform-origin:\s*bottom center/);
  });

  it("draws a ring that does not depend on the pulse, so the marker is findable mid-cycle", () => {
    // `dpHalo` is absent for most of its 1.9s and does not run at all under reduced motion. A halo is
    // the only emphasis a marker had, which is why it kept disappearing.
    const ring = cssBlock(css, ".bm-pin.is-on .bm-pin-ring {");
    expect(ring).toMatch(/border:/);
    expect(ring).not.toMatch(/animation/);
  });

  it("puts NO availability colour in any selected-only rule — selection is not a third state", () => {
    // The mutation: "make it more visible" answered with `background: var(--info)` on the disc, or worse
    // with a green/red of its own. Either turns "the one being looked at" into something a machine IS.
    for (const rule of selectedRules) {
      for (const availability of ["var(--ok)", "var(--danger)"]) {
        expect(rule.toLowerCase(), rule).not.toContain(availability);
      }
    }
  });

  it("keeps the availability colour as the marker's ONLY fill, selected or not — the other control", () => {
    // The negative above would be vacuous if the marker had stopped being coloured by availability.
    expect(canvas).toMatch(/const ring = AVAILABILITY_COLOUR\[pin\.availability\]/);
    expect(canvas).toMatch(/background:\$\{tint\}/);
    // …and `is-on` is emitted on the selection and on nothing else — not on a distance, not on a
    // state, which is the shape a "third availability" regression would actually take.
    expect(canvas).toMatch(/bm-pin\$\{selected \? " is-on" : ""\}/);
    expect(canvas.match(/is-on/g)).toHaveLength(1);
  });
});

/* ═════════ §6.4a · the filter opens its OWN panel, over the existing one (owner, 2026-08-11) ═════════ */

describe("the filter is a panel over the column, dismissed by an X", () => {
  const list = strip(read(LIST));
  const css = read(CSS);

  it("renders a dialog with a close control — the positive control", () => {
    expect(list).toMatch(/className="bm-eqfp"/);
    expect(list).toMatch(/role="dialog"/);
    expect(list).toMatch(/className="bm-eqfp-x"/);
    expect(list).toMatch(/aria-label=\{t\.common\.close\}/);
    // …and it is still Escape-dismissible: a panel only its own button can close is one the renter
    // has to aim at twice.
    expect(list).toMatch(/e\.key === "Escape"/);
  });

  it("covers the panel rather than pushing the list down — the whole point of the change", () => {
    // The mutation: `position: static`, or `absolute` without `inset: 0`, either of which puts the
    // groups back in the flow and shoves the machines the chips are about off the screen.
    const panel = cssBlock(css, ".bidmap .bm-eqfp {");
    expect(panel).toMatch(/position:\s*absolute/);
    expect(panel).toMatch(/inset:\s*0/);
    // Below the company documents' own `.mp-over` (12), so the two can coexist and the later, more
    // deliberate act wins.
    expect(Number((panel.match(/z-index:\s*(\d+)/) ?? [])[1])).toBeLessThan(12);
    // The inline block it replaces is gone, not merely unused — a second way to draw the same chips.
    // Matched as a RULE rather than as a string: the stylesheet names `.bm-eqf-panel` in the comment
    // that records why it was withdrawn, which is prose and not a second panel.
    expect(css).not.toMatch(/\.bm-eqf-panel\s*\{/);
    expect(list).not.toContain("bm-eqf-panel");
  });

  it("still decides nothing about the filters itself — every rule stayed in the model", () => {
    /* §6.4a's four rules: only criteria the request asked for, chips that select for what a machine
       HAS, no control that would split nothing, and a count that always states the whole. All four
       are `equipmentListView`'s, and the list gained a SURFACE, not a decision. */
    expect(list).toMatch(/view\.groups\.map/);
    expect(list).toMatch(/\{ar \? o\.label\.ar : o\.label\.en\}/); // the model's own bilingual labels
    expect(list).toMatch(/\{num\(o\.matches\)\}/); // …and the model's own per-chip count
    // Nothing that re-derives a group, a predicate or a total.
    for (const forbidden of ["unitAvailability", "computeUnitReadiness", "DISTANCE_BANDS_KM", "filterMachines"]) {
      expect(list, forbidden).not.toContain(forbidden);
    }
  });

  it("states the count in BOTH places, from one builder, and always against the whole offer", () => {
    // With the cards covered, the panel's foot is the only thing telling the renter what a chip just
    // cost — and the mutation to catch is a second, hand-built count that reads `view.machines.length`
    // over `view.shown`, or a denominator that quietly becomes the filtered figure.
    expect(list.match(/countLine\(\)/g)).toHaveLength(2);
    expect(list).toMatch(/num\(view\.total\)/);
    expect(list).toMatch(/num\(view\.shown\)/);
    expect(list).not.toMatch(/view\.machines\.length/);
  });
});

/* ═════════ the card is the distance, and the distance is the ask (owner, 2026-08-28) ═════════ */

describe("the card carries three things, and the ask is the largest of them", () => {
  const list = strip(read(LIST));
  const css = read(CSS);

  /* ── Superseded three times, and this is the fourth arrangement ───────────────────────────────
     ~~"both controls in one cluster on the distance row"~~ (owner, 2026-08-11) — withdrawn on sight.
     ~~"«التفاصيل» alone on the distance row"~~ (same day) — withdrawn 2026-08-19 against the v3
     prototype's own card, which draws it on the title row.
     ~~"four rows: title · state · distance · certificates"~~ — withdrawn 2026-08-28, whole:
     *"redesign the whole card, remove all what it has now."*

     What the card states now, in the order the renter asks it: how far and how sure (one object),
     what the machine is, and — in the corner — how complete its file is and the way into it. The
     photo, the availability chip, the «in this offer» badge, the platform's tick and the certificate
     line are all gone; each of them was answering a question the renter had not asked yet. */
  it("gives the distance its own object and puts nothing else on that line", () => {
    expect(list).toMatch(/className=\{`bm-eq-yard \$\{yard\}`\}/);
    expect(list).toMatch(/className="bm-eq-yard ok"/);
    // The three blocks, and no fourth.
    for (const part of ["bm-eq-hd", "bm-eq-yard", "bm-eq-model"]) expect(list, part).toContain(part);
    // The old furniture, by name — a later edit that brings any of it back goes red here.
    // `bm-eq-photo` is deliberately NOT on this list: the picture came back on 2026-08-29 by the
    // owner's word, as a banner with the corner controls riding it. Nothing else did.
    for (const gone of ["bm-eq-chip", "bm-eq-cert", "bm-eq-inoffer", "bm-eq-vd", "bm-eq-r1", "bm-eq-r4"]) {
      expect(list, gone).not.toContain(gone);
    }
  });

  it("draws the machine's own photo, and lets it open the file", () => {
    // *"I want the images of the front image of equipment back."* It is the model's `photo` — the
    // front shot, else any shot, else null — and a machine with none says so rather than shimmering
    // forever at something that will never arrive.
    expect(list).toMatch(/className=\{`bm-eq-photo\$\{photo \? "" : " is-empty"\}`\}/);
    /* ~~A raw `<img src={photo}>` with an «eqNoPhoto» sentence beside it.~~ Both went to the shared
       `Photo` (2026-09-02, "one placeholder for every picture that is not there"), which also covers
       the case the old branch could not see: a machine that NAMES a photograph the bucket does not
       hold, where `photo` is non-null and the browser drew its broken glyph.

       What this test is about has not changed — the card draws the MODEL's `photo`, and a machine
       with none says so rather than shimmering forever at something that will never arrive. Only the
       component that does it has. */
    expect(list).toMatch(/<Photo src=\{photo\}/);
    expect(cssBlock(css, ".bidmap .bm-eq .bm-eq-photo.is-empty {")).toMatch(/animation:\s*none/);
    // The 104px SIDE cell, not a banner (owner, 2026-08-29). A full-width picture gave a machine
    // with no photo a third of the card to say «No photo» in.
    const photo = cssBlock(css, ".bidmap .bm-eq .bm-eq-photo {");
    expect(photo).toMatch(/width:\s*104px/);
    expect(photo).toMatch(/align-self:\s*stretch/);
  });

  it("keeps the availability tone identical on a selected card (owner, 2026-08-29)", () => {
    // *"When a card is selected dont let the selection color affect the red or green color."* The
    // fills were `color-mix(…, transparent)`, which composites over the card's ground — and a
    // selected card's ground is not white, so the same machine's green shifted the moment it was
    // pressed. Mixed into `var(--surface)` they are opaque and identical either way.
    for (const sel of [".bidmap .bm-eq .bm-eq-yard.ok {", ".bidmap .bm-eq .bm-eq-yard.no,"]) {
      const block = cssBlock(css, sel);
      expect(block, sel).toMatch(/background:\s*color-mix\(in srgb, var\(--\w[\w-]*\) \d+%, var\(--surface\)\)/);
      expect(block, sel).not.toMatch(/background:\s*color-mix\([^;]*transparent\)/);
    }
    // …and no `.bm-eq.on` rule may reach the state object at all.
    expect(css).not.toMatch(/\.bm-eq\.on[^{]*\.bm-eq-yard/);
  });

  it("says nothing about offer membership, on the card OR between the cards", () => {
    // Two removals, one reason. *"Remove this in this offer badge as renter doesnt care if a unit is
    // in the offer but not avaialbe so he cares only if available or not"* (2026-08-19) took the
    // badge off the card; *"remove this Also in his fleet — not in this offer sentence"*
    // (2026-08-31) took the divider out from between them. What he chooses on is whether a machine
    // can be confirmed for him.
    expect(list).not.toContain("pinInOffer");
    expect(list).not.toContain("eqBeyondOffer");
    // The ORDER still puts the offer first — that is `listedMachines`, not this file — and the MAP
    // still tags membership on the pin. Neither fact became unknowable.
    expect(strip(read("src/components/map/MapCanvas.tsx"))).toContain("pinInOffer");
  });

  it("keeps the machine askable WITHOUT opening the detail, which is RM3-AC-13 (and now louder)", () => {
    // The mutation the redesign could have introduced: the ask demoted to a link into the detail, or
    // buried under the stretched find-on-map layer where the card's own press would swallow it. It is
    // now the biggest target on the card, and the CSS has to let it be pressed.
    expect(list).toMatch(/onClick=\{\(\) => onYardPress\(machine, yard === "asked"\)\}/);
    expect(cssBlock(css, ".bidmap .bm-eq .bm-eq-yard.no,")).toMatch(/pointer-events:\s*auto/);
    expect(cssBlock(css, ".bidmap .bm-eq .bm-eq-open {")).toMatch(/pointer-events:\s*auto/);
  });

  it("explains the red BEFORE it asks, once, and then never again", () => {
    // The first press teaches, every press after it asks. Both halves matter: a tutorial that opened
    // every time would stand between the renter and the one control he is meant to press.
    expect(list).toMatch(/if \(!explainedBefore\(\)\) \{ setYardExplain\(\{ machine, asked: false \}\); return; \}/);
    expect(list).toMatch(/onAskAvailability\?\.\(machine\)/);
    // …and an already-asked machine never reaches the ask at all: it opens the question he put.
    expect(list).toMatch(/if \(asked\) \{ setYardExplain\(\{ machine, asked: true \}\); return; \}/);
  });

  it("paints the distance with AVAILABILITY's red, not with the ask's blue", () => {
    // `askAvailability.colour` is `var(--info)` — the ASK's colour, and right while it painted a
    // separate «Ask him to confirm» prompt. That prompt is gone (owner, 2026-08-31), and left on the
    // button the same ink would have turned the FIGURE blue: *"keep the font of distance red"*. One
    // fact, one ink — the number and how trustworthy it is are a single statement.
    expect(list).not.toContain("askAvailability.colour");
    expect(cssBlock(css, ".bidmap .bm-eq .bm-eq-yard.no,")).toMatch(/color:\s*#d9362a/);
    expect(cssBlock(css, ".bidmap .bm-eq .bm-eq-yard.ok {")).toMatch(/color:\s*#0d6c38/);
    // The figure itself never sets its own colour — it inherits the state's.
    expect(cssBlock(css, ".bidmap .bm-eq .bm-eq-km {")).toMatch(/color:\s*currentColor/);
  });

  it("keeps every card one height, which is what makes the column scannable (RM3-AC-32)", () => {
    // Three blocks, none of which appear or disappear with the data: the corner holds a `min-height`
    // whether or not the dots render, the distance always draws, and the model line always has a name.
    expect(cssBlock(css, ".bidmap .bm-eq .bm-eq-hd {")).toMatch(/min-height:\s*\d+px/);
    expect(list).not.toContain("bm-eq-r5");
  });
});

/* ═════════════════════════ RM3-AC-26 · the lessor's empty state ═════════════════════════ */

describe("an offer with no registered machine states so, with no card furniture (RM3-AC-26)", () => {
  const list = strip(read(LIST));

  it("renders the explanatory branch, keyed off the model's own answer", () => {
    // The mutation this catches: deleting the branch. The model test for `listEmptyState` stays green
    // when it is deleted, because the model still answers correctly — nothing reads it.
    expect(list).toMatch(/listEmptyState\(view\)/);
    expect(list).toMatch(/empty === "no-machines"/);
    expect(list).toMatch(/bm-eqnone/);
    expect(list).toMatch(/eqNoneRegistered/);
  });

  it("returns early from that branch, so no list, no card and no chip is reachable behind it", () => {
    const branch = region(read(LIST), 'if (empty === "no-machines") {', "  }");
    expect(branch).toMatch(/return \(/);
    // No `<ul>`, no card element, no photo cell, no chip — "no empty card furniture" as a structural
    // fact rather than as a look.
    for (const furniture of ["bm-eqlist", "bm-eq-photo", "bm-eq-chip", "EquipmentCard", "<ul"]) {
      expect(branch, furniture).not.toContain(furniture);
    }
  });

  it("stays distinguishable from the FILTERED empty state (RM3-AC-28e)", () => {
    // Different branch, different class, different copy — and only the filtered one carries a way out.
    expect(list).toMatch(/empty === "filtered"/);
    expect(list).toMatch(/bm-eqfnone/);
    const filtered = region(read(LIST), '{empty === "filtered" ? (', ") : (");
    expect(filtered).toMatch(/eqFilterEmpty/);
    expect(filtered).toMatch(/onClearFilters/);
    // …and the lessor's state offers no such escape, because there is nothing to escape from.
    const lessor = region(read(LIST), 'if (empty === "no-machines") {', "  }");
    expect(lessor).not.toMatch(/onClearFilters|eqFilterClear/);
  });

  it("wears no card furniture in the stylesheet either — no outline, no shadow, no card ground", () => {
    const css = read(CSS);
    const bare = cssBlock(css, ".bidmap .bm-eqnone {");
    for (const property of ["border", "box-shadow", "background"]) {
      expect(bare, property).not.toMatch(new RegExp(`(^|;)\\s*${property}\\s*:`));
    }
    // The positive control, and the RM3-AC-28e contrast in one: the FILTERED state deliberately does have
    // furniture, so "no furniture" is a property of this rule and not of the stylesheet in general.
    const furnished = cssBlock(css, ".bidmap .bm-eqfnone {");
    expect(furnished).toMatch(/border\s*:/);
    expect(furnished).toMatch(/background\s*:/);
  });
});

/* ═════════════════════════ RM3-AC-34 / RM3-AC-35 · the landing effect and the finite cue ═════════════════════════ */

describe("landing orients the renter and navigates nowhere (RM3-AC-34)", () => {
  const landing = region(read(WORKSPACE), "if (landedForBid.current === bid.id) return;", "}, [bid, fleet, listed]);");

  it("sets the selection and the cue — the positive control on the region", () => {
    expect(landing).toMatch(/landingSelectionId\(/);
    expect(landing).toMatch(/setSelectedMachineId\(\(cur\) => nextSelection\(cur, \{ kind: "land", id \}\)\)/);
    expect(landing).toMatch(/setCueId\(id\)/);
  });

  it("never opens a detail — `detailId` is untouched by the whole effect", () => {
    // "No detail opens" is the half of RM3-AC-34 nothing asserted. A `setDetailId(id)` here would take the
    // renter off the map he has just arrived at, before he has chosen anything.
    expect(landing).not.toMatch(/setDetailId/);
    expect(landing).not.toMatch(/setCompanyOpen/);
  });

  it("selects nothing at all when there is nothing to recommend", () => {
    // `landingSelectionId` returning null is a real answer — an accent and a nine-second pulse on an
    // arbitrary card read as a recommendation — and the effect must return before setting anything.
    expect(landing).toMatch(/if \(!id\) return;/);
    expect(landing.indexOf("if (!id) return;")).toBeLessThan(landing.indexOf("setSelectedMachineId("));
  });

  it("runs once per bid, so a fleet refetch cannot re-land over a choice already made", () => {
    expect(landing).toMatch(/landedForBid\.current = bid\.id/);
  });
});

describe("the landing cue is finite (RM3-AC-35)", () => {
  const css = read(CSS);
  const cue = cssBlock(css, ".bidmap .bm-eq.cue {");

  it("runs the cue keyframes exactly 6 times", () => {
    const shorthand = (cue.match(/animation\s*:\s*([^;]+)/) ?? [])[1] ?? "";
    expect(shorthand).toContain("bmCue");
    const bmCue = shorthand.split(",").find((part) => part.includes("bmCue")) as string;
    expect(bmCue.trim().split(/\s+/)).toContain("6");
  });

  it("contains no `infinite` on that animation, anywhere in its rule", () => {
    expect(cue).not.toMatch(/infinite/);
  });

  it("still HAS the keyframes it names — the positive control", () => {
    // Deleting `@keyframes bmCue` would make "no infinite" vacuously true.
    expect(css).toMatch(/@keyframes bmCue\s*\{/);
    // …and the stylesheet does use `infinite` elsewhere, so the assertion above is discriminating.
    expect(css).toMatch(/animation:[^;]*infinite/);
  });

  it("takes the class back off after LANDING_CUE_MS, so the cue cannot be restarted", () => {
    const timer = region(read(WORKSPACE), "if (!cueId) return;", "}, [cueId]);");
    expect(timer).toMatch(/setTimeout\(\(\) => setCueId\(null\), LANDING_CUE_MS\)/);
    expect(timer).toMatch(/clearTimeout\(timer\)/);
    expect(Number.isFinite(LANDING_CUE_MS)).toBe(true);
  });

  /* **Manual, and labelled so.** RM3-AC-35's second clause — *"the resting shadow is preserved across the
     cue, so the card never appears to shift"* — is a rendered-appearance fact. What CAN be asserted is
     that the keyframes never animate geometry and always carry the resting shadow first; the
     perceptual claim itself stays a visual check in T41. */
  it("animates no geometry, and rings without moving anything (the assertable part)", () => {
    const frames = css.slice(css.indexOf("@keyframes bmCue"), css.indexOf("}", css.indexOf("100%", css.indexOf("@keyframes bmCue"))));
    expect(frames).toMatch(/0%/);
    expect(frames).toMatch(/100%/);
    for (const stop of frames.split("\n").filter((l) => /\d+%/.test(l))) {
      // It was a two-shadow stack whose first layer carried the card's resting elevation. There are
      // no shadows now, so the cue is an outline — painted outside the box and taking no space,
      // which is the property that actually mattered: a pulsing card cannot nudge its neighbours.
      expect(stop, stop).toMatch(/outline/);
      expect(stop, stop).not.toMatch(/transform|margin|width|height|top|left/);
    }
  });
});

/* ═════════ RM3-AC-05 · the column above the list was condensed, not emptied (owner, 2026-08-11) ═════════
   *"It must be condensed. Consider users having 50 equipments: they want the space to see the
   equipment cards, not these."* How much space the five bands take is a rendered fact and stays a
   visual check; what is assertable — and what a "condense it" instruction actually endangers — is that
   nothing was condensed by being deleted. */

describe("the shortfall survived the condensing whole (RM3-AC-05)", () => {
  const alert = region(read(WORKSPACE), "{shortfall && (", "</button>");

  it("still states the DIFFERENCE, and still carries the ask", () => {
    // `shortfall.claimed` is the difference; `counts.offered` is the sentence's one plausible wrong
    // number, and it is not reachable from this model at all.
    expect(alert).toMatch(/shortfall\.claimed/);
    expect(alert).not.toMatch(/counts\.offered/);
    expect(alert).toMatch(/composeShortfallRequest\(\)/);
    expect(alert).toMatch(/t\.bidMap\.shortfallAction/);
    // …and the reason the control is inert, when it is, is still a sentence rather than a state on a
    // button — the line most at risk from a change made to save vertical space.
    expect(alert).toMatch(/shortfallPending && <div className="bm-short-s">/);
  });

  it("is still gated on `short` alone, so its ABSENCE still means nothing is claimed", () => {
    expect(strip(read(WORKSPACE))).toMatch(/const shortfall = counts \? shortfallAlert\(counts\) : null/);
  });
});

/* ═════════════════════════ RM3-AC-06 / RM3-AC-33 · the two colour rules, in the stylesheet ═════════════════════════ */

describe("the surface's stylesheet carries the same colour tokens the models do", () => {
  const css = read(CSS);
  const hex = (s: string) => s.toLowerCase();

  it("paints the shortfall alert orange, and nowhere near availability's red (RM3-AC-06)", () => {
    const alert = cssBlock(css, ".bidmap .bm-short {");
    // The stylesheet tints the token rather than naming a colour, so the alert is matched on it.
    expect(alert).toContain(SHORTFALL_COLOUR);
    // …and the token really is orange, resolved through the palette. A name proves nothing on its own.
    const { r, g, b } = channels(SHORTFALL_COLOUR)!;
    expect(r).toBeGreaterThan(150);
    expect(g).toBeGreaterThan(90);
    expect(g).toBeLessThan(r);
    expect(b).toBeLessThan(g);
    // And the availability red is not in the alert at all.
    expect(alert).not.toContain(AVAILABILITY_COLOUR.unconfirmed);
    // The sentence's ink is the same warm family, never the red. This assertion used to read
    // `.bm-short-ic` — the alert's warning glyph, which the v3 alignment removed on 2026-08-11 along
    // with the heading and the body paragraph (the prototype's alert is one line and a button). The
    // criterion is unchanged; only the element wearing the colour is, so the assertion followed it to
    // the line of text. `var(--brand-deep)` is the prototype's own ink for this sentence (decoded 3779) — a
    // darkened orange, and the check that matters is that it is warm and is not the availability red.
    const line = hex(cssBlock(css, ".bidmap .bm-short-t {"));
    expect(line).toContain("var(--warn-deep)");
    expect(line).not.toContain(AVAILABILITY_COLOUR.unconfirmed);
  });

  it("paints the ask's own control blue, never navy (RM3-AC-33)", () => {
    // The card's prompt takes its ink from the model inline (asserted in the card block above), so the
    // stylesheet's share of this rule is the layer's CTA — the one control the renter is meant to
    // press once the red has been explained to him. Beside a red explanation, navy reads as disabled.
    // Unscoped since 2026-09-05: the explainer is a MODAL portalled to `<body>`, so a `.bidmap`
    // ancestor would never match it. Same control, same rule.
    const cta = cssBlock(css, ".bm-eqyx-cta {");
    expect(hex(cta)).toContain(hex(REQUEST_ACTION_COLOUR));
    for (const navy of NAVY_TOKENS) expect(hex(cta)).not.toContain(navy);
  });

  it("has an availability red the stylesheet really does draw — the positive control", () => {
    // Both assertions above are negatives about `var(--danger)`. If the surface had stopped using it, they
    // would be vacuous.
    expect(css).toContain(AVAILABILITY_COLOUR.unconfirmed);
  });
});

/* ═════════════════════════ RM3-AC-49 · switching tab changes nothing else ═════════════════════════ */

describe("the chat dock's tab strip touches no map state (RM3-AC-49)", () => {
  const dock = strip(read(DOCK));

  it("is mounted with the enumerated props, and hands down no setter of the surface's own", () => {
    const mounted = region(read(WORKSPACE), "<ChatDock", "/>");
    const props = [...mounted.matchAll(/^\s*(\w+)=/gm)].map((m) => m[1]);
    // `onOutstandingAsks` joined the list with "one ask, one card" (owner, 2026-08-10): the channel
    // is the only record of the request cards and this component is the only reader of it, so the
    // outstanding asks have to travel UP from here.
    //
    // The six that follow it landed with the request card the same owner asked for on 2026-08-10 —
    // the review step («أرسل الطلب» / «إلغاء») and the press that opens the machine a card names.
    //
    // `dealRoomId` and `typeWord` joined on 2026-08-11, and neither is a handle on this surface:
    // one is the room the ask-send created (without it the dock waits on a feed for a room that
    // already exists, and the card the renter just confirmed lands in no stream he can see), the
    // other is the REQUEST's type word, which the `alternative` cards say. Both travel DOWN and
    // carry no callback back.
    //
    // Still ENUMERATED rather than allowed by a pattern, so a further prop fails this line whatever
    // it is called.
    expect(props.sort()).toEqual([
      "bid",
      "canOpenMachine",
      "dealRoomId",
      "draft",
      "draftBusy",
      "fleet",
      "groupKey",
      // `initialOpen` joined on 2026-08-26, when the chat icon on a bid card stopped opening the deal
      // room and started opening THIS dock (`?chat=1`). It travels down as an INITIAL state and
      // carries nothing back: the renter closing the dock must stay closed, and a tab press still
      // moves nothing on the surface.
      "initialOpen",
      "onCancelDraft",
      "onConfirmDraft",
      // `onOpenCompanyDocs` joined on 2026-08-19 with the dock's ⋮ kebab. It is a REPORT, not a
      // handle: the dock says the renter asked for the firm's papers and this surface decides that
      // the answer is V9's panel. The rule below still holds — no setter crosses the boundary.
      "onOpenCompanyDocs",
      "onOpenMachine",
      "onOutstandingAsks",
      "sendNonce",
      "typeWord",
    ]);
    // A raw setter handed down here is the one edit that would make a TAB PRESS move the map. What
    // is handed down instead is a set-writer and two named intentions of the surface's own, each of
    // which decides for itself what it does — see the next test for what still cannot move.
    expect(mounted).not.toMatch(/setSelected|setDetail|setFilter|setCue|onSelectMachine=|setCompanyOpen/);
    expect(mounted).toMatch(/onOutstandingAsks=\{setOutstandingAsks\}/);
    expect(mounted).toMatch(/onOpenMachine=\{openMachineFromChat\}/);
  });

  it("moves the surface only from the request card — never from the tab strip", () => {
    /* ── The rule, restated (owner, 2026-08-10) ──────────────────────────────────────────────────
       RM3-AC-49 is about the TAB STRIP: switching conversation must not move the map, the selection
       or the panel. It was previously enforced by the dock declaring exactly one callback and having
       no vocabulary for a machine at all — which also made the request card inert, and the owner
       asked for the opposite: pressing a card must take the reader to the machine it names.

       So the prohibition moves to where it belongs. The tab button's handler is proved to write the
       ACTIVE TAB and nothing else, and the machine-opening callback is proved to be reachable only
       from the card. */
    const tab = region(read(DOCK), 'role="tab"', "</button>");
    expect(tab).toMatch(/aria-selected=\{tab\.bidId === activeBidId\}/); // positive control
    const tabWrites = [...tab.matchAll(/on[A-Z]\w*=\{[^}]*\}/g)].map((m) => m[0]);
    expect(tabWrites).toEqual(["onClick={() => setActiveBidId(tab.bidId)}"]);

    /* `onOpenMachine` is handed to `RequestCard` and to nothing else — not to the tab, not to the
       composer, not to a message bubble. TWO mounts carry it: the sent card and the draft.

       There were three between the two rulings of 2026-08-11: the morning's *"the supplier response
       must arrive in the same format of the sent card but with supplier answer"* gave a reply a full
       card of its own, pressable for the same reason the ask is. The evening's ruling withdrew that
       card — *"make it one card for request and show his answer"* — so the answer is now a status row
       on the ask's card and there is one fewer thing to press. The rule this line guards did not
       change: the counts are asserted against each other, so a third consumer anywhere in the file
       fails it. */
    expect(dock.match(/<RequestCard/g)).toHaveLength(2);
    expect(dock.match(/onOpenMachine=\{onOpenMachine\}/g)).toHaveLength(2);
    // Eight mentions in all: the prop declaration, the destructure, the resolver that decides whether
    // a press is offered at all, its dependency, and the two `prop={prop}` pairs above. Anything
    // more is a second consumer, which is what this line exists to catch.
    expect(dock.match(/onOpenMachine/g)).toHaveLength(8);
  });

  it("declares callbacks that REPORT or ACT, and none that hands out map state", () => {
    const contract = region(read(DOCK), "export interface ChatDockProps {", "}");
    expect(contract).toMatch(/bid: BidCard/); // the positive control: the region is the real interface
    const callbacks = [...contract.matchAll(/^\s*(\w+)\??:.*=>/gm)].map((m) => m[1]);
    expect(callbacks.sort()).toEqual([
      "canOpenMachine",
      "onCancelDraft",
      "onConfirmDraft",
      // Reports that the renter asked for the company's papers, and names no surface — the workspace
      // answers it with V9's panel, and the dock cannot tell it to do anything else.
      "onOpenCompanyDocs",
      "onOpenMachine",
      "onOutstandingAsks",
    ]);
    // The outstanding-ask report's whole vocabulary is still a set of opaque strings: it carries no
    // id the surface could select on and no machine.
    expect(contract).toMatch(/onOutstandingAsks\?: \(identities: ReadonlySet<string>\) => void;/);
    // The two machine callbacks speak `equipmentId` and NOTHING else. No selection, no detail id, no
    // filter, no marker and no cue crosses this boundary — the surface decides what an open means.
    expect(contract).toMatch(/onOpenMachine\?: \(equipmentId: string\) => void;/);
    expect(contract).toMatch(/canOpenMachine\?: \(equipmentId: string\) => boolean;/);
    // `region` has already stripped the prose, so this sweeps the DECLARATIONS alone.
    expect(contract).not.toMatch(/selectedMachineId|detailId|filterIds|cueId|companyOpen|marker/i);
  });

  it("holds no selection, filter, detail or marker state of its own", () => {
    const states = [...dock.matchAll(/const \[(\w+), set\w+\] = useState/g)].map((m) => m[1]);
    expect(states.length).toBeGreaterThan(4); // it does hold state — the sweep is not vacuous
    expect(states).toContain("activeBidId"); // …including the tab it is switching between
    for (const state of states) {
      expect(state, state).not.toMatch(/selectedMachine|detailId|filterIds|cueId|companyOpen|marker/i);
    }
  });

  it("imports nothing that could derive or draw a marker", () => {
    for (const forbidden of ["machineMarkers", "MapCanvas", "nextSelection", "equipmentListView", "equipmentCardModel"]) {
      expect(dock, forbidden).not.toContain(forbidden);
    }
  });

  it("changes the tab and nothing else — the only writer on a tab press is its own activeBidId", () => {
    const onTab = [...dock.matchAll(/onClick=\{\(\) => \{?([^}]*)/g)].map((m) => m[1]).join(" ");
    expect(onTab.length).toBeGreaterThan(0);
    expect(onTab).not.toMatch(/setSelectedMachineId|setDetailId|setFilterIds|setCueId/);
  });
});

/* ═════════════ RM3-AC-17 · a review card stands between an ask and the write ═════════════ */

describe("no ask control on this surface writes — they compose (owner, 2026-08-10)", () => {
  const workspace = strip(read(WORKSPACE));

  it("posts from exactly ONE place, and that place is the confirm", () => {
    /* Before 2026-08-10 every ask control called the seam and the seam posted, so pressing «اطلب
       تأكيد التوفّر» created the deal room — a write that freezes the supplier's offered count
       (004a §4.5) — before the renter had seen what he was sending. RM3-AC-17 asks for a review card
       and there was none.

       One `sender.send(` in the file is the whole of that rule. A second one is an ask control that
       posts directly, which is exactly the shape the regression takes. */
    expect(workspace.match(/sender\.send\(/g)).toHaveLength(1);
    expect(region(read(WORKSPACE), "const confirmDraft = useCallback", "}, [sender,")).toMatch(/sender\.send\(draft\)/);
  });

  it("routes all four asks through the one composing seam", () => {
    // The shortfall alert, the list-foot ask, the card's «اطلب تأكيد التوفّر» and the panel's own
    // (`sendPanelRequest`, which the detail and both document surfaces share).
    expect(workspace.match(/composeDraft\(/g)?.length).toBeGreaterThanOrEqual(4);
    // …and none of them reaches past it. `renteeDraftStep` is the only thing that moves the staged
    // ask, so "composing never sends" is a property of the transition rather than of four handlers.
    const staged = [...workspace.matchAll(/setPendingDraft\(([^\n]*)/g)].map((m) => m[1].trim());
    expect(staged).toHaveLength(1); // the single `stage` writer
    expect(workspace.match(/renteeDraftStep\(/g)).toHaveLength(3); // compose · cancel · confirm
  });

  it("hands the staged ask to the dock, so the review card lives IN the conversation", () => {
    const mounted = region(read(WORKSPACE), "<ChatDock", "/>");
    expect(mounted).toMatch(/draft=\{pendingDraft\}/);
    expect(mounted).toMatch(/onConfirmDraft=\{confirmDraft\}/);
    expect(mounted).toMatch(/onCancelDraft=\{cancelDraft\}/);
  });

  it("creates no deal room on compose — the room is still the send's (004a §4.5)", () => {
    // `ensureDealRoom` is reachable from the sender alone. If this file learned to call it, an ask
    // control would be creating a room again, review card or not.
    expect(workspace).not.toContain("ensureDealRoom");
  });

  it("states the 409 as the rule, never as a failure (owner, 2026-08-11)", () => {
    /* ── The defect this pins ────────────────────────────────────────────────────────────────────
       The backend's `DEAL_ROOM_REQUEST_ALREADY_PENDING` went through the same red `role="alert"`
       box as a send that never left, and the owner met it on staging: a scarlet banner telling him
       his own "one ask, one card" rule had gone wrong. His ruling — the control adopts the blocked
       state and says the question is already with the supplier, NEVER a failure banner.

       So the two must not share a box, and `already_pending` must reach neither `.bm-sendfail` nor
       an alert role. The region is the whole of the reporting, anchored on both classes. */
    const reporting = region(read(WORKSPACE), "sender.error === \"already_pending\"", "bm-body");
    // Positive control: the region really is the branch, and it really does state the rule.
    expect(reporting).toContain("t.bidMap.requestAlreadyPending");
    expect(reporting).toContain("bm-sendnote");
    // The rule's own row is a STATUS. An `alert` interrupts a screen reader to announce a fault.
    expect(reporting).toMatch(/bm-sendnote" role="status"/);
    // …and it is not the red box. `.bm-sendfail` still exists — for a send that genuinely failed —
    // but nothing on the already-pending path may reach it.
    const beforeFail = reporting.slice(0, reporting.indexOf("bm-sendfail"));
    expect(beforeFail).not.toContain("requestFailed");
    expect(beforeFail).not.toContain("role=\"alert\"");
    // The blocked state is what actually answers the renter, and it is fed from the same 409: the
    // identity the backend refused is merged into the set every ask control reads.
    expect(workspace).toMatch(/sender\.alreadyPendingAsk\)\s*noteOutstanding\(sender\.alreadyPendingAsk\)/);
  });

  it("hands the dock the room the ask-send created, so the card has a stream to land in", () => {
    /* Owner's UAT, 2026-08-11: *"the card never showed in the thread"*. Sending an ask CREATES the
       deal room, and the dock could only learn of it from `GET /received-bids` — a wait that never
       ends when the anchor bid is off that feed's page. The sender already held the id; nothing
       carried it across. */
    const mounted = region(read(WORKSPACE), "<ChatDock", "/>");
    expect(mounted).toMatch(/dealRoomId=\{sender\.dealRoomId\}/);
  });
});

/* ── The distance is never stripped, and it is the card (owner, 2026-08-20 · 2026-08-28) ─────────
   ~~"Keep the not confirmed shown totally, not stripped."~~ superseded by the redesign that removed
   the chip it was about. The chip used to render «Not confirmed …» on exactly the cards whose open
   question is whether the machine is confirmed, because it shared a nowrap row with «Ask him to
   confirm» and was the only thing on it that could give.

   Nothing shares the distance's line now, so the class of bug is gone by construction rather than by
   a `flex-wrap`. What survives, and is pinned here, is the rule underneath both: the availability the
   card states must never be the thing that gets cut. */
describe("the distance and its state read whole at any panel width", () => {
  const css = read(CSS);

  it("gives the distance the column's full width, starting where every other line starts", () => {
    // ~~Centred and hugging its figure.~~ Withdrawn the same day it landed (owner, 2026-08-31): the
    // hug gave the text column three different left edges — readiness, distance, model — and the
    // empty space it removed was the card's own margin. One start, one end, three lines.
    const yard = cssBlock(css, ".bidmap .bm-eq .bm-eq-yard {");
    expect(yard).toMatch(/width:\s*100%/);
    expect(yard).toMatch(/justify-content:\s*flex-start/);
    expect(yard).toMatch(/text-align:\s*start/);
    // …and the readiness above it stretches to the same two edges rather than floating mid-row.
    expect(cssBlock(css, ".bidmap .bm-eq .bm-eq-rd {")).toMatch(/flex:\s*1/);
    expect(cssBlock(css, ".bidmap .bm-eq .bm-eq-rdbar {")).toMatch(/flex:\s*1/);
    // The card is a row — the picture in its 104px cell, the text beside it — and the text column is
    // the column: the corner control, the distance, the model and the foot each own their line.
    expect(cssBlock(css, ".bidmap .bm-eq .bm-eq-in {")).toMatch(/align-items:\s*stretch/);
    expect(cssBlock(css, ".bidmap .bm-eq .bm-eq-tx {")).toMatch(/flex-direction:\s*column/);
    // …and it can shrink, which is what lets the model line ellipsise rather than widen the card.
    expect(cssBlock(css, ".bidmap .bm-eq .bm-eq-tx {")).toMatch(/min-width:\s*0/);
  });

  it("puts the file's completeness on the first line and the machine's name on the last", () => {
    // ~~One dot per requirement~~ → a bar and its fraction (owner, 2026-08-31), and the corners the
    // owner named: the readiness on the first line's leading edge beside the control that opens the
    // papers it counts, the model and year in the bottom leading corner.
    expect(css).not.toMatch(/\.bm-eq-rdot/);
    expect(cssBlock(css, ".bidmap .bm-eq .bm-eq-hd {")).toMatch(/justify-content:\s*space-between/);
    expect(cssBlock(css, ".bidmap .bm-eq .bm-eq-rdbar {")).toMatch(/border-radius:\s*999px/);
    const model = cssBlock(css, ".bidmap .bm-eq .bm-eq-model {");
    expect(model).toMatch(/text-align:\s*start/);
    // `margin-top: auto` is what pins the name to the BOTTOM of a text column that may be taller.
    expect(model).toMatch(/margin-top:\s*auto/);
    // The colour is the readiness band's, never availability's — three bands, three fills.
    for (const band of ["green", "yellow", "red"]) {
      expect(css).toContain(`.bidmap .bm-eq .bm-eq-rd.${band} .bm-eq-rdfill`);
    }
  });

  it("marks a selected card by its OUTLINE, never by greying what it says", () => {
    // *"Selecting a card only highlight its borders but doesnt make it grey"* (owner, 2026-08-31).
    // The fill was the one channel of selection that touched the card's content — it cooled the
    // photograph's surround and every value on it, and the states here carry colour that must not
    // move. The border, the accent bar and the file control still say which card is chosen.
    const on = cssBlock(css, ".bidmap .bm-eq.on {");
    expect(on).toMatch(/background:\s*var\(--surface\)/);
    expect(on).toMatch(/border-color:\s*var\(--navy\)/);
  });

  it("keeps the panel's width and the resize floor in step", () => {
    // Two figures for one width: the CSS fallback governs an untouched surface, `PANEL_MIN_W` governs
    // the grip. A drift lets the renter drag the panel below the width the cards are drawn for.
    const cssW = /var\(--bm-panel-w,\s*(\d+)px\)/.exec(cssBlock(css, ".bidmap .bm-panel {"))?.[1];
    const floor = /const PANEL_MIN_W = (\d+);/.exec(read("src/components/map/BidMapWorkspace.tsx"))?.[1];
    expect(cssW).toBeTruthy();
    expect(floor).toBe(cssW);
  });
});
