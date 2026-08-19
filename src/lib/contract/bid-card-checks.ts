/**
 * **BC-2 — the bid card's checks row, as a value.**
 *
 * A port of the app's `bid_card_checks.dart`. Two halves, one grammar: **ring · label · counts**. The
 * ring shows the proportion at a glance; the counts name the parts. Terms keeps its own matched /
 * conflict / pending; equipment counts what THIS REQUEST asked for — met and missing — and never the
 * supplier's own total.
 *
 * **NO React, NO DOM, NO i18n imports.** The row replaces several sections of the card, and what has
 * to survive that collapse is which numbers a renter reads. So the numbers are derived here, where a
 * dozen card states can be asserted without rendering a dozen cards, and the component paints exactly
 * what it is handed.
 *
 * ── The three collapses, each a rule rather than a style ────────────────────────────────────────
 *
 * 1. **All-clear prints no zeros.** A half with nothing outstanding collapses to one solid ring and
 *    "✓ all on file" / "✓ all matched". Printing `0 missing` beside `3 met` is the crowding this row
 *    exists to remove.
 * 2. **A dead offer greys and says "not checked".** It does not disappear: an expired or withdrawn
 *    offer already goes quiet elsewhere on the card, and this row follows that rule rather than
 *    inventing a louder or an emptier one.
 * 3. **Nothing to report is not the same as all-clear.** A request that asked for no certificates has
 *    no requirements to meet, so its equipment half has no proportion to draw — and says so, rather
 *    than claiming a green all-clear the data does not support.
 */

import type { UnitReadiness } from "@/lib/contract/bid-readiness";

/** What a half's ring is made of. Every arc is a count, so a ring cannot show a proportion the counts
 *  do not also state. */
export type CheckTone = "good" | "bad" | "warn" | "dead" | "none";

/** One arc of the ring, and one printed count. */
export interface CheckPart {
  tone: CheckTone;
  count: number;
}

/** One half of the row. */
export interface BidCardCheck {
  /**
   * In ring order. Every part is PRINTED; a part with a count of zero draws no arc, so the ring never
   * carries a slice the counts do not state, while "●0" still says the thing a missing bead cannot.
   */
  parts: CheckPart[];
  /** Everything settled. One solid good ring and the "✓" line; `parts` is empty, so there is nothing
   *  to print as a zero. */
  allClear: boolean;
  /** The offer is over. Grey ring, "not checked", no counts. */
  dead: boolean;
  /** The supplier has answered something since the renter last looked — drawn as a small dot ON the
   *  ring, so it is news without a strip of its own. */
  hasNews: boolean;
  /** Nothing was asked for, so there is no proportion to draw. */
  empty: boolean;
  /** The whole of the ring, for the arc maths. Zero when there is nothing to draw. */
  total: number;
}

function build(parts: CheckPart[], allClear: boolean, dead: boolean, hasNews: boolean): BidCardCheck {
  const total = parts.reduce((n, p) => n + p.count, 0);
  return { parts, allClear, dead, hasNews, empty: !dead && !allClear && parts.length === 0, total };
}

/**
 * **The terms half.** `matched` / `conflict` / `pending` are the three the terms row already counts —
 * `pending` folds in every not-yet-resolved row, so the three always sum to the total.
 *
 * `dead` short-circuits everything: an expired offer's terms were never resolved and never will be,
 * so counting them would invite a renter to act on an offer that cannot be acted on.
 */
export function termsCheck(input: {
  matched: number;
  conflict: number;
  pending: number;
  dead?: boolean;
  hasNews?: boolean;
}): BidCardCheck {
  const hasNews = input.hasNews === true;
  if (input.dead) return build([], false, true, false);
  const matched = Math.max(0, input.matched);
  const conflict = Math.max(0, input.conflict);
  const pending = Math.max(0, input.pending);
  const outstanding = conflict + pending;
  if (matched > 0 && outstanding === 0) return build([], true, false, hasNews);
  if (matched === 0 && outstanding === 0) return build([], false, false, hasNews);
  return build(
    [
      /*
       * **Matched leads, and it prints even at zero.**
       *
       * ~~Matched is in neither the ring nor the counts.~~ Withdrawn 2026-08-15: the prototype draws
       * the terms row as «●0 ●2 ●3», green first — the same grammar as the equipment row, which has
       * always printed its good count. The old rule was the narrow half's, and it was paid for in
       * meaning: a renter reading «2 · 3» could not tell an offer with nothing agreed from one with
       * nine terms settled.
       *
       * The zero is the point of printing it. «●0» says the supplier has agreed to nothing yet, which
       * is a different fact from a row that simply does not mention agreement — and this branch is
       * only reached when something IS outstanding, since an offer with nothing on either side
       * collapsed to `empty` above.
       */
      { tone: "good", count: matched },
      // Then the one a renter has to do something about.
      ...(conflict > 0 ? [{ tone: "bad" as const, count: conflict }] : []),
      ...(pending > 0 ? [{ tone: "warn" as const, count: pending }] : []),
    ],
    false, false, hasNews,
  );
}

/**
 * **The equipment half.** `met` and `missing` count the REQUEST's own requirements — the certificates
 * and papers it asked for — never the supplier's total.
 *
 * The distinction matters because ownership papers are stripped from every renter-facing response:
 * scoring the supplier's own total would paint a fully compliant supplier permanently short.
 */
export function equipmentCheck(input: {
  met: number;
  missing: number;
  dead?: boolean;
  hasNews?: boolean;
}): BidCardCheck {
  const hasNews = input.hasNews === true;
  if (input.dead) return build([], false, true, false);
  const met = Math.max(0, input.met);
  const missing = Math.max(0, input.missing);
  if (met > 0 && missing === 0) return build([], true, false, hasNews);
  if (met === 0 && missing === 0) return build([], false, false, hasNews);
  return build(
    [
      // Good leads and prints at zero, the same grammar the terms row uses: «●0 ●3» says nothing is
      // on file yet, which «●3» alone does not.
      { tone: "good", count: met },
      ...(missing > 0 ? [{ tone: "bad" as const, count: missing }] : []),
    ],
    false, false, hasNews,
  );
}

/**
 * The equipment half, from the offered units' readiness.
 *
 * **Requirement-level, not unit-level.** A bid offering three units that each lack one certificate is
 * "6 met · 3 missing", not "0 of 3 ready" — the second reads as total failure for a supplier who is
 * one paper short per machine.
 *
 * **Always the RENTEE reading of the fraction**, whatever the caller scored. The app has two named
 * fields for this (`renteeDone` / `renteeTotal` beside `done` / `total`); the web has one pair whose
 * meaning depends on `scoreOwnership`, so the ownership key is subtracted back out here when it was
 * counted. Left to a comment, a caller that reasonably passed `scoreOwnership: true` for some other
 * surface would silently paint every supplier one paper short — the exact failure the app's separate
 * fields exist to prevent.
 */
export function equipmentCheckOf(
  readiness: readonly UnitReadiness[],
  opts?: { dead?: boolean; hasNews?: boolean },
): BidCardCheck {
  let met = 0;
  let missing = 0;
  for (const r of readiness) {
    const total = r.ownershipScored ? r.total - 1 : r.total;
    const done = r.ownershipScored && r.ownershipPresent ? r.done - 1 : r.done;
    met += Math.max(0, done);
    missing += Math.max(0, total - done);
  }
  return equipmentCheck({ met, missing, dead: opts?.dead, hasNews: opts?.hasNews });
}

/**
 * Each arc's share of the ring, in the same order as `parts`.
 *
 * Empty when there is nothing to draw — an all-clear half, a dead one, or a request that asked for
 * nothing — so a caller cannot render a ring out of no data.
 */
export function checkArcs(check: Pick<BidCardCheck, "parts" | "total">): number[] {
  if (check.total <= 0) return [];
  return check.parts.map((p) => p.count / check.total);
}
