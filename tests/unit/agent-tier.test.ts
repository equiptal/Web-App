import { describe, it, expect } from "vitest";
import { decideTier } from "@/lib/agent/tier";
import { matchInBrowser, toQuickTaxonomy, MATCHER_RULES_HASH } from "@/lib/agent/quick-match";
import { certsInText } from "@/lib/agent/quick-certs";
import { quickItemsToDraft } from "@/lib/agent/quick-draft";
import type { Taxonomy } from "@/lib/contract/taxonomy";

/**
 * The three tiers (W-T21 / W-T22).
 *
 * The rule that is easiest to get backwards: **the tier follows the SHAPE of the text, not whether a
 * project exists.** A project does not make a parse cheaper — a paragraph is a paragraph either way.
 * What a project changes is that the renter no longer has to write the paragraph.
 *
 * The one thing a project decides: Tier 1 needs one, Tier 0 does not. Tier 0 answers only when it
 * consumed the whole line, so there is no header in it either way; Tier 1 fires on LEFTOVER words,
 * which might be the header, and without a project nothing else would supply them.
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
    /* ~~«2 crawler excavators 20t with operator».~~ Changed, because that example is now Tier 2 by
       design: the equipment-only prompt emits no operator field, so the fast path would drop the one
       word that made this line worth a second call. The extra here is a PERIOD, which Tier 1's
       leftover words legitimately are — the header the project supplies. */
    const d = decideTier({ ...base, text: "2 crawler excavators 20t for 3 weeks" });
    expect(d.tier).toBe(1);
    expect(d.reason).toBe("leftover_words");
  });

  it("a paragraph → Tier 2, even with a site", () => {
    // Sending prose to the equipment-only path loses whatever the renter wrote about dates or
    // terms, which is worse than the second it saves.
    const long = "I need two crawler excavators at twenty tons each ".repeat(5);
    expect(decideTier({ ...base, text: long }).tier).toBe(2);
  });

  it("no site is NO obstacle to Tier 0 — this is the launch-day case", () => {
    // The line is fully consumed, so there is no header in it for a model to find. The full path
    // would return the same empty header four seconds later. Gating this on a project made
    // "2 forklifts" slow for every renter who has not set one up yet.
    const d = decideTier({ ...base, hasProject: false, text: "2 crawler excavators 20t" });
    expect(d.tier).toBe(0);
  });

  it("no site DOES stop Tier 1, because the leftovers might be the header", () => {
    // "for two weeks" is a duration the equipment-only prompt would drop, and with no project
    // nothing else supplies it. Losing something the renter typed is not worth a second.
    const d = decideTier({ ...base, hasProject: false, text: "2 crawler excavators 20t for two weeks" });
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

/* ============================================================================================== *
 * A line that names a TERM cannot take the fast path
 * ============================================================================================== */

describe("terms in the text", () => {
  /* ⚠️ Not a guess about the model. The equipment-only prompt forbids these fields in writing —
     *"no operator, fuel, diesel, mobilization or demobilization fields"* — and that section is
     appended LAST on purpose, so it beats the item rules above it that would otherwise map them.

     Certificates USED to be on this list and are not any more. Routing them here was right about the
     loss and wrong about the price: measured on staging, the same five words cost 2.6 s with an empty
     cert on the fast path and 28.0 s with the cert on the full one. `quick-certs.ts` reads them in
     the browser instead, so the fast answer is now a correct fast answer. */

  it("sends an OPERATOR line to the full path — nothing else can answer it", () => {
    const d = decideTier({ ...base, text: "crawler excavator 30 ton with operator" });
    expect(d.tier).toBe(2);
    expect(d.reason).toBe("terms_in_text");
  });

  it("catches every family of term the fast path still drops", () => {
    for (const text of [
      "crane 50 ton with operator",
      "generator 250 kva, delivery by supplier",
      "excavator 20 ton, fuel on them",
      "حفار 30 طن مع مشغل", // "excavator 30 ton with operator"
    ]) {
      expect(decideTier({ ...base, text }).tier, text).toBe(2);
    }
  });

  it("no longer sends a CERTIFICATE line to the 28-second path", () => {
    // The reported line. It is the fast path's again, and the cert is read in the browser.
    const d = decideTier({ ...base, text: "crawler excavator 30 ton with tuv" });
    expect(d.tier, "not the full path any more").not.toBe(2);
  });

  it("still lets a bare machine line take the fast path", () => {
    const d = decideTier({ ...base, text: "2 crawler excavators 30 ton and a generator" });
    expect(d.tier).not.toBe(2);
  });

  it("does not fire on a term-free line that the matcher consumed whole", () => {
    const d = decideTier({ ...base, text: "2 crawler excavators 20t" });
    expect(d.tier).toBe(0);
  });
});

/* ============================================================================================== *
 * The certificates, read in the browser
 * ============================================================================================== */

describe("certificates read in the browser", () => {
  it("reads the two real equipment marks", () => {
    expect(certsInText("crawler excavator 30 ton with tuv")).toEqual(["tuv"]);
    expect(certsInText("excavator, TÜV certified")).toEqual(["tuv"]);
    expect(certsInText("loader aramco approved")).toEqual(["aramco"]);
    expect(certsInText("crane with tuv and aramco")).toEqual(["tuv", "aramco"]);
  });

  it("reads them in Arabic", () => {
    expect(certsInText("حفار مع أرامكو")).toEqual(["aramco"]);
  });

  it("does not fire inside another word", () => {
    // A plain substring test would read a supplier called «Tuvex» as a certificate.
    expect(certsInText("2 excavators from Tuvex Rentals")).toEqual([]);
    expect(certsInText("shipping to Tuvalu")).toEqual([]);
  });

  it("says nothing when nothing was named", () => {
    expect(certsInText("2 crawler excavators 30 ton")).toEqual([]);
    expect(certsInText("")).toEqual([]);
  });

  it("does not invent SPSP or SASO as equipment marks", () => {
    /* They are OPERATOR licence levels in this product — `SAFETY_CERTIFICATES` holds tuv, aramco and
       other — and putting an operator cert in an equipment field is the exact confusion the agent's
       own rules spend a paragraph preventing. */
    expect(certsInText("excavator with spsp")).toEqual([]);
    expect(certsInText("excavator with saso")).toEqual([]);
  });
});

/* ============================================================================================== *
 * …and onto the draft the fast paths hand back
 * ============================================================================================== */

describe("the cert on a fast-path draft", () => {
  const quick = (certs?: unknown) => ({
    tier: 1 as const,
    line_items: [
      {
        input_equipment: "crawler excavator 30 ton with tuv",
        subtype: "Crawler Excavator",
        capacity: "30 ton",
        quantity: 1,
        ...(certs === undefined ? {} : { safety_certifications: certs }),
      },
    ],
  });

  it("fills the gap the prompt leaves", () => {
    // What the live fast path returns for this line: the key present, the value empty.
    const d = quickItemsToDraft(quick([]) as never, null, "crawler excavator 30 ton with tuv");
    expect(d.items[0].safetyCertsOverride).toEqual(["tuv"]);
  });

  it("defers to the agent when the agent answered", () => {
    /* A narrow reader must never overrule a broad one: the agent read the whole sentence, this read
       four words of it. If it comes back with a cert, that stands even where the two disagree. */
    const d = quickItemsToDraft(quick(["aramco"]) as never, null, "crawler excavator with tuv");
    expect(d.items[0].safetyCertsOverride).not.toEqual(["tuv"]);
  });

  it("leaves a cert-free line alone", () => {
    const d = quickItemsToDraft(quick([]) as never, null, "2 crawler excavators 30 ton");
    expect(d.items[0].safetyCertsOverride ?? null).toBeNull();
  });
});
