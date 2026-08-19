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
import { LANDING_CUE_MS, REQUEST_ACTION_COLOUR, SHORTFALL_COLOUR } from "@/lib/contract/bid-map";

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
    // The mutation: "make it more visible" answered with `background: #2563EB` on the disc, or worse
    // with a green/red of its own. Either turns "the one being looked at" into something a machine IS.
    for (const rule of selectedRules) {
      for (const availability of ["#16a34a", "#d9362a", "rgba(22, 163, 74", "rgba(217, 54, 42"]) {
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

/* ═════════ the card's controls are the CARD's, not floating on it (owner, 2026-08-11) ═════════ */

describe("the card's controls each keep a row, and both keep their rules", () => {
  const list = strip(read(LIST));
  const css = read(CSS);

  // ── Superseded twice, and the second one is the v3 prototype's own card ──────────────────────
  // ~~"puts both controls in one cluster on the distance row"~~ (owner, 2026-08-11) — withdrawn on
  // sight: *"for the asked make it beside not confirmed"*, *"the details button make it as before"*.
  // ~~"«التفاصيل» alone on the distance row"~~ (same day) — withdrawn 2026-08-19 against
  // `app-decoded.js:4009`, which draws it on the TITLE row. What cured the "floating" pill was the
  // `#F2F6FA` ground it gained, not the row it was moved to, and the ground travels with it.
  //
  // The rule that survived both moves is the one being pinned here: row 3 carries the distance and
  // nothing else. It is `nowrap`, so any control sharing it clips the distance mid-word — and the
  // distance is the fact this list is sorted on.
  it("puts the ask beside the availability chip, «التفاصيل» on the title row, and NOTHING beside the distance", () => {
    const r1 = region(read(LIST), '<div className="bm-eq-r1">', '<div className="bm-eq-r2">');
    const r2 = region(read(LIST), '<div className="bm-eq-r2">', '<div className="bm-eq-r3">');
    const r3 = region(read(LIST), '<div className="bm-eq-r3">', '<div className="bm-eq-r4">');
    // Details rides the trailing edge of the title, which is where the reader's eye already is.
    expect(r1).toMatch(/bm-eq-acts/);
    expect(r1).toMatch(/bm-eq-details/);
    // The ask answers the chip, so it shares the chip's row…
    expect(r2).toMatch(/bm-eq-chip/);
    expect(r2).toMatch(/bm-eq-ask/);
    // …and neither control is left on the distance row, which is now the distance alone.
    expect(r3).not.toMatch(/bm-eq-ask/);
    expect(r3).not.toMatch(/bm-eq-details/);
    expect(r3).not.toMatch(/bm-eq-acts/);
  });

  /* ── «في هذا العرض» rides the PHOTO, and row 2 is why (owner, 2026-08-19) ──────────────────────
     Rendered against fixtures at the panel's real 392px, row 2 does not fit: the text column is 262px
     and the availability chip, this badge and «اطلب التأكيد» need about 278. What gave way was the
     chip — truncated to «لم يؤكد تو…» on exactly the cards where availability is the open question,
     to make room for a fact the count pills above already state.

     The badge did not go: it answers a different question from the chip (app parity, 2026-08-17) and
     folding the two made one of them lie. It moved to the photo, the card's only unused surface.

     Pinned because the constraint is invisible in the markup — a later edit could move it back into
     row 2, and everything would still typecheck, render and read fine on a wide panel. */
  it("puts the in-offer badge on the PHOTO, never back on the state row", () => {
    const src = read(LIST);
    const photo = region(src, "className={`bm-eq-photo", '<div className="bm-eq-tx">');
    const r2 = region(src, '<div className="bm-eq-r2">', '<div className="bm-eq-r3">');
    expect(photo).toMatch(/bm-eq-inoffer/);
    expect(r2).not.toMatch(/bm-eq-inoffer/);
    // …and it is positioned onto the picture rather than sitting in the cell's flow.
    expect(cssBlock(read(CSS), ".bidmap .bm-eq .bm-eq-inoffer {")).toMatch(/position:\s*absolute/);
  });

  it("keeps «اطلب التأكيد» a REAL button on the card, so an unconfirmed machine is askable without opening it (RM3-AC-13)", () => {
    // The mutation the move could have introduced: the ask demoted to a link into the detail, or
    // dropped under the stretched open layer where the card's own press would swallow it.
    expect(list).toMatch(/\{askAvailability && \(\s*<button/);
    expect(list).toMatch(/onClick=\{\(\) => onAskAvailability\?\.\(machine\)\}/);
    expect(cssBlock(css, ".bidmap .bm-eq .bm-eq-ask {")).toMatch(/pointer-events:\s*auto/);
    expect(cssBlock(css, ".bidmap .bm-eq .bm-eq-details {")).toMatch(/pointer-events:\s*auto/);
  });

  it("still takes the ask's colour from the model, never from the stylesheet (RM3-AC-33)", () => {
    // The ground the control gained is the stylesheet's; the INK is still `askAvailability.colour`,
    // which is the one place RM3-AC-33 is decided.
    expect(list).toMatch(/style=\{\{ color: askAvailability\.colour \}\}/);
  });

  it("keeps the card exactly four rows, so every card in the column is still one height (RM3-AC-32)", () => {
    // The cluster had to cost nothing: a fifth row for two controls would have been a worse answer to
    // "give the list its room" than the floating controls it replaced.
    for (const row of ["bm-eq-r1", "bm-eq-r2", "bm-eq-r3", "bm-eq-r4"]) expect(list, row).toContain(row);
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
  it("animates no geometry, and carries the resting shadow in every keyframe (the assertable part)", () => {
    const frames = css.slice(css.indexOf("@keyframes bmCue"), css.indexOf("}", css.indexOf("100%", css.indexOf("@keyframes bmCue"))));
    expect(frames).toMatch(/0%/);
    expect(frames).toMatch(/100%/);
    for (const stop of frames.split("\n").filter((l) => /\d+%/.test(l))) {
      expect(stop, stop).toMatch(/var\(--eq-rest\)/);
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
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(SHORTFALL_COLOUR.slice(i, i + 2), 16));
    // The stylesheet writes the token as an rgba tint, so it is matched by channel rather than by hex.
    expect(alert).toContain(`rgba(${r}, ${g}, ${b}`);
    // And the availability red is not in the alert at all, in either notation.
    expect(hex(alert)).not.toContain("d9362a");
    expect(alert).not.toContain("rgba(217, 54, 42");
    // The sentence's ink is the same warm family, never the red. This assertion used to read
    // `.bm-short-ic` — the alert's warning glyph, which the v3 alignment removed on 2026-08-11 along
    // with the heading and the body paragraph (the prototype's alert is one line and a button). The
    // criterion is unchanged; only the element wearing the colour is, so the assertion followed it to
    // the line of text. `#8a4f08` is the prototype's own ink for this sentence (decoded 3779) — a
    // darkened orange, and the check that matters is that it is warm and is not the availability red.
    const line = hex(cssBlock(css, ".bidmap .bm-short-t {"));
    expect(line).toContain("#8a4f08");
    expect(line).not.toContain("d9362a");
  });

  it("paints the card's ask blue, never navy (RM3-AC-33)", () => {
    const ask = cssBlock(css, ".bidmap .bm-eq .bm-eq-ask {");
    expect(hex(ask)).toContain(hex(REQUEST_ACTION_COLOUR));
    for (const navy of ["#16304f", "#1c3550", "#0f2238"]) expect(hex(ask)).not.toContain(navy);
  });

  it("has an availability red the stylesheet really does draw — the positive control", () => {
    // Both assertions above are negatives about `#D9362A`. If the surface had stopped using it, they
    // would be vacuous.
    expect(hex(css)).toContain("d9362a");
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

/* ── The availability chip is never stripped (owner, 2026-08-20) ─────────────────────────────────
   *"Keep the not confirmed shown totally, not stripped."*

   The chip had been rendering «Not confirmed …» on exactly the cards whose open question is whether
   the machine is confirmed — because `.bm-eq-ask` carries `flex-shrink: 0` and the chip did not, so
   when «Ask him to confirm» and the chip could not both fit on one nowrap line, the CHIP was what
   gave way.

   Widening the panel fixed the symptom at one width. These pin the RULE, which holds at every width:
   nothing on row 2 shrinks, and the row wraps instead. */
describe("the availability chip reads whole at any panel width", () => {
  const css = read(CSS);

  it("lets row 2 wrap rather than squeezing what is on it", () => {
    const r2 = cssBlock(css, ".bidmap .bm-eq .bm-eq-r2 {");
    expect(r2).toMatch(/flex-wrap:\s*wrap/);
    // A row that wraps needs a row-gap, or the two lines touch.
    expect(r2).toMatch(/gap:\s*\d+px\s+\d+px/);
  });

  it("never lets the chip be the thing that gives", () => {
    expect(cssBlock(css, ".bidmap .bm-eq .bm-eq-chip {")).toMatch(/flex-shrink:\s*0/);
  });

  it("truncates the chip's label nowhere — an ellipsis is still a stripped label", () => {
    const label = cssBlock(css, ".bidmap .bm-eq .bm-eq-chip .bm-eq-chip-l {");
    expect(label).not.toMatch(/text-overflow/);
    expect(label).not.toMatch(/overflow:\s*hidden/);
    // `nowrap` stays: the label breaking across two lines inside a capsule is its own kind of wrong.
    expect(label).toMatch(/white-space:\s*nowrap/);
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
