import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { containsPhoneNumber, digitRuns } from "@/lib/contract/contact-guard";

/**
 * The deal-room contact guard, ported verbatim from the app's `contact_guard.dart` (2026-09-21).
 *
 * ⚠️ **THE FIXTURES BELOW ARE THE CONTRACT.** The same rule is written in Dart today and is owed a
 * third time in TypeScript for Stream's pre-send hook, which is the half covering old builds and any
 * client we do not own. They WILL drift unless the cases move together: anything added here must be
 * added to the app's `contact_guard_test.dart`, and vice versa.
 */

describe("digitRuns", () => {
  /* Separators hold a run together BETWEEN digits only. Two in a row, or one before any digit, end
     it — otherwise «١٨٠٠ ريال و ٥٠٠» would fuse two prices into one long number. */
  it("folds separators inside a run and breaks on anything else", () => {
    expect(digitRuns("053 757 6005")).toEqual(["0537576005"]);
    expect(digitRuns("053-757-6005")).toEqual(["0537576005"]);
    /* 🔴 **TWO separators in a row END the run**, so a bracketed number splits — `053` then
       `7576005` — and `containsPhoneNumber` does NOT match it. The app behaves identically (its
       `sawDigitSinceSeparator` flushes on the second), so this is the rule rather than a defect in
       the port; it is written down here because it is a real gap in v1 and the obvious "fix" would
       silently diverge the two clients. */
    expect(digitRuns("(053) 757 6005")).toEqual(["053", "7576005"]);
    expect(containsPhoneNumber("(053) 757 6005")).toBe(false);
    // A letter BREAKS a run, which is what keeps an equipment model out of this entirely.
    expect(digitRuns("JLG 460SJ")).toEqual(["460"]);
    expect(digitRuns("1800 SAR and 500")).toEqual(["1800", "500"]);
  });

  /* ⚠️ Without the fold the guard is bypassed by typing the number in Arabic numerals, which is one
     keyboard tap away on every phone sold here. */
  it("folds Arabic-Indic and Eastern Arabic-Indic digits to ASCII", () => {
    expect(digitRuns("٠٥٣٧٥٧٦٠٠٥")).toEqual(["0537576005"]);
    expect(digitRuns("۰۵۳۷۵۷۶۰۰۵")).toEqual(["0537576005"]);
  });

  /* The comma is a separator, which is what stops a price becoming one four-digit run rather than
     two shorter ones. */
  it("treats a thousands comma as a separator inside the run", () => {
    expect(digitRuns("1,800")).toEqual(["1800"]);
  });
});

describe("containsPhoneNumber", () => {
  it("matches the three Saudi mobile shapes, each as a WHOLE run", () => {
    expect(containsPhoneNumber("call me on 0537576005")).toBe(true);
    expect(containsPhoneNumber("966537576005")).toBe(true);
    expect(containsPhoneNumber("+966 53 757 6005")).toBe(true);
    expect(containsPhoneNumber("537576005")).toBe(true);
    expect(containsPhoneNumber("رقمي ٠٥٣٧٥٧٦٠٠٥")).toBe(true);
  });

  /* 🔴 Never as a SUBSTRING of a longer run, or a 15-digit VAT number and a 10-digit commercial
     register both read as a phone. */
  it("refuses a longer figure that merely contains a phone-shaped run", () => {
    expect(containsPhoneNumber("VAT 300537576005003")).toBe(false);
    expect(containsPhoneNumber("CR 10537576005")).toBe(false);
  });

  it("leaves ordinary deal-room numbers alone", () => {
    expect(containsPhoneNumber("1,800 SAR per day")).toBe(false);
    expect(containsPhoneNumber("JLG 460SJ, 2 units, 14 days")).toBe(false);
    expect(containsPhoneNumber("")).toBe(false);
    expect(containsPhoneNumber("219,075.00")).toBe(false);
  });

  /* 🔴 **Deliberately NOT matched, and they are real evasions:** digits spelled out in words, a
     number split across two messages, and landlines. Chasing them in v1 buys false positives, and
     the answer to a determined evader is the detection log, not a cleverer regex. */
  it("does not chase the evasions v1 declines to chase", () => {
    expect(containsPhoneNumber("صفر خمسة ثلاثة سبعة")).toBe(false);
    expect(containsPhoneNumber("0537 then the rest next message")).toBe(false);
    expect(containsPhoneNumber("011 4567890")).toBe(false);
  });

  /* ⚠️ **One known false positive, accepted:** a bare figure of exactly nine digits beginning with
     5 — five hundred million and change — reads as a phone. No rental in this product is priced
     there, and the alternative is letting the bare national form through. */
  it("accepts its one documented false positive rather than dropping the bare national form", () => {
    expect(containsPhoneNumber("500000000")).toBe(true);
  });
});

describe("where the guard runs", () => {
  const DOCK = readFileSync("src/components/map/ChatDock.tsx", "utf8");

  /* 🔴 **THE RENTER IS WARNED, NEVER BLOCKED.** The policy is asymmetric and enforced on the server:
     the renter always gets the SUPPLIER's number and her own is withheld until the deal closes. The
     chat is Stream and never passes through that gate. Sharing hers early is her call; the
     platform's job is to say she does not need to. */
  it("asks before sending, and sending anyway is a real way through", () => {
    expect(DOCK).toContain("if (containsPhoneNumber(body) && !contactWarned) { setContactAsk(true); return; }");
    expect(DOCK).toContain('L("Share anyway", "مشاركة على أي حال")');
    expect(DOCK).toContain('L("Got it", "حسناً")');
  });

  /* 🔴 **A WRAPPER, not a branch inside `send`.** `send` is one of the three senders RM3-AC-47 pins
     to the single `deliver` seam — the one function allowed to create a deal room — so the guard
     sits in FRONT of it and the seam keeps exactly its three callers. ⚠️ And `contactWarned` is read
     off the CLOSURE, which is why «Share anyway» calls `send` directly: coming back through the
     wrapper it would still see `false` on the render that opened the dialog and would re-ask the
     question it has just answered. */
  it("guards in front of the sender rather than inside it, and answering it goes straight through", () => {
    expect(DOCK).toContain("async function sendTyped()");
    expect(DOCK).toContain("setContactWarned(true); setContactAsk(false); void send();");
    // The composer presses the wrapper; the seam's own senders are untouched.
    expect(DOCK).toContain("void sendTyped()");
  });

  /* 🔴 RED on the warning and the SAFE action as the primary (owner, on the app, 2026-09-20). The
     app's first cut painted it amber and made the escape hatch the filled navy button, so the
     loudest control on a privacy warning was the one that ignores it. */
  it("paints the warning red with the quiet way out", () => {
    const modal = DOCK.slice(DOCK.indexOf("{contactAsk && ("));
    expect(modal).toContain('className="text-danger"'); // the mark beside the title
    expect(modal).toContain("text-body font-semibold text-danger"); // and the sentence itself
    // The way OUT sits first, the dismissal last and filled.
    expect(modal.indexOf("Share anyway")).toBeLessThan(modal.indexOf('L("Got it"'));
  });

  /**
   * 🔴 **The escape hatch is the QUIET red, never `tone="danger"`.** That tone is a solid red fill,
   * which would once again make the loudest control on a privacy warning the one that ignores it —
   * the fault the app corrected on 2026-09-20. It is a ghost button wearing the soft red, and the
   * dismissal is the one that reads as primary.
   */
  it("uses the design system's dialog, and keeps the safe action primary", () => {
    /* ⚠️ COMMENTS STRIPPED. The component's own note names `tone="danger"` while saying it must not
       be used, so a bare `not.toContain` fails on its own explanation — the eighth time this repo
       has met that. */
    const modal = DOCK.slice(DOCK.indexOf("{contactAsk && (")).replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "");
    expect(modal).toContain("<Dialog");
    expect(modal).not.toContain('tone="danger"');
    expect(modal).toContain('tone="ghost"');
    expect(modal).toContain('tone="primary"');
  });
});
