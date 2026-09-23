import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * **The Terms panel, against the app's own terms page.**
 *
 * Owner: *"for terms panel ui from the terms in bid card, can u check how it is structured in the
 * app and align, like structure and language"*. The source is
 * `features/marketplace/presentation/widgets/terms_modal.dart` + `term_attribution_block.dart`.
 *
 * These read the SOURCE, which is what this component's rules are: which shape it draws and which
 * words it says. The counts behind it are `bucketBidTerms`, tested behaviourally in `bids.test.ts`,
 * and the two-sides split is `termSides`, tested there too — nothing is re-derived here.
 *
 * ⚠️ **Comments are stripped before every `not.toContain`.** This file's own prose names the tabs it
 * removed and the string it replaced, and an assertion that reads them fails on its own explanation.
 * Seventh time in this repo.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");
const strip = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const SRC = read("components/requests/BidTermsModal.tsx");
const TOKENS = readFileSync(join(__dirname, "..", "..", "src", "app", "globals.css"), "utf8");
const CODE = strip(SRC);

describe("the three states are STACKED, not tabbed", () => {
  /**
   * 🔴 The withdrawn shape: three buttons, one bucket on screen, opening on the first non-empty one.
   * The app stacks all three so the renter reads what is still open by looking down the page. A tab
   * strip would hide two thirds of the answer behind a press.
   */
  it("Given the panel, Then nothing picks ONE bucket to show", () => {
    expect(CODE).not.toContain("setActive");
    expect(CODE).not.toContain("firstNonEmpty");
    // Every non-empty group renders, in order.
    expect(CODE).toContain("groups\n          .filter((g) => byBucket[g.key].length > 0)");
  });

  it("Given the order, Then it is Conflict, then Pending review, then Matched", () => {
    const conflict = CODE.indexOf('key: "conflict"');
    const pending = CODE.indexOf('key: "pending" as Bucket');
    const matched = CODE.indexOf('key: "matched"');
    expect(conflict).toBeGreaterThan(-1);
    expect(pending).toBeGreaterThan(conflict);
    expect(matched).toBeGreaterThan(pending);
  });

  /** An off-platform bid answers Yes/No on a form: there is no room, so there is no pending state. */
  it("Given an off-platform bid, Then the Pending group is not offered at all", () => {
    expect(CODE).toContain("...(hidePending ? [] : [{ key: \"pending\" as Bucket");
  });
});

describe("the summary header", () => {
  /** The app draws all three pills whatever the counts, so the row keeps one shape across bids. */
  it("Given a state with nothing in it, Then its pill is still drawn, greyed", () => {
    expect(CODE).toContain("{groups.map((g) => {");
    expect(CODE).toContain('const tone = n > 0 ? TONE[g.key].c : "var(--muted-light)";');
  });

  it("Given no terms at all, Then the bar draws an empty track rather than nothing", () => {
    expect(CODE).toContain("total === 0");
  });
});

describe("every row names BOTH sides (TermAttributionBlock)", () => {
  /**
   * 🔴 This reverses the comparison's one-line rule of 2026-09-06 («show the renter's value alone
   * unless he offered another») FOR THIS PAGE ONLY. That rule was written for a cell with room for
   * one run; the app's terms row carries two chips, and the page has the width for them.
   */
  it("Given a term, Then the renter's chip and the supplier's are both drawn", () => {
    expect(CODE).toContain('role={L("Renter"');
    expect(CODE).toContain('role={L("Supplier"');
  });

  it("Given a side that has answered nothing, Then it says so rather than echoing a refusal", () => {
    expect(CODE).toContain('L("Not selected yet"');
    // `termSides` returns null for a refusal, which is what makes that placeholder honest.
    expect(CODE).toContain("termSides(row, ar)");
  });

  it("Given neither side set a value, Then one muted line replaces the pair", () => {
    expect(CODE).toContain('L("Not determined"');
  });

  /** Only a LOCK reads as a green pair. An equal but un-locked pair is the supplier's offer standing. */
  it("Given an un-locked equal pair, Then it is not painted as an agreement", () => {
    expect(CODE).toContain('if (state === "agreed") return "both";');
    expect(CODE).toContain('if (state === "matched") return offered ? "supplier" : "rentee";');
  });
});

describe("what the deal room did to the term", () => {
  it("Given the three captions, Then they are the app's own strings", () => {
    expect(CODE).toContain('L("Agreed in deal room"');
    expect(CODE).toContain('L("Updated by Supplier"');
    expect(CODE).toContain("L(\"Supplier hasn't responded\"");
  });

  /**
   * ⚠️ **Latin digits in both locales** (product rule, 2026-09-04). `ar` formats a date with
   * Arabic-Indic digits, so the locale must NOT be passed through to the formatter.
   */
  it("Given the date beside a caption, Then it is formatted Latin whatever the locale", () => {
    expect(CODE).toContain('new Intl.DateTimeFormat("en-GB"');
    expect(CODE).not.toContain('Intl.DateTimeFormat(ar ?');
  });
});

describe("the words are the app's", () => {
  it("Given the three states, Then they read as the app's ARB reads them", () => {
    // `termsStatePending` is «قيد المراجعة». The web had «بانتظار المراجعة», which is a second
    // spelling of one state across two clients.
    expect(CODE).toContain('L("Pending review", "قيد المراجعة")');
    expect(CODE).not.toContain("بانتظار المراجعة");
    expect(CODE).toContain('L("Conflict", "تعارض")');
    expect(CODE).toContain('L("Matched", "مطابق")');
  });

  /**
   * The app keeps TWO term vocabularies — `termsItemLabelFor` for this page and `termLabel*` for the
   * deal room — so porting its own map here is parity rather than drift. Keyed on the GROUP, because
   * a group can be filled by either of two rows and the app names the group.
   */
  it("Given a row, Then it is labelled the way the app's terms page labels it", () => {
    expect(CODE).toContain('payment: { en: "Payment Terms"');
    expect(CODE).toContain('breakdown: { en: "Breakdown Response SLA"');
    expect(CODE).toContain('certs: { en: "Equipment Certifications"');
    expect(CODE).toContain('operator: { en: "Operator"');
    expect(CODE).toContain("COUNTED_TERM_GROUP[r.key]");
  });

  /** A key the map has never heard of falls back to the row's own label — the off-platform case. */
  it("Given a term outside the six, Then it keeps its own label", () => {
    expect(CODE).toContain("return ar ? r.labelAr : r.labelEn;");
  });
});

describe("what did NOT change", () => {
  /**
   * The app's terms page is a route with its own back control; this is a dialog opened from the bid
   * card, and the button under it is the renter's way from reading the terms to acting on them.
   */
  it("Given the footer, Then the negotiate press survives", () => {
    expect(CODE).toContain("<DialogButton tone=\"primary\" full disabled={busy} onClick={onNegotiate}>");
  });

  /** One derivation, so the page and the card that opened it cannot report different counts. */
  it("Given the counts, Then they come from the bid card's own bucketing", () => {
    expect(CODE).toContain("bucketBidTerms(terms, negotiable, { all: allTerms })");
  });
});

describe("the two collapsible rows", () => {
  /** Requested certs are informational: a cert the renter asked for never gates a bid. */
  it("Given the certificates row, Then it lists what was REQUESTED, marking the ones held", () => {
    expect(CODE).toContain("ask.certsRequested.map");
    expect(CODE).toContain('L("Held"');
  });

  it("Given no ask in hand, Then both rows draw flat rather than half-built", () => {
    expect(CODE).toContain("const children = ask ? childRows(group, ask, L) : [];");
    expect(CODE).toContain("const canOpen = children.length > 0;");
  });

  it("Given the operator row, Then it carries the FAT split the request stated", () => {
    expect(CODE).toContain('L("Food"');
    expect(CODE).toContain('L("Accommodation / Transport"');
  });
});

describe("the three buckets' tones", () => {
  /**
   * 🔴 **PENDING is the SLATE, not the mustard** (owner, 2026-09-23: *"pending terms in the
   * terms modal must be grey or light blue not this yellow"*).
   *
   * Two reasons beyond the instruction:
   *   · `--warn` in this palette is a MUSTARD (#b98a1d), not the amber the app draws — the same
   *     mismatch corrected on the canvas ring (2026-09-08) and the off-catalogue box (2026-09-12) —
   *     and it is a FILL token, where `--warn-deep` is the one that may carry text.
   *   · Pending is not a WARNING. It is the ABSENCE of a verdict, and painted the colour of caution
   *     it read as a problem beside the red bucket directly above it.
   */
  it("Given the pending bucket, Then it takes `--info`, the palette's slate", () => {
    expect(CODE).toContain('pending: { c: "var(--info)", soft: "var(--info-soft)" }');
    expect(CODE).not.toContain("var(--warn)");
  });

  it("Given the other two, Then they are untouched", () => {
    // He named one bucket. Red still means a clash and green still means it is settled.
    expect(CODE).toContain('conflict: { c: "var(--danger)", soft: "var(--danger-soft)" }');
    expect(CODE).toContain('matched: { c: "var(--ok)", soft: "var(--ok-soft)" }');
  });

  it("Given the header's label sits ON its own soft ground, Then it passes AA", () => {
    /**
     * 🔴 The old pair FAILED it, which nobody had measured: `--warn` on `--warn-soft` is
     * **2.69:1**, under the 4.5 a normal-size label needs. `--info` on `--info-soft` is **6.46:1**.
     * So this was an accessibility fix wearing a colour change's clothes.
     * ⚠️ Measured from the tokens rather than asserted as a number in prose, so re-tinting
     * either one re-runs the sum instead of leaving a stale claim behind.
     */
    const root = TOKENS;
    const hex = (name: string) => {
      const m = root.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{3,8})`, "i"));
      if (!m) throw new Error(`--${name} is not declared in globals.css`);
      return m[1];
    };
    const lum = (h: string) => {
      const n = parseInt(h.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
        .map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
        .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    expect(ratio(hex("info"), hex("info-soft"))).toBeGreaterThanOrEqual(4.5);
    // The pair it replaces, kept as the record of why: it never passed.
    expect(ratio(hex("warn"), hex("warn-soft"))).toBeLessThan(4.5);
  });
});
