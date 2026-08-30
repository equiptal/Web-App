import { describe, it, expect } from "vitest";
import { decideTier } from "@/lib/agent/tier";
import { matchInBrowser, toQuickTaxonomy, MATCHER_RULES_HASH } from "@/lib/agent/quick-match";
import type { Taxonomy } from "@/lib/contract/taxonomy";

/**
 * The three tiers (W-T21 / W-T22).
 *
 * The rule that is easiest to get backwards: **the tier follows the SHAPE of the text, not whether a
 * project exists.** A project does not make a parse cheaper — a paragraph is a paragraph either way.
 * What a project changes is that the renter no longer has to write the paragraph.
 *
 * The one thing a project does decide: Tier 1 answers with no header, so without a site there is
 * nothing to fill one from and the full path is the only correct answer.
 */

const TAX: Taxonomy = [
  {
    id: "c-earth",
    name: "Earthmoving",
    subcategories: [
      { id: "s-crawler", name: "Crawler Excavator", measurements: [{ id: "z-20", name: "20 ton" }] },
      { id: "s-mini", name: "Mini Excavator", measurements: [] },
    ],
  },
  {
    id: "c-power",
    name: "Power",
    subcategories: [{ id: "s-gen", name: "Portable Generator", measurements: [{ id: "z-250", name: "250 kva" }] }],
  },
];

const base = { hasProject: true, hasFiles: false, taxonomy: TAX };

describe("which path the text takes", () => {
  it("one clean line, with a site → Tier 0, and no network at all", () => {
    const d = decideTier({ ...base, text: "2 crawler excavators 20t" });
    expect(d.tier).toBe(0);
    expect(d.match?.matched).toBe(true);
  });

  it("a line with something extra → Tier 1", () => {
    const d = decideTier({ ...base, text: "2 crawler excavators 20t with operator" });
    expect(d.tier).toBe(1);
    expect(d.reason).toBe("leftover_words");
  });

  it("a paragraph → Tier 2, even with a site", () => {
    // Sending prose to the equipment-only path loses whatever the renter wrote about dates or
    // terms, which is worse than the second it saves.
    const long = "I need two crawler excavators at twenty tons each ".repeat(5);
    expect(decideTier({ ...base, text: long }).tier).toBe(2);
  });

  it("no site → Tier 2, even for one clean line", () => {
    // Tier 1 answers with no header. Without a project there is nothing to fill one from, so the
    // renter gets exactly today's behaviour.
    const d = decideTier({ ...base, hasProject: false, text: "2 crawler excavators 20t" });
    expect(d.tier).toBe(2);
    expect(d.reason).toBe("no_project");
  });

  it("an attachment → Tier 2, whatever the text says", () => {
    const d = decideTier({ ...base, hasFiles: true, text: "2 crawler excavators 20t" });
    expect(d.tier).toBe(2);
    expect(d.reason).toBe("attachments");
  });

  it("falls to Tier 1 rather than crashing when the catalogue has not loaded", () => {
    const d = decideTier({ ...base, taxonomy: null, text: "2 crawler excavators 20t" });
    expect(d.tier).toBe(1);
  });
});

describe("the browser matcher", () => {
  it("resolves against the taxonomy the dropdowns already hold", () => {
    const r = matchInBrowser("2 crawler excavators 20t", TAX);
    expect(r.matched).toBe(true);
    if (!r.matched) return;
    expect(r.item.subcategoryId).toBe("s-crawler");
    expect(r.item.measurementId).toBe("z-20");
    expect(r.item.quantity).toBe(2);
  });

  it("keeps the agent's refusals — this is the same code, not a re-implementation", () => {
    // The value of sharing the module is that these still hold in a browser.
    expect(matchInBrowser("an excavator and a generator", TAX).matched).toBe(false);
    expect(matchInBrowser("حفارة", TAX).matched).toBe(false);
    expect(matchInBrowser("2 spaceships", TAX).matched).toBe(false);
  });

  it("scopes a size to its own subtype", () => {
    // "20 ton" belongs to Crawler Excavator here and to nothing else.
    expect(matchInBrowser("1 mini excavator 20t", TAX).matched).toBe(false);
  });

  it("memoises the index rather than rebuilding it per keystroke", () => {
    expect(toQuickTaxonomy(TAX)).toBe(toQuickTaxonomy(TAX));
  });

  it("carries the agent's rules hash, so a forked copy fails the build", () => {
    expect(MATCHER_RULES_HASH).toMatch(/^[0-9a-f]{12}$/);
  });
});
