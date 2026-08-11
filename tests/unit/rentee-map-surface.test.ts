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
    // SIX movers — press, open, land, bid change, filtered-out, and (2026-08-10) a request card in
    // the chat pressed to open the machine it names — and every one of them is the reducer's answer.
    // A `setSelectedMachineId` with no matching `nextSelection` is the rule written a second time,
    // which is how the two surfaces start disagreeing.
    const calls = workspace.match(/nextSelection\(/g) ?? [];
    const sets = [...workspace.matchAll(/setSelectedMachineId\(([^\n]*)/g)].map((m) => m[1].trim());
    expect(calls).toHaveLength(6);
    expect(sets).toHaveLength(calls.length);
    // …and none of them is handed a raw id, which is the shape a bypass would take.
    for (const arg of sets) expect(arg, arg).not.toMatch(/^(id|m\.equipmentId|equipmentId|null)\s*\)/);
    expect(workspace).toMatch(/const next = nextSelection\(selectedMachineId, \{ kind: "press", id \}\)/);
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

    // `onOpenMachine` is handed to `RequestCard` and to nothing else — not to the tab, not to the
    // composer, not to a message bubble. Two mounts carry it (the sent card and the draft), and the
    // counts are asserted against each other so a third consumer anywhere in the file fails the line.
    expect(dock.match(/<RequestCard/g)).toHaveLength(2);
    expect(dock.match(/onOpenMachine=\{onOpenMachine\}/g)).toHaveLength(2);
    // Eight mentions in all: the prop declaration, the destructure, the resolver that decides whether
    // a press is offered at all, its dependency, and the two `prop={prop}` pairs above. Anything more
    // is a second consumer, which is what this line exists to catch.
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
