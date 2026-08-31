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
import { SAFETY_CERTIFICATES } from "@/lib/contract/options";
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

/**
 * The agent's `safety_certifications` → this app's chip codes, or `null` for "not stated".
 *
 * Upper-case on the wire (`"TUV"`), lower-case here (`"tuv"`) — the same fold `agent-adapters` does
 * on the full path. `[]` becomes `null` rather than an empty array, because the two mean different
 * things downstream: `null` lets a project or a template fill the field, and `[]` is the renter
 * saying *no certificate*.
 */
/**
 * Does this machine need an operator? Accepts BOTH shapes the wire uses.
 *
 * ⚠️ `agent.ts` types it `boolean | null`, and staging has returned both `true` and the string
 * `"YES"` for the same question on the same endpoint. A reader that checked only `=== "YES"` — which
 * is what this was — silently answered *not stated* for the boolean, so «with operator» was read
 * correctly by the agent and dropped here on the runs that used a boolean. Caught by reading the
 * live payload rather than the type.
 */
function operatorOf(raw: unknown): "yes" | "no" | null {
  if (raw === true) return "yes";
  if (raw === false) return "no";
  if (typeof raw === "string") {
    const v = raw.trim().toUpperCase();
    if (v === "YES" || v === "TRUE") return "yes";
    if (v === "NO" || v === "FALSE") return "no";
  }
  return null;
}

/** `true` = the renter, `false` = the supplier, absent = not stated. The full path's own fold. */
function party(byRentee: unknown): "me" | "supplier" | null {
  return byRentee == null ? null : byRentee === true ? "me" : "supplier";
}

/** A year as this app stores it: a string, or null. Rejects anything that is not a plausible year. */
function yearOf(raw: unknown): string | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 1950 || n > new Date().getFullYear() + 1) return null;
  return String(Math.trunc(n));
}

function certsOf(raw: unknown): EquipmentItem["safetyCertsOverride"] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" && raw.trim() ? [raw] : [];
  const codes = list
    .map((c) => String(c).trim().toLowerCase())
    .filter((c) => (SAFETY_CERTIFICATES as readonly string[]).includes(c));
  return codes.length ? (codes as EquipmentItem["safetyCertsOverride"]) : null;
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
      /* ── EVERY answer the fast lane gives, not just the taxonomy ─────────────────────────────

         This reader consumed seven fields for as long as the fast lane emitted seven. It emits more
         now, and the gap between the two is silent loss — the certificate was only the one that got
         noticed. Asked directly, *"are you sure no field is lost?"*: no, six were.

         Measured on staging with «excavator 30 ton with tuv, with operator, delivery on the
         supplier, they return it, supplier pays the fuel, 2019 or newer» — the agent answered
         operator_included, mobilization_by_rentee, demobilization_by_rentee, diesel_included,
         fuel_type_preference and minimum_equipment_year, and every one of them was dropped here.

         Safe to trust, because this lane is evidence-only in BOTH halves now: verified on staging
         that a line stating none of these omits all of them, so a value present means the renter
         said it. That is what makes these `agent` values rather than guesses — they outrank the
         project, which is the correct order for something the renter typed about THIS request.

         The rest of the payload stays dropped on purpose: the five `*_match` verdicts, `verdict`,
         the three Arabic names and the duplicate `category`. The app reads none of them. */
      operatorNeeded: operatorOf(r.operator_included),
      /* `by_rentee` is a boolean about WHO, and this app stores the party. `true` is the renter, so
         "delivery on the supplier" arrives as false and becomes "supplier" — the same fold
         `machineTermsOfRequestItem` does on the full path, not a second opinion about it. */
      deliveryOverride: party(r.mobilization_by_rentee),
      returnOverride: party(r.demobilization_by_rentee),
      /* Reversed, and deliberately: `diesel_included` asks whether the SUPPLIER includes the fuel,
         so true means the supplier pays. Staging confirms the polarity — "the supplier pays for
         fuel" returns true. */
      fuelResponsibilityOverride:
        r.diesel_included == null ? null : r.diesel_included ? "supplier" : "me",
      /* ~~`fuelType` from the agent, falling back to the app's default.~~ The agent is no longer
         ASKED for it (owner, 2026-08-31: *"fuel type will be filled automatically by the system, no
         need to spend time on it by the agent"*), so there is nothing to read: the field keeps the
         app's own default, which is what `newManualItem` already put there.

         Right call, and it is free speed. The fuel is a property of the MACHINE, not a term the
         renter negotiates — a 30-ton crawler excavator runs on diesel whoever hires it — so deciding
         it per request spent output tokens, the one thing this path is charged for, to restate a fact
         about the catalogue. Who PAYS for the fuel is a different question and still read, below:
         that one is money, and money is stated or it is not. */
      /* The oldest model year they will accept. `minimum_equipment_year` is the field the fast lane
         names; `max_equipment_age` carries the same number on the full path, so it is the fallback
         rather than a competing answer. */
      equipmentYear: yearOf(r.minimum_equipment_year ?? r.max_equipment_age),
      /* ⚠️ The certificate the agent read, PER ITEM — and this reader was ignoring it.
         The fast lane can answer certs now, and does: *"10 × Crawler Excavator 20 ton with 2 ×
         Crawler Excavator 30 ton with tuv"* comes back with `["TUV"]` on BOTH items, verified on
         staging. Nothing here mapped it onto the draft, and `withCerts` below stood down precisely
         because the agent HAD answered — so between the two of them the answer was dropped.
         The renter's report was exact: detected without a project, lost with one, because a project
         is what routes the line to this lane. */
      safetyCertsOverride: certsOf(r.safety_certifications),
    } as EquipmentItem;
  });

  return withCerts(text, shell(items.length ? items : [newManualItem("i1")]), quick);
}

/**
 * The BACKSTOP: certificates read off the renter's own text, when the response carries none.
 *
 * The equipment-only prompt used to be forbidden from emitting them, which is why this exists —
 * measured then at 2.6 s with `[]` on the fast path against 28.0 s with `["tuv"]` on the full one.
 * The agent answers them itself now, and `certsOf` above reads that answer, so on a good day this
 * does nothing at all.
 *
 * It stays because it costs nothing and covers the case that actually bit: a lane that cannot answer the
 * question, with no sign from the outside that it could not.
 *
 * ── It only ever fills a gap ────────────────────────────────────────────────────────────────────
 *
 * If the response carries a cert on ANY item, this stands down entirely. The agent read the whole
 * sentence and attributed the cert per machine; `certsInText` read four words and would put it on
 * every one. A narrow reader that overrules a broad one is how a good extraction gets replaced by a
 * keyword — and per-machine attribution is exactly what would be lost.
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
