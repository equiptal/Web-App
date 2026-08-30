/**
 * Where a field's value came from (MREQ-AC-57/58/59/61).
 *
 * The canvas marks every value the renter did not personally choose. That is the point of the
 * design: a request form that silently pre-answers nine questions and shows the renter a finished
 * page is indistinguishable, from their side, from one they filled in themselves — and they own the
 * result either way.
 *
 * Four sources collapse to the same stored value, so none of them can be told apart by reading the
 * draft alone:
 *
 *  - **agent** — the parser extracted it from the renter's own words. `agentMatches` finds these by
 *    diffing against the `agentOrigin` snapshot the store keeps.
 *  - **project** — the renter's SITE supplied it: they stated it once, months ago, for every request
 *    on that job. Marked apart from `default` because the two are opposite in trust — *"Qiddiya runs
 *    10-hour days"* is something the renter told us, and *"we guessed 10"* is not. Collapsing them
 *    would hide which values are worth a second look.
 *  - **default** — we seeded it (`defaultProjectDetails`, `newManualItem`, `defaultOperatorDetails`).
 *    Delivery and return live here: both seed to "me", which assigns the renter both transport legs.
 *  - **renter** — they set it themselves, which `touchedFields` records at the moment it happens.
 *
 * **Precedence: `renter > agent > project > default > empty`** (PROJ, spec §11.1).
 *
 * `renter` wins over everything: once someone has answered a question, it stops being ours. `agent`
 * comes next because the renter's own words in THIS request beat a standing site value - if they
 * wrote *"from Oct 1"* and the site says 1 September, the request keeps October. `project` beats
 * `default` for the same reason a stated fact beats a guess.
 *
 * A field that is genuinely empty has no provenance at all and gets the required dot instead, if it
 * is required - the amber highlight never blocks (MREQ-AC-61).
 */

import type { RfqDraft } from "./draft";

export type FieldSource = "agent" | "project" | "default" | "renter" | "empty";

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
  /** The draft, read only for `touchedFields` and `projectFields`. */
  draft: Pick<RfqDraft, "touchedFields" | "projectFields">;
  /**
   * True when this field carries a seeded default even though it looks empty — the case for the
   * handful of fields whose default IS a value (delivery/return "me", quantity 1, fuel diesel).
   * Defaults to false, so an untouched empty field reads as `empty`, not `default`.
   */
  seeded?: boolean;
  /**
   * The paths a project filled, from `applyProjectDefaults`. Falls back to the draft's own
   * `projectFields`, so a caller that already passes the draft does not have to thread it twice.
   */
  projectFields?: string[];
}

/** Which of the five states a field is in. */
export function fieldSource({ current, agentOriginal, key, draft, seeded = false, projectFields }: SourceInput): FieldSource {
  if ((draft.touchedFields ?? []).includes(key)) return "renter";
  if (agentFilled(current, agentOriginal)) return "agent";
  // A project value only counts while the field still HOLDS one. An emptied field is empty, not
  // "from the project" - otherwise clearing a date would leave the note pointing at nothing.
  if ((projectFields ?? draft.projectFields ?? []).includes(key) && hasValue(current)) return "project";
  if (hasValue(current) || seeded) return "default";
  return "empty";
}

/**
 * Whether the amber highlight + badge should render (MREQ-AC-57/58).
 *
 * `project` is included: the renter did state it, but not here and not now, so a request that
 * silently carries nine values from a site they set up in March is exactly the situation this mark
 * exists for. What differs is the WORDING, not whether it shows - see `ProvenanceNote`.
 */
export function isSystemChosen(source: FieldSource): boolean {
  return source === "agent" || source === "default" || source === "project";
}
