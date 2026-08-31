/**
 * A fast-path result → the draft the canvas renders (web-app/007, W-T21/T22).
 *
 * Both fast tiers answer with equipment and nothing else. Everything a full parse would have put in
 * the header — dates, hours, payment terms, the site — is filled afterwards from the project, by the
 * same `applyProjectDefaults` the model path uses. This file only turns line items into draft items.
 *
 * ── Nothing here is invented ─────────────────────────────────────────────────────────────────────
 *
 * A field the renter did not state stays at its seeded default, and the canvas marks it as ours.
 * The temptation on a fast path is to fill more so the screen looks finished; a screen that looks
 * finished is exactly what stops a renter reading it, and this is the path where they read least.
 */

import type { AgentDraft, EquipmentItem } from "@/lib/contract/draft";
import { defaultProjectDetails, defaultPreferences, newManualItem } from "@/lib/contract/draft";
import type { Taxonomy } from "@/lib/contract/taxonomy";
import type { QuickMatch } from "./quick-match.generated";
import type { QuickRfqResult } from "@/lib/api/client";
import { certsInText } from "./quick-certs";

/** Find the ids for a name the agent returned, so a Tier-1 answer lands on real taxonomy rows. */
function resolve(tree: Taxonomy | null | undefined, subtype: string | null, capacity: string | null) {
  for (const c of tree ?? []) {
    for (const s of c.subcategories) {
      if (s.name.toLowerCase() !== (subtype ?? "").toLowerCase()) continue;
      const m = s.measurements.find((x) => x.name.toLowerCase() === (capacity ?? "").toLowerCase());
      return { categoryId: c.id, subcategoryId: s.id, measurementId: m?.id ?? null };
    }
  }
  return { categoryId: null, subcategoryId: null, measurementId: null };
}

function shell(items: EquipmentItem[]): AgentDraft {
  return {
    rfqId: null,
    project: defaultProjectDetails(),
    items,
    preferences: defaultPreferences(),
    detectedLocations: [],
    summary: "",
    justifications: [],
    fieldNotes: {},
  } as unknown as AgentDraft;
}

/**
 * Tier 0 — the browser's own match. Ids are already resolved; nothing needs looking up.
 *
 * `text` is the renter's original line, read for CERTIFICATES — see `withCerts`. Tier 0 fires only
 * when the matcher consumed the whole line, so in practice there is no cert left in it; the argument
 * is here so the two fast paths cannot answer this question differently.
 */
export function quickResultToDraft(
  match: QuickMatch,
  tree: Taxonomy | null | undefined,
  text = "",
): AgentDraft {
  void tree;
  const base = newManualItem("i1");
  return withCerts(text, shell([
    {
      ...base,
      ref: {
        categoryId: match.categoryId,
        subcategoryId: match.subcategoryId,
        measurementId: match.measurementId,
      },
      rawLabel: match.subcategoryName,
      rawSize: match.measurementName,
      quantity: match.quantity,
    } as EquipmentItem,
  ]));
}

/**
 * Tier 1 — the model's line items, resolved against the catalogue the browser already holds.
 *
 * `text` is the renter's original line, read for CERTIFICATES the equipment-only prompt is forbidden
 * from emitting — see `withCerts`.
 */
export function quickItemsToDraft(
  quick: QuickRfqResult,
  tree: Taxonomy | null | undefined,
  text = "",
): AgentDraft {
  const items = (quick.line_items ?? []).map((raw, i) => {
    const r = raw as Record<string, unknown>;
    const subtype = (r.subtype as string) ?? null;
    const capacity = (r.capacity as string) ?? null;

    // Prefer ids the agent resolved; fall back to a name lookup. The agent answers with canonical
    // names, so a miss here means the catalogue moved under it — better an unmatched line the
    // renter can fix than a silently wrong id.
    const byName = resolve(tree, subtype, capacity);
    const base = newManualItem(`i${i + 1}`);

    return {
      ...base,
      ref: {
        categoryId: (r.category_id as string) ?? byName.categoryId,
        subcategoryId: (r.subtype_id as string) ?? byName.subcategoryId,
        measurementId: (r.capacity_id as string) ?? byName.measurementId,
      },
      rawLabel: (r.input_equipment as string) ?? subtype ?? "",
      rawSize: capacity,
      quantity: typeof r.quantity === "number" && r.quantity > 0 ? r.quantity : 1,
    } as EquipmentItem;
  });

  return withCerts(text, shell(items.length ? items : [newManualItem("i1")]), quick);
}

/**
 * Put the certificates the renter NAMED onto a fast-path draft.
 *
 * ⚠️ The equipment-only prompt is forbidden from emitting them — *"no equipment-age or
 * safety-certificate fields"*, appended last on purpose so it wins — so on that path
 * `safety_certifications` comes back as `[]` however plainly the renter wrote «with TÜV». Measured
 * on staging: 2.6 s and `[]` on the fast path, 28.0 s and `["tuv"]` on the full one, for the same
 * five words. This is what makes the fast answer a CORRECT fast answer.
 *
 * ── It only ever fills a gap ────────────────────────────────────────────────────────────────────
 *
 * If the response carries a cert, that wins outright and this does nothing. The agent read the whole
 * sentence; `certsInText` read four words of it, and a narrow reader that overrules a broad one is
 * how a good extraction gets replaced by a keyword.
 *
 * Set on the ITEM, not the request: `agent-adapters` globalises a uniform per-item cert to the
 * request-wide default on the full path, and doing that here as well would put the same fact in two
 * shapes depending on which tier answered.
 */
function withCerts(text: string, draft: AgentDraft, quick?: QuickRfqResult): AgentDraft {
  const returned = (quick?.line_items ?? []).some((li) => {
    const v = (li as Record<string, unknown>).safety_certifications;
    return Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim() !== "";
  });
  if (returned) return draft;

  const certs = certsInText(text);
  if (!certs.length) return draft;

  return {
    ...draft,
    items: draft.items.map((it) => ({ ...it, safetyCertsOverride: certs })),
  };
}
