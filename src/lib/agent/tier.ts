/**
 * Which path a piece of text takes (web-app/007, W-T21).
 *
 * ── The tier follows the SHAPE of the text, not whether a project exists ─────────────────────────
 *
 * That distinction is the whole rule and it is easy to get backwards. A project does not make a
 * parse cheaper — a paragraph is a paragraph whether or not the renter has a site. What a project
 * changes is that the renter no longer has to *write* the paragraph, so short text becomes the
 * common case. The tier reads the text it was given.
 *
 * The one place a project decides something: **Tier 1 needs one, Tier 0 does not.** Tier 0 answers
 * only when it has consumed the whole line, so there is nothing left for a header to be built from
 * and the full path would return the same empty one. Tier 1 fires because words were LEFT OVER, and
 * those words might be the header — so without a project it falls through rather than dropping them.
 *
 *   one equipment line                    → Tier 0   the matcher, in the browser, no network
 *   a sentence with extras + a project    → Tier 1   POST /api/agent/quick, synchronous
 *   a paragraph, or extras with no project → Tier 2  today's path, byte-identical
 */

import type { Taxonomy } from "@/lib/contract/taxonomy";
import { matchInBrowser, type QuickResult } from "./quick-match";

export type Tier = 0 | 1 | 2;

/**
 * Long enough that it is prose rather than a line, and the header is likely to be in it.
 *
 * Deliberately generous. Sending a paragraph to the equipment-only path loses whatever the renter
 * wrote about dates or terms, which is worse than the second it saves; sending a short line to the
 * full path just costs that second.
 */
const PARAGRAPH_CHARS = 180;

export interface TierDecision {
  tier: Tier;
  /** Present on Tier 0 — the match itself, already resolved. */
  match?: QuickResult;
  /** Why, for the dev overlay and for the telemetry that shows whether the split is working. */
  reason: string;
}

export function decideTier(input: {
  text: string;
  hasProject: boolean;
  hasFiles: boolean;
  taxonomy: Taxonomy | null | undefined;
}): TierDecision {
  const text = (input.text ?? "").trim();

  // A file is a document to read, which is a comprehension job by definition.
  if (input.hasFiles) return { tier: 2, reason: "attachments" };

  if (text.length >= PARAGRAPH_CHARS) return { tier: 2, reason: "paragraph" };

  /* ── Tier 0 needs NO project ──
     It answers only when it has consumed the ENTIRE text, so by definition there is nothing else in
     there: no dates, no place, no terms. The full path would return the same empty header four
     seconds later, because the model has nothing to read either. Requiring a project here made
     `2 forklifts` slow for exactly the renters who have not set one up yet — which, at launch, is
     everyone. */
  const match = matchInBrowser(text, input.taxonomy);
  if (match.matched) return { tier: 0, match, reason: "matched" };

  /* ── Tier 1 DOES need one ──
     It fires because words were left over, and those words might be "for 3 weeks" or "in Dammam".
     The equipment-only prompt drops header extraction, so without a project nothing else supplies
     them and the renter silently loses something they typed. That is not a trade worth a second. */
  if (!input.hasProject) return { tier: 2, reason: "no_project" };

  return { tier: 1, reason: match.reason };
}
