/**
 * The agent↔web contract vocabulary.
 *
 * This is the load-bearing boundary between the normalization agent ("Mansour", out of scope —
 * implemented elsewhere) and this web UI. The agent produces these verdicts; the web renders
 * against them. Keep this file in sync with the agent side.
 *
 * Spec: core-flows.md (verdict vocabulary), acceptance.md AC-17/18/19/54.
 */

/** Per-item match confidence produced by the agent (acceptance.md AC-17/18/30). */
export type Verdict = "confident" | "needs-validation" | "no-match";

/** Renter-facing per-item status. Maps 1:1 from {@link Verdict} per AC-54. */
export type ItemStatus = "matched" | "needs-ok" | "not-available";

/** Confidence on a single extracted field (project- or item-level). acceptance.md AC-57. */
export type FieldConfidence = "confident" | "needs-validation" | "missing";

/** AC-54: `confident → Matched`, `needs-validation → Needs your OK`, `no-match → Not available`. */
export const VERDICT_TO_STATUS: Record<Verdict, ItemStatus> = {
  confident: "matched",
  "needs-validation": "needs-ok",
  "no-match": "not-available",
};

export function verdictToStatus(v: Verdict): ItemStatus {
  return VERDICT_TO_STATUS[v];
}

/**
 * A value the agent extracted, carrying its confidence and an optional unresolved text↔file
 * conflict (AC-47). `conflict` present ⇒ the renter must pick before the value is accepted.
 */
export interface Extracted<T> {
  value: T | null;
  confidence: FieldConfidence;
  /** Present only when pasted text and an uploaded file disagree (AC-47). */
  conflict?: ValueConflict<T>;
}

/** A text↔file disagreement on one field (AC-47). Resolved by the renter choosing a source. */
export interface ValueConflict<T> {
  fromText: T;
  fromFile: T;
  /** Set once the renter resolves it. */
  resolvedFrom?: "text" | "file";
}

export function extracted<T>(value: T | null, confidence: FieldConfidence = "confident"): Extracted<T> {
  return { value, confidence };
}
