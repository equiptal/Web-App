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
 * The one place a project does decide something: **Tier 1 needs one.** It returns line items with no
 * header, and without a project there is nothing to fill the header from — so a projectless renter
 * takes the full path even for one line, and gets exactly today's behaviour.
 *
 *   one equipment line                    → Tier 0   the matcher, in the browser, no network
 *   a sentence with extras + a project    → Tier 1   POST /api/agent/quick, synchronous
 *   a paragraph, or no project            → Tier 2   today's path, byte-identical
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

  // No site means no header to inherit, so an equipment-only answer would be incomplete.
  if (!input.hasProject) return { tier: 2, reason: "no_project" };

  if (text.length >= PARAGRAPH_CHARS) return { tier: 2, reason: "paragraph" };

  const match = matchInBrowser(text, input.taxonomy);
  if (match.matched) return { tier: 0, match, reason: "matched" };

  return { tier: 1, reason: match.reason };
}
