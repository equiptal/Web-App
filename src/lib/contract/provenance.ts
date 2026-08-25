/**
 * Where a field's value came from (MREQ-AC-57/58/59/61).
 *
 * The canvas marks every value the renter did not personally choose. That is the point of the
 * design: a request form that silently pre-answers nine questions and shows the renter a finished
 * page is indistinguishable, from their side, from one they filled in themselves — and they own the
 * result either way.
 *
 * Three sources collapse to the same stored value, so none of them can be told apart by reading the
 * draft alone:
 *
 *  - **agent** — the parser extracted it from the renter's own words. `agentMatches` finds these by
 *    diffing against the `agentOrigin` snapshot the store keeps.
 *  - **default** — we seeded it (`defaultProjectDetails`, `newManualItem`, `defaultOperatorDetails`).
 *    Delivery and return live here: both seed to "me", which assigns the renter both transport legs.
 *  - **renter** — they set it themselves, which `touchedFields` records at the moment it happens.
 *
 * `renter` wins over everything: once someone has answered a question, it stops being ours. A field
 * that is genuinely empty has no provenance at all and gets the required dot instead, if it is
 * required — the amber highlight never blocks (MREQ-AC-61).
 */

import type { RfqDraft } from "./draft";

export type FieldSource = "agent" | "default" | "renter" | "empty";

/**
 * True when a field's current value still equals what the agent originally filled in (and the agent
 * actually supplied one). Re-exported from the store's long-standing helper semantics so provenance
 * has one definition rather than two.
 */
export function agentFilled(current: unknown, original: unknown): boolean {
  if (original == null || original === "" || (Array.isArray(original) && original.length === 0)) return false;
  return JSON.stringify(current) === JSON.stringify(original);
}

/** True when the value is present in any meaningful sense — `[]` and `""` count as empty. */
export function hasValue(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

export interface SourceInput {
  /** The value as it stands now. */
  current: unknown;
  /** The same field in the agent's untouched snapshot, or undefined when there is no snapshot. */
  agentOriginal?: unknown;
  /** The field's dotted path, as recorded in `touchedFields`. */
  key: string;
  /** The draft, read only for `touchedFields`. */
  draft: Pick<RfqDraft, "touchedFields">;
  /**
   * True when this field carries a seeded default even though it looks empty — the case for the
   * handful of fields whose default IS a value (delivery/return "me", quantity 1, fuel diesel).
   * Defaults to false, so an untouched empty field reads as `empty`, not `default`.
   */
  seeded?: boolean;
}

/** Which of the four states a field is in. */
export function fieldSource({ current, agentOriginal, key, draft, seeded = false }: SourceInput): FieldSource {
  if ((draft.touchedFields ?? []).includes(key)) return "renter";
  if (agentFilled(current, agentOriginal)) return "agent";
  if (hasValue(current) || seeded) return "default";
  return "empty";
}

/** Whether the amber highlight + badge should render (MREQ-AC-57/58). */
export function isSystemChosen(source: FieldSource): boolean {
  return source === "agent" || source === "default";
}
