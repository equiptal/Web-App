import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { en } from "@/lib/i18n/en";
import { ar } from "@/lib/i18n/ar";
import { PIN_REGISTRY } from "@/lib/uiPins";

/**
 * The intake's side panel: his own past requests, grouped by project.
 *
 * Owner, 2026-09-16, handing over `prototypes/intake-side-panel-v1.html`: *"can we remove the pills
 * and show a side panel of his requests like his previous chats, grouped by a project - show only
 * equipment names on the request ... just clicking on a project or a request inside it will show a
 * single pill showing project-request in one line"*, and *"add equipment image or icon with the unit
 * before the name like this 2 [ICON] EXCAVATOR 20 TON"*.
 *
 * ⚠️ Read from the SOURCE, the way `intake-floor.test.ts` reads its own screen. The component pulls
 * the rfq store, the session and three API calls, and what is under test is a set of RULINGS — which
 * element leads a row, which fit each kind of picture takes, what a press does. A render test would
 * mock five things to assert the same facts, and jsdom lays out no images to judge the rest.
 */

const SRC = resolve(__dirname, "../../src");
const rail = readFileSync(resolve(SRC, "components/create/RequestsRail.tsx"), "utf8");
const intake = readFileSync(resolve(SRC, "components/screens/Intake.tsx"), "utf8");

describe("the rail reaches nobody who is not using it", () => {
  it("Given a guest or a renter with no projects, Then nothing is drawn at all", () => {
    /**
     * No caption, no empty state, no band of chrome on the first screen anybody meets (owner,
     * 2026-09-16). The rule `ProjectChips` has followed since it was written.
     */
    expect(rail).toContain("shown: !!user && !!projects?.length");
    expect(rail).toContain("if (!rail.shown) return null;");
  });

  it("Given a failed read, Then the rail renders away rather than an error", () => {
    // He came here to write a request, not to be told a side panel could not load.
    const load = rail.slice(rail.indexOf("listProjects()"));
    expect(load.slice(0, 500)).toContain(".catch(");
    expect(load.slice(0, 500)).toContain("setProjects([]);");
  });
});

describe("a row reads: the count, the picture, then the machine", () => {
  it("Given a row, Then the quantity is drawn BEFORE the picture and the picture before the name", () => {
    /**
     * Owner's own shape: *"2 [ICON] EXCAVATOR 20 TON"*. Asserted as ORDER in the source, because
     * that is what the instruction was about — a name with its count somewhere after it is a
     * different row.
     */
    const row = rail.slice(rail.indexOf('pin("intake-rail-row")'));
    const qty = row.indexOf("{row.qty}");
    const art = row.indexOf("<MachineArt");
    const name = row.indexOf("{row.name}");
    expect(qty).toBeGreaterThan(-1);
    expect(art).toBeGreaterThan(qty);
    expect(name).toBeGreaterThan(art);
  });

  it("Given ONE unit, Then the count is still drawn", () => {
    /**
     * \u{1F534} REVERSES the same day (owner, 2026-09-17: *"for 1 unit still show 1 [icon] then name"*).
     * ~~Drawn only above one, because a column of «1» is noise.~~ Every row reads the same shape now:
     * a column of counts that skips some of its rows is harder to scan than one that repeats a 1 -
     * the eye reads down the number, not down the presence of it.
     */
    expect(rail).not.toContain("{row.qty > 1 &&");
    expect(rail).toContain("{row.qty}");
  });

  it("Given every project, Then it is OPEN when the rail arrives", () => {
    /**
     * Owner, 2026-09-17: *"by default make them opened"*. The set records what is SHUT, which is
     * what makes «all open» the state a fresh visit lands in without seeding it from a project list
     * that has not arrived yet.
     *
     * \u26a0\ufe0f And the chosen project no longer forces itself open. That override was needed while the
     * default was shut; with every group open it only overrules the renter - he shuts one, presses
     * its head, and it springs back.
     */
    expect(rail).toContain("isOpen: (id: string) => !shut.has(id)");
    expect(rail).toContain("const open = rail.isOpen(p.id);");
  });

  it("Given the panel, Then it runs the page height UNDER the header", () => {
    /**
     * Owner, 2026-09-17: *"for height make it along the page excpet the header"*, on a screenshot of
     * a panel that stopped mid-page with grey under it.
     *
     * \u{1F534} ~~Stretching to the row~~ made it as tall as the COLUMN beside it, which is a box of
     * content - so a short intake gave it a short panel, which is the card he photographed. The bar
     * is `sticky top-0 h-[52px]`, so 52 is where this starts and `100dvh - 52` is the room under it.
     *
     * \u26a0\ufe0f `dvh`, never `vh`: on a phone the address bar eats `vh` and a panel told it is taller
     * than the screen cannot be scrolled to its own foot.
     */
    expect(rail).toContain("lg:sticky lg:top-[52px]");
    expect(rail).toContain("lg:h-[calc(100dvh-52px)]");
  });

  it("Given the catalogue drawing, Then it is CONTAINED and scaled, never cropped", () => {
    /**
     * \u{1F534} One kind of asset now, so one fit. The app taxonomy carries the flat DRAWING, which has its
     * own transparent margin built in \u2014 cropping one enlarges the margin rather than the machine. The
     * 1.34 is the request rail own arithmetic: `contain` draws a 1.34:1 picture 18 x 13.4 in an 18px
     * box. ~~`isPhoto`~~ went with `my-requests`, which this no longer reads.
     */
    expect(rail).toContain("scale-[1.34] object-contain");
    /* ⚠️ The CLASS attribute, not the file. The note above this element names `object-cover` while
       saying it must never be used, so a bare `not.toContain` fails on its own explanation - the
       fourth time this repo has met that. */
    const img = rail.slice(rail.indexOf("<img"), rail.indexOf("</span>", rail.indexOf("<img")));
    expect(img).not.toContain("object-cover");
    // Scaling past the box is only safe because the tile clips. A CIRCLE since 2026-09-23 (owner:
    // *"show the equipment images as circles not squares"*); it clips just the same.
    expect(rail).toContain("overflow-hidden rounded-full");
  });

  it("Given a machine, Then its picture comes from the TAXONOMY and not from a past request", () => {
    /**
     * Owner, 2026-09-17: *"use the taxonamy image not this fallback icon"*.
     *
     * \u{1F534} The first cut matched his own requests by NAME and missed nearly every time, which is why
     * he was seeing the glyph: `itemName` joins the subtype and the size with a middot while the
     * chart runs the category in front of both, so the two strings are never equal. The tree is
     * matched by token containment instead, and it also covers a WORK ORDER, which has no request to
     * borrow a picture from.
     */
    expect(rail).toContain("iconForName(named, r.name)");
    expect(rail).toContain("/api/stores/taxonomy");
    expect(rail).not.toContain("fetchMyRequests");
  });

  it("Given a picture that 403s, Then the glyph replaces it rather than a broken image", () => {
    // The taxonomy's objects are not public-read on staging: a well-formed URL answers 403 and an
    // `<img>` absorbs that as «no artwork», drawing the browser's broken-image mark.
    expect(rail).toContain("onError={() => setFailed(true)}");
    expect(rail).toContain('if (!url || failed)');
    /* 🔴 The glyph is a DRAWN component now, not a name from the icon font (owner,
       2026-09-22: *"use nice icons not this"*). The RULE is unchanged - a machine with no
       picture still draws a stand-in rather than a broken image - and only its address moved. */
    expect(rail).toContain("<MachineGlyph");
  });
});

describe("what a press does", () => {
  it("Given a PROJECT press, Then its defaults are applied and no machine is typed", () => {
    const fn = rail.slice(rail.indexOf("const pressProject = useCallback"), rail.indexOf("const pressRow = useCallback"));
    expect(fn).toContain("actions.selectProject(p)");
    expect(fn).not.toContain("typeInto");
  });

  it("Given a MACHINE press, Then the template is applied by its own id and the name is typed", () => {
    /**
     * \u{1F534} Owner, 2026-09-16: *"the behaviour will not change from existing pills just ui"*. The rows
     * ARE the options `listTemplates` returns, and the press hands `fetchTemplateTerms` the option
     * itself \u2014 so nothing is matched by name and nothing can miss. This is
     * `ProjectChips.applyTemplate`, moved rather than rewritten.
     */
    const fn = rail.slice(rail.indexOf("const pressRow = useCallback"));
    expect(fn).toContain("fetchTemplateTerms(projectId, row.option)");
    expect(fn).toContain("actions.useTemplate(");
    expect(fn).toContain("await typeInto(");
    // The one thing looked up is the PICTURE, which is the only thing allowed to be absent.
    expect(rail).toContain("iconForName(named, r.name)");
  });

  it("Given the taxonomy lands AFTER the templates, Then the rows still draw their machines", () => {
    /**
     * \u{1F534} The bug of 2026-09-19 (owner: *"why the equipemtn images / icons not shown"*), and it is a
     * RACE: every project is opened on arrival, so the template reads and the taxonomy read are
     * fired in the same effect and the templates usually answer first. With the drawing baked in
     * inside `listTemplates`'s `.then`, `named` was `[]` for every row that was ever built and the
     * tree arriving a moment later re-created `load` without re-creating the cached rows - so the
     * glyph was permanent.
     *
     * The rule that fixes it: the cache holds no URL, and `rowsOf` looks it up against whatever the
     * tree holds AT THIS RENDER. jsdom runs no network here, so what is pinned is the shape.
     */
    const cached = rail.slice(rail.indexOf("const options = await listTemplates"), rail.indexOf("} catch {"));
    expect(cached, "a row must be cached WITHOUT its drawing").not.toContain("imageUrl");
    const read = rail.slice(rail.indexOf("const rowsOf = useCallback"), rail.indexOf("return useMemo("));
    expect(read).toContain("iconForName(named, r.name)");
    expect(read).toContain("[tpls, named]");
  });

  it("Given a machine the catalogue never named, Then its REFERENCE lists and is never typed", () => {
    /**
     * A template carries `ChartItem.label`, absent for an off-catalogue line. The row falls back to
     * the reference so it can still be recognised and pressed, and that reference must never reach
     * the box: it is the 12 x null bug of 2026-09-12 in a different costume.
     */
    expect(rail).toContain("const name = o.machine?.trim() || o.ref;");
    expect(rail).toContain("if (typable(machine)) {");
    const fn = rail.slice(rail.indexOf("const pressRow = useCallback"));
    // The terms apply either way; only the sentence is withheld.
    expect(fn.indexOf("actions.useTemplate(")).toBeLessThan(fn.indexOf("if (typable(machine))"));
  });

  it("Given the typewriter, Then the flag is lowered in a finally", () => {
    // It must not stick on: Mansour would perch on the box for the rest of the session.
    const type = rail.slice(rail.indexOf("const typeInto = useCallback"));
    expect(type.slice(0, 900)).toContain("} finally {");
    expect(type.slice(0, 900)).toContain("actions.setAgentTyping(false);");
  });
});

describe("the grip", () => {
  it("Given Arabic, Then the drag's sign flips", () => {
    // The grip is on the rail's TRAILING edge, which is the left one under `dir="rtl"`, so dragging
    // towards the page widens in one direction and narrows in the other.
    expect(rail).toContain('const rtl = document.documentElement.dir === "rtl";');
    expect(rail).toContain("rtl ? -moved : moved");
  });

  it("Given a drag, Then the pointer is CAPTURED", () => {
    // The pointer leaves a 7px strip on the first frame of any real drag; without capture the
    // `pointerup` that ends it never arrives and the drag sticks on.
    expect(rail).toContain("setPointerCapture(e.pointerId)");
  });

  it("Given a stored width, Then it goes through the same clamp a drag does", () => {
    // A stored value can be stale — an older floor, a hand-edited number.
    const read = rail.slice(rail.indexOf("window.localStorage.getItem(RAIL_KEY)"));
    expect(read.slice(0, 220)).toContain("Math.max(RAIL_MIN, Math.min(RAIL_MAX, saved))");
  });

  it("Given a private window, Then neither the read nor the write throws", () => {
    const reads = rail.match(/try \{/g) ?? [];
    expect(reads.length).toBeGreaterThanOrEqual(2);
  });
});

describe("the screen around it", () => {
  it("Given the intake, Then the rail is the first column and the box is centred beside it", () => {
    expect(intake).toContain("<RequestsRail rail={rail} />");
    // ONE hook for both surfaces, or they would disagree on which machine is chosen.
    expect(intake).toContain("const rail = useRequestRail();");
    expect(intake).toContain("<ProjectFloorChips rail={rail} />");
    /* Owner, 2026-09-17: *"side panel on the edge of the screen and feels like read panel not a
       card"*. The shell caps and gutters its main, which is right for a page and wrong for a
       panel, so the row breaks out to the window. Symmetric, so it needs no mirror rule. */
    expect(intake).toContain("mx-[calc(50%-50vw)]");
    expect(intake).toContain("w-screen");
    expect(intake).toContain("items-stretch");
  });

  it("Given the question, Then the line under it is gone", () => {
    expect(intake).not.toContain("t.intake.subheading");
    expect("subheading" in en.intake).toBe(false);
    expect("subheading" in ar.intake).toBe(false);
  });

  it("Given both locales, Then the rail's own strings exist and differ", () => {
    expect(en.intake.rail.title).toBeTruthy();
    expect(ar.intake.rail.title).toBeTruthy();
    expect(ar.intake.rail.title).not.toBe(en.intake.rail.title);
    // Two numbers, because one without the other says nothing about a list you are about to scroll.
    expect(en.intake.rail.count).toContain("{n}");
    expect(en.intake.rail.count).toContain("{g}");
    expect(ar.intake.rail.count).toContain("{n}");
    expect(ar.intake.rail.count).toContain("{g}");
  });

  it("Given the registry, Then every new element carries a pin", () => {
    for (const id of ["intake-rail", "intake-rail-group", "intake-rail-row", "intake-pick-pill"]) {
      expect(id in PIN_REGISTRY).toBe(true);
    }
    expect(rail).toContain('pin("intake-rail")');
    expect(rail).toContain('pin("intake-rail-group")');
    expect(rail).toContain('pin("intake-rail-row")');
    expect(rail).toContain('pin("intake-pick-pill")');
  });

  it("Given a phone, Then the rail opens as a SHEET behind a toggle", () => {
    /**
     * Owner, 2026-09-16: *"make it like claude or gpt it opend the pannel through --- in mobile"*.
     *
     * \u{1F534} This closes a hole the first cut left open: with the rail simply hidden below `lg` and the
     * chip strip deleted, a phone renter had no way to pick a project at all.
     */
    expect(rail).toContain("name=" + String.fromCharCode(34) + "menu" + String.fromCharCode(34));
    expect(rail).toContain("lg:hidden");
    expect(rail).toContain("fixed inset-y-0 start-0 z-50");
    // A layer over the page with no way out is a trap: a scrim, an X and Escape.
    expect(rail).toContain("Escape");
    expect(rail).toContain("bg-black/25");
    expect(intake).not.toContain("<ProjectChips");
  });
});
