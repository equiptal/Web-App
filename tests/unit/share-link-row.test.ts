import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { en } from "@/lib/i18n/en";
import { ar } from "@/lib/i18n/ar";

/**
 * The share panel's link row: what stands on it, and in what order.
 *
 * Owner, 2026-09-12, on a screenshot of the row: *"the link placeholder field must be smaller
 * without this «Your shareable link is generated the moment you post your request», and the copy
 * button is part of the link placeholder so just copy icon inside the placeholder, and clicking it
 * will open small clear popup saying post the request first so the link is generated and u can
 * share the link. So now the expiry date is more dominant, make it the main cta in this row and
 * actually make it on the right and the link copy placeholder on the left."*
 *
 * ⚠️ These read the SOURCE. What is under test is a layout ruling — which element comes first, what
 * is inside what, and which tone each carries — and jsdom lays out nothing, so a render test would
 * mount the whole panel to assert facts it still could not measure. The BEHAVIOUR half (the copy
 * press raising the dialog) is exercised for real in `share-request-panel.test.tsx`.
 */

const SRC = resolve(__dirname, "../../src");
const panel = readFileSync(resolve(SRC, "components/share/ShareRequestPanel.tsx"), "utf8");
const mark = readFileSync(resolve(SRC, "components/ChannelMark.tsx"), "utf8");

/**
 * The panel with its comments removed.
 *
 * ⚠️ Half this file's history is written in its comments, and several of them QUOTE the code they
 * replaced. A sweep that cannot tell the two apart reports a rule as still broken because the note
 * explaining the fix mentions it — which is the opposite of what these cases are for.
 */
const code = panel.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the link field", () => {
  it("Given the field, Then the copy control is INSIDE it", () => {
    /**
     * 🔴 It was a bordered `btn("secondary", "md", { icon: true })` standing AFTER the field, so it
     * read as a fourth control on the row rather than as part of the thing it acts on.
     *
     * ⚠️ Read between two anchors rather than by nesting depth: the field opens at its lock glyph
     * and the row's next element is the expiry, so anything between the two is inside the field.
     */
    const open = panel.indexOf('{!uuid && <Icon name="lock"');
    const expiry = panel.indexOf("{showExpiry && (");
    const copy = panel.indexOf("content_copy");
    expect(open).toBeGreaterThan(-1);
    expect(copy).toBeGreaterThan(open);
    expect(copy).toBeLessThan(expiry);
    // The bordered button it used to be is gone, not merely moved.
    expect(code).not.toContain('btn("secondary", "md", { icon: true })');
  });

  it("Given no link yet, Then copy is still pressable and raises the dialog", () => {
    /**
     * 🔴 `disabled={!uuid}` is gone: a dead button beside a dead field says nothing about why.
     *
     * ⚠️ Asserted against the COMMENT-STRIPPED source. The phrase survives in a note explaining
     * what it used to be, and a test that cannot tell code from prose would pass the day somebody
     * puts the attribute back beside that note.
     */
    expect(code).not.toContain("disabled={!uuid}");
    expect(code).toContain("setLinkLocked(true)");
    expect(code).toContain("c.linkLockedTitle");
    expect(code).toContain("c.linkLockedBody");
  });

  it("Given the field, Then the standing sentence is gone from it", () => {
    // ~~`linkHint`, a line of prose living inside a placeholder.~~ The field had to be wide enough
    // to hold it, which is the width the owner was pointing at.
    expect(panel).not.toContain("linkHint");
    expect("linkHint" in en.intake.postShare).toBe(false);
    expect("linkHint" in ar.intake.postShare).toBe(false);
  });

  it("Given the field, Then it shares the heading’s LINE and ends at the card", () => {
    /**
     * 🔴 Owner, 2026-09-13, having asked twice: *"i wanna the share request - placeholder - expiry
     * to be in one line"*.
     *
     * ~~`basis-full`.~~ That is a flex line-break by another name - `flex-basis: 100%` fills the
     * row, so the heading is pushed above it and the deadline in the next cell floats across two
     * lines of nothing. It was written to answer «fit the card below» and over-answered: the field
     * matched the card by TAKING the whole of it.
     *
     * ⚠️ The COLUMN is what lines up with the card. This cell is the grid’s first column and the
     * supplier card beneath is the same column, so `flex-1` carries the field to the card’s end
     * while the heading keeps the leading edge.
     *
     * ⚠️ Read against the COMMENT-STRIPPED source: both rejected classes are quoted in the note
     * that explains their removal, and a test reading the raw file would pass on the prose.
     */
    expect(code).toContain("flex-1");
    expect(code).not.toContain("basis-full");
    expect(code).not.toContain("max-w-[380px]");
  });

  it("Given both locales, Then the dialog's two lines exist in each", () => {
    for (const d of [en, ar]) {
      expect(d.intake.postShare.linkLockedTitle).toBeTruthy();
      expect(d.intake.postShare.linkLockedBody).toBeTruthy();
    }
    expect(ar.intake.postShare.linkLockedTitle).not.toBe(en.intake.postShare.linkLockedTitle);
    // ⚠️ No trailing full stop in either: the house rule for every string a renter reads.
    for (const s of [en.intake.postShare.linkLockedBody, ar.intake.postShare.linkLockedBody]) {
      expect(s.endsWith(".")).toBe(false);
    }
  });
});

describe("the expiry leads the row", () => {
  it("Given the row, Then the expiry is drawn AFTER the link, as the grid’s second cell", () => {
    const link = panel.indexOf("{!uuid && <Icon name=\"lock\"");
    const expiry = panel.indexOf("{showExpiry && (");
    expect(link).toBeGreaterThan(-1);
    expect(expiry).toBeGreaterThan(link);
  });

  it("Given the expiry, Then it carries the brand tone, not the hairline it had", () => {
    /**
     * ⚠️ Brand GROUND and a brand edge, but deliberately not a filled button: the panel already
     * has one filled primary (Send, on the channel row) and a second would put two competing
     * presses on one card. Dominant within its row, and still a field.
     */
    const block = panel.slice(panel.indexOf("{showExpiry && ("), panel.indexOf("{showExpiry && (") + 900);
    expect(block).toContain("bg-brand-soft");
    expect(block).toContain("border-brand/45");
    expect(block).toContain("text-brand-deep");
    /**
     * 🔴 **No `ms-auto` any more** (owner, 2026-09-13: *"make it wider and on the beginning of the
     * preview card below it"*). Pushing it to the far end put the deadline wherever the link
     * happened to stop, which is nowhere in particular and lined up with no edge on the screen. The
     * row shares the GRID of the two columns beneath it now, so this cell starts on exactly the
     * same vertical as the preview card - at every width, in both directions, with nothing kept in
     * step by hand.
     */
    expect(block).not.toContain("ms-auto");
    expect(block).not.toContain("ml-auto");
    // ⚠️ `w-full` is the «wider»: the cell, not the control’s own contents.
    expect(block).toContain("w-full");
    const row = panel.slice(panel.indexOf("{showLink && ("), panel.indexOf("{showExpiry && ("));
    // The same template the two columns below it use — that is what does the aligning.
    expect(row).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]");
  });
});

describe("the three channels wear their own marks", () => {
  it("Given the component, Then it covers exactly the three the panel offers", () => {
    for (const n of ["outlook", "gmail", "whatsapp"]) expect(mark).toContain(`"${n}"`);
  });

  it("Given the chips, Then each names its mark instead of a house glyph", () => {
    /**
     * 🔴 Outlook took `mail` and Gmail `alternate_email` — two grey envelopes — on the one row
     * where the whole decision is WHICH account sends. WhatsApp had `chat`, which is every chat
     * app there is.
     */
    for (const n of ["outlook", "gmail", "whatsapp"]) expect(panel).toContain(`mark="${n}"`);
  });

  it("Given the send confirmation, Then Gmail is named there too", () => {
    // ⚠️ Gmail used to fall through to the grey envelope in the destination block while Outlook
    // wore its logo, so one dialog drew one destination by name and the other by category.
    expect(panel).toContain('mark={provider === "gmail" ? "gmail" : "outlook"}');
  });

  it("Given the marks, Then nothing writes a logo path by hand any more", () => {
    // One component, so the three cannot drift apart again through three call sites.
    expect(panel).not.toContain("/outlook-logo.webp");
    expect(mark).toContain("/outlook-logo.webp");
  });
});

describe("the deadline says what it DOES", () => {
  it("Given the label, Then it is a sentence about bidding, not a field name", () => {
    /**
     * 🔴 Owner, 2026-09-13: *"make the text as «set the deadline of your link so supplier cant bid
     * after it» or something like this"*. «Expiry date of your link» named a field and said nothing
     * about what leaving it empty means, or what setting it stops.
     */
    for (const d of [en, ar]) {
      expect(d.intake.postShare.expiry.length).toBeGreaterThan(24);
      // ⚠️ No trailing full stop, the house rule for every string a renter reads.
      expect(d.intake.postShare.expiry.endsWith(".")).toBe(false);
    }
    expect(en.intake.postShare.expiry.toLowerCase()).toContain("bid");
  });

  it("Given a screen reader, Then it still hears the FIELD, not the reason", () => {
    // ⚠️ `aria-label` keeps the short noun. A date input announced as a whole sentence tells the
    // listener why it exists and never what it is.
    expect(panel).toContain("aria-label={c.expiryName}");
    for (const d of [en, ar]) expect(d.intake.postShare.expiryName).toBeTruthy();
  });
});
